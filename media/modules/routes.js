(function () {
    'use strict';

    window.PF = window.PF || {};

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /* ============================================================
     * Модалка
     * ============================================================ */

    function open() {
        const container = document.getElementById('modalContainer');
        const backdrop = PF.utils.cloneTemplate('tpl-routes-modal');

        const meta = (PF.state.DATA && PF.state.DATA.routes) || { docName: '', routes: [] };
        const docName = meta.docName || '—';
        const allRoutes = Array.isArray(meta.routes) ? meta.routes : [];

        backdrop.querySelector('.routes-doc-hint').textContent =
            PF.ui.t('routes.currentDoc', { name: docName });

        const body = backdrop.querySelector('.routes-body');

        function render() {
            body.innerHTML = '';
            const list = allRoutes.filter(r => r.belongsToCurrent);
            if (!list.length) {
                body.appendChild(el('div', 'routes-empty', PF.ui.t('routes.empty')));
                return;
            }
            for (const r of list) {
                body.appendChild(renderRoute(r));
            }
        }

        backdrop.querySelector('[data-act="close"]').addEventListener('click', () => backdrop.remove());

        container.appendChild(backdrop);
        render();
    }

    /* ============================================================
     * Рендер одного маршрута
     * ============================================================ */

    function renderRoute(r) {
        const det = document.createElement('details');
        det.className = 'routes-route';

        const sum = document.createElement('summary');
        sum.className = 'routes-route-summary';

        const title = el('span', 'routes-route-name', r.name);
        sum.appendChild(title);

        const kindBadge = el('span', 'routes-badge routes-badge-kind',
            PF.ui.t('routes.kind.' + r.kind));
        sum.appendChild(kindBadge);

        if (r.belongsToCurrent) {
            sum.appendChild(el('span', 'routes-badge routes-badge-current',
                PF.ui.t('routes.badge.forCurrent')));
        }

        if (r.entityType) {
            sum.appendChild(el('span', 'routes-meta',
                PF.ui.t('routes.entityType', { type: r.entityType })));
        }
        if (r.version) {
            sum.appendChild(el('span', 'routes-meta',
                PF.ui.t('routes.version', { version: r.version })));
        }
        if (r.pkgName) {
            sum.appendChild(el('span', 'routes-meta routes-meta-pkg',
                PF.ui.t('routes.pkg', { name: r.pkgName })));
        }
        det.appendChild(sum);

        // Условие
        det.appendChild(renderCondition(r.condition));

        // Sinks
        if (Array.isArray(r.sinks) && r.sinks.length) {
            det.appendChild(renderSinkSection(PF.ui.t('routes.section.sinks'), r.sinks, 0));
        }

        // Completion sinks
        if (Array.isArray(r.completionSinks) && r.completionSinks.length) {
            det.appendChild(renderSinkSection(
                PF.ui.t('routes.section.completionSinks'), r.completionSinks, 0));
        }

        return det;
    }

    function renderCondition(cond) {
        const box = el('div', 'routes-condition');
        box.appendChild(el('div', 'routes-condition-title', PF.ui.t('routes.condition.title')));

        if (cond.events && cond.events.length) {
            const row = el('div', 'routes-cond-row');
            row.appendChild(el('span', 'routes-cond-label', PF.ui.t('routes.condition.events')));
            row.appendChild(el('span', 'routes-cond-value', cond.events.join(', ')));
            box.appendChild(row);
        }
        if (cond.configurationNames && cond.configurationNames.length) {
            const row = el('div', 'routes-cond-row');
            row.appendChild(el('span', 'routes-cond-label', PF.ui.t('routes.condition.names')));
            row.appendChild(el('span', 'routes-cond-value', cond.configurationNames.join(', ')));
            box.appendChild(row);
        }
        if (cond.documentStates && cond.documentStates.length) {
            const row = el('div', 'routes-cond-row');
            row.appendChild(el('span', 'routes-cond-label', PF.ui.t('routes.condition.states')));
            row.appendChild(el('span', 'routes-cond-value', cond.documentStates.join(', ')));
            box.appendChild(row);
        }
        if (cond.dimensions && Object.keys(cond.dimensions).length) {
            const row = el('div', 'routes-cond-row');
            row.appendChild(el('span', 'routes-cond-label', PF.ui.t('routes.condition.dimensions')));
            const pre = el('pre', 'routes-cond-dims', JSON.stringify(cond.dimensions, null, 2));
            row.appendChild(pre);
            box.appendChild(row);
        }
        return box;
    }

    function renderSinkSection(title, sinks, depth) {
        const box = el('div', 'routes-sink-section');
        box.appendChild(el('div', 'routes-sink-section-title', title));
        for (const s of sinks) {
            box.appendChild(renderSink(s, depth));
        }
        return box;
    }

    /* ============================================================
     * Рендер одного sink'а (рекурсивно для ref)
     * ============================================================ */

    function renderSink(s, depth) {
        if (!s || typeof s !== 'object') return el('div', 'routes-sink routes-sink-unknown', '?');

        if (s.kind === 'ref') {
            const det = document.createElement('details');
            det.className = 'routes-sink routes-sink-ref';
            if (depth === 0) det.open = true;

            const sum = document.createElement('summary');
            sum.className = 'routes-sink-summary';
            sum.appendChild(el('span', 'routes-badge routes-badge-ref', 'ref'));
            sum.appendChild(el('span', 'routes-sink-name', s.ref));
            if (!s.found) {
                sum.appendChild(el('span', 'routes-badge routes-badge-notfound',
                    PF.ui.t('routes.badge.notFound')));
            } else if (s.truncated) {
                sum.appendChild(el('span', 'routes-badge routes-badge-truncated',
                    PF.ui.t('routes.badge.truncated')));
            }
            if (s.pkgName) {
                sum.appendChild(el('span', 'routes-meta routes-meta-pkg',
                    PF.ui.t('routes.pkg', { name: s.pkgName })));
            }
            det.appendChild(sum);

            if (s.error) {
                det.appendChild(el('div', 'routes-error', s.error));
            }
            if (Array.isArray(s.children) && s.children.length) {
                const inner = el('div', 'routes-sink-children');
                for (const c of s.children) inner.appendChild(renderSink(c, depth + 1));
                det.appendChild(inner);
            }
            return det;
        }

        // Прямой sink: document / notification / etlService / documentTransition / fetch / unknown
        const det = document.createElement('details');
        det.className = 'routes-sink routes-sink-' + (s.kind || 'unknown');

        const sum = document.createElement('summary');
        sum.className = 'routes-sink-summary';
        sum.appendChild(el('span', 'routes-badge routes-badge-kind', s.kind || '?'));
        if (s.name) sum.appendChild(el('span', 'routes-sink-name', s.name));
        if (s.kind === 'notification' && s.notificationName) {
            sum.appendChild(el('span', 'routes-meta',
                PF.ui.t('routes.notification', { name: s.notificationName })));
        }
        det.appendChild(sum);

        if (s.config && Object.keys(s.config).length) {
            det.appendChild(el('pre', 'routes-sink-config',
                JSON.stringify(s.config, null, 2)));
        }
        if (s.raw) {
            det.appendChild(el('pre', 'routes-sink-config',
                JSON.stringify(s.raw, null, 2)));
        }
        if (s.mapping) {
            det.appendChild(renderMapping(s.mapping));
        }

        return det;
    }

    function renderMapping(m) {
        const det = document.createElement('details');
        det.className = 'routes-mapping';

        const sum = document.createElement('summary');
        sum.className = 'routes-mapping-summary';
        sum.appendChild(el('span', 'routes-mapping-title',
            PF.ui.t('routes.mapping.title') + ' (' + m.size + ' B)'));
        if (m.truncated) {
            sum.appendChild(el('span', 'routes-badge routes-badge-truncated',
                PF.ui.t('routes.badge.truncated')));
        }
        det.appendChild(sum);

        const pre = el('pre', 'routes-mapping-content', m.content);
        det.appendChild(pre);
        return det;
    }

    PF.routes = { open };
})();