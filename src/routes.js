/**
 * Сканирование route-конфигураций и sinkGroup'ов в проекте Adinsure.
 *
 * route:      <pkg>/route/entity/<Name>/configuration.json
 *             <pkg>/route/document/<Name>/configuration.json
 * sinkGroup:  <pkg>/sinkGroup/<Name>/configuration.json
 * mapping:    <pkg>/sinkGroup/<Name>/sinkMappings/<SinkName>/mapping.js
 *             <pkg>/route/entity/<Name>/sinkMappings/<SinkName>/mapping.js
 *
 * Модуль не трогает ctx и не кэширует — чистые функции. Кэширование
 * делает storage.js (projectCache.routes).
 */
const fs = require('fs');
const path = require('path');
const { stripBom } = require('./utils');

const MAX_REF_DEPTH = 5;
const MAPPING_PREVIEW_BYTES = 4000;

/* ============================================================
 * Сканирование папок
 * ============================================================ */

function findRouteDirs(pkgs) {
    const out = [];
    for (const pkg of (pkgs || [])) {
        const routeRoot = path.join(pkg.dir, 'route');
        if (!fs.existsSync(routeRoot)) continue;
        for (const kind of ['entity', 'document']) {
            const kindDir = path.join(routeRoot, kind);
            if (!fs.existsSync(kindDir)) continue;
            let entries;
            try { entries = fs.readdirSync(kindDir, { withFileTypes: true }); }
            catch { continue; }
            for (const e of entries) {
                if (!e.isDirectory()) continue;
                const dir = path.join(kindDir, e.name);
                const cfg = path.join(dir, 'configuration.json');
                if (!fs.existsSync(cfg)) continue;
                out.push({
                    kind,
                    name: e.name,
                    path: cfg,
                    dir,
                    pkgName: pkg.name,
                    pkgOrigin: pkg.origin
                });
            }
        }
    }
    return out;
}

function findSinkGroupDirs(pkgs) {
    const out = {};
    for (const pkg of (pkgs || [])) {
        const sgRoot = path.join(pkg.dir, 'sinkGroup');
        if (!fs.existsSync(sgRoot)) continue;
        let entries;
        try { entries = fs.readdirSync(sgRoot, { withFileTypes: true }); }
        catch { continue; }
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            const dir = path.join(sgRoot, e.name);
            const cfg = path.join(dir, 'configuration.json');
            if (!fs.existsSync(cfg)) continue;
            // Приоритет configuration/ над node_modules/ — как в listConfigPackages.
            if (out[e.name] && out[e.name].pkgOrigin === 'configuration') continue;
            out[e.name] = {
                name: e.name,
                path: cfg,
                dir,
                pkgName: pkg.name,
                pkgOrigin: pkg.origin
            };
        }
    }
    return out;
}

/* ============================================================
 * Чтение файлов
 * ============================================================ */

function loadRouteConfig(routeInfo) {
    try {
        const raw = JSON.parse(stripBom(fs.readFileSync(routeInfo.path, 'utf8')));
        const cond = raw.condition || {};
        const condCfg = cond.configuration || {};
        return {
            kind: routeInfo.kind,
            name: routeInfo.name,
            path: routeInfo.path,
            dir: routeInfo.dir,
            pkgName: routeInfo.pkgName,
            pkgOrigin: routeInfo.pkgOrigin,
            entityType: raw.entityType || raw.documentType || null,
            version: raw.version != null ? String(raw.version) : null,
            allowMultipleTransactions: !!raw.allowMultipleTransactions,
            condition: {
                events: Array.isArray(cond.events) ? cond.events.slice() : [],
                configurationNames: Array.isArray(condCfg.names) ? condCfg.names.slice() : [],
                dimensions: (condCfg.dimensions && typeof condCfg.dimensions === 'object')
                    ? condCfg.dimensions : null,
                documentStates: Array.isArray(cond.documentStates) ? cond.documentStates.slice() : []
            },
            rawSinks: Array.isArray(raw.sinks) ? raw.sinks : [],
            rawCompletionSinks: Array.isArray(raw.completionSinks) ? raw.completionSinks : []
        };
    } catch (e) {
        console.error('[routes] parse failed:', routeInfo.path, e.message);
        return null;
    }
}

function readMappingFile(baseDir, sinkName) {
    if (!baseDir || !sinkName) return null;
    const p = path.join(baseDir, 'sinkMappings', sinkName, 'mapping.js');
    if (!fs.existsSync(p)) return null;
    try {
        const content = fs.readFileSync(p, 'utf8');
        const truncated = content.length > MAPPING_PREVIEW_BYTES;
        return {
            path: p,
            content: truncated ? content.slice(0, MAPPING_PREVIEW_BYTES) : content,
            truncated,
            size: content.length
        };
    } catch { return null; }
}

