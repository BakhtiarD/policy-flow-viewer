(function () {
    'use strict';

    const dataEl = document.getElementById('policyFlowData');
    if (!dataEl) throw new Error('policyFlowData script tag not found');
    const DATA = JSON.parse(dataEl.textContent);

    PF.state.setData(DATA);
    PF.ui.init(DATA.uiLanguage || 'ru-RU');

    PF.toolbar.init();
    if (PF.toolbar.updateHistoryButtons) {
        PF.toolbar.updateHistoryButtons(PF.state.historyState);
    }
    PF.legend.init();
    PF.table.init();
    PF.routing.rerouteAll();
    PF.app.applyViewMode();
    PF.render.updateSelectionToolbar();
    PF.compare.init();
    PF.ui.attachUiSelector();
    PF.ui.apply(document);

    /* ---------- Undo/Redo по клавиатуре ---------- */
    document.body.addEventListener('keydown', (ev) => {
        // Игнорируем, когда фокус в поле ввода/textarea/contenteditable —
        // там должен работать нативный undo.
        const t = ev.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

        // Игнорируем при открытой модалке — несохранённые правки в форме
        // + undo данных = непредсказуемое поведение.
        const mc = document.getElementById('modalContainer');
        if (mc && mc.children.length > 0) return;

        const ctrl = ev.ctrlKey || ev.metaKey;
        if (!ctrl) return;

        // ev.code — физическая позиция клавиши, не зависит от раскладки.
        // В русской Ctrl+Z даёт ev.key='я', но ev.code='KeyZ'.
        const code = ev.code;
        const isUndo = (code === 'KeyZ' && !ev.shiftKey);
        const isRedo = (code === 'KeyY') || (code === 'KeyZ' && ev.shiftKey);

        if (isUndo) {
            ev.preventDefault();
            if (PF.state.historyState && PF.state.historyState.canUndo) {
                PF.vscode.postMessage({ type: 'undo' });
            }
        } else if (isRedo) {
            ev.preventDefault();
            if (PF.state.historyState && PF.state.historyState.canRedo) {
                PF.vscode.postMessage({ type: 'redo' });
            }
        }
    });
})();