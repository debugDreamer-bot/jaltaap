"""Wet-bulb temperature from air temperature and relative humidity (Stull 2011).

Valid for RH 5 to 99 % and T -20 to 50 C, accurate to about 1 C. Prefer Open-Meteo's
wet_bulb_temperature_2m when the API supplies it; use this when it does not (for example
the Previous Runs API, which has no wet-bulb with lead-time offsets).
"""
import math


def stull_wet_bulb(temp_c: float, rh_pct: float) -> float:
    """Return wet-bulb temperature in C. arctan is in radians."""
    t, rh = float(temp_c), float(rh_pct)
    return (
        t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
        + math.atan(t + rh)
        - math.atan(rh - 1.676331)
        + 0.00391838 * rh ** 1.5 * math.atan(0.023101 * rh)
        - 4.686035
    )


def wet_bulb_or_compute(wet_bulb_c, temp_c, rh_pct) -> float:
    """Use the supplied wet-bulb if present, else compute it with Stull."""
    if wet_bulb_c is not None:
        return float(wet_bulb_c)
    return stull_wet_bulb(temp_c, rh_pct)
