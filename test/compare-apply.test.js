require('./helpers/mockVscode');   // ← должно быть ДО require compare-apply

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { applyDiff } = require('../src/compare-apply');
const { makeCtx } = require('./helpers/makeCtx');
const { makeCsv } = require('./helpers/makeCsv');

/* ============ helpers ============ */

function act(kind, payload) {
    return { kind, payload };
}

// Состояние для flow
function st(name, extra) { return Object.assign({ name, operations: [] }, extra || {}); }

// Переход для flow
function tr(name, from, to, extra) { return Object.assign({ name, from, to }, extra || {}); }

// Конфиг-состояние
function cfgState(name, actors) { return { name, actors: actors || [] }; }

// Актёр в конфиге
function actor(name, extra) { return Object.assign({ actor: name }, extra || {}); }

const AUTH_HEADER = [
    'ApplicationRole', 'PermissionType', 'CodeName', 'ConceptTypeName',
    'AssignedPermission', 'AssignmentOperator'
];

function authRow(role, docName, actorName, op) {
    return [role, 'Allow Actor', docName, 'DocumentConfiguration', actorName, op || 'Add'];
}

/* ============ 1. CHANGE: простые свойства ============ */

test('applyDiff: changeInitialState sets flow.initialState', () => {
    const cur = makeCtx({});
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('changeInitialState', { value: 'Draft' })]);
        assert.equal(r.applied, 1);
        assert.equal(cur.ctx.flow.initialState, 'Draft');
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: changeStateTerminal toggles isTerminal', () => {
    const cur = makeCtx({ flow: { states: [st('Draft')], transitions: [] } });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('changeStateTerminal', { name: 'Draft', value: true })]);
        assert.equal(cur.ctx.flow.states[0].isTerminal, true);

        applyDiff(cur.ctx, oth.ctx, [act('changeStateTerminal', { name: 'Draft', value: false })]);
        assert.equal('isTerminal' in cur.ctx.flow.states[0], false);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: changeStateTerminal of missing state — warning, applied=0', () => {
    const cur = makeCtx({});
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('changeStateTerminal', { name: 'Missing', value: true })]);
        assert.equal(r.applied, 0);
        assert.equal(r.warnings.length, 1);
        assert.ok(r.warnings[0].includes('Missing'));
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: changeTransitionTo updates target', () => {
    const cur = makeCtx({
        flow: {
            states: [st('A'), st('B'), st('C')],
            transitions: [tr('A_X', 'A', 'B')]
        }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('changeTransitionTo', { name: 'A_X', value: 'C' })]);
        assert.equal(cur.ctx.flow.transitions[0].to, 'C');
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: changeTransitionServerSide toggles broadcastEvent', () => {
    const cur = makeCtx({
        flow: {
            states: [st('A'), st('B')],
            transitions: [tr('A_B', 'A', 'B')]
        }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('changeTransitionServerSide', { name: 'A_B', value: true })]);
        assert.deepEqual(cur.ctx.flow.transitions[0].broadcastEvent, { serverSideEvents: true });

        applyDiff(cur.ctx, oth.ctx, [act('changeTransitionServerSide', { name: 'A_B', value: false })]);
        assert.equal('broadcastEvent' in cur.ctx.flow.transitions[0], false);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: changeActorAllowComments toggles allowComments', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor')])] }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('changeActorAllowComments', {
            stateName: 'Draft', actorName: 'Editor', value: true
        })]);
        assert.equal(cur.ctx.config.states[0].actors[0].allowComments, true);

        applyDiff(cur.ctx, oth.ctx, [act('changeActorAllowComments', {
            stateName: 'Draft', actorName: 'Editor', value: false
        })]);
        assert.equal('allowComments' in cur.ctx.config.states[0].actors[0], false);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: changeActorAttachmentPerms sets permissions', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor', {
            attachmentsRestrictions: [{ attachmentType: 'Photo', permissions: ['Read'] }]
        })])] }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('changeActorAttachmentPerms', {
            stateName: 'Draft',
            actorName: 'Editor',
            attachmentType: 'Photo',
            permissions: ['Read', 'Update']
        })]);
        const rec = cur.ctx.config.states[0].actors[0];
        assert.deepEqual(
            rec.attachmentsRestrictions.find(r => r.attachmentType === 'Photo').permissions,
            ['Read', 'Update']
        );
    } finally { cur.cleanup(); oth.cleanup(); }
});

