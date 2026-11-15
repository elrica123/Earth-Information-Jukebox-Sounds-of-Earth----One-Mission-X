// Earth Jukebox – light/dark theme (follows the system unless the user chooses a mode)
(function () {
    'use strict';
    var KEY = 'ej-theme';
    var root = document.documentElement;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function stored() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; } }
    function effective() { return stored() || (mq.matches ? 'dark' : 'light'); }
    function apply() {
        var s = stored();
        if (s) root.setAttribute('data-theme', s); else root.removeAttribute('data-theme');
        var dark = effective() === 'dark';
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#150f26' : '#f3eefb');
        var btn = document.getElementById('btn-theme');
        if (btn) {
            btn.setAttribute('aria-pressed', String(dark));
            var icon = document.getElementById('theme-icon');
            if (icon) icon.textContent = dark ? '☀️' : '🌙';
            var label = document.getElementById('theme-label');
            if (label) label.textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
        }
    }
    apply();
    document.addEventListener('DOMContentLoaded', function () {
        apply();
        var btn = document.getElementById('btn-theme');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var next = effective() === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem(KEY, next); } catch (e) {}
            apply();
        });
    });
    if (mq.addEventListener) mq.addEventListener('change', apply);
})();
