const path = require('path');
const { indexOf } = require('./utils');

// { states: { name: {lang: value} }, transitions: {...}, actors: {...} }
function buildTransMap(csv) {
    const map = { states: {}, transitions: {}, actors: {} };
    if (!csv || !csv.header || !csv.rows) return map;
    const idx = indexOf(csv.header);

    const langCols = [];
    for (let c = 0; c < csv.header.length; c++) {
        const m = /^Translation_(.+)$/.exec(csv.header[c]);
        if (!m) continue;
        langCols.push({ lang: m[1], col: c });
    }

    for (const row of csv.rows) {
        const type = row[idx['ItemType']];
        const key = row[idx['TranslationKey']];

        let bucket, name;
        if (type === 'states' && key && String(key).startsWith('states@')) {
            bucket = 'states'; name = key.slice('states@'.length);
        } else if (type === 'transitions' && key) {
            const m = String(key).match(/^transitions@(.+?)@Title$/);
            if (!m) continue;
            bucket = 'transitions'; name = m[1];
        } else if (type === 'actors') {
            bucket = 'actors'; name = key;
        } else continue;

        if (!name) continue;
        if (!map[bucket][name]) map[bucket][name] = {};
        for (const { lang, col } of langCols) {
            const v = row[col];
            if (v) map[bucket][name][lang] = v;
        }
        if (!map[bucket][name]['en-US']) map[bucket][name]['en-US'] = name;
    }
    return map;
}

function getFlowName(ctx) {
    if (!ctx.csv || !ctx.csv.header || !ctx.csv.rows) return null;
    const idx = indexOf(ctx.csv.header);
    for (const row of ctx.csv.rows) {
        if (row[idx['ItemType']] === 'states' &&
            String(row[idx['TranslationKey']] || '').startsWith('states@')) {
            return row[idx['ConfigurationName']] || null;
        }
    }
    return null;
}

function stateActorsByName(config) {
    const map = {};
    for (const s of (config.states || [])) {
        if (!s || !s.name) continue;
        map[s.name] = {};
        for (const a of (s.actors || [])) {
            if (a && a.actor) map[s.name][a.actor] = a;
        }
    }
    return map;
}

function actorOpsNames(a) {
    const out = new Set();
    for (const o of (a.operations || [])) {
        const n = (typeof o === 'string') ? o : (o && o.name);
        if (n) out.add(n);
    }
    return out;
}

function actorTransitionsNames(a) {
    const out = new Set();
    for (const t of (a.transitions || [])) {
        const n = (typeof t === 'string') ? t : (t && t.name);
        if (n) out.add(n);
    }
    return out;
}

function actorAttachmentsMap(a) {
    const out = {};
    for (const r of (a.attachmentsRestrictions || [])) {
        if (!r || !r.attachmentType) continue;
        out[r.attachmentType] = Array.isArray(r.permissions) ? r.permissions.slice() : [];
    }
    return out;
}

function diffSets(curSet, othSet) {
    const added = [];
    const removed = [];
    for (const x of othSet) if (!curSet.has(x)) added.push(x);
    for (const x of curSet) if (!othSet.has(x)) removed.push(x);
    return { added, removed };
}

function diffAttachments(curMap, othMap) {
    const added = [];
    const removed = [];
    const changed = [];
    for (const t of Object.keys(othMap)) if (!(t in curMap)) added.push(t);
    for (const t of Object.keys(curMap)) if (!(t in othMap)) removed.push(t);
    for (const t of Object.keys(othMap)) {
        if (!(t in curMap)) continue;
        const a = curMap[t].slice().sort();
        const b = othMap[t].slice().sort();
        if (a.join('|') !== b.join('|')) {
            changed.push({ type: t, current: curMap[t], other: othMap[t] });
        }
    }
    return { added, removed, changed };
}