/* ============ 2. REMOVE: права актора ============ */

test('applyDiff: removeActorOp filters operations', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor', {
            operations: [{ name: 'Save' }, { name: 'Delete' }]
        })])] }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('removeActorOp', {
            stateName: 'Draft', actorName: 'Editor', opName: 'Save'
        })]);
        const rec = cur.ctx.config.states[0].actors[0];
        assert.deepEqual(rec.operations.map(o => o.name), ['Delete']);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: removeActorTransition filters transitions', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor', {
            transitions: ['A_B', 'A_C']
        })])] }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('removeActorTransition', {
            stateName: 'Draft', actorName: 'Editor', transitionName: 'A_B'
        })]);
        const rec = cur.ctx.config.states[0].actors[0];
        assert.deepEqual(rec.transitions, ['A_C']);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: removeActorAttachment filters attachmentsRestrictions', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor', {
            attachmentsRestrictions: [
                { attachmentType: 'Photo', permissions: ['Read'] },
                { attachmentType: 'Contract', permissions: ['Read'] }
            ]
        })])] }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('removeActorAttachment', {
            stateName: 'Draft', actorName: 'Editor', attachmentType: 'Photo'
        })]);
        const rec = cur.ctx.config.states[0].actors[0];
        assert.equal(rec.attachmentsRestrictions.length, 1);
        assert.equal(rec.attachmentsRestrictions[0].attachmentType, 'Contract');
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: removeActorFromState removes membership', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor'), actor('Viewer')])] }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('removeActorFromState', {
            stateName: 'Draft', actorName: 'Editor'
        })]);
        const cs = cur.ctx.config.states[0];
        assert.deepEqual(cs.actors.map(a => a.actor), ['Viewer']);
    } finally { cur.cleanup(); oth.cleanup(); }
});

/* ============ 3. REMOVE: переходы и состояния (каскад) ============ */

test('applyDiff: removeTransition cascades (flow, csv, ui, flowRules, actor transitions)', () => {
    const cur = makeCtx({
        flow: {
            states: [st('A'), st('B')],
            transitions: [tr('A_B', 'A', 'B')]
        },
        config: {
            states: [
                cfgState('A', [actor('Editor', { transitions: ['A_B'] })])
            ]
        },
        csv: makeCsv(
            ['ItemType', 'TranslationKey'],
            [
                { ItemType: 'transitions', TranslationKey: 'transitions@A_B@Title' }
            ]
        ),
        ui: [{ id: 'transition_A_B', waypoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }]
    });
    const oth = makeCtx({ docName: 'Other' });

    // Создаём фейковый flowRules-файл, чтобы deleteFlowRule что-то удалил
    const rulePath = path.join(path.dirname(cur.ctx.flowPath), 'flowRules', 'A_B.js');
    fs.writeFileSync(rulePath, '// stub');

    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('removeTransition', { name: 'A_B' })]);
        assert.equal(r.applied, 1);
        assert.deepEqual(cur.ctx.flow.transitions, []);
        assert.equal(cur.ctx.csv.rows.filter(row => {
            const k = row[1];
            return k === 'transitions@A_B@Title';
        }).length, 0);
        assert.equal(cur.ctx.ui.length, 0);
        assert.deepEqual(cur.ctx.config.states[0].actors[0].transitions, []);
        assert.equal(fs.existsSync(rulePath), false);
        assert.ok(r.touched.flowRules.includes('A_B'));
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: removeTransition of absent — warning, applied=0', () => {
    const cur = makeCtx({});
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('removeTransition', { name: 'X' })]);
        assert.equal(r.applied, 0);
        assert.equal(r.warnings.length, 1);
        assert.ok(r.warnings[0].includes('X'));
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: removeState cascades transitions with this state', () => {
    const cur = makeCtx({
        flow: {
            states: [st('A'), st('B')],
            transitions: [tr('A_B', 'A', 'B'), tr('B_A', 'B', 'A')]
        },
        config: { states: [cfgState('A'), cfgState('B')] },
        csv: makeCsv(
            ['ItemType', 'TranslationKey'],
            [
                { ItemType: 'states', TranslationKey: 'states@A' },
                { ItemType: 'transitions', TranslationKey: 'transitions@A_B@Title' },
                { ItemType: 'transitions', TranslationKey: 'transitions@B_A@Title' }
            ]
        )
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('removeState', { name: 'A' })]);
        assert.equal(r.applied, 1);
        assert.deepEqual(cur.ctx.flow.states.map(s => s.name), ['B']);
        assert.deepEqual(cur.ctx.flow.transitions, []);
        assert.deepEqual(cur.ctx.config.states.map(s => s.name), ['B']);
        assert.equal(cur.ctx.csv.rows.length, 0);
        assert.ok(r.touched.flowRules.includes('A_B'));
        assert.ok(r.touched.flowRules.includes('B_A'));
    } finally { cur.cleanup(); oth.cleanup(); }
});

