"""Builds an .xlsx workbook from page export payloads.

Supports:
- Data tables with bold navy headers (1F3864), white text, thin borders, zebra striping (F2F6FC)
- Custom number_formats per column (e.g. 0.00, #,##0.00, 0.00%)
- Remark coloring (Improve/Improved -> 16A34A, Maintain/Maintained -> F97316, Degrade/Degraded -> DC2626)
- Polarity-aware Delta coloring (red/green)
- Native Excel LineCharts with custom series colors and secondary right-axis for Total
- Cluster summary headers (merged title + period banner) and grouped cluster tables
"""
import io
import re
from typing import Any, Dict, List, Optional

from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# Styles & Colors
_HEADER_FILL = PatternFill("solid", fgColor="1F3864")
_HEADER_FONT = Font(name="Segoe UI", bold=True, color="FFFFFF", size=10)
_GROUP_FILL = PatternFill("solid", fgColor="E2E8F0")
_GROUP_FONT = Font(name="Segoe UI", bold=True, color="1E293B", size=10.5)
_REGULAR_FONT = Font(name="Segoe UI", size=10)
_BOLD_FONT = Font(name="Segoe UI", bold=True, size=10)

_BORDER_THIN = Border(
    left=Side(style="thin", color="D9D9D9"),
    right=Side(style="thin", color="D9D9D9"),
    top=Side(style="thin", color="D9D9D9"),
    bottom=Side(style="thin", color="D9D9D9")
)

_ZEBRA_FILL = PatternFill("solid", fgColor="F2F6FC")
_WHITE_FILL = PatternFill("solid", fgColor="FFFFFF")

# Remark pills
_REMARK_FILLS = {
    "IMPROVE": PatternFill("solid", fgColor="16A34A"),
    "IMPROVED": PatternFill("solid", fgColor="16A34A"),
    "MAINTAIN": PatternFill("solid", fgColor="F97316"),
    "MAINTAINED": PatternFill("solid", fgColor="F97316"),
    "DEGRADE": PatternFill("solid", fgColor="DC2626"),
    "DEGRADED": PatternFill("solid", fgColor="DC2626"),
}
_REMARK_FONT = Font(name="Segoe UI", bold=True, color="FFFFFF", size=9.5)

_COLOR_GREEN = "16A34A"
_COLOR_RED = "DC2626"
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


def _format_cell_val(val: Any, col_name: str, number_formats: dict) -> Any:
    """Format cell value, converting numeric values to float/int if in number_formats."""
    if val is None or val == "" or val == "–":
        return None
    if isinstance(val, (int, float)):
        return val
    # Only convert string to float if col_name has a number format or is known numeric
    if col_name in number_formats or col_name in ("Value", "Before", "After", "Delta", "Growth (%)"):
        if isinstance(val, str):
            val_clean = val.strip().rstrip("%")
            try:
                if re.match(r'^-?\d+(?:\.\d+)?$', val_clean):
                    num = float(val_clean)
                    if "%" in val:
                        num = num / 100.0
                    return num
            except ValueError:
                pass
    return val


