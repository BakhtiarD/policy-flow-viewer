(function () {
  'use strict';

  window.PF = window.PF || {};

  const GROUPS = [
    {
      title: 'Состояния',
      items: [
        ['Drag', 'переместить состояние'],
        ['Double-click', 'редактировать'],
        ['Right-click', 'начать рисовать переход'],
        ['Ctrl+Click', 'добавить/убрать из выделения'],
        ['Ctrl+стрелки', 'сдвинуть выделенные (Shift — шаг 10)']
      ]
    },
    {
      title: 'Переходы',
      items: [
        ['Double-click', 'редактировать переход'],
        ['Alt+Double-click', 'добавить промежуточную точку в месте клика']
      ]
    },
    {
      title: 'Рисование перехода',
      items: [
        ['Right-click на исходном', 'начать рисование'],
        ['Клик на целевом', 'завершить рисование'],
        ['Escape', 'отменить']
      ]
    },
    {
      title: 'Ручки выделенного перехода',
      items: [
        ['Drag крайней точки', 'привязать к грани состояния'],
        ['Drag средней точки', 'переместить точку'],
        ['Right-click на средней', 'удалить промежуточную точку'],
        ['Drag полоски между точками', 'сдвинуть сегмент']
      ]
    },
    {
      title: 'Общее',
      items: [
        ['Ctrl+wheel', 'зум'],
        ['Drag фона', 'панорама'],
        ['Delete', 'удалить выделенное'],
        ['Escape', 'отменить рисование']
      ]
    }
  ];

  function buildBody() {
    const frag = document.createDocumentFragment();
    for (const g of GROUPS) {
      const h = document.createElement('div');
      h.className = 'legend-group-title';
      h.textContent = g.title;
      frag.appendChild(h);

      const body = document.createElement('div');
      body.className = 'legend-group-body';
      for (const [action, hint] of g.items) {
        const row = document.createElement('div');
        row.className = 'legend-row';

        const a = document.createElement('span');
        a.className = 'legend-action';
        a.textContent = action;

        const t = document.createElement('span');
        t.className = 'legend-hint';
        t.textContent = hint;

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

  PF.legend = {
    init,
    show,
    hide,
    isVisible: () => !!PF.state.legendVisible
  };
})();