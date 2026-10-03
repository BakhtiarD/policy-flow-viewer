(function () {
    'use strict';

    window.PF = window.PF || {};

    const { svgEl, cloneTemplate, showAlert, showConfirm } = PF.utils;
    const ICONS = PF.icons;

    function computeRelated() {
        const selectedStates = PF.state.selectedStates;
        const selectedTransitions = PF.state.selectedTransitions;

        const relStates = new Set();
        const relTransitions = new Set();

        if (!selectedStates.size && !selectedTransitions.size) {
            return { relStates, relTransitions };
        }

        const transitions = (PF.state.graphData && PF.state.graphData.transitions) || [];

        for (const sName of selectedStates) {
            for (const t of transitions) {
                if (t.from === sName || t.to === sName) {
                    if (!selectedTransitions.has(t.name)) relTransitions.add(t.name);
                    const other = (t.from === sName) ? t.to : t.from;
                    if (!selectedStates.has(other)) relStates.add(other);
                }
            }
        }

        const endpoints = new Set();
        for (const tName of selectedTransitions) {
            const t = transitions.find(x => x.name === tName);
            if (!t) continue;
            endpoints.add(t.from);
            endpoints.add(t.to);
        }
        for (const sName of endpoints) {
            if (!selectedStates.has(sName)) relStates.add(sName);
            for (const t of transitions) {
                if (t.from === sName || t.to === sName) {
                    if (!selectedTransitions.has(t.name)) relTransitions.add(t.name);
                }
            }
        }

        for (const x of selectedStates) relStates.delete(x);
        for (const x of selectedTransitions) relTransitions.delete(x);

        return { relStates, relTransitions };
    }

    function updateSelectionClasses() {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;

        const selectedStates = PF.state.selectedStates;
        const selectedTransitions = PF.state.selectedTransitions;
        const { relStates, relTransitions } = computeRelated();

        svg.querySelectorAll('.g-state').forEach(g => {
            const n = g.dataset.stateName;
            g.classList.toggle('selected', selectedStates.has(n));
            g.classList.toggle('related', !selectedStates.has(n) && relStates.has(n));
        });
        svg.querySelectorAll('.g-transition').forEach(g => {
            const n = g.dataset.transitionName;
            g.classList.toggle('selected', selectedTransitions.has(n));
            g.classList.toggle('related', !selectedTransitions.has(n) && relTransitions.has(n));
        });
    }

    function clearSelection() {
        PF.state.selectedStates.clear();
        PF.state.selectedTransitions.clear();
        updateSelectionClasses();
        updateSelectionToolbar();
        renderGraph();
        PF.layout.applyViewBox();
    }

    function updateSelectionToolbar() {
        const editBtn = document.getElementById('editSelectedBtn');
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        const hint = document.getElementById('selectionHint');
        if (!editBtn || !deleteBtn) return;

        const selectedStates = PF.state.selectedStates;
        const selectedTransitions = PF.state.selectedTransitions;

        const total = selectedStates.size + selectedTransitions.size;
        editBtn.disabled = total !== 1;
        deleteBtn.disabled = total === 0;

        const parts = [];
        if (selectedStates.size) parts.push('состояний: ' + selectedStates.size);
        if (selectedTransitions.size) parts.push('переходов: ' + selectedTransitions.size);
        if (hint) hint.textContent = parts.length ? 'выделено ' + parts.join(', ') : '';
    }

    function editSelected() {
        const selectedStates = PF.state.selectedStates;
        const selectedTransitions = PF.state.selectedTransitions;

        const total = selectedStates.size + selectedTransitions.size;
        if (total !== 1) return;
        if (selectedStates.size === 1) {
            const name = [...selectedStates][0];
            PF.app.openEditForm(name);
        } else {
            const name = [...selectedTransitions][0];
            PF.app.openTransitionForm(name);
        }
    }

    async function deleteSelected() {
        const selectedStates = PF.state.selectedStates;
        const selectedTransitions = PF.state.selectedTransitions;

        const stCount = selectedStates.size;
        const trCount = selectedTransitions.size;
        if (!stCount && !trCount) return;

        const lines = [];
        if (stCount) lines.push('состояний: ' + stCount + (stCount === 1 ? ' (' + [...selectedStates][0] + ')' : ''));
        if (trCount) lines.push('переходов: ' + trCount + (trCount === 1 ? ' (' + [...selectedTransitions][0] + ')' : ''));

        const ok = await showConfirm(
            'Удалить выделенное?\n\n' + lines.join('\n') + '\n\n' +
            'Будут изменены: documentFlow.json, configuration.json, translation.csv, documentFlow.ui.json',
            'Удаление выделенного'
        );
        if (!ok) return;

        const statesArr = [...selectedStates];
        const transitionsArr = [...selectedTransitions];

        selectedStates.clear();
        selectedTransitions.clear();
        updateSelectionToolbar();

        for (const name of statesArr) {
            PF.vscode.postMessage({ type: 'deleteState', state: name });
        }
        if (transitionsArr.length) {
            PF.vscode.postMessage({ type: 'deleteTransitions', names: transitionsArr });
        }
    }

    function renderGraph() {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;
        svg.innerHTML = '';

        const graphData = PF.state.graphData;
        const selectedStates = PF.state.selectedStates;
        const selectedTransitions = PF.state.selectedTransitions;

        const defs = svgEl('defs');
        const marker = svgEl('marker', {
            id: 'arr', viewBox: '0 0 10 10',
            refX: '9', refY: '5',
            markerWidth: '7', markerHeight: '7',
            orient: 'auto-start-reverse'
        });
        const arrow = svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z' });
        arrow.setAttribute('fill', 'var(--vscode-charts-green, #3fb950)');
        marker.appendChild(arrow);
        defs.appendChild(marker);
        svg.appendChild(defs);

        const root = svgEl('g');
        svg.appendChild(root);

        // --- transitions ---
        const gT = svgEl('g', { class: 'g-transitions' });
        for (const t of graphData.transitions) {
            const g = svgEl('g', { class: 'g-transition' });
            g.dataset.transitionName = t.name;
            if (selectedTransitions.has(t.name)) g.classList.add('selected');

            if (t.waypoints && t.waypoints.length >= 2) {
                const d = PF.routing.buildRoundedPath(t.waypoints, 10);

                g.appendChild(svgEl('path', {
                    d: d,
                    class: 'g-transition-line',
                    'marker-end': 'url(#arr)',
                    fill: 'none'
                }));

                const hit = svgEl('path', { d: d, class: 'g-transition-hit' });

                hit.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    svg.focus();

                    if (ev.ctrlKey || ev.metaKey) {
                        if (selectedTransitions.has(t.name)) selectedTransitions.delete(t.name);
                        else selectedTransitions.add(t.name);
                        renderGraph();
                        PF.layout.applyViewBox();
                        updateSelectionToolbar();
                        return;
                    }

                    const alreadySoleSelected =
                        selectedTransitions.size === 1 && selectedTransitions.has(t.name) &&
                        selectedStates.size === 0;

                    if (alreadySoleSelected) return;

                    selectedStates.clear();
                    selectedTransitions.clear();
                    selectedTransitions.add(t.name);
                    renderGraph();
                    PF.layout.applyViewBox();
                    updateSelectionToolbar();
                });

                hit.addEventListener('dblclick', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();

                    // Alt + двойной клик — добавить промежуточную точку в месте клика
                    if (ev.altKey) {
                        const svgPt = PF.drag.clientToSvg(ev);
                        const segIdx = PF.routing.findSegmentIndex(t.waypoints, svgPt);
                        if (segIdx >= 0) {
                            PF.drag.addWaypointAt(t.name, segIdx, svgPt);
                        }
                        return;
                    }

                    // Обычный двойной клик — открыть модалку
                    PF.app.openTransitionForm(t.name);
                });

                g.appendChild(hit);
            }

            if (t.label && PF.state.showTransitionLabels) {
                const labelText = t.name + (t.manual ? ' ✎' : '') +
                    (t.ru && t.ru !== t.name ? ' (' + t.ru + ')' : '');
                const textW = Math.max(30, labelText.length * 5.5 + 8);
                const boxW = textW + 8;
                const boxH = 16;

                let boxCx, boxCy;
                if (t.label.orientation === 'h') {
                    boxCx = t.label.x;
                    boxCy = t.label.y - boxH / 2 - 6;
                } else {
                    boxCx = t.label.x + boxW / 2 + 10;
                    boxCy = t.label.y;
                }

                const labelBg = svgEl('rect', {
                    class: 'g-transition-label-bg',
                    x: boxCx - boxW / 2,
                    y: boxCy - boxH / 2,
                    width: boxW,
                    height: boxH,
                    rx: 3
                });
                g.appendChild(labelBg);

                const labelEl = svgEl('text', {
                    class: 'g-transition-label-text',
                    x: boxCx,
                    y: boxCy,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle'
                });
                labelEl.textContent = labelText;
                g.appendChild(labelEl);

                const onLabelDown = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    svg.focus();

                    if (ev.ctrlKey || ev.metaKey) {
                        if (selectedTransitions.has(t.name)) selectedTransitions.delete(t.name);
                        else selectedTransitions.add(t.name);
                        renderGraph();
                        PF.layout.applyViewBox();
                        updateSelectionToolbar();
                        return;
                    }

                    const alreadySoleSelected =
                        selectedTransitions.size === 1 && selectedTransitions.has(t.name) &&
                        selectedStates.size === 0;

                    if (alreadySoleSelected) return;

                    selectedStates.clear();
                    selectedTransitions.clear();
                    selectedTransitions.add(t.name);
                    renderGraph();
                    PF.layout.applyViewBox();
                    updateSelectionToolbar();
                };
                const onLabelDbl = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    PF.app.openTransitionForm(t.name);
                };
                labelBg.addEventListener('mousedown', onLabelDown);
                labelEl.addEventListener('mousedown', onLabelDown);
                labelBg.addEventListener('dblclick', onLabelDbl);
                labelEl.addEventListener('dblclick', onLabelDbl);
            }

            gT.appendChild(g);
        }
        root.appendChild(gT);

        // --- states ---
        const gS = svgEl('g', { class: 'g-states' });
        for (const s of graphData.states) {
            const g = svgEl('g', { class: 'g-state' });
            g.dataset.stateName = s.name;
            if (selectedStates.has(s.name)) g.classList.add('selected');

            const rect = svgEl('rect', {
                x: s.x, y: s.y, width: s.w, height: s.h, rx: 12
            });
            g.appendChild(rect);

            const cx = s.x + s.w / 2;
            const cy = s.y + s.h / 2;
            const hasRu = s.ru && s.ru !== s.name;

            const nameText = svgEl('text', {
                x: cx,
                y: hasRu ? cy - 7 : cy,
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                'font-weight': '600',
                'font-size': '13'
            });
            nameText.textContent = s.name;
            g.appendChild(nameText);

            if (hasRu) {
                const ruText = svgEl('text', {
                    x: cx, y: cy + 13,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    'font-size': '11', 'opacity': '0.8'
                });
                ruText.textContent = s.ru;
                g.appendChild(ruText);
            }

            rect.addEventListener('dblclick', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                PF.app.openEditForm(s.name);
            });

            rect.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                svg.focus();

                if (ev.ctrlKey || ev.metaKey) {
                    if (selectedStates.has(s.name)) selectedStates.delete(s.name);
                    else selectedStates.add(s.name);
                    updateSelectionClasses();
                    updateSelectionToolbar();
                    return;
                }

                const alreadySoleSelected =
                    selectedStates.size === 1 && selectedStates.has(s.name) &&
                    selectedTransitions.size === 0;

                if (!alreadySoleSelected) {
                    selectedStates.clear();
                    selectedTransitions.clear();
                    selectedStates.add(s.name);
                    renderGraph();
                    PF.layout.applyViewBox();
                    updateSelectionToolbar();
                    const newG = document.querySelector(
                        '.g-state[data-state-name="' + s.name.replace(/"/g, '\\"') + '"]'
                    );
                    if (newG) {
                        const newRect = newG.querySelector('rect');
                        PF.app.startDrag(ev, s, newG);
                        if (newRect && newRect.focus) newRect.focus();
                    }
                    return;
                }

                PF.app.startDrag(ev, s, g);
            });

            rect.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (PF.state.draftTransition) return;
                if (Date.now() < PF.state.lastContextMenuBlockUntil) return;
                PF.app.startTransitionDraw(s.name);
            });

            gS.appendChild(g);
        }
        root.appendChild(gS);

        // --- handles (поверх всего) ---
        const gHandles = svgEl('g', { class: 'g-handles' });
        for (const t of graphData.transitions) {
            if (!selectedTransitions.has(t.name)) continue;
            if (!t.waypoints || t.waypoints.length < 2) continue;

            const lastIdx = t.waypoints.length - 1;

            // --- крайние точки ---
            for (const [idx, end] of [[0, 'start'], [lastIdx, 'end']]) {
                const p = t.waypoints[idx];

                const hitZone = svgEl('circle', {
                    class: 'g-transition-handle-hit',
                    cx: p.x, cy: p.y, r: 14,
                    'data-idx': String(idx),
                    'data-transition': t.name
                });
                hitZone.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    PF.app.startEndPointDrag(ev, t.name, end);
                });
                gHandles.appendChild(hitZone);

                const handle = svgEl('circle', {
                    class: 'g-transition-handle g-transition-handle-end',
                    cx: p.x, cy: p.y, r: 9,
                    'data-idx': String(idx),
                    'data-end': end,
                    'data-transition': t.name
                });
                handle.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    PF.app.startEndPointDrag(ev, t.name, end);
                });
                gHandles.appendChild(handle);
            }

            // --- промежуточные точки ---
            for (let hi = 1; hi < lastIdx; hi++) {
                const p = t.waypoints[hi];

                const hitZone = svgEl('circle', {
                    class: 'g-transition-handle-hit',
                    cx: p.x, cy: p.y, r: 12,
                    'data-idx': String(hi),
                    'data-transition': t.name
                });
                hitZone.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (ev.button === 2) {
                        PF.app.removeWaypoint(t.name, hi);
                        return;
                    }
                    PF.app.startHandleDrag(ev, t.name, hi);
                });
                hitZone.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                });
                gHandles.appendChild(hitZone);

                const handle = svgEl('circle', {
                    class: 'g-transition-handle',
                    cx: p.x, cy: p.y, r: 8,
                    'data-idx': String(hi),
                    'data-transition': t.name
                });
                handle.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (ev.button === 2) {
                        PF.app.removeWaypoint(t.name, hi);
                        return;
                    }
                    PF.app.startHandleDrag(ev, t.name, hi);
                });
                handle.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                });
                gHandles.appendChild(handle);
            }

            // --- полоски средних сегментов ---
            for (let si = 1; si < lastIdx - 1; si++) {
                const a = t.waypoints[si];
                const b = t.waypoints[si + 1];
                if (!a || !b) continue;
                if (Math.hypot(b.x - a.x, b.y - a.y) < 3) continue;

                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const perp = PF.routing.segPerp(a, b);
                const half = 8;

                const x1 = mx - perp.x * half;
                const y1 = my - perp.y * half;
                const x2 = mx + perp.x * half;
                const y2 = my + perp.y * half;

                const hit = svgEl('line', {
                    class: 'g-transition-seg-handle-hit',
                    x1, y1, x2, y2,
                    'data-transition': t.name,
                    'data-seg': String(si)
                });
                hit.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    PF.app.startSegmentDrag(ev, t.name, si);
                });
                gHandles.appendChild(hit);

                const vis = svgEl('line', {
                    class: 'g-transition-seg-handle',
                    x1, y1, x2, y2,
                    'data-transition': t.name,
                    'data-seg': String(si)
                });
                gHandles.appendChild(vis);
            }
        }
        root.appendChild(gHandles);

        if (PF.state.draftTransition) {
            root.appendChild(PF.state.draftTransition.line);
        }

        PF.app.attachGraphSvgHandlers();
        PF.app.attachGraphKeydown();
        updateSelectionClasses();
    }

    PF.render = {
        computeRelated,
        updateSelectionClasses,
        clearSelection,
        updateSelectionToolbar,
        editSelected,
        deleteSelected,
        renderGraph
    };
})();