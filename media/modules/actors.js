(function () {
    'use strict';

    window.PF = window.PF || {};

    /* ---------- сбор данных ---------- */

    function collectActors() {
        const set = new Set();
        const meta = PF.state.meta || {};
        for (const a of (meta.actors || [])) if (a) set.add(a);
        for (const r of (PF.state.DATA && PF.state.DATA.rows) || []) {
            for (const p of (r.perms || [])) if (p.actor) set.add(p.actor);
        }
        return [...set].sort((a, b) => a.localeCompare(b));
    }

    // { stateName → Set(actor) }
    function collectStatesByActor() {
        const map = {};
        for (const r of (PF.state.DATA && PF.state.DATA.rows) || []) {
            for (const p of (r.perms || [])) {
                if (!p.actor) continue;
                if (!map[p.actor]) map[p.actor] = [];
                map[p.actor].push(r.stateName);
            }
        }
        for (const a of Object.keys(map)) map[a].sort();
        return map;
    }

    // { actor → Set(transitionName) } — плоский union по всем состояниям
    function collectTransitionsByActor() {
        const map = {};
        for (const r of (PF.state.DATA && PF.state.DATA.rows) || []) {
            for (const p of (r.perms || [])) {
                if (!p.actor) continue;
                if (!map[p.actor]) map[p.actor] = new Set();
                for (const t of (p.transitions || [])) {
                    const n = (typeof t === 'string') ? t : (t && t.name);
                    if (n) map[p.actor].add(n);
                }
            }
        }
        return map;
    }

    /* ---------- утилиты ---------- */

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ---------- рендер ---------- */

    function render() {
        const view = document.getElementById('actorsView');
        if (!view) return;

        const tbody = view.querySelector('tbody');
        tbody.innerHTML = '';

        const actors = collectActors();
        const statesByActor = collectStatesByActor();
        const transitionsByActor = collectTransitionsByActor();

        if (!actors.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3;
            td.className = 'actors-empty';
            td.textContent = PF.ui.t('actors.empty');
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        const allStates = (PF.state.meta && PF.state.meta.states) || [];
        const trs = (PF.state.meta && PF.state.meta.translations) || {};
        const stateTrans = trs.stateTrans || {};
        const stateTransAll = trs.stateTransAll || {};
        const transTrans = trs.transTrans || {};
        const transTransAll = trs.transTransAll || {};
        const actorTrans = trs.actorTrans || {};
        const actorTransAll = trs.actorTransAll || {};

        for (const actor of actors) {
            const tr = document.createElement('tr');

            // --- Актор ---
            const tdActor = document.createElement('td');
            tdActor.className = 'actors-cell-actor';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'actors-actor-name';
            nameSpan.textContent = PF.i18n.label(actor, {
                trans: actorTransAll[actor],
                ru: actorTrans[actor]
            });
            tdActor.appendChild(nameSpan);

            const renActor = document.createElement('button');
            renActor.className = 'secondary small';
            renActor.textContent = '✎';
            renActor.title = PF.ui.t('actors.btn.rename.tooltip');
            renActor.dataset.act = 'rename-actor';
            renActor.dataset.actor = actor;
            tdActor.appendChild(renActor);

            const authActor = document.createElement('button');
            authActor.className = 'secondary small';
            authActor.textContent = '🔑';
            authActor.title = PF.ui.t('actors.btn.auth.tooltip');
            authActor.dataset.act = 'edit-actor-auth';
            authActor.dataset.actor = actor;
            tdActor.appendChild(authActor);

            const dupActor = document.createElement('button');
            dupActor.className = 'secondary small';
            dupActor.textContent = '⧉';
            dupActor.title = PF.ui.t('actors.btn.dup.tooltip');
            dupActor.dataset.act = 'dup-actor';
            dupActor.dataset.actor = actor;
            tdActor.appendChild(dupActor);

            const delActor = document.createElement('button');
            delActor.className = 'danger small';
            delActor.textContent = '×';
            delActor.title = PF.ui.t('actors.btn.del.tooltip');
            delActor.dataset.act = 'del-actor';
            delActor.dataset.actor = actor;
            tdActor.appendChild(delActor);
            tr.appendChild(tdActor);

            // --- Состояния ---
            const tdStates = document.createElement('td');
            tdStates.className = 'actors-cell-states';
            const statesList = statesByActor[actor] || [];
            const statesWrap = document.createElement('div');
            statesWrap.className = 'actors-chip-list';

            for (const st of statesList) {
                const chip = document.createElement('span');
                chip.className = 'actors-chip';
                chip.dataset.act = 'edit-state-perm';
                chip.dataset.actor = actor;
                chip.dataset.state = st;
                chip.title = PF.ui.t('actors.chip.state.tooltip');

                const labelSpan = document.createElement('span');
                labelSpan.className = 'actors-chip-label';
                labelSpan.textContent = PF.i18n.label(st, {
                    trans: stateTransAll[st],
                    ru: stateTrans[st]
                });
                chip.appendChild(labelSpan);

                const chipDel = document.createElement('span');
                chipDel.className = 'actors-chip-del';
                chipDel.textContent = '×';
                chipDel.title = PF.ui.t('actors.chip.state.delete.tooltip');
                chipDel.dataset.act = 'del-state-from-actor';
                chipDel.dataset.actor = actor;
                chipDel.dataset.state = st;
                chip.appendChild(chipDel);

                statesWrap.appendChild(chip);
            }

            const addStateBtn = document.createElement('button');
            addStateBtn.className = 'secondary small actors-add';
            addStateBtn.textContent = PF.ui.t('actors.btn.addState');
            addStateBtn.dataset.act = 'add-state-to-actor';
            addStateBtn.dataset.actor = actor;
            addStateBtn.disabled = statesList.length >= allStates.length;
            statesWrap.appendChild(addStateBtn);

            tdStates.appendChild(statesWrap);
            tr.appendChild(tdStates);

            // --- Переходы ---
            const tdTrans = document.createElement('td');
            tdTrans.className = 'actors-cell-transitions';
            const transWrap = document.createElement('div');
            transWrap.className = 'actors-chip-list';

            const transSet = transitionsByActor[actor] || new Set();
            const transList = [...transSet].sort();

            for (const tName of transList) {
                const tLabel = PF.i18n.label(tName, {
                    trans: transTransAll[tName],
                    ru: transTrans[tName]
                });
                const chip = document.createElement('span');
                chip.className = 'actors-chip';
                chip.dataset.act = 'open-transition';
                chip.dataset.transition = tName;
                chip.title = PF.ui.t('actors.chip.transition.tooltipWithRu', { ru: tLabel });

                const labelSpan = document.createElement('span');
                labelSpan.className = 'actors-chip-label';
                labelSpan.textContent = tLabel;
                chip.appendChild(labelSpan);

                const chipDel = document.createElement('span');
                chipDel.className = 'actors-chip-del';
                chipDel.textContent = '×';
                chipDel.title = PF.ui.t('actors.chip.transition.delete.tooltip');
                chipDel.dataset.act = 'del-transition-from-actor';
                chipDel.dataset.actor = actor;
                chipDel.dataset.transition = tName;
                chip.appendChild(chipDel);

                transWrap.appendChild(chip);
            }

            const addTransBtn = document.createElement('button');
            addTransBtn.className = 'secondary small actors-add';
            addTransBtn.textContent = PF.ui.t('actors.btn.addTransition');
            addTransBtn.dataset.act = 'add-transition-to-actor';
            addTransBtn.dataset.actor = actor;
            transWrap.appendChild(addTransBtn);

            tdTrans.appendChild(transWrap);
            tr.appendChild(tdTrans);

            tbody.appendChild(tr);
        }

        // --- футер: добавить актора ---
        const trAdd = document.createElement('tr');
        trAdd.className = 'actors-add-row';
        const tdAdd = document.createElement('td');
        tdAdd.colSpan = 3;
        const addActorBtn = document.createElement('button');
        addActorBtn.className = 'secondary small';
        addActorBtn.textContent = PF.ui.t('actors.btn.addActor');
        addActorBtn.dataset.act = 'add-actor';
        tdAdd.appendChild(addActorBtn);
        trAdd.appendChild(tdAdd);
        tbody.appendChild(trAdd);
    }

    /* ---------- диалоги ---------- */

    function pickFromList(title, items) {
        // items: [{ value, label }]
        return new Promise((resolve) => {
            const container = document.getElementById('modalContainer');
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop dialog-backdrop';
            const modal = document.createElement('div');
            modal.className = 'modal dialog';

            const h = document.createElement('h2');
            h.className = 'dlg-title';
            h.textContent = title;
            modal.appendChild(h);

            const row = document.createElement('div');
            row.className = 'form-row';
            const sel = document.createElement('select');
            for (const it of items) {
                const opt = document.createElement('option');
                opt.value = it.value;
                opt.textContent = it.label;
                sel.appendChild(opt);
            }
            row.appendChild(sel);
            modal.appendChild(row);

            const actions = document.createElement('div');
            actions.className = 'actions';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'secondary';
            cancelBtn.textContent = PF.ui.t('common.cancel');
            const okBtn = document.createElement('button');
            okBtn.textContent = PF.ui.t('common.ok');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            modal.appendChild(actions);
            backdrop.appendChild(modal);
            container.appendChild(backdrop);

            function close(result) { backdrop.remove(); resolve(result); }
            cancelBtn.addEventListener('click', () => close(null));
            okBtn.addEventListener('click', () => close(sel.value));
        });
    }

    async function onAddActor() {
        const name = await PF.utils.showPrompt(PF.ui.t('actors.add.prompt'), '');
        if (!name) return;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
            PF.utils.showAlert(PF.ui.t('actors.add.invalid', { name }));
            return;
        }
        PF.vscode.postMessage({ type: 'addActor', payload: { name } });
    }

    async function onRenameActor(oldName) {
        const newName = await PF.utils.showPrompt(PF.ui.t('actors.rename.prompt'), oldName);
        if (!newName) return;
        if (newName === oldName) return;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
            PF.utils.showAlert(PF.ui.t('actors.add.invalid', { name: newName }));
            return;
        }
        const ok = await PF.utils.showConfirm(
            PF.ui.t('actors.rename.confirm', { old: oldName, new: newName }),
            PF.ui.t('actors.rename.title')
        );
        if (!ok) return;
        PF.vscode.postMessage({
            type: 'renameActor',
            payload: { oldName, newName }
        });
    }

    async function onDupActor(oldName) {
        const newName = await PF.utils.showPrompt(
            PF.ui.t('actors.dup.prompt', { old: oldName }),
            oldName + 'Copy'
        );
        if (!newName) return;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
            PF.utils.showAlert(PF.ui.t('actors.add.invalid', { name: newName }));
            return;
        }
        if (newName === oldName) {
            PF.utils.showAlert(PF.ui.t('actors.dup.same'));
            return;
        }
        const ok = await PF.utils.showConfirm(
            PF.ui.t('actors.dup.confirm', { old: oldName, new: newName }),
            PF.ui.t('actors.dup.title')
        );
        if (!ok) return;
        PF.vscode.postMessage({
            type: 'duplicateActor',
            payload: { oldName, newName }
        });
    }

    async function onDelActor(actor) {
        const ok = await PF.utils.showConfirm(
            PF.ui.t('actors.del.confirm', { name: actor }),
            PF.ui.t('actors.del.title')
        );
        if (!ok) return;
        PF.vscode.postMessage({ type: 'deleteActor', payload: { name: actor } });
    }

    async function onAddStateToActor(actor) {
        const statesByActor = collectStatesByActor();
        const used = new Set(statesByActor[actor] || []);
        const allStates = (PF.state.meta && PF.state.meta.states) || [];
        const trs = (PF.state.meta && PF.state.meta.translations) || {};
        const stateTrans = trs.stateTrans || {};
        const stateTransAll = trs.stateTransAll || {};
        const options = allStates
            .filter(s => !used.has(s))
            .map(s => ({
                value: s,
                label: PF.i18n.label(s, { trans: stateTransAll[s], ru: stateTrans[s] })
            }));
        if (!options.length) {
            PF.utils.showAlert(PF.ui.t('actors.addState.empty'));
            return;
        }
        const picked = await pickFromList(PF.ui.t('actors.addState.title'), options);
        if (!picked) return;
        PF.vscode.postMessage({ type: 'addStateToActor', payload: { actor, state: picked } });
    }

    async function onDelStateFromActor(actor, state) {
        const ok = await PF.utils.showConfirm(
            PF.ui.t('actors.delState.confirm', { actor, state }),
            PF.ui.t('actors.delState.title')
        );
        if (!ok) return;
        PF.vscode.postMessage({ type: 'deleteStateFromActor', payload: { actor, state } });
    }

    async function onAddTransitionToActor(actor) {
        const map = collectTransitionsByActor();
        const used = map[actor] || new Set();
        const transitions = (PF.state.graphData && PF.state.graphData.transitions) || [];
        const options = transitions
            .filter(t => !used.has(t.name))
            .map(t => {
                const trLabel = PF.i18n.tr({ trans: t.trans, ru: t.ru });
                return {
                    value: t.name,
                    label: t.name + ' [' + t.from + ' → ' + t.to + ']' +
                        (trLabel ? ' (' + trLabel + ')' : '')
                };
            });
        if (!options.length) {
            PF.utils.showAlert(PF.ui.t('actors.addTransition.empty'));
            return;
        }
        const picked = await pickFromList(PF.ui.t('actors.addTransition.title'), options);
        if (!picked) return;
        PF.vscode.postMessage({
            type: 'addTransitionToActor',
            payload: { actor, transition: picked }
        });
    }

    async function onDelTransitionFromActor(actor, transition) {
        const ok = await PF.utils.showConfirm(
            PF.ui.t('actors.delTransition.confirm', { actor, transition }),
            PF.ui.t('actors.delTransition.title')
        );
        if (!ok) return;
        PF.vscode.postMessage({
            type: 'deleteTransitionFromActor',
            payload: { actor, transition }
        });
    }

    /* ---------- модалка прав актора в состоянии ---------- */

    function openStatePermForm(actor, stateName) {
        const det = PF.state.stateDetails[stateName];
        if (!det) { PF.utils.showAlert('Нет данных для состояния ' + stateName); return; }
        const perm = (det.permissions || []).find(p => p.actor === actor);
        if (!perm) { PF.utils.showAlert('Нет прав актора ' + actor + ' в ' + stateName); return; }

        const outgoing = (det.outgoing || []).map(t => ({
            name: t.name,
            to: t.to,
            ru: t.ru || '',
            trans: t.trans || {}
        }));

        const container = document.getElementById('modalContainer');
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const trs = (PF.state.meta && PF.state.meta.translations) || {};
        const actorTransAll = trs.actorTransAll || {};
        const actorTrans = trs.actorTrans || {};
        const actorLabel = PF.i18n.label(actor, {
            trans: actorTransAll[actor],
            ru: actorTrans[actor]
        });

        const h = document.createElement('h2');
        h.textContent = PF.ui.t('actors.perm.title', { actor, state: stateName });
        modal.appendChild(h);

        const card = PF.forms.buildPermissionCard(perm, () => outgoing);
        // Скрываем поле выбора актора и кнопку «удалить»
        const actorRow = card.querySelector('.f-actor')?.closest('.form-row');
        if (actorRow) actorRow.style.display = 'none';
        const rmBtn = card.querySelector('[data-remove]');
        if (rmBtn) rmBtn.style.display = 'none';

        modal.appendChild(card);

        const actions = document.createElement('div');
        actions.className = 'actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'secondary';
        cancelBtn.textContent = 'Отмена';
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Сохранить';
        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        modal.appendChild(actions);

        backdrop.appendChild(modal);
        container.appendChild(backdrop);

        cancelBtn.addEventListener('click', () => backdrop.remove());
        saveBtn.addEventListener('click', async () => {
            const list = document.createElement('div');
            list.appendChild(card);

            const perms = PF.forms.collectPermissions(list);
            if (!perms.length) {
                PF.utils.showAlert(PF.ui.t('actors.perm.empty'));
                return;
            }
            const p = perms[0];
            // Восстанавливаем имя актора — collectPermissions берёт его из селекта,
            // который мы скрыли, но не убрали; селект содержит актора.
            p.actor = actor;

            const ok = await PF.utils.showConfirm(
                PF.ui.t('actors.perm.confirm', { actor, state: stateName }),
                PF.ui.t('actors.perm.confirm.title')
            );
            if (!ok) return;

            PF.vscode.postMessage({
                type: 'editActorPerm',
                payload: { stateName, actorName: actor, perm: p }
            });
            backdrop.remove();
        });
    }

    /* ---------- обработчики ---------- */

    /* ---------- модалка авторизации актора ---------- */

    function openActorAuthForm(actor) {
        const auth = (PF.state.DATA && PF.state.DATA.auth) || {};
        if (!auth.found) {
            PF.utils.showAlert(
                'Файл authorization.csv не найден.\n\n' +
                'Ожидаемый путь: <папка-пакета>/authorization/authorization.csv',
                'Авторизация — файл не найден'
            );
            return;
        }

        const allRoles = (auth.allRoles || []).slice();
        const actorRoles = ((auth.actorRoles && auth.actorRoles[actor]) || []).slice();

        const container = document.getElementById('modalContainer');
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'modal actor-auth-modal';

        const h = document.createElement('h2');
        h.textContent = PF.ui.t('actors.auth.title', { actor });
        modal.appendChild(h);

        const docHint = document.createElement('div');
        docHint.className = 'hint';
        docHint.textContent = 'Документ: ' + (auth.docName || '—');
        modal.appendChild(docHint);

        const pathEl = document.createElement('div');
        pathEl.className = 'hint';
        pathEl.textContent = auth.path || '';
        pathEl.title = auth.path || '';
        modal.appendChild(pathEl);

        // Контейнер списка выбранных ролей
        const listWrap = document.createElement('div');
        listWrap.className = 'actor-auth-role-list';
        modal.appendChild(listWrap);

        // Локальное состояние — массив выбранных ролей
        let localRoles = actorRoles.slice();

        function renderList() {
            listWrap.innerHTML = '';

            // Если ролей нет — показываем один пустой селект
            if (!localRoles.length) localRoles = [''];

            for (let i = 0; i < localRoles.length; i++) {
                const row = document.createElement('div');
                row.className = 'actor-auth-role-row';

                const sel = document.createElement('select');
                sel.className = 'actor-auth-role-select';

                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = PF.ui.t('actors.auth.notSelected');
                sel.appendChild(emptyOpt);

                // Уже выбранные в других строках — не даём выбрать повторно
                const usedElsewhere = new Set(
                    localRoles.filter((r, idx) => idx !== i && r)
                );

                for (const role of allRoles) {
                    if (usedElsewhere.has(role)) continue;
                    const opt = document.createElement('option');
                    opt.value = role;
                    opt.textContent = role;
                    if (role === localRoles[i]) opt.selected = true;
                    sel.appendChild(opt);
                }
                sel.value = localRoles[i] || '';

                sel.addEventListener('change', () => {
                    localRoles[i] = sel.value;
                    renderList();
                });

                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'danger small';
                del.textContent = '×';
                del.title = PF.ui.t('actors.auth.removeRole');
                del.addEventListener('click', () => {
                    localRoles.splice(i, 1);
                    renderList();
                });

                row.appendChild(sel);
                row.appendChild(del);
                listWrap.appendChild(row);
            }

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'secondary small';
            addBtn.textContent = PF.ui.t('actors.auth.addRole');
            addBtn.style.marginTop = '6px';
            addBtn.disabled = allRoles.length === 0 ||
                localRoles.filter(Boolean).length >= allRoles.length;
            addBtn.addEventListener('click', () => {
                localRoles.push('');
                renderList();
            });
            listWrap.appendChild(addBtn);
        }

        renderList();

        const actions = document.createElement('div');
        actions.className = 'actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'secondary';
        cancelBtn.textContent = PF.ui.t('common.cancel');
        const saveBtn = document.createElement('button');
        saveBtn.textContent = PF.ui.t('common.save');
        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        modal.appendChild(actions);

        backdrop.appendChild(modal);
        container.appendChild(backdrop);

        cancelBtn.addEventListener('click', () => backdrop.remove());
        saveBtn.addEventListener('click', async () => {
            const roles = [...new Set(localRoles.filter(Boolean))].sort();

            const added = roles.filter(r => !actorRoles.includes(r));
            const removed = actorRoles.filter(r => !roles.includes(r));

            if (!added.length && !removed.length) {
                backdrop.remove();
                return;
            }

            const changes = [];
            if (added.length) changes.push(PF.ui.t('actors.auth.confirm.added', { list: added.join(', ') }));
            if (removed.length) changes.push(PF.ui.t('actors.auth.confirm.removed', { list: removed.join(', ') }));
            if (!added.length && !removed.length) changes.push(PF.ui.t('actors.auth.confirm.noChanges'));

            const ok = await PF.utils.showConfirm(
                PF.ui.t('actors.auth.confirm', { actor, changes: changes.join('\n') }),
                PF.ui.t('actors.auth.confirm.title')
            );

            if (!ok) return;

            PF.vscode.postMessage({
                type: 'saveActorAuth',
                payload: { actorName: actor, roles }
            });
            backdrop.remove();
        });
    }

    function attachHandlers() {
        const view = document.getElementById('actorsView');
        if (!view || view.dataset.handlersAttached === '1') return;
        view.dataset.handlersAttached = '1';

        view.addEventListener('click', async (ev) => {
            const t = ev.target.closest('[data-act]');
            if (!t) return;
            const act = t.dataset.act;

            // Крестики имеют приоритет — они внутри чипов
            if (act === 'del-state-from-actor') {
                await onDelStateFromActor(t.dataset.actor, t.dataset.state);
                return;
            }
            if (act === 'del-transition-from-actor') {
                await onDelTransitionFromActor(t.dataset.actor, t.dataset.transition);
                return;
            }

            if (act === 'edit-state-perm') {
                openStatePermForm(t.dataset.actor, t.dataset.state);
                return;
            }

            if (act === 'open-transition') {
                if (typeof PF.forms.openTransitionForm === 'function') {
                    PF.forms.openTransitionForm(t.dataset.transition);
                }
                return;
            }

            if (act === 'add-actor') { await onAddActor(); return; }
            if (act === 'rename-actor') { await onRenameActor(t.dataset.actor); return; }
            if (act === 'edit-actor-auth') { openActorAuthForm(t.dataset.actor); return; }
            if (act === 'dup-actor') { await onDupActor(t.dataset.actor); return; }
            if (act === 'del-actor') { await onDelActor(t.dataset.actor); return; }
            if (act === 'add-state-to-actor') { await onAddStateToActor(t.dataset.actor); return; }
            if (act === 'add-transition-to-actor') {
                await onAddTransitionToActor(t.dataset.actor);
                return;
            }
        });
    }

    PF.actors = {
        render,
        attachHandlers,
        collectActors,
        collectStatesByActor,
        collectTransitionsByActor,
        openStatePermForm,
        openActorAuthForm
    };
})();