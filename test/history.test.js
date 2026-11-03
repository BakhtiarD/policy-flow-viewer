require('./helpers/mockVscode');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const history = require('../src/history');
const { makeCtx } = require('./helpers/makeCtx');

function baseCtx(overrides) {
    const d = makeCtx(Object.assign({
        flow: { states: [{ name: 'A' }], transitions: [], actors: [], initialState: 'A' },
        config: { states: [], attachments: [] },
        csv: { header: ['ItemType', 'TranslationKey'], rows: [] },
        ui: []
    }, overrides || {}));
    history.init(d.ctx);
    return d;
}

/* ============ init / getState ============ */

test('history: init sets empty stack', () => {
    const d = baseCtx();
    try {
        const s = history.getState(d.ctx);
        assert.equal(s.canUndo, false);
        assert.equal(s.canRedo, false);
    } finally { d.cleanup(); }
});

test('history: getState on ctx without history returns safe defaults', () => {
    const d = makeCtx({});
    try {
        const s = history.getState(d.ctx);
        assert.deepEqual(s, { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
    } finally { d.cleanup(); }
});

/* ============ pushSnapshot ============ */

test('history: pushSnapshot stores a copy, not a reference', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'test');
        d.ctx.flow.states.push({ name: 'B' });
        const s = history.getState(d.ctx);
        assert.equal(s.canUndo, true);
        assert.equal(d.ctx.history.undo[0].flow.states.length, 1);
    } finally { d.cleanup(); }
});

test('history: pushSnapshot clears redo stack', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'a');
        history.undo(d.ctx);
        assert.equal(history.getState(d.ctx).canRedo, true);

        history.pushSnapshot(d.ctx, 'b');
        assert.equal(history.getState(d.ctx).canRedo, false);
    } finally { d.cleanup(); }
});

test('history: pushSnapshot respects limit', () => {
    const d = baseCtx();
    try {
        for (let i = 0; i < 35; i++) {
            d.ctx.flow.states.push({ name: 'S' + i });
            history.pushSnapshot(d.ctx, 'step ' + i);
        }
        assert.equal(d.ctx.history.undo.length, 30);
        assert.equal(d.ctx.history.undo[29].label, 'step 34');
        assert.equal(d.ctx.history.undo[0].label, 'step 5');
    } finally { d.cleanup(); }
});

/* ============ undo / redo ============ */

test('history: undo restores previous snapshot', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'add B');
        d.ctx.flow.states.push({ name: 'B' });
        d.ctx.flow.initialState = 'B';

        history.undo(d.ctx);

        assert.equal(d.ctx.flow.states.length, 1);
        assert.equal(d.ctx.flow.initialState, 'A');
    } finally { d.cleanup(); }
});

test('history: undo on empty returns null and does not throw', () => {
    const d = baseCtx();
    try {
        const label = history.undo(d.ctx);
        assert.equal(label, null);
        assert.equal(d.ctx.flow.states.length, 1);
    } finally { d.cleanup(); }
});

test('history: undo returns label of applied snapshot', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'my action');
        const label = history.undo(d.ctx);
        assert.equal(label, 'my action');
    } finally { d.cleanup(); }
});

test('history: redo returns label of applied snapshot', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'my action');
        d.ctx.flow.states.push({ name: 'B' });
        history.undo(d.ctx);

        const label = history.redo(d.ctx);
        assert.equal(label, 'my action');
        assert.equal(d.ctx.flow.states.length, 2);
    } finally { d.cleanup(); }
});

test('history: undo then redo returns to same state', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'step');
        d.ctx.flow.states.push({ name: 'B' });
        d.ctx.config.states.push({ name: 'B', actors: [] });

        history.undo(d.ctx);
        assert.equal(d.ctx.flow.states.length, 1);
        assert.equal(d.ctx.config.states.length, 0);

        history.redo(d.ctx);
        assert.equal(d.ctx.flow.states.length, 2);
        assert.equal(d.ctx.config.states.length, 1);
    } finally { d.cleanup(); }
});

test('history: multiple undo/redo cycle', () => {
    const d = baseCtx();
    try {
        for (let i = 0; i < 3; i++) {
            history.pushSnapshot(d.ctx, 'step ' + i);
            d.ctx.flow.states.push({ name: 'X' + i });
        }
        assert.equal(d.ctx.flow.states.length, 4);

        history.undo(d.ctx);
        history.undo(d.ctx);
        assert.equal(d.ctx.flow.states.length, 2);

        history.redo(d.ctx);
        assert.equal(d.ctx.flow.states.length, 3);
    } finally { d.cleanup(); }
});

