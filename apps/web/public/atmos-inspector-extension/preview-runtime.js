(function () {
  if (window.__ATMOS_PREVIEW_RUNTIME__) return;

  function truncateText(value, limit) {
    const normalized = (value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= limit) return normalized;
    return normalized.slice(0, Math.max(0, limit - 1)).trimEnd() + '…';
  }

  function escapeCssValue(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function getElementClassNames(element) {
    if (!element) return [];
    if (typeof element.className === 'string') {
      return element.className.split(/\s+/).filter(Boolean);
    }
    if (element.className && typeof element.className.baseVal === 'string') {
      return element.className.baseVal.split(/\s+/).filter(Boolean);
    }
    const rawClass = element.getAttribute && element.getAttribute('class');
    return typeof rawClass === 'string' ? rawClass.split(/\s+/).filter(Boolean) : [];
  }

  function buildElementSelector(element) {
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === 1 && depth < 6) {
      const tagName = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift('#' + escapeCssValue(current.id));
        break;
      }

      const testId =
        current.getAttribute('data-testid') ||
        current.getAttribute('data-test') ||
        current.getAttribute('data-cy');
      if (testId) {
        parts.unshift(tagName + '[data-testid="' + testId + '"]');
        break;
      }

      const classNames = getElementClassNames(current).slice(0, 2).map(escapeCssValue);
      let selector = tagName;
      if (classNames.length) {
        selector += '.' + classNames.join('.');
      }

      const parent = current.parentElement;
      if (parent) {
        const sameTagSiblings = Array.prototype.filter.call(parent.children, function (child) {
          return child.tagName === current.tagName;
        });
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current);
          selector += ':nth-of-type(' + (index + 1) + ')';
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
      depth += 1;
    }

    return parts.join(' > ');
  }

  function summarizeAttributes(element) {
    const parts = [];
    if (element.id) {
      parts.push('id="' + element.id + '"');
    }

    const classNames = getElementClassNames(element).slice(0, 4);
    if (classNames.length) {
      parts.push('class="' + classNames.join(' ') + '"');
    }

    ['role', 'aria-label', 'name', 'type', 'href'].forEach(function (name) {
      const value = element.getAttribute && element.getAttribute(name);
      if (value) {
        parts.push(name + '="' + value + '"');
      }
    });

    if (element.attributes) {
      for (var i = 0; i < element.attributes.length; i += 1) {
        var attribute = element.attributes[i];
        if (!attribute || !/^data-/.test(attribute.name)) continue;
        if (attribute.name === 'data-testid' || attribute.name === 'data-test' || attribute.name === 'data-cy') {
          continue;
        }
        parts.push(attribute.name + '="' + attribute.value + '"');
        if (parts.length >= 8) break;
      }
    }

    return parts.join(' ');
  }

  function inspectPreviewElement(element) {
    return {
      selector: buildElementSelector(element),
      tagName: element.tagName.toLowerCase(),
      attributesSummary: summarizeAttributes(element),
      textPreview: truncateText(element.textContent, 280),
      htmlPreview: truncateText(element.outerHTML, 2000),
      selectedText: truncateText(element.textContent, 1000),
    };
  }

  function getPreviewElementRect(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function createPreviewOverlay(doc) {
    const root = doc.createElement('div');
    root.dataset.atmosPreviewOverlay = 'true';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '2147483646';
    doc.documentElement.appendChild(root);

    function createBox(color) {
      const box = doc.createElement('div');
      box.style.position = 'fixed';
      box.style.border = '2px solid ' + color;
      box.style.borderRadius = '8px';
      box.style.background = color === '#2563eb' ? 'rgba(37, 99, 235, 0.08)' : 'rgba(249, 115, 22, 0.12)';
      box.style.pointerEvents = 'none';
      box.style.display = 'none';
      box.style.boxSizing = 'border-box';
      root.appendChild(box);
      return box;
    }

    function createLabel() {
      const label = doc.createElement('div');
      label.style.position = 'fixed';
      label.style.padding = '4px 8px';
      label.style.borderRadius = '8px';
      label.style.fontSize = '12px';
      label.style.lineHeight = '16px';
      label.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
      label.style.background = 'rgba(15, 23, 42, 0.92)';
      label.style.color = '#f8fafc';
      label.style.pointerEvents = 'none';
      label.style.display = 'none';
      label.style.maxWidth = '320px';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      root.appendChild(label);
      return label;
    }

    const hoverBox = createBox('#2563eb');
    const lockedBox = createBox('#f97316');
    const hoverLabel = createLabel();
    const lockedLabel = createLabel();

    function place(box, label, rect, text) {
      box.style.display = 'block';
      box.style.left = rect.x + 'px';
      box.style.top = rect.y + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
      label.style.display = text ? 'block' : 'none';
      label.textContent = text || '';
      label.style.left = rect.x + 'px';
      label.style.top = Math.max(8, rect.y - 32) + 'px';
    }

    return {
      updateHover(rect, label) {
        place(hoverBox, hoverLabel, rect, label);
      },
      clearHover() {
        hoverBox.style.display = 'none';
        hoverLabel.style.display = 'none';
      },
      lock(rect, label) {
        place(lockedBox, lockedLabel, rect, label);
      },
      clearLocked() {
        lockedBox.style.display = 'none';
        lockedLabel.style.display = 'none';
      },
      destroy() {
        root.remove();
      },
    };
  }

  function getDisplayName(type) {
    if (!type) return null;
    if (typeof type === 'string') return null;
    if (typeof type === 'function') {
      return type.displayName || type.name || null;
    }
    if (typeof type === 'object') {
      return (
        type.displayName ||
        type.name ||
        (type.render && (type.render.displayName || type.render.name)) ||
        (type.type && (type.type.displayName || type.type.name)) ||
        null
      );
    }
    return null;
  }

  function coerceDebugSource(value) {
    if (!value || typeof value !== 'object') return null;
    if (!value.fileName && !value.filePath) return null;
    return value;
  }

  function locateReact(element) {
    var fiber = null;
    var keys = Object.keys(element);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (key.indexOf('__reactFiber$') === 0 || key.indexOf('__reactInternalInstance$') === 0 || key.indexOf('__reactContainer$') === 0) {
        fiber = element[key];
        break;
      }
    }
    if (!fiber) return null;

    function findDebugSource(node) {
      return (
        coerceDebugSource(node && node._debugSource) ||
        coerceDebugSource(node && node.memoizedProps && node.memoizedProps.__source) ||
        coerceDebugSource(node && node._debugOwner && node._debugOwner._debugSource)
      );
    }

    function isInternal(name) {
      return /^(ForwardRef|Memo|Suspense|Offscreen|Fragment|StrictMode)$/.test(name || '');
    }

    function isNoise(name) {
      return isInternal(name) ||
        /^forwardRef\(|^memo\(/.test(name || '') ||
        /(Provider|Context|Boundary|Router|Handler|Template|Segment|ScrollAndMaybeFocusHandler|LayoutRouter|PanelGroupContext)$/.test(name || '');
    }

    var candidates = [];
    var current = fiber;
    var depth = 0;
    while (current && depth < 60) {
      var name = getDisplayName(current.type) || getDisplayName(current.elementType);
      if (name) {
        candidates.push({ name: name, source: findDebugSource(current) });
      }
      current = current.return;
      depth += 1;
    }
    if (!candidates.length) return null;

    function score(candidate) {
      var value = 0;
      if (candidate.source && (candidate.source.filePath || candidate.source.fileName)) value += 6;
      var path = candidate.source && (candidate.source.filePath || candidate.source.fileName);
      if (path && path.indexOf('node_modules') >= 0) value -= 4;
      if (!isInternal(candidate.name)) value += 2;
      return value;
    }

    var best = candidates.slice().sort(function (a, b) { return score(b) - score(a); })[0];
    var chain = candidates
      .filter(function (candidate, index, list) {
        return list.findIndex(function (item) { return item.name === candidate.name; }) === index;
      })
      .filter(function (candidate) { return !isNoise(candidate.name); })
      .slice(0, 5)
      .map(function (candidate) { return candidate.name; });
    if (!chain.length) {
      chain = candidates.slice(0, 5).map(function (candidate) { return candidate.name; });
    }
    var filePath = best.source && (best.source.filePath || best.source.fileName);
    var line = best.source && (best.source.lineNumber || best.source.line);
    var column = best.source && (best.source.columnNumber || best.source.column);
    var debug = [];
    var confidenceScore = 0;
    if (best.name) {
      confidenceScore += 1;
      debug.push('component-name');
    }
    if (filePath) {
      confidenceScore += 2;
      debug.push('source-file');
    } else {
      debug.push('missing-source-file');
    }
    if (line != null) {
      confidenceScore += 1;
      debug.push('source-line');
    }
    if (column != null) {
      confidenceScore += 1;
      debug.push('source-column');
    }
    if (filePath && filePath.indexOf('node_modules') === -1) {
      confidenceScore += 2;
      debug.push('user-code-path');
    } else if (filePath) {
      confidenceScore -= 1;
      debug.push('node-modules-path');
    }
    if (isNoise(best.name)) {
      confidenceScore -= 2;
      debug.push('wrapper-component');
    }
    if (chain.length === 0) {
      confidenceScore -= 1;
      debug.push('empty-component-chain');
    } else if (chain.length <= 3) {
      confidenceScore += 1;
      debug.push('focused-component-chain');
    }

    return {
      framework: 'react',
      componentName: best.name,
      displayName: best.name,
      filePath: filePath,
      line: line,
      column: column,
      componentChain: chain,
      confidence: confidenceScore >= 6 ? 'high' : confidenceScore >= 3 ? 'medium' : 'low',
      debug: debug,
    };
  }

  function locateVue(element, win) {
    var start = null;
    var current = element;
    while (current) {
      if (current.__vueParentComponent) {
        start = current.__vueParentComponent;
        break;
      }
      if (current.__vue__) {
        start = current.__vue__;
        break;
      }
      if (current.__vnode && current.__vnode.component) {
        start = current.__vnode.component;
        break;
      }
      current = current.parentElement;
    }
    if (!start) return null;

    function getName(instance) {
      if (!instance) return null;
      var type = instance.type || (instance.vnode && instance.vnode.type);
      if (type && typeof type === 'function') return type.displayName || type.name || null;
      if (type && typeof type === 'object') return type.displayName || type.name || type.__name || null;
      return (
        instance.proxy && instance.proxy.$options && (instance.proxy.$options.name || instance.proxy.$options._componentTag) ||
        null
      );
    }

    function getFile(instance) {
      var type = instance.type || {};
      var vnodeType = instance.vnode && instance.vnode.type || {};
      return type.__file ||
        (instance.proxy && instance.proxy.$options && instance.proxy.$options.__file) ||
        vnodeType.__file ||
        null;
    }

    function isNoise(name) {
      return /^(Transition|BaseTransition|TransitionGroup|KeepAlive|Teleport|Suspense|RouterView|RouterLink)$/.test(name || '') ||
        /Provider$|Transition$/.test(name || '');
    }

    var candidates = [];
    current = start;
    var depth = 0;
    while (current && depth < 40) {
      var name = getName(current);
      if (name) {
        candidates.push({
          name: name,
          filePath: getFile(current),
        });
      }
      current = current.parent;
      depth += 1;
    }
    if (!candidates.length) return null;

    function score(candidate) {
      var value = 0;
      if (candidate.filePath) value += 4;
      if (candidate.filePath && candidate.filePath.indexOf('node_modules') === -1) value += 2;
      if (candidate.filePath && candidate.filePath.indexOf('node_modules') >= 0) value -= 1;
      if (!isNoise(candidate.name)) value += 2;
      return value;
    }

    var best = candidates.slice().sort(function (a, b) { return score(b) - score(a); })[0];
    var chain = candidates
      .filter(function (candidate, index, list) {
        return list.findIndex(function (item) { return item.name === candidate.name; }) === index;
      })
      .filter(function (candidate) { return !isNoise(candidate.name); })
      .slice(0, 5)
      .map(function (candidate) { return candidate.name; });
    if (!chain.length) {
      chain = candidates.slice(0, 5).map(function (candidate) { return candidate.name; });
    }
    var debug = [];
    var scoreValue = 0;
    if (best.name) {
      scoreValue += 1;
      debug.push('component-name');
    }
    if (best.filePath) {
      scoreValue += 2;
      debug.push('source-file');
    } else {
      debug.push('missing-source-file');
    }
    if (best.filePath && best.filePath.indexOf('node_modules') === -1) {
      scoreValue += 2;
      debug.push('user-code-path');
    } else if (best.filePath) {
      scoreValue -= 1;
      debug.push('node-modules-path');
    }
    if (isNoise(best.name)) {
      scoreValue -= 2;
      debug.push('wrapper-component');
    }
    if (chain.length === 0) {
      scoreValue -= 1;
      debug.push('empty-component-chain');
    } else if (chain.length <= 3) {
      scoreValue += 1;
      debug.push('focused-component-chain');
    }

    return {
      framework: 'vue',
      componentName: best.name,
      displayName: best.name,
      filePath: best.filePath || undefined,
      componentChain: chain,
      confidence: scoreValue >= 5 ? 'high' : scoreValue >= 3 ? 'medium' : 'low',
      debug: debug,
    };
  }

  function locateAngular(element, win) {
    var ng = win.ng;
    if (!ng || (!ng.getComponent && !ng.getOwningComponent)) return null;
    var start = (ng.getComponent && ng.getComponent(element)) || (ng.getOwningComponent && ng.getOwningComponent(element));
    if (!start || typeof start !== 'object') return null;

    function getName(instance) {
      return (
        instance &&
        instance.constructor &&
        instance.constructor.ɵcmp &&
        instance.constructor.ɵcmp.type &&
        instance.constructor.ɵcmp.type.name
      ) || (instance && instance.constructor && instance.constructor.name) || null;
    }

    function getParentInstance(instance) {
      if (!instance || !Array.isArray(instance.__ngContext__)) return null;
      for (var i = 0; i < instance.__ngContext__.length; i += 1) {
        var candidate = instance.__ngContext__[i];
        if (candidate && candidate !== instance && getName(candidate)) {
          return candidate;
        }
      }
      return null;
    }

    var candidates = [];
    var current = start;
    var depth = 0;
    while (current && depth < 10) {
      var name = getName(current);
      if (name) {
        candidates.push({ name: name, instance: current });
      }
      current = getParentInstance(current);
      depth += 1;
    }
    if (!candidates.length) return null;

    var chain = candidates
      .filter(function (candidate, index, list) {
        return list.findIndex(function (item) { return item.name === candidate.name; }) === index;
      })
      .slice(0, 5)
      .map(function (candidate) { return candidate.name; });
    var best = candidates[0];
    var rootComponents = ng.getRootComponents ? ng.getRootComponents(element) || [] : [];
    var hasDirectiveMetadata = !!(best.instance && ng.getDirectiveMetadata && ng.getDirectiveMetadata(best.instance));
    var debug = [];
    var scoreValue = 0;
    if (best.name) {
      scoreValue += 2;
      debug.push('component-name');
    } else {
      debug.push('missing-component-name');
    }
    if (chain.length > 1) {
      scoreValue += 1;
      debug.push('component-chain');
    }
    if (rootComponents.length) {
      scoreValue += 1;
      debug.push('root-components');
    }
    if (hasDirectiveMetadata) {
      scoreValue += 1;
      debug.push('directive-metadata');
    }
    debug.push('missing-source-file');

    return {
      framework: 'angular',
      componentName: best.name,
      displayName: best.name,
      componentChain: chain,
      confidence: scoreValue >= 4 ? 'medium' : 'low',
      debug: debug,
    };
  }

  function locateSvelte(element, win) {
    function getMeta(node) {
      return node && node.__svelte_meta ? node.__svelte_meta : null;
    }

    function fileToName(filePath) {
      var normalized = (filePath.split('/').pop() || filePath).replace(/\.svelte$/i, '');
      if (normalized === '+page') return 'Page';
      if (normalized === '+layout') return 'Layout';
      if (normalized === '+error') return 'ErrorPage';
      return normalized || 'SvelteComponent';
    }

    var candidates = [];
    var seen = {};
    var current = element;
    var depth = 0;
    while (current && depth < 12) {
      var meta = getMeta(current);
      var filePath = meta && meta.loc && meta.loc.file;
      if (filePath && !seen[filePath]) {
        seen[filePath] = true;
        candidates.push({
          filePath: filePath,
          line: meta.loc.line,
          column: meta.loc.column,
          componentName: fileToName(filePath),
        });
      }
      current = current.parentElement;
      depth += 1;
    }
    if (!candidates.length) return null;

    var best = candidates[0];
    var chain = candidates.slice(0, 5).map(function (candidate) { return candidate.componentName; });
    var debug = [];
    var scoreValue = 0;
    if (best.componentName) {
      scoreValue += 1;
      debug.push('component-name');
      debug.push('inferred-component-name');
    } else {
      debug.push('missing-component-name');
    }
    if (best.filePath) {
      scoreValue += 2;
      debug.push('source-file');
    } else {
      debug.push('missing-source-file');
    }
    if (best.line != null) {
      scoreValue += 1;
      debug.push('source-line');
    }
    if (best.column != null) {
      scoreValue += 1;
      debug.push('source-column');
    }
    if (best.filePath && best.filePath.indexOf('node_modules') === -1) {
      scoreValue += 2;
      debug.push('user-code-path');
    } else if (best.filePath) {
      scoreValue -= 1;
      debug.push('node-modules-path');
    }
    if (chain.length > 1) {
      scoreValue += 1;
      debug.push('component-chain');
    } else {
      debug.push('single-component-chain');
    }

    return {
      framework: 'svelte',
      componentName: best.componentName,
      displayName: best.componentName,
      filePath: best.filePath,
      line: best.line,
      column: best.column,
      componentChain: chain,
      confidence: scoreValue >= 6 ? 'high' : scoreValue >= 3 ? 'medium' : 'low',
      debug: debug,
    };
  }

  function hasSvelteMetaInDocument(win) {
    var root = win.document.body;
    if (!root) return false;
    var walker = win.document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    var current = walker.currentNode;
    var inspected = 0;
    while (current && inspected < 500) {
      if (current.nodeType === 1 && current.__svelte_meta) {
        return true;
      }
      current = walker.nextNode();
      inspected += 1;
    }
    return false;
  }

  function locateSourceForElement(element, win) {
    return locateVue(element, win) ||
      locateAngular(element, win) ||
      (hasSvelteMetaInDocument(win) ? locateSvelte(element, win) : null) ||
      locateReact(element) ||
      null;
  }

  function getCapabilities(win) {
    var capabilities = ['dom-inspection', 'element-selection'];
    if (locateReact(win.document.body || win.document.documentElement)) capabilities.push('source-locator:react');
    if (locateVue(win.document.body || win.document.documentElement, win)) capabilities.push('source-locator:vue');
    if (locateAngular(win.document.body || win.document.documentElement, win)) capabilities.push('source-locator:angular');
    if (hasSvelteMetaInDocument(win)) capabilities.push('source-locator:svelte');
    return capabilities;
  }

  function createRuntime(config) {
    var win = config.win || window;
    var doc = win.document;
    var overlay = createPreviewOverlay(doc);
    var state = {
      enabled: false,
      hovered: null,
      locked: null,
      sessionId: null,
    };

    function emit(message) {
      if (!state.sessionId) return;
      config.emit(Object.assign({
        sessionId: state.sessionId,
        pageUrl: win.location.href,
      }, message));
    }

    function isIgnoredElement(element) {
      if (!element || !element.closest) return true;
      if (element.closest('[data-atmos-preview-overlay="true"]')) return true;
      var tagName = element.tagName.toLowerCase();
      if (tagName === 'html' || tagName === 'body') return true;
      var rect = element.getBoundingClientRect();
      return rect.width < 4 || rect.height < 4;
    }

    function announceReady(sessionId) {
      state.sessionId = sessionId;
      emit({
        type: 'atmos-preview:ready',
        capabilities: getCapabilities(win),
      });
    }

    function clearSelection(notifyHost) {
      state.locked = null;
      overlay.clearLocked();
      overlay.clearHover();
      if (notifyHost) {
        emit({ type: 'atmos-preview:cleared' });
      }
    }

    function selectElement(element) {
      var rect = getPreviewElementRect(element);
      var elementContext = inspectPreviewElement(element);
      var sourceLocation = locateSourceForElement(element, win);
      overlay.lock(rect, (sourceLocation && sourceLocation.componentName) || buildElementSelector(element));
      emit({
        type: 'atmos-preview:selected',
        rect: rect,
        elementContext: elementContext,
        sourceLocation: sourceLocation,
      });
    }

    function handleMouseMove(event) {
      if (!state.enabled) return;
      if (state.locked) {
        overlay.clearHover();
        return;
      }
      var target = event.target;
      if (!(target instanceof Element) || isIgnoredElement(target)) {
        overlay.clearHover();
        state.hovered = null;
        return;
      }
      state.hovered = target;
      var rect = getPreviewElementRect(target);
      overlay.updateHover(rect, buildElementSelector(target));
    }

    function handleClick(event) {
      if (!state.enabled || state.locked) return;
      var target = event.target;
      if (!(target instanceof Element) || isIgnoredElement(target)) return;
      event.preventDefault();
      event.stopPropagation();
      state.locked = target;
      overlay.clearHover();
      selectElement(target);
    }

    function handleKeyDown(event) {
      if (!state.enabled || event.key !== 'Escape') return;
      clearSelection(true);
    }

    doc.addEventListener('mousemove', handleMouseMove, true);
    doc.addEventListener('click', handleClick, true);
    win.addEventListener('keydown', handleKeyDown, true);

    return {
      announceReady: announceReady,
      enterPickMode: function (sessionId) {
        state.sessionId = sessionId;
        state.enabled = true;
        emit({
          type: 'atmos-preview:ready',
          capabilities: getCapabilities(win),
        });
      },
      clearSelection: clearSelection,
      destroy: function () {
        state.enabled = false;
        doc.removeEventListener('mousemove', handleMouseMove, true);
        doc.removeEventListener('click', handleClick, true);
        win.removeEventListener('keydown', handleKeyDown, true);
        overlay.destroy();
      },
    };
  }

  window.__ATMOS_PREVIEW_RUNTIME__ = {
    createRuntime: createRuntime,
  };
  window.dispatchEvent(new Event('atmos-preview-runtime-ready'));
}());
