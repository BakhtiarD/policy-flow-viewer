const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { findFileByName, resolveRoot, loadData, pushRender } = require('./src/storage');
const {
    handleDeleteState,
    handleAddState,
    handleEditState,
    handleToggleTerminal,
    handleSaveGraph,
    handleDeleteTransitions,
    handleEditTransition,
    handleGenerateFlow,
    handleSaveAuth,
    handleDeleteActorFromState,
    handleCopyActor,
    handleAddTransition,
    handleOpenFlowRule,
    handleOpenClientAction,
    handleDeleteClientAction,
    handleCreateClientAction,
    handleRenameClientAction
} = require('./src/handlers');

let currentPanel = null;
let currentCtx = null;

function activate(context) {
    const extensionUri = context.extensionUri;

    context.subscriptions.push(
        vscode.commands.registerCommand('policyFlow.showTable', async (uri) => {
            try {
                const root = await resolveRoot(uri);
                if (!root) return;

                let configPath = findFileByName(root, 'configuration.json');
                let flowPath = findFileByName(root, 'documentFlow.json');
                let transPath = findFileByName(root, 'translation.csv');

                if (!configPath || !flowPath || !transPath) {
                    // Файлов нет — работаем на пустой папке. Пути по умолчанию:
                    //   <root>/configuration.json
                    //   <root>/documentFlow.json
                    //   <root>/translation/translation.csv
                    configPath = configPath || path.join(root, 'configuration.json');
                    flowPath = flowPath || path.join(root, 'documentFlow.json');
                    transPath = transPath || path.join(root, 'translation', 'translation.csv');
                    vscode.window.showInformationMessage(
                        'Файлы конфигурации не найдены — доступен режим создания каркаса.'
                    );
                }

                if (currentPanel) currentPanel.dispose();
                currentCtx = { flowPath, configPath, transPath, extensionUri };
                loadData(currentCtx);

                const panel = vscode.window.createWebviewPanel(
                    'adinsureDocFlowTable',
                    `Document Flow: ${path.basename(root)}`,
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
                    }
                );
                currentPanel = panel;

                panel.webview.onDidReceiveMessage(async (msg) => {
                    try {
                        if (msg.type === 'deleteState') await handleDeleteState(currentCtx, currentPanel, msg.state);
                        else if (msg.type === 'addState') await handleAddState(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'editState') await handleEditState(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'toggleTerminal') await handleToggleTerminal(currentCtx, currentPanel, msg.state, msg.value);
                        else if (msg.type === 'reload') { loadData(currentCtx); pushRender(currentCtx, currentPanel); }
                        else if (msg.type === 'saveGraph') await handleSaveGraph(currentCtx, msg.payload);
                        else if (msg.type === 'deleteTransitions') await handleDeleteTransitions(currentCtx, currentPanel, msg.names);
                        else if (msg.type === 'editTransition') await handleEditTransition(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'generateFlow') await handleGenerateFlow(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'saveAuth') await handleSaveAuth(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'deleteActorFromState') await handleDeleteActorFromState(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'copyActor') await handleCopyActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'addTransition') await handleAddTransition(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'openFlowRule') await handleOpenFlowRule(currentCtx, msg.transitionName);
                        else if (msg.type === 'openClientAction') await handleOpenClientAction(currentCtx, msg.transitionName, msg.actionName);
                        else if (msg.type === 'deleteClientAction') await handleDeleteClientAction(currentCtx, msg.actionName);
                        else if (msg.type === 'createClientAction') await handleCreateClientAction(currentCtx, msg.actionName);
                        else if (msg.type === 'renameClientAction') await handleRenameClientAction(currentCtx, msg.oldName, msg.newName);
                    } catch (e) {
                        vscode.window.showErrorMessage('Ошибка: ' + e.message);
                        console.error(e);
                    }
                });

                panel.onDidDispose(() => {
                    if (currentPanel === panel) { currentPanel = null; currentCtx = null; }
                });

                pushRender(currentCtx, currentPanel);
            } catch (e) {
                vscode.window.showErrorMessage('Ошибка: ' + e.message);
                console.error(e);
            }
        })
    );
}

function deactivate() { }

module.exports = { activate, deactivate };