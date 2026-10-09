const { indexOf } = require('./utils');

/* Размер прямоугольника состояния (текст внутри). */
const SVG_STATE_W = 160;
const SVG_STATE_H = 50;

/* ============================================================
 * ORTHOGONAL ROUTING (прямые углы + обход препятствий)
 * ============================================================ */
function rectsIntersect(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x ||
        a.y + a.h < b.y || b.y + b.h < a.y);
}

function pointOnEdge(rect, towardX, towardY) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dx = towardX - cx;
    const dy = towardY - cy;
    const horiz = Math.abs(dx) * rect.h > Math.abs(dy) * rect.w;
    if (horiz) return { x: dx > 0 ? rect.x + rect.w : rect.x, y: cy };
    return { x: cx, y: dy > 0 ? rect.y + rect.h : rect.y };
}

/* ============================================================
 * TRANSLATIONS / META
 * ============================================================ */
function buildTranslations(csv) {
    const stateTrans = {}, transTrans = {}, opTrans = {};
    const idx = indexOf(csv.header);
    for (const row of csv.rows) {
        const type = row[idx['ItemType']];
        const key = row[idx['TranslationKey']];
        const ru = row[idx['Translation_ru-RU']];
        if (!ru) continue;

        if (type === 'states' && key.startsWith('states@')) {
            stateTrans[key.slice('states@'.length)] = ru;
        } else if (type === 'transitions' && key.startsWith('transitions@')) {
            const m = key.match(/^transitions@(.+?)@Title$/);
            if (m) transTrans[m[1]] = ru;
        } else if (type === 'operations' && key.startsWith('operations@')) {
            const m = key.match(/^operations@(.+?)@Title$/);
            if (m) opTrans[m[1]] = ru;
        }
    }
    return { stateTrans, transTrans, opTrans };
}

function detectFlowName(csv) {
    const idx = indexOf(csv.header);
    for (const row of csv.rows) {
        if (row[idx['ItemType']] === 'states' &&
            String(row[idx['TranslationKey']] || '').startsWith('states@')) {
            return row[idx['ConfigurationName']];
        }
    }
    return 'UnknownFlow';
}

function buildMeta(flow, config, csv, trans) {
    const idx = indexOf(csv.header);

    const operations = new Set();
    for (const row of csv.rows) {
        if (row[idx['ItemType']] === 'operations') {
            const m = String(row[idx['TranslationKey']] || '').match(/^operations@(.+?)@Title$/);
            if (m) operations.add(m[1]);
        }
    }
    for (const s of (config.states || [])) {
        for (const a of (s.actors || [])) {
            for (const op of (a.operations || [])) {
                const n = normalizeOperationName(op);
                if (n) operations.add(n);
            }
        }
    }
    if (!operations.size) operations.add('Save');

    const attachmentTypes = new Set((config.attachments || []).map(a => a.attachmentType));
    ['Application', 'UnderwritingDecision', 'Contract', 'OtherDocument']
        .forEach(t => attachmentTypes.add(t));

    const actorsSet = new Set();
    if (Array.isArray(flow.actors)) for (const a of flow.actors) if (a) actorsSet.add(a);
    if (Array.isArray(config.actors)) for (const a of config.actors) if (a) actorsSet.add(a);
    for (const s of (config.states || [])) {
        for (const a of (s.actors || [])) if (a && a.actor) actorsSet.add(a.actor);
    }
    for (const row of csv.rows) {
        if (row[idx['ItemType']] === 'actors') {
            const name = row[idx['TranslationKey']] || row[idx['Expression']];
            if (name) actorsSet.add(name);
        }
    }

    return {
        actors: [...actorsSet],
        operations: [...operations],
        attachments: [...attachmentTypes],
        states: (flow.states || []).map(s => s.name),
        translations: trans
    };
}


