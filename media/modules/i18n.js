(function () {
    'use strict';

    window.PF = window.PF || {};

    const EN = 'en-US';

    function current() {
        return (PF.state && PF.state.selectedLang) || EN;
    }

    function isEnglish() {
        return current() === EN;
    }

    // Возвращает перевод item'а для текущего языка.
    // item.trans — карта { 'ru-RU': '…', 'en-US': '…', … }.
    // Fallback: item.ru (старые данные).
    function tr(item) {
        if (!item) return '';
        if (item.trans && typeof item.trans === 'object') {
            return item.trans[current()] || '';
        }
        if (current() === 'ru-RU' && typeof item.ru === 'string') return item.ru;
        return '';
    }

    // «Name (перевод)» или просто «Name», если перевода нет
    // или он совпадает с именем.
    function label(name, item) {
        const t = tr(item);
        if (!t) return name;
        return name + ' (' + t + ')';
    }

    function init(languages, defaultLang) {
        if (!PF.state) return;
        PF.state.languages = Array.isArray(languages) ? languages : [];
        PF.state.selectedLang = defaultLang || PF.state.languages[0] || EN;
    }

    function setLang(code) {
        if (!PF.state) return;
        PF.state.selectedLang = code;
        rerender();
    }

    function rerender() {
        try {
            if (PF.render && PF.render.renderGraph) PF.render.renderGraph();
            if (PF.layout && PF.layout.applyViewBox) PF.layout.applyViewBox();
            if (PF.table && PF.table.renderTable) PF.table.renderTable();
            if (PF.matrix && PF.matrix.render) PF.matrix.render();
            if (PF.actors && PF.actors.render) PF.actors.render();
            if (PF.legend && PF.legend.render) PF.legend.render();
        } catch (e) {
            console.warn('i18n rerender error', e);
        }
    }

    function attachSelector() {
        if (!PF.state) return;
        const langs = PF.state.languages || [];
        if (langs.length === 0) return;               // только en-US — выбора нет
        if (document.getElementById('langSelect')) return;  // уже вставлен

        const host = document.getElementById('langSelectHost')
            || document.getElementById('mainToolbar');
        if (!host) return;

        const wrap = document.createElement('div');
        wrap.className = 'lang-selector';
        wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:8px;';

        const gl = document.createElement('span');
        gl.style.cssText = 'font-size:11px;opacity:.7;';
        gl.textContent = '🌐';
        wrap.appendChild(gl);

        const sel = document.createElement('select');
        sel.id = 'langSelect';
        sel.title = 'Язык переводов';
        sel.style.cssText = 'font-size:12px;padding:2px 4px;min-width:70px;';

        // не-EN в порядке следования, EN всегда последний
        for (const lang of langs) {
            const opt = document.createElement('option');
            opt.value = lang;
            opt.textContent = lang;
            sel.appendChild(opt);
        }
        const enOpt = document.createElement('option');
        enOpt.value = EN;
        enOpt.textContent = EN;
        sel.appendChild(enOpt);

        sel.value = current();
        sel.addEventListener('change', () => setLang(sel.value));
        wrap.appendChild(sel);
        host.appendChild(wrap);
    }

    PF.i18n = {
        EN,
        current,
        isEnglish,
        tr,
        label,
        init,
        setLang,
        attachSelector,
        rerender
    };
})();