const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { indexOf } = require('./utils');
const uiI18n = require('./ui-i18n');
const {
    SVG_STATE_W, SVG_STATE_H,
    buildActorConfig, registerActorsInFlow, detectFlowName,
    normalizeFlowOperations
} = require('./transforms');
const {
    loadData, writeAll, writeFlow, writeUi, writeAuth, pushRender, writeConfig, invalidateProjectCache
} = require('./storage');
const {
    flowRulePath, writeFlowRule, deleteFlowRule, renameFlowRule, flowRuleTemplate
} = require('./flow-rules');
const {
    clientActionPath, writeClientAction, clientActionTemplate, findClientActionInProject, renameClientAction
} = require('./client-actions');
const {
    addAttachmentType, removeAttachmentType, loadAttachmentType
} = require('./attachments');
const { applyDiff } = require('./compare-apply');

// Собирает actionToRunBefore из набора переходов.
function collectActionsFromTransitions(transitions) {
    const out = new Set();
    for (const t of (transitions || [])) {
        if (t && typeof t.actionToRunBefore === 'string' && t.actionToRunBefore.trim()) {
            out.add(t.actionToRunBefore.trim());
        }
    }
    return out;
}

// Удаляет ClientAction-файлы, которые больше не используются ни одним
// переходом в текущем документе. Вызывается после удаления переходов
// (или состояний, вместе с которыми удаляются переходы).
//
// Не трогает файлы, на которые ссылаются другие переходы.
// Не трогает файлы из других пакетов (findClientActionInProject) —
// clientActionPath(ctx, action) смотрит только текущий документ.
function deleteOrphanClientActions(ctx, candidateActions) {
    if (!candidateActions || !candidateActions.size) return;
    const stillUsed = collectActionsFromTransitions(ctx.flow.transitions || []);
    for (const action of candidateActions) {
        if (stillUsed.has(action)) continue;
        const p = clientActionPath(ctx, action);
        if (!fs.existsSync(p)) continue;
        try {
            fs.unlinkSync(p);
        } catch (e) {
            console.warn('[clientAction auto-delete] failed:', action, e.message);
        }
    }
}

