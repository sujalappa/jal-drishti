"""River and lake assessment for a city, as a job with visible steps, maps and exports."""

from __future__ import annotations

import json
import urllib.request
import re
import traceback
from datetime import date
from functools import lru_cache

from shapely.geometry import box, shape
from shapely.strtree import STRtree

from . import report, water
from .config import settings
from .earthengine import EEError, init_ee
from .exports import write_csv, write_geojson, write_kml
from .jobs import Job
from .layers import corners

STAGES = [
    {"id": "channel", "name": "Find rivers and lakes", "description": "Water channel from Sentinel-2 since 2019"},
    {"id": "indicators", "name": "Monthly water condition", "description": "Hyacinth, turbidity and chlorophyll, 24 months"},
    {"id": "flags", "name": "Where to sample", "description": "Compare with 2019-2023 and flag stretches"},
    {"id": "maps", "name": "Maps", "description": "Latest image with weed cover"},
    {"id": "outputs", "name": "Report and exports", "description": "PDF, CSV, GeoJSON and KML"},
]
COLUMNS = [
    ("name", "Stretch"), ("status", "Status"), ("reasons", "Why"), ("latest_month", "Month"),
    ("channel_ha", "Water area (ha)"), ("hyacinth_pct", "Hyacinth %"), ("ndti", "Turbidity (NDTI)"),
    ("ndti_z", "Turbidity vs normal (z)"), ("ndci", "Chlorophyll (NDCI)"), ("ndci_z", "Chlorophyll vs normal (z)"),
    ("lat", "Latitude"), ("lon", "Longitude"),
]
STATUS_KML = {"sample first": "c80000c0", "watch": "c800a5ff", "normal": "9650a050", "no data": "50999999"}
NAME_SKIP = re.compile(r"\(M\.? ?Corp|\(CB\)|\(M C|\(CT\)|\(M Cl", re.I)


@lru_cache(maxsize=8)
def _villages(bbox: tuple) -> tuple:
    area = box(*bbox).buffer(0.05)
    names, geoms = [], []
    for path in (settings.boundaries_dir / "villages").glob("*.geojson"):
        fc = json.loads(path.read_text(encoding="utf-8"))
        for f in fc["features"]:
            g = shape(f["geometry"])
            if g.intersects(area):
                names.append((f["properties"]["village"], f["properties"]["taluka"]))
                geoms.append(g)
    return names, geoms


def _name_units(bbox, unit_geoms: dict) -> dict:
    """Name each stretch after the village it lies in, or the nearest named village outside municipal areas."""
    names, geoms = _villages(tuple(bbox))
    tree = STRtree(geoms) if geoms else None
    out = {}
    for i, (gid, geom) in enumerate(sorted(unit_geoms.items(), key=lambda kv: (shape(kv[1]).centroid.x)), start=1):
        c = shape(geom).centroid
        label = None
        if tree is not None:
            for idx in tree.query(c.buffer(0.03)):
                n, _ = names[idx]
                if not NAME_SKIP.search(n) and geoms[idx].contains(c):
                    label = n
                    break
            if label is None:
                best = sorted(((geoms[j].distance(c), names[j][0]) for j in tree.query(c.buffer(0.03))
                               if not NAME_SKIP.search(names[j][0])), key=lambda t: t[0])
                if best:
                    label = f"near {best[0][1]}"
        out[gid] = {"code": f"S{i:03d}", "name": f"S{i:03d} · {label or 'city'}", "lat": round(c.y, 5),
                    "lon": round(c.x, 5)}
    return out


