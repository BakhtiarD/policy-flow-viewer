(function () {
  'use strict';

  window.PF = window.PF || {};

  function clientToSvg(evt) {
    const svg = document.getElementById('graphSvg');
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function startDrag(ev, state, gEl) {
    const start = clientToSvg(ev);
    const origX = state.x, origY = state.y;

    gEl.classList.add('dragging');

    function onMove(e) {
      const cur = clientToSvg(e);
      state.x = origX + (cur.x - start.x);
      state.y = origY + (cur.y - start.y);
      const rect = gEl.querySelector('rect');
      rect.setAttribute('x', state.x);
      rect.setAttribute('y', state.y);
      const texts = gEl.querySelectorAll('text');
      if (texts.length) {
        const cx = state.x + state.w / 2;
        const cy = state.y + state.h / 2;
        const hasRu = texts.length > 1;
        texts[0].setAttribute('x', cx);
        texts[0].setAttribute('y', hasRu ? cy - 7 : cy);
        if (texts[1]) {
          texts[1].setAttribute('x', cx);
          texts[1].setAttribute('y', cy + 13);
        }
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      gEl.classList.remove('dragging');
      if (state.x !== origX || state.y !== origY) {
        PF.routing.rerouteAll();
        PF.render.renderGraph();
        PF.layout.applyViewBox();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startPan(ev) {
    const svg = document.getElementById('graphSvg');
    svg.classList.add('panning');

    let lastX = ev.clientX, lastY = ev.clientY;
    const box = svg.getBoundingClientRect();

    function onMove(e) {
      const vb = PF.state.viewBox;
      const scaleX = vb.w / box.width;
      const scaleY = vb.h / box.height;
      vb.x -= (e.clientX - lastX) * scaleX;
      vb.y -= (e.clientY - lastY) * scaleY;
      lastX = e.clientX;
      lastY = e.clientY;
      PF.layout.applyViewBox();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      svg.classList.remove('panning');
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function updateTransitionDom(t) {
    const svg = document.getElementById('graphSvg');
    if (!svg) return;
    const transName = t.name.replace(/"/g, '\\"');
    const g = svg.querySelector('.g-transition[data-transition-name="' + transName + '"]');
    if (!g) return;

    const d = PF.routing.buildRoundedPath(t.waypoints, 10);

    const linePath = g.querySelector('path.g-transition-line');
    if (linePath) linePath.setAttribute('d', d);

    const hitPath = g.querySelector('path.g-transition-hit');
    if (hitPath) hitPath.setAttribute('d', d);

    if (t.label) {
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

      const bg = g.querySelector('.g-transition-label-bg');
      if (bg) {
        bg.setAttribute('x', boxCx - boxW / 2);
        bg.setAttribute('y', boxCy - boxH / 2);
        bg.setAttribute('width', boxW);
        bg.setAttribute('height', boxH);
      }
      const textEl = g.querySelector('.g-transition-label-text');
      if (textEl) {
        textEl.setAttribute('x', boxCx);
        textEl.setAttribute('y', boxCy);
        textEl.textContent = labelText;
      }
    }

    svg.querySelectorAll('.g-transition-handle[data-transition="' + transName + '"][data-idx]').forEach(h => {
      const idx = parseInt(h.getAttribute('data-idx'), 10);
      if (!t.waypoints[idx]) return;
      h.setAttribute('cx', t.waypoints[idx].x);
      h.setAttribute('cy', t.waypoints[idx].y);
    });

    svg.querySelectorAll('.g-transition-handle-hit[data-transition="' + transName + '"][data-idx]').forEach(hit => {
      const idx = parseInt(hit.getAttribute('data-idx'), 10);
      if (!t.waypoints[idx]) return;
      hit.setAttribute('cx', t.waypoints[idx].x);
      hit.setAttribute('cy', t.waypoints[idx].y);
    });

    svg.querySelectorAll('.g-transition-seg-handle[data-transition="' + transName + '"], ' +
                         '.g-transition-seg-handle-hit[data-transition="' + transName + '"]')
      .forEach(el => {
        const si = parseInt(el.getAttribute('data-seg'), 10);
        const a = t.waypoints[si];
        const b = t.waypoints[si + 1];
        if (!a || !b) return;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const perp = PF.routing.segPerp(a, b);
        const half = 8;
        const x1 = mx - perp.x * half;
        const y1 = my - perp.y * half;
        const x2 = mx + perp.x * half;
        const y2 = my + perp.y * half;
        el.setAttribute('x1', x1);
        el.setAttribute('y1', y1);
        el.setAttribute('x2', x2);
        el.setAttribute('y2', y2);
      });
  }

  function startHandleDrag(ev, transitionName, pointIdx) {
    const t = PF.state.graphData.transitions.find(x => x.name === transitionName);
    if (!t) return;

    if (!t.manual) t.manual = true;
    t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));

    const start = clientToSvg(ev);
    const origPt = { x: t.waypoints[pointIdx].x, y: t.waypoints[pointIdx].y };

    const svg = document.getElementById('graphSvg');
    const transName = t.name.replace(/"/g, '\\"');
    const handle = svg.querySelector(
      '.g-transition-handle[data-transition="' + transName + '"][data-idx="' + pointIdx + '"]'
    );
    if (handle) handle.classList.add('dragging');

    function onMove(e) {
      const cur = clientToSvg(e);
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;

      const newPt = { x: origPt.x + dx, y: origPt.y + dy };
      t.waypoints[pointIdx] = newPt;
      t.manualWaypoints[pointIdx] = { x: newPt.x, y: newPt.y };
      t.label = PF.routing.labelFromWaypoints(t.waypoints);

      updateTransitionDom(t);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (handle) handle.classList.remove('dragging');
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startEndPointDrag(ev, transitionName, which) {
    const t = PF.state.graphData.transitions.find(x => x.name === transitionName);
    if (!t) return;

    const stateName = which === 'start' ? t.from : t.to;
    const stateObj = PF.state.graphData.states.find(s => s.name === stateName);
    if (!stateObj) return;

    const idx = which === 'start' ? 0 : t.waypoints.length - 1;
    const start = clientToSvg(ev);
    const origPt = { x: t.waypoints[idx].x, y: t.waypoints[idx].y };

    const svg = document.getElementById('graphSvg');
    const transName = t.name.replace(/"/g, '\\"');
    const handle = svg.querySelector(
      '.g-transition-handle-end[data-transition="' + transName + '"][data-end="' + which + '"]'
    );
    if (handle) handle.classList.add('dragging');

    const stateG = svg.querySelector('.g-state[data-state-name="' + stateName.replace(/"/g, '\\"') + '"]');
    if (stateG) stateG.classList.add('snap-target');

    function onMove(e) {
      const cur = clientToSvg(e);
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;
      t.waypoints[idx] = { x: origPt.x + dx, y: origPt.y + dy };
      t.label = PF.routing.labelFromWaypoints(t.waypoints);
      updateTransitionDom(t);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (handle) handle.classList.remove('dragging');
      if (stateG) stateG.classList.remove('snap-target');

      const pt = t.waypoints[idx];
      const edge = PF.routing.findNearestEdge(stateObj, pt);
      const snapped = PF.routing.snapToEdge(stateObj, edge, pt);
      t.waypoints[idx] = snapped;

      t.manual = true;
      t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
      t.label = PF.routing.labelFromWaypoints(t.waypoints);

      PF.render.renderGraph();
      PF.layout.applyViewBox();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startSegmentDrag(ev, transitionName, segIdx) {
    const t = PF.state.graphData.transitions.find(x => x.name === transitionName);
    if (!t) return;
    const p1 = t.waypoints[segIdx];
    const p2 = t.waypoints[segIdx + 1];
    if (!p1 || !p2) return;

    const orig1 = { x: p1.x, y: p1.y };
    const orig2 = { x: p2.x, y: p2.y };
    const perp = PF.routing.segPerp(orig1, orig2);

    t.manual = true;
    t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));

    const start = clientToSvg(ev);

    const svg = document.getElementById('graphSvg');
    const hitEl = svg.querySelector(
      '.g-transition-seg-handle-hit[data-transition="' + t.name.replace(/"/g, '\\"') +
      '"][data-seg="' + segIdx + '"]'
    );
    if (hitEl) hitEl.classList.add('dragging');

    function onMove(e) {
      const cur = clientToSvg(e);
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;

      const proj = dx * perp.x + dy * perp.y;
      const nx = proj * perp.x;
      const ny = proj * perp.y;

      t.waypoints[segIdx]     = { x: orig1.x + nx, y: orig1.y + ny };
      t.waypoints[segIdx + 1] = { x: orig2.x + nx, y: orig2.y + ny };
      t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
      t.label = PF.routing.labelFromWaypoints(t.waypoints);

      updateTransitionDom(t);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (hitEl) hitEl.classList.remove('dragging');
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function removeWaypoint(transitionName, pointIdx) {
    const t = PF.state.graphData.transitions.find(x => x.name === transitionName);
    if (!t) return;
    if (!t.waypoints || t.waypoints.length <= 2) return;
    if (pointIdx <= 0 || pointIdx >= t.waypoints.length - 1) return;

    t.waypoints.splice(pointIdx, 1);
    t.manual = true;
    t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
    t.label = PF.routing.labelFromWaypoints(t.waypoints);

    PF.render.renderGraph();
    PF.layout.applyViewBox();
  }

  function addWaypointAt(transitionName, segIdx, pt) {
    const t = PF.state.graphData.transitions.find(x => x.name === transitionName);
    if (!t) return;
    if (!t.waypoints || t.waypoints.length < 2) return;
    if (segIdx < 0 || segIdx >= t.waypoints.length - 1) return;

    t.waypoints.splice(segIdx + 1, 0, { x: pt.x, y: pt.y });
    t.manual = true;
    t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
    t.label = PF.routing.labelFromWaypoints(t.waypoints);

    PF.render.renderGraph();
    PF.layout.applyViewBox();
  }

  function attachGraphSvgHandlers() {
    const svg = document.getElementById('graphSvg');
    if (!svg || svg.dataset.svgHandlersAttached === '1') return;
    svg.dataset.svgHandlersAttached = '1';

    svg.addEventListener('mousedown', (ev) => {
      const rootG = svg.querySelector('g');
      const isBg = (ev.target === svg || ev.target === rootG || ev.target.tagName === 'svg');
      if (!isBg) return;
      if (!ev.ctrlKey && !ev.metaKey) {
        if (PF.state.selectedStates.size || PF.state.selectedTransitions.size) {
          PF.render.clearSelection();
        }
      }
      svg.focus();
      startPan(ev);
    });

    svg.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      const pt = clientToSvg(ev);
      PF.layout.zoomAt(factor, pt);
    }, { passive: false });

    svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  function attachGraphKeydown() {
    const svg = document.getElementById('graphSvg');
    if (!svg || svg.dataset.kdAttached === '1') return;
    svg.dataset.kdAttached = '1';

    svg.addEventListener('keydown', (ev) => {
      if (PF.state.viewMode !== 'graph') return;
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const codes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!codes.includes(ev.key)) return;
      if (!PF.state.selectedStates.size) return;

      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (ev.key === 'ArrowUp')    dy = -step;
      if (ev.key === 'ArrowDown')  dy =  step;
      if (ev.key === 'ArrowLeft')  dx = -step;
      if (ev.key === 'ArrowRight') dx =  step;

      for (const s of PF.state.graphData.states) {
        if (!PF.state.selectedStates.has(s.name)) continue;
        s.x += dx; s.y += dy;
      }
      PF.routing.rerouteAll();
      PF.render.renderGraph();
      PF.layout.applyViewBox();
    });
  }

  function findStateAt(x, y) {
    for (const s of PF.state.graphData.states) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    }
    return null;
  }

  function startTransitionDraw(fromName) {
    const svg = document.getElementById('graphSvg');
    if (!svg) return;
    const fromState = PF.state.graphData.states.find(s => s.name === fromName);
    if (!fromState) return;

    const old = svg.querySelector('.g-transition-draft');
    if (old) old.remove();

    const startPt = {
      x: fromState.x + fromState.w / 2,
      y: fromState.y + fromState.h / 2
    };

    const line = PF.utils.svgEl('line', {
      class: 'g-transition-draft',
      x1: startPt.x, y1: startPt.y,
      x2: startPt.x, y2: startPt.y
    });
    const root = svg.querySelector('g') || svg;
    root.appendChild(line);

    PF.state.draftTransition = { fromName, line, startPt };

    function onMove(e) {
      const pt = clientToSvg(e);
      line.setAttribute('x2', pt.x);
      line.setAttribute('y2', pt.y);
    }

    function cleanup() {
      if (PF.state.draftTransition && PF.state.draftTransition.line) {
        PF.state.draftTransition.line.remove();
      }
      PF.state.draftTransition = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onEsc, true);
    }

    function onEsc(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      }
    }

    function onDown(e) {
      if (e.button !== 0 && e.button !== 2) return;
      const pt = clientToSvg(e);
      const hit = findStateAt(pt.x, pt.y);

      if (!hit) { cleanup(); return; }
      if (hit.name === fromName) { cleanup(); return; }

      e.preventDefault();
      e.stopPropagation();

      const toName = hit.name;
      cleanup();
      PF.state.lastContextMenuBlockUntil = Date.now() + 300;
      createDraftTransition(fromName, toName);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onEsc, true);
  }

  function createDraftTransition(fromName, toName) {
    const code = fromName + '_' + toName;

    const existing = PF.state.graphData.transitions.find(t => t.name === code);
    if (existing) {
      PF.forms.openTransitionForm(existing.name);
      return;
    }

    const sameEndpoints = PF.state.graphData.transitions.find(
      t => t.from === fromName && t.to === toName
    );
    if (sameEndpoints) {
      PF.forms.openTransitionForm(sameEndpoints.name);
      return;
    }

    const draft = {
      name: code,
      from: fromName,
      to: toName,
      ru: code,
      actionToRunBefore: '',
      serverSideEvents: false,
      allowOnValidationErrors: null,
      manual: false,
      manualWaypoints: null,
      _isNew: true
    };
    PF.state.graphData.transitions.push(draft);
    PF.routing.rerouteAll();
    PF.render.renderGraph();
    PF.layout.applyViewBox();
    PF.forms.openTransitionForm(code);
  }

  PF.graphDrag = {
    clientToSvg,
    startDrag,
    startPan,
    startHandleDrag,
    startEndPointDrag,
    startSegmentDrag,
    updateTransitionDom,
    removeWaypoint,
    addWaypointAt,
    attachGraphSvgHandlers,
    attachGraphKeydown,
    findStateAt,
    startTransitionDraw,
    createDraftTransition
  };
})();
