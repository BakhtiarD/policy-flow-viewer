(function () {
    'use strict';

    const dataEl = document.getElementById('policyFlowData');
    if (!dataEl) throw new Error('policyFlowData script tag not found');
    const DATA = JSON.parse(dataEl.textContent);

    PF.state.setData(DATA);

    PF.toolbar.init();
    PF.table.init();
    PF.routing.rerouteAll();
    PF.app.applyViewMode();
    PF.render.updateSelectionToolbar();
})();