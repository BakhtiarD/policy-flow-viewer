(function () {
    'use strict';

    const vscode = PF.vscode;
    const persistState = PF.persistState;

    const dataEl = document.getElementById('policyFlowData');
    if (!dataEl) throw new Error('policyFlowData script tag not found');
    const DATA = JSON.parse(dataEl.textContent);

    // Кладём в PF.state, чтобы другие модули имели к ним доступ
    PF.state.DATA = DATA;
    PF.state.meta = DATA.meta;
    PF.state.stateDetails = DATA.stateDetails;
    PF.state.graphData = JSON.parse(JSON.stringify(DATA.graph || { states: [], transitions: [] }));

    const { showConfirm } = PF.utils;
    const { getRelationsFor, stateHasRelation } = PF.relations;
    const { openEditForm, openTransitionForm } = PF.forms;
    const { openCopyActorForm } = PF.formsOther;
    const { applyViewMode } = PF.toolbar;

    /* ============================================================
     * HELPERS
     * ============================================================ */

    function permKey(stateName, actor) { return stateName + '|' + actor; }

    /* ============================================================
     * TABLE
     * ============================================================ */
    function renderCellGroups(groups) {
        const frag = document.createDocumentFragment();
        if (!groups || !groups.length) {
            const sp = document.createElement('span');
            sp.className = 'empty';
            sp.textContent = '—';
            frag.appendChild(sp);
            return frag;
        }
        for (const g of groups) {
            const div = document.createElement('div');
            div.className = 'group';

            const gs = document.createElement('div');
            gs.className = 'group-state';
            const stName = document.createElement('span');
            stName.className = 'state-name';
            stName.textContent = g.state;
            const stRu = document.createElement('span');
            stRu.className = 'state-ru';
            stRu.textContent = '(' + g.stateRu + ')';
            gs.appendChild(stName);
            gs.appendChild(document.createTextNode(' '));
            gs.appendChild(stRu);
            div.appendChild(gs);

            const ul = document.createElement('ul');
            ul.className = 'group-transitions';
            for (const t of g.transitions) {
                const li = document.createElement('li');
                const tn = document.createElement('span');
                tn.className = 'trans-name clickable';
                tn.dataset.transition = t.name;
                tn.title = 'Открыть переход для редактирования';
                tn.textContent = t.name;
                const tr = document.createElement('span');
                tr.className = 'trans-ru';
                tr.textContent = '(' + t.ru + ')';
                li.appendChild(tn);
                li.appendChild(document.createTextNode(' '));
                li.appendChild(tr);
                ul.appendChild(li);
            }
            div.appendChild(ul);
            frag.appendChild(div);
        }
        return frag;
    }

    function makePermSection(label, contentEl) {
        const sec = document.createElement('div');
        sec.className = 'perm-section';
        const lbl = document.createElement('div');
        lbl.className = 'perm-label ' + label;
        lbl.textContent = label + ':';
        sec.appendChild(lbl);
        if (contentEl) {
            const wrap = document.createElement('div');
            wrap.style.paddingLeft = '18px';
            wrap.appendChild(contentEl);
            sec.appendChild(wrap);
        }
        return sec;
    }

    function makePermSectionList(label, items, fmt) {
        const sec = document.createElement('div');
        sec.className = 'perm-section';
        const lbl = document.createElement('div');
        lbl.className = 'perm-label ' + label;
        lbl.textContent = label + ':';
        sec.appendChild(lbl);
        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'perm-empty';
            empty.textContent = '—';
            sec.appendChild(empty);
            return sec;
        }
        const ul = document.createElement('ul');
        ul.className = 'perm-list';
        for (const it of items) {
            const li = document.createElement('li');
            li.textContent = fmt(it);
            ul.appendChild(li);
        }
        sec.appendChild(ul);
        return sec;
    }

    function renderPerms(perms, stateName) {
        const frag = document.createDocumentFragment();
        if (!perms || !perms.length) {
            const sp = document.createElement('span');
            sp.className = 'empty';
            sp.textContent = '—';
            frag.appendChild(sp);
            return frag;
        }
        for (const p of perms) {
            const key = permKey(stateName, p.actor);
            const expanded = !!PF.state.expandedMap[key];

            const perm = document.createElement('div');
            perm.className = 'perm' + (expanded ? '' : ' collapsed');
            perm.dataset.permKey = key;

            const header = document.createElement('div');
            header.className = 'perm-header';
            header.dataset.toggle = key;
            const toggle = document.createElement('span');
            toggle.className = 'perm-toggle';
            toggle.textContent = '▼';
            const actor = document.createElement('span');
            actor.className = 'perm-actor';
            actor.textContent = p.actor;
            header.appendChild(toggle);
            header.appendChild(actor);

            const actions = document.createElement('span');
            actions.className = 'perm-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'secondary small';
            copyBtn.textContent = '⧉';
            copyBtn.title = 'Копировать актора';
            copyBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                openCopyActorForm(stateName, p.actor);
            });
            actions.appendChild(copyBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'danger small';
            delBtn.textContent = '×';
            delBtn.title = 'Удалить актора из этого состояния';
            delBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const ok = await showConfirm(
                    'Удалить актора «' + p.actor + '» из состояния «' + stateName + '»?\n\n' +
                    'Будет изменён только configuration.json.',
                    'Удаление актора'
                );
                if (!ok) return;
                vscode.postMessage({
                    type: 'deleteActorFromState',
                    payload: { stateName, actorName: p.actor }
                });
            });
            actions.appendChild(delBtn);

            header.appendChild(actions);
            perm.appendChild(header);

            const body = document.createElement('div');
            body.className = 'perm-body';

            const commentsSpan = document.createElement('span');
            if (p.allowComments) {
                commentsSpan.textContent = 'разрешены';
                commentsSpan.style.opacity = '.9';
            } else {
                commentsSpan.textContent = 'запрещены';
                commentsSpan.style.opacity = '.55';
            }
            body.appendChild(makePermSection('comments', commentsSpan));

            const opsFmt = x => {
                const nm = typeof x === 'string' ? x : x.name;
                const ex = (x && x.exclusiveToAssignedUser) ? ' 🔒' : '';
                return nm + ex;
            };
            body.appendChild(makePermSectionList('operations', p.operations || [], opsFmt));

            const transItems = (p.transitions || []).map(t => ({
                kind: 'transition',
                label: t.name + ' (' + t.ru + ')'
            }));

            const rels = getRelationsFor(stateName, p.actor);
            const linkItems = [];

            for (const r of rels) {
                if (r.transitionName) {
                    const tr = (PF.state.graphData.transitions || []).find(x => x.name === r.transitionName);
                    const ru = tr ? (tr.ru || tr.name) : r.transitionName;
                    transItems.push({
                        kind: 'relation',
                        label: r.transitionName + ' (' + ru + ') (relation)'
                    });
                } else {
                    const isCopy = (r.targetDocument === DATA.relations.docName);
                    const title = r.targetDocumentTitle + (isCopy ? ' (копия)' : '');
                    linkItems.push({ kind: 'link', label: title });
                }
            }

            body.appendChild(makePermSectionList('transitions', transItems, x => x.label));

            if (linkItems.length) {
                body.appendChild(makePermSectionList('links', linkItems, x => x.label));
            }

            body.appendChild(makePermSectionList('attachments', p.attachments || [],
                a => a.type + ': [' + a.permissions.join(', ') + ']'));

            perm.appendChild(body);
            frag.appendChild(perm);
        }
        return frag;
    }

    function renderTable() {
        let rows = DATA.rows.slice();
        if (PF.state.sortDir === 1) rows.sort((a, b) => a.stateName.localeCompare(b.stateName));
        if (PF.state.sortDir === -1) rows.sort((a, b) => b.stateName.localeCompare(a.stateName));

        const tbody = document.getElementById('tbody');
        tbody.innerHTML = '';

        for (const r of rows) {
            const tr = document.createElement('tr');

            const tdActions = document.createElement('td');
            const wrap = document.createElement('div');
            wrap.className = 'row-actions';
            const btnEdit = document.createElement('button');
            btnEdit.className = 'secondary small';
            btnEdit.dataset.edit = r.stateName;
            btnEdit.title = 'Редактировать';
            btnEdit.textContent = '✎';
            const btnDel = document.createElement('button');
            btnDel.className = 'danger small';
            btnDel.dataset.del = r.stateName;
            btnDel.title = 'Удалить';
            btnDel.textContent = '×';
            wrap.appendChild(btnEdit);
            wrap.appendChild(btnDel);
            tdActions.appendChild(wrap);
            tr.appendChild(tdActions);

            const tdState = document.createElement('td');
            tdState.className = 'state';
            if (stateHasRelation(r.stateName)) {
                const icon = document.createElement('span');
                icon.className = 'relation-marker';
                icon.textContent = '🔗 ';
                icon.title = 'Из этого состояния доступно создание связанного документа';
                tdState.appendChild(icon);
            }
            tdState.appendChild(document.createTextNode(r.stateLabel));
            tr.appendChild(tdState);

            const tdTerm = document.createElement('td');
            tdTerm.className = 'check-cell';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.term = r.stateName;
            cb.checked = !!(r.flags && r.flags.isTerminal);
            tdTerm.appendChild(cb);
            tr.appendChild(tdTerm);

            const tdIn = document.createElement('td');
            tdIn.appendChild(renderCellGroups(r.incoming));
            tr.appendChild(tdIn);

            const tdOut = document.createElement('td');
            tdOut.appendChild(renderCellGroups(r.outgoing));
            tr.appendChild(tdOut);

            const tdPerm = document.createElement('td');
            tdPerm.className = 'perms';
            tdPerm.appendChild(renderPerms(r.perms, r.stateName));
            tr.appendChild(tdPerm);

            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('button[data-del]').forEach(b => {
            b.addEventListener('click', async () => {
                const s = b.getAttribute('data-del');
                const ok = await showConfirm(
                    'Удалить состояние "' + s + '" со всеми отсылками?\n\n' +
                    'Будут изменены: documentFlow.json, configuration.json, translation.csv,' +
                    ' documentFlow.ui.json',
                    'Удаление состояния'
                );
                if (!ok) return;
                vscode.postMessage({ type: 'deleteState', state: s });
            });
        });
        tbody.querySelectorAll('button[data-edit]').forEach(b => {
            b.addEventListener('click', () => openEditForm(b.getAttribute('data-edit')));
        });
        tbody.querySelectorAll('input[data-term]').forEach(cb => {
            cb.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'toggleTerminal',
                    state: cb.getAttribute('data-term'),
                    value: cb.checked
                });
            });
        });
        tbody.querySelectorAll('.perm-header').forEach(h => {
            h.addEventListener('click', () => {
                const key = h.getAttribute('data-toggle');
                if (PF.state.expandedMap[key]) delete PF.state.expandedMap[key];
                else PF.state.expandedMap[key] = true;
                persistState();
                const perm = h.closest('.perm');
                if (perm) perm.classList.toggle('collapsed', !PF.state.expandedMap[key]);
            });
        });
        tbody.querySelectorAll('.trans-name.clickable').forEach(el => {
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                openTransitionForm(el.dataset.transition);
            });
        });
    }

    function applyAllCollapsed(collapsed) {
        PF.state.expandedMap = {};
        if (!collapsed) {
            for (const r of DATA.rows) {
                for (const p of (r.perms || [])) {
                    PF.state.expandedMap[permKey(r.stateName, p.actor)] = true;
                }
            }
        }
        persistState();
        renderTable();
    }

    function updateSortIndicator() {
        document.getElementById('sortInd').textContent =
            PF.state.sortDir === 0 ? '⇅' : (PF.state.sortDir === 1 ? '↑' : '↓');
    }

    document.getElementById('thState').addEventListener('click', () => {
        PF.state.sortDir = PF.state.sortDir === 0 ? 1 : PF.state.sortDir === 1 ? -1 : 0;
        persistState();
        updateSortIndicator();
        renderTable();
    });

    /* ============================================================
     * BIND
     * ============================================================ */

    // Регистрируем функцию, которую вызывает toolbar.js
    PF.app.applyAllCollapsed = applyAllCollapsed;

    // Привязка кнопок тулбара и графа — в toolbar.js
    PF.toolbar.init();

    // Таблица
    updateSortIndicator();
    renderTable();

    document.getElementById('metaInfo').textContent =
        'состояний: ' + PF.state.meta.states.length +
        ', акторов: ' + PF.state.meta.actors.length;

    // Граф
    PF.routing.rerouteAll();
    applyViewMode();
    PF.render.updateSelectionToolbar();
})();