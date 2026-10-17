(function () {
    'use strict';

    window.PF = window.PF || {};

    PF.vscode = acquireVsCodeApi();

    const saved = PF.vscode.getState() || {};

    PF.state = {
        sortDir: (typeof saved.sortDir === 'number') ? saved.sortDir : 0,
        expandedMap: saved.expandedMap || {},
        viewMode: saved.viewMode || 'table',
        layoutRankDir: (saved.layoutRankDir === 'LR') ? 'LR' : 'TB',
        showTransitionLabels: (saved.showTransitionLabels !== false),
        toolbarPosition: saved.toolbarPosition || 'top',
        legendVisible: saved.legendVisible !== true,
        legendPos: (saved.legendPos && typeof saved.legendPos === 'object')
            ? { right: saved.legendPos.right, bottom: saved.legendPos.bottom }
            : null,

        // Заполняется в main.js после парсинга policyFlowData
        DATA: null,
        meta: null,
        stateDetails: null,
        graphData: null,

        viewBox: { x: 0, y: 0, w: 1000, h: 1000 },
        zoomPercent: 100,

        selectedLang: 'en-US',
        languages: [],
        selectedStates: new Set(),
        selectedTransitions: new Set(),
        draftTransition: null,
        lastContextMenuBlockUntil: 0
    };

    PF.state.setData = function (DATA) {
        PF.state.DATA = DATA;
        PF.state.meta = DATA.meta;
        PF.state.stateDetails = DATA.stateDetails;
        // graphData — отдельная копия, чтобы drag/reroute не мутировал DATA.graph
        PF.state.graphData = JSON.parse(JSON.stringify(DATA.graph || { states: [], transitions: [] }));
        if (PF.i18n && PF.i18n.init) {
            PF.i18n.init(
                (DATA.meta && DATA.meta.languages) || [],
                (DATA.meta && DATA.meta.defaultLang) || 'en-US'
            );
            setTimeout(() => PF.i18n.attachSelector(), 0);
        }
    };

    PF.app = {};

    PF.persistState = function () {
        PF.vscode.setState({
            sortDir: PF.state.sortDir,
            expandedMap: PF.state.expandedMap,
            viewMode: PF.state.viewMode,
            layoutRankDir: PF.state.layoutRankDir,
            showTransitionLabels: PF.state.showTransitionLabels,
            toolbarPosition: PF.state.toolbarPosition,
            legendVisible: PF.state.legendVisible,
            legendPos: PF.state.legendPos
        });
    };
})();