import pytest

from risk.heat import hour_band
from risk.wetbulb import stull_wet_bulb, wet_bulb_or_compute

# Spec section 6.5: (temp C, RH %, expected wet-bulb C, expected band)
CASES = [
    (45, 15, 23.9, "RED"),     # dry heat: temperature at or above 44
    (41, 30, 26.7, "ORANGE"),  # temperature at or above 40
    (38, 40, 27.0, "YELLOW"),  # temperature >= 37 and wet-bulb >= 25
    (36, 65, 30.3, "RED"),     # humid heat a 40 C rule misses
    (34, 80, 31.0, "RED"),     # humid heat
    (30, 50, 22.3, "GREEN"),   # below every threshold
]


@pytest.mark.parametrize("t,rh,wb,band", CASES)
def test_stull_matches_spec_within_0_2(t, rh, wb, band):
    assert stull_wet_bulb(t, rh) == pytest.approx(wb, abs=0.2)


@pytest.mark.parametrize("t,rh,wb,band", CASES)
def test_band_matches_spec_exactly(t, rh, wb, band):
    assert hour_band(t, stull_wet_bulb(t, rh)) == band


def test_supplied_wet_bulb_is_preferred():
    assert wet_bulb_or_compute(29.5, 36, 65) == 29.5
    assert wet_bulb_or_compute(None, 36, 65) == pytest.approx(30.3, abs=0.2)
