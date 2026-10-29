"""Urban river and lake condition from Sentinel-2, per ~1 km stretch, month by month.

Channel: pixels that were open water (MNDWI > 0) in at least one post-monsoon (Sep-Nov) composite since 2019.
The monsoon flushes floating weed out, so reaches that are covered by hyacinth in summer are still found.
Small specks (roofs, tanks) are removed by a minimum connected size.

Per stretch and month (cloud-masked Sentinel-2 median):
  hyacinth cover   share of the visible channel with NDVI > 0.3 (floating vegetation; trees/mangroves excluded)
  turbidity        NDTI = (red - green) / (red + green) over open water (Lacaux et al. 2007)
  chlorophyll      NDCI = (red-edge 705 - red) / (red-edge + red) over open water (Mishra & Mishra 2012)
Turbidity and chlorophyll are compared with the same calendar month in 2019-2023 at the same pixels (z-score).

Satellites see optical proxies only. BOD, dissolved oxygen and coliforms need water samples; this tells
officials where and when to take them, and whether a cleanup changed what can be seen.
"""

from __future__ import annotations

import math
from datetime import date

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from .earthengine import init_ee

S2 = "COPERNICUS/S2_SR_HARMONIZED"
CLOUD_SCORE = "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED"
WORLDCOVER = "ESA/WorldCover/v200"

AREAS = {
    "pune": {"name": "Pune and Pimpri-Chinchwad", "bbox": [73.70, 18.45, 74.02, 18.68],
             "waters": "Mula, Mutha, Mula-Mutha and Pavana rivers; Pashan and Katraj lakes", "district": "Pune"},
    "mumbai": {"name": "Mumbai (Mithi, Powai, Vihar)", "bbox": [72.80, 19.00, 72.95, 19.18],
               "waters": "Mithi river, Mahim creek, Powai and Vihar lakes", "district": "Mumbai"},
    "thane": {"name": "Thane, Kalyan and Ulhasnagar", "bbox": [72.95, 19.15, 73.22, 19.30],
              "waters": "Ulhas river, Thane creek, Waldhuni river, Thane lakes", "district": "Thane"},
    "nashik": {"name": "Nashik", "bbox": [73.70, 19.95, 73.90, 20.06], "waters": "Godavari river",
               "district": "Nashik"},
    "nagpur": {"name": "Nagpur", "bbox": [79.00, 21.08, 79.18, 21.21],
               "waters": "Ambazari, Futala and Gorewada lakes; Nag river", "district": "Nagpur"},
    "kolhapur": {"name": "Kolhapur", "bbox": [74.17, 16.66, 74.32, 16.76], "waters": "Panchganga river, Rankala lake",
                 "district": "Kolhapur"},
}

CHANNEL_YEARS = range(2019, 2026)
BASELINE_YEARS = range(2019, 2024)
CELL_DEG = 0.01           # stretch grid, ~1.1 km
SCALE = 20                # metres
MIN_BODY_PX = 50          # connected water body of at least 2 ha
MIN_UNIT_HA = 1.0
HYACINTH_NDVI, OPEN_NDVI = 0.3, 0.05
HEAVY_HYACINTH, WATCH_HYACINTH = 50.0, 30.0
Z_FLAG, Z_WATCH = 2.5, 1.5
MIN_SEEN_SHARE = 0.5      # a month counts when at least half the channel was seen cloud-free

