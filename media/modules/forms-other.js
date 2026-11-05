(function () {
    'use strict';

    window.PF = window.PF || {};

    const { cloneTemplate, showAlert, showConfirm } = PF.utils;

    /* Акторы, для которых переход считается «системным».
    Если у перехода права есть ТОЛЬКО у этих акторов (или прав нет вовсе),
    требуется broadcastEvent.serverSideEvents = true в documentFlow.json.
    Чтобы расширить список — допиши сюда имя актора. */
    const SERVER_SIDE_ONLY_ACTORS = ['System', 'ServiceExecutor'];

    /* ============================================================
     * ВАЛИДАТОР
     * ============================================================ */
    function validateFlow() {
        const graphData = PF.state.graphData || { states: [], transitions: [] };
        const DATA = PF.state.DATA || {};
        const meta = PF.state.meta || { translations: { stateTrans: {}, transTrans: {} } };

        const graphStates = graphData.states || [];
        const graphTransitions = graphData.transitions || [];
        const initialState = graphData.initialState;
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
            missingServerSideEvents: [],
            actorsWithoutRoles: [],
            relations: [],
            localeIssues: []
        };
        // Расхождения ключей локализации — приходят с сервера в DATA.
        if (Array.isArray(DATA.localeIssues)) {
            issues.localeIssues = DATA.localeIssues.slice();
        }

        if (!initialState) {
            issues.unreachable.push({ name: null, note: PF.ui.t('validate.initialStateMissing') });
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

        const curLang = (PF.state && PF.state.selectedLang) || 'ru-RU';
        const stateTransAll = (meta.translations && meta.translations.stateTransAll) || {};
        const transTransAll = (meta.translations && meta.translations.transTransAll) || {};

        for (const s of graphStates) {
            const m = stateTransAll[s.name] || {};
            const v = m[curLang] || (curLang === 'ru-RU' ? stateTrans[s.name] : '');
            if (!v || !String(v).trim()) issues.missingStateTranslations.push({ name: s.name });
        }
        for (const t of graphTransitions) {
            const m = transTransAll[t.name] || {};
            const v = m[curLang] || (curLang === 'ru-RU' ? transTrans[t.name] : '');
            if (!v || !String(v).trim()) issues.missingTransitionTranslations.push({ name: t.name });
        }

        for (const r of (DATA.rows || [])) {
            if (!r.perms || !r.perms.length) issues.noActors.push({ name: r.stateName });
        }

        const serverOnlySet = new Set(SERVER_SIDE_ONLY_ACTORS);
        const transitionActors = {};
        for (const row of (DATA.rows || [])) {
            for (const p of (row.perms || [])) {
                for (const tr of (p.transitions || [])) {
                    const n = (typeof tr === 'string') ? tr : (tr && tr.name);
                    if (!n) continue;
                    if (!transitionActors[n]) transitionActors[n] = new Set();
                    transitionActors[n].add(p.actor);
                }
            }
        }
        for (const t of graphTransitions) {
            if (t.serverSideEvents) continue;
            const actors = transitionActors[t.name] || new Set();
            const onlyServerSide = [...actors].every(a => serverOnlySet.has(a));
            if (!onlyServerSide) continue;
            issues.missingServerSideEvents.push({
                name: t.name,
                actors: [...actors]
            });
        }

        {
            const auth = DATA.auth || {};
            const actorRoles = auth.actorRoles || {};
            const authFound = !!auth.found;

            const actorsSet = new Set();
            for (const a of (meta.actors || [])) if (a) actorsSet.add(a);
            for (const r of (DATA.rows || [])) {
                for (const p of (r.perms || [])) if (p.actor) actorsSet.add(p.actor);
            }

            for (const a of actorsSet) {
                const roles = actorRoles[a];
                if (!authFound || !Array.isArray(roles) || !roles.length) {
                    issues.actorsWithoutRoles.push({ name: a });
                }
            }
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

        // Заголовок
        const titleEl = backdrop.querySelector('h2');
        if (titleEl) titleEl.textContent = PF.ui.t('validate.title');

        // Кнопки
        const refreshBtn = backdrop.querySelector('[data-act="refresh"]');
        if (refreshBtn) refreshBtn.textContent = PF.ui.t('validate.btn.refresh');
        const closeBtn = backdrop.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.textContent = PF.ui.t('validate.btn.close');

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
                issues.missingServerSideEvents.length +
                issues.actorsWithoutRoles.length +
                issues.relations.length +
                issues.localeIssues.length;

            summary.textContent = total === 0
                ? PF.ui.t('validate.summary.ok')
                : PF.ui.t('validate.summary.issues', { n: String(total) });
            summary.classList.toggle('ok', total === 0);

            const trs = (PF.state.meta && PF.state.meta.translations) || {};
            const stateTransAll = trs.stateTransAll || {};
            const stateTrans = trs.stateTrans || {};
            const transTransAll = trs.transTransAll || {};
            const transTrans = trs.transTrans || {};
            const actorTransAll = trs.actorTransAll || {};
            const actorTrans = trs.actorTrans || {};

            const stateLabel = (n) => escHtml(
                PF.i18n.label(n, { trans: stateTransAll[n], ru: stateTrans[n] })
            );
            const transLabel = (n) => escHtml(
                PF.i18n.label(n, { trans: transTransAll[n], ru: transTrans[n] })
            );
            const actorLabel = (n) => escHtml(
                PF.i18n.label(n, { trans: actorTransAll[n], ru: actorTrans[n] })
            );

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

            const curLang = (PF.state && PF.state.selectedLang) || 'ru-RU';

            section(PF.ui.t('validate.section.unreachable'), issues.unreachable, it => {
                if (it.note) return '<span style="opacity:.8">' + escHtml(it.note) + '</span>';
                return '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + stateLabel(it.name) + '</a>';
            }, PF.ui.t('validate.empty.unreachable'));

            section(PF.ui.t('validate.section.terminal'), issues.terminalWithOutgoing,
                it =>
                    '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + stateLabel(it.name) + '</a>' +
                    ' — ' + PF.ui.t('validate.terminalTransitions', {
                        list: it.transitions.map(x => '<code>' + transLabel(x) + '</code>').join(', ')
                    }),
                PF.ui.t('validate.empty.terminal'));

            section(PF.ui.t('validate.section.missingStateTr', { lang: curLang }), issues.missingStateTranslations,
                it => '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + stateLabel(it.name) + '</a>',
                PF.ui.t('validate.empty.missingStateTr'));

            section(PF.ui.t('validate.section.missingTransTr', { lang: curLang }), issues.missingTransitionTranslations,
                it => '<a class="validate-link" data-transition="' + escHtml(it.name) + '">' + transLabel(it.name) + '</a>',
                PF.ui.t('validate.empty.missingTransTr'));

            section(PF.ui.t('validate.section.noActors'), issues.noActors,
                it => '<a class="validate-link" data-state="' + escHtml(it.name) + '">' + stateLabel(it.name) + '</a>',
                PF.ui.t('validate.empty.noActors'));

            section(PF.ui.t('validate.section.systemTransitions'), issues.missingServerSideEvents,
                it => {
                    const actorsList = it.actors.length
                        ? it.actors.map(a => '<code>' + actorLabel(a) + '</code>').join(', ')
                        : '<i>' + escHtml(PF.ui.t('validate.noActorsWithRights')) + '</i>';
                    return '<a class="validate-link" data-transition="' + escHtml(it.name) + '">' +
                        transLabel(it.name) + '</a>' +
                        ' — ' + PF.ui.t('validate.actorsPrefix', { list: actorsList }) +
                        ' — ' + PF.ui.t('validate.requireServerSide');
                },
                PF.ui.t('validate.empty.systemTransitions'));

            section(PF.ui.t('validate.section.relations'), issues.relations,
                it => '<code>' + escHtml(it.name) + '</code> — ' + escHtml(it.note),
                PF.ui.t('validate.empty.relations'));

            section(PF.ui.t('validate.section.actorsWithoutRoles'), issues.actorsWithoutRoles,
                it => '<a class="validate-link" data-actor="' + escHtml(it.name) + '">' +
                    actorLabel(it.name) + '</a>',
                PF.ui.t('validate.empty.actorsWithoutRoles'));

            section(PF.ui.t('validate.section.locales'), issues.localeIssues,
                it => PF.ui.t('validate.localeIssue', {
                    key: escHtml(it.key),
                    scope: escHtml(it.scope),
                    side: PF.ui.t(
                        it.side === 'only-ru'
                            ? 'validate.localeSide.onlyRu'
                            : 'validate.localeSide.onlyEn'
                    )
                }),
                PF.ui.t('validate.empty.locales'));

            body.querySelectorAll('.validate-link').forEach(a => {
                a.addEventListener('click', () => {
                    const stName = a.getAttribute('data-state');
                    const trName = a.getAttribute('data-transition');
                    const actorName = a.getAttribute('data-actor');
                    if (actorName) {
                        if (PF.actors && PF.actors.openActorAuthForm) {
                            PF.actors.openActorAuthForm(actorName);
                        }
                        return;
                    }
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
                        PF.forms.openTransitionForm(trName);
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

        const titleEl = backdrop.querySelector('h2');
        if (titleEl) titleEl.textContent = PF.ui.t('relations.title');

        backdrop.querySelector('.relations-doc-hint').textContent =
            PF.ui.t('relations.currentDoc', { name: rel.docName || '—' });
        const pathEl = backdrop.querySelector('.relations-path-hint');
        if (rel.projectRoot) {
            pathEl.textContent = PF.ui.t('relations.pathProjectRoot', {
                path: rel.path || '',
                root: rel.projectRoot
            });
        } else {
            pathEl.textContent = rel.path || PF.ui.t('relations.notFound');
        }
        pathEl.title = rel.path || '';

        const closeBtn = backdrop.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.textContent = PF.ui.t('common.close');

        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

        const body = backdrop.querySelector('.relations-body');
        body.innerHTML = '';

        if (!list.length) {
            body.innerHTML = '<div class="hint">' + esc(PF.ui.t('relations.empty')) + '</div>';
            closeBtn.addEventListener('click', () => backdrop.remove());
            return;
        }

        const metaActors = (PF.state.meta && PF.state.meta.actors) || [];

        const outgoing = list.filter(r => r.isOutgoing);
        const incoming = list.filter(r => r.isIncoming && !r.isOutgoing);

        function renderCard(r) {
            const card = document.createElement('div');
            card.className = 'relation-card';
            if (r.isOutgoing) card.classList.add('mine');
            if (r.isIncoming && !r.isOutgoing) card.classList.add('incoming');
            if (r.issues && r.issues.length) card.classList.add('has-issues');

            const isDuplicate = r.duplicateAcrossPackages && r.duplicateAcrossPackages.length > 1;

            const badges = [];
            if (r.isOutgoing) badges.push('<span class="badge mine">' + esc(PF.ui.t('relations.badge.outgoing')) + '</span>');
            if (r.isIncoming && !r.isOutgoing) badges.push('<span class="badge incoming">' + esc(PF.ui.t('relations.badge.incoming')) + '</span>');
            if (r.isCurrentPackage) {
                badges.push('<span class="badge pkg">' + esc(PF.ui.t('relations.badge.currentPkg')) + '</span>');
            } else if (r.pkgName) {
                badges.push('<span class="badge pkg">' + esc(r.pkgName) + '</span>');
            }

            if (r.overrides && r.overrides.length) {
                badges.push('<span class="badge override" title="' + esc(r.overrides.join(', ')) + '">' +
                    esc(PF.ui.t('relations.badge.override', { pkgs: r.overrides.join(', ') })) + '</span>');
            }

            if (isDuplicate) {
                badges.push('<span class="badge issues">' + esc(PF.ui.t('relations.badge.duplicate')) + '</span>');
            } else if (r.issues && r.issues.length) {
                badges.push('<span class="badge issues">' +
                    esc(PF.ui.t('relations.badge.issues', { n: String(r.issues.length) })) + '</span>');
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
                '<th style="width:180px">' + esc(PF.ui.t('relations.col.state')) + '</th>' +
                '<th>' + esc(PF.ui.t('relations.col.actors')) + '</th></tr></thead><tbody>';
            for (const st of (r.sourceDocumentStates || [])) {
                const stateOk = !r.isOutgoing || (PF.state.graphData && PF.state.graphData.states || [])
                    .some(s => s.name === st.name);
                const stateCell = stateOk
                    ? '<code>' + esc(st.name) + '</code>'
                    : '<code style="color:#c33">' + esc(st.name) + ' ⚠</code>';
                const actorsCell = (st.actors || []).map(a => {
                    const actorOk = !r.isOutgoing || metaActors.includes(a);
                    return actorOk
                        ? '<code>' + esc(a) + '</code>'
                        : '<code style="color:#c33">' + esc(a) + ' ⚠</code>';
                }).join(', ');
                html += '<tr><td>' + stateCell + '</td><td>' + actorsCell + '</td></tr>';
            }
            html += '</tbody></table>';

            if (r.issues && r.issues.length) {
                html += '<div class="relation-issues"><b>' + esc(PF.ui.t('relations.issues')) + '</b><ul>' +
                    r.issues.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
            }

            card.innerHTML = html;
            return card;
        }

        function addSection(text, items) {
            if (!items.length) return;
            const h = document.createElement('h3');
            h.className = 'relations-section-title';
            h.textContent = text + ' (' + items.length + ')';
            body.appendChild(h);
            for (const r of items) body.appendChild(renderCard(r));
        }

        addSection(PF.ui.t('relations.section.outgoing'), outgoing);
        addSection(PF.ui.t('relations.section.incoming'), incoming);

        closeBtn.addEventListener('click', () => backdrop.remove());
    }

    /* ============================================================
     * АВТОРИЗАЦИЯ
     * ============================================================ */
    function openAuthForm() {
        const auth = (PF.state.DATA && PF.state.DATA.auth) || {};
        if (!auth.found) {
            showAlert(
                PF.ui.t('auth.fileNotFound'),
                PF.ui.t('auth.fileNotFound.title')
            );
            return;
        }

        const container = document.getElementById('modalContainer');
        const backdrop = cloneTemplate('tpl-auth-modal');
        container.appendChild(backdrop);

        const titleEl = backdrop.querySelector('h2');
        if (titleEl) titleEl.textContent = PF.ui.t('auth.title');

        backdrop.querySelector('.auth-doc-hint').textContent =
            PF.ui.t('auth.docHint', { name: auth.docName });
        const pathEl = backdrop.querySelector('.auth-path-hint');
        pathEl.textContent = auth.path || '';
        pathEl.title = auth.path || '';

        // Кнопки footer
        const addRowBtn = backdrop.querySelector('[data-act="add-row"]');
        if (addRowBtn) addRowBtn.textContent = PF.ui.t('auth.addRow');
        const cancelBtn = backdrop.querySelector('[data-act="cancel"]');
        if (cancelBtn) cancelBtn.textContent = PF.ui.t('common.cancel');
        const submitBtn = backdrop.querySelector('[data-act="submit"]');
        if (submitBtn) submitBtn.textContent = PF.ui.t('common.save');

        const localRows = (auth.rows || []).map(r => ({
            role: r.role, actor: r.actor, op: r.op || 'Add'
        }));

        const tbody = backdrop.querySelector('.f-auth-rows');
        const allRoles = auth.allRoles || [];
        const allActors = (PF.state.meta && PF.state.meta.actors) || [];

        function buildRoleCell(r) {
            const td = document.createElement('td');
            const sel = document.createElement('select');
            sel.className = 'f-auth-role-sel';

            const ph = document.createElement('option');
            ph.value = '';
            ph.textContent = PF.ui.t('common.select');
            sel.appendChild(ph);

            for (const role of allRoles) {
                const opt = document.createElement('option');
                opt.value = role;
                opt.textContent = role;
                sel.appendChild(opt);
            }
            const newOpt = document.createElement('option');
            newOpt.value = '__NEW__';
            newOpt.textContent = PF.ui.t('auth.newRoleOption');
            sel.appendChild(newOpt);

            const custom = document.createElement('input');
            custom.type = 'text';
            custom.className = 'f-auth-role-custom';
            custom.placeholder = PF.ui.t('auth.newRolePlaceholder');
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
            ph.textContent = PF.ui.t('common.select');
            sel.appendChild(ph);

            const trs = (PF.state.meta && PF.state.meta.translations) || {};
            const actorTransAll = trs.actorTransAll || {};
            const actorTrans = trs.actorTrans || {};

            for (const a of allActors) {
                const opt = document.createElement('option');
                opt.value = a;
                opt.textContent = PF.i18n.label(a, {
                    trans: actorTransAll[a],
                    ru: actorTrans[a]
                });
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
                td.textContent = PF.ui.t('auth.empty');
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
                delBtn.title = PF.ui.t('auth.removeRow');
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
                showAlert(PF.ui.t('auth.validationEmpty'));
                if (invalidInputs[0] && invalidInputs[0].focus) invalidInputs[0].focus();
                return;
            }

            const seen = new Set();
            for (const r of localRows) {
                const key = String(r.role).trim() + '|' + r.actor + '|' + r.op;
                if (seen.has(key)) {
                    showAlert(PF.ui.t('auth.duplicate', {
                        role: r.role, actor: r.actor, op: r.op
                    }));
                    return;
                }
                seen.add(key);
            }

            const ok = await showConfirm(
                PF.ui.t('auth.confirmSave', {
                    doc: auth.docName,
                    n: String(localRows.length),
                    path: auth.path || ''
                }),
                PF.ui.t('auth.confirmSave.title')
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
        if (!stateDet) {
            showAlert(PF.ui.t('copyActor.alert.noData', { name: stateName }));
            return;
        }
        const sourceActor = (stateDet.permissions || []).find(x => x.actor === actorName);
        if (!sourceActor) {
            showAlert(PF.ui.t('copyActor.alert.actorNotFound', { name: actorName }));
            return;
        }

        const meta = PF.state.meta;
        const container = document.getElementById('modalContainer');
        const backdrop = cloneTemplate('tpl-copy-actor-modal');
        container.appendChild(backdrop);

        const titleEl = backdrop.querySelector('h2');
        if (titleEl) titleEl.textContent = PF.ui.t('copyActor.title');

        const trs = (PF.state.meta && PF.state.meta.translations) || {};
        const actorTransAll = trs.actorTransAll || {};
        const actorTrans = trs.actorTrans || {};
        const actorLabel = PF.i18n.label(actorName, {
            trans: actorTransAll[actorName],
            ru: actorTrans[actorName]
        });

        const sourceEl = backdrop.querySelector('.f-copy-source');
        const sourceHint = sourceEl ? sourceEl.closest('.hint') : null;
        if (sourceEl) {
            sourceEl.textContent = actorLabel + ' @ ' + stateName;
        }
        if (sourceHint) {
            sourceHint.innerHTML = PF.ui.t('copyActor.source', {
                source: '<b>' + actorLabel + ' @ ' + stateName + '</b>'
            }).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        }

        // Labels в HTML
        const nameLabel = backdrop.querySelectorAll('.form-row label')[0];
        if (nameLabel) nameLabel.textContent = PF.ui.t('copyActor.nameLabel');
        const statesLabel = backdrop.querySelectorAll('.form-row label')[1];
        if (statesLabel) statesLabel.textContent = PF.ui.t('copyActor.statesLabel');

        // Hint под именем — второй .hint в форме
        const hints = backdrop.querySelectorAll('.hint');
        if (hints.length >= 2) {
            hints[hints.length - 1].textContent = PF.ui.t('copyActor.nameHint');
        }

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
            const stateTransAll = (meta.translations && meta.translations.stateTransAll) || {};
            const stateRu = (meta.translations && meta.translations.stateTrans && meta.translations.stateTrans[st]) || st;
            txt.textContent = PF.i18n.label(st, { trans: stateTransAll[st] || {}, ru: stateRu });
            label.appendChild(txt);

            statesCont.appendChild(label);
        }

        const cancelBtn = backdrop.querySelector('[data-act="cancel"]');
        if (cancelBtn) cancelBtn.textContent = PF.ui.t('common.cancel');
        const submitBtn = backdrop.querySelector('[data-act="submit"]');
        if (submitBtn) submitBtn.textContent = PF.ui.t('copyActor.btn.copy');

        backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => backdrop.remove());

        backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
            const newName = nameInput.value.trim();
            nameInput.classList.remove('input-error');

            if (!newName) {
                nameInput.classList.add('input-error');
                showAlert(PF.ui.t('copyActor.alert.noName'));
                nameInput.focus();
                return;
            }
            if (!selected.size) {
                showAlert(PF.ui.t('copyActor.alert.noStates'));
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
            lines.push(PF.ui.t('copyActor.confirm.source', { source: actorLabel + ' @ ' + stateName }));
            lines.push(PF.ui.t('copyActor.confirm.newName', { name: newName }));
            lines.push(PF.ui.t('copyActor.confirm.selected', { n: String(targetStates.length) }));
            if (willApply.length) {
                lines.push(PF.ui.t('copyActor.confirm.applied', { list: willApply.join(', ') }));
            }
            if (skipped.length) {
                lines.push(PF.ui.t('copyActor.confirm.skipped', { list: skipped.join(', ') }));
            }

            if (!willApply.length) {
                showAlert(lines.join('\n') + '\n\n' + PF.ui.t('copyActor.nothing'));
                return;
            }
            lines.push('');
            lines.push(PF.ui.t('copyActor.confirm.change'));

            const ok = await showConfirm(lines.join('\n'), PF.ui.t('copyActor.alert.noNameConfirmed.title'));
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
    function applyLangToTable(root) {
        if (!root) return;
        const lang = (PF.state && PF.state.selectedLang) || 'ru-RU';
        const isEn = (lang === 'en-US');
        root.querySelectorAll('[data-tr-col]').forEach(el => {
            el.textContent = PF.ui.t('genFlow.col.translation') + ' ' + lang;
            el.style.display = isEn ? 'none' : '';
        });
        root.querySelectorAll('[data-tr-td]').forEach(el => {
            el.style.display = isEn ? 'none' : '';
        });
    }

    function openGenerateFlowForm() {
        const container = document.getElementById('modalContainer');
        const backdrop = cloneTemplate('tpl-generate-flow-modal');
        container.appendChild(backdrop);

        // Заголовок + hint + кнопки
        const titleEl = backdrop.querySelector('h2');
        if (titleEl) titleEl.textContent = PF.ui.t('genFlow.title');

        const hintEl = backdrop.querySelector('p.hint');
        if (hintEl) hintEl.textContent = PF.ui.t('genFlow.hint');

        const sections = backdrop.querySelectorAll('.gen-section h3');
        if (sections.length >= 2) {
            sections[0].textContent = PF.ui.t('genFlow.section.states');
            sections[1].textContent = PF.ui.t('genFlow.section.transitions');
        }

        const addStatesBtn = backdrop.querySelector('[data-act="add-states"]');
        if (addStatesBtn) addStatesBtn.textContent = PF.ui.t('genFlow.btn.addStates');
        const addTransBtn = backdrop.querySelector('[data-act="add-transitions"]');
        if (addTransBtn) addTransBtn.textContent = PF.ui.t('genFlow.btn.addTransitions');
        const cancelBtn = backdrop.querySelector('[data-act="cancel"]');
        if (cancelBtn) cancelBtn.textContent = PF.ui.t('common.cancel');
        const submitBtn = backdrop.querySelector('[data-act="submit"]');
        if (submitBtn) submitBtn.textContent = PF.ui.t('genFlow.btn.submit');

        // Labels и плейсхолдеры textarea
        const statesLabelEl = backdrop.querySelector('textarea.f-gen-states-input');
        if (statesLabelEl) {
            statesLabelEl.placeholder = PF.ui.t('genFlow.statesInput.placeholder');
            const lbl = statesLabelEl.closest('.form-row').querySelector('label');
            if (lbl) lbl.textContent = PF.ui.t('genFlow.statesInput.label');
        }
        const transLabelEl = backdrop.querySelector('textarea.f-gen-transitions-input');
        if (transLabelEl) {
            transLabelEl.placeholder = PF.ui.t('genFlow.transitionsInput.placeholder');
            const lbl = transLabelEl.closest('.form-row').querySelector('label');
            if (lbl) lbl.textContent = PF.ui.t('genFlow.transitionsInput.label');
        }

        // Колонки состояний
        const statesTableHead = backdrop.querySelectorAll('.gen-section')[0]
            .querySelectorAll('thead th');
        if (statesTableHead.length >= 4) {
            statesTableHead[0].textContent = PF.ui.t('genFlow.col.num');
            statesTableHead[1].textContent = PF.ui.t('genFlow.col.code');
            statesTableHead[2].textContent = PF.ui.t('genFlow.col.translation');
        }

        // Колонки переходов
        const transTableHead = backdrop.querySelectorAll('.gen-section')[1]
            .querySelectorAll('thead th');
        if (transTableHead.length >= 5) {
            transTableHead[0].textContent = PF.ui.t('genFlow.col.code');
            transTableHead[1].textContent = PF.ui.t('genFlow.col.from');
            transTableHead[2].textContent = PF.ui.t('genFlow.col.to');
            transTableHead[3].textContent = PF.ui.t('genFlow.col.translation');
        }

        const meta = PF.state.meta;
        const lang = PF.state.selectedLang || 'ru-RU';

        const existingStates = (PF.state.graphData.states || []).map(s => ({
            name: s.name,
            ru: (s.trans && s.trans[lang]) || s.name,
            existing: true
        }));

        const existingTransitions = (PF.state.graphData.transitions || []).map(t => ({
            name: t.name,
            from: t.from,
            to: t.to,
            ru: (t.trans && t.trans[lang]) || t.name,
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
            tdRu.setAttribute('data-tr-td', '');
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
            delBtn.title = s.existing
                ? PF.ui.t('genFlow.tooltip.deleteCascade')
                : PF.ui.t('genFlow.tooltip.remove');
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

            if (existing.length) {
                addSep(PF.ui.t('genFlow.group.existing'));
                existing.forEach(s => tbodyS.appendChild(buildStateRow(s)));
            }
            if (fresh.length) {
                addSep(PF.ui.t('genFlow.group.new'));
                fresh.forEach(s => tbodyS.appendChild(buildStateRow(s)));
            }
            if (!existing.length && !fresh.length) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 4;
                td.className = 'gen-empty';
                td.textContent = PF.ui.t('genFlow.empty.states');
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
            tdRu.setAttribute('data-tr-td', '');
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
            delBtn.title = t.existing
                ? PF.ui.t('genFlow.tooltip.deleteCascade')
                : PF.ui.t('genFlow.tooltip.remove');
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

            if (existing.length) {
                addSep(PF.ui.t('genFlow.group.existing'));
                existing.forEach(t => tbodyT.appendChild(buildTransitionRow(t)));
            }
            if (fresh.length) {
                addSep(PF.ui.t('genFlow.group.new'));
                fresh.forEach(t => tbodyT.appendChild(buildTransitionRow(t)));
            }
            if (!existing.length && !fresh.length) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 5;
                td.className = 'gen-empty';
                td.textContent = PF.ui.t('genFlow.empty.transitions');
                tr.appendChild(td);
                tbodyT.appendChild(tr);
            }
        }

        renderStatesTable();
        renderTransitionsTable();
        applyLangToTable(backdrop);

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
            applyLangToTable(backdrop);
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
            applyLangToTable(backdrop);
        });

        backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => {
            backdrop.remove();
        });

        backdrop.querySelector('[data-act="submit"]').addEventListener('click', async () => {
            const seenS = new Set();
            for (const s of genFlowState.states) {
                if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s.name)) {
                    showAlert(PF.ui.t('genFlow.alert.invalidStateCode', { name: s.name }));
                    return;
                }
                if (seenS.has(s.name)) {
                    showAlert(PF.ui.t('genFlow.alert.duplicateState', { name: s.name }));
                    return;
                }
                seenS.add(s.name);
            }
            const seenT = new Set();
            for (const t of genFlowState.transitions) {
                if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(t.name)) {
                    showAlert(PF.ui.t('genFlow.alert.invalidTransCode', { name: t.name }));
                    return;
                }
                if (seenT.has(t.name)) {
                    showAlert(PF.ui.t('genFlow.alert.duplicateTrans', { name: t.name }));
                    return;
                }
                seenT.add(t.name);
            }

            const hasExisting = genFlowState.states.some(s => s.existing) ||
                genFlowState.transitions.some(t => t.existing);
            const key = hasExisting ? 'genFlow.confirm.update' : 'genFlow.confirm.create';
            const titleKey = hasExisting ? 'genFlow.confirm.update.title' : 'genFlow.confirm.create.title';

            const ok = await showConfirm(
                PF.ui.t(key, {
                    states: String(genFlowState.states.length),
                    transitions: String(genFlowState.transitions.length)
                }),
                PF.ui.t(titleKey)
            );
            if (!ok) return;

            PF.vscode.postMessage({
                type: 'generateFlow',
                payload: {
                    states: genFlowState.states,
                    transitions: genFlowState.transitions,
                    lang: PF.state.selectedLang || 'ru-RU'
                }
            });
            backdrop.remove();
        });
    }

    /* ============================================================
     * ВЛОЖЕНИЯ (AttachmentType)
     * ============================================================ */
    function openAttachmentsForm() {
        const DATA = PF.state.DATA || {};
        const meta = PF.state.meta || {};
        const catalog = meta.attachmentTypeCatalog || { codes: [], translations: {}, translationsAll: {} };
        const codes = (catalog.codes || []).slice();
        const trans = catalog.translations || {};
        const transAll = catalog.translationsAll || {};

        const docAttachments = (meta.attachments || []).slice();

        const container = document.getElementById('modalContainer');
        const backdrop = cloneTemplate('tpl-attachments-modal');
        container.appendChild(backdrop);

        const titleEl = backdrop.querySelector('h2');
        if (titleEl) titleEl.textContent = PF.ui.t('attachmentsForm.title');

        const pathEl = backdrop.querySelector('.attachments-path-hint');
        const catalogPath = DATA.attachmentTypePath || PF.ui.t('attachmentsForm.pathHint.notFound');
        pathEl.textContent = catalogPath;
        pathEl.title = catalogPath;

        // Секции
        const sections = backdrop.querySelectorAll('.att-section h3');
        if (sections.length >= 2) {
            sections[0].textContent = PF.ui.t('attachmentsForm.section.catalog');
            sections[1].textContent = PF.ui.t('attachmentsForm.section.doc');
        }
        const sectionHints = backdrop.querySelectorAll('.att-section > .hint');
        if (sectionHints.length >= 2) {
            sectionHints[0].textContent = PF.ui.t('attachmentsForm.section.catalogHint');
            sectionHints[1].textContent = PF.ui.t('attachmentsForm.section.docHint');
        }

        const addTypeBtn = backdrop.querySelector('[data-act="add-type"]');
        if (addTypeBtn) addTypeBtn.textContent = PF.ui.t('attachmentsForm.btn.addType');
        const addDocBtn = backdrop.querySelector('[data-act="add-doc"]');
        if (addDocBtn) addDocBtn.textContent = PF.ui.t('attachmentsForm.btn.addDoc');
        const closeBtn = backdrop.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.textContent = PF.ui.t('common.close');

        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

        const catalogList = backdrop.querySelector('.att-catalog-list');
        const docList = backdrop.querySelector('.att-doc-list');
        const pendingHint = backdrop.querySelector('.att-pending-hint');

        const pending = [];

        function refreshPendingHint() {
            if (!pending.length) {
                pendingHint.style.display = 'none';
                pendingHint.textContent = '';
                return;
            }
            pendingHint.style.display = '';
            pendingHint.textContent = PF.ui.t('attachmentsForm.pending', { list: pending.join(', ') });
        }

        function renderCatalog() {
            catalogList.innerHTML = '';
            if (!codes.length && !pending.length) {
                catalogList.innerHTML = '<div class="hint">' + esc(PF.ui.t('attachmentsForm.catalogEmpty')) + '</div>';
                return;
            }
            for (const code of codes) {
                const row = document.createElement('div');
                row.className = 'att-row';
                const isPending = pending.includes(code);
                const isInDoc = docAttachments.includes(code);

                let html = '<span class="att-code">' + esc(code) + '</span>';
                const trLabel = PF.i18n.tr({ trans: transAll[code] });
                if (trLabel) html += ' <span class="att-ru">(' + esc(trLabel) + ')</span>';
                if (isInDoc) html += ' <span class="badge pkg">' + esc(PF.ui.t('attachmentsForm.badge.inDoc')) + '</span>';
                if (isPending) html += ' <span class="badge issues">' + esc(PF.ui.t('attachmentsForm.badge.new')) + '</span>';

                const actions = document.createElement('span');
                actions.className = 'att-actions';

                if (!isPending) {
                    const delBtn = document.createElement('button');
                    delBtn.className = 'danger small';
                    delBtn.textContent = '×';
                    delBtn.title = PF.ui.t('attachmentsForm.tooltip.removeFromCatalog');
                    delBtn.addEventListener('click', async () => {
                        const ok = await showConfirm(
                            PF.ui.t('attachmentsForm.confirmRemoveType', { code }),
                            PF.ui.t('attachmentsForm.confirmRemoveType.title')
                        );
                        if (!ok) return;
                        PF.vscode.postMessage({ type: 'removeAttachmentType', code });
                        backdrop.remove();
                    });
                    actions.appendChild(delBtn);
                } else {
                    const undoBtn = document.createElement('button');
                    undoBtn.className = 'secondary small';
                    undoBtn.textContent = '↩';
                    undoBtn.title = PF.ui.t('attachmentsForm.tooltip.undo');
                    undoBtn.addEventListener('click', () => {
                        PF.vscode.postMessage({ type: 'removeAttachmentType', code });
                        const i = pending.indexOf(code);
                        if (i >= 0) pending.splice(i, 1);
                        const ci = codes.indexOf(code);
                        if (ci >= 0) codes.splice(ci, 1);
                        delete trans[code];
                        delete transAll[code];
                        refreshPendingHint();
                        renderCatalog();
                    });
                    actions.appendChild(undoBtn);
                }

                row.innerHTML = html;
                row.appendChild(actions);
                catalogList.appendChild(row);
            }
        }

        function renderDoc() {
            docList.innerHTML = '';
            if (!docAttachments.length) {
                docList.innerHTML = '<div class="hint">' + esc(PF.ui.t('attachmentsForm.docEmpty')) + '</div>';
                return;
            }
            for (const code of docAttachments) {
                const row = document.createElement('div');
                row.className = 'att-row';
                const trLabel = PF.i18n.tr({ trans: transAll[code] });
                let html = '<span class="att-code">' + esc(code) + '</span>';
                if (trLabel) html += ' <span class="att-ru">(' + esc(trLabel) + ')</span>';
                if (!codes.includes(code)) {
                    html += ' <span class="badge issues" title="' +
                        esc(PF.ui.t('attachmentsForm.tooltip.notInCatalog')) + '">' +
                        esc(PF.ui.t('attachmentsForm.badge.notInCatalog')) + '</span>';
                }
                row.innerHTML = html;

                const actions = document.createElement('span');
                actions.className = 'att-actions';
                const delBtn = document.createElement('button');
                delBtn.className = 'danger small';
                delBtn.textContent = '×';
                delBtn.title = PF.ui.t('attachmentsForm.tooltip.removeFromDoc');
                delBtn.addEventListener('click', async () => {
                    const ok = await showConfirm(
                        PF.ui.t('attachmentsForm.confirmRemoveDoc', { code }),
                        PF.ui.t('attachmentsForm.confirmRemoveDoc.title')
                    );
                    if (!ok) return;
                    PF.vscode.postMessage({ type: 'removeAttachmentFromDoc', code });
                    backdrop.remove();
                });
                actions.appendChild(delBtn);
                row.appendChild(actions);
                docList.appendChild(row);
            }
        }

        renderCatalog();
        renderDoc();
        refreshPendingHint();

        backdrop.querySelector('[data-act="add-type"]').addEventListener('click', async () => {
            const curLang = PF.state.selectedLang || 'ru-RU';
            const isEn = (curLang === 'en-US');

            const code = await PF.utils.showPrompt(PF.ui.t('attachmentsForm.prompt.newTypeCode'), '');
            if (!code) return;
            if (!/^[A-Za-z][A-Za-z0-9_ ]*$/.test(code)) {
                showAlert(PF.ui.t('attachmentsForm.alert.invalidCode', { code }));
                return;
            }
            if (codes.includes(code)) {
                showAlert(PF.ui.t('attachmentsForm.alert.alreadyExists', { code }));
                return;
            }

            let trValue = code;
            if (!isEn) {
                const v = await PF.utils.showPrompt(
                    PF.ui.t('attachmentsForm.prompt.newTypeTranslation', { lang: curLang, code }),
                    code
                );
                if (v == null) return;
                trValue = v || code;
            }

            codes.push(code);
            pending.push(code);
            if (!transAll[code]) transAll[code] = {};
            transAll[code]['en-US'] = code;
            if (!isEn) transAll[code][curLang] = trValue;
            trans[code] = trValue;
            refreshPendingHint();
            renderCatalog();

            PF.vscode.postMessage({
                type: 'addAttachmentType',
                payload: {
                    code,
                    trValue,
                    lang: curLang
                }
            });
        });

        backdrop.querySelector('[data-act="add-doc"]').addEventListener('click', async () => {
            const available = codes.filter(c => !docAttachments.includes(c));
            if (!available.length) {
                showAlert(PF.ui.t('attachmentsForm.catalogEmpty'));
                return;
            }

            const chosen = await pickAttachmentCode(available, trans, transAll);
            if (!chosen) return;

            const mode = await pickAttachmentMode(chosen, transAll);
            if (mode == null) return;

            PF.vscode.postMessage({
                type: 'addAttachmentToDoc',
                payload: { code: chosen, mode }
            });
            backdrop.remove();
        });

        backdrop.querySelector('[data-act="close"]').addEventListener('click', () => {
            PF.vscode.postMessage({ type: 'reload' });
            backdrop.remove();
        });
    }

    function pickAttachmentCode(available, trans, transAll) {
        return new Promise((resolve) => {
            const container = document.getElementById('modalContainer');
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop dialog-backdrop';

            const modal = document.createElement('div');
            modal.className = 'modal dialog';

            const h = document.createElement('h2');
            h.className = 'dlg-title';
            h.textContent = PF.ui.t('attachmentsForm.picker.title');
            modal.appendChild(h);

            const row = document.createElement('div');
            row.className = 'form-row';
            const sel = document.createElement('select');
            for (const code of available) {
                const opt = document.createElement('option');
                opt.value = code;
                const lbl = PF.i18n.label(code, { trans: transAll[code] });
                opt.textContent = lbl;
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

            function close(result) {
                backdrop.remove();
                resolve(result);
            }
            cancelBtn.addEventListener('click', () => close(null));
            okBtn.addEventListener('click', () => close(sel.value));
        });
    }

    function pickAttachmentMode(code, transAll) {
        return new Promise((resolve) => {
            const container = document.getElementById('modalContainer');
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop dialog-backdrop';

            const modal = document.createElement('div');
            modal.className = 'modal dialog';

            const trMap = (transAll && transAll[code]) || {};
            const label = PF.i18n.label(code, { trans: trMap });

            const h = document.createElement('h2');
            h.className = 'dlg-title';
            h.textContent = PF.ui.t('attachmentsForm.mode.title', { code: label });
            modal.appendChild(h);

            const info = document.createElement('div');
            info.className = 'hint';
            info.textContent = PF.ui.t('attachmentsForm.mode.hint');
            modal.appendChild(info);

            const opts = document.createElement('div');
            opts.className = 'form-row';
            opts.innerHTML =
                '<label><input type="radio" name="att-mode" value="none" checked> ' +
                escAttr(PF.ui.t('attachmentsForm.mode.none')) + '</label><br>' +
                '<label><input type="radio" name="att-mode" value="read-all"> ' +
                escAttr(PF.ui.t('attachmentsForm.mode.readAll')) + '</label><br>' +
                '<label><input type="radio" name="att-mode" value="by-template"> ' +
                escAttr(PF.ui.t('attachmentsForm.mode.byTemplate')) + '</label>';
            modal.appendChild(opts);

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

            function close(result) {
                backdrop.remove();
                resolve(result);
            }
            cancelBtn.addEventListener('click', () => close(null));
            okBtn.addEventListener('click', () => {
                const v = opts.querySelector('input[name="att-mode"]:checked');
                close(v ? v.value : 'none');
            });
        });
    }

    function escAttr(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    PF.formsOther = {
        validateFlow,
        centerOnState,
        openValidationForm,
        openRelationsForm,
        openAuthForm,
        openCopyActorForm,
        openGenerateFlowForm,
        openAttachmentsForm
    };
})();