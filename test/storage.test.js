require('./helpers/mockVscode');   // ← до require storage.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    normalizeSourceDocumentStates,
    loadDocumentForCompare,
    writeIfChanged,
    writeAll
} = require('../src/storage');

const { docOnDisk } = require('./helpers/docOnDisk');

/* ============================================================
 * normalizeSourceDocumentStates
 * ============================================================ */

test('normalizeSourceDocumentStates: empty array → empty', () => {
    assert.deepEqual(normalizeSourceDocumentStates([]), []);
});

test('normalizeSourceDocumentStates: null/undefined → empty', () => {
    assert.deepEqual(normalizeSourceDocumentStates(null), []);
    assert.deepEqual(normalizeSourceDocumentStates(undefined), []);
});

test('normalizeSourceDocumentStates: string actors preserved', () => {
    const r = normalizeSourceDocumentStates([
        { name: 'Draft', actors: ['Editor', 'Viewer'] }
    ]);
    assert.deepEqual(r, [{ name: 'Draft', actors: ['Editor', 'Viewer'] }]);
});

test('normalizeSourceDocumentStates: object actors with .actor field', () => {
    const r = normalizeSourceDocumentStates([
        { name: 'Draft', actors: [{ actor: 'Editor' }, { actor: 'Viewer' }] }
    ]);
    assert.deepEqual(r, [{ name: 'Draft', actors: ['Editor', 'Viewer'] }]);
});

test('normalizeSourceDocumentStates: object actors with .name field', () => {
    const r = normalizeSourceDocumentStates([
        { name: 'Draft', actors: [{ name: 'Editor' }] }
    ]);
    assert.deepEqual(r, [{ name: 'Draft', actors: ['Editor'] }]);
});

test('normalizeSourceDocumentStates: mixed string/object actors', () => {
    const r = normalizeSourceDocumentStates([
        { name: 'Draft', actors: ['Editor', { actor: 'Viewer' }, { name: 'Approver' }] }
    ]);
    assert.deepEqual(r, [{ name: 'Draft', actors: ['Editor', 'Viewer', 'Approver'] }]);
});

test('normalizeSourceDocumentStates: garbage actors filtered out', () => {
    const r = normalizeSourceDocumentStates([
        { name: 'Draft', actors: [null, undefined, '', { actor: '' }, { name: '' }, 'Editor'] }
    ]);
    assert.deepEqual(r, [{ name: 'Draft', actors: ['Editor'] }]);
});

test('normalizeSourceDocumentStates: entries without name filtered out', () => {
    const r = normalizeSourceDocumentStates([
        { name: '', actors: ['Editor'] },
        { name: null, actors: ['Viewer'] },
        { actors: ['Approver'] },
        { name: 'Draft', actors: ['Editor'] }
    ]);
    assert.deepEqual(r, [{ name: 'Draft', actors: ['Editor'] }]);
});

test('normalizeSourceDocumentStates: actors not array → empty actors', () => {
    const r = normalizeSourceDocumentStates([
        { name: 'Draft', actors: 'not-an-array' },
        { name: 'Active' }
    ]);
    assert.deepEqual(r, [
        { name: 'Draft', actors: [] },
        { name: 'Active', actors: [] }
    ]);
});

test('normalizeSourceDocumentStates: numeric name stringified', () => {
    const r = normalizeSourceDocumentStates([{ name: 42, actors: [] }]);
    assert.deepEqual(r, [{ name: '42', actors: [] }]);
});

/* ============================================================
 * loadDocumentForCompare
 * ============================================================ */

