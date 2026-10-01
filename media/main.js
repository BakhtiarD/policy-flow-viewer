(function () {
    'use strict';

    const vscode = acquireVsCodeApi();

    const dataEl = document.getElementById('policyFlowData');
    if (!dataEl) throw new Error('policyFlowData script tag not found');
    const DATA = JSON.parse(dataEl.textContent);

    const meta = DATA.meta;
    const stateDetails = DATA.stateDetails;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const saved = vscode.getState() || {};
    let sortDir = (typeof saved.sortDir === 'number') ? saved.sortDir : 0;
    let expandedMap = saved.expandedMap || {};
    let viewMode = saved.viewMode || 'table';

    let graphData = JSON.parse(JSON.stringify(DATA.graph || { states: [], transitions: [] }));

    let selectedStates = new Set();
    let selectedTransitions = new Set();

    let viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
    let zoomPercent = 100;
    let layoutRankDir = (saved.layoutRankDir === 'LR') ? 'LR' : 'TB';
    let showTransitionLabels = (saved.showTransitionLabels !== false);
    let toolbarPosition = saved.toolbarPosition || 'top';

    let draftTransition = null;
    let lastContextMenuBlockUntil = 0;

    /* ============================================================
     * ИКОНКИ
     * ============================================================ */
    const ICONS = {
        add: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
        refresh: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 3v3h-3"/></svg>',
        collapse: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4-4 4 4M4 10l4 4 4-4"/></svg>',
        expand: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l4 4 4-4M4 13l4-4 4 4"/></svg>',
        graph: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><path d="M6 4h4M5.4 5.6L6.8 10M10.6 5.6L9.2 10"/></svg>',
        table: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M2 11h12M6 3v10M10 3v10"/></svg>',
        package: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 1.5l6 3v7l-6 3-6-3v-7z"/><path d="M2 4.5l6 3 6-3M8 7.5v7"/></svg>',
        key: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="8" r="3"/><path d="M8 8h6M12 6v4M14 8v2"/></svg>',
        checklist: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4l2 2 3-3M2 10l2 2 3-3M9 4h5M9 10h5"/></svg>',
        link: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 9a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1"/><path d="M9 7a3 3 0 0 0-4 0L3 9a3 3 0 0 0 4 4l1-1"/></svg>',
        gear: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M15 8h-2M3 8H1M13 3l-1.5 1.5M4.5 11.5L3 13M13 13l-1.5-1.5M4.5 4.5L3 3"/></svg>',
        edit: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10 2l4 4-8 8H2v-4z"/></svg>',
        trash: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4M7 7v5M9 7v5"/></svg>',
        save: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 2h8l2 2v10H3z"/><path d="M6 2v4h4V2M6 9h4v5H6z"/></svg>',
        fullscreen: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>',
        layout: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 6h12M6 6v9"/></svg>',
        'arrows-v': '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3"/></svg>',
        'arrows-h': '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h12M5 5L2 8l3 3M11 5l3 3-3 3"/></svg>',
        tag: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 8V2h6l6 6-6 6z"/><circle cx="5" cy="5" r="1" fill="currentColor"/></svg>',
        'layout-top': '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="3" y="3" width="10" height="2" fill="currentColor" stroke="none"/></svg>',
        'layout-bottom': '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="3" y="11" width="10" height="2" fill="currentColor" stroke="none"/></svg>',
        'layout-left': '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="3" y="3" width="2" height="10" fill="currentColor" stroke="none"/></svg>',
        'layout-right': '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="11" y="3" width="2" height="10" fill="currentColor" stroke="none"/></svg>'
    };

    /* ============================================================
     * HELPERS
     * ============================================================ */
    function persistState() {
        vscode.setState({
            sortDir, expandedMap, viewMode, layoutRankDir,
            showTransitionLabels, toolbarPosition
        });
    }

    function permKey(stateName, actor) { return stateName + '|' + actor; }

    function svgEl(tag, attrs) {
        const el = document.createElementNS(SVG_NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }

    function cloneTemplate(id) {
        const tpl = document.getElementById(id);
        if (!tpl) throw new Error('Template not found: ' + id);
        return tpl.content.firstElementChild.cloneNode(true);
    }

    function showAlert(text, title) {
        return new Promise(resolve => {
            const backdrop = cloneTemplate('tpl-alert-modal');
            if (title) backdrop.querySelector('.dlg-title').textContent = title;
            backdrop.querySelector('.dlg-text').textContent = text;
            backdrop.querySelector('[data-act="ok"]').addEventListener('click', () => {
                backdrop.remove();
                resolve();
            });
            document.getElementById('modalContainer').appendChild(backdrop);
        });
    }

    function showConfirm(text, title) {
        return new Promise(resolve => {
            const backdrop = cloneTemplate('tpl-confirm-modal');
            if (title) backdrop.querySelector('.dlg-title').textContent = title;
            backdrop.querySelector('.dlg-text').textContent = text;
            backdrop.querySelector('[data-act="ok"]').addEventListener('click', () => {
                backdrop.remove();
                resolve(true);
            });
            backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => {
                backdrop.remove();
                resolve(false);
            });
            document.getElementById('modalContainer').appendChild(backdrop);
        });
    }

    /* ============================================================
     * RELATIONS
     * ============================================================ */
    const RELATION_TARGET_MAP = {
        'AmendmentAnnulation': 'Annulled',
        'AmendmentTermination': 'Terminated'
    };

    function resolveRelationTransitionName(fromState, targetDocument) {
        const toState = RELATION_TARGET_MAP[targetDocument];
        if (!toState) return null;
        const tr = (graphData.transitions || []).find(
            t => t.from === fromState && t.to === toState
        );
        return tr ? tr.name : null;
    }

    function getRelationsFor(stateName, actorName) {
        const list = (DATA.relations && DATA.relations.relations) || [];
        const result = [];
        for (const rel of list) {
            if (!rel.isMine) continue;
            for (const st of (rel.sourceDocumentStates || [])) {
                if (st.name !== stateName) continue;
                if (!(st.actors || []).includes(actorName)) continue;
                result.push({
                    relationName: rel.name,
                    targetDocument: rel.targetDocument,
                    targetDocumentTitle: rel.targetDocumentTitle || rel.targetDocument,
                    targetState: rel.targetState,
                    transitionName: resolveRelationTransitionName(stateName, rel.targetDocument)
                });
                break;
            }
        }
        return result;
    }

    function stateHasRelation(stateName) {
        const list = (DATA.relations && DATA.relations.relations) || [];
        return list.some(rel =>
            rel.isMine &&
            (rel.sourceDocumentStates || []).some(st => st.name === stateName)
        );
    }

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
            const expanded = !!expandedMap[key];

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
                    const tr = (graphData.transitions || []).find(x => x.name === r.transitionName);
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
        if (sortDir === 1) rows.sort((a, b) => a.stateName.localeCompare(b.stateName));
        if (sortDir === -1) rows.sort((a, b) => b.stateName.localeCompare(a.stateName));

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
                if (expandedMap[key]) delete expandedMap[key];
                else expandedMap[key] = true;
                persistState();
                const perm = h.closest('.perm');
                if (perm) perm.classList.toggle('collapsed', !expandedMap[key]);
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
        expandedMap = {};
        if (!collapsed) {
            for (const r of DATA.rows) {
                for (const p of (r.perms || [])) {
                    expandedMap[permKey(r.stateName, p.actor)] = true;
                }
            }
        }
        persistState();
        renderTable();
    }

    function updateSortIndicator() {
        document.getElementById('sortInd').textContent =
            sortDir === 0 ? '⇅' : (sortDir === 1 ? '↑' : '↓');
    }

    document.getElementById('thState').addEventListener('click', () => {
        sortDir = sortDir === 0 ? 1 : sortDir === 1 ? -1 : 0;
        persistState();
        updateSortIndicator();
        renderTable();
    });
    /* ============================================================
     * GRAPH
     * ============================================================ */
    const BASE_STATE_W = 160;
    const BASE_STATE_H = 50;
    const EDGE_PAD = 10;

    function rectsIntersect(a, b) {
        return !(a.x + a.w < b.x || b.x + b.w < a.x ||
            a.y + a.h < b.y || b.y + b.h < a.y);
    }

    function chooseEdge(fromRect, toRect) {
        const fcx = fromRect.x + fromRect.w / 2;
        const fcy = fromRect.y + fromRect.h / 2;
        const tcx = toRect.x + toRect.w / 2;
        const tcy = toRect.y + toRect.h / 2;
        const dx = tcx - fcx, dy = tcy - fcy;

        const gapX = (dx >= 0)
            ? toRect.x - (fromRect.x + fromRect.w)
            : fromRect.x - (toRect.x + toRect.w);
        const gapY = (dy >= 0)
            ? toRect.y - (fromRect.y + fromRect.h)
            : fromRect.y - (toRect.y + toRect.h);

        const MIN_GAP = 30;

        if (gapX >= MIN_GAP && gapX >= gapY) return dx >= 0 ? 'E' : 'W';
        if (gapY >= MIN_GAP) return dy >= 0 ? 'S' : 'N';
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
        return dy >= 0 ? 'S' : 'N';
    }

    function pointOnEdge(rect, edge, offset) {
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        if (edge === 'E') return { x: rect.x + rect.w, y: cy + offset };
        if (edge === 'W') return { x: rect.x, y: cy + offset };
        if (edge === 'N') return { x: cx + offset, y: rect.y };
        return { x: cx + offset, y: rect.y + rect.h };
    }

    function findNearestEdge(rect, pt) {
        const dTop = Math.abs(pt.y - rect.y);
        const dBottom = Math.abs(pt.y - (rect.y + rect.h));
        const dLeft = Math.abs(pt.x - rect.x);
        const dRight = Math.abs(pt.x - (rect.x + rect.w));

        const min = Math.min(dTop, dBottom, dLeft, dRight);
        if (min === dTop) return 'N';
        if (min === dBottom) return 'S';
        if (min === dLeft) return 'W';
        return 'E';
    }

    function segPerp(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: -dy / len, y: dx / len };
    }

    function findSegmentIndex(waypoints, pt) {
        if (!waypoints || waypoints.length < 2) return -1;
        let best = -1, bestDist = Infinity;
        for (let i = 0; i < waypoints.length - 1; i++) {
            const a = waypoints[i], b = waypoints[i + 1];
            const d = distToSegment(pt, a, b);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    function distToSegment(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 0.0001) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    function snapToEdge(rect, edge, pt) {
        const PAD = 10;
        if (edge === 'N') {
            return {
                x: Math.min(Math.max(pt.x, rect.x + PAD), rect.x + rect.w - PAD),
                y: rect.y
            };
        }
        if (edge === 'S') {
            return {
                x: Math.min(Math.max(pt.x, rect.x + PAD), rect.x + rect.w - PAD),
                y: rect.y + rect.h
            };
        }
        if (edge === 'W') {
            return {
                x: rect.x,
                y: Math.min(Math.max(pt.y, rect.y + PAD), rect.y + rect.h - PAD)
            };
        }
        return {
            x: rect.x + rect.w,
            y: Math.min(Math.max(pt.y, rect.y + PAD), rect.y + rect.h - PAD)
        };
    }

    function simplifyOrtho(pts) {
        const out = [];
        for (const p of pts) {
            const last = out[out.length - 1];
            if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
            out.push({ x: p.x, y: p.y });
        }
        const res = [];
        for (let i = 0; i < out.length; i++) {
            if (i > 0 && i < out.length - 1) {
                const a = out[i - 1], b = out[i], c = out[i + 1];
                if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
                    (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)) continue;
            }
            res.push(out[i]);
        }
        return res;
    }

    function buildRoundedPath(points, radius) {
        if (!points || points.length < 2) return '';
        const R = Math.max(2, radius || 10);
        let d = 'M ' + points[0].x + ' ' + points[0].y;

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const cur = points[i];
            const next = points[i + 1];

            const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
            const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
            if (d1 < 0.5 || d2 < 0.5) continue;

            const rr = Math.min(R, d1 / 2, d2 / 2);

            const start = {
                x: cur.x - (cur.x - prev.x) * (rr / d1),
                y: cur.y - (cur.y - prev.y) * (rr / d1)
            };
            const end = {
                x: cur.x + (next.x - cur.x) * (rr / d2),
                y: cur.y + (next.y - cur.y) * (rr / d2)
            };

            d += ' L ' + start.x + ' ' + start.y;
            d += ' Q ' + cur.x + ' ' + cur.y + ' ' + end.x + ' ' + end.y;
        }

        const last = points[points.length - 1];
        d += ' L ' + last.x + ' ' + last.y;
        return d;
    }

    function computeStubs(p1, p2, startEdge, endEdge) {
        const stub = 18;
        const p1out = { x: p1.x, y: p1.y };
        const p2out = { x: p2.x, y: p2.y };

        if (startEdge === 'E' && p2.x > p1.x + stub) p1out.x = p1.x + stub;
        else if (startEdge === 'W' && p2.x < p1.x - stub) p1out.x = p1.x - stub;
        else if (startEdge === 'S' && p2.y > p1.y + stub) p1out.y = p1.y + stub;
        else if (startEdge === 'N' && p2.y < p1.y - stub) p1out.y = p1.y - stub;

        if (endEdge === 'E' && p1.x > p2.x + stub) p2out.x = p2.x + stub;
        else if (endEdge === 'W' && p1.x < p2.x - stub) p2out.x = p2.x - stub;
        else if (endEdge === 'S' && p1.y > p2.y + stub) p2out.y = p2.y + stub;
        else if (endEdge === 'N' && p1.y < p2.y - stub) p2out.y = p2.y - stub;

        return { p1out, p2out };
    }

    function buildSimpleOrthoMiddle(p1out, p2out, startHoriz, endHoriz) {
        if (startHoriz && endHoriz) {
            const mx = (p1out.x + p2out.x) / 2;
            return [{ x: mx, y: p1out.y }, { x: mx, y: p2out.y }];
        }
        if (!startHoriz && !endHoriz) {
            const my = (p1out.y + p2out.y) / 2;
            return [{ x: p1out.x, y: my }, { x: p2out.x, y: my }];
        }
        if (startHoriz && !endHoriz) {
            return [{ x: p2out.x, y: p1out.y }];
        }
        return [{ x: p1out.x, y: p2out.y }];
    }

    function segmentHitsRect(a, b, r) {
        const pad = 4;
        const x1 = r.x - pad, y1 = r.y - pad;
        const x2 = r.x + r.w + pad, y2 = r.y + r.h + pad;

        if (Math.abs(a.y - b.y) < 0.5) {
            const y = a.y;
            if (y < y1 || y > y2) return false;
            const xmin = Math.min(a.x, b.x), xmax = Math.max(a.x, b.x);
            return !(xmax < x1 || xmin > x2);
        }
        if (Math.abs(a.x - b.x) < 0.5) {
            const x = a.x;
            if (x < x1 || x > x2) return false;
            const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
            return !(ymax < y1 || ymin > y2);
        }
        return false;
    }

    function findFirstBlocker(points, obstacles, aRect, bRect) {
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];

            for (const o of obstacles) {
                if (segmentHitsRect(a, b, o)) return o;
            }

            if (i > 1 && aRect && segmentHitsRect(a, b, aRect)) return aRect;
            if (i < points.length - 1 && bRect && segmentHitsRect(a, b, bRect)) return bRect;
        }
        return null;
    }

    function corridorHit(p1out, p2out, o) {
        const pad = 10;
        const minX = Math.min(p1out.x, p2out.x) - pad;
        const maxX = Math.max(p1out.x, p2out.x) + pad;
        const minY = Math.min(p1out.y, p2out.y) - pad;
        const maxY = Math.max(p1out.y, p2out.y) + pad;
        return !(o.x + o.w < minX || o.x > maxX || o.y + o.h < minY || o.y > maxY);
    }

    function buildDetourMiddle(p1out, p2out, startHoriz, endHoriz, obstacles, aRect, bRect) {
        const relevant = obstacles.filter(o => corridorHit(p1out, p2out, o));
        const rects = relevant.length ? relevant : obstacles;
        const margin = 24;
        const dx = p2out.x - p1out.x;
        const dy = p2out.y - p1out.y;
        const horizontal = Math.abs(dx) >= Math.abs(dy);

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const o of rects) {
            if (o.x < minX) minX = o.x;
            if (o.x + o.w > maxX) maxX = o.x + o.w;
            if (o.y < minY) minY = o.y;
            if (o.y + o.h > maxY) maxY = o.y + o.h;
        }

        const LEFT = minX - margin;
        const RIGHT = maxX + margin;
        const TOP = minY - margin;
        const BOTTOM = maxY + margin;

        function segHitsRectStrict(a, b, r) {
            if (!r) return false;
            const pad = 1;
            const x1 = r.x + pad, y1 = r.y + pad;
            const x2 = r.x + r.w - pad, y2 = r.y + r.h - pad;
            if (x1 >= x2 || y1 >= y2) return false;

            if (Math.abs(a.y - b.y) < 0.5) {
                const y = a.y;
                if (y < y1 || y > y2) return false;
                const xmin = Math.min(a.x, b.x), xmax = Math.max(a.x, b.x);
                return !(xmax < x1 || xmin > x2);
            }
            if (Math.abs(a.x - b.x) < 0.5) {
                const x = a.x;
                if (x < x1 || x > x2) return false;
                const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
                return !(ymax < y1 || ymin > y2);
            }
            return false;
        }

        function pathCuts(pts) {
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                if (i > 0 && segHitsRectStrict(a, b, aRect)) return true;
                if (i < pts.length - 2 && segHitsRectStrict(a, b, bRect)) return true;
            }
            return false;
        }

        const candidates = [];
        if (horizontal) {
            candidates.push([{ x: p1out.x, y: TOP }, { x: p2out.x, y: TOP }]);
            candidates.push([{ x: p1out.x, y: BOTTOM }, { x: p2out.x, y: BOTTOM }]);
        } else {
            candidates.push([{ x: LEFT, y: p1out.y }, { x: LEFT, y: p2out.y }]);
            candidates.push([{ x: RIGHT, y: p1out.y }, { x: RIGHT, y: p2out.y }]);
        }

        for (const mid of candidates) {
            if (!pathCuts([p1out, ...mid, p2out])) return mid;
        }

        const cost = (mid) => {
            const full = [p1out, ...mid, p2out];
            let c = 0;
            for (let i = 0; i < full.length - 1; i++) {
                c += Math.abs(full[i].x - full[i + 1].x) + Math.abs(full[i].y - full[i + 1].y);
            }
            return c;
        };
        candidates.sort((m1, m2) => cost(m1) - cost(m2));
        return candidates[0];
    }

    function segmentBlockedBetween(a, b, obstacles) {
        const minX = Math.min(a.x + a.w, b.x) - 2;
        const maxX = Math.max(a.x, b.x + b.w) + 2;
        const minY = Math.min(a.y + a.h, b.y) - 2;
        const maxY = Math.max(a.y, b.y + b.h) + 2;
        for (const o of obstacles) {
            if (o === a || o === b) continue;
            if (!(o.x + o.w < minX || o.x > maxX || o.y + o.h < minY || o.y > maxY)) {
                return true;
            }
        }
        return false;
    }

    function routeBetween(p1, p2, startEdge, endEdge, aRect, bRect, allRects) {
        const startHoriz = (startEdge === 'E' || startEdge === 'W');
        const endHoriz = (endEdge === 'E' || endEdge === 'W');
        const obstacles = (allRects || []).filter(r => r !== aRect && r !== bRect);

        const dy = Math.abs(p1.y - p2.y);
        const dx = Math.abs(p1.x - p2.x);
        const alignedH = startHoriz && endHoriz && dy < 2;
        const alignedV = !startHoriz && !endHoriz && dx < 2;
        const sameRow = Math.abs(aRect.y - bRect.y) < 2;
        const sameCol = Math.abs(aRect.x - bRect.x) < 2;

        if ((alignedH || alignedV) && (sameRow || sameCol) &&
            !segmentBlockedBetween(aRect, bRect, obstacles)) {
            return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
        }

        const { p1out, p2out } = computeStubs(p1, p2, startEdge, endEdge);

        let middle = buildSimpleOrthoMiddle(p1out, p2out, startHoriz, endHoriz);
        const blocker = findFirstBlocker([p1out, ...middle, p2out], obstacles, aRect, bRect);
        if (blocker) {
            middle = buildDetourMiddle(p1out, p2out, startHoriz, endHoriz, obstacles, aRect, bRect);
        }
        return simplifyOrtho([p1, p1out, ...middle, p2out, p2]);
    }

    function labelFromWaypoints(waypoints) {
        if (!waypoints || waypoints.length < 2) return null;
        let best = 0, bestIdx = 0;
        for (let i = 1; i < waypoints.length; i++) {
            const a = waypoints[i - 1], b = waypoints[i];
            const d = Math.hypot(b.x - a.x, b.y - a.y);
            if (d > best) { best = d; bestIdx = i - 1; }
        }
        const a = waypoints[bestIdx], b = waypoints[bestIdx + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const isHorizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
        return {
            x: mx,
            y: my,
            orientation: isHorizontal ? 'h' : 'v'
        };
    }

    function rerouteAll() {
        const states = graphData.states;
        const transitions = graphData.transitions;
        const stateByName = {};
        states.forEach(s => stateByName[s.name] = s);

        const edges = transitions.map(t => {
            const a = stateByName[t.from], b = stateByName[t.to];
            if (!a || !b) return null;
            return {
                startEdge: chooseEdge(a, b),
                endEdge: chooseEdge(b, a)
            };
        });

        const groups = new Map();
        edges.forEach((e, i) => {
            if (!e) return;
            const t = transitions[i];
            const a = stateByName[t.from];
            const b = stateByName[t.to];
            const kS = t.from + '|' + e.startEdge;
            const kE = t.to + '|' + e.endEdge;
            if (!groups.has(kS)) groups.set(kS, []);
            if (!groups.has(kE)) groups.set(kE, []);
            groups.get(kS).push({
                idx: i, side: 'start',
                sortKeyY: b.y + b.h / 2,
                sortKeyX: b.x + b.w / 2
            });
            groups.get(kE).push({
                idx: i, side: 'end',
                sortKeyY: a.y + a.h / 2,
                sortKeyX: a.x + a.w / 2
            });
        });

        const startOffsets = new Array(transitions.length).fill(0);
        const endOffsets = new Array(transitions.length).fill(0);
        for (const [key, list] of groups) {
            const n = list.length;
            const sep = key.indexOf('|');
            const stateName = key.slice(0, sep);
            const axis = key.slice(sep + 1);
            const st = stateByName[stateName];
            const edgeLen = (axis === 'E' || axis === 'W') ? st.h : st.w;
            const range = Math.max(0, edgeLen - 2 * EDGE_PAD);

            const isVerticalEdge = (axis === 'E' || axis === 'W');
            list.sort((p, q) => {
                if (isVerticalEdge) {
                    if (p.sortKeyY !== q.sortKeyY) return p.sortKeyY - q.sortKeyY;
                } else {
                    if (p.sortKeyX !== q.sortKeyX) return p.sortKeyX - q.sortKeyX;
                }
                return p.idx - q.idx;
            });

            for (let j = 0; j < n; j++) {
                const off = (n === 1) ? 0 : (-range / 2 + j * (range / (n - 1)));
                if (list[j].side === 'start') startOffsets[list[j].idx] = off;
                else endOffsets[list[j].idx] = off;
            }
        }

        const allRects = states.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
        transitions.forEach((t, i) => {
            if (t.manual && Array.isArray(t.manualWaypoints) && t.manualWaypoints.length >= 2) {
                t.waypoints = t.manualWaypoints.map(p => ({ x: p.x, y: p.y }));
                t.label = labelFromWaypoints(t.waypoints);
                return;
            }
            const a = stateByName[t.from], b = stateByName[t.to];
            const e = edges[i];
            if (!a || !b || !e) { t.waypoints = []; t.label = null; return; }
            const aRect = { x: a.x, y: a.y, w: a.w, h: a.h };
            const bRect = { x: b.x, y: b.y, w: b.w, h: b.h };
            const p1 = pointOnEdge(aRect, e.startEdge, startOffsets[i]);
            const p2 = pointOnEdge(bRect, e.endEdge, endOffsets[i]);
            t.waypoints = routeBetween(p1, p2, e.startEdge, e.endEdge, aRect, bRect, allRects);
            t.label = labelFromWaypoints(t.waypoints);
        });

        spreadParallelSegments();
        for (const t of transitions) {
            t.label = labelFromWaypoints(t.waypoints);
        }
    }

    function spreadParallelSegments() {
        const transitions = graphData.transitions;
        const LANE_STEP = 6;

        const segs = [];
        transitions.forEach((t, idx) => {
            if (t.manual) return;
            const wps = t.waypoints || [];
            if (wps.length < 4) return;
            for (let i = 1; i < wps.length; i++) {
                if (i === 1 || i === wps.length - 1) continue;
                const a = wps[i - 1], b = wps[i];
                const len = Math.hypot(b.x - a.x, b.y - a.y);
                if (len < 25) continue;
                const isH = Math.abs(a.y - b.y) < 0.5;
                const isV = Math.abs(a.x - b.x) < 0.5;
                if (!isH && !isV) continue;
                segs.push({ idx, i, isH, isV, a, b, len });
            }
        });

        const groups = new Map();
        for (const s of segs) {
            const key = s.isH
                ? 'H|' + Math.round(s.a.y / 2)
                : 'V|' + Math.round(s.a.x / 2);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(s);
        }

        for (const [key, list] of groups) {
            if (list.length < 2) continue;
            const isH = key.startsWith('H');

            let hasOverlap = false;
            for (let i = 0; i < list.length && !hasOverlap; i++) {
                for (let j = i + 1; j < list.length && !hasOverlap; j++) {
                    const a = list[i], b = list[j];
                    const rA = isH
                        ? [Math.min(a.a.x, a.b.x), Math.max(a.a.x, a.b.x)]
                        : [Math.min(a.a.y, a.b.y), Math.max(a.a.y, a.b.y)];
                    const rB = isH
                        ? [Math.min(b.a.x, b.b.x), Math.max(b.a.x, b.b.x)]
                        : [Math.min(b.a.y, b.b.y), Math.max(b.a.y, b.b.y)];
                    const overlap = Math.min(rA[1], rB[1]) - Math.max(rA[0], rB[0]);
                    if (overlap > 5) hasOverlap = true;
                }
            }
            if (!hasOverlap) continue;

            const n = list.length;
            for (let j = 0; j < n; j++) {
                const off = (j - (n - 1) / 2) * LANE_STEP;
                if (Math.abs(off) < 0.5) continue;
                const s = list[j];
                const t = transitions[s.idx];
                const wps = t.waypoints;
                if (isH) {
                    wps[s.i - 1] = { x: wps[s.i - 1].x, y: wps[s.i - 1].y + off };
                    wps[s.i] = { x: wps[s.i].x, y: wps[s.i].y + off };
                } else {
                    wps[s.i - 1] = { x: wps[s.i - 1].x + off, y: wps[s.i - 1].y };
                    wps[s.i] = { x: wps[s.i].x + off, y: wps[s.i].y };
                }
            }
        }
    }

    async function autoLayout() {
        const n = graphData.states.length;
        if (!n) return;

        const hasExisting = DATA.hasUi || (graphData.states || []).some(s => s._fromUi);
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

        const W = BASE_STATE_W, H = BASE_STATE_H;

        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: layoutRankDir,
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

        rerouteAll();
        renderGraph();
        fitGraph();
    }

    function computeBBox() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of graphData.states) {
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            maxX = Math.max(maxX, s.x + s.w);
            maxY = Math.max(maxY, s.y + s.h);
        }
        for (const t of graphData.transitions) {
            for (const w of t.waypoints || []) {
                minX = Math.min(minX, w.x); minY = Math.min(minY, w.y);
                maxX = Math.max(maxX, w.x); maxY = Math.max(maxY, w.y);
            }
            if (t.label && showTransitionLabels) {
                const labelText = t.name + (t.manual ? ' ✎' : '') +
                    (t.ru && t.ru !== t.name ? ' (' + t.ru + ')' : '');
                const textW = Math.max(30, labelText.length * 5.5 + 8);
                const boxW = textW + 8;
                const boxH = 16;
                if (t.label.orientation === 'h') {
                    minX = Math.min(minX, t.label.x - boxW / 2);
                    maxX = Math.max(maxX, t.label.x + boxW / 2);
                    minY = Math.min(minY, t.label.y - boxH / 2 - 6);
                    maxY = Math.max(maxY, t.label.y + boxH / 2 - 6);
                } else {
                    minX = Math.min(minX, t.label.x + 10 - boxW / 2);
                    maxX = Math.max(maxX, t.label.x + 10 + boxW / 2);
                    minY = Math.min(minY, t.label.y - boxH / 2);
                    maxY = Math.max(maxY, t.label.y + boxH / 2);
                }
            }
        }
        if (!isFinite(minX)) return { x: 0, y: 0, w: 100, h: 100 };
        const pad = 40;
        return {
            x: minX - pad, y: minY - pad,
            w: Math.max(100, (maxX - minX) + pad * 2),
            h: Math.max(100, (maxY - minY) + pad * 2)
        };
    }

    function applyViewBox() {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;
        svg.setAttribute('viewBox',
            viewBox.x + ' ' + viewBox.y + ' ' + viewBox.w + ' ' + viewBox.h);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    function syncZoomInput() {
        const el = document.getElementById('zoomInput');
        if (el) el.value = Math.round(zoomPercent);
    }

    function fitGraph() {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;
        const bbox = computeBBox();
        viewBox = { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h };
        zoomPercent = 100;
        syncZoomInput();
        applyViewBox();
    }

    function zoomAt(factor, anchor) {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;
        const newW = viewBox.w / factor;
        const newH = viewBox.h / factor;
        const kx = (anchor.x - viewBox.x) / viewBox.w;
        const ky = (anchor.y - viewBox.y) / viewBox.h;
        viewBox.x = anchor.x - kx * newW;
        viewBox.y = anchor.y - ky * newH;
        viewBox.w = newW;
        viewBox.h = newH;
        zoomPercent *= factor;
        syncZoomInput();
        applyViewBox();
    }

    function setZoomPercent(p) {
        if (!isFinite(p) || p <= 0) return;
        const factor = p / zoomPercent;
        const cx = viewBox.x + viewBox.w / 2;
        const cy = viewBox.y + viewBox.h / 2;
        zoomAt(factor, { x: cx, y: cy });
    }

    function computeRelated() {
        const relStates = new Set();
        const relTransitions = new Set();

        if (!selectedStates.size && !selectedTransitions.size) {
            return { relStates, relTransitions };
        }

        const transitions = graphData.transitions || [];

        for (const sName of selectedStates) {
            for (const t of transitions) {
                if (t.from === sName || t.to === sName) {
                    if (!selectedTransitions.has(t.name)) relTransitions.add(t.name);
                    const other = (t.from === sName) ? t.to : t.from;
                    if (!selectedStates.has(other)) relStates.add(other);
                }
            }
        }

        const endpoints = new Set();
        for (const tName of selectedTransitions) {
            const t = transitions.find(x => x.name === tName);
            if (!t) continue;
            endpoints.add(t.from);
            endpoints.add(t.to);
        }
        for (const sName of endpoints) {
            if (!selectedStates.has(sName)) relStates.add(sName);
            for (const t of transitions) {
                if (t.from === sName || t.to === sName) {
                    if (!selectedTransitions.has(t.name)) relTransitions.add(t.name);
                }
            }
        }

        for (const x of selectedStates) relStates.delete(x);
        for (const x of selectedTransitions) relTransitions.delete(x);

        return { relStates, relTransitions };
    }

    function updateSelectionClasses() {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;

        const { relStates, relTransitions } = computeRelated();

        svg.querySelectorAll('.g-state').forEach(g => {
            const n = g.dataset.stateName;
            g.classList.toggle('selected', selectedStates.has(n));
            g.classList.toggle('related', !selectedStates.has(n) && relStates.has(n));
        });
        svg.querySelectorAll('.g-transition').forEach(g => {
            const n = g.dataset.transitionName;
            g.classList.toggle('selected', selectedTransitions.has(n));
            g.classList.toggle('related', !selectedTransitions.has(n) && relTransitions.has(n));
        });
    }

    function clearSelection() {
        selectedStates.clear();
        selectedTransitions.clear();
        updateSelectionClasses();
        updateSelectionToolbar();
        renderGraph();
        applyViewBox();
    }

    function updateSelectionToolbar() {
        const editBtn = document.getElementById('editSelectedBtn');
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        const hint = document.getElementById('selectionHint');
        if (!editBtn || !deleteBtn) return;

        const total = selectedStates.size + selectedTransitions.size;
        editBtn.disabled = total !== 1;
        deleteBtn.disabled = total === 0;

        const parts = [];
        if (selectedStates.size) parts.push('состояний: ' + selectedStates.size);
        if (selectedTransitions.size) parts.push('переходов: ' + selectedTransitions.size);
        if (hint) hint.textContent = parts.length ? 'выделено ' + parts.join(', ') : '';
    }

    function editSelected() {
        const total = selectedStates.size + selectedTransitions.size;
        if (total !== 1) return;
        if (selectedStates.size === 1) {
            const name = [...selectedStates][0];
            openEditForm(name);
        } else {
            const name = [...selectedTransitions][0];
            openTransitionForm(name);
        }
    }

    async function deleteSelected() {
        const stCount = selectedStates.size;
        const trCount = selectedTransitions.size;
        if (!stCount && !trCount) return;

        const lines = [];
        if (stCount) lines.push('состояний: ' + stCount + (stCount === 1 ? ' (' + [...selectedStates][0] + ')' : ''));
        if (trCount) lines.push('переходов: ' + trCount + (trCount === 1 ? ' (' + [...selectedTransitions][0] + ')' : ''));

        const ok = await showConfirm(
            'Удалить выделенное?\n\n' + lines.join('\n') + '\n\n' +
            'Будут изменены: documentFlow.json, configuration.json, translation.csv, documentFlow.ui.json',
            'Удаление выделенного'
        );
        if (!ok) return;

        const statesArr = [...selectedStates];
        const transitionsArr = [...selectedTransitions];

        selectedStates.clear();
        selectedTransitions.clear();
        updateSelectionToolbar();

        for (const name of statesArr) {
            vscode.postMessage({ type: 'deleteState', state: name });
        }
        if (transitionsArr.length) {
            vscode.postMessage({ type: 'deleteTransitions', names: transitionsArr });
        }
    }

    function findStateAt(x, y) {
        for (const s of graphData.states) {
            if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
        }
        return null;
    }

    function startTransitionDraw(fromName) {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;
        const fromState = graphData.states.find(s => s.name === fromName);
        if (!fromState) return;

        const old = svg.querySelector('.g-transition-draft');
        if (old) old.remove();

        const startPt = {
            x: fromState.x + fromState.w / 2,
            y: fromState.y + fromState.h / 2
        };

        const line = svgEl('line', {
            class: 'g-transition-draft',
            x1: startPt.x, y1: startPt.y,
            x2: startPt.x, y2: startPt.y
        });
        const root = svg.querySelector('g') || svg;
        root.appendChild(line);

        draftTransition = { fromName, line, startPt };

        function onMove(e) {
            const pt = clientToSvg(e);
            line.setAttribute('x2', pt.x);
            line.setAttribute('y2', pt.y);
        }

        function cleanup() {
            if (draftTransition && draftTransition.line) {
                draftTransition.line.remove();
            }
            draftTransition = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onEsc, true);
        }

        function onEsc(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
            }
        }

        function onDown(e) {
            if (e.button !== 0 && e.button !== 2) return;
            const pt = clientToSvg(e);
            const hit = findStateAt(pt.x, pt.y);

            if (!hit) { cleanup(); return; }
            if (hit.name === fromName) { cleanup(); return; }

            e.preventDefault();
            e.stopPropagation();

            const toName = hit.name;
            cleanup();
            lastContextMenuBlockUntil = Date.now() + 300;
            createDraftTransition(fromName, toName);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onEsc, true);
    }

    function createDraftTransition(fromName, toName) {
        const code = fromName + '_' + toName;

        const existing = graphData.transitions.find(t => t.name === code);
        if (existing) {
            openTransitionForm(existing.name);
            return;
        }

        const sameEndpoints = graphData.transitions.find(
            t => t.from === fromName && t.to === toName
        );
        if (sameEndpoints) {
            openTransitionForm(sameEndpoints.name);
            return;
        }

        const draft = {
            name: code,
            from: fromName,
            to: toName,
            ru: code,
            actionToRunBefore: '',
            serverSideEvents: false,
            allowOnValidationErrors: null,
            manual: false,
            manualWaypoints: null,
            _isNew: true
        };
        graphData.transitions.push(draft);
        rerouteAll();
        renderGraph();
        applyViewBox();
        openTransitionForm(code);
    }

    function clientToSvg(evt) {
        const svg = document.getElementById('graphSvg');
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    function startDrag(ev, state, gEl) {
        const start = clientToSvg(ev);
        const origX = state.x, origY = state.y;

        gEl.classList.add('dragging');

        function onMove(e) {
            const cur = clientToSvg(e);
            state.x = origX + (cur.x - start.x);
            state.y = origY + (cur.y - start.y);
            const rect = gEl.querySelector('rect');
            rect.setAttribute('x', state.x);
            rect.setAttribute('y', state.y);
            const texts = gEl.querySelectorAll('text');
            if (texts.length) {
                const cx = state.x + state.w / 2;
                const cy = state.y + state.h / 2;
                const hasRu = texts.length > 1;
                texts[0].setAttribute('x', cx);
                texts[0].setAttribute('y', hasRu ? cy - 7 : cy);
                if (texts[1]) {
                    texts[1].setAttribute('x', cx);
                    texts[1].setAttribute('y', cy + 13);
                }
            }
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            gEl.classList.remove('dragging');
            if (state.x !== origX || state.y !== origY) {
                rerouteAll();
                renderGraph();
                applyViewBox();
            }
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startPan(ev) {
        const svg = document.getElementById('graphSvg');
        svg.classList.add('panning');

        let lastX = ev.clientX, lastY = ev.clientY;
        const box = svg.getBoundingClientRect();

        function onMove(e) {
            const scaleX = viewBox.w / box.width;
            const scaleY = viewBox.h / box.height;
            viewBox.x -= (e.clientX - lastX) * scaleX;
            viewBox.y -= (e.clientY - lastY) * scaleY;
            lastX = e.clientX;
            lastY = e.clientY;
            applyViewBox();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            svg.classList.remove('panning');
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /* ============================================================
     * MANUAL ROUTE DRAG
     * ============================================================ */
    function updateTransitionDom(t) {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;
        const transName = t.name.replace(/"/g, '\\"');
        const g = svg.querySelector('.g-transition[data-transition-name="' + transName + '"]');
        if (!g) return;

        const d = buildRoundedPath(t.waypoints, 10);

        const linePath = g.querySelector('path.g-transition-line');
        if (linePath) linePath.setAttribute('d', d);

        const hitPath = g.querySelector('path.g-transition-hit');
        if (hitPath) hitPath.setAttribute('d', d);

        if (t.label) {
            const labelText = t.name + (t.manual ? ' ✎' : '') +
                (t.ru && t.ru !== t.name ? ' (' + t.ru + ')' : '');
            const textW = Math.max(30, labelText.length * 5.5 + 8);
            const boxW = textW + 8;
            const boxH = 16;

            let boxCx, boxCy;
            if (t.label.orientation === 'h') {
                boxCx = t.label.x;
                boxCy = t.label.y - boxH / 2 - 6;
            } else {
                boxCx = t.label.x + boxW / 2 + 10;
                boxCy = t.label.y;
            }

            const bg = g.querySelector('.g-transition-label-bg');
            if (bg) {
                bg.setAttribute('x', boxCx - boxW / 2);
                bg.setAttribute('y', boxCy - boxH / 2);
                bg.setAttribute('width', boxW);
                bg.setAttribute('height', boxH);
            }
            const textEl = g.querySelector('.g-transition-label-text');
            if (textEl) {
                textEl.setAttribute('x', boxCx);
                textEl.setAttribute('y', boxCy);
                textEl.textContent = labelText;
            }
        }

        svg.querySelectorAll('.g-transition-handle[data-transition="' + transName + '"][data-idx]').forEach(h => {
            const idx = parseInt(h.getAttribute('data-idx'), 10);
            if (!t.waypoints[idx]) return;
            h.setAttribute('cx', t.waypoints[idx].x);
            h.setAttribute('cy', t.waypoints[idx].y);
        });

        svg.querySelectorAll('.g-transition-handle-hit[data-transition="' + transName + '"][data-idx]').forEach(hit => {
            const idx = parseInt(hit.getAttribute('data-idx'), 10);
            if (!t.waypoints[idx]) return;
            hit.setAttribute('cx', t.waypoints[idx].x);
            hit.setAttribute('cy', t.waypoints[idx].y);
        });

        svg.querySelectorAll('.g-transition-seg-handle[data-transition="' + transName + '"], ' +
            '.g-transition-seg-handle-hit[data-transition="' + transName + '"]')
            .forEach(el => {
                const si = parseInt(el.getAttribute('data-seg'), 10);
                const a = t.waypoints[si];
                const b = t.waypoints[si + 1];
                if (!a || !b) return;
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const perp = segPerp(a, b);
                const half = 8;
                const x1 = mx - perp.x * half;
                const y1 = my - perp.y * half;
                const x2 = mx + perp.x * half;
                const y2 = my + perp.y * half;
                el.setAttribute('x1', x1);
                el.setAttribute('y1', y1);
                el.setAttribute('x2', x2);
                el.setAttribute('y2', y2);
            });
    }

    function removeWaypoint(transitionName, pointIdx) {
        const t = graphData.transitions.find(x => x.name === transitionName);
        if (!t) return;
        if (!t.waypoints || t.waypoints.length <= 2) return;
        if (pointIdx <= 0 || pointIdx >= t.waypoints.length - 1) return;

        t.waypoints.splice(pointIdx, 1);
        t.manual = true;
        t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
        t.label = labelFromWaypoints(t.waypoints);

        renderGraph();
        applyViewBox();
    }

    function addWaypointAt(transitionName, segIdx, pt) {
        const t = graphData.transitions.find(x => x.name === transitionName);
        if (!t) return;
        if (!t.waypoints || t.waypoints.length < 2) return;
        if (segIdx < 0 || segIdx >= t.waypoints.length - 1) return;

        // Вставляем новую точку после segIdx
        t.waypoints.splice(segIdx + 1, 0, { x: pt.x, y: pt.y });
        t.manual = true;
        t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
        t.label = labelFromWaypoints(t.waypoints);

        renderGraph();
        applyViewBox();
    }

    function startHandleDrag(ev, transitionName, pointIdx) {
        const t = graphData.transitions.find(x => x.name === transitionName);
        if (!t) return;

        if (!t.manual) t.manual = true;
        t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));

        const start = clientToSvg(ev);
        const origPt = { x: t.waypoints[pointIdx].x, y: t.waypoints[pointIdx].y };

        const svg = document.getElementById('graphSvg');
        const transName = t.name.replace(/"/g, '\\"');
        const handle = svg.querySelector(
            '.g-transition-handle[data-transition="' + transName + '"][data-idx="' + pointIdx + '"]'
        );
        if (handle) handle.classList.add('dragging');

        function onMove(e) {
            const cur = clientToSvg(e);
            const dx = cur.x - start.x;
            const dy = cur.y - start.y;

            const newPt = { x: origPt.x + dx, y: origPt.y + dy };
            t.waypoints[pointIdx] = newPt;
            t.manualWaypoints[pointIdx] = { x: newPt.x, y: newPt.y };
            t.label = labelFromWaypoints(t.waypoints);

            updateTransitionDom(t);
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (handle) handle.classList.remove('dragging');
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startEndPointDrag(ev, transitionName, which) {
        const t = graphData.transitions.find(x => x.name === transitionName);
        if (!t) return;

        const stateName = which === 'start' ? t.from : t.to;
        const stateObj = graphData.states.find(s => s.name === stateName);
        if (!stateObj) return;

        const idx = which === 'start' ? 0 : t.waypoints.length - 1;
        const start = clientToSvg(ev);
        const origPt = { x: t.waypoints[idx].x, y: t.waypoints[idx].y };

        const svg = document.getElementById('graphSvg');
        const transName = t.name.replace(/"/g, '\\"');
        const handle = svg.querySelector(
            '.g-transition-handle-end[data-transition="' + transName + '"][data-end="' + which + '"]'
        );
        if (handle) handle.classList.add('dragging');

        const stateG = svg.querySelector('.g-state[data-state-name="' + stateName.replace(/"/g, '\\"') + '"]');
        if (stateG) stateG.classList.add('snap-target');

        function onMove(e) {
            const cur = clientToSvg(e);
            const dx = cur.x - start.x;
            const dy = cur.y - start.y;
            t.waypoints[idx] = { x: origPt.x + dx, y: origPt.y + dy };
            t.label = labelFromWaypoints(t.waypoints);
            updateTransitionDom(t);
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (handle) handle.classList.remove('dragging');
            if (stateG) stateG.classList.remove('snap-target');

            const pt = t.waypoints[idx];
            const edge = findNearestEdge(stateObj, pt);
            const snapped = snapToEdge(stateObj, edge, pt);
            t.waypoints[idx] = snapped;

            t.manual = true;
            t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
            t.label = labelFromWaypoints(t.waypoints);

            renderGraph();
            applyViewBox();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startSegmentDrag(ev, transitionName, segIdx) {
        const t = graphData.transitions.find(x => x.name === transitionName);
        if (!t) return;
        const p1 = t.waypoints[segIdx];
        const p2 = t.waypoints[segIdx + 1];
        if (!p1 || !p2) return;

        const orig1 = { x: p1.x, y: p1.y };
        const orig2 = { x: p2.x, y: p2.y };
        const perp = segPerp(orig1, orig2);

        t.manual = true;
        t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));

        const start = clientToSvg(ev);

        const svg = document.getElementById('graphSvg');
        const hitEl = svg.querySelector(
            '.g-transition-seg-handle-hit[data-transition="' + t.name.replace(/"/g, '\\"') +
            '"][data-seg="' + segIdx + '"]'
        );
        if (hitEl) hitEl.classList.add('dragging');

        function onMove(e) {
            const cur = clientToSvg(e);
            const dx = cur.x - start.x;
            const dy = cur.y - start.y;

            // Проекция движения мыши на перпендикуляр к сегменту
            const proj = dx * perp.x + dy * perp.y;
            const nx = proj * perp.x;
            const ny = proj * perp.y;

            t.waypoints[segIdx] = { x: orig1.x + nx, y: orig1.y + ny };
            t.waypoints[segIdx + 1] = { x: orig2.x + nx, y: orig2.y + ny };
            t.manualWaypoints = t.waypoints.map(p => ({ x: p.x, y: p.y }));
            t.label = labelFromWaypoints(t.waypoints);

            updateTransitionDom(t);
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (hitEl) hitEl.classList.remove('dragging');
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /* ============================================================
     * RENDER GRAPH
     * ============================================================ */
    function renderGraph() {
        const svg = document.getElementById('graphSvg');
        if (!svg) return;
        svg.innerHTML = '';

        const defs = svgEl('defs');
        const marker = svgEl('marker', {
            id: 'arr', viewBox: '0 0 10 10',
            refX: '9', refY: '5',
            markerWidth: '7', markerHeight: '7',
            orient: 'auto-start-reverse'
        });
        const arrow = svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z' });
        arrow.setAttribute('fill', 'var(--vscode-charts-green, #3fb950)');
        marker.appendChild(arrow);
        defs.appendChild(marker);
        svg.appendChild(defs);

        const root = svgEl('g');
        svg.appendChild(root);

        // --- transitions ---
        const gT = svgEl('g', { class: 'g-transitions' });
        for (const t of graphData.transitions) {
            const g = svgEl('g', { class: 'g-transition' });
            g.dataset.transitionName = t.name;
            if (selectedTransitions.has(t.name)) g.classList.add('selected');

            if (t.waypoints && t.waypoints.length >= 2) {
                const d = buildRoundedPath(t.waypoints, 10);

                g.appendChild(svgEl('path', {
                    d: d,
                    class: 'g-transition-line',
                    'marker-end': 'url(#arr)',
                    fill: 'none'
                }));

                const hit = svgEl('path', { d: d, class: 'g-transition-hit' });

                hit.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    svg.focus();

                    if (ev.ctrlKey || ev.metaKey) {
                        if (selectedTransitions.has(t.name)) selectedTransitions.delete(t.name);
                        else selectedTransitions.add(t.name);
                        renderGraph();
                        applyViewBox();
                        updateSelectionToolbar();
                        return;
                    }

                    const alreadySoleSelected =
                        selectedTransitions.size === 1 && selectedTransitions.has(t.name) &&
                        selectedStates.size === 0;

                    if (alreadySoleSelected) return;

                    selectedStates.clear();
                    selectedTransitions.clear();
                    selectedTransitions.add(t.name);
                    renderGraph();
                    applyViewBox();
                    updateSelectionToolbar();
                });

                hit.addEventListener('dblclick', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();

                    // Alt + двойной клик — добавить точку
                    if (ev.altKey) {
                        const svgPt = clientToSvg(ev);
                        const segIdx = findSegmentIndex(t.waypoints, svgPt);
                        if (segIdx >= 0) {
                            addWaypointAt(t.name, segIdx, svgPt);
                        }
                        return;
                    }

                    // Обычный двойной клик — открыть модалку
                    openTransitionForm(t.name);
                });

                g.appendChild(hit);
            }

            if (t.label && showTransitionLabels) {
                const labelText = t.name + (t.manual ? ' ✎' : '') +
                    (t.ru && t.ru !== t.name ? ' (' + t.ru + ')' : '');
                const textW = Math.max(30, labelText.length * 5.5 + 8);
                const boxW = textW + 8;
                const boxH = 16;

                let boxCx, boxCy;
                if (t.label.orientation === 'h') {
                    boxCx = t.label.x;
                    boxCy = t.label.y - boxH / 2 - 6;
                } else {
                    boxCx = t.label.x + boxW / 2 + 10;
                    boxCy = t.label.y;
                }

                const labelBg = svgEl('rect', {
                    class: 'g-transition-label-bg',
                    x: boxCx - boxW / 2,
                    y: boxCy - boxH / 2,
                    width: boxW,
                    height: boxH,
                    rx: 3
                });
                g.appendChild(labelBg);

                const labelEl = svgEl('text', {
                    class: 'g-transition-label-text',
                    x: boxCx,
                    y: boxCy,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle'
                });
                labelEl.textContent = labelText;
                g.appendChild(labelEl);

                const onLabelDown = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    svg.focus();

                    if (ev.ctrlKey || ev.metaKey) {
                        if (selectedTransitions.has(t.name)) selectedTransitions.delete(t.name);
                        else selectedTransitions.add(t.name);
                        renderGraph();
                        applyViewBox();
                        updateSelectionToolbar();
                        return;
                    }

                    const alreadySoleSelected =
                        selectedTransitions.size === 1 && selectedTransitions.has(t.name) &&
                        selectedStates.size === 0;

                    if (alreadySoleSelected) return;

                    selectedStates.clear();
                    selectedTransitions.clear();
                    selectedTransitions.add(t.name);
                    renderGraph();
                    applyViewBox();
                    updateSelectionToolbar();
                };
                const onLabelDbl = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openTransitionForm(t.name);
                };
                labelBg.addEventListener('mousedown', onLabelDown);
                labelEl.addEventListener('mousedown', onLabelDown);
                labelBg.addEventListener('dblclick', onLabelDbl);
                labelEl.addEventListener('dblclick', onLabelDbl);
            }

            gT.appendChild(g);
        }
        root.appendChild(gT);

        // --- states ---
        const gS = svgEl('g', { class: 'g-states' });
        for (const s of graphData.states) {
            const g = svgEl('g', { class: 'g-state' });
            g.dataset.stateName = s.name;
            if (selectedStates.has(s.name)) g.classList.add('selected');

            const rect = svgEl('rect', {
                x: s.x, y: s.y, width: s.w, height: s.h, rx: 12
            });
            g.appendChild(rect);

            const cx = s.x + s.w / 2;
            const cy = s.y + s.h / 2;
            const hasRu = s.ru && s.ru !== s.name;

            const nameText = svgEl('text', {
                x: cx,
                y: hasRu ? cy - 7 : cy,
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                'font-weight': '600',
                'font-size': '13'
            });
            nameText.textContent = s.name;
            g.appendChild(nameText);

            if (hasRu) {
                const ruText = svgEl('text', {
                    x: cx, y: cy + 13,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    'font-size': '11', 'opacity': '0.8'
                });
                ruText.textContent = s.ru;
                g.appendChild(ruText);
            }

            rect.addEventListener('dblclick', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                openEditForm(s.name);
            });

            rect.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                svg.focus();

                if (ev.ctrlKey || ev.metaKey) {
                    if (selectedStates.has(s.name)) selectedStates.delete(s.name);
                    else selectedStates.add(s.name);
                    updateSelectionClasses();
                    updateSelectionToolbar();
                    return;
                }

                const alreadySoleSelected =
                    selectedStates.size === 1 && selectedStates.has(s.name) &&
                    selectedTransitions.size === 0;

                if (!alreadySoleSelected) {
                    selectedStates.clear();
                    selectedTransitions.clear();
                    selectedStates.add(s.name);
                    renderGraph();
                    applyViewBox();
                    updateSelectionToolbar();
                    const newG = document.querySelector(
                        '.g-state[data-state-name="' + s.name.replace(/"/g, '\\"') + '"]'
                    );
                    if (newG) {
                        const newRect = newG.querySelector('rect');
                        startDrag(ev, s, newG);
                        if (newRect && newRect.focus) newRect.focus();
                    }
                    return;
                }

                startDrag(ev, s, g);
            });

            rect.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (draftTransition) return;
                if (Date.now() < lastContextMenuBlockUntil) return;
                startTransitionDraw(s.name);
            });

            gS.appendChild(g);
        }
        root.appendChild(gS);

        // --- handles (поверх всего) ---
        const gHandles = svgEl('g', { class: 'g-handles' });
        for (const t of graphData.transitions) {
            if (!selectedTransitions.has(t.name)) continue;
            if (!t.waypoints || t.waypoints.length < 2) continue;

            const lastIdx = t.waypoints.length - 1;

            // --- крайние точки ---
            for (const [idx, end] of [[0, 'start'], [lastIdx, 'end']]) {
                const p = t.waypoints[idx];

                const hitZone = svgEl('circle', {
                    class: 'g-transition-handle-hit',
                    cx: p.x, cy: p.y, r: 14,
                    'data-idx': String(idx),
                    'data-transition': t.name
                });
                hitZone.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    startEndPointDrag(ev, t.name, end);
                });
                gHandles.appendChild(hitZone);

                const handle = svgEl('circle', {
                    class: 'g-transition-handle g-transition-handle-end',
                    cx: p.x, cy: p.y, r: 9,
                    'data-idx': String(idx),
                    'data-end': end,
                    'data-transition': t.name
                });
                handle.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    startEndPointDrag(ev, t.name, end);
                });
                gHandles.appendChild(handle);
            }

            // --- промежуточные точки ---
            for (let hi = 1; hi < lastIdx; hi++) {
                const p = t.waypoints[hi];

                const hitZone = svgEl('circle', {
                    class: 'g-transition-handle-hit',
                    cx: p.x, cy: p.y, r: 12,
                    'data-idx': String(hi),
                    'data-transition': t.name
                });
                hitZone.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (ev.button === 2) {
                        removeWaypoint(t.name, hi);
                        return;
                    }
                    startHandleDrag(ev, t.name, hi);
                });
                hitZone.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                });
                gHandles.appendChild(hitZone);

                const handle = svgEl('circle', {
                    class: 'g-transition-handle',
                    cx: p.x, cy: p.y, r: 8,
                    'data-idx': String(hi),
                    'data-transition': t.name
                });
                handle.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (ev.button === 2) {
                        removeWaypoint(t.name, hi);
                        return;
                    }
                    startHandleDrag(ev, t.name, hi);
                });
                handle.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                });
                gHandles.appendChild(handle);
            }

            // --- полоски средних сегментов ---
            for (let si = 1; si < lastIdx - 1; si++) {
                const a = t.waypoints[si];
                const b = t.waypoints[si + 1];
                if (!a || !b) continue;
                if (Math.hypot(b.x - a.x, b.y - a.y) < 3) continue;

                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const perp = segPerp(a, b);
                const half = 8;

                const x1 = mx - perp.x * half;
                const y1 = my - perp.y * half;
                const x2 = mx + perp.x * half;
                const y2 = my + perp.y * half;

                const hit = svgEl('line', {
                    class: 'g-transition-seg-handle-hit',
                    x1, y1, x2, y2,
                    'data-transition': t.name,
                    'data-seg': String(si)
                });
                hit.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    startSegmentDrag(ev, t.name, si);
                });
                gHandles.appendChild(hit);

                const vis = svgEl('line', {
                    class: 'g-transition-seg-handle',
                    x1, y1, x2, y2,
                    'data-transition': t.name,
                    'data-seg': String(si)
                });
                gHandles.appendChild(vis);
            }
        }
        root.appendChild(gHandles);

        if (draftTransition) {
            root.appendChild(draftTransition.line);
        }

        attachGraphSvgHandlers();
        attachGraphKeydown();
        updateSelectionClasses();
    }

    function attachGraphSvgHandlers() {
        const svg = document.getElementById('graphSvg');
        if (!svg || svg.dataset.svgHandlersAttached === '1') return;
        svg.dataset.svgHandlersAttached = '1';

        svg.addEventListener('mousedown', (ev) => {
            const rootG = svg.querySelector('g');
            const isBg = (ev.target === svg || ev.target === rootG || ev.target.tagName === 'svg');
            if (!isBg) return;
            if (!ev.ctrlKey && !ev.metaKey) {
                if (selectedStates.size || selectedTransitions.size) {
                    clearSelection();
                }
            }
            svg.focus();
            startPan(ev);
        });

        svg.addEventListener('wheel', (ev) => {
            if (!ev.ctrlKey && !ev.metaKey) return;
            ev.preventDefault();
            const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
            const pt = clientToSvg(ev);
            zoomAt(factor, pt);
        }, { passive: false });

        svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
    }

    function attachGraphKeydown() {
        const svg = document.getElementById('graphSvg');
        if (!svg || svg.dataset.kdAttached === '1') return;
        svg.dataset.kdAttached = '1';

        svg.addEventListener('keydown', (ev) => {
            if (viewMode !== 'graph') return;
            if (!(ev.ctrlKey || ev.metaKey)) return;
            const codes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (!codes.includes(ev.key)) return;
            if (!selectedStates.size) return;

            ev.preventDefault();
            const step = ev.shiftKey ? 10 : 1;
            let dx = 0, dy = 0;
            if (ev.key === 'ArrowUp') dy = -step;
            if (ev.key === 'ArrowDown') dy = step;
            if (ev.key === 'ArrowLeft') dx = -step;
            if (ev.key === 'ArrowRight') dx = step;

            for (const s of graphData.states) {
                if (!selectedStates.has(s.name)) continue;
                s.x += dx; s.y += dy;
            }
            rerouteAll();
            renderGraph();
            applyViewBox();
        });
    }
    /* ============================================================
     * VIEW TOGGLE
     * ============================================================ */
    function applyViewMode() {
        const tv = document.getElementById('tableView');
        const gv = document.getElementById('graphView');
        if (viewMode === 'graph') {
            tv.classList.add('hidden');
            gv.classList.add('active');
            document.getElementById('graphHint').textContent =
                DATA.hasUi ? 'Позиции из documentFlow.ui.json' : 'documentFlow.ui.json не найден — авто-раскладка';
            try {
                requestAnimationFrame(() => {
                    rerouteAll();
                    renderGraph();
                    fitGraph();
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

    document.getElementById('viewToggle').addEventListener('click', () => {
        viewMode = viewMode === 'graph' ? 'table' : 'graph';
        persistState();
        applyViewMode();
    });

    document.getElementById('saveGraphBtn').addEventListener('click', () => {
        vscode.postMessage({
            type: 'saveGraph',
            payload: { states: graphData.states, transitions: graphData.transitions }
        });
    });

    document.getElementById('fitGraphBtn').addEventListener('click', fitGraph);

    /* ============================================================
     * TOOLBAR
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
        const key = viewMode === 'graph' ? 'table' : 'graph';
        btn.setAttribute('data-icon', key);
        btn.title = viewMode === 'graph' ? 'Показать таблицу' : 'Показать граф';
        btn.innerHTML = ICONS[key];
    }

    function adjustBodyPaddingForToolbar() {
        const toolbar = document.getElementById('mainToolbar');
        if (!toolbar) return;
        const pos = document.body.getAttribute('data-toolbar-position') || 'top';
        const h = toolbar.offsetHeight;
        const w = toolbar.offsetWidth;
        const GAP = 10;

        document.body.style.paddingTop = '';
        document.body.style.paddingBottom = '';
        document.body.style.paddingLeft = '';
        document.body.style.paddingRight = '';

        if (pos === 'top') document.body.style.paddingTop = (h + GAP) + 'px';
        if (pos === 'bottom') document.body.style.paddingBottom = (h + GAP) + 'px';
        if (pos === 'left') document.body.style.paddingLeft = (w + GAP) + 'px';
        if (pos === 'right') document.body.style.paddingRight = (w + GAP) + 'px';
    }

    function applyToolbarPosition() {
        document.body.setAttribute('data-toolbar-position', toolbarPosition);
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
            { value: 'top', label: 'Сверху', icon: 'layout-top' },
            { value: 'right', label: 'Справа', icon: 'layout-right' },
            { value: 'bottom', label: 'Снизу', icon: 'layout-bottom' },
            { value: 'left', label: 'Слева', icon: 'layout-left' }
        ];

        let html = '<div class="menu-header">Расположение тулбара</div>';
        for (const p of positions) {
            const checked = toolbarPosition === p.value ? '✓' : '';
            html += '<div class="menu-item" data-pos="' + p.value + '">' +
                '<span class="check">' + checked + '</span>' +
                ICONS[p.icon] +
                '<span>' + p.label + '</span>' +
                '</div>';
        }
        menu.innerHTML = html;

        document.body.appendChild(menu);

        const r = btn.getBoundingClientRect();
        const mw = menu.offsetWidth || 200;
        const mh = menu.offsetHeight || 160;
        const GAP = 6;

        if (toolbarPosition === 'top') {
            menu.style.top = (r.bottom + GAP) + 'px';
            menu.style.left = Math.max(4, Math.min(r.right - mw, window.innerWidth - mw - 4)) + 'px';
        } else if (toolbarPosition === 'bottom') {
            menu.style.top = (r.top - mh - GAP) + 'px';
            menu.style.left = Math.max(4, Math.min(r.right - mw, window.innerWidth - mw - 4)) + 'px';
        } else if (toolbarPosition === 'left') {
            menu.style.left = (r.right + GAP) + 'px';
            menu.style.top = Math.max(4, Math.min(r.top, window.innerHeight - mh - 4)) + 'px';
        } else if (toolbarPosition === 'right') {
            menu.style.left = (r.left - mw - GAP) + 'px';
            menu.style.top = Math.max(4, Math.min(r.top, window.innerHeight - mh - 4)) + 'px';
        }

        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                toolbarPosition = item.getAttribute('data-pos');
                persistState();
                applyToolbarPosition();
                closeToolbarMenu();
            });
        });
    }

    const layoutDirBtn = document.getElementById('layoutDirBtn');
    function updateLayoutDirBtn() {
        if (!layoutDirBtn) return;
        const key = layoutRankDir === 'TB' ? 'arrows-v' : 'arrows-h';
        layoutDirBtn.setAttribute('data-icon', key);
        layoutDirBtn.title = layoutRankDir === 'TB'
            ? 'Сверху вниз (клик — слева направо)'
            : 'Слева направо (клик — сверху вниз)';
        layoutDirBtn.innerHTML = ICONS[key];
    }

    const labelsToggleBtn = document.getElementById('labelsToggleBtn');
    function updateLabelsToggleBtn() {
        if (!labelsToggleBtn) return;
        labelsToggleBtn.style.opacity = showTransitionLabels ? '1' : '0.55';
        labelsToggleBtn.title = showTransitionLabels
            ? 'Скрыть подписи переходов'
            : 'Показать подписи переходов';
    }

    /* ============================================================
     * SELECT BUILDERS
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
        for (const s of states) {
            const opt = document.createElement('option');
            opt.value = s;
            const ru = (meta.translations.stateTrans[s]) || s;
            opt.textContent = s + ' (' + ru + ')';
            if (s === selected) opt.selected = true;
            selectEl.appendChild(opt);
        }
    }

    /* ============================================================
     * FORMS
     * ============================================================ */
    function buildPermissionCard(p) {
        const card = cloneTemplate('tpl-permission-card');
        const ops = p.operations || [];
        const trs = p.transitions || [];
        const atts = p.attachments || {};
        const currentActor = p.actor || '';

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
        buildStateOptions(toSel, meta.states, t.to || (meta.states[0] || ''));

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
            const name = nameInput.value.trim();
            const ru = backdrop.querySelector('.f-new-ru').value.trim();
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

            vscode.postMessage({
                type: 'addState',
                payload: { name, ru, isTerminal, outgoingTransitions: outgoing, permissions: perms }
            });
            backdrop.remove();
        });

        updateCounts();
    }

    function openEditForm(stateName) {
        const det = stateDetails[stateName];
        if (!det) { showAlert('Нет данных для состояния ' + stateName); return; }

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
            const newRu = backdrop.querySelector('.f-edit-ru').value.trim();
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
            const addedTransitions = [];
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

            vscode.postMessage({
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

    function openTransitionForm(name) {
        const t = (graphData.transitions || []).find(x => x.name === name);
        if (!t) { showAlert('Переход не найден: ' + name); return; }
        const isNew = !!t._isNew;

        const container = document.getElementById('modalContainer');
        const backdrop = cloneTemplate('tpl-transition-modal');
        container.appendChild(backdrop);

        backdrop.querySelector('.f-tr-name').value = t.name;
        backdrop.querySelector('.f-tr-ru').value = t.ru || '';
        backdrop.querySelector('.f-tr-from').value = t.from;

        const toSel = backdrop.querySelector('.f-tr-to');
        buildStateOptions(toSel, meta.states, t.to);

        backdrop.querySelector('.f-tr-action').value = t.actionToRunBefore || '';
        backdrop.querySelector('.f-tr-sse').checked = !!t.serverSideEvents;

        const aove = t.allowOnValidationErrors || null;
        const modeSelect = backdrop.querySelector('.f-tr-aove-mode');
        const codesRow = backdrop.querySelector('.f-tr-codes-row');
        const codesArea = backdrop.querySelector('.f-tr-codes');

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

                rerouteAll();
                renderGraph();
                applyViewBox();

                vscode.postMessage({
                    type: 'saveGraph',
                    payload: {
                        states: graphData.states,
                        transitions: graphData.transitions
                    }
                });

                backdrop.remove();
            });
        }

        backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => {
            if (isNew) {
                const i = graphData.transitions.findIndex(x => x.name === name);
                if (i >= 0) graphData.transitions.splice(i, 1);
                rerouteAll();
                renderGraph();
                applyViewBox();
            }
            backdrop.remove();
        });

        backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
            const newName = backdrop.querySelector('.f-tr-name').value.trim();
            const newRu = backdrop.querySelector('.f-tr-ru').value.trim();
            const newTo = toSel.value;
            const action = backdrop.querySelector('.f-tr-action').value.trim();
            const sse = backdrop.querySelector('.f-tr-sse').checked;
            const m = modeSelect.value;

            if (!newName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(newName)) {
                showAlert('Некорректный код перехода');
                return;
            }
            if (!newTo) { showAlert('Выберите целевое состояние'); return; }

            let allow = null;
            if (m === 'all-true') allow = { mode: 'all-true' };
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
                if (newTo !== t.to) lines.push('To: ' + t.to + ' → ' + newTo);
            }
            lines.push('actionToRunBefore: ' + (action || '—'));
            lines.push('serverSideEvents: ' + (sse ? 'да' : 'нет'));
            lines.push('allowOnValidationErrors: ' + (allow ? allow.mode : '—'));

            const ok = await showConfirm(lines.join('\n'), isNew ? 'Создание перехода' : 'Сохранение перехода');
            if (!ok) return;

            if (isNew) {
                vscode.postMessage({
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
                vscode.postMessage({
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

    function openGenerateFlowForm() {
        const container = document.getElementById('modalContainer');
        const backdrop = cloneTemplate('tpl-generate-flow-modal');
        container.appendChild(backdrop);

        const existingStates = (DATA.graph.states || []).map(s => ({
            name: s.name,
            ru: (meta.translations.stateTrans && meta.translations.stateTrans[s.name]) || s.ru || s.name,
            existing: true
        }));

        const existingTransitions = (DATA.graph.transitions || []).map(t => ({
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
            const fresh = genFlowState.states.filter(s => !s.existing);

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
            if (fresh.length) { addSep('Новые'); fresh.forEach(s => tbodyS.appendChild(buildStateRow(s))); }
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
            const fresh = genFlowState.transitions.filter(t => !t.existing);

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
            if (fresh.length) { addSep('Новые'); fresh.forEach(t => tbodyT.appendChild(buildTransitionRow(t))); }
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
                const to = /^\d+$/.test(toRaw) ? byNumber(toRaw) : toRaw;
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

            vscode.postMessage({
                type: 'generateFlow',
                payload: {
                    states: genFlowState.states,
                    transitions: genFlowState.transitions
                }
            });
            backdrop.remove();
        });
    }

    function openCopyActorForm(stateName, actorName) {
        const stateDet = stateDetails[stateName];
        if (!stateDet) { showAlert('Нет данных для состояния ' + stateName); return; }
        const sourceActor = (stateDet.permissions || []).find(x => x.actor === actorName);
        if (!sourceActor) { showAlert('Актор не найден: ' + actorName); return; }

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
                const det = stateDetails[st];
                const exists = det && (det.permissions || []).some(x => x.actor === newName);
                if (exists) skipped.push(st);
                else willApply.push(st);
            }

            const lines = [];
            lines.push('Источник: ' + actorName + ' @ ' + stateName);
            lines.push('Новое имя: ' + newName);
            lines.push('Выбрано состояний: ' + targetStates.length);
            if (willApply.length) lines.push('  • добавлено в: ' + willApply.join(', '));
            if (skipped.length) lines.push('  • пропущено (актор уже есть): ' + skipped.join(', '));

            if (!willApply.length) {
                showAlert(lines.join('\n') + '\n\nНечего копировать.');
                return;
            }
            lines.push('');
            lines.push('Будет изменён configuration.json.');

            const ok = await showConfirm(lines.join('\n'), 'Копирование актора');
            if (!ok) return;

            vscode.postMessage({
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

    function openAuthForm() {
        const auth = DATA.auth || {};
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
        const allRoles = auth.allRoles || [];
        const allActors = meta.actors || [];

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

                const roleSel = tr.querySelector('.f-auth-role-sel');
                const roleCustom = tr.querySelector('.f-auth-role-custom');
                const actorSel = tr.querySelector('.f-auth-actor-sel');

                const roleEmpty = !r.role || !String(r.role).trim();
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

            vscode.postMessage({
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

    function validateFlow() {
        const graphStates = (DATA.graph && DATA.graph.states) || [];
        const graphTransitions = (DATA.graph && DATA.graph.transitions) || [];
        const initialState = DATA.graph && DATA.graph.initialState;
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
        const s = graphData.states.find(x => x.name === name);
        if (!s) return;
        viewBox.x = s.x + s.w / 2 - viewBox.w / 2;
        viewBox.y = s.y + s.h / 2 - viewBox.h / 2;
        applyViewBox();
    }

    function openValidationForm() {
        const container = document.getElementById('modalContainer');
        const backdrop = cloneTemplate('tpl-validate-modal');
        container.appendChild(backdrop);

        const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
                        if (viewMode !== 'graph') {
                            viewMode = 'graph';
                            persistState();
                            applyViewMode();
                        }
                        setTimeout(() => {
                            selectedStates.clear();
                            selectedTransitions.clear();
                            selectedStates.add(stName);
                            updateSelectionClasses();
                            updateSelectionToolbar();
                            centerOnState(stName);
                        }, 60);
                    } else if (trName) {
                        openTransitionForm(trName);
                    }
                });
            });
        }

        backdrop.querySelector('[data-act="refresh"]').addEventListener('click', render);
        backdrop.querySelector('[data-act="close"]').addEventListener('click', () => backdrop.remove());

        render();
    }

    function openRelationsForm() {
        const rel = DATA.relations || {};
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
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

        const body = backdrop.querySelector('.relations-body');

        if (!list.length) {
            body.innerHTML = '<div class="hint">Связи не найдены.</div>';
            backdrop.querySelector('[data-act="close"]').addEventListener('click', () => backdrop.remove());
            return;
        }

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
                const stateOk = !r.isMine || (DATA.graph && DATA.graph.states || [])
                    .some(s => s.name === st.name);
                const stateCell = stateOk
                    ? '<code>' + esc(st.name) + '</code>'
                    : '<code style="color:#c33">' + esc(st.name) + ' ⚠</code>';
                const actorsCell = (st.actors || []).map(a => {
                    const actorOk = !r.isMine || (meta.actors || []).includes(a);
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
     * BIND
     * ============================================================ */
    injectIcons(document);
    applyToolbarPosition();

    document.getElementById('addBtn').addEventListener('click', openAddForm);
    document.getElementById('reloadBtn').addEventListener('click', () =>
        vscode.postMessage({ type: 'reload' })
    );
    document.getElementById('collapseAllBtn').addEventListener('click', () => applyAllCollapsed(true));
    document.getElementById('expandAllBtn').addEventListener('click', () => applyAllCollapsed(false));

    const editBtn = document.getElementById('editSelectedBtn');
    if (editBtn) editBtn.addEventListener('click', editSelected);
    const delBtn = document.getElementById('deleteSelectedBtn');
    if (delBtn) delBtn.addEventListener('click', deleteSelected);

    const autoLayoutBtn = document.getElementById('autoLayoutBtn');
    if (autoLayoutBtn) autoLayoutBtn.addEventListener('click', () => { autoLayout(); });

    const zoomInput = document.getElementById('zoomInput');
    if (zoomInput) {
        zoomInput.addEventListener('change', () => {
            const v = parseFloat(zoomInput.value);
            if (isFinite(v) && v > 0) setZoomPercent(v);
            else syncZoomInput();
        });
        zoomInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); zoomInput.blur(); }
        });
    }

    const genBtn = document.getElementById('generateFlowBtn');
    if (genBtn) genBtn.addEventListener('click', openGenerateFlowForm);

    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.addEventListener('click', openAuthForm);

    const validateBtn = document.getElementById('validateBtn');
    if (validateBtn) validateBtn.addEventListener('click', openValidationForm);

    const relationsBtn = document.getElementById('relationsBtn');
    if (relationsBtn) relationsBtn.addEventListener('click', openRelationsForm);

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

    if (layoutDirBtn) {
        layoutDirBtn.addEventListener('click', () => {
            layoutRankDir = (layoutRankDir === 'TB') ? 'LR' : 'TB';
            persistState();
            updateLayoutDirBtn();
        });
    }
    updateLayoutDirBtn();

    if (labelsToggleBtn) {
        labelsToggleBtn.addEventListener('click', () => {
            showTransitionLabels = !showTransitionLabels;
            persistState();
            updateLabelsToggleBtn();
            renderGraph();
            applyViewBox();
        });
    }
    updateLabelsToggleBtn();

    window.addEventListener('resize', adjustBodyPaddingForToolbar);

    document.addEventListener('keydown', (ev) => {
        if (viewMode !== 'graph') return;
        if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
        const t = ev.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (!selectedStates.size && !selectedTransitions.size) return;
        ev.preventDefault();
        deleteSelected();
    });

    updateSortIndicator();
    renderTable();
    document.getElementById('metaInfo').textContent =
        'состояний: ' + meta.states.length + ', акторов: ' + meta.actors.length;

    rerouteAll();
    applyViewMode();
    updateSelectionToolbar();
})();