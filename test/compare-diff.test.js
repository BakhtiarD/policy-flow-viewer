const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildDiff } = require('../src/compare-diff');
const { makeDoc } = require('./helpers/makeDoc');
const { makeCsv } = require('./helpers/makeCsv');

/* ============ helpers ============ */

function emptyDoc(name) {
    return makeDoc({ docName: name || 'Current' });
}

function state(name, opts) {
    return Object.assign({ name, operations: [] }, opts || {});
}

function transition(name, from, to, extra) {
    return Object.assign({ name, from, to }, extra || {});
}

function actor(name, opts) {
    return Object.assign({ actor: name }, opts || {});
}

function cfgState(name, actors) {
    return { name, actors: actors || [] };
}

/* ============ базовые ============ */

test('buildDiff: identical empty documents — everything empty', () => {
    const cur = emptyDoc('A');
    const oth = makeDoc({ docName: 'B' });
    const diff = buildDiff(cur, oth);

    assert.deepEqual(diff.states.onlyInOther, []);
    assert.deepEqual(diff.states.onlyInCurrent, []);
    assert.deepEqual(diff.states.differing, []);
    assert.deepEqual(diff.transitions.onlyInOther, []);
    assert.deepEqual(diff.transitions.onlyInCurrent, []);
    assert.deepEqual(diff.transitions.differing, []);
    assert.deepEqual(diff.globalActors.onlyInOther, []);
    assert.deepEqual(diff.globalActors.onlyInCurrent, []);
    assert.deepEqual(diff.docAttachments.onlyInOther, []);
    assert.deepEqual(diff.docAttachments.onlyInCurrent, []);
    assert.equal(diff.initialState, null);
});

test('buildDiff: current/other meta populated', () => {
    const cur = makeDoc({ docName: 'A', flowPath: '/proj/document/A/documentFlow.json' });
    const oth = makeDoc({
        docName: 'B',
        flowPath: '/proj/document/B/documentFlow.json',
        flowName: 'BFlow'
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.current.docName, 'A');
    assert.equal(diff.other.docName, 'B');
    assert.equal(diff.other.flowName, 'BFlow');
    assert.equal(diff.other.flowPath, '/proj/document/B/documentFlow.json');
});

/* ============ states: onlyInOther / onlyInCurrent ============ */

test('buildDiff: state only in other', () => {
    const cur = emptyDoc();
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft', { isTerminal: true })], transitions: [] }
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.states.onlyInOther.length, 1);
    assert.equal(diff.states.onlyInOther[0].name, 'Draft');
    assert.equal(diff.states.onlyInOther[0].isTerminal, true);
    assert.deepEqual(diff.states.onlyInCurrent, []);
    assert.deepEqual(diff.states.differing, []);
});

test('buildDiff: state only in current', () => {
    const cur = makeDoc({
        flow: { states: [state('Active')], transitions: [] }
    });
    const oth = emptyDoc('B');
    const diff = buildDiff(cur, oth);

    assert.equal(diff.states.onlyInCurrent.length, 1);
    assert.equal(diff.states.onlyInCurrent[0].name, 'Active');
    assert.deepEqual(diff.states.onlyInOther, []);
});

/* ============ states: differing ============ */

test('buildDiff: isTerminal differs', () => {
    const cur = makeDoc({
        flow: { states: [state('Draft')], transitions: [] }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft', { isTerminal: true })], transitions: [] }
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.states.differing.length, 1);
    const d = diff.states.differing[0];
    assert.equal(d.name, 'Draft');
    assert.deepEqual(d.isTerminal, { current: false, other: true });
});

test('buildDiff: actor only in other state', () => {
    const cur = makeDoc({
        flow: { states: [state('Draft')], transitions: [] },
        config: { states: [cfgState('Draft', [])] }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft')], transitions: [] },
        config: { states: [cfgState('Draft', [actor('Editor')])] }
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.states.differing.length, 1);
    const d = diff.states.differing[0];
    assert.deepEqual(d.actorsOnlyInOther, ['Editor']);
    assert.deepEqual(d.actorsOnlyInCurrent, []);
});

test('buildDiff: actor only in current state', () => {
    const cur = makeDoc({
        flow: { states: [state('Draft')], transitions: [] },
        config: { states: [cfgState('Draft', [actor('Viewer')])] }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft')], transitions: [] },
        config: { states: [cfgState('Draft', [])] }
    });
    const diff = buildDiff(cur, oth);

    const d = diff.states.differing[0];
    assert.deepEqual(d.actorsOnlyInCurrent, ['Viewer']);
});

/* ============ actor permissions ============ */

test('buildDiff: actor operations differ (added/removed)', () => {
    const cur = makeDoc({
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                operations: [{ name: 'Save' }, { name: 'Delete' }]
            })])]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                operations: [{ name: 'Save' }, { name: 'Update' }]
            })])]
        }
    });
    const diff = buildDiff(cur, oth);

    const d = diff.states.differing[0];
    assert.equal(d.actorPermDiffs.length, 1);
    const p = d.actorPermDiffs[0];
    assert.equal(p.actor, 'Editor');
    assert.deepEqual(p.operations.added.sort(), ['Update']);
    assert.deepEqual(p.operations.removed.sort(), ['Delete']);
});

test('buildDiff: actor transitions differ', () => {
    const cur = makeDoc({
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                transitions: ['Issue_Active']
            })])]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                transitions: ['Issue_Active', 'Discard']
            })])]
        }
    });
    const diff = buildDiff(cur, oth);

    const p = diff.states.differing[0].actorPermDiffs[0];
    assert.deepEqual(p.transitions.added, ['Discard']);
    assert.deepEqual(p.transitions.removed, []);
});