/* ============ 4. REMOVE: docAttachments / globalActor ============ */

test('applyDiff: removeDocAttachment removes from config + all actors attachmentsRestrictions', () => {
    const cur = makeCtx({
        config: {
            attachments: [{ attachmentType: 'Photo' }, { attachmentType: 'Contract' }],
            states: [cfgState('Draft', [actor('Editor', {
                attachmentsRestrictions: [
                    { attachmentType: 'Photo', permissions: ['Read'] },
                    { attachmentType: 'Contract', permissions: ['Read'] }
                ]
            })])]
        }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('removeDocAttachment', { code: 'Photo' })]);
        assert.deepEqual(cur.ctx.config.attachments.map(a => a.attachmentType), ['Contract']);
        const rec = cur.ctx.config.states[0].actors[0];
        assert.deepEqual(rec.attachmentsRestrictions.map(r => r.attachmentType), ['Contract']);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: removeGlobalActor cleans flow, config, csv and auth', () => {
    const curDocName = 'CurrentDoc';
    const cur = makeCtx({
        docName: curDocName,
        flow: { states: [], transitions: [], actors: ['Editor', 'Viewer'] },
        config: { states: [cfgState('Draft', [actor('Editor'), actor('Viewer')])] },
        csv: makeCsv(
            ['ItemType', 'TranslationKey', 'Expression'],
            [
                { ItemType: 'actors', TranslationKey: 'Editor', Expression: 'Editor' },
                { ItemType: 'actors', TranslationKey: 'Viewer', Expression: 'Viewer' }
            ]
        ),
        auth: {
            header: AUTH_HEADER,
            rows: [
                authRow('Admin', curDocName, 'Editor', 'Add'),
                authRow('Admin', curDocName, 'Viewer', 'Add')
            ]
        }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('removeGlobalActor', { name: 'Editor' })]);
        assert.equal(r.applied, 1);
        assert.deepEqual(cur.ctx.flow.actors, ['Viewer']);
        assert.deepEqual(cur.ctx.config.states[0].actors.map(a => a.actor), ['Viewer']);
        // auth: убрана одна строка для Editor
        assert.equal(cur.ctx.auth.rows.length, 1);
        assert.equal(cur.ctx.auth.rows[0][4], 'Viewer');
        assert.equal(r.touched.auth, true);
    } finally { cur.cleanup(); oth.cleanup(); }
});

/* ============ 5. ADD ============ */

