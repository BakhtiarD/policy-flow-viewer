(function () {
  'use strict';

  window.PF = window.PF || {};

  PF.icons = {
    add:        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
    refresh:    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 3v3h-3"/></svg>',
    collapse:   '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4-4 4 4M4 10l4 4 4-4"/></svg>',
    expand:     '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l4 4 4-4M4 13l4-4 4 4"/></svg>',
    graph:      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><path d="M6 4h4M5.4 5.6L6.8 10M10.6 5.6L9.2 10"/></svg>',
    table:      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M2 11h12M6 3v10M10 3v10"/></svg>',
    package:    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 1.5l6 3v7l-6 3-6-3v-7z"/><path d="M2 4.5l6 3 6-3M8 7.5v7"/></svg>',
    key:        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="8" r="3"/><path d="M8 8h6M12 6v4M14 8v2"/></svg>',
    checklist:  '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4l2 2 3-3M2 10l2 2 3-3M9 4h5M9 10h5"/></svg>',
    link:       '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 9a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1"/><path d="M9 7a3 3 0 0 0-4 0L3 9a3 3 0 0 0 4 4l1-1"/></svg>',
    gear:       '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M15 8h-2M3 8H1M13 3l-1.5 1.5M4.5 11.5L3 13M13 13l-1.5-1.5M4.5 4.5L3 3"/></svg>',
    edit:       '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10 2l4 4-8 8H2v-4z"/></svg>',
    trash:      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4M7 7v5M9 7v5"/></svg>',
    save:       '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 2h8l2 2v10H3z"/><path d="M6 2v4h4V2M6 9h4v5H6z"/></svg>',
    fullscreen: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>',
    layout:     '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 6h12M6 6v9"/></svg>',
    'arrows-v': '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3"/></svg>',
    'arrows-h': '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h12M5 5L2 8l3 3M11 5l3 3-3 3"/></svg>',
    tag:        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 8V2h6l6 6-6 6z"/><circle cx="5" cy="5" r="1" fill="currentColor"/></svg>',
    'layout-top':    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="3" y="3" width="10" height="2" fill="currentColor" stroke="none"/></svg>',
    'layout-bottom': '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="3" y="11" width="10" height="2" fill="currentColor" stroke="none"/></svg>',
    'layout-left':   '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="3" y="3" width="2" height="10" fill="currentColor" stroke="none"/></svg>',
    'layout-right':  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="11" y="3" width="2" height="10" fill="currentColor" stroke="none"/></svg>'
  };
})();