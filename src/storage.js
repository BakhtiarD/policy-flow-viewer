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

// Корень проекта — папка с configuration/@config-* и/или node_modules/@config-*
function findProjectRoot(startPath) {
    let dir = path.resolve(startPath);
    try {
        if (fs.statSync(dir).isFile()) dir = path.dirname(dir);
    } catch { /* ignore */ }

    for (let i = 0; i < 12; i++) {
        const configDir = path.join(dir, 'configuration');
        if (fs.existsSync(configDir)) {
            try {
                const entries = fs.readdirSync(configDir);
                if (entries.some(e => e.startsWith('@config-'))) return dir;
            } catch { /* ignore */ }
        }
        const nmDir = path.join(dir, 'node_modules');
        if (fs.existsSync(nmDir)) {
            try {
                const entries = fs.readdirSync(nmDir);
                if (entries.some(e => e.startsWith('@config-'))) return dir;
            } catch { /* ignore */ }
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

// Список всех @config-* пакетов в корне проекта (configuration/ и node_modules/)
// Список всех @config-* пакетов в корне проекта (configuration/ и node_modules/).
// origin:
//   'configuration' — приоритетный (переопределения, рабочие версии);
//   'node_modules'  — базовый (поставляется извне, может быть переопределён).
function listConfigPackages(projectRoot) {
    if (!projectRoot) return [];
    const roots = [
        { dir: path.join(projectRoot, 'configuration'), origin: 'configuration' },
        { dir: path.join(projectRoot, 'node_modules'),  origin: 'node_modules'  }
    ];
    const out = [];

    for (const { dir: rootDir, origin } of roots) {
        if (!fs.existsSync(rootDir)) continue;
        let nsEntries;
        try { nsEntries = fs.readdirSync(rootDir, { withFileTypes: true }); }
        catch { continue; }

        for (const ns of nsEntries) {
            if (!ns.isDirectory()) continue;
            if (!ns.name.startsWith('@config-')) continue;
            const nsPath = path.join(rootDir, ns.name);
            let pkgEntries;
            try { pkgEntries = fs.readdirSync(nsPath, { withFileTypes: true }); }
            catch { continue; }
            for (const p of pkgEntries) {
                if (!p.isDirectory()) continue;
                const pkgDir = path.join(nsPath, p.name);
                if (!fs.existsSync(path.join(pkgDir, 'package.json'))) continue;
                out.push({
                    name: ns.name + '/' + p.name,
                    dir: pkgDir,
                    origin
                });
            }
        }
    }
    return out;
}

// Имя пакета из его package.json
function readPackageName(dir) {
    try {
        const p = path.join(dir, 'package.json');
        if (!fs.existsSync(p)) return null;
        const j = JSON.parse(stripBom(fs.readFileSync(p, 'utf8')));
        return j.name || null;
    } catch { return null; }
}

// Читает documentRelation/*/configuration.json из указанной папки
function loadRelationsFromDir(dir, originPackage) {
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
                originPackage: originPackage || null,
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
            console.error('documentRelation parse error:', originPackage || '-', e.name, err);
        }
    }
    return result;
}

// Собирает связи из текущего пакета + из всех @config-* пакетов проекта.
//
// Дедуп:
//   1. По realpath — если это физически один файл.
//   2. По (pkgName, relationName) — тот же самый documentRelation в том же пакете.
//      Так выглядит «дубль» configuration/.../@config-halyk/pnl-common vs
//      node_modules/.../@config-halyk/pnl-common — это НЕ ошибка, оставляем первый
//      (приоритет у текущего пакета / configuration/).
//
// Дубли с одинаковым relationName в РАЗНЫХ пакетах — это ошибка. Таким записям
// проставляется флаг duplicateAcrossPackages: [...список пакетов...].
// Собирает связи из текущего пакета + из всех @config-* пакетов проекта.
//
// Приоритет:
//   configuration/@config-*/...  — приоритетные (переопределяют base).
//   node_modules/@config-*/...   — базовые.
//
// Одноимённый documentRelation в configuration и в node_modules — это НЕ дубль,
// а override. Оставляем configuration-версию, в r.overrides — список базовых пакетов,
// которые она перекрыла.
//
// Настоящий дубль — одноимённые documentRelation в двух configuration-пакетах
// (или в двух node_modules-пакетах без configuration-версии). Помечается
// r.duplicateAcrossPackages = [...список пакетов...].
function loadAllRelations(projectRoot, currentPkgDir, currentPkgName) {
    const all = [];

    // 1. Текущий пакет — первым
    const curRels = loadRelationsFromDir(path.join(currentPkgDir, 'documentRelation'), currentPkgName);
    for (const r of curRels) {
        r.isCurrentPackage = true;
        r.pkgName = currentPkgName;
        r.pkgOrigin = 'configuration';
        all.push(r);
    }

    // 2. Остальные пакеты
    const pkgs = listConfigPackages(projectRoot);
    for (const pkg of pkgs) {
        if (pkg.dir === currentPkgDir) continue;
        const rels = loadRelationsFromDir(path.join(pkg.dir, 'documentRelation'), pkg.name);
        for (const r of rels) {
            r.isCurrentPackage = false;
            r.pkgName = pkg.name;
            r.pkgOrigin = pkg.origin;
            all.push(r);
        }
    }

    // Дедуп по realpath и по (pkgName, relName) — от физических дублей.
    const unique = [];
    const seenReal = new Set();
    const seenPkgRel = new Set();
    for (const r of all) {
        let real;
        try { real = fs.realpathSync(r.path); }
        catch { real = r.path; }
        if (seenReal.has(real)) continue;
        seenReal.add(real);

        const key = (r.pkgName || '') + '|' + r.name;
        if (seenPkgRel.has(key)) continue;
        seenPkgRel.add(key);

        unique.push(r);
    }

    // Дедуп override: при совпадении имени между configuration и node_modules
    // оставляем configuration; для node_modules-версии запоминаем,
    // кого она перекрыла (для будущего UI).
    const byName = new Map();
    for (const r of unique) {
        if (!byName.has(r.name)) byName.set(r.name, []);
        byName.get(r.name).push(r);
    }

    const final = [];
    for (const [, list] of byName) {
        const configVersions = list.filter(r => r.pkgOrigin === 'configuration');
        const nmVersions     = list.filter(r => r.pkgOrigin === 'node_modules');

        if (configVersions.length > 0) {
            // Побеждают configuration-версии.
            const winner = configVersions[0];
            winner.overrides = nmVersions.map(r => r.pkgName);

            // Реальный дубль — несколько configuration-версий.
            if (configVersions.length > 1) {
                const pkgs = configVersions.map(x => x.pkgName || '(unknown)');
                for (const r of configVersions) r.duplicateAcrossPackages = pkgs;
            }

            final.push(winner);
            // (остальные configuration-версии мы сейчас теряем, но у них уже
            //  проставлен duplicateAcrossPackages — этого достаточно для UI)
        } else {
            // Только node_modules-версии.
            const winner = nmVersions[0];
            if (nmVersions.length > 1) {
                const pkgs = nmVersions.map(x => x.pkgName || '(unknown)');
                for (const r of nmVersions) r.duplicateAcrossPackages = pkgs;
            }
            final.push(winner);
        }
    }

    return final;
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

// Собирает имена документов (папок в document/) из всех @config-* пакетов проекта.
// Дедуп по имени: если один и тот же документ есть в configuration/ и в
// node_modules/ — считаем один раз.
function loadAllDocumentNames(projectRoot) {
    if (!projectRoot) return [];
    const pkgs = listConfigPackages(projectRoot);
    const names = new Set();

    for (const pkg of pkgs) {
        const dir = path.join(pkg.dir, 'document');
        if (!fs.existsSync(dir)) continue;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { continue; }
        for (const e of entries) {
            if (e.isDirectory()) names.add(e.name);
        }
    }
    return [...names];
}

// Собирает RU-заголовки документов из всех @config-* пакетов проекта.
// onlyFor (Set<string>|null): если задан — читаем translation.csv только для
// этих документов, остальные игнорируем. Это сильно ускоряет скан, потому что
// заголовки обычно нужны только для targetDocument из relations.
function loadAllDocumentTitles(projectRoot, onlyFor) {
    const result = {};
    if (!projectRoot) return result;

    const wantFilter = (onlyFor instanceof Set) && onlyFor.size > 0;
    const pkgs = listConfigPackages(projectRoot);

    for (const pkg of pkgs) {
        const docRoot = path.join(pkg.dir, 'document');
        if (!fs.existsSync(docRoot)) continue;
        let entries;
        try { entries = fs.readdirSync(docRoot, { withFileTypes: true }); }
        catch { continue; }

        for (const e of entries) {
            if (!e.isDirectory()) continue;
            const docName = e.name;
            if (result[docName] !== undefined) continue;
            if (wantFilter && !onlyFor.has(docName)) continue;

            const tPath = path.join(docRoot, docName, 'translation', 'translation.csv');
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
                console.error('document title parse error:', pkg.name, docName, err);
            }
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
    ctx.projectRoot = findProjectRoot(flowPath);
    ctx.pkgName = readPackageName(ctx.productLevel);
    ctx.relations = loadAllRelations(ctx.projectRoot, ctx.productLevel, ctx.pkgName);

    // Документы — из всех @config-* пакетов проекта (а не только из текущего).
    ctx.documentNames = loadAllDocumentNames(ctx.projectRoot);

    // Заголовки читаем только для тех документов, что встречаются как
    // targetDocument в relations — это заметно ускоряет полный скан.
    const targetDocNames = new Set(
        (ctx.relations || []).map(r => r.targetDocument).filter(Boolean)
    );
    ctx.documentTitles = loadAllDocumentTitles(ctx.projectRoot, targetDocNames);
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
    const graph = buildGraph(flow, ui, trans, ctx);
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
    loadData, writeAll, writeFlow, writeUi, writeAuth, writeConfig, pushRender,
    findProjectRoot, listConfigPackages, readPackageName,
    loadRelationsFromDir, loadAllRelations,
    loadAllDocumentNames, loadAllDocumentTitles
};