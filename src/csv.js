function parseCsv(text) {
  const trailingNewline = text.endsWith('\n');
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (!lines.length) return { header: [], rows: [], trailingNewline };
  const header = lines[0].split('\t');
  const rows = lines.slice(1).map(l => {
    const parts = l.split('\t');
    while (parts.length < header.length) parts.push('');
    return parts;
  });
  return { header, rows, trailingNewline };
}

function serializeCsv(csv) {
  const lines = [csv.header.join('\t'), ...csv.rows.map(r => r.join('\t'))];
  let s = lines.join('\n');
  if (csv.trailingNewline) s += '\n';
  return s;
}

module.exports = { parseCsv, serializeCsv };