def _render_charts_sheet(wb: Workbook, sheet: Dict[str, Any], used: set) -> None:
    """Renders a sheet containing native Excel LineCharts with data in 'Chart Data'."""
    charts = sheet.get("charts") or []
    if not charts:
        return

    # Validation: guard against excessive charts / data points
    total_pts = sum(len(c.get("categories", [])) for c in charts)
    if len(charts) > 60 or total_pts > 50000:
        ws_note = wb.create_sheet(_sheet_title("Note", used))
        ws_note["A1"] = f"Charts could not be generated: limit exceeded ({len(charts)} charts, {total_pts} data points; maximum 60 charts or 50,000 data points allowed)."
        ws_note["A1"].font = Font(name="Segoe UI", size=11, bold=True, color="DC2626")
        return

    ws_data = wb.create_sheet(_sheet_title("Chart Data", used))
    ws_charts = wb.create_sheet(_sheet_title(sheet.get("name") or "Charts", used))
    ws_charts.views.sheetView[0].showGridLines = True

    curr_col = 1
    for c_idx, c in enumerate(charts):
        categories = c.get("categories") or []
        series = c.get("series") or []
        total = c.get("total")

        if not categories or (not series and not total):
            continue

        has_total = bool(total and total.get("values"))
        num_data_cols = len(series) + (1 if has_total else 0)
        max_row = 1 + len(categories)

        # 1. Write headers into ws_data
        ws_data.cell(row=1, column=curr_col, value=f"{c.get('title', '')} - Time")
        for s_idx, s in enumerate(series):
            ws_data.cell(row=1, column=curr_col + 1 + s_idx, value=str(s.get("name", f"Series {s_idx+1}")))
        if has_total:
            tot_col = curr_col + 1 + len(series)
            ws_data.cell(row=1, column=tot_col, value=str(total.get("name", "Total")))

        # Header styling in ws_data
        for col_i in range(curr_col, curr_col + 1 + num_data_cols):
            cell = ws_data.cell(row=1, column=col_i)
            cell.fill = _HEADER_FILL
            cell.font = _HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center")

        # 2. Write data points
        for r_idx, cat in enumerate(categories):
            r_num = 2 + r_idx
            ws_data.cell(row=r_num, column=curr_col, value=str(cat))
            for s_idx, s in enumerate(series):
                v_list = s.get("values") or []
                v = v_list[r_idx] if r_idx < len(v_list) else None
                ws_data.cell(row=r_num, column=curr_col + 1 + s_idx, value=v)
            if has_total:
                t_list = total.get("values") or []
                t_v = t_list[r_idx] if r_idx < len(t_list) else None
                ws_data.cell(row=r_num, column=tot_col, value=t_v)

        # 3. Create openpyxl LineChart
        chart = LineChart()
        chart.title = c.get("title", "")
        chart.style = 13
        chart.width = 24
        chart.height = 9
        chart.legend.position = "b"
        chart.y_axis.title = c.get("unit", "")

        cats_ref = Reference(ws_data, min_col=curr_col, min_row=2, max_row=max_row)
        chart.set_categories(cats_ref)

        if series:
            data_ref = Reference(ws_data, min_col=curr_col + 1, min_row=1, max_col=curr_col + len(series), max_row=max_row)
            chart.add_data(data_ref, titles_from_data=True)
            for s_idx, s in enumerate(series):
                if s_idx < len(chart.series):
                    ser = chart.series[s_idx]
                    color_hex = str(s.get("color") or "4e79a7").lstrip("#").upper()
                    ser.graphicalProperties.line.solidFill = color_hex
                    ser.graphicalProperties.line.width = 15000  # ~1.2 pt
                    ser.smooth = False

        # Secondary axis for Total Payload
        if has_total:
            tot_ref = Reference(ws_data, min_col=tot_col, min_row=1, max_col=tot_col, max_row=max_row)
            tot_chart = LineChart()
            tot_chart.add_data(tot_ref, titles_from_data=True)
            tot_chart.y_axis.title = f"Total ({c.get('unit', '')})"
            tot_chart.y_axis.axId = 200
            tot_chart.y_axis.crosses = "max"
            tot_chart.legend = None
            if tot_chart.series:
                tot_ser = tot_chart.series[0]
                tot_ser.graphicalProperties.line.solidFill = "F43F5E"
                tot_ser.graphicalProperties.line.width = 20000  # ~1.5 pt
                tot_ser.smooth = False
            chart += tot_chart

        # Position chart (2 charts per row: A1, P1, A21, P21...)
        grid_r = (c_idx // 2) * 20 + 1
        grid_c = "A" if (c_idx % 2 == 0) else "P"
        ws_charts.add_chart(chart, f"{grid_c}{grid_r}")

        # Advance curr_col (plus 1 column gap)
        curr_col += 1 + num_data_cols + 1

    # Auto column width for ws_data
    for col_i in range(1, curr_col):
        ws_data.column_dimensions[get_column_letter(col_i)].width = 16
    ws_data.freeze_panes = "A2"


def _render_table_sheet(wb: Workbook, sheet: Dict[str, Any], used: set) -> None:
    """Renders a styled table sheet (standard, cluster summary, or grouped cluster)."""
    ws = wb.create_sheet(_sheet_title(sheet.get("name"), used))
    columns = list(sheet.get("columns") or [])
    style = sheet.get("style", "table")
    num_formats = sheet.get("number_formats") or {}
    remark_col = sheet.get("remark_column")
    polarity_col = sheet.get("polarity_column")
    delta_col = sheet.get("delta_column")

    start_row = 1

    # Cluster banner: Title on row 1, Period on row 2, row 3 blank
    if style == "cluster" and (sheet.get("title") or sheet.get("period_banner")):
        last_col_letter = get_column_letter(max(len(columns), 1))

        if sheet.get("title"):
            ws.merge_cells(f"A1:{last_col_letter}1")
            c1 = ws["A1"]
            c1.value = sheet["title"]
            c1.font = Font(name="Segoe UI", size=14, bold=True, color="1F3864")
            c1.alignment = Alignment(vertical="center")
            ws.row_dimensions[1].height = 24

        if sheet.get("period_banner"):
            ws.merge_cells(f"A2:{last_col_letter}2")
            c2 = ws["A2"]
            c2.value = sheet["period_banner"]
            c2.font = Font(name="Segoe UI", size=9.5, italic=True, color="555555")
            c2.alignment = Alignment(vertical="center")
            ws.row_dimensions[2].height = 18

        start_row = 4

    # Table Header
    header_row_num = start_row
    ws.row_dimensions[header_row_num].height = 22
    for col_idx, col_name in enumerate(columns, start=1):
        cell = ws.cell(row=header_row_num, column=col_idx, value=col_name)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(
            horizontal="center" if col_name in ("Polarity", "Remark", "Delta", "Growth (%)") else "left",
            vertical="center"
        )
        cell.border = _BORDER_THIN

    widths = [len(str(c)) for c in columns]
    curr_row = header_row_num + 1

    # Identify column indices (0-based) for polarity, delta, remark
    polarity_idx = columns.index(polarity_col) if polarity_col in columns else -1
    delta_idx = columns.index(delta_col) if delta_col in columns else -1
    remark_idx = columns.index(remark_col) if remark_col in columns else -1

    def write_row_cells(row_vals, is_even):
        nonlocal curr_row
        row_polarity = "up"
        if polarity_idx >= 0 and polarity_idx < len(row_vals):
            row_polarity = str(row_vals[polarity_idx] or "up").lower()

        ws.row_dimensions[curr_row].height = 20
        row_fill = _ZEBRA_FILL if is_even else _WHITE_FILL

        for col_i, v in enumerate(row_vals[:len(columns)], start=1):
            col_name = columns[col_i - 1]
            cell = ws.cell(row=curr_row, column=col_i)
            cell.border = _BORDER_THIN

            val_formatted = _format_cell_val(v, col_name, num_formats)
            cell.value = val_formatted

            # Remark badge fill
            if (col_i - 1) == remark_idx and v:
                v_up = str(v).strip().upper()
                if v_up in _REMARK_FILLS:
                    cell.fill = _REMARK_FILLS[v_up]
                    cell.font = _REMARK_FONT
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.fill = row_fill
                    cell.font = _REGULAR_FONT
                    cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.fill = row_fill
                cell.font = _REGULAR_FONT

                # Delta coloring based on polarity
                if (col_i - 1) == delta_idx and isinstance(val_formatted, (int, float)):
                    if row_polarity == "down":
                        color = _COLOR_GREEN if val_formatted < 0 else (_COLOR_RED if val_formatted > 0 else None)
                    else:
                        color = _COLOR_GREEN if val_formatted > 0 else (_COLOR_RED if val_formatted < 0 else None)
                    if color:
                        cell.font = Font(name="Segoe UI", bold=True, color=color, size=10)

                # Number formatting
                if col_name in num_formats:
                    cell.number_format = num_formats[col_name]
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                elif isinstance(val_formatted, (int, float)):
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                elif col_name in ("Polarity", "Remark"):
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")

            # Update width estimation
            str_len = len(str(v)) if v is not None else 0
            if col_i - 1 < len(widths):
                widths[col_i - 1] = max(widths[col_i - 1], str_len)

        curr_row += 1

    # Check for grouped rows
    groups = sheet.get("groups")
    if groups:
        row_counter = 0
        last_col_letter = get_column_letter(max(len(columns), 1))
        for grp in groups:
            # Group header banner
            grp_title = grp.get("title", "")
            ws.merge_cells(f"A{curr_row}:{last_col_letter}{curr_row}")
            ws.row_dimensions[curr_row].height = 22
            g_cell = ws[f"A{curr_row}"]
            g_cell.value = grp_title
            g_cell.fill = _GROUP_FILL
            g_cell.font = _GROUP_FONT
            g_cell.alignment = Alignment(vertical="center", indent=1)
            for c_i in range(1, len(columns) + 1):
                ws.cell(row=curr_row, column=c_i).border = _BORDER_THIN
            curr_row += 1

            for row_v in grp.get("rows") or []:
                write_row_cells(row_v, row_counter % 2 == 1)
                row_counter += 1
    else:
        for r_idx, row_v in enumerate(sheet.get("rows") or []):
            write_row_cells(row_v, r_idx % 2 == 1)

    # Column widths
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = min(max(w + 3, 10), 55)

    # Freeze panes below header
    ws.freeze_panes = f"A{header_row_num + 1}"

    # Autofilter
    if columns and curr_row > header_row_num + 1:
        last_letter = get_column_letter(len(columns))
        ws.auto_filter.ref = f"A{header_row_num}:{last_letter}{curr_row - 1}"


def build_workbook(sheets: List[Dict[str, Any]]) -> bytes:
    """Builds an Excel workbook (.xlsx bytes) from a list of sheet definitions."""
    wb = Workbook()
    wb.remove(wb.active)
    used: set = set()

    for sheet in sheets or [{"name": "Data", "columns": [], "rows": []}]:
        if sheet.get("charts"):
            _render_charts_sheet(wb, sheet, used)
        else:
            _render_table_sheet(wb, sheet, used)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
