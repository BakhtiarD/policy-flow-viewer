require('./helpers/mockVscode');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { checkLocales } = require('../src/locales-check');

test('checkLocales: real project — no mismatches', () => {
    const issues = checkLocales();
    // Если этот тест падает — значит в реальных файлах локализации
    // есть рассинхронизация. Вывод npm test покажет, какой ключ
    // отсутствует в каком файле.
    assert.deepEqual(issues, []);
});

test('checkLocales: each issue has correct shape', () => {
    const issues = checkLocales();
    for (const it of issues) {
        assert.ok(it.scope === 'webview' || it.scope === 'server',
            'scope must be webview|server, got ' + it.scope);
        assert.equal(typeof it.key, 'string');
        assert.ok(it.key.length > 0);
        assert.ok(it.side === 'only-ru' || it.side === 'only-en',
            'side must be only-ru|only-en, got ' + it.side);
    }
});

test('checkLocales: sort order — webview before server, keys alphabetical', () => {
    const issues = checkLocales();
    for (let i = 1; i < issues.length; i++) {
        const a = issues[i - 1];
        const b = issues[i];
        if (a.scope !== b.scope) {
            assert.ok(a.scope === 'webview' && b.scope === 'server',
                'webview must come before server');
        } else {
            assert.ok(a.key <= b.key,
                'keys within scope must be sorted: ' + a.key + ' <= ' + b.key);
        }
    }
});