/**
 * Undo/Redo для данных документа.
 *
 * Снапшот включает:
 *   - flow, config, csv, ui, auth (данные);
 *   - содержимое flowRules/*.js и UI/ClientAction/*.js (файлы).
 *
 * При undo/redo:
 *   - данные пишутся через writeAll/writeUi/writeAuth;
 *   - .js файлы: удалённые — восстанавливаются, добавленные — удаляются,
 *     изменённые — перезаписываются через writeIfChanged.
 */
const fs = require('fs');
const path = require('path');
const { writeAll, writeUi, writeAuth, loadData, writeIfChanged } = require('./storage');

const LIMIT = 30;

function init(ctx) {
    if (!ctx) return;
    ctx.history = { undo: [], redo: [], limit: LIMIT };
}

/* ============================================================
 * .js файлы документа
 * ============================================================ */

function docDirs(ctx) {
    const docDir = path.dirname(ctx.flowPath);
    return {
        flowRulesDir: path.join(docDir, 'flowRules'),
        clientActionsDir: path.join(docDir, 'UI', 'ClientAction')
    };
}

function readDirJsFiles(dir) {
    if (!fs.existsSync(dir)) return {};
    const out = {};
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return out; }
    for (const e of entries) {
        if (!e.isFile()) continue;
        if (!e.name.endsWith('.js')) continue;
        try {
            out[e.name] = fs.readFileSync(path.join(dir, e.name), 'utf8');
        } catch (err) {
            console.warn('[history] failed to read', e.name, err.message);
        }
    }
    return out;
}

function collectJsFiles(ctx) {
    const { flowRulesDir, clientActionsDir } = docDirs(ctx);
    return {
        flowRules: readDirJsFiles(flowRulesDir),
        clientActions: readDirJsFiles(clientActionsDir)
    };
}

function restoreDir(dir, expected) {
    // 1. Удалить .js файлы, которых нет в снапшоте, но которые есть на диске.
    if (fs.existsSync(dir)) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { entries = []; }
        for (const e of entries) {
            if (!e.isFile()) continue;
            if (!e.name.endsWith('.js')) continue;
            if (expected[e.name] !== undefined) continue;
            try {
                fs.unlinkSync(path.join(dir, e.name));
            } catch (err) {
                console.warn('[history] failed to remove', e.name, err.message);
            }
        }
    }
    // 2. Записать все файлы из снапшота (writeIfChanged — только при отличии).
    for (const [name, content] of Object.entries(expected)) {
        writeIfChanged(path.join(dir, name), content);
    }
}

function restoreJsFiles(ctx, snapJs) {
    if (!snapJs) return;
    const { flowRulesDir, clientActionsDir } = docDirs(ctx);
    restoreDir(flowRulesDir, snapJs.flowRules || {});
    restoreDir(clientActionsDir, snapJs.clientActions || {});
}

/* ============================================================
 * Снапшоты данных
 * ============================================================ */

function dataSnapshot(ctx) {
    return {
        flow: JSON.parse(JSON.stringify(ctx.flow || {})),
        config: JSON.parse(JSON.stringify(ctx.config || {})),
        csv: JSON.parse(JSON.stringify(ctx.csv || {})),
        ui: JSON.parse(JSON.stringify(ctx.ui || [])),
        auth: ctx.auth ? JSON.parse(JSON.stringify(ctx.auth)) : null,
        js: collectJsFiles(ctx)
    };
}

function applySnapshot(ctx, snap) {
    ctx.flow = JSON.parse(JSON.stringify(snap.flow));
    ctx.config = JSON.parse(JSON.stringify(snap.config));
    ctx.csv = JSON.parse(JSON.stringify(snap.csv));
    ctx.ui = JSON.parse(JSON.stringify(snap.ui || []));
    ctx.auth = snap.auth ? JSON.parse(JSON.stringify(snap.auth)) : null;
    restoreJsFiles(ctx, snap.js);
}

/* ============================================================
 * Публичный API
 * ============================================================ */

function pushSnapshot(ctx, label) {
    if (!ctx) return;
    if (!ctx.history) init(ctx);
    const snap = dataSnapshot(ctx);
    snap.label = label || '';
    ctx.history.undo.push(snap);
    if (ctx.history.undo.length > ctx.history.limit) {
        ctx.history.undo.shift();
    }
    ctx.history.redo = [];
}

function popLastSnapshot(ctx) {
    if (!ctx || !ctx.history) return;
    ctx.history.undo.pop();
}

function persist(ctx) {
    // writeIfChanged внутри write* вернёт false, если файл не изменился.
    writeAll(ctx);
    writeUi(ctx);
    writeAuth(ctx);
}

function undo(ctx) {
    if (!ctx || !ctx.history || !ctx.history.undo.length) return null;

    const cur = dataSnapshot(ctx);
    const snap = ctx.history.undo.pop();
    cur.label = snap.label;

    applySnapshot(ctx, snap);
    persist(ctx);
    loadData(ctx);

    ctx.history.redo.push(cur);
    return snap.label;
}

function redo(ctx) {
    if (!ctx || !ctx.history || !ctx.history.redo.length) return null;

    const cur = dataSnapshot(ctx);
    const snap = ctx.history.redo.pop();
    cur.label = snap.label;

    applySnapshot(ctx, snap);
    persist(ctx);
    loadData(ctx);

    ctx.history.undo.push(cur);
    return snap.label;
}

function clear(ctx) {
    if (!ctx) return;
    ctx.history = { undo: [], redo: [], limit: LIMIT };
}

function getState(ctx) {
    if (!ctx || !ctx.history) {
        return { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null };
    }
    const { undo: u, redo: r } = ctx.history;
    return {
        canUndo: u.length > 0,
        canRedo: r.length > 0,
        undoLabel: u.length ? u[u.length - 1].label : null,
        redoLabel: r.length ? r[r.length - 1].label : null
    };
}

module.exports = {
    init,
    pushSnapshot,
    popLastSnapshot,
    undo,
    redo,
    clear,
    getState
};