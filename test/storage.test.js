require('./helpers/mockVscode');   // ← до require storage.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    normalizeSourceDocumentStates,
    loadDocumentForCompare,
    writeIfChanged,
    writeAll,
    cleanupStaleTmp
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


/* ============================================================
 * Бэкап и атомарная запись
 * ============================================================ */

test('writeIfChanged: creates backup on first change of existing file', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'file.json');
        fs.writeFileSync(target, 'old-content', 'utf8');

        writeIfChanged(target, 'new-content');

        const bakDir = path.join(d.tmpRoot, '.documentFlow.bak');
        assert.equal(fs.existsSync(bakDir), true);
        assert.equal(fs.readFileSync(path.join(bakDir, 'file.json.1'), 'utf8'), 'old-content');
        assert.equal(fs.readFileSync(target, 'utf8'), 'new-content');
    } finally { d.cleanup(); }
});

test('writeIfChanged: does not create backup for new file', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'brand-new.json');

        writeIfChanged(target, 'first-content');

        const bakDir = path.join(d.tmpRoot, '.documentFlow.bak');
        assert.equal(fs.existsSync(bakDir), false);
    } finally { d.cleanup(); }
});

test('writeIfChanged: does not create backup if content is identical', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'same.json');
        fs.writeFileSync(target, 'same-content', 'utf8');

        const wrote = writeIfChanged(target, 'same-content');

        assert.equal(wrote, false);
        const bakDir = path.join(d.tmpRoot, '.documentFlow.bak');
        assert.equal(fs.existsSync(bakDir), false);
    } finally { d.cleanup(); }
});

test('writeIfChanged: backup rotates, keeps 3 versions', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'rot.json');
        fs.writeFileSync(target, 'v0', 'utf8');

        writeIfChanged(target, 'v1');   // .1 = v0
        writeIfChanged(target, 'v2');   // .1 = v1, .2 = v0
        writeIfChanged(target, 'v3');   // .1 = v2, .2 = v1, .3 = v0
        writeIfChanged(target, 'v4');   // .1 = v3, .2 = v2, .3 = v1, v0 удалён

        const bakDir = path.join(d.tmpRoot, '.documentFlow.bak');
        assert.equal(fs.readFileSync(path.join(bakDir, 'rot.json.1'), 'utf8'), 'v3');
        assert.equal(fs.readFileSync(path.join(bakDir, 'rot.json.2'), 'utf8'), 'v2');
        assert.equal(fs.readFileSync(path.join(bakDir, 'rot.json.3'), 'utf8'), 'v1');
        assert.equal(fs.existsSync(path.join(bakDir, 'rot.json.4')), false);
        assert.equal(fs.readFileSync(target, 'utf8'), 'v4');
    } finally { d.cleanup(); }
});

test('writeIfChanged: no .tmp file left after write', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'atomic.json');
        writeIfChanged(target, 'content-1');
        writeIfChanged(target, 'content-2');

        const files = fs.readdirSync(d.tmpRoot);
        const tmpFiles = files.filter(f => f.endsWith('.documentFlow.tmp'));
        assert.deepEqual(tmpFiles, []);
    } finally { d.cleanup(); }
});


/* ============================================================
 * .gitignore внутри .documentFlow.bak/
 * ============================================================ */

test('backupExisting: creates .gitignore inside .documentFlow.bak', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'file.json');
        fs.writeFileSync(target, 'old', 'utf8');

        writeIfChanged(target, 'new');

        const gitignorePath = path.join(d.tmpRoot, '.documentFlow.bak', '.gitignore');
        assert.equal(fs.existsSync(gitignorePath), true);
        assert.equal(fs.readFileSync(gitignorePath, 'utf8'), '*\n');
    } finally { d.cleanup(); }
});

