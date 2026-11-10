"""The pressure overlay's one unit fact: how many hPa a variable's stored unit is.

The overlay's interval is the operator's, in hPa, because that is how a chart
is spoken of ("isobars every 4 hPa"). The texture is in whatever unit core
stored the variable in — IFS ``msl`` may well be Pa, a WRF ``slp`` hPa — and
the web is kept unit-blind, so the server answers both conversions it needs:
the interval in the texture's unit, and the factor that turns a texture value
back into hPa for an H/L label.
"""

import pint

from georiva.core.unit_utils import ureg


def hpa_per_unit(variable):
    """How many hPa one of ``variable``'s stored unit is, or ``None`` when it is no pressure.

    ``None`` covers every way a unit can fail to be one — a temperature, a
    dimensionless ``1``, a symbol pint cannot parse — because every caller
    treats them alike: refuse it in the admin, leave it out of the catalogue.
    """
    unit = getattr(variable, "unit", None)
    if unit is None:
        return None
    try:
        return float(ureg.Quantity(1, unit.symbol).to("hPa").magnitude)
    except (pint.errors.PintError, AttributeError, TypeError, ValueError):
        return None


def describe_pressure(variable, interval_hpa):
    """What the web needs to draw ``variable`` as isobars, or ``None`` if it cannot be."""
    factor = hpa_per_unit(variable)
    if not factor:
        return None
    return {"variable": variable.slug, "interval": interval_hpa / factor, "to_hpa": factor}
