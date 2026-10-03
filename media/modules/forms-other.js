(function () {
  'use strict';

  window.PF = window.PF || {};

  const { cloneTemplate, showAlert, showConfirm } = PF.utils;

  /* ============================================================
   * ВАЛИДАТОР
   * ============================================================ */
  function validateFlow() {
    const graphData = PF.state.graphData || { states: [], transitions: [] };
    const DATA = PF.state.DATA || {};
    const meta = PF.state.meta || { translations: { stateTrans: {}, transTrans: {} } };

    const graphStates      = graphData.states || [];
    const graphTransitions = graphData.transitions || [];
    const initialState     = graphData.initialState;
    const stateTrans = (meta.translations && meta.translations.stateTrans) || {};
    const transTrans = (meta.translations && meta.translations.transTrans) || {};

    const rowByName = {};
    for (const r of (DATA.rows || [])) rowByName[r.stateName] = r;

    const issues = {
      unreachable: [],
      terminalWithOutgoing: [],
      missingStateTranslations: [],
      missingTransitionTranslations: [],
      noActors: [],
      relations: []
    };

    if (!initialState) {
      issues.unreachable.push({ name: null, note: 'initialState не задан в documentFlow.json' });
    } else {
      const reached = new Set();
      const stack = [initialState];
      while (stack.length) {
        const cur = stack.pop();
        if (reached.has(cur)) continue;
        reached.add(cur);
        for (const t of graphTransitions) {
          if (t.from === cur && !reached.has(t.to)) stack.push(t.to);
        }
      }
      for (const s of graphStates) {
        if (!reached.has(s.name)) issues.unreachable.push({ name: s.name });
      }
    }

    for (const s of graphStates) {
      const row = rowByName[s.name];
      const isTerminal = row && row.flags && row.flags.isTerminal;
      if (!isTerminal) continue;
      const outgoing = graphTransitions.filter(t => t.from === s.name);
      if (outgoing.length) {
        issues.terminalWithOutgoing.push({
          name: s.name,
          transitions: outgoing.map(t => t.name)
        });
      }
    }

    for (const s of graphStates) {
      const ru = stateTrans[s.name];
      if (!ru || !String(ru).trim()) issues.missingStateTranslations.push({ name: s.name });
    }
    for (const t of graphTransitions) {
      const ru = transTrans[t.name];
      if (!ru || !String(ru).trim()) issues.missingTransitionTranslations.push({ name: t.name });
    }

    for (const r of (DATA.rows || [])) {
      if (!r.perms || !r.perms.length) issues.noActors.push({ name: r.stateName });
    }

    const rel = DATA.relations || {};
    for (const r of (rel.relations || [])) {
      if (!r.isMine) continue;
      for (const msg of (r.issues || [])) {
        issues.relations.push({ name: r.name, note: msg });
      }
    }

    return issues;
  }

  function centerOnState(name) {
    const s = PF.state.graphData.states.find(x => x.name === name);
    if (!s) return;
    const vb = PF.state.viewBox;
    vb.x = s.x + s.w / 2 - vb.w / 2;
    vb.y = s.y + s.h / 2 - vb.h / 2;
    PF.layout.applyViewBox();
  }

  function openValidationForm() {
    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-validate-modal');
    container.appendChild(backdrop);

    const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    function render() {
      const issues = validateFlow();
      const body = backdrop.querySelector('.validate-body');
      const summary = backdrop.querySelector('.validate-summary');
      body.innerHTML = '';

      const total =
        issues.unreachable.length +
        issues.terminalWithOutgoing.length +
        issues.missingStateTranslations.length +
        issues.missingTransitionTranslations.length +
        issues.noActors.length +
        issues.relations.length;

      summary.textContent = total === 0
        ? '✅ Проблем не найдено'
        : '⚠️ Найдено проблем: ' + total;
      summary.classList.toggle('ok', total === 0);

      function section(title, items, renderFn, emptyText) {
        const sec = document.createElement('section');
        sec.className = 'validate-section';
        const h = document.createElement('h3');
        h.textContent = title + ' (' + items.length + ')';
        sec.appendChild(h);
        if (!items.length) {
          const p = document.createElement('div');
          p.className = 'validate-empty';
          p.textContent = emptyText || 'Нет';
          sec.appendChild(p);
        } else {
          const ul = document.createElement('ul');
          ul.className = 'validate-list';
          for (const it of items) {
            const li = document.createElement('li');
            li.innerHTML = renderFn(it);
            ul.appendChild(li);
          }
          sec.appendChild(ul);
        }
        body.appendChild(sec);
      }

      section('1. Недостижимые состояния', issues.unreachable, it => {
        if (it.note) return '<span style="opacity:.8">' + escHtml(it.note) + '</span>';
        return '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + escHtml(it.name) + '</a>';
      }, 'Все состояния достижимы из initialState');

      section('2. Терминальные с исходящими переходами', issues.terminalWithOutgoing,
        it =>
          '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + escHtml(it.name) + '</a>' +
          ' — переходы: ' + it.transitions.map(x => '<code>' + escHtml(x) + '</code>').join(', '),
        'Нет');

      section('3.1. Нет перевода RU (состояния)', issues.missingStateTranslations,
        it => '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + escHtml(it.name) + '</a>',
        'Все состояния переведены');

      section('3.2. Нет перевода RU (переходы)', issues.missingTransitionTranslations,
        it => '<a class="validate-link" data-transition="' + escHtml(it.name) + '">' + escHtml(it.name) + '</a>',
        'Все переходы переведены');

      section('4. Нет акторов в состоянии', issues.noActors,
        it => '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + escHtml(it.name) + '</a>',
        'Во всех состояниях есть хотя бы один актор');

      section('5. Проблемы в documentRelation', issues.relations,
        it => '<code>' + escHtml(it.name) + '</code> — ' + escHtml(it.note),
        'Проблем нет');

      body.querySelectorAll('.validate-link').forEach(a => {
        a.addEventListener('click', () => {
          const stName = a.getAttribute('data-state');
          const trName = a.getAttribute('data-transition');
          if (stName) {
            if (PF.state.viewMode !== 'graph') {
              PF.state.viewMode = 'graph';
              PF.persistState();
              if (PF.app.applyViewMode) PF.app.applyViewMode();
            }
            setTimeout(() => {
              PF.state.selectedStates.clear();
              PF.state.selectedTransitions.clear();
              PF.state.selectedStates.add(stName);
              PF.render.updateSelectionClasses();
              PF.render.updateSelectionToolbar();
              centerOnState(stName);
            }, 60);
          } else if (trName) {
            PF.app.openTransitionForm(trName);
          }
        });
      });
    }

    backdrop.querySelector('[data-act="refresh"]').addEventListener('click', render);
    backdrop.querySelector('[data-act="close"]').addEventListener('click', () => backdrop.remove());

    render();
  }

  /* ============================================================
   * СВЯЗИ (documentRelation)
   * ============================================================ */
  function openRelationsForm() {
    const rel = (PF.state.DATA && PF.state.DATA.relations) || {};
    const list = rel.relations || [];

    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-relations-modal');
    container.appendChild(backdrop);

    backdrop.querySelector('.relations-doc-hint').textContent =
      'Текущий документ: ' + (rel.docName || '—');
    const pathEl = backdrop.querySelector('.relations-path-hint');
    pathEl.textContent = rel.path || '(папка documentRelation не найдена)';
    pathEl.title = rel.path || '';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    const body = backdrop.querySelector('.relations-body');

    if (!list.length) {
      body.innerHTML = '<div class="hint">Связи не найдены.</div>';
      backdrop.querySelector('[data-act="close"]').addEventListener('click', () => backdrop.remove());
      return;
    }

    const metaActors = (PF.state.meta && PF.state.meta.actors) || [];

    for (const r of list) {
      const card = document.createElement('div');
      card.className = 'relation-card';
      if (r.isMine) card.classList.add('mine');
      if (r.issues && r.issues.length) card.classList.add('has-issues');

      const badges = [];
      if (r.isMine) badges.push('<span class="badge mine">этот документ</span>');
      if (r.issues && r.issues.length) {
        badges.push('<span class="badge issues">проблем: ' + r.issues.length + '</span>');
      }

      let html = '';
      html += '<h3>' + esc(r.name) + ' ' + badges.join(' ') + '</h3>';
      html += '<div class="relation-meta">' + esc(r.path) + '</div>';

      html += '<div class="relation-row"><span class="lbl">sourceDocument</span><span class="val"><code>' +
              esc(r.sourceDocument) + '</code> (v' + esc(r.sourceDocumentVersion) + ')</span></div>';
      html += '<div class="relation-row"><span class="lbl">targetDocument</span><span class="val"><code>' +
              esc(r.targetDocument) + '</code> (v' + esc(r.targetDocumentVersion) + ') → ' +
              '<code>' + esc(r.targetState) + '</code></span></div>';
      if (r.actionToRunBefore) {
        html += '<div class="relation-row"><span class="lbl">actionToRunBefore</span><span class="val"><code>' +
                esc(r.actionToRunBefore) + '</code></span></div>';
      }
      if (r.keywords && r.keywords.length) {
        html += '<div class="relation-row"><span class="lbl">keywords</span><span class="val">' +
                r.keywords.map(k => '<code>' + esc(k) + '</code>').join(', ') + '</span></div>';
      }

      html += '<div class="relation-row"><span class="lbl">sourceDocumentStates</span><span class="val"></span></div>';
      html += '<table class="relation-states-table"><thead><tr>' +
              '<th style="width:180px">Состояние</th><th>Акторы</th></tr></thead><tbody>';
      for (const st of (r.sourceDocumentStates || [])) {
        const stateOk = !r.isMine || (PF.state.graphData && PF.state.graphData.states || [])
          .some(s => s.name === st.name);
        const stateCell = stateOk
          ? '<code>' + esc(st.name) + '</code>'
          : '<code style="color:#c33">' + esc(st.name) + ' ⚠</code>';
        const actorsCell = (st.actors || []).map(a => {
          const actorOk = !r.isMine || metaActors.includes(a);
          return actorOk
            ? '<code>' + esc(a) + '</code>'
            : '<code style="color:#c33">' + esc(a) + ' ⚠</code>';
        }).join(', ');
        html += '<tr><td>' + stateCell + '</td><td>' + actorsCell + '</td></tr>';
      }
      html += '</tbody></table>';

      if (r.issues && r.issues.length) {
        html += '<div class="relation-issues"><b>Проблемы:</b><ul>' +
                r.issues.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
      }

      card.innerHTML = html;
      body.appendChild(card);
    }

    backdrop.querySelector('[data-act="close"]').addEventListener('click', () => backdrop.remove());
  }

  /* ============================================================
   * АВТОРИЗАЦИЯ
   * ============================================================ */
  function openAuthForm() {
    const auth = (PF.state.DATA && PF.state.DATA.auth) || {};
    if (!auth.found) {
      showAlert(
        'Файл authorization.csv не найден.\n\n' +
        'Ожидаемый путь: <папка-пакета>/authorization/authorization.csv',
        'Авторизация — файл не найден'
      );
      return;
    }

    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-auth-modal');
    container.appendChild(backdrop);

    backdrop.querySelector('.auth-doc-hint').textContent = 'Документ: ' + auth.docName;
    const pathEl = backdrop.querySelector('.auth-path-hint');
    pathEl.textContent = auth.path || '';
    pathEl.title = auth.path || '';

    const localRows = (auth.rows || []).map(r => ({
      role: r.role, actor: r.actor, op: r.op || 'Add'
    }));

    const tbody = backdrop.querySelector('.f-auth-rows');
    const allRoles  = auth.allRoles || [];
    const allActors = (PF.state.meta && PF.state.meta.actors) || [];

    function buildRoleCell(r) {
      const td = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'f-auth-role-sel';

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '— выберите —';
      sel.appendChild(ph);

      for (const role of allRoles) {
        const opt = document.createElement('option');
        opt.value = role;
        opt.textContent = role;
        sel.appendChild(opt);
      }
      const newOpt = document.createElement('option');
      newOpt.value = '__NEW__';
      newOpt.textContent = '➕ Другая роль…';
      sel.appendChild(newOpt);

      const custom = document.createElement('input');
      custom.type = 'text';
      custom.className = 'f-auth-role-custom';
      custom.placeholder = 'Имя новой роли';
      custom.style.display = 'none';
      custom.style.marginTop = '4px';

      const isCustom = r.role && !allRoles.includes(r.role);
      if (isCustom) {
        sel.value = '__NEW__';
        custom.value = r.role;
        custom.style.display = '';
      } else if (r.role) {
        sel.value = r.role;
      } else {
        sel.value = '';
      }

      sel.addEventListener('change', () => {
        if (sel.value === '__NEW__') {
          custom.style.display = '';
          custom.focus();
          r.role = custom.value.trim();
        } else {
          custom.style.display = 'none';
          custom.value = '';
          r.role = sel.value;
        }
        sel.classList.remove('input-error');
        custom.classList.remove('input-error');
      });

      custom.addEventListener('input', () => {
        r.role = custom.value.trim();
        custom.classList.remove('input-error');
      });

      td.appendChild(sel);
      td.appendChild(custom);
      return td;
    }

    function buildActorCell(r) {
      const td = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'f-auth-actor-sel';

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '— выберите —';
      sel.appendChild(ph);

      for (const a of allActors) {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        sel.appendChild(opt);
      }
      sel.value = r.actor || '';

      sel.addEventListener('change', () => {
        r.actor = sel.value;
        sel.classList.remove('input-error');
      });

      td.appendChild(sel);
      return td;
    }

    function buildOpCell(r) {
      const td = document.createElement('td');
      const sel = document.createElement('select');
      for (const v of ['Add', 'Remove']) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        if (v === (r.op || 'Add')) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => { r.op = sel.value; });
      td.appendChild(sel);
      return td;
    }

    function renderRows() {
      tbody.innerHTML = '';
      if (!localRows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'gen-empty';
        td.textContent = 'Нет строк для этого документа';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      localRows.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.appendChild(buildRoleCell(r));
        tr.appendChild(buildActorCell(r));
        tr.appendChild(buildOpCell(r));

        const tdDel = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'danger small';
        delBtn.textContent = '×';
        delBtn.title = 'Убрать строку';
        delBtn.addEventListener('click', () => {
          localRows.splice(i, 1);
          renderRows();
        });
        tdDel.appendChild(delBtn);
        tr.appendChild(tdDel);

        tbody.appendChild(tr);
      });
    }

    renderRows();

    backdrop.querySelector('[data-act="add-row"]').addEventListener('click', () => {
      localRows.push({ role: '', actor: '', op: 'Add' });
      renderRows();
      const rows = tbody.querySelectorAll('tr');
      if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'nearest' });
    });

    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => backdrop.remove());

    backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
      backdrop.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

      const trs = tbody.querySelectorAll('tr');
      const invalidInputs = [];

      localRows.forEach((r, i) => {
        const tr = trs[i];
        if (!tr) return;

        const roleSel    = tr.querySelector('.f-auth-role-sel');
        const roleCustom = tr.querySelector('.f-auth-role-custom');
        const actorSel   = tr.querySelector('.f-auth-actor-sel');

        const roleEmpty  = !r.role || !String(r.role).trim();
        const actorEmpty = !r.actor || !String(r.actor).trim();

        if (roleEmpty) {
          const target = (roleSel && roleSel.value === '__NEW__') ? roleCustom : roleSel;
          if (target) {
            target.classList.add('input-error');
            invalidInputs.push(target);
          }
        }
        if (actorEmpty) {
          if (actorSel) {
            actorSel.classList.add('input-error');
            invalidInputs.push(actorSel);
          }
        }
      });

      if (invalidInputs.length) {
        showAlert('Заполните подсвеченные поля: ApplicationRole и Actor обязательны.');
        if (invalidInputs[0] && invalidInputs[0].focus) invalidInputs[0].focus();
        return;
      }

      const seen = new Set();
      for (const r of localRows) {
        const key = String(r.role).trim() + '|' + r.actor + '|' + r.op;
        if (seen.has(key)) {
          showAlert('Дубликат: ' + r.role + ' / ' + r.actor + ' / ' + r.op);
          return;
        }
        seen.add(key);
      }

      const ok = await showConfirm(
        'Сохранить авторизацию?\n\n' +
        'Документ: ' + auth.docName + '\n' +
        'Строк для этого документа: ' + localRows.length + '\n\n' +
        'Файл: ' + (auth.path || ''),
        'Сохранение авторизации'
      );
      if (!ok) return;

      PF.vscode.postMessage({
        type: 'saveAuth',
        payload: {
          rows: localRows.map(r => ({
            role: String(r.role).trim(),
            actor: r.actor,
            op: r.op
          }))
        }
      });
      backdrop.remove();
    });
  }

  /* ============================================================
   * КОПИРОВАНИЕ АКТОРА
   * ============================================================ */
  function openCopyActorForm(stateName, actorName) {
    const stateDet = PF.state.stateDetails[stateName];
    if (!stateDet) { showAlert('Нет данных для состояния ' + stateName); return; }
    const sourceActor = (stateDet.permissions || []).find(x => x.actor === actorName);
    if (!sourceActor) { showAlert('Актор не найден: ' + actorName); return; }

    const meta = PF.state.meta;
    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-copy-actor-modal');
    container.appendChild(backdrop);

    backdrop.querySelector('.f-copy-source').textContent = actorName + ' @ ' + stateName;

    const nameInput = backdrop.querySelector('.f-copy-name');
    nameInput.value = actorName;

    const statesCont = backdrop.querySelector('.f-copy-states');
    const allStates = meta.states || [];
    const selected = new Set([stateName]);

    for (const st of allStates) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = st;
      if (st === stateName) cb.checked = true;
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(st);
        else selected.delete(st);
      });
      label.appendChild(cb);

      const txt = document.createElement('span');
      const ru = (meta.translations.stateTrans && meta.translations.stateTrans[st]) || st;
      txt.textContent = st + ' (' + ru + ')';
      label.appendChild(txt);

      statesCont.appendChild(label);
    }

    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => backdrop.remove());

    backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      nameInput.classList.remove('input-error');

      if (!newName) {
        nameInput.classList.add('input-error');
        showAlert('Введите имя актора');
        nameInput.focus();
        return;
      }
      if (!selected.size) {
        showAlert('Выберите хотя бы одно состояние');
        return;
      }

      const targetStates = [...selected];
      const willApply = [];
      const skipped = [];

      for (const st of targetStates) {
        const det = PF.state.stateDetails[st];
        const exists = det && (det.permissions || []).some(x => x.actor === newName);
        if (exists) skipped.push(st);
        else willApply.push(st);
      }

      const lines = [];
      lines.push('Источник: ' + actorName + ' @ ' + stateName);
      lines.push('Новое имя: ' + newName);
      lines.push('Выбрано состояний: ' + targetStates.length);
      if (willApply.length) lines.push('  • добавлено в: ' + willApply.join(', '));
      if (skipped.length)   lines.push('  • пропущено (актор уже есть): ' + skipped.join(', '));

      if (!willApply.length) {
        showAlert(lines.join('\n') + '\n\nНечего копировать.');
        return;
      }
      lines.push('');
      lines.push('Будет изменён configuration.json.');

      const ok = await showConfirm(lines.join('\n'), 'Копирование актора');
      if (!ok) return;

      PF.vscode.postMessage({
        type: 'copyActor',
        payload: {
          fromState: stateName,
          fromActor: actorName,
          toActor: newName,
          toStates: targetStates
        }
      });
      backdrop.remove();
    });
  }

  /* ============================================================
   * КАРКАС ДОКФЛОУ
   * ============================================================ */
  function openGenerateFlowForm() {
    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-generate-flow-modal');
    container.appendChild(backdrop);

    const meta = PF.state.meta;

    const existingStates = (PF.state.graphData.states || []).map(s => ({
      name: s.name,
      ru: (meta.translations.stateTrans && meta.translations.stateTrans[s.name]) || s.ru || s.name,
      existing: true
    }));

    const existingTransitions = (PF.state.graphData.transitions || []).map(t => ({
      name: t.name,
      from: t.from,
      to: t.to,
      ru: (meta.translations.transTrans && meta.translations.transTrans[t.name]) || t.ru || t.name,
      existing: true
    }));

    const genFlowState = {
      states: existingStates.slice(),
      transitions: existingTransitions.slice()
    };

    const tbodyS = backdrop.querySelector('.f-gen-states');
    const tbodyT = backdrop.querySelector('.f-gen-transitions');

    function buildStateRow(s) {
      const tr = document.createElement('tr');
      const idx = genFlowState.states.indexOf(s);

      const tdN = document.createElement('td');
      tdN.textContent = String(idx + 1);
      tr.appendChild(tdN);

      const tdCode = document.createElement('td');
      const codeInput = document.createElement('input');
      codeInput.type = 'text';
      codeInput.value = s.name;
      if (s.existing) codeInput.readOnly = true;
      codeInput.addEventListener('input', () => { s.name = codeInput.value.trim(); });
      tdCode.appendChild(codeInput);
      tr.appendChild(tdCode);

      const tdRu = document.createElement('td');
      const ruInput = document.createElement('input');
      ruInput.type = 'text';
      ruInput.value = s.ru;
      ruInput.addEventListener('input', () => { s.ru = ruInput.value; });
      tdRu.appendChild(ruInput);
      tr.appendChild(tdRu);

      const tdDel = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'danger small';
      delBtn.textContent = '×';
      delBtn.title = s.existing ? 'Удалить (со всеми ссылками в файлах)' : 'Убрать';
      delBtn.addEventListener('click', () => {
        const i = genFlowState.states.indexOf(s);
        if (i >= 0) genFlowState.states.splice(i, 1);
        renderStatesTable();
      });
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      return tr;
    }

    function renderStatesTable() {
      tbodyS.innerHTML = '';
      const existing = genFlowState.states.filter(s => s.existing);
      const fresh    = genFlowState.states.filter(s => !s.existing);

      const addSep = (text) => {
        const tr = document.createElement('tr');
        tr.className = 'gen-sep';
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = text;
        tr.appendChild(td);
        tbodyS.appendChild(tr);
      };

      if (existing.length) { addSep('Существующие'); existing.forEach(s => tbodyS.appendChild(buildStateRow(s))); }
      if (fresh.length)    { addSep('Новые');      fresh.forEach(s => tbodyS.appendChild(buildStateRow(s))); }
      if (!existing.length && !fresh.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'gen-empty';
        td.textContent = 'Нет состояний';
        tr.appendChild(td);
        tbodyS.appendChild(tr);
      }
    }

    function buildTransitionRow(t) {
      const tr = document.createElement('tr');

      const tdCode = document.createElement('td');
      const codeInput = document.createElement('input');
      codeInput.type = 'text';
      codeInput.value = t.name;
      if (t.existing) codeInput.readOnly = true;
      codeInput.addEventListener('input', () => { t.name = codeInput.value.trim(); });
      tdCode.appendChild(codeInput);
      tr.appendChild(tdCode);

      const tdFrom = document.createElement('td');
      tdFrom.textContent = t.from;
      tr.appendChild(tdFrom);

      const tdTo = document.createElement('td');
      tdTo.textContent = t.to;
      tr.appendChild(tdTo);

      const tdRu = document.createElement('td');
      const ruInput = document.createElement('input');
      ruInput.type = 'text';
      ruInput.value = t.ru;
      ruInput.addEventListener('input', () => { t.ru = ruInput.value; });
      tdRu.appendChild(ruInput);
      tr.appendChild(tdRu);

      const tdDel = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'danger small';
      delBtn.textContent = '×';
      delBtn.title = t.existing ? 'Удалить (со всеми ссылками в файлах)' : 'Убрать';
      delBtn.addEventListener('click', () => {
        const i = genFlowState.transitions.indexOf(t);
        if (i >= 0) genFlowState.transitions.splice(i, 1);
        renderTransitionsTable();
      });
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      return tr;
    }

    function renderTransitionsTable() {
      tbodyT.innerHTML = '';
      const existing = genFlowState.transitions.filter(t => t.existing);
      const fresh    = genFlowState.transitions.filter(t => !t.existing);

      const addSep = (text) => {
        const tr = document.createElement('tr');
        tr.className = 'gen-sep';
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = text;
        tr.appendChild(td);
        tbodyT.appendChild(tr);
      };

      if (existing.length) { addSep('Существующие'); existing.forEach(t => tbodyT.appendChild(buildTransitionRow(t))); }
      if (fresh.length)    { addSep('Новые');      fresh.forEach(t => tbodyT.appendChild(buildTransitionRow(t))); }
      if (!existing.length && !fresh.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'gen-empty';
        td.textContent = 'Нет переходов';
        tr.appendChild(td);
        tbodyT.appendChild(tr);
      }
    }

    renderStatesTable();
    renderTransitionsTable();

    backdrop.querySelector('[data-act="add-states"]').addEventListener('click', () => {
      const ta = backdrop.querySelector('.f-gen-states-input');
      const lines = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split('|').map(x => x.trim());
        const name = parts[0];
        const ru = parts[1] || name;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) continue;
        if (genFlowState.states.some(s => s.name === name)) continue;
        genFlowState.states.push({ name, ru, existing: false });
      }
      ta.value = '';
      renderStatesTable();
    });

    backdrop.querySelector('[data-act="add-transitions"]').addEventListener('click', () => {
      const ta = backdrop.querySelector('.f-gen-transitions-input');
      const items = ta.value.split(/[\s,;]+/).filter(Boolean);
      const byNumber = (n) => {
        const i = parseInt(n, 10);
        if (!Number.isFinite(i) || i < 1 || i > genFlowState.states.length) return null;
        return genFlowState.states[i - 1].name;
      };
      for (const item of items) {
        const m = item.match(/^(.+?)-(.+)$/);
        if (!m) continue;
        let fromRaw = m[1].trim(), toRaw = m[2].trim();
        const from = /^\d+$/.test(fromRaw) ? byNumber(fromRaw) : fromRaw;
        const to   = /^\d+$/.test(toRaw)   ? byNumber(toRaw)   : toRaw;
        if (!from || !to) continue;
        if (!genFlowState.states.some(s => s.name === from)) continue;
        if (!genFlowState.states.some(s => s.name === to)) continue;
        const code = from + '_' + to;
        if (genFlowState.transitions.some(t => t.name === code)) continue;
        genFlowState.transitions.push({ name: code, from, to, ru: code, existing: false });
      }
      ta.value = '';
      renderTransitionsTable();
    });

    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      backdrop.remove();
    });

    backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
      const seenS = new Set();
      for (const s of genFlowState.states) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s.name)) {
          showAlert('Некорректный код состояния: ' + s.name); return;
        }
        if (seenS.has(s.name)) { showAlert('Дубликат состояния: ' + s.name); return; }
        seenS.add(s.name);
      }
      const seenT = new Set();
      for (const t of genFlowState.transitions) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(t.name)) {
          showAlert('Некорректный код перехода: ' + t.name); return;
        }
        if (seenT.has(t.name)) { showAlert('Дубликат перехода: ' + t.name); return; }
        seenT.add(t.name);
      }

      const hasExisting = genFlowState.states.some(s => s.existing) ||
                          genFlowState.transitions.some(t => t.existing);
      const title = hasExisting ? 'Обновить каркас' : 'Создать каркас';
      const ok = await showConfirm(
        (hasExisting ? 'Применить изменения к существующим файлам?\n\n'
                     : 'Создать файлы докфлоу?\n\n') +
        'Состояний: ' + genFlowState.states.length + '\n' +
        'Переходов: ' + genFlowState.transitions.length + '\n\n' +
        'Будут изменены: documentFlow.json, configuration.json, translation.csv, documentFlow.ui.json',
        title
      );
      if (!ok) return;

      PF.vscode.postMessage({
        type: 'generateFlow',
        payload: {
          states: genFlowState.states,
          transitions: genFlowState.transitions
        }
      });
      backdrop.remove();
    });
  }

  PF.formsOther = {
    validateFlow,
    centerOnState,
    openValidationForm,
    openRelationsForm,
    openAuthForm,
    openCopyActorForm,
    openGenerateFlowForm
  };

  // Регистрация в PF.app
  PF.app.openValidationForm   = openValidationForm;
  PF.app.openRelationsForm    = openRelationsForm;
  PF.app.openAuthForm         = openAuthForm;
  PF.app.openCopyActorForm    = openCopyActorForm;
  PF.app.openGenerateFlowForm = openGenerateFlowForm;
})();