import pytest

from common.geo import geohash, haversine_m, point_to_segment_m
from risk.grid import cells, cities, city_of, coverage, covering_cell, in_delhi, in_india, snap


def test_grid_has_36_cells_with_expected_ids():
    ids = [c["id"] for c in cells("delhi")]
    assert len(ids) == 36 and len(set(ids)) == 36
    assert "g_28.6_77.2" in ids and "g_28.4_76.8" in ids and "g_28.9_77.3" in ids


def test_pan_india_grid_is_unique_and_city_tagged():
    all_cells = cells()
    ids = [c["id"] for c in all_cells]
    big = sum(1 for c in cities() if c["tier"] == "heat_and_rain")
    small = sum(1 for c in cities() if c["tier"] == "city")
    assert len(ids) == len(set(ids)) == 36 + 9 * big + small
    assert big == 10 and small >= 50
    assert {c["city"] for c in all_cells} == {c["id"] for c in cities()}
    assert cities()[0]["id"] == "delhi" and cities()[0]["tier"] == "full"


def test_coverage_tiers():
    assert coverage(28.6139, 77.2090)["tier"] == "full"
    mumbai = coverage(19.07, 72.88)
    assert mumbai["tier"] == "heat_and_rain" and mumbai["city_name"] == "Mumbai" and mumbai["agencies"]["civic"] == "BMC"
    assert coverage(31.10, 77.17)["tier"] == "city"           # Shimla: a state capital, one cell
    assert coverage(23.5, 78.5)["tier"] == "point"            # rural Madhya Pradesh: personal plans only
    assert coverage(51.5, -0.12)["tier"] == "outside"         # London
    assert in_india(31.10, 77.17) and not in_india(51.5, -0.12)


def test_covering_cell_and_city_of():
    assert covering_cell(19.07, 72.88) == "g_19.1_72.9"
    assert covering_cell(23.5, 78.5) is None
    assert city_of(12.97, 77.59)["id"] == "bengaluru"


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


def test_ncr_satellite_cities_route_to_their_own_agencies():
    from risk.grid import agencies_for, nearest_cell
    assert coverage(28.46, 77.03)["city_name"] == "Gurugram" and agencies_for(28.46, 77.03)["civic"] == "MCG"
    assert agencies_for(28.63, 77.22) == {"civic": "MCD", "water": "DJB"}
    assert nearest_cell(18.60, 73.80) == "g_18.5_73.9"          # Pune edge -> Pune's cell
    assert nearest_cell(23.5, 78.5) is None
