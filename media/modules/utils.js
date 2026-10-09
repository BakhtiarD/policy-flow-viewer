(function () {
    'use strict';

    window.PF = window.PF || {};

    const SVG_NS = 'http://www.w3.org/2000/svg';

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

    function showPrompt(title, defaultValue) {
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
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'dlg-input';
            inp.value = defaultValue || '';
            row.appendChild(inp);
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

            inp.focus();
            inp.select();

            function close(result) {
                backdrop.remove();
                document.removeEventListener('keydown', onKey, true);
                resolve(result);
            }
            function onKey(ev) {
                if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
                if (ev.key === 'Enter') { ev.preventDefault(); close(inp.value.trim() || null); }
            }
            cancelBtn.addEventListener('click', () => close(null));
            okBtn.addEventListener('click', () => close(inp.value.trim() || null));
            document.addEventListener('keydown', onKey, true);
        });
    }

    PF.utils = {
        SVG_NS,
        svgEl,
        cloneTemplate,
        showAlert,
        showConfirm,
        showPrompt
    };
})();