/* ============================================================
 * Резолв sinks (включая рекурсивные ref на sinkGroup)
 * ============================================================ */

function classifySink(s) {
    if (!s || typeof s !== 'object') return 'unknown';
    if (s.ref) return 'ref';
    if (s.notification) return 'notification';
    if (s.document) return 'document';
    if (s.etlService) return 'etlService';
    if (s.documentTransition) return 'documentTransition';
    if (s.fetch) return 'fetch';
    return 'unknown';
}

function resolveSinks(sinksArr, sinkGroupDirs, sourceDir, depth) {
    const out = [];
    for (const s of (sinksArr || [])) {
        if (!s || typeof s !== 'object') continue;
        const kind = classifySink(s);

        if (kind === 'ref') {
            const refName = s.ref;
            const sg = sinkGroupDirs[refName] || null;
            const entry = {
                kind: 'ref',
                ref: refName,
                pkgName: sg ? sg.pkgName : null,
                pkgOrigin: sg ? sg.pkgOrigin : null,
                found: !!sg,
                children: [],
                truncated: false,
                error: null
            };
            if (sg) {
                if (depth >= MAX_REF_DEPTH) {
                    entry.truncated = true;
                } else {
                    try {
                        const cfg = JSON.parse(stripBom(fs.readFileSync(sg.path, 'utf8')));
                        entry.children = resolveSinks(
                            Array.isArray(cfg.sinks) ? cfg.sinks : [],
                            sinkGroupDirs,
                            sg.dir,
                            depth + 1
                        );
                    } catch (e) {
                        entry.error = 'parse failed: ' + e.message;
                    }
                }
            }
            out.push(entry);
            continue;
        }

        if (kind === 'notification') {
            out.push({
                kind: 'notification',
                name: s.name || '',
                notificationName: (s.notification && s.notification.notificationName) || ''
            });
            continue;
        }

        if (kind === 'document') {
            out.push({
                kind: 'document',
                name: s.name || '',
                config: s.document,
                mapping: readMappingFile(sourceDir, s.name)
            });
            continue;
        }

        if (kind === 'etlService') {
            out.push({
                kind: 'etlService',
                name: s.name || '',
                config: s.etlService,
                mapping: readMappingFile(sourceDir, s.name)
            });
            continue;
        }

        if (kind === 'documentTransition') {
            out.push({
                kind: 'documentTransition',
                name: s.name || '',
                config: s.documentTransition,
                mapping: readMappingFile(sourceDir, s.name)
            });
            continue;
        }

        if (kind === 'fetch') {
            out.push({
                kind: 'fetch',
                name: s.name || '',
                config: s.fetch,
                mapping: readMappingFile(sourceDir, s.name)
            });
            continue;
        }

        out.push({
            kind: 'unknown',
            name: s.name || '',
            raw: s
        });
    }
    return out;
}

/* ============================================================
 * Главная функция: собрать маршруты для документа
 * ============================================================ */

function collectRoutesForDoc(pkgs, docName) {
    const routeInfos = findRouteDirs(pkgs);
    const sinkGroupDirs = findSinkGroupDirs(pkgs);
    const out = [];

    for (const info of routeInfos) {
        const cfg = loadRouteConfig(info);
        if (!cfg) continue;

        const belongsToCurrent = !!docName && cfg.condition.configurationNames.includes(docName);
        const sinks = resolveSinks(cfg.rawSinks, sinkGroupDirs, cfg.dir, 0);
        const completionSinks = resolveSinks(cfg.rawCompletionSinks, sinkGroupDirs, cfg.dir, 0);

        out.push({
            kind: cfg.kind,
            name: cfg.name,
            path: cfg.path,
            dir: cfg.dir,
            pkgName: cfg.pkgName,
            pkgOrigin: cfg.pkgOrigin,
            entityType: cfg.entityType,
            version: cfg.version,
            allowMultipleTransactions: cfg.allowMultipleTransactions,
            condition: cfg.condition,
            sinks,
            completionSinks,
            belongsToCurrent
        });
    }

    // Сначала маршруты текущего документа, потом остальные; внутри — по имени.
    out.sort((a, b) => {
        if (a.belongsToCurrent !== b.belongsToCurrent) return a.belongsToCurrent ? -1 : 1;
        if (a.pkgName !== b.pkgName) return (a.pkgName || '').localeCompare(b.pkgName || '');
        return a.name.localeCompare(b.name);
    });

    return out;
}

module.exports = {
    findRouteDirs,
    findSinkGroupDirs,
    loadRouteConfig,
    collectRoutesForDoc
};