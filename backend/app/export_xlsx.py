"""Builds an .xlsx from the sheets a page sends: [{name, columns, rows}] (rows = lists in column order)."""
import io
import re
from typing import Any, Dict, List

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

_HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_BAD_SHEET_CHARS = re.compile(r"[\[\]:*?/\\]")


def _sheet_title(name: str, used: set) -> str:
    base = _BAD_SHEET_CHARS.sub("-", str(name or "Sheet")).strip() or "Sheet"
    title = base[:31]
    n = 2
    while title.lower() in used:
        suffix = f" ({n})"
        title = base[:31 - len(suffix)] + suffix
        n += 1
    used.add(title.lower())
    return title


def safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or "export")).strip("_") or "export"
    return cleaned[:120] + ".xlsx"


def build_workbook(sheets: List[Dict[str, Any]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    used: set = set()
    for sheet in sheets or [{"name": "Data", "columns": [], "rows": []}]:
        ws = wb.create_sheet(_sheet_title(sheet.get("name"), used))
        columns = list(sheet.get("columns") or [])
        ws.append(columns)
        for cell in ws[1]:
            cell.fill, cell.font = _HEADER_FILL, _HEADER_FONT
            cell.alignment = Alignment(vertical="center")
        widths = [len(str(c)) for c in columns]
        for row in sheet.get("rows") or []:
            values = list(row)
            ws.append(values)
            for i, v in enumerate(values[:len(widths)]):
                widths[i] = max(widths[i], len(str(v)) if v is not None else 0)
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = min(max(w + 2, 8), 60)
        ws.freeze_panes = "A2"
        if columns:
            ws.auto_filter.ref = ws.dimensions
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