/* ---------- toggle isTerminal ---------- */
async function handleToggleTerminal(ctx, panel, stateName, value) {
    const s = (ctx.flow.states || []).find(x => x.name === stateName);
    if (!s) throw new Error(uiI18n.t('err.state.notFound', { name: stateName }));
    if (value) s.isTerminal = true;
    else delete s.isTerminal;
    writeFlow(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
}

/* ---------- delete ---------- */
async function handleDeleteState(ctx, panel, stateName) {
    const { flow, config, csv } = ctx;

    const involvingTransitions = (flow.transitions || [])
        .filter(t => t.from === stateName || t.to === stateName);
    const removedTransitions = involvingTransitions.map(t => t.name);
    const candidateActions = collectActionsFromTransitions(involvingTransitions);

    for (const n of removedTransitions) {
        try { deleteFlowRule(ctx, n); }
        catch (e) { console.warn('flowRules delete failed:', n, e.message); }
    }

    if (config.transitions && typeof config.transitions === 'object' &&
        !Array.isArray(config.transitions)) {
        for (const n of removedTransitions) delete config.transitions[n];
    }

    flow.states = (flow.states || []).filter(s => s.name !== stateName);
    flow.transitions = (flow.transitions || []).filter(t => t.from !== stateName && t.to !== stateName);

    config.states = (config.states || []).filter(s => s.name !== stateName);
    for (const s of config.states) {
        for (const a of (s.actors || [])) {
            if (Array.isArray(a.transitions)) {
                a.transitions = a.transitions.filter(t => !removedTransitions.includes(t));
            }
        }
    }

    const idx = indexOf(csv.header);
    csv.rows = csv.rows.filter(row => {
        const type = row[idx['ItemType']];
        const key = row[idx['TranslationKey']];
        if (type === 'states' && key === `states@${stateName}`) return false;
        if (type === 'transitions') {
            const m = key.match(/^transitions@(.+?)@Title$/);
            if (m && removedTransitions.includes(m[1])) return false;
        }
        return true;
    });

    ctx.ui = (ctx.ui || []).filter(item => {
        if (item.id === `state_${stateName}`) return false;
        if (item.id && item.id.startsWith('transition_')) {
            const n = item.id.slice('transition_'.length);
            if (removedTransitions.includes(n)) return false;
        }
        return true;
    });

    deleteOrphanClientActions(ctx, candidateActions);

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(uiI18n.t('msg.state.deleted', { name: stateName }));
}

/* ---------- add ---------- */
async function handleAddState(ctx, panel, payload) {
    const { name, ru, isTerminal, outgoingTransitions = [], permissions = [], lang } = payload || {};
    const trLang = lang || 'ru-RU';
    const trCol = 'Translation_' + trLang;

    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(uiI18n.t('err.state.invalidCode'));
    }
    const { flow, config, csv } = ctx;
    if ((flow.states || []).some(s => s.name === name)) {
        throw new Error(uiI18n.t('err.state.existsInFlow', { name }));
    }
    for (const t of outgoingTransitions) {
        if (!t.name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(t.name)) {
            throw new Error(uiI18n.t('err.transition.invalidCode', { name: t.name || '' }));
        }
        if ((flow.transitions || []).some(x => x.name === t.name)) {
            throw new Error(uiI18n.t('err.transition.exists', { name: t.name }));
        }
        if (!t.to) throw new Error(uiI18n.t('err.transition.noTo', { name: t.name }));
    }

    flow.states = flow.states || [];
    const stObj = { name, operations: [] };
    if (isTerminal) stObj.isTerminal = true;
    flow.states.push(stObj);

    flow.transitions = flow.transitions || [];
    for (const t of outgoingTransitions) {
        flow.transitions.push({ name: t.name, from: name, to: t.to });
    }

    config.states = config.states || [];
    config.states.push({
        name,
        actors: permissions.map(p => buildActorConfig(p))
    });

    const idx = indexOf(csv.header);
    const flowName = detectFlowName(csv);
    const makeRow = (itemType, translationKey, expression, trValue) => {
        const row = new Array(csv.header.length).fill('');
        row[idx['ConfigurationType']] = 'DocumentFlowDefinition';
        row[idx['ConfigurationName']] = flowName;
        row[idx['ItemType']] = itemType;
        row[idx['TranslationKey']] = translationKey;
        row[idx['Expression']] = expression;
        row[idx['Translation_en-US']] = expression;
        if (trLang !== 'en-US') {
            if (trCol in idx) row[idx[trCol]] = trValue;
            else if ('Translation_ru-RU' in idx) row[idx['Translation_ru-RU']] = trValue;
        }
        return row;
    };

    csv.rows.push(makeRow('states', `states@${name}`, name, ru || name));
    for (const t of outgoingTransitions) {
        csv.rows.push(makeRow('transitions', `transitions@${t.name}@Title`, t.name, t.ru || t.name));
    }

    registerActorsInFlow(flow, permissions);

    writeAll(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(uiI18n.t('msg.state.added', { name }));
}

/* ---------- edit ---------- */
async function handleEditState(ctx, panel, payload) {
    const {
        originalName, name, ru, isTerminal,
        outgoingTransitions = [], permissions = [],
        lang
    } = payload || {};

    if (!originalName) throw new Error('Не передан originalName.');
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(uiI18n.t('err.state.invalidCode'));
    }

    const { flow, config, csv } = ctx;
    const stateRenamed = name !== originalName;

    if (stateRenamed && (flow.states || []).some(s => s.name === name)) {
        throw new Error(uiI18n.t('err.state.existsRename', { name }));
    }

    const oldOutgoing = (flow.transitions || []).filter(t => t.from === originalName);
    const oldNames = oldOutgoing.map(t => t.name);

    const keptOriginalNames = new Set(
        outgoingTransitions.filter(t => t.originalName).map(t => t.originalName)
    );
    const removedNames = oldNames.filter(n => !keptOriginalNames.has(n));

    // Собираем actionToRunBefore снимаемых переходов ДО их удаления.
    const candidateActions = collectActionsFromTransitions(
        oldOutgoing.filter(t => removedNames.includes(t.name))
    );

    const renameMap = {};
    for (const t of outgoingTransitions) {
        if (t.originalName && t.originalName !== t.name) {
            renameMap[t.originalName] = t.name;
        }
    }

    for (const t of outgoingTransitions) {
        if (!t.name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(t.name)) {
            throw new Error(uiI18n.t('err.transition.invalidCode', { name: t.name || '' }));
        }
        if (!t.to) throw new Error(uiI18n.t('err.transition.noTo', { name: t.name }));
    }
    const finalSet = new Set();
    for (const t of outgoingTransitions) {
        if (finalSet.has(t.name)) throw new Error(uiI18n.t('err.transition.duplicateInForm', { name: t.name }));
        finalSet.add(t.name);
    }
    const foreignNames = new Set(
        (flow.transitions || []).filter(t => t.from !== originalName).map(t => t.name)
    );
    for (const t of outgoingTransitions) {
        if (foreignNames.has(t.name)) throw new Error(uiI18n.t('err.transition.existsInOther', { name: t.name }));
    }

    /* 1. Переименование состояния */
    if (stateRenamed) {
        const s = (flow.states || []).find(x => x.name === originalName);
        if (s) s.name = name;
        for (const t of (flow.transitions || [])) {
            if (t.from === originalName) t.from = name;
            if (t.to === originalName) t.to = name;
        }
        const cs = (config.states || []).find(x => x.name === originalName);
        if (cs) cs.name = name;
        const idx0 = indexOf(csv.header);
        for (const row of csv.rows) {
            if (row[idx0['ItemType']] === 'states' && row[idx0['TranslationKey']] === `states@${originalName}`) {
                row[idx0['TranslationKey']] = `states@${name}`;
                row[idx0['Expression']] = name;
                const oldEn = row[idx0['Translation_en-US']];
                if (!oldEn || oldEn === originalName) {
                    row[idx0['Translation_en-US']] = name;
                }
            }
        }
        for (const it of (ctx.ui || [])) {
            if (it.id === `state_${originalName}`) it.id = `state_${name}`;
        }
    }

    /* 2. isTerminal */
    {
        const s = (flow.states || []).find(x => x.name === name);
        if (s) { if (isTerminal) s.isTerminal = true; else delete s.isTerminal; }
    }

    /* 3. Перевод в выбранную колонку */
    {
        const idx = indexOf(csv.header);
        const trLang = lang || 'ru-RU';
        const trCol = 'Translation_' + trLang;
        const writeTr = (row, value) => {
            if (trLang === 'en-US') return;
            if (trCol in idx) row[idx[trCol]] = value;
            else if ('Translation_ru-RU' in idx) row[idx['Translation_ru-RU']] = value;
        };

        let found = false;
        for (const row of csv.rows) {
            if (row[idx['ItemType']] === 'states' && row[idx['TranslationKey']] === `states@${name}`) {
                writeTr(row, ru || name);
                found = true;
                break;
            }
        }
        if (!found) {
            const flowName = detectFlowName(csv);
            const row = new Array(csv.header.length).fill('');
            row[idx['ConfigurationType']] = 'DocumentFlowDefinition';
            row[idx['ConfigurationName']] = flowName;
            row[idx['ItemType']] = 'states';
            row[idx['TranslationKey']] = `states@${name}`;
            row[idx['Expression']] = name;
            row[idx['Translation_en-US']] = name;
            writeTr(row, ru || name);
            csv.rows.push(row);
        }
    }

    /* 4. Удаление снятых переходов */
    if (removedNames.length) {
        if (config.transitions && typeof config.transitions === 'object' &&
            !Array.isArray(config.transitions)) {
            for (const n of removedNames) {
                delete config.transitions[n];
            }
        }
        for (const n of removedNames) {
            try { deleteFlowRule(ctx, n); }
            catch (e) { console.warn('flowRules delete failed:', n, e.message); }
        }
        flow.transitions = (flow.transitions || []).filter(t => !removedNames.includes(t.name));
        for (const s of (config.states || [])) {
            for (const a of (s.actors || [])) {
                if (Array.isArray(a.transitions)) {
                    a.transitions = a.transitions.filter(t => !removedNames.includes(t));
                }
            }
        }
        const idx = indexOf(csv.header);
        csv.rows = csv.rows.filter(row => {
            if (row[idx['ItemType']] === 'transitions') {
                const m = String(row[idx['TranslationKey']] || '').match(/^transitions@(.+?)@Title$/);
                if (m && removedNames.includes(m[1])) return false;
            }
            return true;
        });
        ctx.ui = (ctx.ui || []).filter(it => {
            if (it.id && it.id.startsWith('transition_')) {
                const n = it.id.slice('transition_'.length);
                if (removedNames.includes(n)) return false;
            }
            return true;
        });
    }

    // Клиентские экшены, ставшие «сиротами» после снятия переходов.
    // Вызывается до writeAll, чтобы файл удалился в этой же транзакции.
    if (removedNames.length) {
        deleteOrphanClientActions(ctx, candidateActions);
    }

    /* 5. Переименование переходов */
    const idx = indexOf(csv.header);
    for (const [oldN, newN] of Object.entries(renameMap)) {
        try { renameFlowRule(ctx, oldN, newN); }
        catch (e) { console.warn('flowRules rename failed:', oldN, '→', newN, e.message); }
        if (config.transitions && typeof config.transitions === 'object' &&
            !Array.isArray(config.transitions) && config.transitions[oldN]) {
            config.transitions[newN] = config.transitions[oldN];
            delete config.transitions[oldN];
        }
        const ft = (flow.transitions || []).find(x => x.name === oldN);
        if (ft) ft.name = newN;
        for (const s of (config.states || [])) {
            for (const a of (s.actors || [])) {
                if (Array.isArray(a.transitions)) {
                    a.transitions = a.transitions.map(x => x === oldN ? newN : x);
                }
            }
        }
        for (const row of csv.rows) {
            if (row[idx['ItemType']] === 'transitions' && row[idx['TranslationKey']] === `transitions@${oldN}@Title`) {
                row[idx['TranslationKey']] = `transitions@${newN}@Title`;
                row[idx['Expression']] = newN;
                const oldEn = row[idx['Translation_en-US']];
                if (!oldEn || oldEn === oldN) {
                    row[idx['Translation_en-US']] = newN;
                }
            }
        }
        for (const it of (ctx.ui || [])) {
            if (it.id === `transition_${oldN}`) it.id = `transition_${newN}`;
        }
    }

    /* 6. Обновление/добавление переходов */
    {
        const trLang6 = lang || 'ru-RU';
        const trCol6 = 'Translation_' + trLang6;
        const writeTr6 = (row, value) => {
            if (trLang6 === 'en-US') return;
            if (trCol6 in idx) row[idx[trCol6]] = value;
            else if ('Translation_ru-RU' in idx) row[idx['Translation_ru-RU']] = value;
        };

        for (const t of outgoingTransitions) {
            if (t.originalName) {
                const ft = (flow.transitions || []).find(x => x.name === t.name);
                if (ft) ft.to = t.to;
            } else {
                flow.transitions.push({ name: t.name, from: name, to: t.to });
                const flowName = detectFlowName(csv);
                const row = new Array(csv.header.length).fill('');
                row[idx['ConfigurationType']] = 'DocumentFlowDefinition';
                row[idx['ConfigurationName']] = flowName;
                row[idx['ItemType']] = 'transitions';
                row[idx['TranslationKey']] = `transitions@${t.name}@Title`;
                row[idx['Expression']] = t.name;
                row[idx['Translation_en-US']] = t.name;
                writeTr6(row, t.ru || t.name);
                csv.rows.push(row);
            }
            for (const row of csv.rows) {
                if (row[idx['ItemType']] === 'transitions' && row[idx['TranslationKey']] === `transitions@${t.name}@Title`) {
                    writeTr6(row, t.ru || t.name);
                }
            }
        }
    }

    /* 7. Замена блока прав */
    let cs = (config.states || []).find(x => x.name === name);
    if (!cs) {
        cs = { name, actors: [] };
        config.states = config.states || [];
        config.states.push(cs);
    }
    const oldActorsByName = {};
    for (const a of (cs.actors || [])) {
        if (a && a.actor) oldActorsByName[a.actor] = a;
    }
    cs.actors = permissions.map(p => buildActorConfig(p, oldActorsByName[p.actor]));

    {
        const fs = (flow.states || []).find(x => x.name === name);
        if (fs && Array.isArray(fs.operations)) {
            fs.operations = normalizeFlowOperations(fs.operations);
        }
    }

    registerActorsInFlow(flow, permissions);

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(uiI18n.t('msg.state.saved', { name }));
}

