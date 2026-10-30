(function () {
  'use strict';

  window.PF = window.PF || {};

  // Группы храним по ключам — перевод применяется в buildBody.
  // Это позволяет переводить легенду тем же PF.ui.t, что и остальной UI.
  const GROUPS = [
    {
      titleKey: 'legend.group.states',
      items: [
        ['legend.state.drag', 'legend.state.drag.hint'],
        ['legend.state.dblclick', 'legend.state.dblclick.hint'],
        ['legend.state.rclick', 'legend.state.rclick.hint'],
        ['legend.state.ctrlclick', 'legend.state.ctrlclick.hint'],
        ['legend.state.arrows', 'legend.state.arrows.hint']
      ]
    },
    {
      titleKey: 'legend.group.transitions',
      items: [
        ['legend.transition.dblclick', 'legend.transition.dblclick.hint'],
        ['legend.transition.altdblclick', 'legend.transition.altdblclick.hint']
      ]
    },
    {
      titleKey: 'legend.group.draw',
      items: [
        ['legend.draw.start', 'legend.draw.start.hint'],
        ['legend.draw.finish', 'legend.draw.finish.hint'],
        ['legend.draw.cancel', 'legend.draw.cancel.hint']
      ]
    },
    {
      titleKey: 'legend.group.handles',
      items: [
        ['legend.handles.edge', 'legend.handles.edge.hint'],
        ['legend.handles.mid', 'legend.handles.mid.hint'],
        ['legend.handles.midRemove', 'legend.handles.midRemove.hint'],
        ['legend.handles.segment', 'legend.handles.segment.hint']
      ]
    },
    {
      titleKey: 'legend.group.general',
      items: [
        ['legend.general.zoom', 'legend.general.zoom.hint'],
        ['legend.general.pan', 'legend.general.pan.hint'],
        ['legend.general.delete', 'legend.general.delete.hint'],
        ['legend.general.escape', 'legend.general.escape.hint']
      ]
    }
  ];

  function buildBody() {
    const frag = document.createDocumentFragment();
    for (const g of GROUPS) {
      const h = document.createElement('div');
      h.className = 'legend-group-title';
      h.textContent = PF.ui.t(g.titleKey);
      frag.appendChild(h);

      const body = document.createElement('div');
      body.className = 'legend-group-body';
      for (const [actionKey, hintKey] of g.items) {
        const row = document.createElement('div');
        row.className = 'legend-row';

        const a = document.createElement('span');
        a.className = 'legend-action';
        a.textContent = PF.ui.t(actionKey);

        const t = document.createElement('span');
        t.className = 'legend-hint';
        t.textContent = PF.ui.t(hintKey);

        row.appendChild(a);
        row.appendChild(t);
        body.appendChild(row);
      }
      frag.appendChild(body);
    }
    return frag;
  }

  function applyPosition(el) {
    const pos = PF.state.legendPos;
    if (pos && typeof pos.right === 'number' && typeof pos.bottom === 'number') {
      el.style.right = pos.right + 'px';
      el.style.bottom = pos.bottom + 'px';
    } else {
      el.style.right = '16px';
      el.style.bottom = '16px';
    }
    el.style.left = '';
    el.style.top = '';
  }

  function show() {
    const el = document.getElementById('graphLegend');
    if (!el) return;
    PF.state.legendVisible = true;
    PF.persistState();
    el.style.display = '';
    applyPosition(el);
  }

  function hide() {
    const el = document.getElementById('graphLegend');
    if (!el) return;
    PF.state.legendVisible = false;
    PF.persistState();
    el.style.display = 'none';
  }

  function attachDrag(el) {
    const handle = el.querySelector('[data-drag-handle]');
    if (!handle) return;

    handle.addEventListener('mousedown', (ev) => {
      if (ev.target.closest('.legend-close')) return;
      ev.preventDefault();

      const startRect = el.getBoundingClientRect();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const startRight = window.innerWidth - startRect.right;
      const startBottom = window.innerHeight - startRect.bottom;

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let nr = startRight - dx;
        let nb = startBottom - dy;

        const w = startRect.width, h = startRect.height;
        if (nr < 0) nr = 0;
        if (nb < 0) nb = 0;
        if (nr + w > window.innerWidth) nr = window.innerWidth - w;
        if (nb + h > window.innerHeight) nb = window.innerHeight - h;

        el.style.right = nr + 'px';
        el.style.bottom = nb + 'px';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const rect = el.getBoundingClientRect();
        PF.state.legendPos = {
          right: window.innerWidth - rect.right,
          bottom: window.innerHeight - rect.bottom
        };
        PF.persistState();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function init() {
    const el = document.getElementById('graphLegend');
    if (!el) return;

    const body = el.querySelector('.legend-body');
    body.appendChild(buildBody());

    el.querySelector('.legend-close').addEventListener('click', hide);
    attachDrag(el);

    if (PF.state.legendVisible) {
      el.style.display = '';
      applyPosition(el);
    } else {
      el.style.display = 'none';
    }
  }

  function reinit() {
    const el = document.getElementById('graphLegend');
    if (!el) return;
    const body = el.querySelector('.legend-body');
    if (!body) return;
    body.innerHTML = '';
    body.appendChild(buildBody());
  }

  PF.legend = {
    init,
    reinit,
    show,
    hide,
    isVisible: () => !!PF.state.legendVisible
  };
})();