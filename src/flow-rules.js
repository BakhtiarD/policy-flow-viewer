const fs = require('fs');
const path = require('path');

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

function writeFlowRule(ctx, transitionName, content) {
    const dir = flowRulesDir(ctx);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(flowRulePath(ctx, transitionName), content, 'utf8');
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
        throw new Error('flowRules/' + newName + '.js уже существует.');
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
    flowRuleTemplate
};