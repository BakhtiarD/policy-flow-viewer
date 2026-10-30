const path = require('path');
const fs = require('fs');

const LOCALES_DIR = path.join(__dirname, 'locales');
const cache = {};
const FALLBACK = 'ru-RU';

let currentLang = FALLBACK;

function loadDict(lang) {
    if (cache[lang]) return cache[lang];
    const file = path.join(LOCALES_DIR, lang + '.js');
    if (!fs.existsSync(file)) {
        cache[lang] = {};
        return {};
    }
    try {
        delete require.cache[require.resolve(file)];
        cache[lang] = require(file);
        return cache[lang];
    } catch (e) {
        console.error('ui-i18n: failed to load ' + lang, e);
        cache[lang] = {};
        return {};
    }
}

// requested — значение из настройки: 'auto' | 'ru-RU' | 'en-US' | ...
// vscodeLang — vscode.env.language ('ru', 'en', 'de', ...)
function resolveLang(requested, vscodeLang) {
    if (requested && requested !== 'auto') return requested;

    const short = (vscodeLang || 'en').toLowerCase();
    const available = listAvailable();
    for (const c of available) {
        if (c.toLowerCase() === short) return c;
    }
    for (const c of available) {
        if (c.toLowerCase().startsWith(short + '-')) return c;
    }
    return FALLBACK;
}

function init(requested, vscodeLang) {
    currentLang = resolveLang(requested, vscodeLang);
    loadDict(currentLang);
    loadDict(FALLBACK);
}

function t(key, params) {
    const dict = loadDict(currentLang);
    let s = dict[key];
    if (s == null) s = loadDict(FALLBACK)[key];
    if (s == null) return key;
    return interpolate(s, params);
}

function plural(n, keyBase, params) {
    const dict = loadDict(currentLang);
    const formCur = new Intl.PluralRules(currentLang).select(Number(n));
    const formFb = new Intl.PluralRules(FALLBACK).select(Number(n));

    const tryKeys = [
        'plural.' + keyBase + '.' + formCur,
        'plural.' + keyBase + '.' + formFb,
        'plural.' + keyBase + '.other',
        'plural.' + keyBase
    ];
    for (const k of tryKeys) {
        const s = dict[k] || loadDict(FALLBACK)[k];
        if (s != null) {
            return interpolate(s, Object.assign({ n: String(n) }, params || {}));
        }
    }
    return String(n);
}

function interpolate(str, params) {
    if (!params) return str;
    return String(str).replace(/\{(\w+)\}/g, (_, name) =>
        params[name] != null ? String(params[name]) : '{' + name + '}'
    );
}

function getLang() { return currentLang; }

function listAvailable() {
    try {
        return fs.readdirSync(LOCALES_DIR)
            .filter(f => f.endsWith('.js'))
            .map(f => f.slice(0, -3));
    } catch { return [FALLBACK]; }
}

module.exports = { init, t, plural, getLang, listAvailable };