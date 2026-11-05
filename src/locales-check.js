/**
 * Проверка согласованности ключей в файлах локализации.
 *
 * Сравнивает наборы ключей ru-RU ↔ en-US в двух парах:
 *   - media/locales/*.js (webview, window.PF_UI_LOCALES)
 *   - src/locales/*.js   (server, module.exports)
 *
 * Возвращает массив расхождений:
 *   [{ scope: 'webview'|'server', key: 'btn.foo', side: 'only-ru'|'only-en' }]
 *
 * 'only-ru' — ключ есть в ru-RU, отсутствует в en-US.
 * 'only-en' — ключ есть в en-US, отсутствует в ru-RU.
 *
 * Ключи с префиксом 'plural.' игнорируются: набор категорий plural
 * зависит от языка (русский: one/few/many, английский: one/other),
 * и различие в этом наборе — правильное поведение Intl.PluralRules,
 * а не рассинхронизация. Функция PF.ui.plural() / uiI18n.plural()
 * в рантайме использует fallback через tryKeys, поэтому отсутствие
 * формы в целевом языке не ломает перевод.
 *
 * Порядок: сначала webview, потом server; внутри — по алфавиту.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PLURAL_PREFIX = 'plural.';

function loadWebviewLocale(lang) {
    const filePath = path.join(__dirname, '..', 'media', 'locales', lang + '.js');
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8');
    const sandbox = { window: { PF_UI_LOCALES: {} } };
    vm.createContext(sandbox);
    try {
        vm.runInContext(content, sandbox);
    } catch (e) {
        console.error('[locales-check] failed to load webview', lang, ':', e.message);
        return {};
    }
    const all = sandbox.window.PF_UI_LOCALES || {};
    return all[lang] || {};
}

function loadServerLocale(lang) {
    const filePath = path.join(__dirname, 'locales', lang + '.js');
    if (!fs.existsSync(filePath)) return {};
    try {
        delete require.cache[require.resolve(filePath)];
        return require(filePath);
    } catch (e) {
        console.error('[locales-check] failed to load server', lang, ':', e.message);
        return {};
    }
}

function compare(scope, dictRu, dictEn, out) {
    const ruKeys = new Set(Object.keys(dictRu));
    const enKeys = new Set(Object.keys(dictEn));
    for (const k of ruKeys) {
        if (k.startsWith(PLURAL_PREFIX)) continue;
        if (!enKeys.has(k)) out.push({ scope, key: k, side: 'only-ru' });
    }
    for (const k of enKeys) {
        if (k.startsWith(PLURAL_PREFIX)) continue;
        if (!ruKeys.has(k)) out.push({ scope, key: k, side: 'only-en' });
    }
}

function checkLocales() {
    const out = [];
    compare('webview', loadWebviewLocale('ru-RU'), loadWebviewLocale('en-US'), out);
    compare('server',  loadServerLocale('ru-RU'),   loadServerLocale('en-US'),   out);
    // webview — 0, server — 1; внутри одинакового scope — по алфавиту.
    const scopeRank = { webview: 0, server: 1 };
    out.sort((a, b) => {
        if (a.scope !== b.scope) return scopeRank[a.scope] - scopeRank[b.scope];
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    return out;
}

module.exports = { checkLocales };