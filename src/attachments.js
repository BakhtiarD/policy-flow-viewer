const fs = require('fs');
const path = require('path');

const { stripBom, indexOf } = require('./utils');
const { parseCsv, serializeCsv } = require('./csv');

// Ищем masterEntity/AttachmentType в configuration/@config-*/infrastructure/
function findAttachmentTypeDir(projectRoot) {
    if (!projectRoot) return null;
    const configDir = path.join(projectRoot, 'configuration');
    if (!fs.existsSync(configDir)) return null;

    let nsEntries;
    try { nsEntries = fs.readdirSync(configDir, { withFileTypes: true }); }
    catch { return null; }

    for (const ns of nsEntries) {
        if (!ns.isDirectory() || !ns.name.startsWith('@config-')) continue;
        const dir = path.join(
            configDir, ns.name,
            'infrastructure', 'masterEntity', 'AttachmentType'
        );
        if (fs.existsSync(path.join(dir, 'data.csv'))) return dir;
    }
    return null;
}

function dataCsvPath(dir) { return path.join(dir, 'data.csv'); }
function translationCsvPath(dir) {
    return path.join(dir, 'translation', 'translation.csv');
}

// data.csv — одноколоночный список кодов (без шапки).
// Читаем: строки, обрезаем \r, пустые пропускаем.
function loadAttachmentCodes(dir) {
    const p = dataCsvPath(dir);
    if (!fs.existsSync(p)) return [];
    const text = stripBom(fs.readFileSync(p, 'utf8'));
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

// Записываем data.csv: по одному коду на строку, trailing newline.
function saveAttachmentCodes(dir, codes) {
    fs.writeFileSync(dataCsvPath(dir), codes.join('\n') + '\n', 'utf8');
}

// translation.csv — заголовочная таблица. Индексы ищем по имени колонки,
// порядок и набор языков могут отличаться.
function loadAttachmentTranslations(dir) {
    const p = translationCsvPath(dir);
    if (!fs.existsSync(p)) return { csv: null, map: {} };
    const csv = parseCsv(stripBom(fs.readFileSync(p, 'utf8')));
    const map = parseTranslations(csv);
    return { csv, map };
}

function parseTranslations(csv) {
    const map = {};
    if (!csv || !csv.header || !csv.header.length) return map;
    const idx = indexOf(csv.header);
    const ruIdx = idx['Translation_ru-RU'];
    if (ruIdx == null) return map;

    for (const row of csv.rows) {
        const key = row[idx['TranslationKey']];
        if (!key) continue;
        const m = String(key).match(/^AttachmentType@(.+?)@description$/);
        if (!m) continue;
        const code = m[1];
        const ru = row[ruIdx];
        if (ru) map[code] = ru;
    }
    return map;
}

// Возвращает { codes, translations, dir }
function loadAttachmentType(projectRoot) {
    const dir = findAttachmentTypeDir(projectRoot);
    if (!dir) return { codes: [], translations: {}, dir: null };

    const codes = loadAttachmentCodes(dir);
    const { map: translations } = loadAttachmentTranslations(dir);
    return { codes, translations, dir };
}

// Добавляет код в data.csv + запись перевода в translation.csv.
// Возвращает true, если что-то изменилось.
function addAttachmentType(dir, code, ruTitle) {
    if (!dir) throw new Error('AttachmentType не найден в проекте.');
    if (!code || !/^[A-Za-z][A-Za-z0-9_]*$/.test(code)) {
        throw new Error('Некорректный код вложения: ' + code);
    }
    const codes = loadAttachmentCodes(dir);
    if (codes.includes(code)) {
        throw new Error('Код «' + code + '» уже существует в справочнике.');
    }
    codes.push(code);
    saveAttachmentCodes(dir, codes);

    // translation.csv
    const p = translationCsvPath(dir);
    let csv;
    if (fs.existsSync(p)) {
        csv = parseCsv(stripBom(fs.readFileSync(p, 'utf8')));
    } else {
        // Если файла нет — создаём с минимальной шапкой.
        csv = {
            header: [
                'ConfigurationType', 'ConfigurationName', 'ItemType', 'TranslationKey',
                'Expression', 'Translation_en-US', 'Translation_ru-RU'
            ],
            rows: [],
            trailingNewline: true
        };
    }
    const idx = indexOf(csv.header);
    const row = new Array(csv.header.length).fill('');
    row[idx['ConfigurationType']] = 'DataSchema';
    row[idx['ConfigurationName']] = 'AttachmentType';
    row[idx['ItemType']] = 'localized-field';
    row[idx['TranslationKey']] = 'AttachmentType@' + code + '@description';
    row[idx['Expression']] = 'description';
    row[idx['Translation_en-US']] = code;
    row[idx['Translation_ru-RU']] = ruTitle || code;
    csv.rows.push(row);

    // Если папки translation нет — создадим
    const tdir = path.dirname(p);
    if (!fs.existsSync(tdir)) fs.mkdirSync(tdir, { recursive: true });

    fs.writeFileSync(p, serializeCsv(csv), 'utf8');
    return true;
}

// Удаляет код из data.csv и запись перевода из translation.csv.
function removeAttachmentType(dir, code) {
    if (!dir) return;
    const codes = loadAttachmentCodes(dir).filter(c => c !== code);
    saveAttachmentCodes(dir, codes);

    const p = translationCsvPath(dir);
    if (!fs.existsSync(p)) return;
    const csv = parseCsv(stripBom(fs.readFileSync(p, 'utf8')));
    const idx = indexOf(csv.header);
    csv.rows = csv.rows.filter(row => {
        const key = row[idx['TranslationKey']];
        if (!key) return true;
        const m = String(key).match(/^AttachmentType@(.+?)@description$/);
        return !(m && m[1] === code);
    });
    fs.writeFileSync(p, serializeCsv(csv), 'utf8');
}

module.exports = {
    findAttachmentTypeDir,
    loadAttachmentType,
    loadAttachmentCodes,
    loadAttachmentTranslations,
    addAttachmentType,
    removeAttachmentType
};