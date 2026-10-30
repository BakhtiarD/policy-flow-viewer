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

    /* ---------- picker ---------- */

    function openPicker() {
        const backdrop = PF.utils.cloneTemplate('tpl-compare-picker');
        const curName = PF.state.DATA && PF.state.DATA.relations && PF.state.DATA.relations.docName;
        backdrop.querySelector('.cmp-current-name').textContent = curName || '—';

        const sel = backdrop.querySelector('.cmp-doc-select');
        sel.disabled = true;
        sel.innerHTML = '<option>' + escHtml(PF.ui.t('compare.picker.loading')) + '</option>';

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
        ph.textContent = PF.ui.t('common.select');
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
            opt.textContent = PF.ui.t('compare.picker.noDocs');
            sel.appendChild(opt);
        }
    }

    function handleFolderPicked(msg) {
        if (!activePicker) return;
        if (msg.cancelled) return;
        if (msg.error) {
            PF.utils.showAlert(msg.error, PF.ui.t('compare.error.title'));
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
            countEl.textContent = PF.ui.t('compare.footer.selected', {
                checked: String(enabledChecked),
                total: String(enabledTotal)
            });
            applyBtn.disabled = !enabledChecked || !otherFlowPath;
        }

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
                empty.textContent = emptyText || '—';
                sec.appendChild(empty);
            } else {
                const list = document.createElement('div');
                list.className = 'cmp-action-list';
                renderItems(list);
                sec.appendChild(list);
            }
            body.appendChild(sec);
        }

        // === initialState ===
        if (diff.initialState) {
            addSection('initialState', 1, '', (list) => {
                list.appendChild(renderAction({
                    kind: 'changeInitialState',
                    payload: { value: diff.initialState.other },
                    enabled: true,
                    verbKind: 'change',
                    verbLabel: PF.ui.t('compare.verb.change'),
                    objHtml: 'initialState',
                    detailHtml: '<code>' + escHtml(diff.initialState.current || '(—)') +
                        '</code> → <code>' + escHtml(diff.initialState.other || '(—)') + '</code>',
                    contextHtml: PF.ui.t('compare.context.docProperty')
                }));
            });
        }

        // === Глобальные акторы ===
        {
            const gaO = diff.globalActors.onlyInOther || [];
            const gaC = diff.globalActors.onlyInCurrent || [];
            if (gaO.length || gaC.length) {
                addSection(PF.ui.t('compare.section.globalActors'), gaO.length + gaC.length, '', (list) => {
                    for (const name of gaO) {
                        list.appendChild(renderAction({
                            kind: 'addGlobalActor',
                            payload: { name },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: PF.ui.t('compare.verb.add'),
                            objHtml: PF.ui.t('compare.object.actor', {
                                label: labelFor(name, 'actor')
                            }),
                            contextHtml: PF.ui.t('compare.context.globalActorsIn')
                        }));
                    }
                    for (const name of gaC) {
                        list.appendChild(renderAction({
                            kind: 'removeGlobalActor',
                            payload: { name },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: PF.ui.t('compare.verb.remove'),
                            objHtml: PF.ui.t('compare.object.actor', {
                                label: labelFor(name, 'actor')
                            }),
                            contextHtml: PF.ui.t('compare.context.globalActorsOut')
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
                addSection(PF.ui.t('compare.section.docAttachments'), atO.length + atC.length, '', (list) => {
                    for (const code of atO) {
                        list.appendChild(renderAction({
                            kind: 'addDocAttachment',
                            payload: { code },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: PF.ui.t('compare.verb.add'),
                            objHtml: PF.ui.t('compare.object.attachment', { code: escHtml(code) }),
                            contextHtml: PF.ui.t('compare.context.docAttachmentsIn')
                        }));
                    }
                    for (const code of atC) {
                        list.appendChild(renderAction({
                            kind: 'removeDocAttachment',
                            payload: { code },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: PF.ui.t('compare.verb.remove'),
                            objHtml: PF.ui.t('compare.object.attachment', { code: escHtml(code) }),
                            contextHtml: PF.ui.t('compare.context.docAttachmentsOut')
                        }));
                    }
                });
            }
        }

        // === Состояния только в образце ===
        addSection(PF.ui.t('compare.section.statesOnlyInOther'),
            diff.states.onlyInOther.length, '—', (list) => {
                for (const s of diff.states.onlyInOther) {
                    list.appendChild(renderAction({
                        kind: 'addState',
                        payload: { name: s.name },
                        enabled: true,
                        verbKind: 'add',
                        verbLabel: PF.ui.t('compare.verb.add'),
                        objHtml: PF.ui.t('compare.object.state', {
                            label: labelFor(s.name, 'state')
                        }),
                        detailHtml: s.isTerminal ? '<span class="cmp-tag">terminal</span>' : '',
                        contextHtml: PF.ui.t('compare.context.stateObject')
                    }));
                }
            });

        // === Состояния только в текущем ===
        addSection(PF.ui.t('compare.section.statesOnlyInCurrent'),
            diff.states.onlyInCurrent.length, '—', (list) => {
                for (const s of diff.states.onlyInCurrent) {
                    list.appendChild(renderAction({
                        kind: 'removeState',
                        payload: { name: s.name },
                        enabled: true,
                        verbKind: 'remove',
                        verbLabel: PF.ui.t('compare.verb.remove'),
                        objHtml: PF.ui.t('compare.object.state', {
                            label: labelFor(s.name, 'state')
                        }),
                        contextHtml: PF.ui.t('compare.context.stateObject')
                    }));
                }
            });

        // === Состояния: различия ===
        if (diff.states.differing.length) {
            const sec = document.createElement('section');
            sec.className = 'cmp-section';
            const h = document.createElement('h3');
            h.className = 'cmp-section-title';
            h.textContent = PF.ui.t('compare.section.statesDiffering') + ' (' + diff.states.differing.length + ')';
            sec.appendChild(h);

            for (const s of diff.states.differing) {
                const block = document.createElement('div');
                block.className = 'cmp-object-block';

                const objHead = document.createElement('div');
                objHead.className = 'cmp-object-head';
                objHead.innerHTML = PF.ui.t('compare.object.state', {
                    label: labelFor(s.name, 'state')
                });
                block.appendChild(objHead);

                const list = document.createElement('div');
                list.className = 'cmp-action-list';

                if (s.isTerminal) {
                    list.appendChild(renderAction({
                        kind: 'changeStateTerminal',
                        payload: { name: s.name, value: s.isTerminal.other },
                        enabled: true,
                        verbKind: 'change',
                        verbLabel: PF.ui.t(s.isTerminal.other ? 'compare.verb.enable' : 'compare.verb.disable'),
                        objHtml: 'isTerminal',
                        detailHtml: '<code>' + escHtml(String(s.isTerminal.current)) +
                            '</code> → <code>' + escHtml(String(s.isTerminal.other)) + '</code>',
                        contextHtml: PF.ui.t('compare.context.stateProperty')
                    }));
                }

                for (const actorName of (s.actorsOnlyInOther || [])) {
                    list.appendChild(renderAction({
                        kind: 'addActorToState',
                        payload: { stateName: s.name, actorName },
                        enabled: true,
                        verbKind: 'add',
                        verbLabel: PF.ui.t('compare.verb.add'),
                        objHtml: PF.ui.t('compare.object.actorIntoState', {
                            label: labelFor(actorName, 'actor')
                        }),
                        contextHtml: PF.ui.t('compare.context.membership')
                    }));
                }
                for (const actorName of (s.actorsOnlyInCurrent || [])) {
                    list.appendChild(renderAction({
                        kind: 'removeActorFromState',
                        payload: { stateName: s.name, actorName },
                        enabled: true,
                        verbKind: 'remove',
                        verbLabel: PF.ui.t('compare.verb.remove'),
                        objHtml: PF.ui.t('compare.object.actorFromState', {
                            label: labelFor(actorName, 'actor')
                        }),
                        contextHtml: PF.ui.t('compare.context.membership')
                    }));
                }

                for (const p of (s.actorPermDiffs || [])) {
                    const sub = document.createElement('div');
                    sub.className = 'cmp-sub-head';
                    sub.innerHTML = PF.ui.t('compare.object.actor', { label: labelFor(p.actor, 'actor') });
                    list.appendChild(sub);

                    if (p.allowComments) {
                        list.appendChild(renderAction({
                            kind: 'changeActorAllowComments',
                            payload: { stateName: s.name, actorName: p.actor, value: !!p.allowComments.other },
                            enabled: true,
                            verbKind: p.allowComments.other ? 'add' : 'remove',
                            verbLabel: PF.ui.t(p.allowComments.other ? 'compare.verb.allow' : 'compare.verb.deny'),
                            objHtml: PF.ui.t('compare.object.comments'),
                            detailHtml: '<code>' + escHtml(String(p.allowComments.current)) +
                                '</code> → <code>' + escHtml(String(p.allowComments.other)) + '</code>',
                            contextHtml: PF.ui.t('compare.context.actorProperty')
                        }));
                    }
                    for (const opName of p.operations.added) {
                        list.appendChild(renderAction({
                            kind: 'addActorOp',
                            payload: { stateName: s.name, actorName: p.actor, opName },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: PF.ui.t('compare.verb.allow'),
                            objHtml: PF.ui.t('compare.object.operation', { op: escHtml(opName) }),
                            contextHtml: PF.ui.t('compare.context.actorRight')
                        }));
                    }
                    for (const opName of p.operations.removed) {
                        list.appendChild(renderAction({
                            kind: 'removeActorOp',
                            payload: { stateName: s.name, actorName: p.actor, opName },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: PF.ui.t('compare.verb.deny'),
                            objHtml: PF.ui.t('compare.object.operation', { op: escHtml(opName) }),
                            contextHtml: PF.ui.t('compare.context.actorRight')
                        }));
                    }
                    for (const trName of p.transitions.added) {
                        list.appendChild(renderAction({
                            kind: 'addActorTransition',
                            payload: { stateName: s.name, actorName: p.actor, transitionName: trName },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: PF.ui.t('compare.verb.allow'),
                            objHtml: PF.ui.t('compare.object.transition', {
                                label: labelFor(trName, 'transition')
                            }),
                            contextHtml: PF.ui.t('compare.context.actorRight')
                        }));
                    }
                    for (const trName of p.transitions.removed) {
                        list.appendChild(renderAction({
                            kind: 'removeActorTransition',
                            payload: { stateName: s.name, actorName: p.actor, transitionName: trName },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: PF.ui.t('compare.verb.deny'),
                            objHtml: PF.ui.t('compare.object.transition', {
                                label: labelFor(trName, 'transition')
                            }),
                            contextHtml: PF.ui.t('compare.context.actorRight')
                        }));
                    }
                    for (const code of p.attachments.added) {
                        list.appendChild(renderAction({
                            kind: 'addActorAttachment',
                            payload: { stateName: s.name, actorName: p.actor, attachmentType: code },
                            enabled: true,
                            verbKind: 'add',
                            verbLabel: PF.ui.t('compare.verb.add'),
                            objHtml: PF.ui.t('compare.object.attachment', { code: escHtml(code) }),
                            contextHtml: PF.ui.t('compare.context.attachmentRight')
                        }));
                    }
                    for (const code of p.attachments.removed) {
                        list.appendChild(renderAction({
                            kind: 'removeActorAttachment',
                            payload: { stateName: s.name, actorName: p.actor, attachmentType: code },
                            enabled: true,
                            verbKind: 'remove',
                            verbLabel: PF.ui.t('compare.verb.remove'),
                            objHtml: PF.ui.t('compare.object.attachment', { code: escHtml(code) }),
                            contextHtml: PF.ui.t('compare.context.attachmentRight')
                        }));
                    }
                    for (const ch of p.attachments.changed) {
                        list.appendChild(renderAction({
                            kind: 'changeActorAttachmentPerms',
                            payload: { stateName: s.name, actorName: p.actor, attachmentType: ch.type, permissions: ch.other.slice() },
                            enabled: true,
                            verbKind: 'change',
                            verbLabel: PF.ui.t('compare.verb.change'),
                            objHtml: PF.ui.t('compare.object.attachmentRights', { code: escHtml(ch.type) }),
                            detailHtml: '<code>[' + escHtml(ch.current.join(', ')) + ']</code> → <code>[' +
                                escHtml(ch.other.join(', ')) + ']</code>',
                            contextHtml: PF.ui.t('compare.context.attachmentRight')
                        }));
                    }
                }

                block.appendChild(list);
                sec.appendChild(block);
            }
            body.appendChild(sec);
        }

        // === Переходы только в образце ===
        addSection(PF.ui.t('compare.section.transitionsOnlyInOther'),
            diff.transitions.onlyInOther.length, '—', (list) => {
                for (const t of diff.transitions.onlyInOther) {
                    list.appendChild(renderAction({
                        kind: 'addTransition',
                        payload: { name: t.name },
                        enabled: true,
                        verbKind: 'add',
                        verbLabel: PF.ui.t('compare.verb.add'),
                        objHtml: PF.ui.t('compare.object.transition', {
                            label: labelFor(t.name, 'transition')
                        }),
                        detailHtml: '<span class="cmp-hint">(' + escHtml(t.from) + ' → ' + escHtml(t.to) + ')</span>',
                        contextHtml: PF.ui.t('compare.context.transitionObject')
                    }));
                }
            });

        // === Переходы только в текущем ===
        addSection(PF.ui.t('compare.section.transitionsOnlyInCurrent'),
            diff.transitions.onlyInCurrent.length, '—', (list) => {
                for (const t of diff.transitions.onlyInCurrent) {
                    list.appendChild(renderAction({
                        kind: 'removeTransition',
                        payload: { name: t.name },
                        enabled: true,
                        verbKind: 'remove',
                        verbLabel: PF.ui.t('compare.verb.remove'),
                        objHtml: PF.ui.t('compare.object.transition', {
                            label: labelFor(t.name, 'transition')
                        }),
                        detailHtml: '<span class="cmp-hint">(' + escHtml(t.from) + ' → ' + escHtml(t.to) + ')</span>',
                        contextHtml: PF.ui.t('compare.context.transitionObject')
                    }));
                }
            });

        // === Переходы: различия ===
        if (diff.transitions.differing.length) {
            const sec = document.createElement('section');
            sec.className = 'cmp-section';
            const h = document.createElement('h3');
            h.className = 'cmp-section-title';
            h.textContent = PF.ui.t('compare.section.transitionsDiffering') + ' (' + diff.transitions.differing.length + ')';
            sec.appendChild(h);

            for (const t of diff.transitions.differing) {
                const block = document.createElement('div');
                block.className = 'cmp-object-block';

                const objHead = document.createElement('div');
                objHead.className = 'cmp-object-head';
                objHead.innerHTML = PF.ui.t('compare.object.transition', {
                    label: labelFor(t.name, 'transition')
                });
                block.appendChild(objHead);

                const list = document.createElement('div');
                list.className = 'cmp-action-list';

                if (t.from) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionFrom',
                        payload: { name: t.name, value: t.from.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: PF.ui.t('compare.verb.change'), objHtml: 'from',
                        detailHtml: '<code>' + escHtml(t.from.current) + '</code> → <code>' + escHtml(t.from.other) + '</code>',
                        contextHtml: PF.ui.t('compare.context.transitionProperty')
                    }));
                }
                if (t.to) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionTo',
                        payload: { name: t.name, value: t.to.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: PF.ui.t('compare.verb.change'), objHtml: 'to',
                        detailHtml: '<code>' + escHtml(t.to.current) + '</code> → <code>' + escHtml(t.to.other) + '</code>',
                        contextHtml: PF.ui.t('compare.context.transitionProperty')
                    }));
                }
                if (t.actionToRunBefore) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionAction',
                        payload: { name: t.name, value: t.actionToRunBefore.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: PF.ui.t('compare.verb.change'), objHtml: 'actionToRunBefore',
                        detailHtml: '<code>' + escHtml(t.actionToRunBefore.current || '—') +
                            '</code> → <code>' + escHtml(t.actionToRunBefore.other || '—') + '</code>',
                        contextHtml: PF.ui.t('compare.context.transitionProperty')
                    }));
                }
                if (t.serverSideEvents) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionServerSide',
                        payload: { name: t.name, value: !!t.serverSideEvents.other },
                        enabled: true,
                        verbKind: t.serverSideEvents.other ? 'add' : 'remove',
                        verbLabel: PF.ui.t(t.serverSideEvents.other ? 'compare.verb.enable' : 'compare.verb.disable'),
                        objHtml: 'serverSideEvents',
                        detailHtml: '<code>' + escHtml(String(t.serverSideEvents.current)) +
                            '</code> → <code>' + escHtml(String(t.serverSideEvents.other)) + '</code>',
                        contextHtml: PF.ui.t('compare.context.transitionProperty')
                    }));
                }
                if (t.allowOnValidationErrors) {
                    list.appendChild(renderAction({
                        kind: 'changeTransitionAOVE',
                        payload: { name: t.name, value: t.allowOnValidationErrors.other },
                        enabled: true,
                        verbKind: 'change', verbLabel: PF.ui.t('compare.verb.change'), objHtml: 'allowOnValidationErrors',
                        detailHtml: '<code>' + escHtml(JSON.stringify(t.allowOnValidationErrors.current)) +
                            '</code> → <code>' + escHtml(JSON.stringify(t.allowOnValidationErrors.other)) + '</code>',
                        contextHtml: PF.ui.t('compare.context.transitionProperty')
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
            if (addCount) lines.push(PF.ui.t('compare.apply.line.add', { n: String(addCount) }));
            if (removeCount) lines.push(PF.ui.t('compare.apply.line.remove', { n: String(removeCount) }));
            if (changeCount) lines.push(PF.ui.t('compare.apply.line.change', { n: String(changeCount) }));

            const warn = removeCount > 0 ? PF.ui.t('compare.apply.warnRemove') : '';

            const ok = await PF.utils.showConfirm(
                PF.ui.t('compare.apply.confirm', { lines: lines.join('\n'), warn }),
                PF.ui.t('compare.apply.title')
            );
            if (!ok) return;

            const selected = selectedActions.map(a => ({ kind: a.kind, payload: a.payload }));

            applyBtn.disabled = true;
            applyBtn.textContent = PF.ui.t('compare.btn.applying');
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
            PF.utils.showAlert(msg.error || PF.ui.t('compare.error.generic'), PF.ui.t('compare.error.title'));
            return;
        }

        if (msg.type === 'applyCompareResult') {
            const backdrop = document.querySelector('.compare-diff-modal');
            const parent = backdrop ? backdrop.closest('.modal-backdrop') : null;

            if (!msg.ok) {
                // Отмену на сервере не считаем ошибкой — молча восстанавливаем.
                // Сравнение с русской строкой — временно, до 3c, где сервер начнёт
                // возвращать код причины, а не текст.
                if (msg.error !== 'Отменено пользователем.') {
                    PF.utils.showAlert(
                        msg.error || PF.ui.t('compare.apply.error'),
                        PF.ui.t('compare.error.title')
                    );
                }
                if (backdrop) {
                    const btn = backdrop.querySelector('[data-act="apply"]');
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = PF.ui.t('compare.diff.apply');
                    }
                }
                return;
            }

            const warnings = msg.warnings || [];
            const warningsText = warnings.length
                ? PF.ui.t('compare.apply.done.warnings', {
                    list: warnings.map(w => '• ' + w).join('\n')
                })
                : '';

            const text = PF.ui.t('compare.apply.done', {
                n: String(msg.applied),
                warnings: warningsText
            });

            PF.utils.showAlert(text, PF.ui.t('compare.apply.done.title')).then(() => {
                if (parent) parent.remove();
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