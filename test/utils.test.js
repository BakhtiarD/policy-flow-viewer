const { test } = require('node:test');
const assert = require('node:assert/strict');

const { stripBom, indexOf, escapeHtml } = require('../src/utils');

/* ============ stripBom ============ */

test('stripBom: removes BOM at start', () => {
    assert.equal(stripBom('\uFEFFhello'), 'hello');
});

test('stripBom: keeps string without BOM', () => {
    assert.equal(stripBom('hello'), 'hello');
});

test('stripBom: empty string returns empty', () => {
    assert.equal(stripBom(''), '');
});

test('stripBom: BOM in the middle is not touched', () => {
    assert.equal(stripBom('he\uFEFFllo'), 'he\uFEFFllo');
});

test('stripBom: only first BOM is removed', () => {
    assert.equal(stripBom('\uFEFF\uFEFFx'), '\uFEFFx');
});

/* ============ indexOf ============ */

test('indexOf: maps header names to indices', () => {
    assert.deepEqual(indexOf(['a', 'b', 'c']), { a: 0, b: 1, c: 2 });
});

test('indexOf: empty header returns empty object', () => {
    assert.deepEqual(indexOf([]), {});
});

test('indexOf: duplicates — last wins', () => {
    assert.deepEqual(indexOf(['a', 'b', 'a']), { a: 2, b: 1 });
});

test('indexOf: empty header name becomes empty-string key', () => {
    assert.deepEqual(indexOf(['', 'x']), { '': 0, x: 1 });
});

/* ============ escapeHtml ============ */

test('escapeHtml: escapes ampersand', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml: escapes angle brackets', () => {
    assert.equal(escapeHtml('<div>'), '&lt;div&gt;');
});

test('escapeHtml: escapes double and single quotes', () => {
    assert.equal(escapeHtml('"x" \'y\''), '&quot;x&quot; &#39;y&#39;');
});

test('escapeHtml: null and undefined return empty string', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml: numbers are stringified', () => {
    assert.equal(escapeHtml(42), '42');
});