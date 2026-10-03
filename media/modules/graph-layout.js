(function () {
  'use strict';

  window.PF = window.PF || {};

  function computeBBox() {
    const graphData = PF.state.graphData;
    if (!graphData) return { x: 0, y: 0, w: 100, h: 100 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of graphData.states) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.w);
      maxY = Math.max(maxY, s.y + s.h);
    }
    for (const t of graphData.transitions) {
      for (const w of t.waypoints || []) {
        minX = Math.min(minX, w.x); minY = Math.min(minY, w.y);
        maxX = Math.max(maxX, w.x); maxY = Math.max(maxY, w.y);
      }
      if (t.label && PF.state.showTransitionLabels) {
        const labelText = t.name + (t.manual ? ' ✎' : '') +
                          (t.ru && t.ru !== t.name ? ' (' + t.ru + ')' : '');
        const textW = Math.max(30, labelText.length * 5.5 + 8);
        const boxW = textW + 8;
        const boxH = 16;
        if (t.label.orientation === 'h') {
          minX = Math.min(minX, t.label.x - boxW / 2);
          maxX = Math.max(maxX, t.label.x + boxW / 2);
          minY = Math.min(minY, t.label.y - boxH / 2 - 6);
          maxY = Math.max(maxY, t.label.y + boxH / 2 - 6);
        } else {
          minX = Math.min(minX, t.label.x + 10 - boxW / 2);
          maxX = Math.max(maxX, t.label.x + 10 + boxW / 2);
          minY = Math.min(minY, t.label.y - boxH / 2);
          maxY = Math.max(maxY, t.label.y + boxH / 2);
        }
      }
    }
    if (!isFinite(minX)) return { x: 0, y: 0, w: 100, h: 100 };
    const pad = 40;
    return {
      x: minX - pad, y: minY - pad,
      w: Math.max(100, (maxX - minX) + pad * 2),
      h: Math.max(100, (maxY - minY) + pad * 2)
    };
  }

  function applyViewBox() {
    const svg = document.getElementById('graphSvg');
    if (!svg) return;
    const vb = PF.state.viewBox;
    svg.setAttribute('viewBox',
      vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  function syncZoomInput() {
    const el = document.getElementById('zoomInput');
    if (el) el.value = Math.round(PF.state.zoomPercent);
  }

  function fitGraph() {
    const svg = document.getElementById('graphSvg');
    if (!svg) return;
    const bbox = computeBBox();
    PF.state.viewBox.x = bbox.x;
    PF.state.viewBox.y = bbox.y;
    PF.state.viewBox.w = bbox.w;
    PF.state.viewBox.h = bbox.h;
    PF.state.zoomPercent = 100;
    syncZoomInput();
    applyViewBox();
  }

  function zoomAt(factor, anchor) {
    const svg = document.getElementById('graphSvg');
    if (!svg) return;
    const vb = PF.state.viewBox;
    const newW = vb.w / factor;
    const newH = vb.h / factor;
    const kx = (anchor.x - vb.x) / vb.w;
    const ky = (anchor.y - vb.y) / vb.h;
    vb.x = anchor.x - kx * newW;
    vb.y = anchor.y - ky * newH;
    vb.w = newW;
    vb.h = newH;
    PF.state.zoomPercent *= factor;
    syncZoomInput();
    applyViewBox();
  }

  function setZoomPercent(p) {
    if (!isFinite(p) || p <= 0) return;
    const factor = p / PF.state.zoomPercent;
    const vb = PF.state.viewBox;
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;
    zoomAt(factor, { x: cx, y: cy });
  }

  PF.layout = {
    computeBBox,
    applyViewBox,
    syncZoomInput,
    fitGraph,
    zoomAt,
    setZoomPercent
  };
})();