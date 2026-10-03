(function () {
  'use strict';

  window.PF = window.PF || {};

  const { showAlert, showConfirm } = PF.utils;
  const ICONS = PF.icons;

  /* ============================================================
   * ИКОНКИ И ПОЗИЦИЯ ТУЛБАРА
   * ============================================================ */
  function injectIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(el => {
      const key = el.getAttribute('data-icon');
      if (!ICONS[key]) return;
      el.innerHTML = ICONS[key];
    });
  }

  function updateViewToggleIcon() {
    const btn = document.getElementById('viewToggle');
    if (!btn) return;
    const key = PF.state.viewMode === 'graph' ? 'table' : 'graph';
    btn.setAttribute('data-icon', key);
    btn.title = PF.state.viewMode === 'graph' ? 'Показать таблицу' : 'Показать граф';
    btn.innerHTML = ICONS[key];
  }

  function adjustBodyPaddingForToolbar() {
    const toolbar = document.getElementById('mainToolbar');
    if (!toolbar) return;
    const pos = document.body.getAttribute('data-toolbar-position') || 'top';
    const h = toolbar.offsetHeight;
    const w = toolbar.offsetWidth;
    const GAP = 10;

    document.body.style.paddingTop    = '';
    document.body.style.paddingBottom = '';
    document.body.style.paddingLeft   = '';
    document.body.style.paddingRight  = '';

    if (pos === 'top')    document.body.style.paddingTop    = (h + GAP) + 'px';
    if (pos === 'bottom') document.body.style.paddingBottom = (h + GAP) + 'px';
    if (pos === 'left')   document.body.style.paddingLeft   = (w + GAP) + 'px';
    if (pos === 'right')  document.body.style.paddingRight  = (w + GAP) + 'px';
  }

  function applyToolbarPosition() {
    document.body.setAttribute('data-toolbar-position', PF.state.toolbarPosition);
    updateViewToggleIcon();
    adjustBodyPaddingForToolbar();
  }

  function closeToolbarMenu() {
    const m = document.getElementById('toolbarSettingsMenu');
    if (m) m.remove();
  }

  function openToolbarMenu() {
    closeToolbarMenu();
    const btn = document.getElementById('toolbarSettingsBtn');
    if (!btn) return;

    const menu = document.createElement('div');
    menu.className = 'toolbar-settings-menu';
    menu.id = 'toolbarSettingsMenu';

    const positions = [
      { value: 'top',    label: 'Сверху', icon: 'layout-top' },
      { value: 'right',  label: 'Справа', icon: 'layout-right' },
      { value: 'bottom', label: 'Снизу',  icon: 'layout-bottom' },
      { value: 'left',   label: 'Слева',  icon: 'layout-left' }
    ];

    let html = '<div class="menu-header">Расположение тулбара</div>';
    for (const p of positions) {
      const checked = PF.state.toolbarPosition === p.value ? '✓' : '';
      html += '<div class="menu-item" data-pos="' + p.value + '">' +
              '<span class="check">' + checked + '</span>' +
              ICONS[p.icon] +
              '<span>' + p.label + '</span>' +
              '</div>';
    }
    menu.innerHTML = html;

    document.body.appendChild(menu);

    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth  || 200;
    const mh = menu.offsetHeight || 160;
    const GAP = 6;

    if (PF.state.toolbarPosition === 'top') {
      menu.style.top  = (r.bottom + GAP) + 'px';
      menu.style.left = Math.max(4, Math.min(r.right - mw, window.innerWidth - mw - 4)) + 'px';
    } else if (PF.state.toolbarPosition === 'bottom') {
      menu.style.top  = (r.top - mh - GAP) + 'px';
      menu.style.left = Math.max(4, Math.min(r.right - mw, window.innerWidth - mw - 4)) + 'px';
    } else if (PF.state.toolbarPosition === 'left') {
      menu.style.left = (r.right + GAP) + 'px';
      menu.style.top  = Math.max(4, Math.min(r.top, window.innerHeight - mh - 4)) + 'px';
    } else if (PF.state.toolbarPosition === 'right') {
      menu.style.left = (r.left - mw - GAP) + 'px';
      menu.style.top  = Math.max(4, Math.min(r.top, window.innerHeight - mh - 4)) + 'px';
    }

    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        PF.state.toolbarPosition = item.getAttribute('data-pos');
        PF.persistState();
        applyToolbarPosition();
        closeToolbarMenu();
      });
    });
  }

  function updateLayoutDirBtn() {
    const layoutDirBtn = document.getElementById('layoutDirBtn');
    if (!layoutDirBtn) return;
    const key = PF.state.layoutRankDir === 'TB' ? 'arrows-v' : 'arrows-h';
    layoutDirBtn.setAttribute('data-icon', key);
    layoutDirBtn.title = PF.state.layoutRankDir === 'TB'
      ? 'Сверху вниз (клик — слева направо)'
      : 'Слева направо (клик — сверху вниз)';
    layoutDirBtn.innerHTML = ICONS[key];
  }

  function updateLabelsToggleBtn() {
    const labelsToggleBtn = document.getElementById('labelsToggleBtn');
    if (!labelsToggleBtn) return;
    labelsToggleBtn.style.opacity = PF.state.showTransitionLabels ? '1' : '0.55';
    labelsToggleBtn.title = PF.state.showTransitionLabels
      ? 'Скрыть подписи переходов'
      : 'Показать подписи переходов';
  }

  /* ============================================================
   * АВТО-РАСКЛАДКА (Dagre)
   * ============================================================ */
  async function autoLayout() {
    const graphData = PF.state.graphData;
    const n = graphData.states.length;
    if (!n) return;

    const hasExisting = PF.state.DATA.hasUi ||
                        (graphData.states || []).some(s => s._fromUi);
    if (hasExisting) {
      const ok = await showConfirm(
        'В документе уже есть сохранённые позиции.\n\n' +
        'Авто-раскладка перезапишет позиции состояний и сбросит\n' +
        'ручные маршруты переходов. Продолжить?',
        'Авто-раскладка'
      );
      if (!ok) return;
    }

    if (typeof dagre === 'undefined' || !dagre || !dagre.graphlib) {
      showAlert('Модуль раскладки (dagre) не загружен. Проверьте файл media/vendor/dagre.min.js.', 'Ошибка');
      return;
    }

    const W = PF.routing.BASE_STATE_W, H = PF.routing.BASE_STATE_H;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: PF.state.layoutRankDir,
      nodesep: 60,
      ranksep: 100,
      edgesep: 30,
      marginx: 40,
      marginy: 40
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const s of graphData.states) {
      s.w = W;
      s.h = H;
      g.setNode(s.name, { width: W, height: H });
    }
    for (const t of graphData.transitions) {
      if (t.from && t.to) g.setEdge(t.from, t.to);
    }

    dagre.layout(g);

    for (const s of graphData.states) {
      const pos = g.node(s.name);
      if (!pos) continue;
      s.x = pos.x - W / 2;
      s.y = pos.y - H / 2;
      s._fromUi = false;
    }

    for (const t of graphData.transitions) {
      t.manual = false;
      t.manualWaypoints = null;
    }

    PF.routing.rerouteAll();
    PF.render.renderGraph();
    PF.layout.fitGraph();
  }

  /* ============================================================
   * ПЕРЕКЛЮЧЕНИЕ ТАБЛИЦА / ГРАФ
   * ============================================================ */
  function applyViewMode() {
    const tv = document.getElementById('tableView');
    const gv = document.getElementById('graphView');
    if (PF.state.viewMode === 'graph') {
      tv.classList.add('hidden');
      gv.classList.add('active');
      document.getElementById('graphHint').textContent =
        PF.state.DATA.hasUi
          ? 'Позиции из documentFlow.ui.json'
          : 'documentFlow.ui.json не найден — авто-раскладка';
      try {
        requestAnimationFrame(() => {
          PF.routing.rerouteAll();
          PF.render.renderGraph();
          PF.layout.fitGraph();
        });
      } catch (e) {
        console.error('renderGraph error', e);
      }
    } else {
      tv.classList.remove('hidden');
      gv.classList.remove('active');
    }
    updateViewToggleIcon();
  }

  /* ============================================================
   * ИНИЦИАЛИЗАЦИЯ (привязка всех кнопок тулбара)
   * ============================================================ */
  function init() {
    injectIcons(document);
    applyToolbarPosition();

    // Главный тулбар
    document.getElementById('addBtn').addEventListener('click', PF.app.openAddForm);
    document.getElementById('reloadBtn').addEventListener('click', () =>
      PF.vscode.postMessage({ type: 'reload' })
    );
    document.getElementById('collapseAllBtn').addEventListener('click',
      () => PF.app.applyAllCollapsed(true));
    document.getElementById('expandAllBtn').addEventListener('click',
      () => PF.app.applyAllCollapsed(false));

    const genBtn = document.getElementById('generateFlowBtn');
    if (genBtn) genBtn.addEventListener('click', PF.formsOther.openGenerateFlowForm);

    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.addEventListener('click', PF.formsOther.openAuthForm);

    const validateBtn = document.getElementById('validateBtn');
    if (validateBtn) validateBtn.addEventListener('click', PF.formsOther.openValidationForm);

    const relationsBtn = document.getElementById('relationsBtn');
    if (relationsBtn) relationsBtn.addEventListener('click', PF.formsOther.openRelationsForm);

    // Переключение таблица/граф
    document.getElementById('viewToggle').addEventListener('click', () => {
      PF.state.viewMode = PF.state.viewMode === 'graph' ? 'table' : 'graph';
      PF.persistState();
      applyViewMode();
    });

    // Настройки тулбара
    const toolbarSettingsBtn = document.getElementById('toolbarSettingsBtn');
    if (toolbarSettingsBtn) {
      toolbarSettingsBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const existing = document.getElementById('toolbarSettingsMenu');
        if (existing) closeToolbarMenu();
        else openToolbarMenu();
      });
    }
    document.addEventListener('mousedown', (ev) => {
      const menu = document.getElementById('toolbarSettingsMenu');
      if (!menu) return;
      if (menu.contains(ev.target)) return;
      const gear = document.getElementById('toolbarSettingsBtn');
      if (gear && (gear === ev.target || gear.contains(ev.target))) return;
      closeToolbarMenu();
    });

    // Графовый тулбар — редактировать/удалить
    const editBtn = document.getElementById('editSelectedBtn');
    if (editBtn) editBtn.addEventListener('click', PF.render.editSelected);
    const delBtn = document.getElementById('deleteSelectedBtn');
    if (delBtn) delBtn.addEventListener('click', PF.render.deleteSelected);

    // Сохранение позиций
    document.getElementById('saveGraphBtn').addEventListener('click', () => {
      PF.vscode.postMessage({
        type: 'saveGraph',
        payload: {
          states: PF.state.graphData.states,
          transitions: PF.state.graphData.transitions
        }
      });
    });

    // Вписать в экран
    document.getElementById('fitGraphBtn').addEventListener('click', PF.layout.fitGraph);

    // Авто-раскладка
    const autoLayoutBtn = document.getElementById('autoLayoutBtn');
    if (autoLayoutBtn) autoLayoutBtn.addEventListener('click', () => { autoLayout(); });

    // Направление раскладки
    const layoutDirBtn = document.getElementById('layoutDirBtn');
    if (layoutDirBtn) {
      layoutDirBtn.addEventListener('click', () => {
        PF.state.layoutRankDir = (PF.state.layoutRankDir === 'TB') ? 'LR' : 'TB';
        PF.persistState();
        updateLayoutDirBtn();
      });
    }
    updateLayoutDirBtn();

    // Подписи переходов
    const labelsToggleBtn = document.getElementById('labelsToggleBtn');
    if (labelsToggleBtn) {
      labelsToggleBtn.addEventListener('click', () => {
        PF.state.showTransitionLabels = !PF.state.showTransitionLabels;
        PF.persistState();
        updateLabelsToggleBtn();
        PF.render.renderGraph();
        PF.layout.applyViewBox();
      });
    }
    updateLabelsToggleBtn();

    // Зум
    const zoomInput = document.getElementById('zoomInput');
    if (zoomInput) {
      zoomInput.addEventListener('change', () => {
        const v = parseFloat(zoomInput.value);
        if (isFinite(v) && v > 0) PF.layout.setZoomPercent(v);
        else PF.layout.syncZoomInput();
      });
      zoomInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); zoomInput.blur(); }
      });
    }

    // Resize
    window.addEventListener('resize', adjustBodyPaddingForToolbar);

    // Delete — удалить выделенное
    document.addEventListener('keydown', (ev) => {
      if (PF.state.viewMode !== 'graph') return;
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!PF.state.selectedStates.size && !PF.state.selectedTransitions.size) return;
      ev.preventDefault();
      PF.render.deleteSelected();
    });
  }

  PF.toolbar = {
    injectIcons,
    updateViewToggleIcon,
    adjustBodyPaddingForToolbar,
    applyToolbarPosition,
    closeToolbarMenu,
    openToolbarMenu,
    updateLayoutDirBtn,
    updateLabelsToggleBtn,
    autoLayout,
    applyViewMode,
    init
  };

  // Регистрируем в PF.app — нужно валидатору (forms-other.js)
  PF.app.applyViewMode = applyViewMode;
})();