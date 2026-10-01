const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

function renderHtml(webview, extensionUri, rows, meta, stateDetails, graph, hasUi, authMeta, relMeta) {
  const tplPath = path.join(extensionUri.fsPath, 'media', 'index.html');
  const tpl = fs.readFileSync(tplPath, 'utf8');

  const cssUri  = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'));
  const jsUri   = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
  const dagreUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'vendor', 'dagre.min.js'));

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
    .replace(/\{\{CSS_URI\}\}/g,    () => cssUri.toString())
    .replace(/\{\{JS_URI\}\}/g,     () => jsUri.toString())
    .replace(/\{\{DAGRE_URI\}\}/g,  () => dagreUri.toString())
    .replace(/\{\{DATA_JSON\}\}/g,  () => dataJson);
}

module.exports = { renderHtml };