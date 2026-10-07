const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { indexOf } = require('./utils');
const {
    SVG_STATE_W, SVG_STATE_H,
    buildActorConfig, registerActorsInFlow, detectFlowName
} = require('./transforms');
const {
    loadData, writeAll, writeFlow, writeUi, writeAuth, pushRender, writeConfig
} = require('./storage');
const {
    flowRulePath, writeFlowRule, deleteFlowRule, renameFlowRule, flowRuleTemplate
} = require('./flow-rules');

/* ---------- toggle isTerminal ---------- */
async function handleToggleTerminal(ctx, panel, stateName, value) {
    const s = (ctx.flow.states || []).find(x => x.name === stateName);
    if (!s) throw new Error(`Состояние "${stateName}" не найдено.`);
    if (value) s.isTerminal = true;
    else delete s.isTerminal;
    writeFlow(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
}

/* ---------- delete ---------- */
async function handleDeleteState(ctx, panel, stateName) {
    const { flow, config, csv } = ctx;

    const removedTransitions = (flow.transitions || [])
        .filter(t => t.from === stateName || t.to === stateName)
        .map(t => t.name);

    for (const n of removedTransitions) {
        try { deleteFlowRule(ctx, n); }
        catch (e) { console.warn('flowRules delete failed:', n, e.message); }
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

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(`Состояние "${stateName}" удалено.`);
}

/* ---------- add ---------- */
async function handleAddState(ctx, panel, payload) {
    const { name, ru, isTerminal, outgoingTransitions = [], permissions = [] } = payload || {};

    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error('Код состояния должен быть идентификатором (буквы/цифры/_, начиная с буквы).');
    }
    const { flow, config, csv } = ctx;
    if ((flow.states || []).some(s => s.name === name)) {
        throw new Error(`Состояние "${name}" уже существует в documentFlow.json.`);
    }
    for (const t of outgoingTransitions) {
        if (!t.name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(t.name)) {
            throw new Error(`Некорректный код перехода: "${t.name || ''}".`);
        }
        if ((flow.transitions || []).some(x => x.name === t.name)) {
            throw new Error(`Переход "${t.name}" уже существует.`);
        }
        if (!t.to) throw new Error(`У перехода "${t.name}" не указано состояние To.`);
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
    const makeRow = (itemType, translationKey, expression, ru) => {
        const row = new Array(csv.header.length).fill('');
        row[idx['ConfigurationType']] = 'DocumentFlowDefinition';
        row[idx['ConfigurationName']] = flowName;
        row[idx['ItemType']] = itemType;
        row[idx['TranslationKey']] = translationKey;
        row[idx['Expression']] = expression;
        row[idx['Translation_en-US']] = expression;
        row[idx['Translation_ru-RU']] = ru;
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
    vscode.window.showInformationMessage(`Состояние "${name}" добавлено.`);
}

/* ---------- edit ---------- */
async function handleEditState(ctx, panel, payload) {
    const {
        originalName, name, ru, isTerminal,
        outgoingTransitions = [], permissions = []
    } = payload || {};

    if (!originalName) throw new Error('Не передан originalName.');
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error('Код состояния должен быть идентификатором (буквы/цифры/_, начиная с буквы).');
    }

    const { flow, config, csv } = ctx;
    const stateRenamed = name !== originalName;

    if (stateRenamed && (flow.states || []).some(s => s.name === name)) {
        throw new Error(`Состояние "${name}" уже существует — переименование невозможно.`);
    }

    const oldOutgoing = (flow.transitions || []).filter(t => t.from === originalName);
    const oldNames = oldOutgoing.map(t => t.name);

    const keptOriginalNames = new Set(
        outgoingTransitions.filter(t => t.originalName).map(t => t.originalName)
    );
    const removedNames = oldNames.filter(n => !keptOriginalNames.has(n));

    const renameMap = {};
    for (const t of outgoingTransitions) {
        if (t.originalName && t.originalName !== t.name) {
            renameMap[t.originalName] = t.name;
        }
    }

    for (const t of outgoingTransitions) {
        if (!t.name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(t.name)) {
            throw new Error(`Некорректный код перехода: "${t.name || ''}".`);
        }
        if (!t.to) throw new Error(`У перехода "${t.name}" не указано состояние To.`);
    }
    const finalSet = new Set();
    for (const t of outgoingTransitions) {
        if (finalSet.has(t.name)) throw new Error(`Дублирующийся код перехода в форме: "${t.name}".`);
        finalSet.add(t.name);
    }
    const foreignNames = new Set(
        (flow.transitions || []).filter(t => t.from !== originalName).map(t => t.name)
    );
    for (const t of outgoingTransitions) {
        if (foreignNames.has(t.name)) throw new Error(`Переход "${t.name}" уже существует в другом состоянии.`);
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
                row[idx0['Translation_en-US']] = name;
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

    /* 3. RU-перевод */
    {
        const idx = indexOf(csv.header);
        let found = false;
        for (const row of csv.rows) {
            if (row[idx['ItemType']] === 'states' && row[idx['TranslationKey']] === `states@${name}`) {
                row[idx['Translation_ru-RU']] = ru || name;
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
            row[idx['Translation_ru-RU']] = ru || name;
            csv.rows.push(row);
        }
    }

    /* 4. Удаление снятых переходов */
    if (removedNames.length) {
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

    /* 5. Переименование переходов */
    const idx = indexOf(csv.header);
    for (const [oldN, newN] of Object.entries(renameMap)) {
        try { renameFlowRule(ctx, oldN, newN); }
        catch (e) { console.warn('flowRules rename failed:', oldN, '→', newN, e.message); }
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
                row[idx['Translation_en-US']] = newN;
            }
        }
        for (const it of (ctx.ui || [])) {
            if (it.id === `transition_${oldN}`) it.id = `transition_${newN}`;
        }
    }

    /* 6. Обновление/добавление переходов */
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
            row[idx['Translation_ru-RU']] = t.ru || t.name;
            csv.rows.push(row);
        }
        for (const row of csv.rows) {
            if (row[idx['ItemType']] === 'transitions' && row[idx['TranslationKey']] === `transitions@${t.name}@Title`) {
                row[idx['Translation_ru-RU']] = t.ru || t.name;
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
    cs.actors = permissions.map(p => buildActorConfig(p));

    registerActorsInFlow(flow, permissions);

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(`Состояние "${name}" сохранено.`);
}

async function handleEditTransition(ctx, panel, payload) {
    const {
        originalName, name, to, ru,
        actionToRunBefore, serverSideEvents, allowOnValidationErrors
    } = payload || {};

    if (!originalName) throw new Error('Не передан originalName.');
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error('Некорректный код перехода.');
    }
    if (!to) throw new Error('Не указано целевое состояние.');

    const { flow, config, csv } = ctx;

    const tr = (flow.transitions || []).find(t => t.name === originalName);
    if (!tr) throw new Error(`Переход "${originalName}" не найден.`);

    if (name !== originalName && (flow.transitions || []).some(t => t.name === name)) {
        throw new Error(`Переход "${name}" уже существует.`);
    }
    if (!(flow.states || []).some(s => s.name === to)) {
        throw new Error(`Состояние "${to}" не найдено.`);
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
                row[idx['Translation_en-US']] = name;
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
                'flowRules не переименован: ' + e.message
            );
        }
    }

    /* 4. RU-перевод */
    {
        const idx = indexOf(csv.header);
        let found = false;
        for (const row of csv.rows) {
            if (row[idx['ItemType']] === 'transitions' &&
                row[idx['TranslationKey']] === `transitions@${name}@Title`) {
                row[idx['Translation_ru-RU']] = ru || name;
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
            row[idx['Translation_ru-RU']] = ru || name;
            csv.rows.push(row);
        }
    }

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(`Переход "${name}" сохранён.`);
}

async function handleAddTransition(ctx, panel, payload) {
    const {
        from, name, to, ru,
        actionToRunBefore, serverSideEvents, allowOnValidationErrors
    } = payload || {};

    if (!from) throw new Error('Не указано исходное состояние.');
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error('Некорректный код перехода.');
    }
    if (!to) throw new Error('Не указано целевое состояние.');

    const { flow, config, csv } = ctx;

    if (!(flow.states || []).some(s => s.name === from)) {
        throw new Error('Состояние-источник не найдено: ' + from);
    }
    if (!(flow.states || []).some(s => s.name === to)) {
        throw new Error('Целевое состояние не найдено: ' + to);
    }
    if ((flow.transitions || []).some(t => t.name === name)) {
        throw new Error('Переход «' + name + '» уже существует.');
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

    // translation.csv
    const idx = indexOf(csv.header);
    let found = false;
    for (const row of csv.rows) {
        if (row[idx['ItemType']] === 'transitions' &&
            row[idx['TranslationKey']] === `transitions@${name}@Title`) {
            row[idx['Translation_ru-RU']] = ru || name;
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
        row[idx['Translation_ru-RU']] = ru || name;
        csv.rows.push(row);
    }

    writeAll(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage('Переход «' + name + '» создан.');
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
    vscode.window.showInformationMessage('Позиции сохранены в documentFlow.ui.json');
}

async function handleDeleteTransitions(ctx, panel, names) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (!list.length) return;

    const { flow, config, csv } = ctx;

    // documentFlow.json
    flow.transitions = (flow.transitions || []).filter(t => !list.includes(t.name));

    // configuration.json — чистим ссылки у всех акторов всех состояний
    for (const s of (config.states || [])) {
        for (const a of (s.actors || [])) {
            if (Array.isArray(a.transitions)) {
                a.transitions = a.transitions.filter(t => !list.includes(t));
            }
        }
    }

    // translation.csv
    const idx = indexOf(csv.header);
    csv.rows = csv.rows.filter(row => {
        if (row[idx['ItemType']] !== 'transitions') return true;
        const m = String(row[idx['TranslationKey']] || '').match(/^transitions@(.+?)@Title$/);
        if (!m) return true;
        return !list.includes(m[1]);
    });

    // documentFlow.ui.json
    ctx.ui = (ctx.ui || []).filter(item => {
        if (!item.id || !item.id.startsWith('transition_')) return true;
        const n = item.id.slice('transition_'.length);
        return !list.includes(n);
    });

    for (const n of list) {
        try { deleteFlowRule(ctx, n); }
        catch (e) { console.warn('flowRules delete failed:', n, e.message); }
    }

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        list.length === 1
            ? `Переход "${list[0]}" удалён.`
            : `Удалено переходов: ${list.length}.`
    );
}

function upsertCsv(csv, itemType, translationKey, expression, ru, flowName) {
    const idx = indexOf(csv.header);
    for (const row of csv.rows) {
        if (row[idx['ItemType']] === itemType && row[idx['TranslationKey']] === translationKey) {
            row[idx['Translation_ru-RU']] = ru;
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
    row[idx['Translation_ru-RU']] = ru;
    csv.rows.push(row);
}

async function handleGenerateFlow(ctx, panel, payload) {
    const targetStates = (payload && payload.states) || [];
    const targetTransitions = (payload && payload.transitions) || [];

    const { flow, config, csv } = ctx;

    flow.states = flow.states || [];
    flow.transitions = flow.transitions || [];
    flow.actors = flow.actors || [];
    config.states = config.states || [];

    const currentStateNames = new Set(flow.states.map(s => s.name));
    const currentTransitionNames = new Set(flow.transitions.map(t => t.name));
    const targetStateNames = new Set(targetStates.map(s => s.name));
    const targetTransitionNames = new Set(targetTransitions.map(t => t.name));

    /* 1. Удаляем состояния, которых нет в target (вместе с их переходами) */
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

    /* 3. Чистим ссылки на удалённые переходы во всех акторах */
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

    /* 6. Обновляем CSV: удаляем лишние строки + upsert для target */
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
        upsertCsv(csv, 'states', `states@${s.name}`, s.name, s.ru || s.name, flowName);
    }
    for (const t of targetTransitions) {
        upsertCsv(csv, 'transitions', `transitions@${t.name}@Title`, t.name, t.ru || t.name, flowName);
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

    /* 8. initialState — если пусто, ставим первый */
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
        'Каркас сохранён: ' + flow.states.length + ' состояний, ' +
        flow.transitions.length + ' переходов.'
    );
}

async function handleSaveAuth(ctx, panel, payload) {
    if (!ctx.authPath || !ctx.auth) {
        throw new Error('Файл authorization.csv не найден.');
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
            throw new Error('У каждой строки должны быть заполнены ApplicationRole и Actor.');
        }

        const key = role + '|' + actor + '|' + op;
        if (seen.has(key)) {
            throw new Error('Дубликат строки: ' + role + ' / ' + actor + ' / ' + op);
        }
        seen.add(key);

        keep.push(buildRow(role, actor, op));
    }

    auth.rows = keep;

    writeAuth(ctx);
    loadData(ctx);
    pushRender(ctx, panel);

    vscode.window.showInformationMessage(
        'Авторизация сохранена: ' + newRows.length + ' строк для ' + docName + '.'
    );
}

async function handleDeleteActorFromState(ctx, panel, payload) {
    const { stateName, actorName } = payload || {};
    if (!stateName || !actorName) throw new Error('Не переданы stateName/actorName.');

    const cs = (ctx.config.states || []).find(s => s.name === stateName);
    if (!cs) throw new Error('Состояние не найдено: ' + stateName);
    if (!Array.isArray(cs.actors)) cs.actors = [];

    const before = cs.actors.length;
    cs.actors = cs.actors.filter(a => a.actor !== actorName);
    if (cs.actors.length === before) {
        throw new Error('Актор «' + actorName + '» не найден в состоянии «' + stateName + '».');
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        'Актор «' + actorName + '» удалён из «' + stateName + '».'
    );
}

async function handleCopyActor(ctx, panel, payload) {
    const { fromState, fromActor, toActor, toStates } = payload || {};
    if (!fromState || !fromActor || !toActor ||
        !Array.isArray(toStates) || !toStates.length) {
        throw new Error('Не переданы обязательные параметры копирования.');
    }

    const srcCs = (ctx.config.states || []).find(s => s.name === fromState);
    if (!srcCs) throw new Error('Состояние-источник не найдено: ' + fromState);
    const srcActor = (srcCs.actors || []).find(a => a.actor === fromActor);
    if (!srcActor) throw new Error('Актор не найден в состоянии-источнике.');

    // Глубокая копия через JSON — блок прав содержит вложенные массивы/объекты.
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
            'Ничего не добавлено: во всех выбранных состояниях актор «' + toActor + '» уже есть.'
        );
        return;
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);

    const msg = 'Актор «' + toActor + '» скопирован в ' + added + ' состояни' +
        (added === 1 ? 'е' : 'й') +
        (skipped ? ', пропущено: ' + skipped : '') + '.';
    vscode.window.showInformationMessage(msg);
}

async function handleOpenFlowRule(ctx, transitionName) {
    if (!transitionName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(transitionName)) {
        throw new Error('Некорректный код перехода: ' + (transitionName || ''));
    }

    const p = flowRulePath(ctx, transitionName);

    if (!fs.existsSync(p)) {
        const answer = await vscode.window.showInformationMessage(
            'Файл flowRules/' + transitionName + '.js не найден. Создать?',
            { modal: true },
            'Создать',
            'Отмена'
        );
        if (answer !== 'Создать') return;
        writeFlowRule(ctx, transitionName, flowRuleTemplate(transitionName));
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
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
    handleOpenFlowRule
};