test('applyDiff: addGlobalActor pushes actor + copies translation', () => {
    const cur = makeCtx({
        flow: { states: [], transitions: [], actors: [] },
        csv: makeCsv(
            ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
            []
        )
    });
    const oth = makeCtx({
        docName: 'Other',
        csv: makeCsv(
            ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
            [
                { ItemType: 'actors', TranslationKey: 'Editor',
                  'Translation_en-US': 'Editor', 'Translation_ru-RU': 'Редактор' }
            ]
        )
    });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('addGlobalActor', { name: 'Editor' })]);
        assert.equal(r.applied, 1);
        assert.deepEqual(cur.ctx.flow.actors, ['Editor']);
        const actorRow = cur.ctx.csv.rows.find(row => row[0] === 'actors');
        assert.equal(actorRow[1], 'Editor');
        assert.equal(actorRow[3], 'Редактор');
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: addGlobalActor is idempotent', () => {
    const cur = makeCtx({ flow: { states: [], transitions: [], actors: ['Editor'] } });
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('addGlobalActor', { name: 'Editor' })]);
        assert.equal(r.applied, 0);
        assert.deepEqual(cur.ctx.flow.actors, ['Editor']);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: addState copies isTerminal and translation', () => {
    const cur = makeCtx({
        flow: { states: [], transitions: [] },
        config: { states: [] },
        csv: makeCsv(
            ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
            []
        )
    });
    const oth = makeCtx({
        docName: 'Other',
        flow: { states: [st('Draft', { isTerminal: true })], transitions: [] },
        csv: makeCsv(
            ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
            [
                { ItemType: 'states', TranslationKey: 'states@Draft',
                  'Translation_en-US': 'Draft', 'Translation_ru-RU': 'Черновик' }
            ]
        )
    });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('addState', { name: 'Draft' })]);
        assert.equal(cur.ctx.flow.states.length, 1);
        assert.equal(cur.ctx.flow.states[0].isTerminal, true);
        assert.equal(cur.ctx.config.states.length, 1);
        assert.equal(cur.ctx.config.states[0].name, 'Draft');
        const stateRow = cur.ctx.csv.rows.find(row => row[0] === 'states');
        assert.equal(stateRow[3], 'Черновик');
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: addActorToState deep-copies actor config', () => {
    const cur = makeCtx({
        flow: { states: [st('Draft')], transitions: [] },
        config: { states: [cfgState('Draft', [])] }
    });
    const oth = makeCtx({
        docName: 'Other',
        flow: { states: [st('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                allowComments: true,
                operations: [{ name: 'Save', exclusiveToAssignedUser: false }]
            })])]
        }
    });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('addActorToState', {
            stateName: 'Draft', actorName: 'Editor'
        })]);
        const rec = cur.ctx.config.states[0].actors[0];
        assert.equal(rec.actor, 'Editor');
        assert.equal(rec.allowComments, true);
        assert.deepEqual(rec.operations, [{ name: 'Save', exclusiveToAssignedUser: false }]);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: addActorOp pushes operation with exclusiveToAssignedUser=false', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor', { operations: [] })])] }
    });
    const oth = makeCtx({ docName: 'Other' });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('addActorOp', {
            stateName: 'Draft', actorName: 'Editor', opName: 'Delete'
        })]);
        assert.deepEqual(
            cur.ctx.config.states[0].actors[0].operations,
            [{ name: 'Delete', exclusiveToAssignedUser: false }]
        );
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: addActorAttachment copies permissions from other or defaults to Read', () => {
    const cur = makeCtx({
        config: { states: [cfgState('Draft', [actor('Editor')])] }
    });
    const oth = makeCtx({
        docName: 'Other',
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                attachmentsRestrictions: [
                    { attachmentType: 'Photo', permissions: ['Read', 'Update'] },
                    { attachmentType: 'Contract', permissions: ['Create'] }
                ]
            })])]
        }
    });
    try {
        applyDiff(cur.ctx, oth.ctx, [
            act('addActorAttachment', { stateName: 'Draft', actorName: 'Editor', attachmentType: 'Photo' }),
            act('addActorAttachment', { stateName: 'Draft', actorName: 'Editor', attachmentType: 'Other' })
        ]);
        const restr = cur.ctx.config.states[0].actors[0].attachmentsRestrictions;
        assert.deepEqual(restr.find(r => r.attachmentType === 'Photo').permissions, ['Read', 'Update']);
        assert.deepEqual(restr.find(r => r.attachmentType === 'Other').permissions, ['Read']);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: addTransition copies serverSideEvents and actionToRunBefore', () => {
    const cur = makeCtx({
        flow: { states: [st('A'), st('B')], transitions: [] },
        csv: makeCsv(
            ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
            []
        )
    });
    const oth = makeCtx({
        docName: 'Other',
        flow: {
            states: [st('A'), st('B')],
            transitions: [tr('A_B', 'A', 'B', {
                actionToRunBefore: 'beforeB',
                broadcastEvent: { serverSideEvents: true }
            })]
        },
        csv: makeCsv(
            ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
            [
                { ItemType: 'transitions', TranslationKey: 'transitions@A_B@Title',
                  'Translation_en-US': 'A_B', 'Translation_ru-RU': 'А_Б' }
            ]
        )
    });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('addTransition', { name: 'A_B' })]);
        const t = cur.ctx.flow.transitions[0];
        assert.equal(t.name, 'A_B');
        assert.equal(t.actionToRunBefore, 'beforeB');
        assert.deepEqual(t.broadcastEvent, { serverSideEvents: true });
        const trRow = cur.ctx.csv.rows.find(row => row[0] === 'transitions');
        assert.equal(trRow[3], 'А_Б');
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: addDocAttachment pushes to config.attachments', () => {
    const cur = makeCtx({ config: { states: [], attachments: [] } });
    const oth = makeCtx({
        docName: 'Other',
        config: { states: [], attachments: [{ attachmentType: 'Photo', flow: 'Incoming' }] }
    });
    try {
        applyDiff(cur.ctx, oth.ctx, [act('addDocAttachment', { code: 'Photo' })]);
        assert.equal(cur.ctx.config.attachments.length, 1);
        assert.equal(cur.ctx.config.attachments[0].attachmentType, 'Photo');
        assert.equal(cur.ctx.config.attachments[0].flow, 'Incoming');
    } finally { cur.cleanup(); oth.cleanup(); }
});

