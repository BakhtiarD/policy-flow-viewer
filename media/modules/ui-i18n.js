(function () {
    'use strict';
    window.PF = window.PF || {};

    const FALLBACK = 'ru-RU';

    /* ============================================================
     * Ядро: init / t / plural / interpolate / getLang / isLang
     * ============================================================ */

    function init(lang) {
        if (!PF.state) PF.state = {};
        PF.state.uiLanguage = lang || FALLBACK;
    }

    function dict(lang) {
        return (window.PF_UI_LOCALES && window.PF_UI_LOCALES[lang]) || {};
    }

    function t(key, params) {
        const lang = (PF.state && PF.state.uiLanguage) || FALLBACK;
        let s = dict(lang)[key];
        if (s == null) s = dict(FALLBACK)[key];
        if (s == null) return key;
        return interpolate(s, params);
    }

    function plural(n, keyBase, params) {
        const lang = (PF.state && PF.state.uiLanguage) || FALLBACK;
        const formCur = new Intl.PluralRules(lang).select(Number(n));
        const formFb = new Intl.PluralRules(FALLBACK).select(Number(n));

        const tryKeys = [
            'plural.' + keyBase + '.' + formCur,
            'plural.' + keyBase + '.' + formFb,
            'plural.' + keyBase + '.other',
            'plural.' + keyBase
        ];
        for (const k of tryKeys) {
            const s = dict(lang)[k] || dict(FALLBACK)[k];
            if (s != null) {
                return interpolate(s, Object.assign({ n: String(n) }, params || {}));
            }
        }
        return String(n);
    }

    function interpolate(str, params) {
        if (!params) return str;
        return String(str).replace(/\{(\w+)\}/g, (_, name) =>
            params[name] != null ? String(params[name]) : '{' + name + '}'
        );
    }

    function getLang() {
        return (PF.state && PF.state.uiLanguage) || FALLBACK;
    }

    function isLang(code) {
        return getLang() === code;
    }

    /* ============================================================
     * apply(root) — навешивает переводы через data-i18n*
     * Используется:
     *   - в PF.utils.cloneTemplate (после клонирования шаблона)
     *   - в main.js после первого рендера (для статики документа)
     *   - в setLang при переключении языка
     * ============================================================ */

    function apply(root) {
        if (!root || !root.querySelectorAll) return;

        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = t(key);
        });

        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) el.setAttribute('title', t(key));
        });

        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.setAttribute('placeholder', t(key));
        });

        if (root.hasAttribute && root.hasAttribute('data-i18n')) {
            const key = root.getAttribute('data-i18n');
            if (key) root.textContent = t(key);
        }
        if (root.hasAttribute && root.hasAttribute('data-i18n-title')) {
            const key = root.getAttribute('data-i18n-title');
            if (key) root.setAttribute('title', t(key));
        }
        if (root.hasAttribute && root.hasAttribute('data-i18n-placeholder')) {
            const key = root.getAttribute('data-i18n-placeholder');
            if (key) root.setAttribute('placeholder', t(key));
        }
    }

    /* ============================================================
     * init с синхронизацией <html lang>
     * ============================================================ */

    const _origInit = init;
    function initWithHtmlLang(lang) {
        _origInit(lang);
        try {
            if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.lang = (PF.state && PF.state.uiLanguage) || FALLBACK;
            }
        } catch { /* ignore */ }
    }

    /* ============================================================
     * setLang — программное переключение языка интерфейса
     * Вызывается из onMessage при uiLanguageChanged
     * ============================================================ */

    function setLang(lang) {
        if (!lang || (PF.state && PF.state.uiLanguage === lang)) return;
        if (!PF.state) PF.state = {};
        PF.state.uiLanguage = lang;

        try {
            if (typeof document !== 'undefined' && document.documentElement) {
                document.documentElement.lang = lang;
            }
        } catch { /* ignore */ }

        // Статичные тексты из HTML (data-i18n*)
        apply(document);

        // Динамические рендеры — пересобираем то, что генерится в JS
        try {
            if (PF.toolbar) {
                if (PF.toolbar.updateViewToggleIcon) PF.toolbar.updateViewToggleIcon();
                if (PF.toolbar.updateLayoutDirBtn) PF.toolbar.updateLayoutDirBtn();
                if (PF.toolbar.updateLabelsToggleBtn) PF.toolbar.updateLabelsToggleBtn();
            }

            const gh = document.getElementById('graphHint');
            if (gh && PF.state.DATA) {
                gh.textContent = t(PF.state.DATA.hasUi ? 'graphHint.fromUi' : 'graphHint.auto');
            }

            const mi = document.getElementById('metaInfo');
            if (mi && PF.state.meta) {
                mi.textContent =
                    plural(PF.state.meta.states.length, 'states') + ', ' +
                    plural(PF.state.meta.actors.length, 'actors');
            }

            if (PF.legend && PF.legend.reinit) PF.legend.reinit();
            if (PF.table && PF.table.renderTable) PF.table.renderTable();
            if (PF.matrix && PF.matrix.render) PF.matrix.render();
            if (PF.actors && PF.actors.render) PF.actors.render();
            if (PF.render && PF.render.renderGraph) PF.render.renderGraph();
            if (PF.layout && PF.layout.applyViewBox) PF.layout.applyViewBox();
            if (PF.toolbar && PF.toolbar.updateInitialStateSelect) {
                PF.toolbar.updateInitialStateSelect();
            }
        } catch (e) {
            console.warn('ui.setLang re-render error', e);
        }
    }

    /* ============================================================
     * attachUiSelector — селектор языка интерфейса в тулбаре
     * ============================================================ */

    function attachUiSelector() {
        if (!PF.state) return;
        const host = document.getElementById('uiLangSelectHost')
            || document.getElementById('mainToolbar');
        if (!host) return;
        if (document.getElementById('uiLangSelect')) return;

        const dicts = Object.keys(window.PF_UI_LOCALES || {}).sort();
        if (!dicts.length) return;

        const wrap = document.createElement('div');
        wrap.className = 'lang-selector ui-lang-selector';
        wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';

        const icon = document.createElement('span');
        icon.style.cssText = 'font-size:11px;opacity:.7;';
        icon.textContent = '🖥';
        icon.title = t('uiLang.tooltip');
        wrap.appendChild(icon);

        const sel = document.createElement('select');
        sel.id = 'uiLangSelect';
        sel.title = t('uiLang.tooltip');
        sel.style.cssText = 'font-size:12px;padding:2px 4px;min-width:70px;';

        for (const code of dicts) {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = code;
            sel.appendChild(opt);
        }

        sel.value = (PF.state && PF.state.uiLanguage) || dicts[0];

        sel.addEventListener('change', () => {
            PF.vscode.postMessage({
                type: 'setUiLanguage',
                payload: { lang: sel.value }
            });
        });

        wrap.appendChild(sel);
        host.appendChild(wrap);
    }

    /* ============================================================
     * Приём сообщения uiLanguageChanged от extension host
     * ============================================================ */

    function onMessage(ev) {
        const msg = ev.data;
        if (!msg || !msg.type) return;
        if (msg.type === 'uiLanguageChanged') {
            setLang(msg.lang);
            const sel = document.getElementById('uiLangSelect');
            if (sel) sel.value = msg.lang;
        }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('message', onMessage);
    }

    /* ============================================================
     * Экспорт
     * ============================================================ */

    PF.ui = {
        init: initWithHtmlLang,
        t,
        plural,
        getLang,
        isLang,
        apply,
        setLang,
        attachUiSelector
    };
})();