SOURCES = [
    {"key": "s2", "dataset": "Sentinel-2 L2A surface reflectance (harmonized), 10-20 m",
     "provider": "European Space Agency / Copernicus", "source": S2, "resolution_m": 10,
     "license": "Copernicus open licence", "used_for": "River channel, hyacinth cover, turbidity and chlorophyll indices"},
    {"key": "cloud", "dataset": "Cloud Score+ for Sentinel-2", "provider": "Google", "source": CLOUD_SCORE,
     "resolution_m": 10, "license": "CC BY 4.0", "used_for": "Cloud and shadow masking",
     "citation": "Pasquarella et al. (2023), CVPR Workshops"},
    {"key": "wc", "dataset": "ESA WorldCover 2021 v200", "provider": "European Space Agency", "source": WORLDCOVER,
     "resolution_m": 10, "license": "CC BY 4.0", "used_for": "Excludes trees and mangroves from floating-weed cover"},
    {"key": "ndti", "dataset": "Normalized Difference Turbidity Index (NDTI)", "provider": "Lacaux et al. (2007)",
     "source": "Remote Sensing of Environment 106:66-74", "license": "Method",
     "used_for": "Turbidity / suspended matter proxy"},
    {"key": "ndci", "dataset": "Normalized Difference Chlorophyll Index (NDCI)", "provider": "Mishra & Mishra (2012)",
     "source": "Remote Sensing of Environment 117:394-406", "license": "Method",
     "used_for": "Chlorophyll / algal growth proxy"},
    {"key": "arset", "dataset": "NASA ARSET: Monitoring Water Quality of Inland Lakes using Remote Sensing (2023)",
     "provider": "NASA Applied Remote Sensing Training", "source":
     "earthdata.nasa.gov/learn/trainings/monitoring-water-quality-inland-lakes-using-remote-sensing",
     "license": "Training material", "used_for": "Method basis: Sentinel-2 spectral indices in Earth Engine for "
                                                 "turbidity and chlorophyll, and calibration against field samples"},
    {"key": "arset2", "dataset": "NASA ARSET: Hyperspectral Data for Land and Coastal Systems, Q&A part 3 (2021)",
     "provider": "NASA Applied Remote Sensing Training", "source": "appliedsciences.nasa.gov/arset",
     "license": "Training material", "used_for": "Bank pixels excluded (mixed land-water); local calibration of "
                                                 "indices; limits of land-oriented atmospheric correction over water"},
    {"key": "arset3", "dataset": "NASA ARSET: Mapping and Monitoring Lakes and Reservoirs (2021); Remote Sensing of "
     "Freshwater Habitats (2019)", "provider": "NASA Applied Remote Sensing Training",
     "source": "appliedsciences.nasa.gov/join-mission/training", "license": "Training material",
     "used_for": "Background on lake and river monitoring with satellite data"},
    {"key": "ac", "dataset": "Palacios et al. (2015), atmospheric correction over coastal and inland waters",
     "provider": "Remote Sensing of Environment", "source": "sciencedirect.com/science/article/pii/S0034425715300146",
     "license": "Paper", "used_for": "Known limitation of land-oriented atmospheric correction over water"},
]

METHOD = {
    "channel": "Open water (MNDWI > 0) in any Sep-Nov Sentinel-2 composite 2019-2025; water bodies under 2 ha dropped.",
    "stretches": "Channel split on a 0.01° (~1.1 km) grid; stretches under 1 ha dropped; named after the nearest "
                 "Census village.",
    "hyacinth": f"Share of the cloud-free channel with NDVI above {HYACINTH_NDVI} (floating vegetation), "
                "excluding ESA WorldCover trees and mangroves.",
    "turbidity_chlorophyll": "NDTI and NDCI over open water away from the banks (one 20 m pixel in from the "
                             "edge, to avoid mixed land-water pixels), compared with the same month in 2019-2023 at "
                             "the same pixels (z-score).",
    "sample_first": f"Hyacinth over {HEAVY_HYACINTH:.0f}% of the channel, or turbidity or chlorophyll "
                    f"{Z_FLAG:.0f}+ standard deviations above normal in the latest clear month.",
    "limits": "Optical proxies only: BOD, dissolved oxygen and coliforms need samples, and index values need local "
              "calibration with them (algae types differ by water body). Sentinel-2 L2A uses a land-oriented "
              "atmospheric correction, which is less accurate over dark water (Palacios et al. 2015); a water-specific "
              "correction such as ACOLITE is a planned upgrade. Channels narrower than ~40 m have no interior pixels "
              "for water colour. Tides affect creeks.",
}


def _s2(ee, region, start, end):
    col = ee.ImageCollection(S2).filterBounds(region).filterDate(start, end)
    cs = ee.ImageCollection(CLOUD_SCORE).filterBounds(region).filterDate(start, end)
    return col.linkCollection(cs, ["cs"]).map(
        lambda i: i.select(["B2", "B3", "B4", "B5", "B8", "B11"]).updateMask(i.select("cs").gte(0.65)).divide(10000))


