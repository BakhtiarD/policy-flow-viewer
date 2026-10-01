const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const { stripBom, indexOf } = require('./utils');
const { parseCsv, serializeCsv } = require('./csv');
const {
    buildTranslations, buildMeta, buildTable, buildStateDetails, buildGraph,
    buildAuthMeta, buildRelationsMeta
} = require('./transforms');
const { renderHtml } = require('./html');

async function resolveRoot(uri) {
    if (uri && uri.fsPath) {
        try {
            const st = fs.statSync(uri.fsPath);
            return st.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath);
        } catch { /* ignore */ }
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length === 1) return folders[0].uri.fsPath;
    if (folders && folders.length > 1) {
        const pick = await vscode.window.showWorkspaceFolderPick();
        return pick ? pick.uri.fsPath : null;
    }
    const sel = await vscode.window.showOpenDialog({
        canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
        openLabel: 'Выбрать папку с конфигурацией'
    });
    return sel && sel.length ? sel[0].fsPath : null;
}

function findFileByName(dir, name, depth = 6) {
    if (depth < 0) return null;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return null; }

    for (const e of entries) {
        if (e.isFile() && e.name === name) return path.join(dir, e.name);
    }
    for (const e of entries) {
        if (['node_modules', '.git', 'dist', 'out', '.vscode'].includes(e.name)) continue;
        if (e.isDirectory()) {
            const r = findFileByName(path.join(dir, e.name), name, depth - 1);
            if (r) return r;
        }
    }
    return null;
}

function findAuthorizationPath(flowPath) {
    let dir = path.dirname(flowPath);
    for (let i = 0; i < 5; i++) {
        const candidates = [
            path.join(dir, 'authorization', 'authorization.csv'),
            path.join(dir, 'authorization.csv')
        ];
        for (const c of candidates) {
            if (fs.existsSync(c)) return c;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

// Product-level: папка, содержащая «document» или «documentRelation»
function findProductLevel(flowPath) {
    let dir = path.dirname(flowPath);
    for (let i = 0; i < 6; i++) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        if (fs.existsSync(path.join(parent, 'document')) ||
            fs.existsSync(path.join(parent, 'documentRelation'))) {
            return parent;
        }
        dir = parent;
    }
    return null;
}

function loadRelations(productLevel) {
    if (!productLevel) return [];
    const dir = path.join(productLevel, 'documentRelation');
    if (!fs.existsSync(dir)) return [];

    const result = [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return []; }

    for (const e of entries) {
        if (!e.isDirectory()) continue;
        const cfgPath = path.join(dir, e.name, 'configuration.json');
        if (!fs.existsSync(cfgPath)) continue;
        try {
            const cfg = JSON.parse(stripBom(fs.readFileSync(cfgPath, 'utf8')));
            result.push({
                name: e.name,
                path: cfgPath,
                sourceDocument: cfg.sourceDocument || '',
                sourceDocumentVersion: cfg.sourceDocumentVersion || '',
                sourceDocumentStates: Array.isArray(cfg.sourceDocumentStates) ? cfg.sourceDocumentStates : [],
                actionToRunBefore: cfg.actionToRunBefore || '',
                targetDocument: cfg.targetDocument || '',
                targetDocumentVersion: cfg.targetDocumentVersion || '',
                targetState: cfg.targetState || '',
                keywords: Array.isArray(cfg.keywords) ? cfg.keywords : []
            });
        } catch (err) {
            console.error('documentRelation parse error:', e.name, err);
        }
    }
    return result;
}

function loadDocumentNames(productLevel) {
    if (!productLevel) return [];
    const dir = path.join(productLevel, 'document');
    if (!fs.existsSync(dir)) return [];
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name);
    } catch { return []; }
}

function loadDocumentTitles(productLevel) {
    const result = {};
    if (!productLevel) return result;

    const dir = path.join(productLevel, 'document');
    if (!fs.existsSync(dir)) return result;

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return result; }

    for (const e of entries) {
        if (!e.isDirectory()) continue;
        const docName = e.name;
        const tPath = path.join(dir, docName, 'translation', 'translation.csv');
        if (!fs.existsSync(tPath)) continue;
        try {
            const csv = parseCsv(stripBom(fs.readFileSync(tPath, 'utf8')));
            const idx = indexOf(csv.header);
            for (const row of csv.rows) {
                if (row[idx['ItemType']] === 'rootConfiguration' &&
                    row[idx['ConfigurationName']] === docName) {
                    const ru = row[idx['Translation_ru-RU']];
                    if (ru) { result[docName] = ru; break; }
                }
            }
        } catch (err) {
            console.error('document title parse error:', docName, err);
        }
    }
    return result;
}