async function handleEditTransition(ctx, panel, payload) {
    const {
        originalName, name, to, ru,
        actionToRunBefore, serverSideEvents, allowOnValidationErrors,
        lang
    } = payload || {};
    const trLangE = lang || 'ru-RU';
    const trColE = 'Translation_' + trLangE;

    if (!originalName) throw new Error('Не передан originalName.');
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(uiI18n.t('err.transition.invalidCode', { name }));
    }
    if (!to) throw new Error(uiI18n.t('err.transition.noToTarget'));

    const { flow, config, csv } = ctx;

    const tr = (flow.transitions || []).find(t => t.name === originalName);
    if (!tr) throw new Error(uiI18n.t('err.transition.notFoundByOriginal', { original: originalName }));

    if (name !== originalName && (flow.transitions || []).some(t => t.name === name)) {
        throw new Error(uiI18n.t('err.transition.exists', { name }));
    }
    if (!(flow.states || []).some(s => s.name === to)) {
        throw new Error(uiI18n.t('err.transition.toNotFound', { to }));
    }

    const renamed = name !== originalName;

    /* 1. Основные поля перехода */
    tr.to = to;
    if (renamed) tr.name = name;

    /* 2. Доп. свойства: удаляем старые, добавляем новые, если заданы */
    delete tr.actionToRunBefore;
    if (actionToRunBefore && String(actionToRunBefore).trim()) {
        tr.actionToRunBefore = String(actionToRunBefore).trim();
    }

    delete tr.broadcastEvent;
    if (serverSideEvents) {
        tr.broadcastEvent = { serverSideEvents: true };
    }

    delete tr.allowOnValidationErrors;
    if (allowOnValidationErrors && allowOnValidationErrors.mode &&
        allowOnValidationErrors.mode !== 'none') {
        const m = allowOnValidationErrors.mode;
        if (m === 'all-true') {
            tr.allowOnValidationErrors = { all: true };
        } else if (m === 'all-false') {
            tr.allowOnValidationErrors = { all: false };
        } else if (m === 'codes') {
            tr.allowOnValidationErrors = { codes: allowOnValidationErrors.codes || [] };
        } else if (m === 'exceptForCodes') {
            tr.allowOnValidationErrors = { exceptForCodes: allowOnValidationErrors.codes || [] };
        }
    }

    /* 3. Переименование — обновляем ссылки везде */
    if (renamed) {
        if (config.transitions && typeof config.transitions === 'object' &&
            !Array.isArray(config.transitions) && config.transitions[originalName]) {
            config.transitions[name] = config.transitions[originalName];
            delete config.transitions[originalName];
        }
        for (const s of (config.states || [])) {
            for (const a of (s.actors || [])) {
                if (Array.isArray(a.transitions)) {
                    a.transitions = a.transitions.map(x => x === originalName ? name : x);
                }
            }
        }
        const idx = indexOf(csv.header);
        for (const row of csv.rows) {
            if (row[idx['ItemType']] === 'transitions' &&
                row[idx['TranslationKey']] === `transitions@${originalName}@Title`) {
                row[idx['TranslationKey']] = `transitions@${name}@Title`;
                row[idx['Expression']] = name;
                const oldEn = row[idx['Translation_en-US']];
                if (!oldEn || oldEn === originalName) {
                    row[idx['Translation_en-US']] = name;
                }
            }
        }
        for (const it of (ctx.ui || [])) {
            if (it.id === `transition_${originalName}`) it.id = `transition_${name}`;
        }
    }

    if (renamed) {
        try { renameFlowRule(ctx, originalName, name); }
        catch (e) {
            vscode.window.showWarningMessage(
                uiI18n.t('msg.transition.flowRuleRenameFailed', { message: e.message })
            );
        }
    }

    /* 4. Перевод в выбранную колонку */
    {
        const idx = indexOf(csv.header);
        const writeTr = (row, value) => {
            if (trLangE === 'en-US') return;
            if (trColE in idx) row[idx[trColE]] = value;
            else if ('Translation_ru-RU' in idx) row[idx['Translation_ru-RU']] = value;
        };

        let found = false;
        for (const row of csv.rows) {
            if (row[idx['ItemType']] === 'transitions' &&
                row[idx['TranslationKey']] === `transitions@${name}@Title`) {
                writeTr(row, ru || name);
                found = true;
                break;
            }
        }
        if (!found) {
            const flowName = detectFlowName(csv);
            const row = new Array(csv.header.length).fill('');
            row[idx['ConfigurationType']] = 'DocumentFlowDefinition';
            row[idx['ConfigurationName']] = flowName;
            row[idx['ItemType']] = 'transitions';
            row[idx['TranslationKey']] = `transitions@${name}@Title`;
            row[idx['Expression']] = name;
            row[idx['Translation_en-US']] = name;
            writeTr(row, ru || name);
            csv.rows.push(row);
        }
    }

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(uiI18n.t('msg.transition.saved', { name }));
}

async function handleAddTransition(ctx, panel, payload) {
    const {
        from, name, to, ru,
        actionToRunBefore, serverSideEvents, allowOnValidationErrors,
        lang
    } = payload || {};
    const trLangA = lang || 'ru-RU';
    const trColA = 'Translation_' + trLangA;

    if (!from) throw new Error(uiI18n.t('err.transition.noFrom'));
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(uiI18n.t('err.transition.invalidCode', { name }));
    }
    if (!to) throw new Error(uiI18n.t('err.transition.noToTarget'));

    const { flow, config, csv } = ctx;

    if (!(flow.states || []).some(s => s.name === from)) {
        throw new Error(uiI18n.t('err.transition.fromNotFound', { from }));
    }
    if (!(flow.states || []).some(s => s.name === to)) {
        throw new Error(uiI18n.t('err.transition.toNotFound', { to }));
    }
    if ((flow.transitions || []).some(t => t.name === name)) {
        throw new Error(uiI18n.t('err.transition.exists', { name }));
    }

    flow.transitions = flow.transitions || [];
    const tr = { name, from, to };
    if (allowOnValidationErrors && allowOnValidationErrors.mode &&
        allowOnValidationErrors.mode !== 'none') {
        const m = allowOnValidationErrors.mode;
        if (m === 'all-true') tr.allowOnValidationErrors = { all: true };
        else if (m === 'all-false') tr.allowOnValidationErrors = { all: false };
        else if (m === 'codes') tr.allowOnValidationErrors = { codes: allowOnValidationErrors.codes || [] };
        else if (m === 'exceptForCodes') tr.allowOnValidationErrors = { exceptForCodes: allowOnValidationErrors.codes || [] };
    }
    if (actionToRunBefore && String(actionToRunBefore).trim()) {
        tr.actionToRunBefore = String(actionToRunBefore).trim();
    }
    if (serverSideEvents) tr.broadcastEvent = { serverSideEvents: true };
    flow.transitions.push(tr);

    const idx = indexOf(csv.header);
    const writeTrA = (row, value) => {
        if (trLangA === 'en-US') return;
        if (trColA in idx) row[idx[trColA]] = value;
        else if ('Translation_ru-RU' in idx) row[idx['Translation_ru-RU']] = value;
    };

    let found = false;
    for (const row of csv.rows) {
        if (row[idx['ItemType']] === 'transitions' &&
            row[idx['TranslationKey']] === `transitions@${name}@Title`) {
            writeTrA(row, ru || name);
            found = true;
            break;
        }
    }
    if (!found) {
        const flowName = detectFlowName(csv);
        const row = new Array(csv.header.length).fill('');
        row[idx['ConfigurationType']] = 'DocumentFlowDefinition';
        row[idx['ConfigurationName']] = flowName;
        row[idx['ItemType']] = 'transitions';
        row[idx['TranslationKey']] = `transitions@${name}@Title`;
        row[idx['Expression']] = name;
        row[idx['Translation_en-US']] = name;
        writeTrA(row, ru || name);
        csv.rows.push(row);
    }

    writeAll(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(uiI18n.t('msg.transition.created', { name }));
}

