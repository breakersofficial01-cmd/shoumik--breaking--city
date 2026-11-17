// Small CSV parser for published Google Sheets.
// Handles: quoted fields, commas and line breaks inside quotes, "" as an escaped quote,
// Windows/Unix line endings and the UTF-8 BOM. Bangla text passes through untouched.

/** @returns {string[][]} rows of cells */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // skip BOM

  for (; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop completely empty lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Turn CSV text into objects using the first row as headers.
 * Header names are lower-cased and spaces become underscores ("Lesson ID" -> "lesson_id").
 * Each object also gets __row = the sheet row number (for error messages).
 */
export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((cells, idx) => {
    const obj = { __row: idx + 2 };
    headers.forEach((h, c) => {
      if (h) obj[h] = (cells[c] ?? '').trim();
    });
    return obj;
  });
}
