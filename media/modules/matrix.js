(function () {
    'use strict';

    window.PF = window.PF || {};

    /* ---------- аббревиатуры ---------- */

    function makeAbbrs(names) {
        const used = new Set();
        const map = {};
        for (const n of names) map[n] = makeAbbr(n, used);
        return map;
    }

    function makeAbbr(name, used) {
        const parts = String(name).split(/(?=[A-Z])|[\s_\-\.]+/).filter(Boolean);

        // Если первый сегмент — аббревиатура (все заглавные/цифры) длиной >= 3,
        // берём первые 3 буквы от неё: ESBDDataCheck → ESB.
        if (parts[0] && parts[0].length >= 3 &&
            /^[A-Z0-9]+$/.test(parts[0])) {
            return dedupe(parts[0].slice(0, 3), used);
        }

        let abbr = '';
        // 1. Первые буквы сегментов
        for (const p of parts) {
            if (abbr.length >= 3) break;
            if (p[0]) abbr += p[0];
        }
        // 2. Добиваем из сегментов
        for (let pi = 0; pi < parts.length && abbr.length < 3; pi++) {
            const p = parts[pi];
            for (let i = 1; i < p.length && abbr.length < 3; i++) abbr += p[i];
        }
        return dedupe(abbr, used);
    }

    function dedupe(abbr, used) {
        abbr = abbr.toUpperCase();
        if (!used.has(abbr)) { used.add(abbr); return abbr; }
        for (let n = 2; n < 1000; n++) {
            const c = abbr.slice(0, 2) + n;
            if (!used.has(c)) { used.add(c); return c; }
        }
        return abbr;
    }

    /* ---------- рендер ---------- */

    function render() {
        const view = document.getElementById('matrixView');
        if (!view) return;

        const grid = view.querySelector('.matrix-grid');
        const legend = view.querySelector('.matrix-legend');
        grid.innerHTML = '';
        legend.innerHTML = '';

        const states = (PF.state.meta && PF.state.meta.states) || [];
        const transitions = (PF.state.graphData && PF.state.graphData.transitions) || [];
        const stateTrans = (PF.state.meta && PF.state.meta.translations && PF.state.meta.translations.stateTrans) || {};
        const transTrans = (PF.state.meta && PF.state.meta.translations && PF.state.meta.transitions) || {};
        // NB: buildTranslations отдаёт ключ transTrans.
        const transMap = transTrans && Object.keys(transTrans).length
            ? transTrans
            : ((PF.state.meta && PF.state.meta.translations && PF.state.meta.translations.transTrans) || {});

        if (!states.length) {
            grid.innerHTML = '<div class="matrix-empty">Нет состояний</div>';
            return;
        }

        const abbrs = makeAbbrs(states);

        // Терминальные состояния — их строка визуально неактивна.
        const terminalSet = new Set();
        for (const r of (PF.state.DATA && PF.state.DATA.rows) || []) {
            if (r.flags && r.flags.isTerminal) terminalSet.add(r.stateName);
        }

        // Индекс: переход по (from, to) → имя перехода (первый, если вдруг несколько)
        const byPair = new Map();
        for (const t of transitions) {
            const key = t.from + '|' + t.to;
            if (!byPair.has(key)) byPair.set(key, t.name);
        }

        // --- сетка (N+1) x (N+1) ---
        const n = states.length;
        grid.style.gridTemplateColumns = '32px repeat(' + n + ', 34px)';
        grid.style.gridTemplateRows = '32px repeat(' + n + ', 34px)';

        // Угол
        const corner = document.createElement('div');
        corner.className = 'matrix-corner';
        grid.appendChild(corner);

        // Шапка-столбцы
        for (let j = 0; j < n; j++) {
            const col = states[j];
            const th = document.createElement('div');
            th.className = 'matrix-col-h';
            th.textContent = abbrs[col];
            th.dataset.state = col;
            th.title = 'Клик — редактировать состояние\n' + col +
                (stateTrans[col] && stateTrans[col] !== col ? ' (' + stateTrans[col] + ')' : '');
            grid.appendChild(th);
        }

        // Строки
        for (let i = 0; i < n; i++) {
            const rowState = states[i];

            const rowTh = document.createElement('div');
            rowTh.className = 'matrix-row-h';
            if (terminalSet.has(rowState)) rowTh.classList.add('terminal');
            rowTh.textContent = abbrs[rowState];
            rowTh.dataset.state = rowState;
            rowTh.title = 'Клик — редактировать состояние\n' + rowState +
                (stateTrans[rowState] && stateTrans[rowState] !== rowState ? ' (' + stateTrans[rowState] + ')' : '');
            grid.appendChild(rowTh);

            for (let j = 0; j < n; j++) {
                const colState = states[j];
                const td = document.createElement('div');
                td.className = 'matrix-cell';
                if (terminalSet.has(rowState)) td.classList.add('terminal');

                if (i === j) {
                    td.classList.add('diagonal');
                } else {
                    const tName = byPair.get(rowState + '|' + colState);
                    if (tName) {
                        td.classList.add('filled');
                        const tRu = transMap[tName] || tName;
                        td.title = tName + (tRu !== tName ? ' (' + tRu + ')' : '');
                        td.dataset.transition = tName;
                        const icon = document.createElement('span');
                        icon.className = 'matrix-icon';
                        icon.innerHTML = PF.icons.matrixCell;
                        td.appendChild(icon);
                    } else {
                        td.classList.add('empty');
                        td.dataset.from = rowState;
                        td.dataset.to = colState;
                        td.title = 'Двойной клик — создать переход ' + rowState + ' → ' + colState;
                    }
                }

                grid.appendChild(td);
            }
        }

        // --- легенда сокращений (2 колонки) ---
        const items = states.map(s => {
            const ru = stateTrans[s] && stateTrans[s] !== s ? ' (' + stateTrans[s] + ')' : '';
            return '<div class="matrix-legend-row"><span class="matrix-legend-abbr">' +
                escapeHtml(abbrs[s]) + '</span><span class="matrix-legend-name">' +
                escapeHtml(s + ru) + '</span></div>';
        });
        legend.innerHTML = items.join('');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ---------- клики ---------- */

    function attachHandlers() {
        const view = document.getElementById('matrixView');
        if (!view || view.dataset.handlersAttached === '1') return;
        view.dataset.handlersAttached = '1';

        view.addEventListener('click', (ev) => {
            if (ev.button !== 0) return;
            const th = ev.target.closest('.matrix-col-h, .matrix-row-h');
            if (!th) return;
            const name = th.dataset.state;
            if (!name) return;
            if (typeof PF.forms.openEditForm === 'function') {
                PF.forms.openEditForm(name);
            }
        });

        view.addEventListener('contextmenu', async (ev) => {
            const th = ev.target.closest('.matrix-col-h, .matrix-row-h');
            if (th) {
                ev.preventDefault();
                const name = th.dataset.state;
                if (!name) return;
                const ok = await PF.utils.showConfirm(
                    'Удалить состояние «' + name + '» со всеми отсылками?\n\n' +
                    'Будут изменены: documentFlow.json, configuration.json, translation.csv,' +
                    ' documentFlow.ui.json.\n' +
                    'Файлы flowRules/*.js всех переходов этого состояния будут удалены.',
                    'Удаление состояния'
                );
                if (!ok) return;
                PF.vscode.postMessage({ type: 'deleteState', state: name });
                return;
            }

            const td = ev.target.closest('.matrix-cell');
            if (!td) return;
            if (!td.classList.contains('filled')) return;
            ev.preventDefault();
            const tName = td.dataset.transition;
            if (!tName) return;
            const ok = await PF.utils.showConfirm(
                'Удалить переход «' + tName + '»?\n\n' +
                'Будут изменены: documentFlow.json, configuration.json, translation.csv,' +
                ' documentFlow.ui.json.\n' +
                'Файл flowRules/' + tName + '.js также будет удалён.',
                'Удаление перехода'
            );
            if (!ok) return;
            PF.vscode.postMessage({ type: 'deleteTransitions', names: [tName] });
        });

        view.addEventListener('dblclick', (ev) => {
            if (ev.button !== 0) return;
            const td = ev.target.closest('.matrix-cell');
            if (!td) return;
            if (td.classList.contains('terminal')) return;
            if (td.classList.contains('diagonal')) return;

            if (td.classList.contains('empty')) {
                const from = td.dataset.from;
                const to = td.dataset.to;
                if (!from || !to) return;
                if (typeof PF.graphDrag.createDraftTransition === 'function') {
                    PF.graphDrag.createDraftTransition(from, to);
                } else if (typeof PF.forms.openAddTransitionForm === 'function') {
                    PF.forms.openAddTransitionForm({ from, to });
                }
                return;
            }

            if (td.classList.contains('filled')) {
                const t = td.dataset.transition;
                if (t) PF.forms.openTransitionForm(t);
            }
        });
    }

    PF.matrix = {
        render,
        attachHandlers,
        makeAbbrs
    };
})();