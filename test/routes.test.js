require('./helpers/mockVscode');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    findRouteDirs,
    findSinkGroupDirs,
    loadRouteConfig,
    collectRoutesForDoc
} = require('../src/routes');

/* ============================================================
 * Хелпер: временный проект с произвольными файлами в @config-*
 * ============================================================ */

function makeProject(pkgs) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adinsure-routes-'));
    for (const pkg of pkgs) {
        // pkg.name = "@config-x/y"
        const pkgDir = path.join(root, 'configuration', pkg.name);
        fs.mkdirSync(pkgDir, { recursive: true });
        fs.writeFileSync(path.join(pkgDir, 'package.json'),
            JSON.stringify({ name: pkg.name }), 'utf8');
        for (const f of pkg.files || []) {
            const full = path.join(pkgDir, f.path);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            const content = typeof f.content === 'string'
                ? f.content
                : JSON.stringify(f.content, null, 4);
            fs.writeFileSync(full, content, 'utf8');
        }
    }
    return {
        root,
        cleanup() { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } }
    };
}

// Эмулирует listConfigPackages — то, что storage передаёт в routes.js.
function listPkgs(projectRoot) {
    const cfgDir = path.join(projectRoot, 'configuration');
    if (!fs.existsSync(cfgDir)) return [];
    const out = [];
    for (const ns of fs.readdirSync(cfgDir, { withFileTypes: true })) {
        if (!ns.isDirectory() || !ns.name.startsWith('@config-')) continue;
        const nsPath = path.join(cfgDir, ns.name);
        for (const p of fs.readdirSync(nsPath, { withFileTypes: true })) {
            if (!p.isDirectory()) continue;
            const pkgDir = path.join(nsPath, p.name);
            if (!fs.existsSync(path.join(pkgDir, 'package.json'))) continue;
            out.push({ name: ns.name + '/' + p.name, dir: pkgDir, origin: 'configuration' });
        }
    }
    return out;
}

/* ============================================================
 * findRouteDirs
 * ============================================================ */

test('findRouteDirs: empty project → empty', () => {
    const p = makeProject([]);
    try { assert.deepEqual(findRouteDirs(listPkgs(p.root)), []); }
    finally { p.cleanup(); }
});

test('findRouteDirs: finds entity and document routes', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                { path: 'route/entity/RouteA/configuration.json', content: { entityType: 'Contract' } },
                { path: 'route/document/RouteB/configuration.json', content: { documentType: 'Policy' } }
            ]
        }
    ]);
    try {
        const dirs = findRouteDirs(listPkgs(p.root));
        assert.equal(dirs.length, 2);
        const names = dirs.map(d => d.kind + ':' + d.name).sort();
        assert.deepEqual(names, ['document:RouteB', 'entity:RouteA']);
    } finally { p.cleanup(); }
});

/* ============================================================
 * findSinkGroupDirs
 * ============================================================ */

test('findSinkGroupDirs: finds sink groups by name', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                { path: 'sinkGroup/GroupOne/configuration.json', content: { sinks: [] } },
                { path: 'sinkGroup/GroupTwo/configuration.json', content: { sinks: [] } }
            ]
        }
    ]);
    try {
        const sg = findSinkGroupDirs(listPkgs(p.root));
        assert.deepEqual(Object.keys(sg).sort(), ['GroupOne', 'GroupTwo']);
        assert.equal(sg.GroupOne.pkgName, '@config-x/a');
    } finally { p.cleanup(); }
});

/* ============================================================
 * loadRouteConfig
 * ============================================================ */

test('loadRouteConfig: parses condition/events/configuration.names', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                {
                    path: 'route/entity/R1/configuration.json',
                    content: {
                        entityType: 'Contract',
                        version: '1',
                        condition: {
                            events: ['StatusChanged', 'Updated'],
                            configuration: { names: ['DocA', 'DocB'] },
                            documentStates: ['S1']
                        },
                        sinks: [],
                        completionSinks: []
                    }
                }
            ]
        }
    ]);
    try {
        const [info] = findRouteDirs(listPkgs(p.root));
        const cfg = loadRouteConfig(info);
        assert.equal(cfg.entityType, 'Contract');
        assert.deepEqual(cfg.condition.events, ['StatusChanged', 'Updated']);
        assert.deepEqual(cfg.condition.configurationNames, ['DocA', 'DocB']);
        assert.deepEqual(cfg.condition.documentStates, ['S1']);
    } finally { p.cleanup(); }
});

/* ============================================================
 * collectRoutesForDoc
 * ============================================================ */

