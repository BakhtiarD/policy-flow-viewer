const fs = require('fs');
const path = require('path');

function docNameFromCtx(ctx) {
    return path.basename(path.dirname(ctx.flowPath));
}

function clientActionsDir(ctx) {
    return path.join(ctx.productLevel, 'document', docNameFromCtx(ctx), 'UI', 'ClientAction');
}

function clientActionPath(ctx, actionName) {
    return path.join(clientActionsDir(ctx), actionName + '.js');
}

function clientActionExists(ctx, actionName) {
    return fs.existsSync(clientActionPath(ctx, actionName));
}

function writeClientAction(ctx, actionName, content) {
    const dir = clientActionsDir(ctx);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(clientActionPath(ctx, actionName), content, 'utf8');
}

function clientActionTemplate(actionName) {
    const fnName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(actionName) ? actionName : 'clientAction';
    return [
        "'use strict';",
        '',
        'module.exports = async function ' + fnName + '(input, ambientProperties) {',
        '    // TODO: implement ' + actionName,
        '    return true;',
        '};',
        ''
    ].join('\n');
}

// Резервный поиск по всему проекту:
//   <pkg>/document/<AnyDoc>/UI/ClientAction/<name>.js
// Первое совпадение возвращается. Нужно, если action лежит в другом пакете.
function findClientActionInProject(ctx, actionName) {
    if (!ctx.projectRoot) return null;
    const { listConfigPackages } = require('./storage');
    const pkgs = listConfigPackages(ctx.projectRoot);
    for (const pkg of pkgs) {
        const docRoot = path.join(pkg.dir, 'document');
        if (!fs.existsSync(docRoot)) continue;
        let docs;
        try { docs = fs.readdirSync(docRoot, { withFileTypes: true }); }
        catch { continue; }
        for (const d of docs) {
            if (!d.isDirectory()) continue;
            const p = path.join(docRoot, d.name, 'UI', 'ClientAction', actionName + '.js');
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

function renameClientAction(ctx, oldName, newName) {
    if (!oldName || !newName) throw new Error('Не переданы oldName/newName.');
    if (!/^[A-Za-z0-9_$\-]+$/.test(oldName) || !/^[A-Za-z0-9_$\-]+$/.test(newName)) {
        throw new Error('Некорректное имя action.');
    }
    const from = clientActionPath(ctx, oldName);
    const to = clientActionPath(ctx, newName);
    if (!fs.existsSync(from)) {
        throw new Error('Файл ClientAction/' + oldName + '.js не найден.');
    }
    if (fs.existsSync(to)) {
        throw new Error('Файл ClientAction/' + newName + '.js уже существует.');
    }
    fs.renameSync(from, to);
}

module.exports = {
    docNameFromCtx,
    clientActionsDir,
    clientActionPath,
    clientActionExists,
    writeClientAction,
    clientActionTemplate,
    findClientActionInProject,
    renameClientAction
};