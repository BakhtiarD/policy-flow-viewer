const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { findFileByName, resolveRoot, loadData, pushRender } = require('./src/storage');
const uiI18n = require('./src/ui-i18n');
const history = require('./src/history');
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
    handleRenameClientAction,
    handleAddAttachmentType,
    handleRemoveAttachmentType,
    handleAddAttachmentToDoc,
    handleRemoveAttachmentFromDoc,
    handleAddActor,
    handleDeleteActor,
    handleAddStateToActor,
    handleDeleteStateFromActor,
    handleAddTransitionToActor,
    handleDeleteTransitionFromActor,
    handleEditActorPerm,
    handleDuplicateActor,
    handleSaveActorAuth,
    handleRenameActor,
    handleSetUiLanguage,
    handleSetInitialState,
    handleListDocumentsForCompare,
    handleCompareDocuments,
    handleApplyCompareDocuments
} = require('./src/handlers');

let currentPanel = null;
let currentCtx = null;

// Типы сообщений, которые изменяют данные документа и попадают в историю.
// Файловые операции (ClientAction, flowRules) и настройки (uiLanguage)
// сюда не входят — undo не восстанавливает .js-файлы.
const MUTATING_TYPES = new Set([
    'deleteState', 'addState', 'editState', 'toggleTerminal',
    'saveGraph', 'deleteTransitions', 'editTransition',
    'generateFlow', 'saveAuth', 'deleteActorFromState',
    'copyActor', 'addTransition', 'addActor', 'deleteActor',
    'addStateToActor', 'deleteStateFromActor',
    'addTransitionToActor', 'deleteTransitionFromActor',
    'editActorPerm', 'duplicateActor', 'saveActorAuth',
    'renameActor', 'setInitialState', 'applyCompareDocuments',
    'addAttachmentToDoc', 'removeAttachmentFromDoc'
]);

function labelForMessage(msg) {
    const p = msg.payload || {};
    switch (msg.type) {
        case 'addState': return uiI18n.t('history.action.addState', { name: p.name || '' });
        case 'editState': return uiI18n.t('history.action.editState', { name: p.originalName || p.name || '' });
        case 'deleteState': return uiI18n.t('history.action.deleteState', { name: msg.state || '' });
        case 'toggleTerminal': return uiI18n.t('history.action.toggleTerminal', { name: msg.state || '' });
        case 'saveGraph': return uiI18n.t('history.action.saveGraph');
        case 'deleteTransitions': return uiI18n.t('history.action.deleteTransitions', { n: String((msg.names || []).length) });
        case 'editTransition': return uiI18n.t('history.action.editTransition', { name: p.originalName || p.name || '' });
        case 'generateFlow': return uiI18n.t('history.action.generateFlow');
        case 'saveAuth': return uiI18n.t('history.action.saveAuth');
        case 'deleteActorFromState': return uiI18n.t('history.action.deleteActorFromState', { actor: p.actorName || '', state: p.stateName || '' });
        case 'copyActor': return uiI18n.t('history.action.copyActor', { actor: p.toActor || '' });
        case 'addTransition': return uiI18n.t('history.action.addTransition', { name: p.name || '' });
        case 'addActor': return uiI18n.t('history.action.addActor', { name: p.name || '' });
        case 'deleteActor': return uiI18n.t('history.action.deleteActor', { name: p.name || '' });
        case 'addStateToActor': return uiI18n.t('history.action.addStateToActor', { actor: p.actor || '', state: p.state || '' });
        case 'deleteStateFromActor': return uiI18n.t('history.action.deleteStateFromActor', { actor: p.actor || '', state: p.state || '' });
        case 'addTransitionToActor': return uiI18n.t('history.action.addTransitionToActor', { transition: p.transition || '', actor: p.actor || '' });
        case 'deleteTransitionFromActor': return uiI18n.t('history.action.deleteTransitionFromActor', { transition: p.transition || '', actor: p.actor || '' });
        case 'editActorPerm': return uiI18n.t('history.action.editActorPerm', { actor: p.actorName || '', state: p.stateName || '' });
        case 'duplicateActor': return uiI18n.t('history.action.duplicateActor', { old: p.oldName || '', new: p.newName || '' });
        case 'saveActorAuth': return uiI18n.t('history.action.saveActorAuth', { name: p.actorName || '' });
        case 'renameActor': return uiI18n.t('history.action.renameActor', { old: p.oldName || '', new: p.newName || '' });
        case 'setInitialState': return uiI18n.t('history.action.setInitialState', { name: msg.state || '' });
        case 'applyCompareDocuments': return uiI18n.t('history.action.applyCompareDocuments');
        case 'addAttachmentToDoc': return uiI18n.t('history.action.addAttachmentToDoc', { code: p.code || '' });
        case 'removeAttachmentFromDoc': return uiI18n.t('history.action.removeAttachmentFromDoc', { code: msg.code || '' });
        default: return msg.type;
    }
}

