// Earth Jukebox – PWA registration, installation, and connection status
(function () {
    'use strict';

    // ---- Service worker (requires HTTPS or localhost) ----
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        // Only reload after an update if a service worker was already controlling this page.
        // Otherwise the very first visit would reload itself once the worker claims the page.
        const hadController = !!navigator.serviceWorker.controller;
        window.addEventListener('load', async () => {
            try {
                const reg = await navigator.serviceWorker.register('sw.js');
                const offerUpdate = worker => showToast('A new version is available.', 'Update', () => worker.postMessage('SKIP_WAITING'));
                // An update downloaded in an earlier visit may already be waiting.
                if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
                // Look for updates when the app returns to the foreground (installed apps stay open for days).
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
                reg.addEventListener('updatefound', () => {
                    const worker = reg.installing;
                    if (!worker) return;
                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            offerUpdate(worker);
                        }
                    });
                });
            } catch (error) {
                console.warn('Could not register the service worker:', error);
            }
        });
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloading || !hadController) return;
            reloading = true;
            location.reload();
        });
    }

    // ---- Installation button ----
    const installBtn = document.getElementById('btn-install');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        if (installBtn) installBtn.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        if (installBtn) installBtn.hidden = true;
        showToast('Earth Jukebox was installed successfully.');
    });
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installBtn.hidden = true;
        });
    }
    // iOS Safari does not fire beforeinstallprompt; show a one-time hint.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIos && !isStandalone) {
        let seen = false;
        try { seen = localStorage.getItem('ej-ios-hint') === '1'; } catch (_) {}
        if (!seen) {
            showToast('To install, tap Share, then “Add to Home Screen.”', 'Got it', () => {
                try { localStorage.setItem('ej-ios-hint', '1'); } catch (_) {}
            });
        }
    }

    // ---- Connection status ----
    const badge = document.getElementById('net-status');
    function updateOnline() {
        if (!badge) return;
        badge.hidden = navigator.onLine;
    }
    window.addEventListener('online', () => { updateOnline(); if (typeof loadEonetEvents === 'function') loadEonetEvents(true); });
    window.addEventListener('offline', updateOnline);
    updateOnline();

    // ---- Small toast without a Bootstrap JS dependency ----
    function showToast(message, actionLabel, onAction) {
        const old = document.getElementById('pwa-toast');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.id = 'pwa-toast';
        toast.className = 'pwa-toast shadow';
        toast.setAttribute('role', 'status');
        const text = document.createElement('span');
        text.textContent = message;
        toast.append(text);
        const close = () => toast.remove();
        if (actionLabel) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'btn-action';
            action.textContent = actionLabel;
            action.addEventListener('click', () => { if (onAction) onAction(); close(); });
            toast.append(action);
        }
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'btn-dismiss';
        dismiss.textContent = '✕';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.addEventListener('click', close);
        toast.append(dismiss);
        document.body.append(toast);
        if (!actionLabel) setTimeout(close, 4000);
    }
})();
