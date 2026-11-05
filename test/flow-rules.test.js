require('./helpers/mockVscode');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { checkFlowRuleSyntax } = require('../src/flow-rules');

test('checkFlowRuleSyntax: valid template passes', () => {
    const content =
        "'use strict';\n" +
        "module.exports = function rule(input) {\n" +
        "    return true;\n" +
        "};\n";
    const r = checkFlowRuleSyntax(content);
    assert.equal(r.ok, true);
});

test('checkFlowRuleSyntax: valid single-line function passes', () => {
    const r = checkFlowRuleSyntax('function f() { return 1; }');
    assert.equal(r.ok, true);
});

test('checkFlowRuleSyntax: empty content is valid', () => {
    const r = checkFlowRuleSyntax('');
    assert.equal(r.ok, true);
});

test('checkFlowRuleSyntax: unbalanced brace — error with message', () => {
    const content =
        "'use strict';\n" +
        "module.exports = function rule(input) {\n" +
        "    return true;\n";  // нет закрывающей }
    const r = checkFlowRuleSyntax(content);
    assert.equal(r.ok, false);
    assert.ok(typeof r.message === 'string' && r.message.length > 0);
});

test('checkFlowRuleSyntax: unexpected token — error with message', () => {
    const r = checkFlowRuleSyntax('let x = ;');
    assert.equal(r.ok, false);
    assert.ok(r.message);
});