function resolveUiLanguage() {
    const cfg = vscode.workspace.getConfiguration('adinsureDocFlow');
    const setting = cfg.get('uiLanguage') || 'auto';
    const vscodeLang = (vscode.env && vscode.env.language) || 'en';
    uiI18n.init(setting, vscodeLang);
    return uiI18n.getLang();
}

function activate(context) {
    const extensionUri = context.extensionUri;

    resolveUiLanguage();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration('adinsureDocFlow.uiLanguage')) return;
            const lang = resolveUiLanguage();
            if (currentCtx) currentCtx.uiLanguage = lang;
            if (currentPanel) {
                currentPanel.webview.postMessage({ type: 'uiLanguageChanged', lang });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('policyFlow.showTable', async (uri) => {
            try {
                const root = await resolveRoot(uri);
                if (!root) return;

                let configPath = findFileByName(root, 'configuration.json');
                let flowPath = findFileByName(root, 'documentFlow.json');
                let transPath = findFileByName(root, 'translation.csv');

                if (!configPath || !flowPath || !transPath) {
                    configPath = configPath || path.join(root, 'configuration.json');
                    flowPath = flowPath || path.join(root, 'documentFlow.json');
                    transPath = transPath || path.join(root, 'translation', 'translation.csv');
                    vscode.window.showInformationMessage(uiI18n.t('msg.extension.configNotFound'));
                }

                if (currentPanel) currentPanel.dispose();
                currentCtx = {
                    flowPath, configPath, transPath, extensionUri,
                    uiLanguage: uiI18n.getLang()
                };
                history.init(currentCtx);
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
                    const isMutating = MUTATING_TYPES.has(msg.type);
                    if (isMutating) {
                        history.pushSnapshot(currentCtx, labelForMessage(msg));
                    }
                    try {
                        if (msg.type === 'deleteState') await handleDeleteState(currentCtx, currentPanel, msg.state);
                        else if (msg.type === 'addState') await handleAddState(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'editState') await handleEditState(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'toggleTerminal') await handleToggleTerminal(currentCtx, currentPanel, msg.state, msg.value);
                        else if (msg.type === 'reload') {
                            const { invalidateProjectCache } = require('./src/storage');
                            invalidateProjectCache(currentCtx);
                            history.clear(currentCtx);
                            loadData(currentCtx);
                            pushRender(currentCtx, currentPanel);
                        }
                        else if (msg.type === 'undo') {
                            history.undo(currentCtx);
                            pushRender(currentCtx, currentPanel);
                        }
                        else if (msg.type === 'redo') {
                            history.redo(currentCtx);
                            pushRender(currentCtx, currentPanel);
                        }
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
                        else if (msg.type === 'addAttachmentType') await handleAddAttachmentType(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'removeAttachmentType') await handleRemoveAttachmentType(currentCtx, currentPanel, msg.code);
                        else if (msg.type === 'addAttachmentToDoc') await handleAddAttachmentToDoc(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'removeAttachmentFromDoc') await handleRemoveAttachmentFromDoc(currentCtx, currentPanel, msg.code);
                        else if (msg.type === 'addActor') await handleAddActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'deleteActor') await handleDeleteActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'addStateToActor') await handleAddStateToActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'deleteStateFromActor') await handleDeleteStateFromActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'addTransitionToActor') await handleAddTransitionToActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'deleteTransitionFromActor') await handleDeleteTransitionFromActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'editActorPerm') await handleEditActorPerm(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'duplicateActor') await handleDuplicateActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'saveActorAuth') await handleSaveActorAuth(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'renameActor') await handleRenameActor(currentCtx, currentPanel, msg.payload);
                        else if (msg.type === 'setUiLanguage') await handleSetUiLanguage(msg.payload);
                        else if (msg.type === 'setInitialState') await handleSetInitialState(currentCtx, currentPanel, msg.state);
                        else if (msg.type === 'listDocumentsForCompare') {
                            const docs = await handleListDocumentsForCompare(currentCtx);
                            currentPanel.webview.postMessage({ type: 'documentsForCompare', docs });
                        }
                        else if (msg.type === 'compareDocuments') {
                            try {
                                const diff = await handleCompareDocuments(currentCtx, msg.payload);
                                currentPanel.webview.postMessage({ type: 'compareResult', diff });
                            } catch (err) {
                                currentPanel.webview.postMessage({ type: 'compareError', error: err.message });
                            }
                        }
                        else if (msg.type === 'applyCompareDocuments') {
                            try {
                                const actions = (msg.payload && msg.payload.actions) || [];
                                const removeCount = actions.filter(a =>
                                    String(a.kind || '').startsWith('remove')
                                ).length;

                                if (removeCount > 0) {
                                    const answer = await vscode.window.showWarningMessage(
                                        uiI18n.t('confirm.compare.remove', { n: String(removeCount) }),
                                        { modal: true },
                                        uiI18n.t('confirm.compare.remove.ok'),
                                        uiI18n.t('common.cancel')
                                    );
                                    if (answer !== uiI18n.t('confirm.compare.remove.ok')) {
                                        currentPanel.webview.postMessage({
                                            type: 'applyCompareResult',
                                            ok: false,
                                            cancelled: true
                                        });
                                        return;
                                    }
                                }

                                const result = await handleApplyCompareDocuments(
                                    currentCtx, currentPanel, msg.payload
                                );
                                currentPanel.webview.postMessage({
                                    type: 'applyCompareResult',
                                    ok: true,
                                    applied: result.applied,
                                    warnings: result.warnings
                                });
                            } catch (err) {
                                currentPanel.webview.postMessage({
                                    type: 'applyCompareResult',
                                    ok: false,
                                    error: err.message
                                });
                            }
                        }
                        else if (msg.type === 'pickFolderForCompare') {
                            const sel = await vscode.window.showOpenDialog({
                                canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
                                openLabel: uiI18n.t('confirm.compare.pickFolder')
                            });
                            if (!sel || !sel.length) {
                                currentPanel.webview.postMessage({ type: 'folderPicked', cancelled: true });
                            } else {
                                const folder = sel[0].fsPath;
                                const fp = path.join(folder, 'documentFlow.json');
                                if (!fs.existsSync(fp)) {
                                    currentPanel.webview.postMessage({
                                        type: 'folderPicked',
                                        error: uiI18n.t('err.compare.folderInvalid')
                                    });
                                } else {
                                    currentPanel.webview.postMessage({
                                        type: 'folderPicked',
                                        flowPath: fp,
                                        docName: path.basename(folder)
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        if (isMutating) {
                            history.popLastSnapshot(currentCtx);
                        }
                        vscode.window.showErrorMessage(uiI18n.t('err.extension.prefix', { message: e.message }));
                        console.error(e);
                        return;
                    }

                });

                panel.onDidDispose(() => {
                    if (currentPanel === panel) { currentPanel = null; currentCtx = null; }
                });

                pushRender(currentCtx, currentPanel);
            } catch (e) {
                vscode.window.showErrorMessage(uiI18n.t('err.extension.prefix', { message: e.message }));
                console.error(e);
            }
        })
    );
}

function deactivate() { }

module.exports = { activate, deactivate };