test('backupExisting: does not overwrite .gitignore on subsequent backups', () => {
    const d = docOnDisk({});
    try {
        const target = path.join(d.tmpRoot, 'file.json');
        fs.writeFileSync(target, 'v0', 'utf8');

        writeIfChanged(target, 'v1');
        const gitignorePath = path.join(d.tmpRoot, '.documentFlow.bak', '.gitignore');
        // Имитируем ручное изменение — если код перезапишет, тест упадёт.
        fs.writeFileSync(gitignorePath, '# custom content\n', 'utf8');

        writeIfChanged(target, 'v2');

        assert.equal(fs.readFileSync(gitignorePath, 'utf8'), '# custom content\n');
    } finally { d.cleanup(); }
});

/* ============================================================
 * cleanupStaleTmp
 * ============================================================ */

test('cleanupStaleTmp: removes tmp older than 5 minutes', () => {
    const d = docOnDisk({});
    try {
        const srcPath = path.join(d.tmpRoot, 'file.json');
        const tmpPath = srcPath + '.documentFlow.tmp';
        fs.writeFileSync(tmpPath, 'stale', 'utf8');

        // mtime — 10 минут назад (STALE_TMP_MS = 5 минут)
        const oldTime = (Date.now() - 10 * 60 * 1000) / 1000;
        fs.utimesSync(tmpPath, oldTime, oldTime);

        cleanupStaleTmp([srcPath]);

        assert.equal(fs.existsSync(tmpPath), false);
    } finally { d.cleanup(); }
});

test('cleanupStaleTmp: keeps tmp younger than 5 minutes', () => {
    const d = docOnDisk({});
    try {
        const srcPath = path.join(d.tmpRoot, 'file.json');
        const tmpPath = srcPath + '.documentFlow.tmp';
        fs.writeFileSync(tmpPath, 'fresh', 'utf8');

        // mtime — 1 минуту назад (< 5 минут)
        const freshTime = (Date.now() - 60 * 1000) / 1000;
        fs.utimesSync(tmpPath, freshTime, freshTime);

        cleanupStaleTmp([srcPath]);

        assert.equal(fs.existsSync(tmpPath), true);
    } finally { d.cleanup(); }
});

test('cleanupStaleTmp: missing tmp does not throw', () => {
    const d = docOnDisk({});
    try {
        const srcPath = path.join(d.tmpRoot, 'no-such-file.json');
        // tmp рядом с srcPath не существует — не должно быть исключения
        cleanupStaleTmp([srcPath]);
        assert.ok(true); // дошло без throw
    } finally { d.cleanup(); }
});

test('cleanupStaleTmp: handles null, undefined and empty paths', () => {
    const d = docOnDisk({});
    try {
        // Все три кейса — no-op, без throw
        cleanupStaleTmp([null, undefined, '']);
        assert.ok(true);
    } finally { d.cleanup(); }
});

test('cleanupStaleTmp: processes multiple paths independently', () => {
    const d = docOnDisk({});
    try {
        const oldSrc = path.join(d.tmpRoot, 'old.json');
        const freshSrc = path.join(d.tmpRoot, 'fresh.json');
        const missingSrc = path.join(d.tmpRoot, 'missing.json');

        const oldTmp = oldSrc + '.documentFlow.tmp';
        const freshTmp = freshSrc + '.documentFlow.tmp';

        fs.writeFileSync(oldTmp, 'stale', 'utf8');
        fs.writeFileSync(freshTmp, 'fresh', 'utf8');

        const oldTime = (Date.now() - 10 * 60 * 1000) / 1000;
        fs.utimesSync(oldTmp, oldTime, oldTime);
        const freshTime = (Date.now() - 60 * 1000) / 1000;
        fs.utimesSync(freshTmp, freshTime, freshTime);

        cleanupStaleTmp([oldSrc, freshSrc, missingSrc]);

        assert.equal(fs.existsSync(oldTmp), false);
        assert.equal(fs.existsSync(freshTmp), true);
    } finally { d.cleanup(); }
});