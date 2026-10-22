const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { indexOf } = require('./utils');
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

    writeAll(ctx);
    writeUi(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(`Состояние "${stateName}" удалено.`);
}

/* ---------- add ---------- */
async function handleAddState(ctx, panel, payload) {
    const { name, ru, isTerminal, outgoingTransitions = [], permissions = [], lang } = payload || {};
    const trLang = lang || 'ru-RU';
    const trCol = 'Translation_' + trLang;

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
    vscode.window.showInformationMessage(`Состояние "${name}" добавлено.`);
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

    /* 5. Переименование переходов */
    const idx = indexOf(csv.header);
    for (const [oldN, newN] of Object.entries(renameMap)) {
        try { renameFlowRule(ctx, oldN, newN); }
        catch (e) { console.warn('flowRules rename failed:', oldN, '→', newN, e.message); }
        // configuration.json → transitions — это объект, не массив.
        // Переименовываем ключ, чтобы transitionEffects не потерялись.
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
    vscode.window.showInformationMessage(`Состояние "${name}" сохранено.`);
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
                'flowRules не переименован: ' + e.message
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
    vscode.window.showInformationMessage(`Переход "${name}" сохранён.`);
}

async function handleAddTransition(ctx, panel, payload) {
    const {
        from, name, to, ru,
        actionToRunBefore, serverSideEvents, allowOnValidationErrors,
        lang
    } = payload || {};
    const trLangA = lang || 'ru-RU';
    const trColA = 'Translation_' + trLangA;

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
                // configuration.json → transitions (объект, не массив)
                if (config.transitions && typeof config.transitions === 'object' &&
                    !Array.isArray(config.transitions)) {
                    for (const n of list) delete config.transitions[n];
                }
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

async function handleOpenClientAction(ctx, transitionName, actionName) {
    if (!actionName || !String(actionName).trim()) {
        throw new Error('Не задано значение actionToRunBefore.');
    }
    if (!/^[A-Za-z0-9_$\-]+$/.test(actionName)) {
        throw new Error('Некорректное имя action: ' + actionName);
    }

    // 1. Локальный файл в текущем документе
    let p = clientActionPath(ctx, actionName);

    // 2. Fallback — поиск по всему проекту
    if (!fs.existsSync(p)) {
        const found = findClientActionInProject(ctx, actionName);
        if (found) p = found;
    }

    // 3. Не нашли — предложить создать локально
    if (!fs.existsSync(p)) {
        const answer = await vscode.window.showInformationMessage(
            'Файл ClientAction/' + actionName + '.js не найден. Создать в текущем документе?',
            { modal: true },
            'Создать',
            'Отмена'
        );
        if (answer !== 'Создать') return;
        writeClientAction(ctx, actionName, clientActionTemplate(actionName));
        p = clientActionPath(ctx, actionName);
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
}

async function handleDeleteClientAction(ctx, actionName) {
    if (!actionName || !/^[A-Za-z0-9_$\-]+$/.test(actionName)) {
        throw new Error('Некорректное имя action: ' + (actionName || ''));
    }

    const p = clientActionPath(ctx, actionName);
    if (!fs.existsSync(p)) {
        vscode.window.showInformationMessage('Файл ClientAction/' + actionName + '.js не найден.');
        return;
    }

    const answer = await vscode.window.showWarningMessage(
        'Удалить файл ClientAction/' + actionName + '.js?',
        { modal: true },
        'Удалить'
    );
    if (answer !== 'Удалить') return;

    fs.unlinkSync(p);
    vscode.window.showInformationMessage('Удалён ClientAction/' + actionName + '.js');
}

async function handleCreateClientAction(ctx, actionName) {
    if (!actionName || !/^[A-Za-z0-9_$\-]+$/.test(actionName)) {
        throw new Error('Некорректное имя action: ' + (actionName || ''));
    }

    const p = clientActionPath(ctx, actionName);
    if (fs.existsSync(p)) {
        // Файл уже есть — просто открываем, чтобы пользователь видел, что привязано.
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
    }

    writeClientAction(ctx, actionName, clientActionTemplate(actionName));
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage('Создан ClientAction/' + actionName + '.js');
}

async function handleRenameClientAction(ctx, oldName, newName) {
    renameClientAction(ctx, oldName, newName);

    // Пытаемся переименовать имя функции внутри файла. Меняем только точное
    // вхождение `function <oldName>(` — если файл не следует шаблону и имя
    // функции отличается — оставляем как есть.
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
        'ClientAction/' + oldName + '.js → ' + newName + '.js'
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
        throw new Error('Некорректный код вложения.');
    }
    if (!ctx.attachmentTypeDir) {
        throw new Error('Справочник AttachmentType не найден (configuration/@config-*/infrastructure/masterEntity/AttachmentType).');
    }
    addAttachmentType(
        ctx.attachmentTypeDir,
        code,
        trValue != null ? trValue : (ru || code),
        lang || 'ru-RU'
    );
    invalidateProjectCache(ctx);
    await reloadAttachmentCatalog(ctx);
    // pushRender НЕ делаем — окно модалки должно остаться открытым.
    // Полный reload произойдёт при закрытии.
}

async function handleRemoveAttachmentType(ctx, panel, code) {
    if (!code) throw new Error('Не передан код вложения.');
    if (!ctx.attachmentTypeDir) {
        throw new Error('Справочник AttachmentType не найден.');
    }
    removeAttachmentType(ctx.attachmentTypeDir, code);
    await reloadAttachmentCatalog(ctx);
    // pushRender НЕ делаем — окно модалки должно остаться открытым.
}

/* ---------- AttachmentType: вложения документа ---------- */

function buildDefaultAttachmentRestrictions(actors, code, mode) {
    // mode: 'none' | 'read-all' | 'by-template'
    // Возвращает массив {actor, permissions}, которые надо добавить.
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
            // 'none' — ничего не делаем
        }
    }
    return result;
}

