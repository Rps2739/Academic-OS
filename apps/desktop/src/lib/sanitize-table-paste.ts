/**
 * Excel's clipboard HTML represents merged cells (rowspan/colspan) in a
 * way that BlockNote's table-HTML parser can't always reconcile — it
 * builds its own row/col occupancy grid and throws "Unable to create
 * occupancy grid" on some real-world sheets (confirmed: a timetable with
 * rowspan-3 cells covering "filler" rows that have zero <td> children of
 * their own). Reproducing BlockNote's exact internal bookkeeping to
 * avoid every case it might reject is fragile — instead this rebuilds
 * each pasted <table> as a plain, fully-rectangular grid with no
 * rowspan/colspan at all: every row gets exactly the same number of
 * cells, and a merged cell's content is kept only at the position it
 * started, with blank filler cells elsewhere in its old span. That
 * shape is structurally impossible to reject. The trade-off — losing
 * the visual merge — is a reasonable one for "paste actually produces a
 * table" over "paste silently does nothing."
 */
export function sanitizeTablePasteHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("table").forEach((table) => {
    table.replaceWith(flattenTable(table, doc));
  });
  return doc.body.innerHTML;
}

function flattenTable(table: HTMLTableElement, doc: Document): HTMLTableElement {
  const rows = Array.from(table.rows);
  const numRows = rows.length;
  const occupied: boolean[][] = Array.from({ length: numRows }, () => []);
  const content: (HTMLTableCellElement | null)[][] = Array.from({ length: numRows }, () => []);

  rows.forEach((row, r) => {
    let col = 0;
    for (const cell of Array.from(row.cells)) {
      while (occupied[r][col]) col++;

      const rowspan = cell.rowSpan || 1;
      const colspan = cell.colSpan || 1;
      for (let dr = 0; dr < rowspan && r + dr < numRows; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          occupied[r + dr][col + dc] = true;
          // Only the cell's origin position (dr===0 && dc===0) carries
          // its content — everything else in its old span is left blank.
          content[r + dr][col + dc] = dr === 0 && dc === 0 ? cell : null;
        }
      }
      col += colspan;
    }
  });

  const numCols = occupied.reduce((max, row) => Math.max(max, row.length), 0);

  const newTable = doc.createElement("table");
  for (let r = 0; r < numRows; r++) {
    const tr = doc.createElement("tr");
    for (let c = 0; c < numCols; c++) {
      const td = doc.createElement("td");
      const source = content[r][c];
      if (source) td.innerHTML = source.innerHTML;
      tr.appendChild(td);
    }
    newTable.appendChild(tr);
  }
  return newTable;
}