test('loadDocumentForCompare: returns null when documentFlow.json missing', () => {
    const d = docOnDisk({ flowMissing: true });
    try {
        assert.equal(loadDocumentForCompare(d.flowPath), null);
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: returns null when documentFlow.json is invalid JSON', () => {
    const d = docOnDisk({ flowRaw: '{ broken json' });
    try {
        assert.equal(loadDocumentForCompare(d.flowPath), null);
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: minimal valid document', () => {
    const d = docOnDisk({
        docName: 'MyDoc',
        flow: { states: [{ name: 'Draft' }], transitions: [], actors: [], initialState: 'Draft' }
    });
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.ok(doc);
        assert.equal(doc.docName, 'MyDoc');
        assert.equal(doc.flow.states.length, 1);
        assert.equal(doc.flow.states[0].name, 'Draft');
        assert.deepEqual(doc.config, { states: [], attachments: [] });
        assert.deepEqual(doc.csv.header, ['ItemType', 'TranslationKey']);
        assert.equal(doc.auth, null);
        assert.equal(doc.authPath, null);
        assert.deepEqual(doc.ui, []);
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: config read', () => {
    const d = docOnDisk({
        config: {
            states: [{ name: 'Draft', actors: [{ actor: 'Editor' }] }],
            attachments: [{ attachmentType: 'Photo' }]
        }
    });
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.equal(doc.config.states.length, 1);
        assert.equal(doc.config.states[0].name, 'Draft');
        assert.deepEqual(doc.config.attachments, [{ attachmentType: 'Photo' }]);
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: invalid config falls back to empty', () => {
    const d = docOnDisk({ configRaw: '{ broken' });
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.deepEqual(doc.config, { states: [], attachments: [] });
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: csv parsed (header + rows)', () => {
    const csvText =
        'ItemType\tTranslationKey\tTranslation_en-US\tTranslation_ru-RU\n' +
        'states\tstates@Draft\tDraft\tЧерновик\n';
    const d = docOnDisk({ csvText });
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.deepEqual(doc.csv.header, [
            'ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'
        ]);
        assert.equal(doc.csv.rows.length, 1);
        assert.equal(doc.csv.rows[0][1], 'states@Draft');
        assert.equal(doc.csv.rows[0][3], 'Черновик');
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: flowName from first states@ row', () => {
    const csvText =
        'ConfigurationName\tItemType\tTranslationKey\n' +
        'MyFlow\tstates\tstates@Draft\n';
    const d = docOnDisk({ docName: 'MyDoc', csvText });
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.equal(doc.flowName, 'MyFlow');
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: flowName fallback when no states@ row', () => {
    const d = docOnDisk({ docName: 'MyDoc' });   // csv по умолчанию без states@
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.equal(doc.flowName, 'MyDocFlow');
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: ui loaded when file present', () => {
    const ui = [
        { id: 'state_Draft', bounds: { x: 100, y: 200, width: 160, height: 50 } },
        { id: 'transition_A_B', waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }
    ];
    const d = docOnDisk({ ui });
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.equal(doc.ui.length, 2);
        assert.equal(doc.ui[0].id, 'state_Draft');
    } finally { d.cleanup(); }
});

test('loadDocumentForCompare: auth loaded when authorization.csv present', () => {
    const authText =
        'ApplicationRole\tPermissionType\tCodeName\tConceptTypeName\tAssignedPermission\tAssignmentOperator\n' +
        'Admin\tAllow Actor\tMyDoc\tDocumentConfiguration\tEditor\tAdd\n';
    const d = docOnDisk({ docName: 'MyDoc', auth: authText });
    try {
        const doc = loadDocumentForCompare(d.flowPath);
        assert.ok(doc.authPath);
        assert.ok(doc.auth);
        assert.equal(doc.auth.rows.length, 1);
        assert.equal(doc.auth.rows[0][0], 'Admin');
        assert.equal(doc.auth.rows[0][4], 'Editor');
    } finally { d.cleanup(); }
});

/* ============================================================
 * writeIfChanged / writeAll
 * ============================================================ */

test('writeIfChanged: creates file when missing', () => {
    const d = docOnDisk({ flowMissing: true });
    try {
        const target = path.join(d.tmpRoot, 'new-file.txt');
        const wrote = writeIfChanged(target, 'hello');
        assert.equal(wrote, true);
        assert.equal(fs.readFileSync(target, 'utf8'), 'hello');
    } finally { d.cleanup(); }
});

test('writeIfChanged: creates parent directories', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'nested', 'deep', 'file.txt');
        const wrote = writeIfChanged(target, 'content');
        assert.equal(wrote, true);
        assert.equal(fs.readFileSync(target, 'utf8'), 'content');
    } finally { d.cleanup(); }
});

test('writeIfChanged: skips write if content is identical', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'same.txt');
        const first = writeIfChanged(target, 'same');
        const second = writeIfChanged(target, 'same');
        assert.equal(first, true);
        assert.equal(second, false);
    } finally { d.cleanup(); }
});

test('writeIfChanged: rewrites if content differs', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'changed.txt');
        writeIfChanged(target, 'old');
        const wrote = writeIfChanged(target, 'new');
        assert.equal(wrote, true);
        assert.equal(fs.readFileSync(target, 'utf8'), 'new');
    } finally { d.cleanup(); }
});

test('writeAll: only changed files are written', () => {
    const d = docOnDisk({ docName: 'DocA' });
    try {
        const csv = {
            header: ['ItemType', 'TranslationKey'],
            rows: [['states', 'states@Draft']],
            trailingNewline: true
        };
        const csvText = 'ItemType\tTranslationKey\nstates\tstates@Draft\n';
        fs.writeFileSync(d.transPath, csvText, 'utf8');
        fs.writeFileSync(d.flowPath,
            JSON.stringify({ states: [], transitions: [], actors: [], initialState: '' }, null, 4),
            'utf8');
        fs.writeFileSync(d.configPath,
            JSON.stringify({ states: [], attachments: [] }, null, 4),
            'utf8');

        const ctx = {
            flowPath: d.flowPath,
            configPath: d.configPath,
            transPath: d.transPath,
            flow: { states: [], transitions: [], actors: [], initialState: '' },
            config: { states: [{ name: 'Draft', actors: [] }], attachments: [] },
            csv
        };

        const r = writeAll(ctx);
        assert.deepEqual(r, { flow: false, config: true, csv: false });

        const r2 = writeAll(ctx);
        assert.deepEqual(r2, { flow: false, config: false, csv: false });
    } finally { d.cleanup(); }
});