const fs = require('fs');
const path = require('path');
const vm = require('vm');
const uiI18n = require('./ui-i18n');

// Проверяет синтаксис .js-кода без выполнения (vm.Script только парсит).
// Возвращает { ok: true } | { ok: false, message, line }.
function checkFlowRuleSyntax(content) {
    try {
        new vm.Script(content, { filename: 'flowRule.js' });
        return { ok: true };
    } catch (e) {
        const msg = (e && e.message) || 'Syntax error';
        const m = /flowRule\.js:(\d+)/.exec((e && e.stack) || '');
        const line = m ? parseInt(m[1], 10) : null;
        return { ok: false, message: msg, line };
    }
}

function flowRulesDir(ctx) {
    return path.join(path.dirname(ctx.flowPath), 'flowRules');
}

function flowRulePath(ctx, transitionName) {
    return path.join(flowRulesDir(ctx), transitionName + '.js');
}

function flowRuleExists(ctx, transitionName) {
    return fs.existsSync(flowRulePath(ctx, transitionName));
}

function readFlowRule(ctx, transitionName) {
    const p = flowRulePath(ctx, transitionName);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// Пишет flowRules/<name>.js. Возвращает результат проверки синтаксиса:
//   { ok: true } — записано и валидно;
//   { ok: false, message, line } — записано, но синтаксис битый.
// Файл записывается в любом случае: во время промежуточных сохранений
// пользователь может сохранять незакрытую скобку, откат был бы хуже.
function writeFlowRule(ctx, transitionName, content) {
    const dir = flowRulesDir(ctx);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(flowRulePath(ctx, transitionName), content, 'utf8');
    return checkFlowRuleSyntax(content);
}

function deleteFlowRule(ctx, transitionName) {
    const p = flowRulePath(ctx, transitionName);
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

function renameFlowRule(ctx, oldName, newName) {
    const from = flowRulePath(ctx, oldName);
    const to = flowRulePath(ctx, newName);
    if (!fs.existsSync(from)) return;
    if (fs.existsSync(to)) {
        throw new Error(uiI18n.t('err.flowRule.renameExists', { name: newName }));
    }
    fs.renameSync(from, to);
}

function flowRuleTemplate(transitionName) {
    return [
        "'use strict';",
        '',
        'module.exports = function rule(input) {',
        '    // TODO: implement rule for transition ' + transitionName,
        '    return true;',
        '};',
        ''
    ].join('\n');
}

module.exports = {
    flowRulesDir,
    flowRulePath,
    flowRuleExists,
    readFlowRule,
    writeFlowRule,
    deleteFlowRule,
    renameFlowRule,
    flowRuleTemplate,
    checkFlowRuleSyntax
};