function buildAuthMeta(flowPath, authCsv, authPath) {
    const path = require('path');
    const docName = path.basename(path.dirname(flowPath));

    if (!authCsv || !authCsv.rows || !authCsv.header || !authCsv.header.length) {
        return {
            found: false,
            docName,
            path: null,
            rows: [],
            allRoles: []
        };
    }

    const idx = indexOf(authCsv.header);
    const rows = [];
    const rolesSet = new Set();

    for (let r = 0; r < authCsv.rows.length; r++) {
        const row = authCsv.rows[r];
        const appRole = row[idx['ApplicationRole']];
        if (appRole) rolesSet.add(appRole);

        const codeName = row[idx['CodeName']];
        const conceptType = row[idx['ConceptTypeName']];
        const permType = row[idx['PermissionType']];

        if (codeName !== docName) continue;
        if (conceptType !== 'DocumentConfiguration') continue;
        if (permType !== 'Allow Actor') continue;

        rows.push({
            origIndex: r,
            role: appRole || '',
            actor: row[idx['AssignedPermission']] || '',
            op: row[idx['AssignmentOperator']] || 'Add'
        });
    }

    return {
        found: true,
        docName,
        path: authPath || null,
        rows,
        allRoles: [...rolesSet].sort()
    };
}

function buildRelationsMeta(ctx, flow, documentTitles) {
    const path = require('path');
    const docName = path.basename(path.dirname(ctx.flowPath));
    const docStates = (flow.states || []).map(s => s.name);
    const docActors = flow.actors || [];
    const knownDocs = ctx.documentNames || [];
    const titles = documentTitles || {};

    const relations = [];

    for (const r of (ctx.relations || [])) {
        const isOutgoing = (r.sourceDocument === docName);
        const isIncoming = (r.targetDocument === docName);

        // Оставляем только те, где участвует наш документ.
        // Остальное — чужие связи, нам не интересны.
        if (!isOutgoing && !isIncoming) continue;

        const issues = [];

        // Проверяем только исходящие — они «наши», мы за них отвечаем.
        if (isOutgoing) {
            if (r.sourceDocument && !knownDocs.includes(r.sourceDocument)) {
                issues.push('sourceDocument «' + r.sourceDocument + '» не найден ни в одном @config-*/document/');
            }
            if (r.targetDocument && !knownDocs.includes(r.targetDocument)) {
                issues.push('targetDocument «' + r.targetDocument + '» не найден ни в одном @config-*/document/');
            }
            for (const st of (r.sourceDocumentStates || [])) {
                if (!docStates.includes(st.name)) {
                    issues.push('Состояние «' + st.name + '» отсутствует в ' + docName);
                }
                for (const a of (st.actors || [])) {
                    if (!docActors.includes(a)) {
                        issues.push('Актор «' + a + '» отсутствует в ' + docName);
                    }
                }
            }
        }

        if (r.duplicateAcrossPackages && r.duplicateAcrossPackages.length > 1) {
            issues.push('Дублируется в пакетах: ' + r.duplicateAcrossPackages.join(', '));
        }

        relations.push({
            name: r.name,
            path: r.path,
            pkgName: r.pkgName || r.originPackage || null,
            isCurrentPackage: !!r.isCurrentPackage,
            duplicateAcrossPackages: r.duplicateAcrossPackages || null,
            overrides: r.overrides || null,
            sourceDocument: r.sourceDocument,
            sourceDocumentVersion: r.sourceDocumentVersion,
            sourceDocumentStates: r.sourceDocumentStates,
            actionToRunBefore: r.actionToRunBefore,
            targetDocument: r.targetDocument,
            targetDocumentVersion: r.targetDocumentVersion,
            targetDocumentTitle: titles[r.targetDocument] || r.targetDocument,
            targetState: r.targetState,
            keywords: r.keywords,
            isOutgoing,
            isIncoming,
            isMine: isOutgoing, // оставлено для совместимости со старым UI
            issues
        });
    }

    // Сортировка: текущий пакет → исходящие → по имени.
    relations.sort((a, b) => {
        if (a.isCurrentPackage !== b.isCurrentPackage) return a.isCurrentPackage ? -1 : 1;
        if (a.isOutgoing !== b.isOutgoing) return a.isOutgoing ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return {
        docName,
        path: ctx.productLevel ? path.join(ctx.productLevel, 'documentRelation') : null,
        projectRoot: ctx.projectRoot || null,
        relations
    };
}

/* ============================================================
 * TABLE
 * ============================================================ */
function normalizeOperationName(o) {
    if (!o) return null;
    if (typeof o === 'string') return o;
    return o.name || null;
}

function normalizeTransitionName(t) {
    if (!t) return null;
    if (typeof t === 'string') return t;
    return t.name || null;
}

function normalizeFlowOperations(ops) {
    if (!Array.isArray(ops)) return undefined;
    return ops.map(o => {
        if (typeof o === 'string') {
            return { name: o, exclusiveToAssignedUser: false };
        }
        return {
            name: o.name,
            exclusiveToAssignedUser: !!o.exclusiveToAssignedUser
        };
    });
}

function buildTable(flow, config, trans) {
    const states = (flow.states || []).map(s => s.name);
    const transitions = flow.transitions || [];
    const flagsByState = {};
    for (const s of (flow.states || [])) flagsByState[s.name] = { isTerminal: !!s.isTerminal };

    return states.map(state => {
        const stRu = trans.stateTrans[state] || state;
        const stateLabel = `${state} (${stRu})`;

        const outMap = new Map();
        for (const t of transitions) {
            if (t.from !== state) continue;
            if (!outMap.has(t.to)) outMap.set(t.to, []);
            outMap.get(t.to).push({ name: t.name, ru: trans.transTrans[t.name] || t.name });
        }
        const outgoing = [...outMap.entries()].map(([st, trs]) => ({
            state: st, stateRu: trans.stateTrans[st] || st, transitions: trs
        }));

        const inMap = new Map();
        for (const t of transitions) {
            if (t.to !== state) continue;
            if (!inMap.has(t.from)) inMap.set(t.from, []);
            inMap.get(t.from).push({ name: t.name, ru: trans.transTrans[t.name] || t.name });
        }
        const incoming = [...inMap.entries()].map(([st, trs]) => ({
            state: st, stateRu: trans.stateTrans[st] || st, transitions: trs
        }));

        const configState = (config.states || []).find(s => s.name === state);
        const perms = [];
        if (configState && Array.isArray(configState.actors)) {
            for (const a of configState.actors) {
                perms.push({
                    actor: a.actor,
                    allowComments: !!a.allowComments,
                    operations: (a.operations || [])
                        .map(normalizeOperationName)
                        .filter(Boolean),
                    transitions: (a.transitions || [])
                        .map(t => {
                            const n = normalizeTransitionName(t);
                            return n ? { name: n, ru: trans.transTrans[n] || n } : null;
                        })
                        .filter(Boolean),
                    attachments: (a.attachmentsRestrictions || []).map(ar => ({
                        type: ar.attachmentType, permissions: ar.permissions || []
                    }))
                });
            }
        }
        return { stateName: state, stateLabel, incoming, outgoing, perms, flags: flagsByState[state] };
    });
}

function buildStateDetails(flow, config, trans) {
    const details = {};
    for (const s of (flow.states || [])) {
        const name = s.name;
        const ru = trans.stateTrans[name] || name;

        const outgoing = (flow.transitions || [])
            .filter(t => t.from === name)
            .map(t => ({ name: t.name, to: t.to, ru: trans.transTrans[t.name] || t.name }));

        const incoming = (flow.transitions || [])
            .filter(t => t.to === name)
            .map(t => ({ name: t.name, from: t.from, ru: trans.transTrans[t.name] || t.name }));

        const cs = (config.states || []).find(x => x.name === name);
        const permissions = ((cs && cs.actors) || []).map(a => {
            const attachments = {};
            for (const ar of (a.attachmentsRestrictions || [])) {
                attachments[ar.attachmentType] = ar.permissions || [];
            }
            return {
                actor: a.actor,
                allowComments: !!a.allowComments,
                operations: (a.operations || [])
                    .map(o => {
                        const n = normalizeOperationName(o);
                        if (!n) return null;
                        const ex = (typeof o === 'object' && o) ? !!o.exclusiveToAssignedUser : false;
                        return { name: n, exclusiveToAssignedUser: ex };
                    })
                    .filter(Boolean),
                transitions: (a.transitions || [])
                    .map(normalizeTransitionName)
                    .filter(Boolean),
                attachments
            };
        });

        details[name] = { ru, isTerminal: !!s.isTerminal, outgoing, incoming, permissions };
    }
    return details;
}

/* ============================================================
 * GRAPH
 * ============================================================ */
function buildGraph(flow, ui, trans, ctx) {
    const uiStates = {};
    const uiWaypoints = {};

    if (Array.isArray(ui)) {
        for (const item of ui) {
            if (!item || typeof item.id !== 'string') continue;
            if (item.id.startsWith('state_')) {
                const name = item.id.slice('state_'.length);
                const b = item.bounds || {};
                const w0 = typeof b.width === 'number' ? b.width : 40;
                const h0 = typeof b.height === 'number' ? b.height : 40;
                const cx = (typeof b.x === 'number' ? b.x : 0) + w0 / 2;
                const cy = (typeof b.y === 'number' ? b.y : 0) + h0 / 2;
                uiStates[name] = { cx, cy };
            } else if (item.id.startsWith('transition_')) {
                const name = item.id.slice('transition_'.length);
                if (Array.isArray(item.waypoints) && item.waypoints.length >= 2) {
                    uiWaypoints[name] = item.waypoints.map(w => ({ x: w.x, y: w.y }));
                }
            }
        }
    }

    const flowStates = (flow.states || []).map(s => s.name);
    const missing = flowStates.filter(n => !uiStates[n]);
    const cols = Math.max(1, Math.round(Math.sqrt(missing.length)));
    missing.forEach((name, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        uiStates[name] = { cx: 100 + col * 320, cy: 100 + row * 200 };
    });

    const states = flowStates.map(name => ({
        name,
        ru: trans.stateTrans[name] || name,
        x: uiStates[name].cx - 80,
        y: uiStates[name].cy - 25,
        w: 160, h: 50
    }));

    const transitions = (flow.transitions || []).map(t => {
        const manualWp = uiWaypoints[t.name] || null;
        return {
            name: t.name,
            from: t.from,
            to: t.to,
            ru: trans.transTrans[t.name] || t.name,
            actionToRunBefore: t.actionToRunBefore || '',
            actionToRunBeforeExists: (() => {
                if (!t.actionToRunBefore || !ctx) return true;
                const path = require('path');
                const fs = require('fs');
                const docName = path.basename(path.dirname(ctx.flowPath));
                const p = path.join(ctx.productLevel, 'document', docName, 'UI', 'ClientAction', t.actionToRunBefore + '.js');
                return fs.existsSync(p);
            })(),
            serverSideEvents: !!(t.broadcastEvent && t.broadcastEvent.serverSideEvents),
            allowOnValidationErrors: t.allowOnValidationErrors || null,
            manual: !!manualWp,
            manualWaypoints: manualWp
        };
    });

    return { states, transitions, initialState: flow.initialState || null };
}

/* ============================================================
 * ACTOR CONFIG
 * ============================================================ */
function buildActorConfig(p) {
    const actor = { actor: p.actor };
    if (p.allowComments) actor.allowComments = true;

    const ops = (p.operations || []).map(o => {
        if (typeof o === 'string') {
            return { name: o, exclusiveToAssignedUser: false };
        }
        return {
            name: o.name,
            exclusiveToAssignedUser: !!o.exclusiveToAssignedUser
        };
    });
    if (ops.length) actor.operations = ops;

    if (p.transitions && p.transitions.length) actor.transitions = p.transitions;

    const attachmentsRestrictions = Object.entries(p.attachments || {}).map(([type, perms]) => ({
        attachmentType: type,
        permissions: perms
    }));
    if (attachmentsRestrictions.length) actor.attachmentsRestrictions = attachmentsRestrictions;

    return actor;
}

function registerActorsInFlow(flow, permissions) {
    if (!Array.isArray(flow.actors)) return;
    for (const p of permissions || []) {
        if (!p.actor) continue;
        if (!flow.actors.includes(p.actor)) flow.actors.push(p.actor);
    }
}

/* ============================================================
 * EXPORTS
 * ============================================================ */
module.exports = {
    SVG_STATE_W, SVG_STATE_H,
    buildTranslations, detectFlowName, buildMeta,
    buildTable, buildStateDetails, buildGraph,
    buildActorConfig, registerActorsInFlow, buildAuthMeta, buildRelationsMeta,
    normalizeOperationName, normalizeTransitionName, normalizeFlowOperations
};