/* ---------- save graph positions ---------- */
async function handleSaveGraph(ctx, payload) {
    const { states = [], transitions = [] } = payload || {};
    const ui = [];

    for (const s of states) {
        ui.push({
            id: 'state_' + s.name,
            bounds: {
                x: s.x, y: s.y,
                width: s.w || SVG_STATE_W,
                height: s.h || SVG_STATE_H
            },
            label: {
                bounds: {
                    x: s.label ? s.label.x : s.x - 12,
                    y: s.label ? s.label.y : s.y + (s.h || SVG_STATE_H) + 4,
                    width: s.label ? (s.label.w || 64) : 64,
                    height: s.label ? (s.label.h || 14) : 14
                }
            }
        });
    }
    for (const t of transitions) {
        if (!t.manual) continue;
        if (!Array.isArray(t.waypoints) || t.waypoints.length < 2) continue;
        ui.push({
            id: 'transition_' + t.name,
            waypoints: t.waypoints.map(w => ({ x: w.x, y: w.y })),
            label: {
                bounds: {
                    x: t.label ? t.label.x : 0,
                    y: t.label ? t.label.y : 0,
                    width: t.label ? (t.label.w || 120) : 120,
                    height: t.label ? (t.label.h || 14) : 14
                }
            }
        });
    }

    ctx.ui = ui;
    writeUi(ctx);
    vscode.window.showInformationMessage(uiI18n.t('msg.graph.saved'));
}

async function handleDeleteTransitions(ctx, panel, names) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (!list.length) return;

    const { flow, config, csv } = ctx;

    // Собираем actionToRunBefore удаляемых переходов ДО удаления —
    // после удаления их уже не найти.
    const candidateActions = collectActionsFromTransitions(
        (flow.transitions || []).filter(t => list.includes(t.name))
    );

    flow.transitions = (flow.transitions || []).filter(t => !list.includes(t.name));

    for (const s of (config.states || [])) {
        for (const a of (s.actors || [])) {
            if (Array.isArray(a.transitions)) {
                a.transitions = a.transitions.filter(t => !list.includes(t));
                if (config.transitions && typeof config.transitions === 'object' &&
                    !Array.isArray(config.transitions)) {
                    for (const n of list) delete config.transitions[n];
                }
            }
        }
    }

    const idx = indexOf(csv.header);
    csv.rows = csv.rows.filter(row => {
        if (row[idx['ItemType']] !== 'transitions') return true;
        const m = String(row[idx['TranslationKey']] || '').match(/^transitions@(.+?)@Title$/);
        if (!m) return true;
        return !list.includes(m[1]);
    });

    ctx.ui = (ctx.ui || []).filter(item => {
        if (!item.id || !item.id.startsWith('transition_')) return true;
        const n = item.id.slice('transition_'.length);
        return !list.includes(n);
    });

    for (const n of list) {
        try { deleteFlowRule(ctx, n); }
        catch (e) { console.warn('flowRules delete failed:', n, e.message); }
    }

    deleteOrphanClientActions(ctx, candidateActions);

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        list.length === 1
            ? uiI18n.t('msg.transition.deleted', { name: list[0] })
            : uiI18n.t('msg.transitions.deleted', { n: String(list.length) })
    );
}

function upsertCsv(csv, itemType, translationKey, expression, trValue, flowName, lang) {
    const trLang = lang || 'ru-RU';
    const trCol = 'Translation_' + trLang;
    const idx = indexOf(csv.header);
    const writeTr = (row, value) => {
        if (trLang === 'en-US') return;
        if (trCol in idx) row[idx[trCol]] = value;
        else if ('Translation_ru-RU' in idx) row[idx['Translation_ru-RU']] = value;
    };

    for (const row of csv.rows) {
        if (row[idx['ItemType']] === itemType && row[idx['TranslationKey']] === translationKey) {
            writeTr(row, trValue);
            return;
        }
    }
    const row = new Array(csv.header.length).fill('');
    row[idx['ConfigurationType']] = 'DocumentFlowDefinition';
    row[idx['ConfigurationName']] = flowName;
    row[idx['ItemType']] = itemType;
    row[idx['TranslationKey']] = translationKey;
    row[idx['Expression']] = expression;
    row[idx['Translation_en-US']] = expression;
    writeTr(row, trValue);
    csv.rows.push(row);
}

async function handleGenerateFlow(ctx, panel, payload) {
    const targetStates = (payload && payload.states) || [];
    const targetTransitions = (payload && payload.transitions) || [];
    const genLang = (payload && payload.lang) || 'ru-RU';

    const { flow, config, csv } = ctx;

    flow.states = flow.states || [];
    flow.transitions = flow.transitions || [];
    flow.actors = flow.actors || [];
    config.states = config.states || [];

    const currentStateNames = new Set(flow.states.map(s => s.name));
    const currentTransitionNames = new Set(flow.transitions.map(t => t.name));
    const targetStateNames = new Set(targetStates.map(s => s.name));
    const targetTransitionNames = new Set(targetTransitions.map(t => t.name));

    /* 1. Удаляем состояния, которых нет в target */
    const removedStateNames = flow.states
        .filter(s => !targetStateNames.has(s.name))
        .map(s => s.name);
    const removedTransitions = new Set();

    if (removedStateNames.length) {
        const rs = new Set(removedStateNames);
        flow.transitions = flow.transitions.filter(t => {
            const drop = rs.has(t.from) || rs.has(t.to);
            if (drop) removedTransitions.add(t.name);
            return !drop;
        });
        flow.states = flow.states.filter(s => !rs.has(s.name));
        config.states = config.states.filter(s => !rs.has(s.name));
    }

    /* 2. Удаляем снятые переходы */
    const explicitlyRemoved = flow.transitions
        .filter(t => !targetTransitionNames.has(t.name))
        .map(t => t.name);
    for (const n of explicitlyRemoved) removedTransitions.add(n);
    flow.transitions = flow.transitions.filter(t => !explicitlyRemoved.includes(t.name));

    /* 3. Чистим ссылки на удалённые переходы */
    if (removedTransitions.size) {
        for (const s of config.states) {
            for (const a of (s.actors || [])) {
                if (Array.isArray(a.transitions)) {
                    a.transitions = a.transitions.filter(t => !removedTransitions.has(t));
                }
            }
        }
    }

    /* 4. Добавляем новые состояния */
    for (const s of targetStates) {
        if (!currentStateNames.has(s.name)) {
            flow.states.push({ name: s.name, operations: [] });
            config.states.push({ name: s.name, actors: [] });
        }
    }

    /* 5. Добавляем новые переходы */
    for (const t of targetTransitions) {
        if (!currentTransitionNames.has(t.name)) {
            flow.transitions.push({ name: t.name, from: t.from, to: t.to });
        }
    }

    /* 6. Обновляем CSV */
    const idx = indexOf(csv.header);
    csv.rows = csv.rows.filter(row => {
        const type = row[idx['ItemType']];
        const key = row[idx['TranslationKey']];
        if (type === 'states' && key.startsWith('states@')) {
            const n = key.slice('states@'.length);
            if (removedStateNames.includes(n)) return false;
        }
        if (type === 'transitions' && key.startsWith('transitions@')) {
            const m = key.match(/^transitions@(.+?)@Title$/);
            if (m && removedTransitions.has(m[1])) return false;
        }
        return true;
    });

    const folderName = path.basename(path.dirname(ctx.flowPath));
    let flowName = detectFlowName(csv);
    if (!flowName || flowName === 'UnknownFlow') flowName = folderName + 'Flow';

    for (const s of targetStates) {
        upsertCsv(csv, 'states', `states@${s.name}`, s.name, s.ru || s.name, flowName, genLang);
    }
    for (const t of targetTransitions) {
        upsertCsv(csv, 'transitions', `transitions@${t.name}@Title`, t.name, t.ru || t.name, flowName, genLang);
    }

    /* 7. Чистим ui.json */
    ctx.ui = (ctx.ui || []).filter(item => {
        if (!item.id) return true;
        if (item.id.startsWith('state_')) {
            const n = item.id.slice('state_'.length);
            return !removedStateNames.includes(n);
        }
        if (item.id.startsWith('transition_')) {
            const n = item.id.slice('transition_'.length);
            return !removedTransitions.has(n);
        }
        return true;
    });

    /* 8. initialState */
    if ((!flow.initialState || !flow.states.some(s => s.name === flow.initialState)) &&
        flow.states.length) {
        flow.initialState = flow.states[0].name;
    }

    for (const n of removedTransitions) {
        try { deleteFlowRule(ctx, n); }
        catch (e) { console.warn('flowRules delete failed:', n, e.message); }
    }

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.flow.generated', {
            states: uiI18n.plural(flow.states.length, 'states'),
            transitions: uiI18n.plural(flow.transitions.length, 'transitions')
        })
    );
}

