(function () {
    'use strict';
    window.PF = window.PF || {};

    let activePicker = null;

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function currentLang() {
        return (PF.state && PF.state.selectedLang) || 'ru-RU';
    }

    function labelFor(name, bucket) {
        const tr = PF.state && PF.state.meta && PF.state.meta.translations;
        if (!tr) return escHtml(name);
        const lang = currentLang();
        const key = bucket === 'state' ? 'stateTransAll'
            : bucket === 'transition' ? 'transTransAll'
                : 'actorTransAll';
        const m = (tr[key] && tr[key][name]) || {};
        const v = m[lang];
        if (!v || v === name) return escHtml(name);
        return escHtml(name) + ' <span class="cmp-tr">(' + escHtml(v) + ')</span>';
    }

    function badge(kind, text) {
        return '<span class="cmp-badge cmp-badge-' + kind + '">' + escHtml(text) + '</span>';
    }

    /* ---------- picker ---------- */

    function openPicker() {
        const backdrop = PF.utils.cloneTemplate('tpl-compare-picker');
        const curName = PF.state.DATA && PF.state.DATA.relations && PF.state.DATA.relations.docName;
        backdrop.querySelector('.cmp-current-name').textContent = curName || '—';

        const sel = backdrop.querySelector('.cmp-doc-select');
        sel.disabled = true;
        sel.innerHTML = '<option>— загрузка… —</option>';

        const compareBtn = backdrop.querySelector('[data-act="compare"]');
        compareBtn.disabled = true;

        activePicker = { backdrop, flowPath: null, docName: null };

        backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => {
            backdrop.remove();
            activePicker = null;
        });

        backdrop.querySelector('[data-act="pick-folder"]').addEventListener('click', () => {
            PF.vscode.postMessage({ type: 'pickFolderForCompare' });
        });

        compareBtn.addEventListener('click', () => {
            if (!activePicker || !activePicker.flowPath) return;
            const fp = activePicker.flowPath;
            backdrop.remove();
            activePicker = null;
            PF.vscode.postMessage({
                type: 'compareDocuments',
                payload: { otherFlowPath: fp }
            });
        });

        sel.addEventListener('change', () => {
            if (!activePicker) return;
            const opt = sel.options[sel.selectedIndex];
            if (!opt || !opt.value) {
                activePicker.flowPath = null;
                compareBtn.disabled = true;
                return;
            }
            activePicker.flowPath = opt.value;
            compareBtn.disabled = false;
        });

        document.getElementById('modalContainer').appendChild(backdrop);

        PF.vscode.postMessage({ type: 'listDocumentsForCompare' });
    }

    function fillPickerList(docs) {
        if (!activePicker) return;
        const sel = activePicker.backdrop.querySelector('.cmp-doc-select');
        const curDocName = activePicker.backdrop.querySelector('.cmp-current-name').textContent;

        sel.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '— выберите —';
        sel.appendChild(ph);

        let count = 0;
        for (const d of (docs || [])) {
            if (d.isCurrent) continue;
            if (d.docName === curDocName) continue;
            const opt = document.createElement('option');
            opt.value = d.flowPath;
            opt.textContent = d.docName + (d.pkgName ? '  [' + d.pkgName + ']' : '');
            sel.appendChild(opt);
            count++;
        }
        sel.disabled = false;

        if (!count) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '(документы не найдены — укажите папку)';
            sel.appendChild(opt);
        }
    }

    function handleFolderPicked(msg) {
        if (!activePicker) return;
        if (msg.cancelled) return;
        if (msg.error) {
            PF.utils.showAlert(msg.error, 'Сравнение');
            return;
        }
        activePicker.flowPath = msg.flowPath;
        const info = activePicker.backdrop.querySelector('.cmp-selected-info');
        info.style.display = '';
        activePicker.backdrop.querySelector('.cmp-selected-name').textContent = msg.docName;
        activePicker.backdrop.querySelector('.cmp-selected-path').textContent = msg.flowPath;
        activePicker.backdrop.querySelector('[data-act="compare"]').disabled = false;
    }

    /* ---------- diff ---------- */

    function openDiff(diff) {
        const backdrop = PF.utils.cloneTemplate('tpl-compare-diff');
        backdrop.querySelector('.cmp-header-current').textContent =
            diff.current.docName + (diff.current.flowName ? ' (' + diff.current.flowName + ')' : '');
        backdrop.querySelector('.cmp-header-other').textContent =
            diff.other.docName + (diff.other.flowName ? ' (' + diff.other.flowName + ')' : '');

        const body = backdrop.querySelector('.cmp-body');
        const applyBtn = backdrop.querySelector('[data-act="apply"]');
        const countEl = backdrop.querySelector('.cmp-selected-count');

        const otherFlowPath = diff.other.flowPath || null;

        // Список всех действий на экране.
        // { id, kind, payload, enabled, selected }
        const actions = [];

        function actionId(kind, payload) {
            return kind + '|' + JSON.stringify(payload || {});
        }

        function registerAction(kind, payload, enabled) {
            const id = actionId(kind, payload);
            const existing = actions.find(x => x.id === id);
            if (existing) return existing;
            const a = { id, kind, payload, enabled: !!enabled, selected: false };
            actions.push(a);
            return a;
        }

        function refreshFooter() {
            const enabledChecked = actions.filter(a => a.enabled && a.selected).length;
            const enabledTotal = actions.filter(a => a.enabled).length;
            countEl.textContent = 'выбрано: ' + enabledChecked + ' / ' + enabledTotal;
            applyBtn.disabled = !enabledChecked || !otherFlowPath;
        }

        // Универсальная строка действия с чекбоксом.
        // opts = { kind, payload, enabled, verbKind, verbLabel, objHtml, detailHtml, contextHtml }
        function renderAction(opts) {
            const a = registerAction(opts.kind, opts.payload, opts.enabled);

            const row = document.createElement('label');
            row.className = 'cmp-action-row' + (a.enabled ? '' : ' cmp-action-disabled');
            row.dataset.actionId = a.id;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.disabled = !a.enabled;
            cb.checked = a.selected;
            cb.addEventListener('change', () => {
                a.selected = cb.checked;
                refreshFooter();
            });
            row.appendChild(cb);

            const body_ = document.createElement('span');
            body_.className = 'cmp-action-body';
            body_.innerHTML =
                '<span class="cmp-verb cmp-verb-' + opts.verbKind + '">' + escHtml(opts.verbLabel) + '</span> ' +
                opts.objHtml +
                (opts.detailHtml ? ' <span class="cmp-detail">' + opts.detailHtml + '</span>' : '') +
                (opts.contextHtml ? ' <span class="cmp-context">' + opts.contextHtml + '</span>' : '');
            if (!a.enabled) {
                body_.innerHTML += ' <span class="cmp-not-ready">(на этапе 3)</span>';
            }
            row.appendChild(body_);

            return row;
        }

        function addSection(title, count, emptyText, renderItems) {
            const sec = document.createElement('section');
            sec.className = 'cmp-section';
            const h = document.createElement('h3');
            h.className = 'cmp-section-title';
            h.textContent = title + ' (' + count + ')';
            sec.appendChild(h);
            if (!count) {
                const empty = document.createElement('div');
                empty.className = 'cmp-section-empty';
                empty.textContent = emptyText || 'нет отличий';
                sec.appendChild(empty);
            } else {
                const list = document.createElement('div');
                list.className = 'cmp-action-list';
                renderItems(list);
                sec.appendChild(list);
            }
            body.appendChild(sec);
        }

        // === initialState (только изменение, этап 3) ===
        if (diff.initialState) {
            addSection('initialState', 1, '', (list) => {
                list.appendChild(renderAction({
                    kind: 'changeInitialState',
                    payload: { value: diff.initialState.other },
                    enabled: true,
                    verbKind: 'change',
                    verbLabel: 'Изменить',
                    objHtml: 'initialState',
                    detailHtml: '<code>' + escHtml(diff.initialState.current || '(пусто)') +
                        '</code> → <code>' + escHtml(diff.initialState.other || '(пусто)') + '</code>',
                    contextHtml: '(свойство документа)'
                }));
            });
        }

        // === Глобальные акторы ===
        {
            const gaO = diff.globalActors.onlyInOther || [];
            const gaC = diff.globalActors.onlyInCurrent || [];
            if (gaO.length || gaC.length) {
                addSection('Глобальные акторы', gaO.length + gaC.length, '', (list) => {
                    for (const name of gaO) {
                        list.appendChild(renderAction({
                            kind: 'addGlobalActor',
                            payload: { name },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: 'Добавить',
                            objHtml: 'актора ' + labelFor(name, 'actor'),
                            contextHtml: '(в documentFlow.actors)'
                        }));
                    }
                    for (const name of gaC) {
                        list.appendChild(renderAction({
                            kind: 'removeGlobalActor',
                            payload: { name },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: 'Удалить',
                            objHtml: 'актора ' + labelFor(name, 'actor'),
                            contextHtml: '(из documentFlow.actors)'
                        }));
                    }
                });
            }
        }

        // === Вложения документа ===
        {
            const atO = diff.docAttachments.onlyInOther || [];
            const atC = diff.docAttachments.onlyInCurrent || [];
            if (atO.length || atC.length) {
                addSection('Вложения документа', atO.length + atC.length, '', (list) => {
                    for (const code of atO) {
                        list.appendChild(renderAction({
                            kind: 'addDocAttachment',
                            payload: { code },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: 'Добавить',
                            objHtml: 'вложение <code>' + escHtml(code) + '</code>',
                            contextHtml: '(в configuration.attachments)'
                        }));
                    }
                    for (const code of atC) {
                        list.appendChild(renderAction({
                            kind: 'removeDocAttachment',
                            payload: { code },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: 'Удалить',
                            objHtml: 'вложение <code>' + escHtml(code) + '</code>',
                            contextHtml: '(из configuration.attachments)'
                        }));
                    }
                });
            }
        }

        // === Состояния только в образце ===
        addSection('Состояния — только в образце (добавить в текущий)',
            diff.states.onlyInOther.length, 'таких нет', (list) => {
                for (const s of diff.states.onlyInOther) {
                    list.appendChild(renderAction({
                        kind: 'addState',
                        payload: { name: s.name },
                        enabled: true,
                        verbKind: 'add',
                        verbLabel: 'Добавить',
                        objHtml: 'состояние ' + labelFor(s.name, 'state'),
                        detailHtml: s.isTerminal ? '<span class="cmp-tag">terminal</span>' : '',
                        contextHtml: '(объект в documentFlow.states)'
                    }));
                }
            });

        // === Состояния только в текущем ===
        addSection('Состояния — только в текущем (удалить из текущего)',
            diff.states.onlyInCurrent.length, 'таких нет', (list) => {
                for (const s of diff.states.onlyInCurrent) {
                    list.appendChild(renderAction({
                        kind: 'removeState',
                        payload: { name: s.name },
                        enabled: true,
                        verbKind: 'remove',
                        verbLabel: 'Удалить',
                        objHtml: 'состояние ' + labelFor(s.name, 'state'),
                        contextHtml: '(объект в documentFlow.states)'
                    }));
                }
            });

        // === Состояния: различия ===
        if (diff.states.differing.length) {
            const sec = document.createElement('section');
            sec.className = 'cmp-section';
            const h = document.createElement('h3');
            h.className = 'cmp-section-title';
            h.textContent = 'Состояния — различия (' + diff.states.differing.length + ')';
            sec.appendChild(h);

            for (const s of diff.states.differing) {
                const block = document.createElement('div');
                block.className = 'cmp-object-block';

                const objHead = document.createElement('div');
                objHead.className = 'cmp-object-head';
                objHead.innerHTML = 'Состояние ' + labelFor(s.name, 'state');
                block.appendChild(objHead);

                const list = document.createElement('div');
                list.className = 'cmp-action-list';

                if (s.isTerminal) {
                    list.appendChild(renderAction({
                        kind: 'changeStateTerminal',
                        payload: { name: s.name, value: s.isTerminal.other },
                        enabled: true,
                        verbKind: 'change',
                        verbLabel: 'Изменить',
                        objHtml: 'isTerminal',
                        detailHtml: '<code>' + escHtml(String(s.isTerminal.current)) +
                            '</code> → <code>' + escHtml(String(s.isTerminal.other)) + '</code>',
                        contextHtml: '(свойство состояния)'
                    }));
                }

                for (const actorName of (s.actorsOnlyInOther || [])) {
                    list.appendChild(renderAction({
                        kind: 'addActorToState',
                        payload: { stateName: s.name, actorName },
                        enabled: true,
                        verbKind: 'add',
                        verbLabel: 'Добавить',
                        objHtml: 'актора ' + labelFor(actorName, 'actor') + ' в это состояние',
                        contextHtml: '(членство)'
                    }));
                }
                for (const actorName of (s.actorsOnlyInCurrent || [])) {
                    list.appendChild(renderAction({
                        kind: 'removeActorFromState',
                        payload: { stateName: s.name, actorName },
                        enabled: true,
                        verbKind: 'remove',
                        verbLabel: 'Удалить',
                        objHtml: 'актора ' + labelFor(actorName, 'actor') + ' из этого состояния',
                        contextHtml: '(членство)'
                    }));
                }

                for (const p of (s.actorPermDiffs || [])) {
                    const sub = document.createElement('div');
                    sub.className = 'cmp-sub-head';
                    sub.innerHTML = 'Актор ' + labelFor(p.actor, 'actor');
                    list.appendChild(sub);

                    if (p.allowComments) {
                        list.appendChild(renderAction({
                            kind: 'changeActorAllowComments',
                            payload: { stateName: s.name, actorName: p.actor, value: !!p.allowComments.other },
                            enabled: true,
                            verbKind: p.allowComments.other ? 'add' : 'remove',
                            verbLabel: p.allowComments.other ? 'Разрешить' : 'Запретить',
                            objHtml: 'комментарии',
                            detailHtml: '<code>' + escHtml(String(p.allowComments.current)) +
                                '</code> → <code>' + escHtml(String(p.allowComments.other)) + '</code>',
                            contextHtml: '(свойство актора)'
                        }));
                    }
                    for (const opName of p.operations.added) {
                        list.appendChild(renderAction({
                            kind: 'addActorOp',
                            payload: { stateName: s.name, actorName: p.actor, opName },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: 'Разрешить',
                            objHtml: 'операцию <code>' + escHtml(opName) + '</code>',
                            contextHtml: '(право актора)'
                        }));
                    }
                    for (const opName of p.operations.removed) {
                        list.appendChild(renderAction({
                            kind: 'removeActorOp',
                            payload: { stateName: s.name, actorName: p.actor, opName },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: 'Запретить',
                            objHtml: 'операцию <code>' + escHtml(opName) + '</code>',
                            contextHtml: '(право актора)'
                        }));
                    }
                    for (const trName of p.transitions.added) {
                        list.appendChild(renderAction({
                            kind: 'addActorTransition',
                            payload: { stateName: s.name, actorName: p.actor, transitionName: trName },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: 'Разрешить',
                            objHtml: 'переход ' + labelFor(trName, 'transition'),
                            contextHtml: '(право актора)'
                        }));
                    }
                    for (const trName of p.transitions.removed) {
                        list.appendChild(renderAction({
                            kind: 'removeActorTransition',
                            payload: { stateName: s.name, actorName: p.actor, transitionName: trName },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: 'Запретить',
                            objHtml: 'переход ' + labelFor(trName, 'transition'),
                            contextHtml: '(право актора)'
                        }));
                    }
                    for (const code of p.attachments.added) {
                        list.appendChild(renderAction({
                            kind: 'addActorAttachment',
                            payload: { stateName: s.name, actorName: p.actor, attachmentType: code },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: 'Добавить',
                            objHtml: 'вложение <code>' + escHtml(code) + '</code>',
                            contextHtml: '(право на вложение)'
                        }));
                    }
                    for (const code of p.attachments.removed) {
                        list.appendChild(renderAction({
                            kind: 'removeActorAttachment',
                            payload: { stateName: s.name, actorName: p.actor, attachmentType: code },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: 'Удалить',
                            objHtml: 'вложение <code>' + escHtml(code) + '</code>',
                            contextHtml: '(право на вложение)'
                        }));
                    }
                    for (const ch of p.attachments.changed) {
                        list.appendChild(renderAction({
                            kind: 'changeActorAttachmentPerms',
                            payload: { stateName: s.name, actorName: p.actor, attachmentType: ch.type, permissions: ch.other.slice() },
                            enabled: true,
                            verbKind: 'change',
                            verbLabel: 'Изменить',
                            objHtml: 'права на вложение <code>' + escHtml(ch.type) + '</code>',
                            detailHtml: '<code>[' + escHtml(ch.current.join(', ')) + ']</code> → <code>[' +
                                escHtml(ch.other.join(', ')) + ']</code>',
                            contextHtml: '(право на вложение)'
                        }));
                    }
                }

                block.appendChild(list);
                sec.appendChild(block);
            }
            body.appendChild(sec);
        }

        // === Переходы только в образце ===
        addSection('Переходы — только в образце (добавить в текущий)',
            diff.transitions.onlyInOther.length, 'таких нет', (list) => {
                for (const t of diff.transitions.onlyInOther) {
                    list.appendChild(renderAction({
                        kind: 'addTransition',
                        payload: { name: t.name },
                        enabled: true,
                        verbKind: 'add',
                        verbLabel: 'Добавить',
                        objHtml: 'переход ' + labelFor(t.name, 'transition'),
                        detailHtml: '<span class="cmp-hint">(' + escHtml(t.from) + ' → ' + escHtml(t.to) + ')</span>',
                        contextHtml: '(объект в documentFlow.transitions)'
                    }));
                }
            });

        // === Переходы только в текущем ===
        addSection('Переходы — только в текущем (удалить из текущего)',
            diff.transitions.onlyInCurrent.length, 'таких нет', (list) => {
                for (const t of diff.transitions.onlyInCurrent) {
                    list.appendChild(renderAction({
                        kind: 'removeTransition',
                        payload: { name: t.name },
                        enabled: true,
                        verbKind: 'remove',
                        verbLabel: 'Удалить',
                        objHtml: 'переход ' + labelFor(t.name, 'transition'),
                        detailHtml: '<span class="cmp-hint">(' + escHtml(t.from) + ' → ' + escHtml(t.to) + ')</span>',
                        contextHtml: '(объект в documentFlow.transitions)'
                    }));
                }
            });

        // === Переходы: различия ===
        if (diff.transitions.differing.length) {
            const sec = document.createElement('section');
            sec.className = 'cmp-section';
            const h = document.createElement('h3');
            h.className = 'cmp-section-title';
            h.textContent = 'Переходы — различия (' + diff.transitions.differing.length + ')';
            sec.appendChild(h);

            for (const t of diff.transitions.differing) {
                const block = document.createElement('div');
                block.className = 'cmp-object-block';

                const objHead = document.createElement('div');
                objHead.className = 'cmp-object-head';
                objHead.innerHTML = 'Переход ' + labelFor(t.name, 'transition');
                block.appendChild(objHead);

                const list = document.createElement('div');
                list.className = 'cmp-action-list';

                if (t.from) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionFrom',
                        payload: { name: t.name, value: t.from.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: 'Изменить', objHtml: 'from',
                        detailHtml: '<code>' + escHtml(t.from.current) + '</code> → <code>' + escHtml(t.from.other) + '</code>',
                        contextHtml: '(свойство перехода)'
                    }));
                }
                if (t.to) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionTo',
                        payload: { name: t.name, value: t.to.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: 'Изменить', objHtml: 'to',
                        detailHtml: '<code>' + escHtml(t.to.current) + '</code> → <code>' + escHtml(t.to.other) + '</code>',
                        contextHtml: '(свойство перехода)'
                    }));
                }
                if (t.actionToRunBefore) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionAction',
                        payload: { name: t.name, value: t.actionToRunBefore.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: 'Изменить', objHtml: 'actionToRunBefore',
                        detailHtml: '<code>' + escHtml(t.actionToRunBefore.current || '—') +
                            '</code> → <code>' + escHtml(t.actionToRunBefore.other || '—') + '</code>',
                        contextHtml: '(свойство перехода)'
                    }));
                }
                if (t.serverSideEvents) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionServerSide',
                        payload: { name: t.name, value: !!t.serverSideEvents.other },
                        enabled: true,
                        verbKind: t.serverSideEvents.other ? 'add' : 'remove',
                        verbLabel: t.serverSideEvents.other ? 'Включить' : 'Отключить',
                        objHtml: 'serverSideEvents',
                        detailHtml: '<code>' + escHtml(String(t.serverSideEvents.current)) +
                            '</code> → <code>' + escHtml(String(t.serverSideEvents.other)) + '</code>',
                        contextHtml: '(свойство перехода)'
                    }));
                }
                if (t.allowOnValidationErrors) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionAOVE',
                        payload: { name: t.name, value: t.allowOnValidationErrors.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: 'Изменить', objHtml: 'allowOnValidationErrors',
                        detailHtml: '<code>' + escHtml(JSON.stringify(t.allowOnValidationErrors.current)) +
                            '</code> → <code>' + escHtml(JSON.stringify(t.allowOnValidationErrors.other)) + '</code>',
                        contextHtml: '(свойство перехода)'
                    }));
                }

                block.appendChild(list);
                sec.appendChild(block);
            }
            body.appendChild(sec);
        }

        // === Кнопки ===
        backdrop.querySelector('[data-act="select-all-add"]').addEventListener('click', () => {
            for (const a of actions) {
                if (a.enabled) a.selected = true;
            }
            backdrop.querySelectorAll('.cmp-action-row input[type="checkbox"]').forEach(cb => {
                const row = cb.closest('.cmp-action-row');
                const a = row && actions.find(x => x.id === row.dataset.actionId);
                if (a && a.enabled) cb.checked = true;
            });
            refreshFooter();
        });

        backdrop.querySelector('[data-act="select-all-safe"]').addEventListener('click', () => {
            // Отметить всё, КРОМЕ remove*
            for (const a of actions) {
                if (a.enabled && !a.kind.startsWith('remove')) a.selected = true;
            }
            backdrop.querySelectorAll('.cmp-action-row input[type="checkbox"]').forEach(cb => {
                const row = cb.closest('.cmp-action-row');
                const a = row && actions.find(x => x.id === row.dataset.actionId);
                if (a && a.enabled && !a.kind.startsWith('remove')) cb.checked = true;
            });
            refreshFooter();
        });

        backdrop.querySelector('[data-act="deselect-all"]').addEventListener('click', () => {
            for (const a of actions) a.selected = false;
            backdrop.querySelectorAll('.cmp-action-row input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            refreshFooter();
        });

        applyBtn.addEventListener('click', async () => {
            const selectedActions = actions.filter(a => a.enabled && a.selected);
            if (!selectedActions.length) return;

            const addCount = selectedActions.filter(a => a.kind.startsWith('add')).length;
            const removeCount = selectedActions.filter(a => a.kind.startsWith('remove')).length;
            const changeCount = selectedActions.filter(a => a.kind.startsWith('change')).length;

            const lines = [];
            if (addCount) lines.push('добавить: ' + addCount);
            if (removeCount) lines.push('удалить: ' + removeCount);
            if (changeCount) lines.push('изменить: ' + changeCount);

            const warn = removeCount > 0 ? '\n\n⚠ Удаление необратимо.' : '';
            const ok = await PF.utils.showConfirm(
                'Применить к текущему документу?\n\n' + lines.join('\n') + warn,
                'Применение изменений'
            );
            if (!ok) return;

            const selected = selectedActions.map(a => ({ kind: a.kind, payload: a.payload }));

            applyBtn.disabled = true;
            applyBtn.textContent = 'Применение…';
            PF.vscode.postMessage({
                type: 'applyCompareDocuments',
                payload: { otherFlowPath, actions: selected }
            });
        });

        backdrop.querySelector('[data-act="close"]').addEventListener('click', () => backdrop.remove());

        refreshFooter();
        document.getElementById('modalContainer').appendChild(backdrop);
    }
    /* ---------- init ---------- */

    function onMessage(ev) {
        const msg = ev.data;
        if (!msg || !msg.type) return;

        if (msg.type === 'documentsForCompare') { fillPickerList(msg.docs); return; }
        if (msg.type === 'folderPicked') { handleFolderPicked(msg); return; }
        if (msg.type === 'compareResult') { openDiff(msg.diff); return; }

        if (msg.type === 'compareError') {
            PF.utils.showAlert(msg.error || 'Ошибка сравнения', 'Сравнение');
            return;
        }

        if (msg.type === 'applyCompareResult') {
            const backdrop = document.querySelector('.compare-diff-modal');
            const parent = backdrop ? backdrop.closest('.modal-backdrop') : null;

            if (!msg.ok) {
                // Отмену на сервере не считаем ошибкой — молча восстанавливаем.
                if (msg.error !== 'Отменено пользователем.') {
                    PF.utils.showAlert(msg.error || 'Ошибка применения', 'Сравнение');
                }
                if (backdrop) {
                    const btn = backdrop.querySelector('[data-act="apply"]');
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Применить выбранное';
                    }
                }
                return;
            }

            const warnings = msg.warnings || [];
            const text =
                'Применено действий: ' + msg.applied + '.' +
                (warnings.length
                    ? '\n\nПредупреждения:\n' + warnings.map(w => '• ' + w).join('\n')
                    : '');

            PF.utils.showAlert(text, 'Сравнение — применено').then(() => {
                if (parent) parent.remove();
                // Перезагрузка данных — перерисует весь webview.
                PF.vscode.postMessage({ type: 'reload' });
            });
            return;
        }
    }

    function init() {
        if (document.body.dataset.compareInited === '1') return;
        document.body.dataset.compareInited = '1';
        const btn = document.getElementById('compareBtn');
        if (btn) btn.addEventListener('click', openPicker);
        window.addEventListener('message', onMessage);
    }

    PF.compare = { init, openPicker, openDiff };
})();