const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildTranslations } = require('../src/transforms');
const { makeCsv } = require('./helpers/makeCsv');

/* ============ базовые случаи ============ */

test('buildTranslations: empty csv returns empty maps and en-US defaultLang', () => {
    const csv = { header: [], rows: [], trailingNewline: true };
    const r = buildTranslations(csv);

    assert.deepEqual(r.languages, []);
    assert.equal(r.defaultLang, 'en-US');
    assert.deepEqual(r.stateTrans, {});
    assert.deepEqual(r.transTrans, {});
    assert.deepEqual(r.opTrans, {});
    assert.deepEqual(r.actorTrans, {});
    assert.deepEqual(r.stateTransAll, {});
    assert.deepEqual(r.transTransAll, {});
    assert.deepEqual(r.opTransAll, {});
    assert.deepEqual(r.actorTransAll, {});
});

test('buildTranslations: single state with ru-RU fills flat and all maps', () => {
    const csv = makeCsv(
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
    const r = buildTranslations(csv);

    assert.equal(r.stateTrans['Draft'], 'Черновик');
    assert.deepEqual(r.stateTransAll['Draft'], {
        'en-US': 'Draft',
        'ru-RU': 'Черновик'
    });
    assert.deepEqual(r.languages, ['ru-RU']);
    assert.equal(r.defaultLang, 'ru-RU');
});

test('buildTranslations: multiple non-en langs — languages ordered by CSV, defaultLang first', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey',
         'Translation_en-US', 'Translation_ru-RU', 'Translation_mk-MK'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_en-US': 'Draft',
                'Translation_ru-RU': 'Черновик',
                'Translation_mk-MK': 'Нацрт'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.deepEqual(r.languages, ['ru-RU', 'mk-MK']);
    assert.equal(r.defaultLang, 'ru-RU');
    assert.deepEqual(r.stateTransAll['Draft'], {
        'en-US': 'Draft',
        'ru-RU': 'Черновик',
        'mk-MK': 'Нацрт'
    });
});

/* ============ en-US fallback ============ */

test('buildTranslations: custom en-US preserved as-is', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_en-US': 'Draft draft',   // отличается от имени
                'Translation_ru-RU': 'Черновик'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.stateTransAll['Draft']['en-US'], 'Draft draft');
});

test('buildTranslations: empty en-US cell falls back to item name', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_en-US': '',
                'Translation_ru-RU': 'Черновик'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.stateTransAll['Draft']['en-US'], 'Draft');
});

test('buildTranslations: no en-US column at all — fallback via ensureEn', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_ru-RU'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_ru-RU': 'Черновик'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.stateTransAll['Draft']['en-US'], 'Draft');
});

test('buildTranslations: only en-US column — languages empty', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_en-US': 'Draft'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.deepEqual(r.languages, []);
    assert.equal(r.defaultLang, 'en-US');
    assert.equal(r.stateTransAll['Draft']['en-US'], 'Draft');
});

/* ============ разные ItemType ============ */

test('buildTranslations: transitions mapped by @Title key', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
        [
            {
                ItemType: 'transitions',
                TranslationKey: 'transitions@Discard@Title',
                'Translation_en-US': 'Discard',
                'Translation_ru-RU': 'Отклонить'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.transTrans['Discard'], 'Отклонить');
    assert.deepEqual(r.transTransAll['Discard'], {
        'en-US': 'Discard',
        'ru-RU': 'Отклонить'
    });
});

test('buildTranslations: operations mapped by @Title key', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
        [
            {
                ItemType: 'operations',
                TranslationKey: 'operations@Save@Title',
                'Translation_en-US': 'Save',
                'Translation_ru-RU': 'Сохранить'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.opTrans['Save'], 'Сохранить');
    assert.deepEqual(r.opTransAll['Save'], {
        'en-US': 'Save',
        'ru-RU': 'Сохранить'
    });
});

test('buildTranslations: actors mapped by TranslationKey', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
        [
            {
                ItemType: 'actors',
                TranslationKey: 'Editor',
                'Translation_en-US': 'Editor',
                'Translation_ru-RU': 'Редактор'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.actorTrans['Editor'], 'Редактор');
    assert.deepEqual(r.actorTransAll['Editor'], {
        'en-US': 'Editor',
        'ru-RU': 'Редактор'
    });
});

test('buildTranslations: actors get ensureEn fallback', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_ru-RU'],
        [
            {
                ItemType: 'actors',
                TranslationKey: 'Viewer',
                'Translation_ru-RU': 'Наблюдатель'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.actorTransAll['Viewer']['en-US'], 'Viewer');
});

/* ============ плоские мапы и граничные случаи ============ */

test('buildTranslations: no ru-RU column — flat stateTrans stays empty', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_mk-MK'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_en-US': 'Draft',
                'Translation_mk-MK': 'Нацрт'
            }
        ]
    );
    const r = buildTranslations(csv);

    // flat stateTrans читает только Translation_ru-RU, которого нет
    assert.equal('Draft' in r.stateTrans, false);

    // а stateTransAll содержит en-US (из колонки) и mk-MK
    assert.equal(r.stateTransAll['Draft']['en-US'], 'Draft');
    assert.equal(r.stateTransAll['Draft']['mk-MK'], 'Нацрт');
});

test('buildTranslations: transitions without @Title skipped', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_ru-RU'],
        [
            {
                ItemType: 'transitions',
                TranslationKey: 'transitions@Discard',   // нет @Title
                'Translation_ru-RU': 'Отклонить'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.deepEqual(r.transTrans, {});
    assert.deepEqual(r.transTransAll, {});
});

test('buildTranslations: unknown ItemType skipped', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_ru-RU'],
        [
            {
                ItemType: 'unknown-thing',
                TranslationKey: 'foo@Bar',
                'Translation_ru-RU': 'Что-то'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.deepEqual(r.stateTrans, {});
    assert.deepEqual(r.transTrans, {});
    assert.deepEqual(r.opTrans, {});
    assert.deepEqual(r.actorTrans, {});
});

test('buildTranslations: multi-word translation values preserved', () => {
    const csv = makeCsv(
        ['ItemType', 'TranslationKey', 'Translation_en-US', 'Translation_ru-RU'],
        [
            {
                ItemType: 'states',
                TranslationKey: 'states@Draft',
                'Translation_en-US': 'Draft 1',
                'Translation_ru-RU': 'Черновик 1'
            }
        ]
    );
    const r = buildTranslations(csv);

    assert.equal(r.stateTransAll['Draft']['en-US'], 'Draft 1');
    assert.equal(r.stateTransAll['Draft']['ru-RU'], 'Черновик 1');
});