function ensureDir(p) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadData(ctx) {
    const { flowPath, configPath, transPath } = ctx;

    ctx.flow = fs.existsSync(flowPath)
        ? JSON.parse(stripBom(fs.readFileSync(flowPath, 'utf8')))
        : { processType: 'Policy', initialState: '', actors: [], states: [], transitions: [] };

    ctx.config = fs.existsSync(configPath)
        ? JSON.parse(stripBom(fs.readFileSync(configPath, 'utf8')))
        : {
            attachments: [
                { attachmentType: 'Application', flow: 'Incoming' },
                { attachmentType: 'UnderwritingDecision', flow: 'Incoming' },
                { attachmentType: 'Contract', flow: 'Incoming' },
                { attachmentType: 'OtherDocument', flow: 'Incoming' }
            ],
            states: []
        };

    ctx.csv = fs.existsSync(transPath)
        ? parseCsv(stripBom(fs.readFileSync(transPath, 'utf8')))
        : {
            header: [
                'ConfigurationType', 'ConfigurationName', 'ItemType', 'TranslationKey',
                'Expression', 'Translation_en-US', 'Translation_ru-RU'
            ],
            rows: [], trailingNewline: true
        };

    const uiPath = path.join(path.dirname(flowPath), 'documentFlow.ui.json');
    ctx.uiPath = uiPath;
    if (fs.existsSync(uiPath)) {
        try {
            ctx.ui = JSON.parse(stripBom(fs.readFileSync(uiPath, 'utf8')));
            if (!Array.isArray(ctx.ui)) ctx.ui = [];
        } catch (e) {
            console.error('documentFlow.ui.json parse error:', e);
            ctx.ui = [];
        }
    } else {
        ctx.ui = [];
    }

    // authorization.csv
    ctx.authPath = findAuthorizationPath(flowPath);
    if (ctx.authPath) {
        try {
            ctx.auth = parseCsv(stripBom(fs.readFileSync(ctx.authPath, 'utf8')));
        } catch (e) {
            console.error('authorization.csv parse error:', e);
            ctx.auth = null;
            ctx.authPath = null;
        }
    } else {
        ctx.auth = null;
    }

    // product-level: documentRelation + список документов
    ctx.productLevel = findProductLevel(flowPath);
    ctx.relations = loadRelations(ctx.productLevel);
    ctx.documentNames = loadDocumentNames(ctx.productLevel);
    ctx.documentTitles = loadDocumentTitles(ctx.productLevel);
}

function writeAll(ctx) {
    const { flowPath, configPath, transPath, flow, config, csv } = ctx;
    ensureDir(flowPath);
    ensureDir(configPath);
    ensureDir(transPath);
    fs.writeFileSync(flowPath, JSON.stringify(flow, null, 4) + '\n', 'utf8');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4) + '\n', 'utf8');
    fs.writeFileSync(transPath, serializeCsv(csv), 'utf8');
}

function writeFlow(ctx) {
    fs.writeFileSync(ctx.flowPath, JSON.stringify(ctx.flow, null, 4) + '\n', 'utf8');
}

function writeUi(ctx) {
    fs.writeFileSync(ctx.uiPath, JSON.stringify(ctx.ui || [], null, 4) + '\n', 'utf8');
}

function writeAuth(ctx) {
    if (!ctx.authPath || !ctx.auth) return;
    fs.writeFileSync(ctx.authPath, serializeCsv(ctx.auth), 'utf8');
}

function writeConfig(ctx) {
    fs.writeFileSync(ctx.configPath, JSON.stringify(ctx.config, null, 4) + '\n', 'utf8');
}

function pushRender(ctx, panel) {
    if (!panel || !ctx) return;
    const { flow, config, csv, ui, extensionUri, flowPath, authPath, auth } = ctx;

    const trans = buildTranslations(csv);
    const meta = buildMeta(flow, config, csv, trans);
    const rows = buildTable(flow, config, trans);
    const details = buildStateDetails(flow, config, trans);
    const graph = buildGraph(flow, ui, trans);
    const hasUi = Array.isArray(ui) && ui.length > 0;
    const authMeta = buildAuthMeta(flowPath, auth, authPath);
    const relMeta = buildRelationsMeta(ctx, flow, ctx.documentTitles || {});

    panel.webview.html = renderHtml(
        panel.webview, extensionUri, rows, meta, details, graph, hasUi,
        authMeta, relMeta
    );
}

module.exports = {
    resolveRoot, findFileByName, findAuthorizationPath, findProductLevel,
    loadData, writeAll, writeFlow, writeUi, writeAuth, writeConfig, pushRender
};