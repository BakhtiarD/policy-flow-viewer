function stripBom(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function indexOf(header) {
  const idx = {};
  header.forEach((h, i) => idx[h] = i);
  return idx;
}

module.exports = { stripBom, escapeHtml, indexOf };