test('collectRoutesForDoc: filters by docName, sorts current first', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                {
                    path: 'route/entity/RouteForA/configuration.json',
                    content: {
                        entityType: 'Contract',
                        condition: { configuration: { names: ['DocA'] } },
                        sinks: []
                    }
                },
                {
                    path: 'route/entity/RouteForB/configuration.json',
                    content: {
                        entityType: 'Contract',
                        condition: { configuration: { names: ['DocB'] } },
                        sinks: []
                    }
                }
            ]
        }
    ]);
    try {
        const routes = collectRoutesForDoc(listPkgs(p.root), 'DocA');
        assert.equal(routes.length, 2);
        assert.equal(routes[0].name, 'RouteForA');
        assert.equal(routes[0].belongsToCurrent, true);
        assert.equal(routes[1].name, 'RouteForB');
        assert.equal(routes[1].belongsToCurrent, false);
    } finally { p.cleanup(); }
});

test('collectRoutesForDoc: resolves direct document sink with mapping', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                {
                    path: 'route/entity/R1/configuration.json',
                    content: {
                        entityType: 'Contract',
                        condition: { configuration: { names: ['DocA'] } },
                        sinks: [
                            { name: 'PrepareCtx', document: {} }
                        ]
                    }
                },
                {
                    path: 'route/entity/R1/sinkMappings/PrepareCtx/mapping.js',
                    content: 'module.exports = function(m, e) { return {}; };\n'
                }
            ]
        }
    ]);
    try {
        const [r] = collectRoutesForDoc(listPkgs(p.root), 'DocA');
        assert.equal(r.sinks.length, 1);
        assert.equal(r.sinks[0].kind, 'document');
        assert.equal(r.sinks[0].name, 'PrepareCtx');
        assert.ok(r.sinks[0].mapping);
        assert.equal(r.sinks[0].mapping.truncated, false);
    } finally { p.cleanup(); }
});

test('collectRoutesForDoc: resolves ref sink recursively', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                {
                    path: 'route/entity/R1/configuration.json',
                    content: {
                        entityType: 'Contract',
                        condition: { configuration: { names: ['DocA'] } },
                        sinks: [{ ref: 'MyGroup' }]
                    }
                },
                {
                    path: 'sinkGroup/MyGroup/configuration.json',
                    content: {
                        sinks: [
                            { name: 'InnerSink', document: {} }
                        ]
                    }
                },
                {
                    path: 'sinkGroup/MyGroup/sinkMappings/InnerSink/mapping.js',
                    content: 'module.exports = () => ({});\n'
                }
            ]
        }
    ]);
    try {
        const [r] = collectRoutesForDoc(listPkgs(p.root), 'DocA');
        assert.equal(r.sinks.length, 1);
        assert.equal(r.sinks[0].kind, 'ref');
        assert.equal(r.sinks[0].ref, 'MyGroup');
        assert.equal(r.sinks[0].found, true);
        assert.equal(r.sinks[0].children.length, 1);
        assert.equal(r.sinks[0].children[0].kind, 'document');
        assert.equal(r.sinks[0].children[0].name, 'InnerSink');
        assert.ok(r.sinks[0].children[0].mapping);
    } finally { p.cleanup(); }
});

test('collectRoutesForDoc: missing sinkGroup → found=false', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                {
                    path: 'route/entity/R1/configuration.json',
                    content: {
                        entityType: 'Contract',
                        condition: { configuration: { names: ['DocA'] } },
                        sinks: [{ ref: 'NoSuchGroup' }]
                    }
                }
            ]
        }
    ]);
    try {
        const [r] = collectRoutesForDoc(listPkgs(p.root), 'DocA');
        assert.equal(r.sinks[0].kind, 'ref');
        assert.equal(r.sinks[0].ref, 'NoSuchGroup');
        assert.equal(r.sinks[0].found, false);
    } finally { p.cleanup(); }
});

test('collectRoutesForDoc: completionSinks resolved too', () => {
    const p = makeProject([
        {
            name: '@config-x/a',
            files: [
                {
                    path: 'route/entity/R1/configuration.json',
                    content: {
                        entityType: 'Contract',
                        condition: { configuration: { names: ['DocA'] } },
                        sinks: [],
                        completionSinks: [
                            {
                                name: 'Transition1',
                                documentTransition: {
                                    transition: {
                                        configurationName: 'DocA',
                                        configurationVersion: '1'
                                    }
                                }
                            }
                        ]
                    }
                }
            ]
        }
    ]);
    try {
        const [r] = collectRoutesForDoc(listPkgs(p.root), 'DocA');
        assert.equal(r.completionSinks.length, 1);
        assert.equal(r.completionSinks[0].kind, 'documentTransition');
        assert.equal(r.completionSinks[0].name, 'Transition1');
    } finally { p.cleanup(); }
});