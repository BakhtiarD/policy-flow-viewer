const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseCsv, serializeCsv } = require('../src/csv');

/* ============ parseCsv ============ */

test('parseCsv: simple TSV with trailing newline', () => {
    const r = parseCsv('a\tb\n1\t2\n');
    assert.deepEqual(r, {
        header: ['a', 'b'],
        rows: [['1', '2']],
        trailingNewline: true
    });
});

test('parseCsv: no trailing newline', () => {
    const r = parseCsv('a\tb\n1\t2');
    assert.equal(r.trailingNewline, false);
    assert.deepEqual(r.header, ['a', 'b']);
    assert.deepEqual(r.rows, [['1', '2']]);
});

test('parseCsv: empty text', () => {
    const r = parseCsv('');
    assert.deepEqual(r, { header: [], rows: [], trailingNewline: false });
});

test('parseCsv: only newline', () => {
    const r = parseCsv('\n');
    assert.deepEqual(r, { header: [], rows: [], trailingNewline: true });
});

test('parseCsv: header only', () => {
    const r = parseCsv('a\tb\n');
    assert.deepEqual(r, { header: ['a', 'b'], rows: [], trailingNewline: true });
});

test('parseCsv: CRLF line endings', () => {
    const r = parseCsv('a\tb\r\n1\t2\r\n');
    assert.deepEqual(r.header, ['a', 'b']);
    assert.deepEqual(r.rows, [['1', '2']]);
    assert.equal(r.trailingNewline, true);
});

test('parseCsv: rows padded to header length', () => {
    const r = parseCsv('a\tb\tc\n1\t2\n');
    assert.deepEqual(r.rows, [['1', '2', '']]);
});

test('parseCsv: rows with more cells are kept as-is', () => {
    const r = parseCsv('a\tb\n1\t2\t3\n');
    assert.deepEqual(r.rows, [['1', '2', '3']]);
});

test('parseCsv: blank lines filtered out', () => {
    const r = parseCsv('a\tb\n\n1\t2\n\n');
    assert.deepEqual(r.header, ['a', 'b']);
    assert.deepEqual(r.rows, [['1', '2']]);
    assert.equal(r.trailingNewline, true);
});

test('parseCsv: a row of only tabs is kept (not blank)', () => {
    const r = parseCsv('a\tb\n\t\n');
    assert.deepEqual(r.rows, [['', '']]);
});

/* ============ serializeCsv ============ */

test('serializeCsv: simple with trailing newline', () => {
    const s = serializeCsv({
        header: ['a', 'b'],
        rows: [['1', '2']],
        trailingNewline: true
    });
    assert.equal(s, 'a\tb\n1\t2\n');
});

test('serializeCsv: without trailing newline', () => {
    const s = serializeCsv({
        header: ['a', 'b'],
        rows: [['1', '2']],
        trailingNewline: false
    });
    assert.equal(s, 'a\tb\n1\t2');
});

test('serializeCsv: empty csv without trailing newline', () => {
    const s = serializeCsv({ header: [], rows: [], trailingNewline: false });
    assert.equal(s, '');
});

test('serializeCsv: empty csv with trailing newline', () => {
    const s = serializeCsv({ header: [], rows: [], trailingNewline: true });
    assert.equal(s, '\n');
});

test('serializeCsv: header only', () => {
    const s = serializeCsv({
        header: ['a', 'b'],
        rows: [],
        trailingNewline: true
    });
    assert.equal(s, 'a\tb\n');
});

test('serializeCsv: multiple rows', () => {
    const s = serializeCsv({
        header: ['a', 'b'],
        rows: [['1', '2'], ['3', '4']],
        trailingNewline: false
    });
    assert.equal(s, 'a\tb\n1\t2\n3\t4');
});

/* ============ roundtrip ============ */

test('roundtrip: parse(serialize(parse(text))) equals parse(text)', () => {
    const text = 'a\tb\n1\t2\n3\t4\n';
    const parsed = parseCsv(text);
    const reparsed = parseCsv(serializeCsv(parsed));
    assert.deepEqual(reparsed, parsed);
});

test('roundtrip: preserves trailingNewline=false', () => {
    const text = 'a\tb\n1\t2';
    const parsed = parseCsv(text);
    const reparsed = parseCsv(serializeCsv(parsed));
    assert.equal(reparsed.trailingNewline, false);
    assert.deepEqual(reparsed.rows, [['1', '2']]);
});

test('roundtrip: rows padded to header survive roundtrip', () => {
    const text = 'a\tb\tc\n1\t2\n';
    const parsed = parseCsv(text);
    const reparsed = parseCsv(serializeCsv(parsed));
    assert.deepEqual(reparsed.rows, [['1', '2', '']]);
});