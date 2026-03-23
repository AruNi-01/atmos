(function () {
  if (window.__ATMOS_PREVIEW_EXTENSION__) return;

  var defaultAllowedOrigins = [
    /^https?:\/\/localhost(?::\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
    /^https?:\/\/\[::1\](?::\d+)?$/,
  ];

  function isAllowedOrigin(origin, allowedOrigins) {
    if (!origin) return false;
    if (Array.isArray(allowedOrigins) && allowedOrigins.indexOf(origin) >= 0) return true;
    return defaultAllowedOrigins.some(function (pattern) { return pattern.test(origin); });
  }

  function boot() {
    if (!window.__ATMOS_PREVIEW_RUNTIME__) return;

    var controller = window.__ATMOS_PREVIEW_RUNTIME__.createRuntime({
      win: window,
      emit: function (message) {
        window.parent.postMessage(message, '*');
      },
    });

    var state = {
      sessionId: null,
      parentOrigin: null,
      allowedOrigins: [],
    };

    function handleMessage(event) {
      var data = event.data;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

      if (data.type === 'atmos-preview:host-init') {
        if (!isAllowedOrigin(event.origin, data.allowedOrigins)) return;
        state.sessionId = data.sessionId;
        state.parentOrigin = event.origin;
        state.allowedOrigins = Array.isArray(data.allowedOrigins) ? data.allowedOrigins : [];
        controller.announceReady(state.sessionId);
        return;
      }

      if (!state.sessionId || data.sessionId !== state.sessionId) return;
      if (!isAllowedOrigin(event.origin, state.allowedOrigins)) return;

      if (data.type === 'atmos-preview:enter-pick-mode') {
        controller.enterPickMode(state.sessionId);
      } else if (data.type === 'atmos-preview:clear-selection') {
        controller.clearSelection(false);
      } else if (data.type === 'atmos-preview:destroy') {
        controller.destroy();
        window.removeEventListener('message', handleMessage);
      }
    }

    window.addEventListener('message', handleMessage);
    window.__ATMOS_PREVIEW_EXTENSION__ = {
      destroy: function () {
        controller.destroy();
        window.removeEventListener('message', handleMessage);
      },
    };
  }

  if (window.__ATMOS_PREVIEW_RUNTIME__) {
    boot();
  } else {
    window.addEventListener('atmos-preview-runtime-ready', boot, { once: true });
  }
}());

