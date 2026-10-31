// Быстрый конструктор CSV для тестов.
//
//   makeCsv(
//       ['ItemType', 'TranslationKey', 'Translation_ru-RU'],
//       [
//           { ItemType: 'states', TranslationKey: 'states@Draft', 'Translation_ru-RU': 'Черновик' }
//       ]
//   )
//
// Возвращает { header, rows, trailingNewline: true }.
// Колонки, отсутствующие в header, игнорируются (полезно, когда тест
// не хочет загромождать header всеми полями).
function makeCsv(header, rowsByName) {
    const rows = rowsByName.map(obj => {
        const r = new Array(header.length).fill('');
        for (const [k, v] of Object.entries(obj)) {
            const i = header.indexOf(k);
            if (i >= 0) r[i] = v;
        }
        return r;
    });
    return { header, rows, trailingNewline: true };
}

module.exports = { makeCsv };