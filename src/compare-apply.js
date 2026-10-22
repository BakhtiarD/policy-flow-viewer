const fs = require('fs');
const path = require('path');

const { stripBom, indexOf } = require('./utils');
const { parseCsv, serializeCsv } = require('./csv');
const { findProductLevel } = require('./storage');
const { flowRulePath, deleteFlowRule } = require('./flow-rules');
const { clientActionPath } = require('./client-actions');

function listCommonLangs(targetCsv, sourceCsv) {
    const pick = (csv) => {
        const out = [];
        if (!csv || !csv.header) return out;
        for (const h of csv.header) {
            const m = /^Translation_(.+)$/.exec(h);
            if (m) out.push(m[1]);
        }
        return out;
    };
    const t = new Set(pick(targetCsv));
    const s = pick(sourceCsv);
    return s.filter(l => t.has(l));
}

// Найти строку в csv по (itemType, translationKey). null если нет.
function findCsvRow(csv, itemType, translationKey) {
    if (!csv || !csv.header || !csv.rows) return null;
    const idx = indexOf(csv.header);
    for (const row of csv.rows) {
        if (row[idx['ItemType']] === itemType &&
            row[idx['TranslationKey']] === translationKey) return row;
    }
    return null;
}

// Скопировать перевод из sourceCsv в targetCsv для нового элемента.
// targetCsv мутируется. Если строки ещё нет — создаётся.
// en-US всегда = name (это код).
function copyTranslationForNew(targetCsv, sourceCsv, itemType, translationKey, name, flowName) {
    if (!targetCsv || !sourceCsv) return false;
    if (findCsvRow(targetCsv, itemType, translationKey)) return false;

    const srcRow = findCsvRow(sourceCsv, itemType, translationKey);

    const tIdx = indexOf(targetCsv.header);
    const row = new Array(targetCsv.header.length).fill('');
    row[tIdx['ConfigurationType']] = 'DocumentFlowDefinition';
    row[tIdx['ConfigurationName']] = flowName;
    row[tIdx['ItemType']] = itemType;
    row[tIdx['TranslationKey']] = translationKey;
    row[tIdx['Expression']] = name;
    row[tIdx['Translation_en-US']] = name;

    if (srcRow) {
        const sIdx = indexOf(sourceCsv.header);
        const langs = listCommonLangs(targetCsv, sourceCsv);
        for (const lang of langs) {
            const col = 'Translation_' + lang;
            if (lang === 'en-US') continue;
            if (!(col in tIdx) || !(col in sIdx)) continue;
            row[tIdx[col]] = srcRow[sIdx[col]] || '';
        }
    }

    targetCsv.rows.push(row);
    return true;
}