/* ============ 6. Auth ============ */

test('applyDiff: copies Allow Actor from other doc, skips duplicates', () => {
    const curDocName = 'CurrentDoc';
    const cur = makeCtx({
        docName: curDocName,
        auth: {
            header: AUTH_HEADER,
            rows: [authRow('Admin', curDocName, 'Editor', 'Add')]
        }
    });
    const othDocName = 'Other';
    const oth = makeCtx({
        docName: othDocName,
        auth: {
            header: AUTH_HEADER,
            rows: [
                authRow('Admin', othDocName, 'Editor', 'Add'),    // дубликат
                authRow('Manager', othDocName, 'Approver', 'Add'), // новый
                authRow('Admin', 'SomeOtherDoc', 'Editor', 'Add')  // чужой док — пропуск
            ]
        }
    });
    try {
        // applyDiff копирует auth только при непустом actions
        // (см. ранний return при actions.length === 0).
        // Передаём одно безобидное действие, чтобы дойти до auth-блока.
        const r = applyDiff(cur.ctx, oth.ctx, [act('changeInitialState', { value: '' })]);
        assert.equal(cur.ctx.auth.rows.length, 2);
        assert.equal(r.touched.auth, true);
        assert.ok(r.applied >= 1);
        // Проверяем, что скопирована Manager/Approver
        const managerRow = cur.ctx.auth.rows.find(row => row[0] === 'Manager');
        assert.ok(managerRow);
        assert.equal(managerRow[2], curDocName);
        assert.equal(managerRow[4], 'Approver');
    } finally { cur.cleanup(); oth.cleanup(); }
});

/* ============ 7. Порядок / прочее ============ */

test('applyDiff: remove and add in one call — remove runs before add', () => {
    const cur = makeCtx({
        flow: { states: [st('Old')], transitions: [] },
        config: { states: [cfgState('Old')] }
    });
    const oth = makeCtx({
        docName: 'Other',
        flow: { states: [st('New')], transitions: [] }
    });
    try {
        // Передаём в обратном порядке — sort должен поставить removeState раньше addState
        applyDiff(cur.ctx, oth.ctx, [
            act('addState', { name: 'New' }),
            act('removeState', { name: 'Old' })
        ]);
        const names = cur.ctx.flow.states.map(s => s.name).sort();
        assert.deepEqual(names, ['New']);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: empty actions — applied=0, no warnings', () => {
    const cur = makeCtx({});
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, []);
        assert.equal(r.applied, 0);
        assert.deepEqual(r.warnings, []);
    } finally { cur.cleanup(); oth.cleanup(); }
});

test('applyDiff: unknown kind pushes warning', () => {
    const cur = makeCtx({});
    const oth = makeCtx({ docName: 'Other' });
    try {
        const r = applyDiff(cur.ctx, oth.ctx, [act('somethingWeird', { foo: 'bar' })]);
        assert.equal(r.applied, 0);
        assert.equal(r.warnings.length, 1);
        assert.ok(r.warnings[0].includes('somethingWeird'));
    } finally { cur.cleanup(); oth.cleanup(); }
});