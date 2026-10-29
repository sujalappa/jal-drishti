from jaldrishti import water

MONTHS = [(2026, 4), (2026, 5)]


def _sums(seen, hy, owpx=10, ndti=-0.1, ndci=0.05, base=(-0.1, 0.02, 0.05, 0.02)):
    s = {}
    for y, m in MONTHS:
        t = f"{y}{m:02d}"
        s.update({f"seen_{t}": seen, f"hy_{t}": hy, f"ow_{t}": seen - hy, f"owpx_{t}": owpx,
                  f"ndti_{t}": ndti * owpx, f"ndci_{t}": ndci * owpx})
    for cm in (4, 5):
        b, sb, c, sc = base
        s.update({f"bpx_{cm:02d}": 10, f"bndti_{cm:02d}": b * 10, f"sndti_{cm:02d}": sb * 10,
                  f"bndci_{cm:02d}": c * 10, f"sndci_{cm:02d}": sc * 10})
    return s


def test_heavy_hyacinth_is_sample_first():
    r = water.summarise(_sums(seen=10, hy=6), 10, MONTHS)
    assert r["hyacinth_pct"] == 60 and r["status"] == "sample first" and r["reasons"] == ["heavy hyacinth"]


def test_unusual_turbidity_flags_and_normal_passes():
    turbid = water.summarise(_sums(seen=10, hy=0, ndti=0.0), 10, MONTHS)
    assert turbid["ndti_z"] == 5.0 and "unusually turbid" in turbid["reasons"]
    normal = water.summarise(_sums(seen=10, hy=1), 10, MONTHS)
    assert normal["status"] == "normal" and normal["ndti_z"] == 0


def test_cloudy_month_is_ignored():
    r = water.summarise(_sums(seen=2, hy=2), 10, MONTHS)   # under half the channel seen
    assert r["status"] == "no data" and r["latest_month"] is None


def test_months_back():
    from datetime import date
    assert water.months_back(3, date(2026, 2, 10)) == [(2025, 12), (2026, 1), (2026, 2)]