def _proj(ee, bbox):
    lon = (bbox[0] + bbox[2]) / 2
    zone = int((lon + 180) // 6) + 1
    return ee.Projection(f"EPSG:{32600 + zone}").atScale(SCALE)


def channel_image(bbox):
    ee = init_ee()
    region = ee.Geometry.Rectangle(bbox)
    wet = ee.ImageCollection([
        _s2(ee, region, f"{y}-09-01", f"{y}-11-30").median().normalizedDifference(["B3", "B11"]).gt(0)
        for y in CHANNEL_YEARS]).max().unmask(0)
    closed = wet.focalMax(1, "square", "pixels").focalMin(1, "square", "pixels").reproject(_proj(ee, bbox))
    big = closed.selfMask().connectedPixelCount(MIN_BODY_PX + 1, True).gte(MIN_BODY_PX)
    return closed.And(big.unmask(0)).selfMask().rename("channel"), region


def _gid(ee, bbox):
    ll = ee.Image.pixelLonLat()
    cx = ll.select("longitude").subtract(bbox[0]).divide(CELL_DEG).floor()
    cy = ll.select("latitude").subtract(bbox[1]).divide(CELL_DEG).floor()
    return cx.multiply(1000).add(cy).int().rename("gid")


def months_back(n: int, today: date | None = None) -> list[tuple[int, int]]:
    today = today or date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append((y, m))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out[::-1]


def units(bbox) -> dict:
    """Stretch polygons: the channel inside each grid cell -> {gid: {geometry, channel_ha}}."""
    ee = init_ee()
    channel, region = channel_image(bbox)
    gid = _gid(ee, bbox).updateMask(channel)
    vectors = gid.reduceToVectors(geometry=region, scale=SCALE, crs=_proj(ee, bbox).crs(), geometryType="polygon",
                                  eightConnected=True, labelProperty="gid", maxPixels=1e10, tileScale=4)
    feats = vectors.getInfo()["features"]
    parts: dict[int, list] = {}
    for f in feats:
        parts.setdefault(int(f["properties"]["gid"]), []).append(shape(f["geometry"]))
    out = {}
    for g, geoms in parts.items():
        u = unary_union(geoms)
        lat = (u.centroid.y)
        ha = u.area * (111_320 ** 2) * math.cos(math.radians(lat)) / 1e4
        if ha >= MIN_UNIT_HA:
            out[g] = {"geometry": mapping(u.simplify(0.00005)), "channel_ha": round(ha, 2)}
    return out


def indicator_image(bbox, months: list[tuple[int, int]]):
    """Bands per month (areas in ha, index sums over open-water pixels) and per-calendar-month baselines."""
    ee = init_ee()
    channel, region = channel_image(bbox)
    # interior of the channel: drop the bank pixels, which mix land and water (NASA ARSET hyperspectral Q&A, 2021)
    core = channel.unmask(0).focalMin(1, "square", "pixels").reproject(_proj(ee, bbox))
    wc = ee.Image(ee.ImageCollection(WORLDCOVER).first())
    not_woody = wc.neq(10).And(wc.neq(95))
    px = ee.Image.pixelArea().divide(1e4)
    bands = []

    def composite(y, m):
        start = ee.Date.fromYMD(y, m, 1)
        col = _s2(ee, region, start, start.advance(1, "month"))
        return ee.Image(ee.Algorithms.If(col.size().gt(0), col.median(),
                                         ee.Image.constant([0] * 6).rename(["B2", "B3", "B4", "B5", "B8", "B11"])
                                         .updateMask(0)))

    def idx(img):
        ndvi = img.normalizedDifference(["B8", "B4"])
        ndti = img.normalizedDifference(["B4", "B3"])
        ndci = img.normalizedDifference(["B5", "B4"])
        return ndvi, ndti, ndci

    for y, m in months:
        tag = f"{y}{m:02d}"
        ndvi, ndti, ndci = idx(composite(y, m))
        seen = ndvi.mask().And(channel).unmask(0)
        hy = seen.And(ndvi.gt(HYACINTH_NDVI)).And(not_woody).unmask(0)
        ow = seen.And(ndvi.lt(OPEN_NDVI)).And(core).unmask(0)
        bands += [seen.multiply(px).rename(f"seen_{tag}"), hy.multiply(px).rename(f"hy_{tag}"),
                  ow.multiply(px).rename(f"ow_{tag}"), ow.rename(f"owpx_{tag}"),
                  ndti.multiply(ow).unmask(0).rename(f"ndti_{tag}"), ndci.multiply(ow).unmask(0).rename(f"ndci_{tag}")]
    for cm in sorted({m for _, m in months}):
        yearly = []
        for y in BASELINE_YEARS:
            ndvi, ndti, ndci = idx(composite(y, cm))
            ok = ndvi.lt(OPEN_NDVI).And(core)
            yearly.append(ee.Image.cat([ndti.updateMask(ok).rename("ndti"), ndci.updateMask(ok).rename("ndci")]))
        col = ee.ImageCollection(yearly)
        enough = col.select("ndti").count().gte(3)
        mean, std = col.mean(), col.reduce(ee.Reducer.stdDev())
        w = enough.And(core).unmask(0)
        bands += [w.rename(f"bpx_{cm:02d}"),
                  mean.select("ndti").multiply(w).unmask(0).rename(f"bndti_{cm:02d}"),
                  std.select("ndti_stdDev").multiply(w).unmask(0).rename(f"sndti_{cm:02d}"),
                  mean.select("ndci").multiply(w).unmask(0).rename(f"bndci_{cm:02d}"),
                  std.select("ndci_stdDev").multiply(w).unmask(0).rename(f"sndci_{cm:02d}")]
    return ee.Image.cat(bands).updateMask(channel), region


def grouped_sums(bbox, img, region) -> dict[int, dict]:
    ee = init_ee()
    names = img.bandNames()
    n = names.size()
    stacked = img.addBands(_gid(ee, bbox))
    res = stacked.reduceRegion(reducer=ee.Reducer.sum().repeat(n).group(groupField=n, groupName="gid"),
                               geometry=region, scale=SCALE, crs=_proj(ee, bbox).crs(), maxPixels=1e10, tileScale=8)
    out = ee.Dictionary({"names": names, "groups": res.get("groups")}).getInfo()
    keys = out["names"]
    return {int(g["gid"]): dict(zip(keys, g["sum"])) for g in out["groups"]}


def summarise(sums: dict, channel_ha: float, months: list[tuple[int, int]]) -> dict:
    """Per-stretch monthly series, latest clear month, z-scores and flags."""
    series = []
    for y, m in months:
        tag = f"{y}{m:02d}"
        seen = sums.get(f"seen_{tag}", 0) or 0
        owpx = sums.get(f"owpx_{tag}", 0) or 0
        ok = seen >= MIN_SEEN_SHARE * channel_ha
        series.append({
            "month": f"{y}-{m:02d}", "seen_ha": round(seen, 2),
            "hyacinth_pct": round(sums.get(f"hy_{tag}", 0) / seen * 100, 1) if ok and seen else None,
            "open_pct": round(sums.get(f"ow_{tag}", 0) / seen * 100, 1) if ok and seen else None,
            "ndti": round(sums[f"ndti_{tag}"] / owpx, 4) if ok and owpx >= 3 else None,
            "ndci": round(sums[f"ndci_{tag}"] / owpx, 4) if ok and owpx >= 3 else None,
        })
    latest = next((s for s in reversed(series) if s["hyacinth_pct"] is not None), None)
    out = {"channel_ha": channel_ha, "series": series, "latest_month": latest["month"] if latest else None,
           "hyacinth_pct": latest["hyacinth_pct"] if latest else None,
           "ndti": latest["ndti"] if latest else None, "ndci": latest["ndci"] if latest else None,
           "ndti_z": None, "ndci_z": None}
    if latest:
        cm = int(latest["month"][5:7])
        bpx = sums.get(f"bpx_{cm:02d}", 0) or 0
        for k in ("ndti", "ndci"):
            if bpx >= 3 and latest[k] is not None:
                base, sd = sums[f"b{k}_{cm:02d}"] / bpx, sums[f"s{k}_{cm:02d}"] / bpx
                out[f"{k}_normal"] = round(base, 4)
                out[f"{k}_z"] = round((latest[k] - base) / max(sd, 0.02), 2)
    reasons = []
    h = out["hyacinth_pct"]
    if h is not None and h >= HEAVY_HYACINTH:
        reasons.append("heavy hyacinth")
    if (out["ndti_z"] or 0) >= Z_FLAG:
        reasons.append("unusually turbid")
    if (out["ndci_z"] or 0) >= Z_FLAG:
        reasons.append("unusually green water")
    watch = ((h or 0) >= WATCH_HYACINTH or (out["ndti_z"] or 0) >= Z_WATCH or (out["ndci_z"] or 0) >= Z_WATCH)
    out["reasons"] = reasons
    out["status"] = "sample first" if reasons else "watch" if watch else "no data" if not latest else "normal"
    return out


def overlay_image(bbox, year: int, month: int):
    """True colour of the latest month with the channel (blue) and floating weed (green) on top."""
    ee = init_ee()
    channel, region = channel_image(bbox)
    start = ee.Date.fromYMD(year, month, 1).advance(-1, "month")
    img = _s2(ee, region, start, start.advance(2, "month")).median()
    ndvi = img.normalizedDifference(["B8", "B4"])
    wc = ee.Image(ee.ImageCollection(WORLDCOVER).first())
    weed = ndvi.gt(HYACINTH_NDVI).And(channel).And(wc.neq(10)).And(wc.neq(95)).selfMask()
    return (img.select(["B4", "B3", "B2"]).visualize(min=0, max=0.25)
            .blend(channel.visualize(palette=["1f6fd1"], opacity=0.55))
            .blend(weed.visualize(palette=["39d353"])))