/* ============ popLastSnapshot ============ */

test('history: popLastSnapshot removes last without applying', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'a');
        history.pushSnapshot(d.ctx, 'b');
        d.ctx.flow.states.push({ name: 'B' });

        history.popLastSnapshot(d.ctx);

        assert.equal(d.ctx.history.undo.length, 1);
        assert.equal(d.ctx.history.undo[0].label, 'a');
        // ctx.flow не тронут — .push остался
        assert.equal(d.ctx.flow.states.length, 2);
    } finally { d.cleanup(); }
});

/* ============ clear ============ */

test('history: clear empties both stacks', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'a');
        d.ctx.flow.states.push({ name: 'B' });
        history.undo(d.ctx);

        history.clear(d.ctx);

        const s = history.getState(d.ctx);
        assert.equal(s.canUndo, false);
        assert.equal(s.canRedo, false);
    } finally { d.cleanup(); }
});

/* ============ изоляция flow/config/csv ============ */

test('history: undo restores config and csv independently', () => {
    const d = baseCtx();
    try {
        history.pushSnapshot(d.ctx, 'change all');
        d.ctx.config.states.push({ name: 'New', actors: [] });
        d.ctx.csv.rows.push(['states', 'states@New']);

        history.undo(d.ctx);

        assert.equal(d.ctx.config.states.length, 0);
        assert.equal(d.ctx.csv.rows.length, 0);
    } finally { d.cleanup(); }
});


/* ============================================================
 * .js файлы: ClientAction и flowRules
 * ============================================================ */

test('history: undo restores deleted ClientAction file', () => {
    const d = baseCtx();
    try {
        const caDir = path.join(
            d.ctx.productLevel, 'document', d.ctx.docName, 'UI', 'ClientAction'
        );
        const filePath = path.join(caDir, 'beforeActive.js');
        fs.writeFileSync(filePath, 'module.exports = function beforeActive(){ return true; };\n', 'utf8');

        history.pushSnapshot(d.ctx, 'delete ClientAction');
        fs.unlinkSync(filePath);   // имитация операции, удалившей файл

        assert.equal(fs.existsSync(filePath), false);

        history.undo(d.ctx);

        assert.equal(fs.existsSync(filePath), true);
        assert.equal(
            fs.readFileSync(filePath, 'utf8'),
            'module.exports = function beforeActive(){ return true; };\n'
        );
    } finally { d.cleanup(); }
});

test('history: undo removes ClientAction added after snapshot', () => {
    const d = baseCtx();
    try {
        const caDir = path.join(
            d.ctx.productLevel, 'document', d.ctx.docName, 'UI', 'ClientAction'
        );

        history.pushSnapshot(d.ctx, 'add ClientAction');
        const filePath = path.join(caDir, 'newAction.js');
        fs.writeFileSync(filePath, 'module.exports = function newAction(){ return true; };\n', 'utf8');

        assert.equal(fs.existsSync(filePath), true);

        history.undo(d.ctx);

        assert.equal(fs.existsSync(filePath), false);
    } finally { d.cleanup(); }
});

test('history: undo restores deleted flowRules file', () => {
    const d = baseCtx();
    try {
        const frDir = path.join(
            d.ctx.productLevel, 'document', d.ctx.docName, 'flowRules'
        );
        const filePath = path.join(frDir, 'A_B.js');
        fs.writeFileSync(filePath, "'use strict';\nmodule.exports = function rule(){ return true; };\n", 'utf8');

        history.pushSnapshot(d.ctx, 'delete transition');
        fs.unlinkSync(filePath);

        history.undo(d.ctx);

        assert.equal(fs.existsSync(filePath), true);
    } finally { d.cleanup(); }
});

test('history: redo reapplies .js snapshot after undo', () => {
    const d = baseCtx();
    try {
        const frDir = path.join(
            d.ctx.productLevel, 'document', d.ctx.docName, 'flowRules'
        );
        const filePath = path.join(frDir, 'A_B.js');
        fs.writeFileSync(filePath, "'use strict';\nmodule.exports = function rule(){ return true; };\n", 'utf8');

        history.pushSnapshot(d.ctx, 'delete transition');
        fs.unlinkSync(filePath);

        history.undo(d.ctx);
        assert.equal(fs.existsSync(filePath), true, 'after undo file must exist');

        history.redo(d.ctx);
        assert.equal(fs.existsSync(filePath), false, 'after redo file must be gone');
    } finally { d.cleanup(); }
});