const path = require('path');
const fs = require('fs');
const os = require('os');

function makeCtx(opts) {
    const o = opts || {};
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adinsure-test-'));
    const docName = o.docName || 'CurrentDoc';
    const docDir = path.join(tmpRoot, 'document', docName);
    fs.mkdirSync(docDir, { recursive: true });
    fs.mkdirSync(path.join(docDir, 'UI', 'ClientAction'), { recursive: true });
    fs.mkdirSync(path.join(docDir, 'flowRules'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'authorization'), { recursive: true });

    const flowPath = path.join(docDir, 'documentFlow.json');
    const configPath = path.join(docDir, 'configuration.json');
    const transPath = path.join(docDir, 'translation', 'translation.csv');
    const uiPath = path.join(docDir, 'documentFlow.ui.json');
    fs.mkdirSync(path.dirname(transPath), { recursive: true });

    const ctx = {
        flowPath,
        configPath,
        transPath,
        uiPath,
        productLevel: tmpRoot,
        docName,
        flowName: o.flowName || (docName + 'Flow'),
        flow: o.flow || { states: [], transitions: [], actors: [], initialState: '' },
        config: o.config || { states: [], attachments: [] },
        csv: o.csv || { header: [], rows: [] },
        ui: o.ui || [],
        auth: o.auth || null,
        authPath: o.auth ? path.join(tmpRoot, 'authorization', 'authorization.csv') : null
    };

    return {
        ctx,
        cleanup() {
            try { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
            catch { /* ignore */ }
        },
        tmpRoot
    };
}

module.exports = { makeCtx };