async function handleSaveAuth(ctx, panel, payload) {
    if (!ctx.authPath || !ctx.auth) {
        throw new Error(uiI18n.t('err.auth.noFile'));
    }

    const newRows = (payload && payload.rows) || [];
    const auth = ctx.auth;
    const idx = indexOf(auth.header);

    const flowPath = ctx.flowPath;
    const docName = path.basename(path.dirname(flowPath));

    const keep = auth.rows.filter(row => {
        const codeName = row[idx['CodeName']];
        const conceptType = row[idx['ConceptTypeName']];
        const permType = row[idx['PermissionType']];
        const isDocRow = (codeName === docName &&
            conceptType === 'DocumentConfiguration' &&
            permType === 'Allow Actor');
        return !isDocRow;
    });

    const buildRow = (role, actor, op) => {
        const row = new Array(auth.header.length).fill('');
        row[idx['ApplicationRole']] = role;
        row[idx['PermissionType']] = 'Allow Actor';
        row[idx['CodeName']] = docName;
        row[idx['ConceptTypeName']] = 'DocumentConfiguration';
        row[idx['AssignedPermission']] = actor;
        row[idx['AssignmentOperator']] = op || 'Add';
        return row;
    };

    const seen = new Set();
    for (const r of newRows) {
        const role = String(r.role || '').trim();
        const actor = String(r.actor || '').trim();
        const op = r.op === 'Remove' ? 'Remove' : 'Add';

        if (!role || !actor) {
            throw new Error(uiI18n.t('err.auth.emptyRow'));
        }

        const key = role + '|' + actor + '|' + op;
        if (seen.has(key)) {
            throw new Error(uiI18n.t('err.auth.duplicateRow', { role, actor, op }));
        }
        seen.add(key);

        keep.push(buildRow(role, actor, op));
    }

    auth.rows = keep;

    writeAuth(ctx);
    loadData(ctx);
    pushRender(ctx, panel);

    vscode.window.showInformationMessage(
        uiI18n.t('msg.auth.saved', {
            rows: uiI18n.plural(newRows.length, 'rows'),
            doc: docName
        })
    );
}

async function handleDeleteActorFromState(ctx, panel, payload) {
    const { stateName, actorName } = payload || {};
    if (!stateName || !actorName) throw new Error(uiI18n.t('err.actor.stateActorParams'));

    const cs = (ctx.config.states || []).find(s => s.name === stateName);
    if (!cs) throw new Error(uiI18n.t('err.state.notFound', { name: stateName }));
    if (!Array.isArray(cs.actors)) cs.actors = [];

    const before = cs.actors.length;
    cs.actors = cs.actors.filter(a => a.actor !== actorName);
    if (cs.actors.length === before) {
        throw new Error(uiI18n.t('err.actor.notFoundInState', { actor: actorName, state: stateName }));
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.actor.removedFromState', { actor: actorName, state: stateName })
    );
}

async function handleCopyActor(ctx, panel, payload) {
    const { fromState, fromActor, toActor, toStates } = payload || {};
    if (!fromState || !fromActor || !toActor ||
        !Array.isArray(toStates) || !toStates.length) {
        throw new Error(uiI18n.t('err.actor.copyParams'));
    }

    const srcCs = (ctx.config.states || []).find(s => s.name === fromState);
    if (!srcCs) throw new Error(uiI18n.t('err.actor.sourceStateNotFound', { from: fromState }));
    const srcActor = (srcCs.actors || []).find(a => a.actor === fromActor);
    if (!srcActor) throw new Error(uiI18n.t('err.actor.sourceActorNotFound'));

    const template = JSON.parse(JSON.stringify(srcActor));
    template.actor = toActor;

    let added = 0;
    let skipped = 0;

    for (const st of toStates) {
        const cs = (ctx.config.states || []).find(s => s.name === st);
        if (!cs) { skipped++; continue; }
        cs.actors = cs.actors || [];
        if (cs.actors.some(a => a.actor === toActor)) { skipped++; continue; }
        cs.actors.push(JSON.parse(JSON.stringify(template)));
        added++;
    }

    if (!added) {
        vscode.window.showInformationMessage(
            uiI18n.t('msg.actor.copyNothing', { name: toActor })
        );
        return;
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);

    vscode.window.showInformationMessage(
        uiI18n.t('msg.actor.copied', {
            name: toActor,
            states: uiI18n.plural(added, 'states'),
            skipped: skipped ? uiI18n.t('msg.actor.copiedSkipped', { n: String(skipped) }) : ''
        })
    );
}

async function handleOpenFlowRule(ctx, transitionName) {
    if (!transitionName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(transitionName)) {
        throw new Error(uiI18n.t('err.flowRule.invalidCode', { name: transitionName || '' }));
    }

    const p = flowRulePath(ctx, transitionName);

    if (!fs.existsSync(p)) {
        const answer = await vscode.window.showInformationMessage(
            uiI18n.t('msg.flowRule.willCreate', { name: transitionName }),
            { modal: true },
            uiI18n.t('msg.flowRule.createBtn'),
            uiI18n.t('common.cancel')
        );
        if (answer !== uiI18n.t('msg.flowRule.createBtn')) return;
        writeFlowRule(ctx, transitionName, flowRuleTemplate(transitionName));
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
}

async function handleOpenClientAction(ctx, transitionName, actionName) {
    if (!actionName || !String(actionName).trim()) {
        throw new Error(uiI18n.t('err.clientAction.noAction'));
    }
    if (!/^[A-Za-z0-9_$\-]+$/.test(actionName)) {
        throw new Error(uiI18n.t('err.clientAction.invalidName', { name: actionName }));
    }

    let p = clientActionPath(ctx, actionName);

    if (!fs.existsSync(p)) {
        const found = findClientActionInProject(ctx, actionName);
        if (found) p = found;
    }

    if (!fs.existsSync(p)) {
        const answer = await vscode.window.showInformationMessage(
            uiI18n.t('msg.clientAction.willCreate', { name: actionName }),
            { modal: true },
            uiI18n.t('msg.clientAction.createBtn'),
            uiI18n.t('common.cancel')
        );
        if (answer !== uiI18n.t('msg.clientAction.createBtn')) return;
        writeClientAction(ctx, actionName, clientActionTemplate(actionName));
        p = clientActionPath(ctx, actionName);
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
}

async function handleDeleteClientAction(ctx, actionName) {
    if (!actionName || !/^[A-Za-z0-9_$\-]+$/.test(actionName)) {
        throw new Error(uiI18n.t('err.clientAction.invalidName', { name: actionName || '' }));
    }

    const p = clientActionPath(ctx, actionName);
    if (!fs.existsSync(p)) {
        vscode.window.showInformationMessage(
            uiI18n.t('msg.clientAction.notFound', { name: actionName })
        );
        return;
    }

    const answer = await vscode.window.showWarningMessage(
        uiI18n.t('confirm.clientAction.delete', { name: actionName }),
        { modal: true },
        uiI18n.t('confirm.clientAction.deleteOk')
    );
    if (answer !== uiI18n.t('confirm.clientAction.deleteOk')) return;

    fs.unlinkSync(p);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.clientAction.deleted', { name: actionName })
    );
}

async function handleCreateClientAction(ctx, actionName) {
    if (!actionName || !/^[A-Za-z0-9_$\-]+$/.test(actionName)) {
        throw new Error(uiI18n.t('err.clientAction.invalidName', { name: actionName }));
    }

    const p = clientActionPath(ctx, actionName);
    if (fs.existsSync(p)) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
    }

    writeClientAction(ctx, actionName, clientActionTemplate(actionName));
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage(
        uiI18n.t('msg.clientAction.created', { name: actionName })
    );
}

