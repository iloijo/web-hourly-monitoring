from typing import Optional

def map_band_lte(cell_id: Optional[float | int | str]) -> str:
    """
    Derives LTE frequency band from cellId (measHy4g) or ci (CellListRCI)
    according to Band_LTE specification.
    """
    if cell_id is None or str(cell_id).strip() == "":
        return "Unknown"
    
    try:
        s = str(int(float(cell_id))).strip()
    except (ValueError, TypeError):
        s = str(cell_id).strip()
    
    if not s:
        return "Unknown"
        
    last = s[-1]
    length = len(s)
    
    if length > 2 and last == "8":
        return "L2600_3"
    if length > 2 and last == "9":
        return "L2600_4"
    
    mapping = {
        "1": "L1800",
        "2": "L900",
        "3": "L2100",
        "4": "L2300_1",
        "5": "L2300_2",
        "6": "L2300_3",
        "7": "L700",
        "8": "L2600_1",
        "9": "L2600_2"
    }
    return mapping.get(last, "Unknown")

BAND_COLORS = {
    "L1800": "#3b82f6",     # Blue
    "L2100": "#c084fc",     # Purple / Pink
    "L2300_1": "#22c55e",   # Emerald Green
    "L2300_2": "#10b981",   # Teal Green
    "L900": "#f97316",      # Vibrant Orange
    "L700": "#eab308",      # Gold Yellow
    "L2600_1": "#ec4899",   # Rose Pink
    "L2600_2": "#f43f5e",   # Crimson
    "L2600_3": "#8b5cf6",   # Violet
    "L2600_4": "#6366f1",   # Indigo
    "Unknown": "#94a3b8"    # Slate
}
