// Мок модуля 'vscode' для unit-тестов.
// Подменяет Module._load так, чтобы require('vscode') возвращал
// заглушку — этого достаточно, потому что в тестах vscode-функции
// не вызываются (только деструктурируются при загрузке модуля).
//
// ВАЖНО: require('./helpers/mockVscode') должен быть ПЕРВОЙ строкой
// тестового файла — до require('../src/compare-apply') и всего, что
// транзитивно тянет src/storage.js → require('vscode').

const Module = require('module');

const KEY = Symbol.for('adinsure.test.vscode-mock');

if (!Module[KEY]) {
    const origLoad = Module._load;

    const mock = {
        workspace: {
            getConfiguration: () => ({
                get: () => undefined,
                inspect: () => ({})
            }),
            workspaceFolders: undefined,
            onDidChangeConfiguration: () => ({ dispose() { /* noop */ } }),
            createFileSystemWatcher: () => ({
                dispose() { /* noop */ },
                onDidChange: () => ({ dispose() { /* noop */ } })
            })
        },
        window: {
            showInformationMessage: async () => undefined,
            showWarningMessage: async () => undefined,
            showErrorMessage: async () => undefined,
            showOpenDialog: async () => undefined,
            showWorkspaceFolderPick: async () => undefined,
            createWebviewPanel: () => ({
                webview: {
                    asWebviewUri: () => ({ toString: () => '' }),
                    onDidReceiveMessage: () => ({ dispose() { /* noop */ } }),
                    postMessage: async () => true,
                    html: ''
                },
                onDidDispose: () => ({ dispose() { /* noop */ } }),
                dispose() { /* noop */ }
            })
        },
        env: { language: 'en-US' },
        Uri: {
            file: (p) => ({ fsPath: p, toString: () => 'file://' + p }),
            joinPath: () => ({ toString: () => '' })
        },
        ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
        commands: { registerCommand: () => ({ dispose() { /* noop */ } }) }
    };

    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') return mock;
        return origLoad.call(this, request, parent, isMain);
    };

    Module[KEY] = mock;
}

module.exports = Module[KEY];