async function handleRenameClientAction(ctx, oldName, newName) {
    renameClientAction(ctx, oldName, newName);

    const p = clientActionPath(ctx, newName);
    try {
        let content = fs.readFileSync(p, 'utf8');
        const re = new RegExp('function\\s+' + oldName.replace(/[$]/g, '\\$') + '\\s*\\(');
        if (re.test(content)) {
            content = content.replace(re, 'function ' + newName + '(');
            fs.writeFileSync(p, content, 'utf8');
        }
    } catch (e) {
        console.warn('ClientAction rename: function name not updated:', e.message);
    }

    vscode.window.showInformationMessage(
        uiI18n.t('msg.clientAction.renamed', { old: oldName, new: newName })
    );
}

/* ---------- AttachmentType: справочник ---------- */

async function reloadAttachmentCatalog(ctx) {
    const att = loadAttachmentType(ctx.projectRoot);
    ctx.attachmentTypeDir = att.dir;
    ctx.attachmentTypeCodes = att.codes;
    ctx.attachmentTypeTranslations = att.translations;
    ctx.attachmentTypeTranslationsAll = att.translationsAll || {};
}

async function handleAddAttachmentType(ctx, panel, payload) {
    const { code, ru, trValue, lang } = payload || {};
    if (!code || !/^[A-Za-z][A-Za-z0-9_ ]*$/.test(code)) {
        throw new Error(uiI18n.t('err.attachment.invalidCode'));
    }
    if (!ctx.attachmentTypeDir) {
        throw new Error(uiI18n.t('err.attachment.dirNotFound'));
    }
    addAttachmentType(
        ctx.attachmentTypeDir,
        code,
        trValue != null ? trValue : (ru || code),
        lang || 'ru-RU'
    );
    invalidateProjectCache(ctx);
    await reloadAttachmentCatalog(ctx);
}

async function handleRemoveAttachmentType(ctx, panel, code) {
    if (!code) throw new Error(uiI18n.t('err.attachment.noCode'));
    if (!ctx.attachmentTypeDir) {
        throw new Error(uiI18n.t('err.attachment.dirNotConfigured'));
    }
    removeAttachmentType(ctx.attachmentTypeDir, code);
    await reloadAttachmentCatalog(ctx);
}

/* ---------- AttachmentType: вложения документа ---------- */

function buildDefaultAttachmentRestrictions(actors, code, mode) {
    const result = [];
    for (const s of actors) {
        if (!Array.isArray(s.actors)) continue;
        for (const a of s.actors) {
            const rest = Array.isArray(a.attachmentsRestrictions) ? a.attachmentsRestrictions : [];

            if (mode === 'read-all') {
                const hasReadSomewhere = rest.some(r =>
                    Array.isArray(r.permissions) && r.permissions.includes('Read')
                );
                if (hasReadSomewhere) {
                    result.push({ actor: a, permissions: ['Read'] });
                }
            } else if (mode === 'by-template') {
                if (!rest.length) continue;
                const first = rest[0];
                const perms = Array.isArray(first.permissions) ? first.permissions.slice() : [];
                result.push({ actor: a, permissions: perms });
            }
        }
    }
    return result;
}

async function handleAddAttachmentToDoc(ctx, panel, payload) {
    const { code, mode } = payload || {};
    if (!code) throw new Error(uiI18n.t('err.attachment.noCode'));
    const m = mode || 'none';
    if (!['none', 'read-all', 'by-template'].includes(m)) {
        throw new Error(uiI18n.t('err.attachment.unknownMode', { mode: m }));
    }

    const config = ctx.config;
    config.attachments = config.attachments || [];

    if (config.attachments.some(a => a.attachmentType === code)) {
        throw new Error(uiI18n.t('err.attachment.existsInDoc', { code }));
    }
    config.attachments.push({ attachmentType: code, flow: 'Incoming' });

    if (m !== 'none') {
        const actorRules = buildDefaultAttachmentRestrictions(config.states || [], code, m);
        for (const rule of actorRules) {
            const a = rule.actor;
            if (!Array.isArray(a.attachmentsRestrictions)) a.attachmentsRestrictions = [];
            if (a.attachmentsRestrictions.some(r => r.attachmentType === code)) continue;
            a.attachmentsRestrictions.push({
                attachmentType: code,
                permissions: rule.permissions
            });
        }
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.attachment.addedToDoc', { code })
    );
}

async function handleRemoveAttachmentFromDoc(ctx, panel, code) {
    if (!code) throw new Error(uiI18n.t('err.attachment.noCode'));
    const config = ctx.config;
    config.attachments = (config.attachments || []).filter(a => a.attachmentType !== code);

    for (const s of (config.states || [])) {
        for (const a of (s.actors || [])) {
            if (Array.isArray(a.attachmentsRestrictions)) {
                a.attachmentsRestrictions = a.attachmentsRestrictions.filter(
                    r => r.attachmentType !== code
                );
            }
        }
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.attachment.removedFromDoc', { code })
    );
}

/* ---------- Акторы ---------- */

async function handleAddActor(ctx, panel, payload) {
    const name = (payload && payload.name || '').trim();
    if (!name) throw new Error(uiI18n.t('err.actor.noName'));
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(uiI18n.t('err.actor.invalidName', { name }));
    }

    const flow = ctx.flow;
    flow.actors = flow.actors || [];
    if (flow.actors.includes(name)) {
        throw new Error(uiI18n.t('err.actor.existsInFlow', { name }));
    }
    flow.actors.push(name);

    writeFlow(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(uiI18n.t('msg.actor.added', { name }));
}

