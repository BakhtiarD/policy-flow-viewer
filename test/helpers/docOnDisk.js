const fs = require('fs');
const path = require('path');
const os = require('os');

// Создаёт документ на диске во временной папке.
// Возвращает { flowPath, configPath, transPath, docName, tmpRoot, cleanup }.
//
// Все параметры опциональны:
//   docName      — имя папки документа (default: 'TestDoc')
//   flow         — объект для documentFlow.json (default: { states: [], transitions: [], actors: [], initialState: '' })
//   flowRaw      — строка как есть (для битого JSON), перекрывает flow
//   flowMissing  — true → documentFlow.json не создаётся вовсе
//   config       — объект для configuration.json (default: { states: [], attachments: [] })
//   configRaw    — строка как есть, перекрывает config
//   configMissing— true → configuration.json не создаётся
//   csvText      — готовая строка translation.csv (default: 'ItemType\tTranslationKey\n')
//   csvMissing   — true → translation.csv не создаётся
//   ui           — объект для documentFlow.ui.json (если не задан — файла нет)
//   auth         — строка authorization.csv (если не задан — файла нет)

function docOnDisk(opts) {
    const o = opts || {};
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adinsure-doc-'));
    const docName = o.docName || 'TestDoc';
    const docDir = path.join(tmpRoot, 'document', docName);
    fs.mkdirSync(docDir, { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'authorization'), { recursive: true });

    const flowPath = path.join(docDir, 'documentFlow.json');
    const configPath = path.join(docDir, 'configuration.json');
    const transPath = path.join(docDir, 'translation', 'translation.csv');
    fs.mkdirSync(path.dirname(transPath), { recursive: true });

    if (!o.flowMissing) {
        const content = o.flowRaw !== undefined
            ? o.flowRaw
            : JSON.stringify(
                o.flow || { states: [], transitions: [], actors: [], initialState: '' },
                null,
                4
            );
        fs.writeFileSync(flowPath, content, 'utf8');
    }

    if (!o.configMissing) {
        const content = o.configRaw !== undefined
            ? o.configRaw
            : JSON.stringify(o.config || { states: [], attachments: [] }, null, 4);
        fs.writeFileSync(configPath, content, 'utf8');
    }

    if (!o.csvMissing) {
        const content = o.csvText !== undefined
            ? o.csvText
            : 'ItemType\tTranslationKey\n';
        fs.writeFileSync(transPath, content, 'utf8');
    }

    if (o.ui !== undefined && o.ui !== null) {
        fs.writeFileSync(
            path.join(docDir, 'documentFlow.ui.json'),
            JSON.stringify(o.ui, null, 4),
            'utf8'
        );
    }

    if (o.auth !== undefined && o.auth !== null) {
        fs.writeFileSync(
            path.join(tmpRoot, 'authorization', 'authorization.csv'),
            o.auth,
            'utf8'
        );
    }

    return {
        flowPath,
        configPath,
        transPath,
        docName,
        tmpRoot,
        cleanup() {
            try { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
            catch { /* ignore */ }
        }
    };
}

module.exports = { docOnDisk };