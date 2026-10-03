(function () {
  'use strict';

  window.PF = window.PF || {};

  const { svgEl, cloneTemplate, showAlert, showConfirm } = PF.utils;

  /* ============================================================
   * ОБЩИЕ ХЕЛПЕРЫ ФОРМ
   * ============================================================ */
  function buildActorOptions(selectEl, actors, selected) {
    while (selectEl.options.length > 0) selectEl.remove(0);
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '— выберите —';
    selectEl.appendChild(ph);

    for (const a of actors) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      if (a === selected) opt.selected = true;
      selectEl.appendChild(opt);
    }
    const nw = document.createElement('option');
    nw.value = '__NEW__';
    nw.textContent = '➕ Новый актор…';
    selectEl.appendChild(nw);
  }

  function buildStateOptions(selectEl, states, selected) {
    while (selectEl.options.length > 0) selectEl.remove(0);
    const stateTrans = (PF.state.meta && PF.state.meta.translations &&
                        PF.state.meta.translations.stateTrans) || {};
    for (const s of states) {
      const opt = document.createElement('option');
      opt.value = s;
      const ru = stateTrans[s] || s;
      opt.textContent = s + ' (' + ru + ')';
      if (s === selected) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }

  function buildPermissionCard(p) {
    const card = cloneTemplate('tpl-permission-card');
    const ops = p.operations || [];
    const trs = p.transitions || [];
    const atts = p.attachments || {};
    const currentActor = p.actor || '';
    const meta = PF.state.meta;

    const actorsForSelect = meta.actors.slice();
    if (currentActor && !actorsForSelect.includes(currentActor)) {
      actorsForSelect.unshift(currentActor);
    }

    const sel = card.querySelector('.f-actor');
    buildActorOptions(sel, actorsForSelect, currentActor);

    const isCustom = currentActor && !meta.actors.includes(currentActor);
    const newInp = card.querySelector('.f-actor-new');
    if (isCustom) {
      sel.value = '__NEW__';
      newInp.value = currentActor;
      newInp.style.display = '';
    }

    sel.addEventListener('change', () => {
      if (sel.value === '__NEW__') {
        newInp.style.display = '';
        newInp.focus();
      } else {
        newInp.style.display = 'none';
        newInp.value = '';
      }
    });

    card.querySelector('.f-allow-comments').checked = !!p.allowComments;

    const opsCont = card.querySelector('.f-operations');
    const normOps = (ops || []).map(x => typeof x === 'string'
      ? { name: x, exclusiveToAssignedUser: false }
      : x);

    for (const opName of meta.operations) {
      const existing = normOps.find(x => x.name === opName);
      const lbl = cloneTemplate('tpl-op-check');

      const cb = lbl.querySelector('input[data-op]');
      cb.value = opName;
      cb.checked = !!existing;

      const exCb = lbl.querySelector('input[data-op-exclusive]');
      exCb.checked = !!(existing && existing.exclusiveToAssignedUser);
      exCb.disabled = !cb.checked;

      cb.addEventListener('change', () => {
        if (!cb.checked) exCb.checked = false;
        exCb.disabled = !cb.checked;
      });

      lbl.querySelector('.op-name').textContent = opName;
      opsCont.appendChild(lbl);
    }

    card.querySelector('.f-transitions').value = trs.join(', ');

    const attCont = card.querySelector('.f-attachments');
    for (const at of meta.attachments) {
      const row = cloneTemplate('tpl-attach-row');
      row.querySelector('.type').textContent = at;
      const has = atts[at] || [];
      row.querySelectorAll('input[data-att]').forEach(cb => {
        cb.setAttribute('data-att', at);
        cb.checked = has.includes(cb.value);
      });
      attCont.appendChild(row);
    }

    card.querySelector('[data-remove]').addEventListener('click', () => card.remove());
    return card;
  }

  function buildOutgoingTransitionCard(t, getFromState) {
    const card = cloneTemplate('tpl-outgoing-card');
    const orig = t.originalName || '';
    card.dataset.originalName = orig;
    if (orig) card.setAttribute('data-original-name', orig);

    const title = card.querySelector('.item-card-title');
    title.textContent = 'Исходящий переход' + (orig ? '' : ' (новый)');

    const toSel = card.querySelector('.f-to');
    buildStateOptions(toSel, PF.state.meta.states, t.to || (PF.state.meta.states[0] || ''));

    const codeInput = card.querySelector('.f-name');
    codeInput.value = t.name || '';

    if (orig && codeInput.value) {
      const from = getFromState ? getFromState() : '';
      const to = toSel.value;
      const expected = from && to ? from + '_' + to : '';
      if (expected && codeInput.value !== expected) {
        codeInput.dataset.manual = '1';
      }
    }

    codeInput.addEventListener('input', () => {
      codeInput.dataset.manual = '1';
    });

    let prevTo = toSel.value;
    toSel.addEventListener('change', () => {
      const to = toSel.value;
      if (to === prevTo) return;
      prevTo = to;
      if (codeInput.dataset.manual === '1') return;
      const from = getFromState ? getFromState() : '';
      if (from && to) codeInput.value = from + '_' + to;
    });

    card.querySelector('.f-ru').value = t.ru || '';

    card.querySelector('[data-remove]').addEventListener('click', () => card.remove());
    return card;
  }

  function collectPermissions(list) {
    const result = [];
    for (const c of list.querySelectorAll('.item-card')) {
      const sel = c.querySelector('.f-actor');
      const newInp = c.querySelector('.f-actor-new');
      const actor = sel.value === '__NEW__' ? newInp.value.trim() : sel.value;
      if (!actor) continue;

      const allowComments = c.querySelector('.f-allow-comments').checked;

      const ops = [];
      for (const lbl of c.querySelectorAll('.f-operations .op-item')) {
        const cb = lbl.querySelector('input[data-op]');
        if (!cb || !cb.checked) continue;
        const exCb = lbl.querySelector('input[data-op-exclusive]');
        ops.push({
          name: cb.value,
          exclusiveToAssignedUser: !!(exCb && exCb.checked)
        });
      }

      const trs = c.querySelector('.f-transitions').value
        .split(',').map(s => s.trim()).filter(Boolean);

      const attachments = {};
      c.querySelectorAll('[data-att]').forEach(cb => {
        if (cb.checked) {
          const t = cb.getAttribute('data-att');
          (attachments[t] = attachments[t] || []).push(cb.value);
        }
      });

      result.push({ actor, allowComments, operations: ops, transitions: trs, attachments });
    }
    return result;
  }

  function collectOutgoing(list) {
    return [...list.querySelectorAll('.item-card')].map(c => ({
      originalName: c.dataset.originalName || null,
      to: c.querySelector('.f-to').value,
      name: c.querySelector('.f-name').value.trim(),
      ru: c.querySelector('.f-ru').value.trim()
    }));
  }

  function applyTransitionRenames(perms, outgoing) {
    const renameMap = {};
    for (const t of outgoing) {
      if (t.originalName && t.originalName !== t.name) {
        renameMap[t.originalName] = t.name;
      }
    }
    if (Object.keys(renameMap).length === 0) return perms;

    for (const p of perms) {
      if (!Array.isArray(p.transitions)) continue;
      p.transitions = p.transitions.map(tr => renameMap[tr] || tr);
    }
    return perms;
  }

  function validateOutgoing(outgoing) {
    for (const x of outgoing) {
      if (!x.name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(x.name)) {
        showAlert('Некорректный код перехода: "' + (x.name || '') + '"');
        return false;
      }
    }
    const seen = new Set();
    for (const x of outgoing) {
      if (seen.has(x.name)) {
        showAlert('Дублирующийся код перехода: ' + x.name);
        return false;
      }
      seen.add(x.name);
    }
    return true;
  }

  async function validatePermissions(perms, outgoing, stateName) {
    const allowed = new Set(outgoing.map(o => o.name));

    const problems = [];
    for (const p of perms) {
      for (const tr of p.transitions) {
        if (!allowed.has(tr)) {
          problems.push({ actor: p.actor, transition: tr });
        }
      }
    }
    if (!problems.length) return true;

    const lines = problems.map(x =>
      '• ' + x.actor + '  →  ' + x.transition
    ).join('\n');

    const msg =
      'У состояния «' + stateName + '» есть ссылки на переходы, которых нет ' +
      'среди его исходящих переходов:\n\n' +
      lines + '\n\n' +
      'Возможные причины:\n' +
      '  – переход был удалён или переименован;\n' +
      '  – ссылка в configuration.json осталась от старой версии.\n\n' +
      'OK — убрать эти ссылки и сохранить.\n' +
      'Отмена — вернуться в форму и поправить вручную.';

    const clean = await showConfirm(msg, 'Проверка прав');
    if (!clean) return false;

    for (const p of perms) {
      p.transitions = p.transitions.filter(t => allowed.has(t));
    }
    return true;
  }

  function wireTabsAndCounts(backdrop, transList, permsList) {
    const updateCounts = () => {
      backdrop.querySelector('.tab-trans-count').textContent = transList.children.length;
      backdrop.querySelector('.tab-perms-count').textContent = permsList.children.length;
    };
    backdrop.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => {
        backdrop.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        backdrop.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        backdrop.querySelector('.tab-content[data-tab="' + t.dataset.tab + '"]').classList.add('active');
      });
    });
    return updateCounts;
  }

  /* ============================================================
   * ФОРМА ДОБАВЛЕНИЯ СОСТОЯНИЯ
   * ============================================================ */
  function openAddForm() {
    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-add-modal');
    container.appendChild(backdrop);

    const transList = backdrop.querySelector('.f-trans-list');
    const permsList = backdrop.querySelector('.f-perms-list');
    const updateCounts = wireTabsAndCounts(backdrop, transList, permsList);

    const nameInput = backdrop.querySelector('.f-new-name');
    const getFromState = () => nameInput.value.trim();

    nameInput.addEventListener('input', () => {
      const from = getFromState();
      transList.querySelectorAll('.item-card').forEach(c => {
        const codeInput = c.querySelector('.f-name');
        if (!codeInput || codeInput.dataset.manual === '1') return;
        const to = c.querySelector('.f-to').value;
        codeInput.value = from && to ? from + '_' + to : '';
      });
    });

    backdrop.querySelector('[data-act="add-trans"]').addEventListener('click', () => {
      const from = getFromState();
      const to = PF.state.meta.states[0] || '';
      const code = from && to ? from + '_' + to : '';
      transList.appendChild(buildOutgoingTransitionCard({
        originalName: null, name: code, to, ru: ''
      }, getFromState));
      updateCounts();
    });

    backdrop.querySelector('[data-act="add-perm"]').addEventListener('click', () => {
      permsList.appendChild(buildPermissionCard({
        actor: PF.state.meta.actors[0] || '', allowComments: true,
        operations: [], transitions: [], attachments: {}
      }));
      updateCounts();
    });

    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => backdrop.remove());

    backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const ru   = backdrop.querySelector('.f-new-ru').value.trim();
      const isTerminal = backdrop.querySelector('.f-new-term').checked;
      if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        showAlert('Введите корректный код состояния');
        return;
      }
      const outgoing = collectOutgoing(transList);
      if (!validateOutgoing(outgoing)) return;
      let perms = collectPermissions(permsList);
      perms = applyTransitionRenames(perms, outgoing);
      if (!await validatePermissions(perms, outgoing, name)) return;

      const ok = await showConfirm(
        'Добавить состояние "' + name + '"?\n\n' +
        'Конечное: ' + (isTerminal ? 'да' : 'нет') + '\n' +
        'Исходящих переходов: ' + outgoing.length + '\n' +
        'Блоков прав: ' + perms.length + '\n\n' +
        'Будут изменены: documentFlow.json, configuration.json, translation.csv',
        'Добавление состояния'
      );
      if (!ok) return;

      PF.vscode.postMessage({
        type: 'addState',
        payload: { name, ru, isTerminal, outgoingTransitions: outgoing, permissions: perms }
      });
      backdrop.remove();
    });

    updateCounts();
  }

  /* ============================================================
   * ФОРМА РЕДАКТИРОВАНИЯ СОСТОЯНИЯ
   * ============================================================ */
  function openEditForm(stateName) {
    const det = PF.state.stateDetails[stateName];
    if (!det) { showAlert('Нет данных для состояния ' + stateName); return; }

    const meta = PF.state.meta;
    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-edit-modal');

    const editNameInput = backdrop.querySelector('.f-edit-name');
    editNameInput.value = stateName;
    backdrop.querySelector('.f-edit-ru').value = det.ru;
    backdrop.querySelector('.f-edit-term').checked = !!det.isTerminal;

    const getFromState = () => editNameInput.value.trim();

    const incCont = backdrop.querySelector('.f-incoming');
    if (det.incoming.length) {
      const ul = document.createElement('ul');
      for (const i of det.incoming) {
        const li = document.createElement('li');
        const fromRu = meta.translations.stateTrans[i.from] || i.from;
        li.textContent = i.from + ' (' + fromRu + ') — ' + i.name + ' (' + i.ru + ')';
        ul.appendChild(li);
      }
      incCont.appendChild(ul);
    } else {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Нет входящих переходов';
      incCont.appendChild(hint);
    }

    const transList = backdrop.querySelector('.f-trans-list');
    const permsList = backdrop.querySelector('.f-perms-list');
    const updateCounts = wireTabsAndCounts(backdrop, transList, permsList);

    for (const t of det.outgoing) {
      transList.appendChild(buildOutgoingTransitionCard({
        originalName: t.name, name: t.name, to: t.to, ru: t.ru
      }, getFromState));
    }
    for (const p of det.permissions) {
      permsList.appendChild(buildPermissionCard(p));
    }
    updateCounts();

    editNameInput.addEventListener('input', () => {
      const from = getFromState();
      transList.querySelectorAll('.item-card').forEach(c => {
        const codeInput = c.querySelector('.f-name');
        if (!codeInput || codeInput.dataset.manual === '1') return;
        const to = c.querySelector('.f-to').value;
        codeInput.value = from && to ? from + '_' + to : '';
      });
    });

    backdrop.querySelector('[data-act="add-trans"]').addEventListener('click', () => {
      const from = getFromState();
      const to = meta.states[0] || '';
      const code = from && to ? from + '_' + to : '';
      transList.appendChild(buildOutgoingTransitionCard({
        originalName: null, name: code, to, ru: ''
      }, getFromState));
      updateCounts();
    });

    backdrop.querySelector('[data-act="add-perm"]').addEventListener('click', () => {
      permsList.appendChild(buildPermissionCard({
        actor: meta.actors[0] || '', allowComments: true,
        operations: [], transitions: [], attachments: {}
      }));
      updateCounts();
    });

    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => backdrop.remove());

    backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
      const newName = editNameInput.value.trim();
      const newRu   = backdrop.querySelector('.f-edit-ru').value.trim();
      const isTerminal = backdrop.querySelector('.f-edit-term').checked;
      if (!newName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
        showAlert('Введите корректный код состояния');
        return;
      }
      const outgoing = collectOutgoing(transList);
      if (!validateOutgoing(outgoing)) return;
      let perms = collectPermissions(permsList);
      perms = applyTransitionRenames(perms, outgoing);
      if (!await validatePermissions(perms, outgoing, newName)) return;

      const stateRenamed = newName !== stateName;
      const renamedTransitions = [];
      const addedTransitions   = [];
      const removedTransitions = [];

      const formOriginal = new Set(
        outgoing.filter(t => t.originalName).map(t => t.originalName)
      );
      for (const t of outgoing) {
        if (!t.originalName) addedTransitions.push(t.name);
        else if (t.originalName !== t.name) renamedTransitions.push(t.originalName + ' → ' + t.name);
      }
      for (const t of det.outgoing) {
        if (!formOriginal.has(t.name)) removedTransitions.push(t.name);
      }

      const lines = [];
      if (stateRenamed) lines.push('• Код состояния: ' + stateName + ' → ' + newName);
      lines.push('• Конечное: ' + (isTerminal ? 'да' : 'нет'));
      if (renamedTransitions.length) {
        lines.push('• Переименовано переходов (' + renamedTransitions.length + '):');
        for (const r of renamedTransitions) lines.push('    ' + r);
      }
      if (addedTransitions.length) lines.push('• Добавлено переходов: ' + addedTransitions.join(', '));
      if (removedTransitions.length) lines.push('• Удалено переходов: ' + removedTransitions.join(', '));
      lines.push('• Блоков прав: ' + perms.length);
      lines.push('');
      lines.push('Будут обновлены файлы:');
      lines.push('  documentFlow.json, configuration.json, translation.csv, documentFlow.ui.json');

      const ok = await showConfirm(lines.join('\n'), 'Сохранение состояния «' + stateName + '»');
      if (!ok) return;

      PF.vscode.postMessage({
        type: 'editState',
        payload: {
          originalName: stateName,
          name: newName,
          ru: newRu,
          isTerminal,
          outgoingTransitions: outgoing,
          permissions: perms
        }
      });
      backdrop.remove();
    });

    container.appendChild(backdrop);
  }

  /* ============================================================
   * ФОРМА РЕДАКТИРОВАНИЯ ПЕРЕХОДА
   * ============================================================ */
  function openTransitionForm(name) {
    const t = (PF.state.graphData.transitions || []).find(x => x.name === name);
    if (!t) { showAlert('Переход не найден: ' + name); return; }
    const isNew = !!t._isNew;
    const meta = PF.state.meta;

    const container = document.getElementById('modalContainer');
    const backdrop = cloneTemplate('tpl-transition-modal');
    container.appendChild(backdrop);

    backdrop.querySelector('.f-tr-name').value = t.name;
    backdrop.querySelector('.f-tr-ru').value   = t.ru || '';
    backdrop.querySelector('.f-tr-from').value = t.from;

    const toSel = backdrop.querySelector('.f-tr-to');
    buildStateOptions(toSel, meta.states, t.to);

    backdrop.querySelector('.f-tr-action').value = t.actionToRunBefore || '';
    backdrop.querySelector('.f-tr-sse').checked  = !!t.serverSideEvents;

    const aove = t.allowOnValidationErrors || null;
    const modeSelect = backdrop.querySelector('.f-tr-aove-mode');
    const codesRow   = backdrop.querySelector('.f-tr-codes-row');
    const codesArea  = backdrop.querySelector('.f-tr-codes');

    if (!aove) {
      modeSelect.value = 'none';
    } else if (typeof aove.all === 'boolean') {
      modeSelect.value = aove.all ? 'all-true' : 'all-false';
    } else if (Array.isArray(aove.codes)) {
      modeSelect.value = 'codes';
      codesArea.value = aove.codes.join(', ');
    } else if (Array.isArray(aove.exceptForCodes)) {
      modeSelect.value = 'exceptForCodes';
      codesArea.value = aove.exceptForCodes.join(', ');
    }

    function updateCodesVisibility() {
      const m = modeSelect.value;
      codesRow.style.display = (m === 'codes' || m === 'exceptForCodes') ? '' : 'none';
    }
    modeSelect.addEventListener('change', updateCodesVisibility);
    updateCodesVisibility();

    const resetBtn = backdrop.querySelector('[data-act="reset-route"]');
    if (resetBtn && t.manual && !isNew) {
      resetBtn.style.display = '';
      resetBtn.addEventListener('click', async () => {
        const ok = await showConfirm(
          'Сбросить ручной маршрут перехода «' + name + '»?\n\n' +
          'Маршрут вернётся к авто-расчёту. Изменение сохранится в documentFlow.ui.json.',
          'Сброс маршрута'
        );
        if (!ok) return;

        t.manual = false;
        t.manualWaypoints = null;

        PF.routing.rerouteAll();
        PF.render.renderGraph();
        PF.layout.applyViewBox();

        PF.vscode.postMessage({
          type: 'saveGraph',
          payload: {
            states: PF.state.graphData.states,
            transitions: PF.state.graphData.transitions
          }
        });

        backdrop.remove();
      });
    }

    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      if (isNew) {
        const i = PF.state.graphData.transitions.findIndex(x => x.name === name);
        if (i >= 0) PF.state.graphData.transitions.splice(i, 1);
        PF.routing.rerouteAll();
        PF.render.renderGraph();
        PF.layout.applyViewBox();
      }
      backdrop.remove();
    });

    backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
      const newName = backdrop.querySelector('.f-tr-name').value.trim();
      const newRu   = backdrop.querySelector('.f-tr-ru').value.trim();
      const newTo   = toSel.value;
      const action  = backdrop.querySelector('.f-tr-action').value.trim();
      const sse     = backdrop.querySelector('.f-tr-sse').checked;
      const m       = modeSelect.value;

      if (!newName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
        showAlert('Некорректный код перехода');
        return;
      }
      if (!newTo) { showAlert('Выберите целевое состояние'); return; }

      let allow = null;
      if (m === 'all-true')       allow = { mode: 'all-true' };
      else if (m === 'all-false') allow = { mode: 'all-false' };
      else if (m === 'codes' || m === 'exceptForCodes') {
        const codes = codesArea.value.split(/[\s,]+/).filter(Boolean);
        allow = { mode: m, codes };
      }

      const lines = [];
      if (isNew) {
        lines.push('Новый переход: ' + t.from + ' → ' + newTo);
      } else {
        if (newName !== name) lines.push('Код: ' + name + ' → ' + newName);
        if (newTo !== t.to)   lines.push('To: ' + t.to + ' → ' + newTo);
      }
      lines.push('actionToRunBefore: ' + (action || '—'));
      lines.push('serverSideEvents: ' + (sse ? 'да' : 'нет'));
      lines.push('allowOnValidationErrors: ' + (allow ? allow.mode : '—'));

      const ok = await showConfirm(lines.join('\n'), isNew ? 'Создание перехода' : 'Сохранение перехода');
      if (!ok) return;

      if (isNew) {
        PF.vscode.postMessage({
          type: 'addTransition',
          payload: {
            from: t.from,
            name: newName,
            to: newTo,
            ru: newRu,
            actionToRunBefore: action,
            serverSideEvents: sse,
            allowOnValidationErrors: allow
          }
        });
      } else {
        PF.vscode.postMessage({
          type: 'editTransition',
          payload: {
            originalName: name,
            name: newName,
            to: newTo,
            ru: newRu,
            actionToRunBefore: action,
            serverSideEvents: sse,
            allowOnValidationErrors: allow
          }
        });
      }
      backdrop.remove();
    });
  }

  PF.forms = {
    // Экспорт хелперов (используются в других формах и graph-render)
    buildActorOptions,
    buildStateOptions,
    buildPermissionCard,
    buildOutgoingTransitionCard,
    collectPermissions,
    collectOutgoing,
    applyTransitionRenames,
    validateOutgoing,
    validatePermissions,
    wireTabsAndCounts,
    // Сами формы
    openAddForm,
    openEditForm,
    openTransitionForm
  };

  // Регистрация в PF.app — формы вызываются из graph-render.js
  // и из main.js (BIND и renderTable).
  PF.app.openAddForm        = openAddForm;
  PF.app.openEditForm       = openEditForm;
  PF.app.openTransitionForm = openTransitionForm;
})();