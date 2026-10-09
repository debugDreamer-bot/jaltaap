import pytest

from common.geo import geohash, haversine_m, point_to_segment_m
from risk.grid import cells, in_delhi, snap


def test_grid_has_36_cells_with_expected_ids():
    ids = [c["id"] for c in cells()]
    assert len(ids) == 36 and len(set(ids)) == 36
    assert "g_28.6_77.2" in ids and "g_28.4_76.8" in ids and "g_28.9_77.3" in ids


def test_snap_to_nearest_cell():
    assert snap(28.6139, 77.2090) == "g_28.6_77.2"
    assert snap(28.58, 77.21) == "g_28.6_77.2"
    assert snap(28.54, 77.26) == "g_28.5_77.3"
    assert snap(30.0, 70.0) == "g_28.9_76.8"     # clamped


def test_bbox():
    assert in_delhi(28.6139, 77.2090)
    assert not in_delhi(19.07, 72.88)            # Mumbai
    assert not in_delhi(28.40, 77.50)            # Noida east of the box


def test_haversine():
    assert haversine_m(28.6, 77.2, 28.6, 77.2) == 0
    assert haversine_m(28.6, 77.2, 28.7, 77.2) == pytest.approx(11_120, rel=0.01)


def test_geohash_precision():
    assert len(geohash(28.6139, 77.2090, 5)) == 5
    assert geohash(28.6139, 77.2090, 6).startswith(geohash(28.6139, 77.2090, 5))


def test_point_to_segment():
    a, b = (28.60, 77.20), (28.60, 77.30)
    assert point_to_segment_m(28.605, 77.25, a, b) == pytest.approx(556, rel=0.02)
    assert point_to_segment_m(28.60, 77.35, a, b) == pytest.approx(haversine_m(28.60, 77.30, 28.60, 77.35), rel=0.01)


def test_geohash_matches_reference_library():
    geohash2 = pytest.importorskip("geohash2")   # dev-only reference implementation
    from common.geo import geohash_decode
    for lat, lon in [(28.6139, 77.2090), (28.4, 76.8), (28.9, 77.3), (-33.86, 151.21), (51.5, -0.12)]:
        for p in (5, 6, 7):
            assert geohash(lat, lon, p) == geohash2.encode(lat, lon, precision=p)
        dlat, dlon = geohash_decode(geohash(lat, lon, 7))
        assert abs(dlat - lat) < 0.001 and abs(dlon - lon) < 0.001