async function handleDeleteActor(ctx, panel, payload) {
    const name = (payload && payload.name || '').trim();
    if (!name) throw new Error(uiI18n.t('err.actor.noName'));

    const flow = ctx.flow;
    const config = ctx.config;
    const csv = ctx.csv;

    let touched = false;

    if (Array.isArray(flow.actors) && flow.actors.includes(name)) {
        flow.actors = flow.actors.filter(a => a !== name);
        touched = true;
    }

    for (const s of (config.states || [])) {
        if (!Array.isArray(s.actors)) continue;
        const before = s.actors.length;
        s.actors = s.actors.filter(a => a.actor !== name);
        if (s.actors.length !== before) touched = true;
    }

    if (csv && Array.isArray(csv.rows) && Array.isArray(csv.header)) {
        const idx = indexOf(csv.header);
        const before = csv.rows.length;
        csv.rows = csv.rows.filter(row => {
            if (row[idx['ItemType']] !== 'actors') return true;
            const key = row[idx['TranslationKey']];
            const expr = row[idx['Expression']];
            return key !== name && expr !== name;
        });
        if (csv.rows.length !== before) touched = true;
    }

    let authTouched = false;
    if (ctx.authPath && ctx.auth) {
        const auth = ctx.auth;
        const idx = indexOf(auth.header);
        const docName = path.basename(path.dirname(ctx.flowPath));
        const before = auth.rows.length;
        auth.rows = auth.rows.filter(row => {
            const assigned = row[idx['AssignedPermission']];
            const codeName = row[idx['CodeName']];
            const conceptType = row[idx['ConceptTypeName']];
            const permType = row[idx['PermissionType']];
            const isThisActor = assigned === name &&
                codeName === docName &&
                conceptType === 'DocumentConfiguration' &&
                permType === 'Allow Actor';
            return !isThisActor;
        });
        if (auth.rows.length !== before) authTouched = true;
    }

    if (!touched && !authTouched) {
        vscode.window.showInformationMessage(uiI18n.t('msg.actor.nowhereFound', { name }));
        return;
    }

    writeAll(ctx);
    if (authTouched) writeAuth(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(uiI18n.t('msg.actor.deleted', { name }));
}

async function handleAddStateToActor(ctx, panel, payload) {
    const actor = (payload && payload.actor || '').trim();
    const state = (payload && payload.state || '').trim();
    if (!actor) throw new Error(uiI18n.t('err.actor.noName'));
    if (!state) throw new Error(uiI18n.t('err.actor.noState'));

    const config = ctx.config;
    const flow = ctx.flow;

    if (!(flow.states || []).some(s => s.name === state)) {
        throw new Error(uiI18n.t('err.state.notFound', { name: state }));
    }

    let cs = (config.states || []).find(s => s.name === state);
    if (!cs) {
        cs = { name: state, actors: [] };
        config.states = config.states || [];
        config.states.push(cs);
    }
    cs.actors = cs.actors || [];
    if (cs.actors.some(a => a.actor === actor)) {
        throw new Error(uiI18n.t('err.actor.alreadyInState', { actor, state }));
    }

    cs.actors.push({
        actor,
        allowComments: false,
        operations: [],
        transitions: [],
        attachmentsRestrictions: []
    });

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
}

async function handleDeleteStateFromActor(ctx, panel, payload) {
    const actor = (payload && payload.actor || '').trim();
    const state = (payload && payload.state || '').trim();
    if (!actor || !state) throw new Error(uiI18n.t('err.actor.stateActorParams'));

    const cs = (ctx.config.states || []).find(s => s.name === state);
    if (!cs || !Array.isArray(cs.actors)) {
        throw new Error(uiI18n.t('err.state.notFound', { name: state }));
    }

    const before = cs.actors.length;
    cs.actors = cs.actors.filter(a => a.actor !== actor);
    if (cs.actors.length === before) {
        throw new Error(uiI18n.t('err.actor.notFoundInState', { actor, state }));
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
}

async function handleAddTransitionToActor(ctx, panel, payload) {
    const actor = (payload && payload.actor || '').trim();
    const transition = (payload && payload.transition || '').trim();
    if (!actor || !transition) throw new Error(uiI18n.t('err.actor.stateTransitionParams'));

    const flow = ctx.flow;
    const config = ctx.config;

    const tr = (flow.transitions || []).find(t => t.name === transition);
    if (!tr) throw new Error(uiI18n.t('err.transition.notFound', { name: transition }));
    const fromState = tr.from;
    if (!fromState) throw new Error(uiI18n.t('err.transition.noSourceFrom'));

    let cs = (config.states || []).find(s => s.name === fromState);
    if (!cs) {
        cs = { name: fromState, actors: [] };
        config.states = config.states || [];
        config.states.push(cs);
    }
    cs.actors = cs.actors || [];

    let actorRec = cs.actors.find(a => a.actor === actor);
    if (!actorRec) {
        actorRec = {
            actor,
            allowComments: false,
            operations: [],
            transitions: [],
            attachmentsRestrictions: []
        };
        cs.actors.push(actorRec);
    }

    actorRec.transitions = Array.isArray(actorRec.transitions) ? actorRec.transitions : [];
    const has = actorRec.transitions.some(t => (typeof t === 'string' ? t : t && t.name) === transition);
    if (has) {
        vscode.window.showInformationMessage(
            uiI18n.t('msg.actor.transitionExists', { actor, transition })
        );
        return;
    }
    actorRec.transitions.push(transition);

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
}

async function handleDeleteTransitionFromActor(ctx, panel, payload) {
    const actor = (payload && payload.actor || '').trim();
    const transition = (payload && payload.transition || '').trim();
    if (!actor || !transition) throw new Error(uiI18n.t('err.actor.stateTransitionParams'));

    const config = ctx.config;
    let touched = false;

    for (const s of (config.states || [])) {
        const actorRec = (s.actors || []).find(a => a.actor === actor);
        if (!actorRec || !Array.isArray(actorRec.transitions)) continue;
        const before = actorRec.transitions.length;
        actorRec.transitions = actorRec.transitions.filter(t => {
            const n = (typeof t === 'string') ? t : (t && t.name);
            return n !== transition;
        });
        if (actorRec.transitions.length !== before) touched = true;
    }

    if (!touched) {
        vscode.window.showInformationMessage(
            uiI18n.t('msg.actor.transitionNotExists', { actor, transition })
        );
        return;
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
}

async function handleEditActorPerm(ctx, panel, payload) {
    const { stateName, actorName, perm } = payload || {};
    if (!stateName || !actorName || !perm) {
        throw new Error(uiI18n.t('err.actor.permParams'));
    }

    const config = ctx.config;
    const cs = (config.states || []).find(s => s.name === stateName);
    if (!cs || !Array.isArray(cs.actors)) {
        throw new Error(uiI18n.t('err.state.notFound', { name: stateName }));
    }

    const idx = cs.actors.findIndex(a => a.actor === actorName);
    if (idx < 0) {
        throw new Error(uiI18n.t('err.actor.notFoundInState', { actor: actorName, state: stateName }));
    }

    const original = cs.actors[idx];
    cs.actors[idx] = buildActorConfig(perm, original);

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.actor.permSaved', { actor: actorName, state: stateName })
    );
}

async function handleDuplicateActor(ctx, panel, payload) {
    const oldName = (payload && payload.oldName || '').trim();
    const newName = (payload && payload.newName || '').trim();
    if (!oldName || !newName) throw new Error(uiI18n.t('err.actor.noOldNew'));
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
        throw new Error(uiI18n.t('err.actor.invalidName', { name: newName }));
    }
    if (oldName === newName) throw new Error(uiI18n.t('err.actor.sameName'));

    const flow = ctx.flow;
    const config = ctx.config;

    const exists = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === oldName)
    ) || (flow.actors || []).includes(oldName);
    if (!exists) throw new Error(uiI18n.t('err.actor.notFound', { name: oldName }));

    const alreadyExists = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === newName)
    ) || (flow.actors || []).includes(newName);
    if (alreadyExists) throw new Error(uiI18n.t('err.actor.exists', { name: newName }));

    flow.actors = flow.actors || [];
    if (!flow.actors.includes(oldName)) flow.actors.push(oldName);
    flow.actors.push(newName);

    let copied = 0;
    for (const s of (config.states || [])) {
        const src = (s.actors || []).find(a => a.actor === oldName);
        if (!src) continue;
        const clone = JSON.parse(JSON.stringify(src));
        clone.actor = newName;
        s.actors.push(clone);
        copied++;
    }

    writeFlow(ctx);
    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.actor.created', {
            old: oldName,
            new: newName,
            details: copied
                ? uiI18n.t('msg.actor.createdDetails', {
                    states: uiI18n.plural(copied, 'states')
                })
                : ''
        })
    );
}

/* ---------- Авторизация актора ---------- */