async function handleAddAttachmentToDoc(ctx, panel, payload) {
    const { code, mode } = payload || {};
    if (!code) throw new Error('Не передан код вложения.');
    const m = mode || 'none';
    if (!['none', 'read-all', 'by-template'].includes(m)) {
        throw new Error('Неизвестный режим прав: ' + m);
    }

    const config = ctx.config;
    config.attachments = config.attachments || [];

    if (config.attachments.some(a => a.attachmentType === code)) {
        throw new Error('Вложение «' + code + '» уже есть в документе.');
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
    vscode.window.showInformationMessage('Вложение «' + code + '» добавлено в документ.');
}

async function handleRemoveAttachmentFromDoc(ctx, panel, code) {
    if (!code) throw new Error('Не передан код вложения.');
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
    vscode.window.showInformationMessage('Вложение «' + code + '» удалено из документа.');
}

/* ---------- Акторы (view «Акторы») ---------- */

async function handleAddActor(ctx, panel, payload) {
    const name = (payload && payload.name || '').trim();
    if (!name) throw new Error('Не передано имя актора.');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error('Некорректное имя актора: ' + name);
    }

    const flow = ctx.flow;
    flow.actors = flow.actors || [];
    if (flow.actors.includes(name)) {
        throw new Error('Актор «' + name + '» уже есть в documentFlow.json.');
    }
    flow.actors.push(name);

    writeFlow(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage('Актор «' + name + '» добавлен.');
}

async function handleDeleteActor(ctx, panel, payload) {
    const name = (payload && payload.name || '').trim();
    if (!name) throw new Error('Не передано имя актора.');

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

    // authorization.csv — убираем все назначения этого актора в этом документе.
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
        vscode.window.showInformationMessage('Актор «' + name + '» нигде не найден.');
        return;
    }

    writeAll(ctx);
    if (authTouched) writeAuth(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage('Актор «' + name + '» удалён из всех состояний и авторизации.');
}

async function handleAddStateToActor(ctx, panel, payload) {
    const actor = (payload && payload.actor || '').trim();
    const state = (payload && payload.state || '').trim();
    if (!actor) throw new Error('Не передано имя актора.');
    if (!state) throw new Error('Не передано имя состояния.');

    const config = ctx.config;
    const flow = ctx.flow;

    if (!(flow.states || []).some(s => s.name === state)) {
        throw new Error('Состояние «' + state + '» не найдено.');
    }

    let cs = (config.states || []).find(s => s.name === state);
    if (!cs) {
        cs = { name: state, actors: [] };
        config.states = config.states || [];
        config.states.push(cs);
    }
    cs.actors = cs.actors || [];
    if (cs.actors.some(a => a.actor === actor)) {
        throw new Error('Актор «' + actor + '» уже есть в состоянии «' + state + '».');
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
    if (!actor || !state) throw new Error('Не переданы actor/state.');

    const cs = (ctx.config.states || []).find(s => s.name === state);
    if (!cs || !Array.isArray(cs.actors)) {
        throw new Error('Состояние «' + state + '» не найдено.');
    }

    const before = cs.actors.length;
    cs.actors = cs.actors.filter(a => a.actor !== actor);
    if (cs.actors.length === before) {
        throw new Error('Актор «' + actor + '» не найден в состоянии «' + state + '».');
    }

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
}

async function handleAddTransitionToActor(ctx, panel, payload) {
    const actor = (payload && payload.actor || '').trim();
    const transition = (payload && payload.transition || '').trim();
    if (!actor || !transition) throw new Error('Не переданы actor/transition.');

    const flow = ctx.flow;
    const config = ctx.config;

    const tr = (flow.transitions || []).find(t => t.name === transition);
    if (!tr) throw new Error('Переход «' + transition + '» не найден.');
    const fromState = tr.from;
    if (!fromState) throw new Error('У перехода нет состояния-источника.');

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
            'У актора «' + actor + '» уже есть переход «' + transition + '».'
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
    if (!actor || !transition) throw new Error('Не переданы actor/transition.');

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
            'У актора «' + actor + '» нет перехода «' + transition + '».'
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
        throw new Error('Не переданы stateName/actorName/perm.');
    }

    const config = ctx.config;
    const cs = (config.states || []).find(s => s.name === stateName);
    if (!cs || !Array.isArray(cs.actors)) {
        throw new Error('Состояние «' + stateName + '» не найдено.');
    }

    const idx = cs.actors.findIndex(a => a.actor === actorName);
    if (idx < 0) {
        throw new Error('Актор «' + actorName + '» не найден в состоянии «' + stateName + '».');
    }

    const original = cs.actors[idx];
    cs.actors[idx] = buildActorConfig(perm, original);

    writeConfig(ctx);
    loadData(ctx);
    pushRender(ctx, panel);
    vscode.window.showInformationMessage(
        'Права актора «' + actorName + '» в состоянии «' + stateName + '» сохранены.'
    );
}

async function handleDuplicateActor(ctx, panel, payload) {
    const oldName = (payload && payload.oldName || '').trim();
    const newName = (payload && payload.newName || '').trim();
    if (!oldName || !newName) throw new Error('Не переданы oldName/newName.');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
        throw new Error('Некорректное имя актора: ' + newName);
    }
    if (oldName === newName) throw new Error('Имя совпадает с исходным.');

    const flow = ctx.flow;
    const config = ctx.config;

    // Убеждаемся, что исходный актор вообще существует
    const exists = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === oldName)
    ) || (flow.actors || []).includes(oldName);
    if (!exists) throw new Error('Актор «' + oldName + '» не найден.');

    // Проверяем, что нового имени ещё нет
    const alreadyExists = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === newName)
    ) || (flow.actors || []).includes(newName);
    if (alreadyExists) throw new Error('Актор «' + newName + '» уже существует.');

    // 1. Глобальный список акторов
    flow.actors = flow.actors || [];
    if (!flow.actors.includes(oldName)) flow.actors.push(oldName);
    flow.actors.push(newName);

    // 2. Копируем записи актора во всех состояниях, где он есть
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
        'Актор «' + newName + '» создан как копия «' + oldName + '»' +
        (copied ? ' (' + copied + ' состояни' + (copied === 1 ? 'е' : 'й') + ')' : '') + '.'
    );
}

