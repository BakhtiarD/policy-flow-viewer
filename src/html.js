const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

function renderHtml(webview, extensionUri, rows, meta, stateDetails, graph, hasUi, authMeta, relMeta) {
    const tplPath = path.join(extensionUri.fsPath, 'media', 'index.html');
    const tpl = fs.readFileSync(tplPath, 'utf8');

    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
    const dagreUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'vendor', 'dagre.min.js'));
    const jsStateUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'state.js'));
    const jsUtilsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'utils.js'));
    const jsIconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'icons.js'));
    const jsRelationsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'relations.js'));
    const jsRoutingUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'routing.js'));
    const jsGraphLayoutUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'graph-layout.js'));
    const jsGraphRenderUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'graph-render.js'));
    const jsGraphDragUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'graph-drag.js'));
    const jsFormsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'forms.js'));
    const jsFormsOtherUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'forms-other.js'));
    const jsToolbarUri    = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'modules', 'toolbar.js'));

    const dataJson = JSON.stringify({
        rows, meta, stateDetails, graph, hasUi,
        auth: authMeta || { found: false, docName: '', path: null, rows: [], allRoles: [] },
        relations: relMeta || { docName: '', path: null, relations: [] }
    })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    return tpl
        .replace(/\{\{CSP_SOURCE\}\}/g, () => webview.cspSource)
        .replace(/\{\{CSS_URI\}\}/g, () => cssUri.toString())
        .replace(/\{\{JS_STATE\}\}/g, () => jsStateUri.toString())
        .replace(/\{\{JS_UTILS\}\}/g, () => jsUtilsUri.toString())
        .replace(/\{\{JS_ICONS\}\}/g, () => jsIconsUri.toString())
        .replace(/\{\{JS_RELATIONS\}\}/g, () => jsRelationsUri.toString())
        .replace(/\{\{JS_ROUTING\}\}/g, () => jsRoutingUri.toString())
        .replace(/\{\{JS_GRAPH_LAYOUT\}\}/g, () => jsGraphLayoutUri.toString())
        .replace(/\{\{JS_GRAPH_RENDER\}\}/g, () => jsGraphRenderUri.toString())
        .replace(/\{\{JS_GRAPH_DRAG\}\}/g, () => jsGraphDragUri.toString())
        .replace(/\{\{JS_FORMS\}\}/g, () => jsFormsUri.toString())
        .replace(/\{\{JS_FORMS_OTHER\}\}/g, () => jsFormsOtherUri.toString())
        .replace(/\{\{JS_TOOLBAR\}\}/g,     () => jsToolbarUri.toString())
        .replace(/\{\{JS_URI\}\}/g, () => jsUri.toString())
        .replace(/\{\{DAGRE_URI\}\}/g, () => dagreUri.toString())
        .replace(/\{\{DATA_JSON\}\}/g, () => dataJson);
}

module.exports = { renderHtml };