async function handleSaveActorAuth(ctx, panel, payload) {
    const { actorName, roles } = payload || {};
    if (!actorName) throw new Error(uiI18n.t('err.actor.noName'));
    if (!Array.isArray(roles)) throw new Error(uiI18n.t('err.auth.rolesNotArray'));

    if (!ctx.authPath || !ctx.auth) {
        throw new Error(uiI18n.t('err.auth.noFile'));
    }

    const auth = ctx.auth;
    const idx = indexOf(auth.header);
    const docName = path.basename(path.dirname(ctx.flowPath));

    const keep = auth.rows.filter(row => {
        const codeName = row[idx['CodeName']];
        const conceptType = row[idx['ConceptTypeName']];
        const permType = row[idx['PermissionType']];
        const assigned = row[idx['AssignedPermission']];

        const isThisActor = assigned === actorName &&
            codeName === docName &&
            conceptType === 'DocumentConfiguration' &&
            permType === 'Allow Actor';
        return !isThisActor;
    });

    for (const role of roles) {
        if (!role) continue;
        const row = new Array(auth.header.length).fill('');
        row[idx['ApplicationRole']] = role;
        row[idx['PermissionType']] = 'Allow Actor';
        row[idx['CodeName']] = docName;
        row[idx['ConceptTypeName']] = 'DocumentConfiguration';
        row[idx['AssignedPermission']] = actorName;
        row[idx['AssignmentOperator']] = 'Add';
        keep.push(row);
    }

    auth.rows = keep;

    writeAuth(ctx);
    loadData(ctx);
    pushRender(ctx, panel);

    vscode.window.showInformationMessage(
        uiI18n.t('msg.auth.actorSaved', {
            name: actorName,
            roles: uiI18n.plural(roles.length, 'roles')
        })
    );
}

async function handleRenameActor(ctx, panel, payload) {
    const oldName = (payload && payload.oldName || '').trim();
    const newName = (payload && payload.newName || '').trim();
    if (!oldName || !newName) throw new Error(uiI18n.t('err.actor.noOldNew'));
    if (oldName === newName) throw new Error(uiI18n.t('err.actor.sameName'));
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
        throw new Error(uiI18n.t('err.actor.invalidName', { name: newName }));
    }

    const flow = ctx.flow;
    const config = ctx.config;
    const csv = ctx.csv;

    const exists = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === oldName)
    ) || (flow.actors || []).includes(oldName);
    if (!exists) throw new Error(uiI18n.t('err.actor.notFound', { name: oldName }));

    const conflict = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === newName)
    ) || (flow.actors || []).includes(newName);
    if (conflict) throw new Error(uiI18n.t('err.actor.exists', { name: newName }));

    if (Array.isArray(flow.actors)) {
        flow.actors = flow.actors.map(a => a === oldName ? newName : a);
    }

    for (const s of (config.states || [])) {
        for (const a of (s.actors || [])) {
            if (a.actor === oldName) a.actor = newName;
        }
    }

    if (csv && Array.isArray(csv.rows) && Array.isArray(csv.header)) {
        const idx = indexOf(csv.header);
        for (const row of csv.rows) {
            if (row[idx['ItemType']] !== 'actors') continue;
            const key = row[idx['TranslationKey']];
            const expr = row[idx['Expression']];
            if (key === oldName) row[idx['TranslationKey']] = newName;
            if (expr === oldName) row[idx['Expression']] = newName;
            const en = row[idx['Translation_en-US']];
            if (en === oldName) row[idx['Translation_en-US']] = newName;
        }
    }

    let authTouched = false;
    if (ctx.authPath && ctx.auth) {
        const auth = ctx.auth;
        const idx = indexOf(auth.header);
        const docName = path.basename(path.dirname(ctx.flowPath));
        for (const row of auth.rows) {
            const assigned = row[idx['AssignedPermission']];
            const codeName = row[idx['CodeName']];
            const conceptType = row[idx['ConceptTypeName']];
            const permType = row[idx['PermissionType']];
            if (assigned === oldName &&
                codeName === docName &&
                conceptType === 'DocumentConfiguration' &&
                permType === 'Allow Actor') {
                row[idx['AssignedPermission']] = newName;
                authTouched = true;
            }
        }
    }

    writeAll(ctx);
    if (authTouched) writeAuth(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        uiI18n.t('msg.actor.renamed', { old: oldName, new: newName })
    );
}

/* ---------- initialState ---------- */

async function handleSetInitialState(ctx, panel, stateName) {
    const name = (stateName || '').trim();

    if (name && !(ctx.flow.states || []).some(s => s.name === name)) {
        throw new Error(uiI18n.t('err.state.notFound', { name }));
    }

    ctx.flow.initialState = name;
    writeFlow(ctx);
    loadData(ctx);
    pushRender(ctx, panel);

    vscode.window.showInformationMessage(
        name
            ? uiI18n.t('msg.initialState.set', { name })
            : uiI18n.t('msg.initialState.cleared')
    );
}

/* ---------- Сравнение документов ---------- */

async function handleListDocumentsForCompare(ctx) {
    const { listDocumentsForCompare } = require('./storage');
    const docs = listDocumentsForCompare(ctx);
    const currentDocName = path.basename(path.dirname(ctx.flowPath));
    return docs.map(d => ({
        docName: d.docName,
        flowPath: d.flowPath,
        pkgName: d.pkgName,
        isCurrent: d.docName === currentDocName
    }));
}

async function handleCompareDocuments(ctx, payload) {
    const { otherFlowPath } = payload || {};
    if (!otherFlowPath) throw new Error(uiI18n.t('err.compare.noOtherPath'));

    const { loadDocumentForCompare } = require('./storage');
    const otherDoc = loadDocumentForCompare(otherFlowPath);
    if (!otherDoc) throw new Error(uiI18n.t('err.compare.readFailed', { path: otherFlowPath }));

    const { buildDiff } = require('./compare-diff');
    return buildDiff(ctx, otherDoc);
}

async function handleSetUiLanguage(payload) {
    const lang = payload && payload.lang;
    if (!lang) return;

    const cfg = vscode.workspace.getConfiguration('adinsureDocFlow');
    const inspect = cfg.inspect('uiLanguage') || {};
    const hasWorkspaceOverride = inspect.workspaceValue !== undefined
        || inspect.workspaceFolderValue !== undefined;
    const target = hasWorkspaceOverride
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;

    await cfg.update('uiLanguage', lang, target);
}

async function handleApplyCompareDocuments(ctx, panel, payload) {
    const { otherFlowPath, actions } = payload || {};
    if (!otherFlowPath) throw new Error(uiI18n.t('err.compare.noOtherPath'));
    if (!Array.isArray(actions) || !actions.length) {
        throw new Error(uiI18n.t('err.compare.noActions'));
    }

    const { loadDocumentForCompare } = require('./storage');
    const otherDoc = loadDocumentForCompare(otherFlowPath);
    if (!otherDoc) throw new Error(uiI18n.t('err.compare.readFailed', { path: otherFlowPath }));

    const result = applyDiff(ctx, otherDoc, actions);

    writeAll(ctx);
    writeUi(ctx);
    if (result.touched.auth) writeAuth(ctx);

    loadData(ctx);
    pushRender(ctx, panel);

    vscode.window.showInformationMessage(
        uiI18n.t('msg.compare.applied', {
            n: String(result.applied),
            warnings: result.warnings.length
                ? uiI18n.t('msg.compare.warnings', { n: String(result.warnings.length) })
                : ''
        })
    );

    return result;
}

module.exports = {
    handleToggleTerminal,
    handleDeleteState,
    handleAddState,
    handleEditState,
    handleSaveGraph,
    handleDeleteTransitions,
    handleEditTransition,
    handleGenerateFlow,
    handleSaveAuth,
    handleDeleteActorFromState,
    handleCopyActor,
    handleAddTransition,
    handleOpenFlowRule,
    handleOpenClientAction,
    handleDeleteClientAction,
    handleCreateClientAction,
    handleRenameClientAction,
    handleAddAttachmentType,
    handleRemoveAttachmentType,
    handleAddAttachmentToDoc,
    handleRemoveAttachmentFromDoc,
    handleAddActor,
    handleDeleteActor,
    handleAddStateToActor,
    handleDeleteStateFromActor,
    handleAddTransitionToActor,
    handleDeleteTransitionFromActor,
    handleEditActorPerm,
    handleDuplicateActor,
    handleSaveActorAuth,
    handleRenameActor,
    handleListDocumentsForCompare,
    handleCompareDocuments,
    handleApplyCompareDocuments,
    handleSetInitialState,
    handleSetUiLanguage,
};