(function () {
  if (window.__ATMOS_PREVIEW_EXTENSION__) return;

  var defaultAllowedOrigins = [
    /^https?:\/\/localhost(?::\d+)?$/,
    /^https?:\/\/[a-zA-Z0-9-]+\.localhost(?::\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
    /^https?:\/\/\[::1\](?::\d+)?$/,
  ];

  function isAllowedOrigin(origin, allowedOrigins) {
    if (!origin) return false;
    if (Array.isArray(allowedOrigins) && allowedOrigins.indexOf(origin) >= 0) return true;
    return defaultAllowedOrigins.some(function (pattern) { return pattern.test(origin); });
  }

  function createController() {
    if (!window.__ATMOS_BROWSER_RUNTIME__) return null;
    return window.__ATMOS_BROWSER_RUNTIME__.createRuntime({
      win: window,
      emit: function (message) {
        window.parent.postMessage(message, state.parentOrigin || '*');
      },
    });
  }

  var state = {
    sessionId: null,
    parentOrigin: null,
    allowedOrigins: [],
  };

  var controller = null;

  function emitToParent(message) {
    window.parent.postMessage(message, state.parentOrigin || '*');
  }

  function handleMessage(event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

    if (data.type === 'atmos-browser:host-init') {
      if (!isAllowedOrigin(event.origin, data.allowedOrigins)) return;
      // Re-create the runtime if it was previously destroyed
      if (controller) {
        controller.destroy();
      }
      controller = createController();
      if (!controller) return;
      state.sessionId = data.sessionId;
      state.parentOrigin = event.origin;
      state.allowedOrigins = Array.isArray(data.allowedOrigins) ? data.allowedOrigins : [];
      controller.announceReady(state.sessionId);
      return;
    }

    if (!controller || !state.sessionId || data.sessionId !== state.sessionId) return;
    if (!isAllowedOrigin(event.origin, state.allowedOrigins)) return;

    if (data.type === 'atmos-browser:ping') {
      emitToParent({
        type: 'atmos-browser:pong',
        sessionId: state.sessionId,
        pageUrl: window.location.href,
        pageTitle: (document.title || '').trim(),
      });
    } else if (data.type === 'atmos-browser:enter-pick-mode') {
      controller.enterPickMode(state.sessionId);
    } else if (data.type === 'atmos-browser:exit-pick-mode') {
      // Graceful fallback: older runtimes may not have exitPickMode
      if (typeof controller.exitPickMode === 'function') {
        controller.exitPickMode();
      } else {
        controller.clearSelection(false);
      }
    } else if (data.type === 'atmos-browser:clear-selection') {
      controller.clearSelection(false);
    } else if (data.type === 'atmos-browser:destroy') {
      controller.destroy();
      controller = null;
      state.sessionId = null;
      // Keep message handler alive so host-init can reconnect
    }
  }

  function boot() {
    if (!window.__ATMOS_BROWSER_RUNTIME__) return;
    controller = createController();
    window.addEventListener('message', handleMessage);
  }

  window.__ATMOS_PREVIEW_EXTENSION__ = {
    destroy: function () {
      if (controller) {
        controller.destroy();
        controller = null;
      }
      window.removeEventListener('message', handleMessage);
    },
  };

  if (window.__ATMOS_BROWSER_RUNTIME__) {
    boot();
  } else {
    window.addEventListener('atmos-browser-runtime-ready', boot, { once: true });
  }
}());
