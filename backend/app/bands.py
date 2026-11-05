"""
Single LTE band rule (skill band-lte) for the whole backend.

ci / cellId last digit:
  1 L1800, 2 L900, 3 L2100, 4 L2300_1, 5 L2300_2, 6 L2300_3, 7 L700,
  8 L2600_1 (L2600_3 when the id has more than 2 digits),
  9 L2600_2 (L2600_4 when the id has more than 2 digits)
Cell-name suffix codes are the fallback when no id is available.
"""
from typing import Optional

_LAST_DIGIT_BAND = {
    '1': 'L1800', '2': 'L900', '3': 'L2100', '4': 'L2300_1', '5': 'L2300_2',
    '6': 'L2300_3', '7': 'L700', '8': 'L2600_1', '9': 'L2600_2',
}

# Checked in order; the first code found in the upper-cased cell name wins
_NAME_CODES = [
    (('SL', 'ML', 'QL', 'IL'), 'L1800'),
    (('MR', 'VR', 'QR', 'IR'), 'L2100'),
    (('MT',), 'L900'),
    (('ME', 'VE', 'QE', 'IE'), 'L2300_1'),
    (('MF', 'VF', 'QF', 'IF'), 'L2300_2'),
    (('VV', 'QV'), 'L2300_3'),
    (('MD', 'VD'), 'L700'),
    (('MG', 'VG'), 'L2600'),
]


def lte_band(ci: Optional[float], cell_name: str = "", merge_l2600: bool = False) -> str:
    """Band of one LTE cell. merge_l2600=True returns 'L2600' for every L2600 carrier."""
    band = None
    try:
        if ci is not None:
            digits = str(int(float(ci)))
            last = digits[-1]
            if len(digits) > 2 and last == '8':
                band = 'L2600_3'
            elif len(digits) > 2 and last == '9':
                band = 'L2600_4'
            else:
                band = _LAST_DIGIT_BAND.get(last)
    except (ValueError, TypeError):
        band = None

    if band is None:
        upper = (cell_name or "").upper()
        band = next((b for codes, b in _NAME_CODES if any(c in upper for c in codes)), 'L1800')

    if merge_l2600 and band.startswith('L2600'):
        return 'L2600'
    return band


def lte_band_sql(alias: str) -> str:
    """SQL CASE for the same rule on <alias>."cellId", L2600 carriers merged. Unmatched -> 'OTHER'."""
    c = f'{alias}."cellId"::bigint::text'
    whens = "\n".join(
        f"        WHEN RIGHT({c}, 1) = '{digit}' THEN '{band}'"
        for digit, band in _LAST_DIGIT_BAND.items() if not band.startswith('L2600')
    )
    return f"""
    CASE
        WHEN RIGHT({c}, 1) IN ('8', '9') THEN 'L2600'
{whens}
        ELSE 'OTHER'
    END
"""