/* ---------- Авторизация актора ---------- */

async function handleSaveActorAuth(ctx, panel, payload) {
    const { actorName, roles } = payload || {};
    if (!actorName) throw new Error('Не передано имя актора.');
    if (!Array.isArray(roles)) throw new Error('roles должен быть массивом.');

    if (!ctx.authPath || !ctx.auth) {
        throw new Error('Файл authorization.csv не найден.');
    }

    const auth = ctx.auth;
    const idx = indexOf(auth.header);
    const docName = path.basename(path.dirname(ctx.flowPath));

    // Убираем все текущие строки Allow Actor для этого актора в этом документе.
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

    // Добавляем новые.
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
        'Авторизация актора «' + actorName + '» сохранена (' + roles.length + ' ролей).'
    );
}

async function handleRenameActor(ctx, panel, payload) {
    const oldName = (payload && payload.oldName || '').trim();
    const newName = (payload && payload.newName || '').trim();
    if (!oldName || !newName) throw new Error('Не переданы oldName/newName.');
    if (oldName === newName) throw new Error('Имя совпадает с исходным.');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
        throw new Error('Некорректное имя актора: ' + newName);
    }

    const flow = ctx.flow;
    const config = ctx.config;
    const csv = ctx.csv;

    // Проверяем, что старого актора вообще можно найти, а нового ещё нет.
    const exists = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === oldName)
    ) || (flow.actors || []).includes(oldName);
    if (!exists) throw new Error('Актор «' + oldName + '» не найден.');

    const conflict = (config.states || []).some(s =>
        (s.actors || []).some(a => a.actor === newName)
    ) || (flow.actors || []).includes(newName);
    if (conflict) throw new Error('Актор «' + newName + '» уже существует.');

    // 1. documentFlow.json → actors[]
    if (Array.isArray(flow.actors)) {
        flow.actors = flow.actors.map(a => a === oldName ? newName : a);
    }

    // 2. configuration.json → states[].actors[].actor
    for (const s of (config.states || [])) {
        for (const a of (s.actors || [])) {
            if (a.actor === oldName) a.actor = newName;
        }
    }

    // 3. translation.csv → строки ItemType=actors
    if (csv && Array.isArray(csv.rows) && Array.isArray(csv.header)) {
        const idx = indexOf(csv.header);
        for (const row of csv.rows) {
            if (row[idx['ItemType']] !== 'actors') continue;
            const key = row[idx['TranslationKey']];
            const expr = row[idx['Expression']];
            if (key === oldName) row[idx['TranslationKey']] = newName;
            if (expr === oldName) row[idx['Expression']] = newName;
            // Translation_en-US исторически совпадает с именем — переписываем тоже
            const en = row[idx['Translation_en-US']];
            if (en === oldName) row[idx['Translation_en-US']] = newName;
        }
    }

    // 4. authorization.csv → AssignedPermission
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
        'Актор «' + oldName + '» переименован в «' + newName + '».'
    );
}