function buildDiff(currentCtx, otherDoc) {
    const curFlow = currentCtx.flow || {};
    const othFlow = otherDoc.flow || {};
    const curConfig = currentCtx.config || {};
    const othConfig = otherDoc.config || {};

    const curTrans = buildTransMap(currentCtx.csv);
    const othTrans = buildTransMap(otherDoc.csv);

    // === States ===
    const curStates = {};
    for (const s of (curFlow.states || [])) if (s && s.name) curStates[s.name] = s;
    const othStates = {};
    for (const s of (othFlow.states || [])) if (s && s.name) othStates[s.name] = s;

    const curActors = stateActorsByName(curConfig);
    const othActors = stateActorsByName(othConfig);

    const statesOnlyInOther = [];
    const statesOnlyInCurrent = [];
    const statesDiffering = [];

    for (const name of Object.keys(othStates)) {
        if (!(name in curStates)) {
            statesOnlyInOther.push({
                name,
                isTerminal: !!othStates[name].isTerminal,
                trans: othTrans.states[name] || {}
            });
        }
    }
    for (const name of Object.keys(curStates)) {
        if (!(name in othStates)) {
            statesOnlyInCurrent.push({
                name,
                isTerminal: !!curStates[name].isTerminal,
                trans: curTrans.states[name] || {}
            });
        }
    }

    for (const name of Object.keys(curStates)) {
        if (!(name in othStates)) continue;
        const curS = curStates[name];
        const othS = othStates[name];

        const isTerminalCur = !!curS.isTerminal;
        const isTerminalOth = !!othS.isTerminal;

        const curStateActors = curActors[name] || {};
        const othStateActors = othActors[name] || {};

        const actorsOnlyInOther = [];
        const actorsOnlyInCurrent = [];
        const actorPermDiffs = [];

        for (const actorName of Object.keys(othStateActors)) {
            if (!(actorName in curStateActors)) actorsOnlyInOther.push(actorName);
        }
        for (const actorName of Object.keys(curStateActors)) {
            if (!(actorName in othStateActors)) actorsOnlyInCurrent.push(actorName);
        }

        for (const actorName of Object.keys(curStateActors)) {
            if (!(actorName in othStateActors)) continue;
            const a = curStateActors[actorName];
            const b = othStateActors[actorName];

            const diff = {
                actor: actorName,
                allowComments: (!!a.allowComments !== !!b.allowComments)
                    ? { current: !!a.allowComments, other: !!b.allowComments } : null,
                operations: diffSets(actorOpsNames(a), actorOpsNames(b)),
                transitions: diffSets(actorTransitionsNames(a), actorTransitionsNames(b)),
                attachments: diffAttachments(actorAttachmentsMap(a), actorAttachmentsMap(b))
            };

            const hasAny =
                diff.allowComments ||
                diff.operations.added.length || diff.operations.removed.length ||
                diff.transitions.added.length || diff.transitions.removed.length ||
                diff.attachments.added.length || diff.attachments.removed.length ||
                diff.attachments.changed.length;

            if (hasAny) actorPermDiffs.push(diff);
        }

        const hasAnyStateDiff =
            isTerminalCur !== isTerminalOth ||
            actorsOnlyInOther.length ||
            actorsOnlyInCurrent.length ||
            actorPermDiffs.length;

        if (hasAnyStateDiff) {
            statesDiffering.push({
                name,
                isTerminal: isTerminalCur !== isTerminalOth
                    ? { current: isTerminalCur, other: isTerminalOth } : null,
                actorsOnlyInOther,
                actorsOnlyInCurrent,
                actorPermDiffs
            });
        }
    }

    // === Transitions ===
    const curTr = {};
    for (const t of (curFlow.transitions || [])) if (t && t.name) curTr[t.name] = t;
    const othTr = {};
    for (const t of (othFlow.transitions || [])) if (t && t.name) othTr[t.name] = t;

    const transitionsOnlyInOther = [];
    const transitionsOnlyInCurrent = [];
    const transitionsDiffering = [];

    for (const name of Object.keys(othTr)) {
        if (!(name in curTr)) {
            const t = othTr[name];
            transitionsOnlyInOther.push({
                name,
                from: t.from,
                to: t.to,
                actionToRunBefore: t.actionToRunBefore || '',
                serverSideEvents: !!(t.broadcastEvent && t.broadcastEvent.serverSideEvents),
                allowOnValidationErrors: t.allowOnValidationErrors || null,
                trans: othTrans.transitions[name] || {}
            });
        }
    }
    for (const name of Object.keys(curTr)) {
        if (!(name in othTr)) {
            const t = curTr[name];
            transitionsOnlyInCurrent.push({
                name,
                from: t.from,
                to: t.to,
                actionToRunBefore: t.actionToRunBefore || '',
                serverSideEvents: !!(t.broadcastEvent && t.broadcastEvent.serverSideEvents),
                allowOnValidationErrors: t.allowOnValidationErrors || null,
                trans: curTrans.transitions[name] || {}
            });
        }
    }
    for (const name of Object.keys(curTr)) {
        if (!(name in othTr)) continue;
        const a = curTr[name];
        const b = othTr[name];
        const seA = !!(a.broadcastEvent && a.broadcastEvent.serverSideEvents);
        const seB = !!(b.broadcastEvent && b.broadcastEvent.serverSideEvents);
        const aoveA = JSON.stringify(a.allowOnValidationErrors || null);
        const aoveB = JSON.stringify(b.allowOnValidationErrors || null);
        const atrA = a.actionToRunBefore || '';
        const atrB = b.actionToRunBefore || '';

        const diff = {
            name,
            from: a.from !== b.from ? { current: a.from, other: b.from } : null,
            to: a.to !== b.to ? { current: a.to, other: b.to } : null,
            actionToRunBefore: atrA !== atrB ? { current: atrA, other: atrB } : null,
            serverSideEvents: seA !== seB ? { current: seA, other: seB } : null,
            allowOnValidationErrors: aoveA !== aoveB
                ? { current: a.allowOnValidationErrors || null, other: b.allowOnValidationErrors || null }
                : null
        };
        if (diff.from || diff.to || diff.actionToRunBefore || diff.serverSideEvents || diff.allowOnValidationErrors) {
            transitionsDiffering.push(diff);
        }
    }

    // === Global actors ===
    const curGA = new Set(curFlow.actors || []);
    const othGA = new Set(othFlow.actors || []);
    const globalActorsOnlyInOther = [];
    const globalActorsOnlyInCurrent = [];
    for (const a of othGA) if (!curGA.has(a)) globalActorsOnlyInOther.push(a);
    for (const a of curGA) if (!othGA.has(a)) globalActorsOnlyInCurrent.push(a);

    // === Doc attachments ===
    const curAtt = new Set((curConfig.attachments || []).map(x => x.attachmentType).filter(Boolean));
    const othAtt = new Set((othConfig.attachments || []).map(x => x.attachmentType).filter(Boolean));
    const docAttOnlyInOther = [];
    const docAttOnlyInCurrent = [];
    for (const a of othAtt) if (!curAtt.has(a)) docAttOnlyInOther.push(a);
    for (const a of curAtt) if (!othAtt.has(a)) docAttOnlyInCurrent.push(a);

    // === initialState ===
    const initCur = curFlow.initialState || '';
    const initOth = othFlow.initialState || '';

    return {
        current: {
            docName: path.basename(path.dirname(currentCtx.flowPath)),
            flowName: getFlowName(currentCtx)
        },
        other: {
            docName: otherDoc.docName,
            flowName: otherDoc.flowName,
            flowPath: otherDoc.flowPath
        },
        states: {
            onlyInOther: statesOnlyInOther,
            onlyInCurrent: statesOnlyInCurrent,
            differing: statesDiffering
        },
        transitions: {
            onlyInOther: transitionsOnlyInOther,
            onlyInCurrent: transitionsOnlyInCurrent,
            differing: transitionsDiffering
        },
        globalActors: {
            onlyInOther: globalActorsOnlyInOther,
            onlyInCurrent: globalActorsOnlyInCurrent
        },
        docAttachments: {
            onlyInOther: docAttOnlyInOther,
            onlyInCurrent: docAttOnlyInCurrent
        },
        initialState: initCur !== initOth
            ? { current: initCur, other: initOth } : null
    };
}

module.exports = { buildDiff };