// Скопировать файл, если target отсутствует и source есть.
// Возвращает 'copied' | 'skipped' | 'missing-source'.
function copyFileIfMissing(srcPath, dstPath) {
    if (!srcPath || !fs.existsSync(srcPath)) return 'missing-source';
    if (fs.existsSync(dstPath)) return 'skipped';
    const dir = path.dirname(dstPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
    return 'copied';
}

// Применить выбранные действия. Мутирует currentCtx.flow / config / csv / auth / ui.
// Возвращает { applied, warnings, touched: { flowRules: [], clientActions: [], auth: bool } }.
function applyDiff(currentCtx, otherDoc, actions) {
    const result = { applied: 0, warnings: [], touched: { flowRules: [], clientActions: [], auth: false } };
    if (!Array.isArray(actions) || !actions.length) return result;

    const flow = currentCtx.flow;
    const config = currentCtx.config;
    const csv = currentCtx.csv;

    flow.states = flow.states || [];
    flow.transitions = flow.transitions || [];
    flow.actors = flow.actors || [];
    config.states = config.states || [];
    config.attachments = config.attachments || [];

    const othFlow = otherDoc.flow || {};
    const othConfig = otherDoc.config || {};

    const othStatesByName = {};
    for (const s of (othFlow.states || [])) if (s && s.name) othStatesByName[s.name] = s;

    const othTransByName = {};
    for (const t of (othFlow.transitions || [])) if (t && t.name) othTransByName[t.name] = t;

    const othConfigStatesByName = {};
    for (const s of (othConfig.states || [])) if (s && s.name) othConfigStatesByName[s.name] = s;

    const curDocName = path.basename(path.dirname(currentCtx.flowPath));
    const flowName = (() => {
        try {
            const idx = indexOf(csv.header);
            for (const row of csv.rows) {
                if (row[idx['ItemType']] === 'states' &&
                    String(row[idx['TranslationKey']] || '').startsWith('states@')) {
                    return row[idx['ConfigurationName']] || curDocName + 'Flow';
                }
            }
        } catch { /* ignore */ }
        return curDocName + 'Flow';
    })();

    const sourceProductLevel = findProductLevel(otherDoc.flowPath);
    const sourceDocName = path.basename(path.dirname(otherDoc.flowPath));

    // Порядок применения:
    // 1. Простые change* на переходах и состояниях (до удаления).
    // 2. change* на правах акторов.
    // 3. remove* для прав акторов (op, transition, attachment, actor from state).
    // 4. removeTransition / removeState (каскад — удаляем переходы, ui, flowRules).
    // 5. Добавления.
    // 6. removeGlobalActor — в самом конце, чтобы не оборвать ссылки.
    const ordered = actions.slice().sort((a, b) => {
        const rank = {
            changeInitialState: 1,
            changeStateTerminal: 1,
            changeTransitionFrom: 1,
            changeTransitionTo: 1,
            changeTransitionAction: 1,
            changeTransitionServerSide: 1,
            changeTransitionAOVE: 1,
            changeActorAllowComments: 2,
            changeActorAttachmentPerms: 2,
            removeActorOp: 3,
            removeActorTransition: 3,
            removeActorAttachment: 3,
            removeActorFromState: 4,
            removeTransition: 5,
            removeState: 6,
            addGlobalActor: 7,
            addState: 8,
            addActorToState: 9,
            addActorOp: 10,
            addActorTransition: 10,
            addActorAttachment: 10,
            addTransition: 11,
            removeDocAttachment: 12,
            addDocAttachment: 13,
            removeGlobalActor: 14
        };
        return (rank[a.kind] || 99) - (rank[b.kind] || 99);
    });

    // Хелпер: полное удаление перехода (flow, csv, ui, flowRules, config.transitions, actors[].transitions).
    function removeTransitionCascade(name) {
        const removed = { uiRemoved: 0, rulesRemoved: 0 };

        flow.transitions = (flow.transitions || []).filter(t => t.name !== name);

        const idx = indexOf(csv.header);
        const beforeCsv = csv.rows.length;
        csv.rows = csv.rows.filter(row => {
            if (row[idx['ItemType']] !== 'transitions') return true;
            const m = String(row[idx['TranslationKey']] || '').match(/^transitions@(.+?)@Title$/);
            return !(m && m[1] === name);
        });
        if (csv.rows.length !== beforeCsv) removed.csvRemoved = beforeCsv - csv.rows.length;

        if (currentCtx.ui && Array.isArray(currentCtx.ui)) {
            const before = currentCtx.ui.length;
            currentCtx.ui = currentCtx.ui.filter(it => it.id !== `transition_${name}`);
            if (currentCtx.ui.length !== before) removed.uiRemoved = before - currentCtx.ui.length;
        }

        if (config.transitions && typeof config.transitions === 'object' &&
            !Array.isArray(config.transitions) && config.transitions[name]) {
            delete config.transitions[name];
        }

        for (const s of (config.states || [])) {
            for (const a of (s.actors || [])) {
                if (Array.isArray(a.transitions)) {
                    a.transitions = a.transitions.filter(t => {
                        const n = (typeof t === 'string') ? t : (t && t.name);
                        return n !== name;
                    });
                }
            }
        }

        try {
            deleteFlowRule(currentCtx, name);
            removed.rulesRemoved = 1;
        } catch (e) {
            // нет файла или удалить не получилось — не фатально
        }

        return removed;
    }

    for (const a of ordered) {
        try {
            // ============ CHANGE ============

            if (a.kind === 'changeInitialState') {
                flow.initialState = a.payload.value || '';
                result.applied++;
            }
            else if (a.kind === 'changeStateTerminal') {
                const s = flow.states.find(x => x.name === a.payload.name);
                if (!s) { result.warnings.push('Состояние не найдено: ' + a.payload.name); continue; }
                if (a.payload.value) s.isTerminal = true; else delete s.isTerminal;
                result.applied++;
            }
            else if (a.kind === 'changeTransitionFrom') {
                const t = flow.transitions.find(x => x.name === a.payload.name);
                if (!t) { result.warnings.push('Переход не найден: ' + a.payload.name); continue; }
                t.from = a.payload.value;
                result.applied++;
            }
            else if (a.kind === 'changeTransitionTo') {
                const t = flow.transitions.find(x => x.name === a.payload.name);
                if (!t) { result.warnings.push('Переход не найден: ' + a.payload.name); continue; }
                t.to = a.payload.value;
                result.applied++;
            }
            else if (a.kind === 'changeTransitionAction') {
                const t = flow.transitions.find(x => x.name === a.payload.name);
                if (!t) { result.warnings.push('Переход не найден: ' + a.payload.name); continue; }
                const v = a.payload.value;
                if (v && String(v).trim()) t.actionToRunBefore = String(v).trim();
                else delete t.actionToRunBefore;
                result.applied++;
            }
            else if (a.kind === 'changeTransitionServerSide') {
                const t = flow.transitions.find(x => x.name === a.payload.name);
                if (!t) { result.warnings.push('Переход не найден: ' + a.payload.name); continue; }
                if (a.payload.value) t.broadcastEvent = { serverSideEvents: true };
                else delete t.broadcastEvent;
                result.applied++;
            }
            else if (a.kind === 'changeTransitionAOVE') {
                const t = flow.transitions.find(x => x.name === a.payload.name);
                if (!t) { result.warnings.push('Переход не найден: ' + a.payload.name); continue; }
                if (a.payload.value == null) delete t.allowOnValidationErrors;
                else t.allowOnValidationErrors = JSON.parse(JSON.stringify(a.payload.value));
                result.applied++;
            }
            else if (a.kind === 'changeActorAllowComments') {
                const { stateName, actorName, value } = a.payload;
                const cs = (config.states || []).find(s => s.name === stateName);
                const rec = cs && (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) { result.warnings.push('Актор не найден: ' + stateName + '/' + actorName); continue; }
                if (value) rec.allowComments = true; else delete rec.allowComments;
                result.applied++;
            }
            else if (a.kind === 'changeActorAttachmentPerms') {
                const { stateName, actorName, attachmentType, permissions } = a.payload;
                const cs = (config.states || []).find(s => s.name === stateName);
                const rec = cs && (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) { result.warnings.push('Актор не найден: ' + stateName + '/' + actorName); continue; }
                rec.attachmentsRestrictions = rec.attachmentsRestrictions || [];
                let r = rec.attachmentsRestrictions.find(x => x.attachmentType === attachmentType);
                if (!r) { r = { attachmentType, permissions: [] }; rec.attachmentsRestrictions.push(r); }
                r.permissions = Array.isArray(permissions) ? permissions.slice() : [];
                result.applied++;
            }

            // ============ REMOVE ============

            else if (a.kind === 'removeActorOp') {
                const { stateName, actorName, opName } = a.payload;
                const cs = (config.states || []).find(s => s.name === stateName);
                const rec = cs && (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) { result.warnings.push('Актор не найден: ' + stateName + '/' + actorName); continue; }
                rec.operations = (rec.operations || []).filter(o => {
                    const n = (typeof o === 'string') ? o : (o && o.name);
                    return n !== opName;
                });
                result.applied++;
            }
            else if (a.kind === 'removeActorTransition') {
                const { stateName, actorName, transitionName } = a.payload;
                const cs = (config.states || []).find(s => s.name === stateName);
                const rec = cs && (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) { result.warnings.push('Актор не найден: ' + stateName + '/' + actorName); continue; }
                rec.transitions = (rec.transitions || []).filter(t => {
                    const n = (typeof t === 'string') ? t : (t && t.name);
                    return n !== transitionName;
                });
                result.applied++;
            }
            else if (a.kind === 'removeActorAttachment') {
                const { stateName, actorName, attachmentType } = a.payload;
                const cs = (config.states || []).find(s => s.name === stateName);
                const rec = cs && (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) { result.warnings.push('Актор не найден: ' + stateName + '/' + actorName); continue; }
                rec.attachmentsRestrictions = (rec.attachmentsRestrictions || [])
                    .filter(r => r.attachmentType !== attachmentType);
                result.applied++;
            }
            else if (a.kind === 'removeActorFromState') {
                const { stateName, actorName } = a.payload;
                const cs = (config.states || []).find(s => s.name === stateName);
                if (!cs) { result.warnings.push('Состояние не найдено: ' + stateName); continue; }
                cs.actors = (cs.actors || []).filter(x => x.actor !== actorName);
                result.applied++;
            }
            else if (a.kind === 'removeTransition') {
                const name = a.payload.name;
                if (!(flow.transitions || []).some(t => t.name === name)) {
                    result.warnings.push('Переход уже отсутствует: ' + name);
                    continue;
                }
                removeTransitionCascade(name);
                result.applied++;
                result.touched.flowRules.push(name);
            }
            else if (a.kind === 'removeState') {
                const name = a.payload.name;
                if (!(flow.states || []).some(s => s.name === name)) {
                    result.warnings.push('Состояние уже отсутствует: ' + name);
                    continue;
                }
                // Каскад: удалить все переходы с этим состоянием
                const relatedTrs = (flow.transitions || [])
                    .filter(t => t.from === name || t.to === name)
                    .map(t => t.name);
                for (const trName of relatedTrs) {
                    removeTransitionCascade(trName);
                    result.touched.flowRules.push(trName);
                }
                flow.states = (flow.states || []).filter(s => s.name !== name);
                config.states = (config.states || []).filter(s => s.name !== name);
                const idx2 = indexOf(csv.header);
                csv.rows = csv.rows.filter(row => {
                    if (row[idx2['ItemType']] === 'states' &&
                        row[idx2['TranslationKey']] === `states@${name}`) return false;
                    return true;
                });
                if (currentCtx.ui && Array.isArray(currentCtx.ui)) {
                    currentCtx.ui = currentCtx.ui.filter(it => it.id !== `state_${name}`);
                }
                result.applied++;
            }
            else if (a.kind === 'removeDocAttachment') {
                const code = a.payload.code;
                config.attachments = (config.attachments || []).filter(x => x.attachmentType !== code);
                for (const s of (config.states || [])) {
                    for (const a2 of (s.actors || [])) {
                        if (Array.isArray(a2.attachmentsRestrictions)) {
                            a2.attachmentsRestrictions = a2.attachmentsRestrictions.filter(
                                r => r.attachmentType !== code
                            );
                        }
                    }
                }
                result.applied++;
            }
            else if (a.kind === 'removeGlobalActor') {
                const name = a.payload.name;
                flow.actors = (flow.actors || []).filter(x => x !== name);
                for (const s of (config.states || [])) {
                    s.actors = (s.actors || []).filter(x => x.actor !== name);
                }
                const idx3 = indexOf(csv.header);
                csv.rows = csv.rows.filter(row => {
                    if (row[idx3['ItemType']] !== 'actors') return true;
                    const key = row[idx3['TranslationKey']];
                    const expr = row[idx3['Expression']];
                    return key !== name && expr !== name;
                });
                // authorization.csv — убрать строки для этого актора в текущем документе
                if (currentCtx.auth) {
                    const aIdx = indexOf(currentCtx.auth.header);
                    const before = currentCtx.auth.rows.length;
                    currentCtx.auth.rows = currentCtx.auth.rows.filter(row => {
                        const assigned = row[aIdx['AssignedPermission']];
                        const codeName = row[aIdx['CodeName']];
                        const conceptType = row[aIdx['ConceptTypeName']];
                        const permType = row[aIdx['PermissionType']];
                        return !(assigned === name &&
                            codeName === curDocName &&
                            conceptType === 'DocumentConfiguration' &&
                            permType === 'Allow Actor');
                    });
                    if (currentCtx.auth.rows.length !== before) result.touched.auth = true;
                }
                result.applied++;
            }

            // ============ ADD ============

            else if (a.kind === 'addGlobalActor') {
                const name = a.payload.name;
                if (!name) continue;
                if (!flow.actors.includes(name)) {
                    flow.actors.push(name);
                    copyTranslationForNew(csv, otherDoc.csv, 'actors', name, name, flowName);
                    result.applied++;
                }
            }
            else if (a.kind === 'addState') {
                const name = a.payload.name;
                const othS = othStatesByName[name];
                if (!othS) continue;
                if (!flow.states.some(s => s.name === name)) {
                    const stObj = { name, operations: [] };
                    if (othS.isTerminal) stObj.isTerminal = true;
                    flow.states.push(stObj);
                    if (!config.states.some(s => s.name === name)) {
                        config.states.push({ name, actors: [] });
                    }
                    copyTranslationForNew(csv, otherDoc.csv, 'states', `states@${name}`, name, flowName);
                    result.applied++;
                }
            }
            else if (a.kind === 'addActorToState') {
                const { stateName, actorName } = a.payload;
                const othCs = othConfigStatesByName[stateName];
                if (!othCs) continue;
                const othActor = (othCs.actors || []).find(x => x.actor === actorName);
                if (!othActor) continue;
                let cs = config.states.find(s => s.name === stateName);
                if (!cs) { cs = { name: stateName, actors: [] }; config.states.push(cs); }
                cs.actors = cs.actors || [];
                if (!cs.actors.some(x => x.actor === actorName)) {
                    cs.actors.push(JSON.parse(JSON.stringify(othActor)));
                    result.applied++;
                }
            }
            else if (a.kind === 'addActorOp') {
                const { stateName, actorName, opName } = a.payload;
                const cs = config.states.find(s => s.name === stateName);
                if (!cs) continue;
                const rec = (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) continue;
                rec.operations = rec.operations || [];
                const has = rec.operations.some(o => {
                    const n = (typeof o === 'string') ? o : (o && o.name);
                    return n === opName;
                });
                if (!has) {
                    rec.operations.push({ name: opName, exclusiveToAssignedUser: false });
                    result.applied++;
                }
            }
            else if (a.kind === 'addActorTransition') {
                const { stateName, actorName, transitionName } = a.payload;
                const cs = config.states.find(s => s.name === stateName);
                if (!cs) continue;
                const rec = (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) continue;
                rec.transitions = rec.transitions || [];
                const has = rec.transitions.some(t => {
                    const n = (typeof t === 'string') ? t : (t && t.name);
                    return n === transitionName;
                });
                if (!has) {
                    rec.transitions.push(transitionName);
                    result.applied++;
                }
            }
            else if (a.kind === 'addActorAttachment') {
                const { stateName, actorName, attachmentType } = a.payload;
                const cs = config.states.find(s => s.name === stateName);
                if (!cs) continue;
                const rec = (cs.actors || []).find(x => x.actor === actorName);
                if (!rec) continue;
                rec.attachmentsRestrictions = rec.attachmentsRestrictions || [];
                const has = rec.attachmentsRestrictions.some(r => r.attachmentType === attachmentType);
                if (!has) {
                    const othCs = othConfigStatesByName[stateName];
                    const othActor = othCs && (othCs.actors || []).find(x => x.actor === actorName);
                    const othRestr = othActor && (othActor.attachmentsRestrictions || []).find(r => r.attachmentType === attachmentType);
                    const perms = othRestr && Array.isArray(othRestr.permissions)
                        ? othRestr.permissions.slice()
                        : ['Read'];
                    rec.attachmentsRestrictions.push({ attachmentType, permissions: perms });
                    result.applied++;
                }
            }
            else if (a.kind === 'addTransition') {
                const name = a.payload.name;
                const othT = othTransByName[name];
                if (!othT) continue;
                if (!flow.transitions.some(t => t.name === name)) {
                    const tr = { name, from: othT.from, to: othT.to };
                    if (othT.actionToRunBefore) tr.actionToRunBefore = othT.actionToRunBefore;
                    if (othT.broadcastEvent && othT.broadcastEvent.serverSideEvents) {
                        tr.broadcastEvent = { serverSideEvents: true };
                    }
                    if (othT.allowOnValidationErrors) {
                        tr.allowOnValidationErrors = JSON.parse(JSON.stringify(othT.allowOnValidationErrors));
                    }
                    flow.transitions.push(tr);
                    copyTranslationForNew(csv, otherDoc.csv, 'transitions',
                        `transitions@${name}@Title`, name, flowName);
                    result.applied++;

                    if (sourceProductLevel) {
                        const srcRulePath = path.join(sourceProductLevel, 'flowRules', name + '.js');
                        const dstRulePath = flowRulePath(currentCtx, name);
                        const s = copyFileIfMissing(srcRulePath, dstRulePath);
                        if (s === 'copied') result.touched.flowRules.push(name);
                    }

                    if (othT.actionToRunBefore && sourceProductLevel) {
                        const action = othT.actionToRunBefore;
                        const srcActPath = path.join(sourceProductLevel, 'document', sourceDocName,
                            'UI', 'ClientAction', action + '.js');
                        const dstActPath = clientActionPath(currentCtx, action);
                        const s = copyFileIfMissing(srcActPath, dstActPath);
                        if (s === 'copied') result.touched.clientActions.push(action);
                        else if (s === 'missing-source') {
                            result.warnings.push(
                                'ClientAction ' + action + '.js не найден в образце — переход скопирован без файла'
                            );
                        }
                    }
                }
            }
            else if (a.kind === 'addDocAttachment') {
                const code = a.payload.code;
                if (!code) continue;
                if (!config.attachments.some(x => x.attachmentType === code)) {
                    const othAtt = (othConfig.attachments || []).find(x => x.attachmentType === code);
                    config.attachments.push(othAtt ? JSON.parse(JSON.stringify(othAtt))
                        : { attachmentType: code, flow: 'Incoming' });
                    result.applied++;
                }
            }
            else {
                result.warnings.push('Неизвестное действие: ' + a.kind + ' (пропущено)');
            }
        } catch (e) {
            result.warnings.push('Ошибка при применении ' + a.kind + ': ' + e.message);
        }
    }

    // === Authorization ===
    // Для второго документа копируем строки Allow Actor с заменой CodeName.
    if (currentCtx.auth && currentCtx.authPath && otherDoc.auth) {
        const auth = currentCtx.auth;
        const aIdx = indexOf(auth.header);
        const oIdx = indexOf(otherDoc.auth.header);
        const othDocName = path.basename(path.dirname(otherDoc.flowPath));

        const existing = new Set();
        for (const row of auth.rows) {
            if (row[aIdx['CodeName']] === curDocName &&
                row[aIdx['ConceptTypeName']] === 'DocumentConfiguration' &&
                row[aIdx['PermissionType']] === 'Allow Actor') {
                existing.add(row[aIdx['ApplicationRole']] + '|' + row[aIdx['AssignedPermission']] + '|' +
                    (row[aIdx['AssignmentOperator']] || 'Add'));
            }
        }

        for (const row of otherDoc.auth.rows) {
            if (row[oIdx['CodeName']] !== othDocName) continue;
            if (row[oIdx['ConceptTypeName']] !== 'DocumentConfiguration') continue;
            if (row[oIdx['PermissionType']] !== 'Allow Actor') continue;

            const role = row[oIdx['ApplicationRole']];
            const actor = row[oIdx['AssignedPermission']];
            const op = row[oIdx['AssignmentOperator']] || 'Add';
            const key = role + '|' + actor + '|' + op;
            if (existing.has(key)) continue;

            const newRow = new Array(auth.header.length).fill('');
            newRow[aIdx['ApplicationRole']] = role;
            newRow[aIdx['PermissionType']] = 'Allow Actor';
            newRow[aIdx['CodeName']] = curDocName;
            newRow[aIdx['ConceptTypeName']] = 'DocumentConfiguration';
            newRow[aIdx['AssignedPermission']] = actor;
            newRow[aIdx['AssignmentOperator']] = op;
            auth.rows.push(newRow);
            existing.add(key);
            result.touched.auth = true;
            result.applied++;
        }
    }

    return result;
}

module.exports = { applyDiff };