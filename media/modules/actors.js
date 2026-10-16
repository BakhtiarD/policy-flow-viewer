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
            td.textContent = 'Нет акторов';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        const allStates = (PF.state.meta && PF.state.meta.states) || [];
        const stateTrans = (PF.state.meta && PF.state.meta.translations &&
            PF.state.meta.translations.stateTrans) || {};

        for (const actor of actors) {
            const tr = document.createElement('tr');

            // --- Актор ---
            const tdActor = document.createElement('td');
            tdActor.className = 'actors-cell-actor';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'actors-actor-name';
            nameSpan.textContent = actor;
            tdActor.appendChild(nameSpan);

            const renActor = document.createElement('button');
            renActor.className = 'secondary small';
            renActor.textContent = '✎';
            renActor.title = 'Переименовать актора';
            renActor.dataset.act = 'rename-actor';
            renActor.dataset.actor = actor;
            tdActor.appendChild(renActor);

            const authActor = document.createElement('button');
            authActor.className = 'secondary small';
            authActor.textContent = '🔑';
            authActor.title = 'Авторизация актора (роли)';
            authActor.dataset.act = 'edit-actor-auth';
            authActor.dataset.actor = actor;
            tdActor.appendChild(authActor);

            const dupActor = document.createElement('button');
            dupActor.className = 'secondary small';
            dupActor.textContent = '⧉';
            dupActor.title = 'Скопировать актора (новая строка с тем же набором прав)';
            dupActor.dataset.act = 'dup-actor';
            dupActor.dataset.actor = actor;
            tdActor.appendChild(dupActor);

            const delActor = document.createElement('button');
            delActor.className = 'danger small';
            delActor.textContent = '×';
            delActor.title = 'Удалить актора из всех состояний';
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
                chip.title = 'Редактировать права актора в этом состоянии';

                const ru = stateTrans[st];
                const labelSpan = document.createElement('span');
                labelSpan.className = 'actors-chip-label';
                labelSpan.textContent = st + (ru && ru !== st ? ' (' + ru + ')' : '');
                chip.appendChild(labelSpan);

                const chipDel = document.createElement('span');
                chipDel.className = 'actors-chip-del';
                chipDel.textContent = '×';
                chipDel.title = 'Убрать актора из этого состояния';
                chipDel.dataset.act = 'del-state-from-actor';
                chipDel.dataset.actor = actor;
                chipDel.dataset.state = st;
                chip.appendChild(chipDel);

                statesWrap.appendChild(chip);
            }

            const addStateBtn = document.createElement('button');
            addStateBtn.className = 'secondary small actors-add';
            addStateBtn.textContent = '＋ Состояние';
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

            const transTrans = (PF.state.meta && PF.state.meta.translations &&
                PF.state.meta.translations.transTrans) || {};

            const transSet = transitionsByActor[actor] || new Set();
            const transList = [...transSet].sort();

            for (const tName of transList) {
                const tRu = transTrans[tName];
                const chip = document.createElement('span');
                chip.className = 'actors-chip';
                chip.dataset.act = 'open-transition';
                chip.dataset.transition = tName;
                chip.title = 'Открыть переход' + (tRu && tRu !== tName ? ' — ' + tRu : '');

                const labelSpan = document.createElement('span');
                labelSpan.className = 'actors-chip-label';
                labelSpan.textContent = tName + (tRu && tRu !== tName ? ' (' + tRu + ')' : '');
                chip.appendChild(labelSpan);

                const chipDel = document.createElement('span');
                chipDel.className = 'actors-chip-del';
                chipDel.textContent = '×';
                chipDel.title = 'Убрать переход у актора';
                chipDel.dataset.act = 'del-transition-from-actor';
                chipDel.dataset.actor = actor;
                chipDel.dataset.transition = tName;
                chip.appendChild(chipDel);

                transWrap.appendChild(chip);
            }

            const addTransBtn = document.createElement('button');
            addTransBtn.className = 'secondary small actors-add';
            addTransBtn.textContent = '＋ Переход';
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
        addActorBtn.textContent = '＋ Добавить актора';
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
            cancelBtn.textContent = 'Отмена';
            const okBtn = document.createElement('button');
            okBtn.textContent = 'OK';
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
        const name = await PF.utils.showPrompt('Имя нового актора', '');
        if (!name) return;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
            PF.utils.showAlert('Некорректное имя актора: ' + name);
            return;
        }
        PF.vscode.postMessage({ type: 'addActor', payload: { name } });
    }

    async function onRenameActor(oldName) {
        const newName = await PF.utils.showPrompt('Новое имя актора', oldName);
        if (!newName) return;
        if (newName === oldName) return;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
            PF.utils.showAlert('Некорректное имя актора: ' + newName);
            return;
        }
        const ok = await PF.utils.showConfirm(
            'Переименовать актора «' + oldName + '» в «' + newName + '»?\n\n' +
            'Будут обновлены:\n' +
            '  • documentFlow.json → actors[]\n' +
            '  • configuration.json → states[].actors[].actor\n' +
            '  • translation.csv (ItemType=actors)\n' +
            '  • authorization.csv (AssignedPermission)',
            'Переименование актора'
        );
        if (!ok) return;
        PF.vscode.postMessage({
            type: 'renameActor',
            payload: { oldName, newName }
        });
    }

    async function onDupActor(oldName) {
        const newName = await PF.utils.showPrompt(
            'Новое имя актора (копия «' + oldName + '»)',
            oldName + 'Copy'
        );
        if (!newName) return;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
            PF.utils.showAlert('Некорректное имя актора: ' + newName);
            return;
        }
        if (newName === oldName) {
            PF.utils.showAlert('Имя совпадает с исходным.');
            return;
        }
        const ok = await PF.utils.showConfirm(
            'Создать актора «' + newName + '» как копию «' + oldName + '»?\n\n' +
            'Новый актор получит те же записи во всех состояниях, где был ' + oldName + '.\n' +
            'Будут изменены configuration.json и documentFlow.json.',
            'Копирование актора'
        );
        if (!ok) return;
        PF.vscode.postMessage({
            type: 'duplicateActor',
            payload: { oldName, newName }
        });
    }

    async function onDelActor(actor) {
        const ok = await PF.utils.showConfirm(
            'Удалить актора «' + actor + '» из всех состояний и из documentFlow.json?',
            'Удаление актора'
        );
        if (!ok) return;
        PF.vscode.postMessage({ type: 'deleteActor', payload: { name: actor } });
    }

    async function onAddStateToActor(actor) {
        const statesByActor = collectStatesByActor();
        const used = new Set(statesByActor[actor] || []);
        const allStates = (PF.state.meta && PF.state.meta.states) || [];
        const stateTrans = (PF.state.meta && PF.state.meta.translations &&
            PF.state.meta.translations.stateTrans) || {};
        const options = allStates
            .filter(s => !used.has(s))
            .map(s => ({ value: s, label: s + (stateTrans[s] && stateTrans[s] !== s ? ' (' + stateTrans[s] + ')' : '') }));
        if (!options.length) {
            PF.utils.showAlert('Не осталось состояний, куда можно добавить актора.');
            return;
        }
        const picked = await pickFromList('Добавить актора в состояние', options);
        if (!picked) return;
        PF.vscode.postMessage({ type: 'addStateToActor', payload: { actor, state: picked } });
    }

    async function onDelStateFromActor(actor, state) {
        const ok = await PF.utils.showConfirm(
            'Убрать актора «' + actor + '» из состояния «' + state + '»?\n\n' +
            'Будут удалены все его права в этом состоянии.',
            'Удаление'
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
            .map(t => ({
                value: t.name,
                label: t.name + ' [' + t.from + ' → ' + t.to + ']' +
                    (t.ru && t.ru !== t.name ? ' (' + t.ru + ')' : '')
            }));
        if (!options.length) {
            PF.utils.showAlert('Не осталось переходов, которые можно добавить.');
            return;
        }
        const picked = await pickFromList('Добавить переход актору', options);
        if (!picked) return;
        PF.vscode.postMessage({
            type: 'addTransitionToActor',
            payload: { actor, transition: picked }
        });
    }

    async function onDelTransitionFromActor(actor, transition) {
        const ok = await PF.utils.showConfirm(
            'Убрать переход «' + transition + '» у актора «' + actor + '»?',
            'Удаление перехода'
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

        const outgoing = (det.outgoing || []).map(t => ({ name: t.name, ru: t.ru || '' }));

        const container = document.getElementById('modalContainer');
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const h = document.createElement('h2');
        h.textContent = 'Права «' + actor + '» в «' + stateName + '»';
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
                PF.utils.showAlert('Права не заполнены.');
                return;
            }
            const p = perms[0];
            // Восстанавливаем имя актора — collectPermissions берёт его из селекта,
            // который мы скрыли, но не убрали; селект содержит актора.
            p.actor = actor;

            const ok = await PF.utils.showConfirm(
                'Сохранить права «' + actor + '» в состоянии «' + stateName + '»?\n\n' +
                'Будет изменён configuration.json.',
                'Сохранение прав'
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
        h.textContent = 'Авторизация «' + actor + '»';
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
                emptyOpt.textContent = '— не выбрано —';
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
                del.title = 'Убрать роль';
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
            addBtn.textContent = '＋ Добавить роль';
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
            const roles = [...new Set(localRoles.filter(Boolean))].sort();

            const added = roles.filter(r => !actorRoles.includes(r));
            const removed = actorRoles.filter(r => !roles.includes(r));

            if (!added.length && !removed.length) {
                backdrop.remove();
                return;
            }

            const lines = ['Актор: ' + actor, '', 'Будет изменён authorization.csv:', ''];
            if (added.length) lines.push('  + ' + added.join(', '));
            if (removed.length) lines.push('  − ' + removed.join(', '));
            if (!added.length && !removed.length) lines.push('  (без изменений)');

            const ok = await PF.utils.showConfirm(lines.join('\n'), 'Сохранение авторизации');
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