async function handleApplyCompareDocuments(ctx, panel, payload) {
    const { otherFlowPath, actions } = payload || {};
    if (!otherFlowPath) throw new Error('Не передан путь к документу-образцу.');
    if (!Array.isArray(actions) || !actions.length) {
        throw new Error('Не выбраны действия для применения.');
    }

    const { loadDocumentForCompare } = require('./storage');
    const otherDoc = loadDocumentForCompare(otherFlowPath);
    if (!otherDoc) throw new Error('Не удалось прочитать образец: ' + otherFlowPath);

    const result = applyDiff(ctx, otherDoc, actions);

    writeAll(ctx);
    writeUi(ctx);
    if (result.touched.auth) writeAuth(ctx);

    loadData(ctx);
    pushRender(ctx, panel);

    vscode.window.showInformationMessage(
        'Применено действий: ' + result.applied +
        (result.warnings.length ? ' (предупреждений: ' + result.warnings.length + ')' : '')
    );

    return result;
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
    if (!otherFlowPath) throw new Error('Не передан путь к документу для сравнения.');

    const { loadDocumentForCompare } = require('./storage');
    const otherDoc = loadDocumentForCompare(otherFlowPath);
    if (!otherDoc) throw new Error('Не удалось прочитать документ: ' + otherFlowPath);

    const { buildDiff } = require('./compare');
    return buildDiff(ctx, otherDoc);
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
    handleApplyCompareDocuments
};