test('buildDiff: allowComments differs', () => {
    const cur = makeDoc({
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', { allowComments: false })])]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', { allowComments: true })])]
        }
    });
    const diff = buildDiff(cur, oth);

    const p = diff.states.differing[0].actorPermDiffs[0];
    assert.deepEqual(p.allowComments, { current: false, other: true });
});

test('buildDiff: attachments permissions changed', () => {
    const cur = makeDoc({
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                attachmentsRestrictions: [
                    { attachmentType: 'Photo', permissions: ['Read'] }
                ]
            })])]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft')], transitions: [] },
        config: {
            states: [cfgState('Draft', [actor('Editor', {
                attachmentsRestrictions: [
                    { attachmentType: 'Photo', permissions: ['Read', 'Update'] }
                ]
            })])]
        }
    });
    const diff = buildDiff(cur, oth);

    const p = diff.states.differing[0].actorPermDiffs[0];
    assert.equal(p.attachments.changed.length, 1);
    assert.equal(p.attachments.changed[0].type, 'Photo');
    assert.deepEqual(p.attachments.changed[0].current, ['Read']);
    assert.deepEqual(p.attachments.changed[0].other, ['Read', 'Update']);
});

/* ============ transitions ============ */

test('buildDiff: transition only in other', () => {
    const cur = makeDoc({
        flow: { states: [state('A'), state('B')], transitions: [] }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: {
            states: [state('A'), state('B')],
            transitions: [transition('A_B', 'A', 'B')]
        }
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.transitions.onlyInOther.length, 1);
    assert.equal(diff.transitions.onlyInOther[0].name, 'A_B');
});

test('buildDiff: transition only in current', () => {
    const cur = makeDoc({
        flow: {
            states: [state('A'), state('B')],
            transitions: [transition('A_B', 'A', 'B')]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('A'), state('B')], transitions: [] }
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.transitions.onlyInCurrent.length, 1);
    assert.equal(diff.transitions.onlyInCurrent[0].name, 'A_B');
});

test('buildDiff: transition to differs', () => {
    const cur = makeDoc({
        flow: {
            states: [state('A'), state('B'), state('C')],
            transitions: [transition('A_X', 'A', 'B')]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: {
            states: [state('A'), state('B'), state('C')],
            transitions: [transition('A_X', 'A', 'C')]
        }
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.transitions.differing.length, 1);
    const d = diff.transitions.differing[0];
    assert.deepEqual(d.to, { current: 'B', other: 'C' });
    assert.equal(d.from, null);
});

test('buildDiff: transition actionToRunBefore differs', () => {
    const cur = makeDoc({
        flow: {
            states: [state('A'), state('B')],
            transitions: [transition('A_B', 'A', 'B', { actionToRunBefore: 'beforeX' })]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: {
            states: [state('A'), state('B')],
            transitions: [transition('A_B', 'A', 'B', { actionToRunBefore: 'beforeY' })]
        }
    });
    const diff = buildDiff(cur, oth);

    const d = diff.transitions.differing[0];
    assert.deepEqual(d.actionToRunBefore, { current: 'beforeX', other: 'beforeY' });
});

test('buildDiff: transition serverSideEvents differs', () => {
    const cur = makeDoc({
        flow: {
            states: [state('A'), state('B')],
            transitions: [transition('A_B', 'A', 'B')]
        }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: {
            states: [state('A'), state('B')],
            transitions: [transition('A_B', 'A', 'B', {
                broadcastEvent: { serverSideEvents: true }
            })]
        }
    });
    const diff = buildDiff(cur, oth);

    const d = diff.transitions.differing[0];
    assert.deepEqual(d.serverSideEvents, { current: false, other: true });
});

/* ============ global actors / doc attachments / initialState ============ */

test('buildDiff: global actors only in other / only in current', () => {
    const cur = makeDoc({
        flow: { states: [], transitions: [], actors: ['Editor', 'Viewer'] }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [], transitions: [], actors: ['Editor', 'Approver'] }
    });
    const diff = buildDiff(cur, oth);

    assert.deepEqual(diff.globalActors.onlyInOther.sort(), ['Approver']);
    assert.deepEqual(diff.globalActors.onlyInCurrent.sort(), ['Viewer']);
});

test('buildDiff: doc attachments differ', () => {
    const cur = makeDoc({
        config: { states: [], attachments: [{ attachmentType: 'Photo' }] }
    });
    const oth = makeDoc({
        docName: 'B',
        config: { states: [], attachments: [
            { attachmentType: 'Photo' },
            { attachmentType: 'Contract' }
        ] }
    });
    const diff = buildDiff(cur, oth);

    assert.deepEqual(diff.docAttachments.onlyInOther, ['Contract']);
    assert.deepEqual(diff.docAttachments.onlyInCurrent, []);
});

test('buildDiff: initialState differs', () => {
    const cur = makeDoc({
        flow: { states: [], transitions: [], initialState: 'A' }
    });
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [], transitions: [], initialState: 'B' }
    });
    const diff = buildDiff(cur, oth);

    assert.deepEqual(diff.initialState, { current: 'A', other: 'B' });
});

/* ============ CSV translations in onlyInOther ============ */

test('buildDiff: state onlyInOther carries trans map from other csv', () => {
    const cur = emptyDoc();
    const othCsv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_en-US': 'Draft',
                'Translation_ru-RU': 'Черновик'
            }
        ]
    );
    const oth = makeDoc({
        docName: 'B',
        flow: { states: [state('Draft')], transitions: [] },
        csv: othCsv
    });
    const diff = buildDiff(cur, oth);

    assert.equal(diff.states.onlyInOther.length, 1);
    const s = diff.states.onlyInOther[0];
    assert.equal(s.trans['en-US'], 'Draft');
    assert.equal(s.trans['ru-RU'], 'Черновик');
});