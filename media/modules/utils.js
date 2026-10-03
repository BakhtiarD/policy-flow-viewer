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

  PF.utils = {
    SVG_NS,
    svgEl,
    cloneTemplate,
    showAlert,
    showConfirm
  };
})();