def run_water_job(job: Job) -> None:
    try:
        opts = job.state["options"]
        area = water.AREAS[opts["area"]]
        bbox = area["bbox"]
        months = water.months_back(int(opts.get("months", 24)))
        for s in water.SOURCES:
            job.add_provenance(s)

        job.start_stage("channel")
        units = water.units(bbox)
        if not units:
            raise ValueError("No river or lake large enough was found in this area")
        geoms = {g: u["geometry"] for g, u in units.items()}
        labels = _name_units(bbox, geoms)
        fc = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"id": str(g), "name": labels[g]["name"]}, "geometry": geoms[g]}
            for g in units]}
        job.path("units.geojson").write_text(json.dumps(fc), encoding="utf-8")
        job.set_layer("units", "units.geojson", "River and lake stretches")
        total = sum(u["channel_ha"] for u in units.values())
        job.finish_stage("channel", f"{len(units)} stretches, {total:,.0f} ha of water", {"stretches": len(units)})

        job.start_stage("indicators")
        img, region = water.indicator_image(bbox, months)
        sums = water.grouped_sums(bbox, img, region)
        job.finish_stage("indicators", f"{len(months)} months, {months[0][0]}-{months[0][1]:02d} to "
                                       f"{months[-1][0]}-{months[-1][1]:02d}")

        job.start_stage("flags")
        results = {}
        for g, u in units.items():
            r = water.summarise(sums.get(g, {}), u["channel_ha"], months)
            r.update(labels[g])
            results[str(g)] = r
        counts = {s: sum(r["status"] == s for r in results.values()) for s in ("sample first", "watch", "normal", "no data")}
        # area-wide monthly hyacinth series (weighted by water seen)
        city = []
        for i, (y, m) in enumerate(months):
            seen = sum(r["series"][i]["seen_ha"] for r in results.values() if r["series"][i]["hyacinth_pct"] is not None)
            hy = sum(r["series"][i]["seen_ha"] * r["series"][i]["hyacinth_pct"] / 100 for r in results.values()
                     if r["series"][i]["hyacinth_pct"] is not None)
            city.append({"month": f"{y}-{m:02d}", "hyacinth_ha": round(hy, 1),
                         "hyacinth_pct": round(hy / seen * 100, 1) if seen >= 0.5 * total else None})
        latest = next((c for c in reversed(city) if c["hyacinth_pct"] is not None), None)
        job.path("results.json").write_text(json.dumps(results), encoding="utf-8")
        job.update("summary", {
            "kind": "water", "area": opts["area"], "area_name": area["name"], "waters": area["waters"],
            "stretches": len(results), "water_ha": round(total), "counts": counts, "city_series": city,
            "latest_month": latest["month"] if latest else None,
            "hyacinth_pct": latest["hyacinth_pct"] if latest else None,
            "hyacinth_ha": latest["hyacinth_ha"] if latest else None, "method": water.METHOD,
        })
        job.finish_stage("flags", f"{counts['sample first']} to sample first, {counts['watch']} to watch", counts)

        job.start_stage("maps")
        try:
            y, m = map(int, (latest["month"] if latest else f"{months[-1][0]}-{months[-1][1]:02d}").split("-"))
            ee = init_ee()
            url = water.overlay_image(bbox, y, m).getThumbURL({
                "region": ee.Geometry.Rectangle(bbox, None, False), "dimensions": 1800, "format": "png",
                "crs": "EPSG:4326"})
            job.path("water_now.png").write_bytes(urllib.request.urlopen(url, timeout=300).read())
            job.set_raster("water_now", "water_now.png", corners(bbox),
                           f"Sentinel-2, {y}-{m:02d}: water (blue) and floating weed (green)",
                           {"type": "categorical", "items": [{"label": "Open water channel", "color": "#1f6fd1"},
                                                             {"label": "Floating weed (hyacinth)", "color": "#39d353"}]})
            job.finish_stage("maps", "Latest image ready")
        except Exception as exc:
            job.event("warning", "MAPS_FAILED", f"Map layer could not be rendered: {exc}",
                      action="Results and exports are unaffected")
            job.skip_stage("maps", "Map layer unavailable")

        job.start_stage("outputs")
        order = {"sample first": 0, "watch": 1, "normal": 2, "no data": 3}
        rows = sorted(results.values(), key=lambda r: (order[r["status"]], -(r["hyacinth_pct"] or 0)))
        flat = [{**r, "reasons": ", ".join(r["reasons"])} for r in rows]
        write_csv(job.path("stretches.csv"), flat, COLUMNS)
        flat_res = {k: {kk: vv for kk, vv in v.items() if kk != "series"} | {"reasons": ", ".join(v["reasons"])}
                    for k, v in results.items()}
        write_geojson(job.path("stretches.geojson"), fc, flat_res)
        write_kml(job.path("stretches.kml"), fc, flat_res, "name", COLUMNS[1:10],
                  lambda r: STATUS_KML.get(r["status"], "50999999"))
        s = job.state["summary"]
        report.build(
            job.path("water_report.pdf"), f"River and lake condition: {area['name']}",
            f"Jal-drishti AI · Sentinel-2 · latest month {s['latest_month']}",
            [("Water bodies", area["waters"]), ("Stretches", f"{len(results)} ({total:,.0f} ha of water)"),
             ("Sample first / watch", f"{counts['sample first']} / {counts['watch']}"),
             ("Floating weed now", f"{s['hyacinth_pct']}% of visible water ({s['hyacinth_ha']} ha)"),
             ("Months analysed", f"{city[0]['month']} to {city[-1]['month']}")],
            water.METHOD, job.state["provenance"], COLUMNS[:10], flat[:80],
            "Satellite indicators are optical proxies. Use them to choose where and when to take water samples, and "
            "to check whether weed removal or new sewage plants changed the river.")
        for fmt, f, label in (("pdf", "water_report.pdf", "PDF report"), ("csv", "stretches.csv", "Stretch table (CSV)"),
                              ("geojson", "stretches.geojson", "Map data (GeoJSON)"),
                              ("kml", "stretches.kml", "Google Earth (KML)")):
            job.set_export(fmt, f, label)
        job.finish_stage("outputs", "PDF, CSV, GeoJSON and KML ready")
        job.set_status("completed")
    except Exception as exc:
        stage = job.state.get("current_stage")
        msg = str(exc) if isinstance(exc, (EEError, ValueError, KeyError)) else f"{type(exc).__name__}: {exc}"
        job.event("error", "JOB_FAILED", msg, action="Try again; if it repeats, check the Earth Engine login",
                  data={"trace": traceback.format_exc()[-2000:]})
        if stage:
            job.fail_stage(stage, msg)
        job.set_status("failed")
