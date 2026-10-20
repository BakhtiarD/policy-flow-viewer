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

// data.csv может содержать произвольное число колонок через \t.
// Первая колонка — код (валидный идентификатор). Шапка присутствует,
// если первая ячейка не является валидным кодом ИЛИ равна «Code»
// (без учёта регистра). Всё остальное — extras, которые мы сохраняем.
function readDataCsvRaw(dir) {
    const p = dataCsvPath(dir);
    if (!fs.existsSync(p)) return { header: null, rows: [], hasTrailingNewline: true };

    const text = stripBom(fs.readFileSync(p, 'utf8'));
    const hasTrailingNewline = /[\r\n]$/.test(text);
    const lines = text.split(/\r?\n/);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return { header: null, rows: [], hasTrailingNewline };

    const firstParts = lines[0].split('\t');
    const firstCell = (firstParts[0] || '').trim();
    // Шапка — только если первая ячейка ровно "Code" (без учёта регистра).
    // Всё остальное — данные, даже если код содержит нестандартные символы
    // (дефис, точка, пробел, начинается с цифры, и т.д.). Валидация
    // нового кода делается отдельно — в addAttachmentType.
    const hasHeader = /^code$/i.test(firstCell);

    let header = null;
    let startIdx = 0;
    if (hasHeader) {
        header = firstParts.map(x => x);   // как есть, без trim — сохраняем
        startIdx = 1;
    }

    const rows = [];
    for (let i = startIdx; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const parts = lines[i].split('\t');
        const code = (parts[0] || '').trim();
        if (!code) continue;               // пропускаем только совсем пустые
        const extras = parts.slice(1);     // как есть
        rows.push({ code, extras });
    }
    return { header, rows, hasTrailingNewline };
}

function loadAttachmentCodes(dir) {
    return readDataCsvRaw(dir).rows.map(r => r.code);
}

function saveAttachmentCodes(dir, codes) {
    const p = dataCsvPath(dir);
    const raw = readDataCsvRaw(dir);

    const byCode = new Map();
    for (const r of raw.rows) byCode.set(r.code, r.extras);

    let maxExtras = 0;
    for (const r of raw.rows) {
        if (r.extras.length > maxExtras) maxExtras = r.extras.length;
    }
    const colCount = raw.header
        ? Math.max(raw.header.length - 1, maxExtras)
        : maxExtras;

    const out = [];
    if (raw.header) out.push(raw.header.join('\t'));

    for (const code of codes) {
        let extras;
        if (byCode.has(code)) {
            extras = byCode.get(code);
        } else if (raw.header) {
            // Новый код: description-колонки заполняем кодом, остальные пусто.
            extras = [];
            for (let i = 0; i < colCount; i++) {
                const h = raw.header[i + 1] || '';
                extras.push(/description/i.test(h) ? code : '');
            }
        } else {
            // Нет шапки — новых кодов без extras (одноколочно).
            extras = [];
        }

        // Хвостовые пустые колонки не тащим — иначе получим code\t\t\t.
        let last = extras.length - 1;
        while (last >= 0 && extras[last] === '') last--;
        const trimmed = extras.slice(0, last + 1);

        out.push(trimmed.length ? (code + '\t' + trimmed.join('\t')) : code);
    }

    const body = out.join('\n');
    fs.writeFileSync(p, raw.hasTrailingNewline ? (body + '\n') : body, 'utf8');
}

// translation.csv — заголовочная таблица. Индексы ищем по имени колонки,
// порядок и набор языков могут отличаться.
function loadAttachmentTranslations(dir) {
    const p = translationCsvPath(dir);
    if (!fs.existsSync(p)) return { csv: null, map: {}, mapAll: {} };
    const csv = parseCsv(stripBom(fs.readFileSync(p, 'utf8')));
    const { map, mapAll } = parseTranslations(csv);
    return { csv, map, mapAll };
}

function parseTranslations(csv) {
    const map = {};
    const mapAll = {};
    if (!csv || !csv.header || !csv.header.length) return { map, mapAll };

    const langCols = [];
    for (let c = 0; c < csv.header.length; c++) {
        const m = /^Translation_(.+)$/.exec(csv.header[c]);
        if (!m) continue;
        langCols.push({ lang: m[1], col: c });
    }

    const idx = indexOf(csv.header);

    for (const row of csv.rows) {
        const key = row[idx['TranslationKey']];
        if (!key) continue;
        const m = String(key).match(/^AttachmentType@(.+?)@description$/);
        if (!m) continue;
        const code = m[1];
        const obj = {};
        for (const { lang, col } of langCols) {
            const v = row[col];
            if (v) obj[lang] = v;
        }
        if (!Object.keys(obj).length) continue;
        mapAll[code] = obj;
        map[code] = obj['ru-RU'] || obj['en-US'] || Object.values(obj)[0] || code;
    }
    return { map, mapAll };
}

// Возвращает { codes, translations, dir }
function loadAttachmentType(projectRoot) {
    const dir = findAttachmentTypeDir(projectRoot);
    if (!dir) return { codes: [], translations: {}, translationsAll: {}, dir: null };

    const codes = loadAttachmentCodes(dir);
    const { map: translations, mapAll: translationsAll } = loadAttachmentTranslations(dir);
    return { codes, translations, translationsAll, dir };
}

// Добавляет код в data.csv + запись перевода в translation.csv.
// Возвращает true, если что-то изменилось.
// Выбирает колонку перевода под язык: сначала Translation_<lang>,
// затем Translation_ru-RU, затем первая не-en колонка.
// null — если ни одной (тогда пишем только en-US).
function pickTrCol(header, lang) {
    const target = 'Translation_' + lang;
    if (header.includes(target)) return target;
    if (header.includes('Translation_ru-RU')) return 'Translation_ru-RU';
    const firstNonEn = header.find(h =>
        /^Translation_/.test(h) && h !== 'Translation_en-US'
    );
    return firstNonEn || null;
}

function addAttachmentType(dir, code, trValue, lang) {
    if (!dir) throw new Error('AttachmentType не найден в проекте.');
    if (!code || !/^[A-Za-z][A-Za-z0-9_ ]*$/.test(code)) {
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

    // Язык перевода. При en-US не пишем в не-en колонки: код уже
    // и есть en-US.
    const trLang = lang || 'ru-RU';
    if (trLang !== 'en-US') {
        const colName = pickTrCol(csv.header, trLang);
        if (colName && (colName in idx)) {
            row[idx[colName]] = trValue || code;
        }
    }

    csv.rows.push(row);

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