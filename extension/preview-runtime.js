// Extension-specific preview runtime for the unpacked browser extension.
// This is NOT a mirror of packages/shared/preview/preview-runtime.js — the two
// files have intentionally diverged:
//   - This version uses a single root container + single-box overlays and a
//     working setCursor(), suitable for running directly in the target page.
//   - packages/shared/ uses per-segment border overlays and a no-op setCursor(),
//     designed for Tauri's cross-origin child webview where cursor is managed
//     natively by the Rust bridge.
// Both files share the same inspection logic (locateReact, locateVue, etc.) and
// public API shape (createRuntime). Keep those in sync when changing either file.
(function () {
  if (window.__ATMOS_PREVIEW_RUNTIME__) return;

  var EXTENSION_VERSION = '0.1.11';
  var PICKER_HOVER_COLOR = '#4ade80';
  var PICKER_HOVER_BORDER_COLOR = '#15803d';
  var PICKER_LOCKED_COLOR = '#fde047';
  var PICKER_LOCKED_BORDER_COLOR = '#ca8a04';

  function createPreviewPickerCursor(fillColor, borderColor) {
    var cursorPath =
      'M17.4 10.6C16.1 9.8 14.6 10.9 15 12.4L25.3 49.1C25.8 50.8 28 51 28.7 49.4L34.8 36.2L48.8 33.1C50.5 32.7 50.9 30.5 49.4 29.6L17.4 10.6Z';
    var svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision">',
      '<defs><filter id="atmos_picker_cursor_shadow" x="-8" y="-8" width="80" height="80" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2" stdDeviation="1.25" flood-color="#0f172a" flood-opacity="0.24"/></filter></defs>',
      '<g filter="url(#atmos_picker_cursor_shadow)" stroke-linejoin="round">',
      '<path d="' + cursorPath + '" fill="' + fillColor + '" stroke="' + borderColor + '" stroke-width="5.5"/>',
      '<path d="' + cursorPath + '" fill="none" stroke="#fff" stroke-opacity="0.26" stroke-width="1.4"/>',
      '</g>',
      '</svg>',
    ].join('');
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 9 6, auto';
  }

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

      var testAttrNames = ['data-testid', 'data-test', 'data-cy'];
      var testAttrName = null;
      var testId = null;
      for (var ti = 0; ti < testAttrNames.length; ti++) {
        var val = current.getAttribute(testAttrNames[ti]);
        if (val) { testAttrName = testAttrNames[ti]; testId = val; break; }
      }
      if (testId) {
        parts.unshift(tagName + '[' + testAttrName + '="' + testId + '"]');
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

  function createPreviewOverlay(win, doc, options) {
    var cursorStyle = doc.createElement('style');
    cursorStyle.dataset.atmosPreviewOverlay = 'true';
    doc.head.appendChild(cursorStyle);

    const root = doc.createElement('div');
    root.dataset.atmosPreviewOverlay = 'true';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '2147483646';
    root.style.cursor = 'inherit';
    doc.documentElement.appendChild(root);

    function createBox(color) {
      const box = doc.createElement('div');
      box.dataset.atmosPreviewOverlay = 'true';
      box.style.position = 'fixed';
      box.style.border = '2px solid ' + color;
      box.style.borderRadius = '8px';
      box.style.background = color === '#2563eb' ? 'rgba(37, 99, 235, 0.08)' : 'rgba(249, 115, 22, 0.12)';
      box.style.pointerEvents = 'none';
      box.style.display = 'none';
      box.style.boxSizing = 'border-box';
      box.style.cursor = 'inherit';
      root.appendChild(box);
      return box;
    }

    function createLabel() {
      const label = doc.createElement('div');
      label.dataset.atmosPreviewOverlay = 'true';
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
      label.style.cursor = 'inherit';
      root.appendChild(label);
      return label;
    }

    const hoverBox = createBox(PICKER_HOVER_COLOR);
    const lockedBox = createBox(PICKER_LOCKED_COLOR);
    const hoverLabel = createLabel();
    const lockedLabel = createLabel();
    const chromeRoot = doc.createElement('div');
    chromeRoot.dataset.atmosPreviewOverlay = 'true';
    chromeRoot.style.position = 'fixed';
    chromeRoot.style.inset = '0';
    chromeRoot.style.pointerEvents = 'none';
    chromeRoot.style.zIndex = '2147483647';
    doc.documentElement.appendChild(chromeRoot);

    function stopPropagation(event) {
      event.stopPropagation();
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(value, max));
    }

    function trailingText(value, maxLength) {
      if (!value) return '';
      if (value.length <= maxLength) return value;
      return '...' + value.slice(value.length - maxLength + 3);
    }

    function capitalize(value) {
      if (!value) return '';
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function createSvgIcon(path, size) {
      const span = doc.createElement('span');
      span.style.display = 'inline-flex';
      span.style.alignItems = 'center';
      span.style.justifyContent = 'center';
      span.style.width = size + 'px';
      span.style.height = size + 'px';
      span.innerHTML =
        '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        path +
        '</svg>';
      return span;
    }

    function createButtonBase() {
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset.atmosPreviewOverlay = 'true';
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.gap = '10px';
      button.style.height = '44px';
      button.style.border = '0';
      button.style.outline = 'none';
      button.style.cursor = 'pointer';
      button.style.pointerEvents = 'auto';
      button.style.fontFamily = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif';
      button.style.fontSize = '16px';
      button.style.lineHeight = '1';
      button.style.transition = 'background 140ms ease, color 140ms ease, transform 140ms ease, opacity 140ms ease';
      button.addEventListener('mousedown', function (event) {
        event.stopPropagation();
      });
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
      });
      return button;
    }

    function createFooterButton(label, variant, iconPath) {
      const button = createButtonBase();
      button.style.padding = '0 18px';
      button.style.borderRadius = '16px';
      button.style.fontWeight = '600';
      button.style.minWidth = label === 'Cancel' ? '116px' : label === 'Add' ? '124px' : '232px';
      if (variant === 'primary') {
        button.style.background = '#f4f4f6';
        button.style.color = '#1f1f24';
      } else {
        button.style.background = 'transparent';
        button.style.color = '#f5f5f7';
      }
      if (iconPath) {
        button.appendChild(createSvgIcon(iconPath, 22));
      }
      const text = doc.createElement('span');
      text.textContent = label;
      button.appendChild(text);
      button.addEventListener('mouseenter', function () {
        button.style.background = variant === 'primary' ? '#ffffff' : 'rgba(255, 255, 255, 0.08)';
      });
      button.addEventListener('mouseleave', function () {
        button.style.background = variant === 'primary' ? '#f4f4f6' : 'transparent';
      });
      return button;
    }

    const detailsCard = doc.createElement('div');
    detailsCard.dataset.atmosPreviewOverlay = 'true';
    detailsCard.style.position = 'fixed';
    detailsCard.style.display = 'none';
    detailsCard.style.pointerEvents = 'auto';
    detailsCard.style.borderRadius = '18px';
    detailsCard.style.border = '1px solid rgba(255, 255, 255, 0.14)';
    detailsCard.style.background = 'rgba(27, 27, 32, 0.98)';
    detailsCard.style.boxShadow = '0 22px 50px rgba(0, 0, 0, 0.34)';
    detailsCard.style.backdropFilter = 'blur(18px)';
    detailsCard.style.webkitBackdropFilter = 'blur(18px)';
    detailsCard.style.padding = '22px 24px 24px';
    detailsCard.style.boxSizing = 'border-box';
    chromeRoot.appendChild(detailsCard);

    detailsCard.addEventListener('mousedown', stopPropagation);
    detailsCard.addEventListener('mouseup', stopPropagation);
    detailsCard.addEventListener('click', stopPropagation);
    detailsCard.addEventListener('dblclick', stopPropagation);

    const addIconPath = '<path d="M5 12h14"></path><path d="M12 5v14"></path>';

    const sourceSummary = doc.createElement('div');
    sourceSummary.style.color = '#b9b9c2';
    sourceSummary.style.fontSize = '15px';
    sourceSummary.style.lineHeight = '1.45';
    sourceSummary.style.marginBottom = '18px';
    sourceSummary.style.whiteSpace = 'nowrap';
    sourceSummary.style.overflow = 'hidden';
    sourceSummary.style.textOverflow = 'ellipsis';
    detailsCard.appendChild(sourceSummary);

    const noteInput = doc.createElement('textarea');
    noteInput.placeholder = 'Add a note for the AI agent... (optional)';
    noteInput.rows = 4;
    noteInput.spellcheck = false;
    noteInput.dataset.atmosPreviewOverlay = 'true';
    noteInput.style.width = '100%';
    noteInput.style.minHeight = '156px';
    noteInput.style.resize = 'none';
    noteInput.style.boxSizing = 'border-box';
    noteInput.style.borderRadius = '18px';
    noteInput.style.border = '1px solid rgba(255, 255, 255, 0.14)';
    noteInput.style.background = 'rgba(41, 41, 47, 0.98)';
    noteInput.style.boxShadow = 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)';
    noteInput.style.color = '#f5f5f7';
    noteInput.style.padding = '20px 22px';
    noteInput.style.fontSize = '16px';
    noteInput.style.lineHeight = '1.55';
    noteInput.style.outline = 'none';
    noteInput.style.marginBottom = '22px';
    noteInput.addEventListener('mousedown', stopPropagation, true);
    noteInput.addEventListener('mouseup', stopPropagation, true);
    noteInput.addEventListener('click', stopPropagation, true);
    detailsCard.appendChild(noteInput);

    const confidenceSection = doc.createElement('div');
    confidenceSection.style.display = 'none';
    confidenceSection.style.marginBottom = '24px';
    detailsCard.appendChild(confidenceSection);

    const confidenceHeader = doc.createElement('div');
    confidenceHeader.style.display = 'flex';
    confidenceHeader.style.alignItems = 'center';
    confidenceHeader.style.justifyContent = 'space-between';
    confidenceHeader.style.gap = '12px';
    confidenceHeader.style.marginBottom = '14px';
    confidenceSection.appendChild(confidenceHeader);

    const confidenceTitle = doc.createElement('div');
    confidenceTitle.textContent = 'Source Code Confidence';
    confidenceTitle.style.color = '#b9b9c2';
    confidenceTitle.style.fontSize = '14px';
    confidenceTitle.style.fontWeight = '600';
    confidenceHeader.appendChild(confidenceTitle);

    const confidenceBadge = doc.createElement('span');
    confidenceBadge.style.display = 'inline-flex';
    confidenceBadge.style.alignItems = 'center';
    confidenceBadge.style.justifyContent = 'center';
    confidenceBadge.style.minWidth = '76px';
    confidenceBadge.style.padding = '0 16px';
    confidenceBadge.style.height = '38px';
    confidenceBadge.style.borderRadius = '999px';
    confidenceBadge.style.fontSize = '14px';
    confidenceBadge.style.fontWeight = '700';
    confidenceBadge.style.letterSpacing = '0.12em';
    confidenceHeader.appendChild(confidenceBadge);

    const confidenceSignals = doc.createElement('div');
    confidenceSignals.style.borderRadius = '16px';
    confidenceSignals.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    confidenceSignals.style.background = 'rgba(35, 35, 41, 0.85)';
    confidenceSignals.style.padding = '16px 18px';
    confidenceSignals.style.color = '#b9b9c2';
    confidenceSignals.style.fontSize = '14px';
    confidenceSignals.style.lineHeight = '1.55';
    confidenceSection.appendChild(confidenceSignals);

    const footer = doc.createElement('div');
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.justifyContent = 'space-between';
    footer.style.gap = '18px';
    detailsCard.appendChild(footer);

    const footerCancelButton = createFooterButton('Cancel', 'ghost');
    const footerCopyButton = createFooterButton('Add', 'primary', addIconPath);
    footer.appendChild(footerCancelButton);
    footer.appendChild(footerCopyButton);

    let currentMeta = null;
    let currentRect = null;
    let cancelHandler = null;
    let copyHandler = null;

    function applyConfidence(confidence) {
      if (confidence === 'high') {
        confidenceBadge.style.color = '#67e08a';
        confidenceBadge.style.background = 'rgba(40, 92, 52, 0.26)';
        confidenceBadge.style.border = '1px solid rgba(81, 199, 111, 0.38)';
      } else if (confidence === 'medium') {
        confidenceBadge.style.color = '#f5c86a';
        confidenceBadge.style.background = 'rgba(113, 84, 27, 0.26)';
        confidenceBadge.style.border = '1px solid rgba(245, 200, 106, 0.34)';
      } else {
        confidenceBadge.style.color = '#f18b8b';
        confidenceBadge.style.background = 'rgba(121, 44, 44, 0.26)';
        confidenceBadge.style.border = '1px solid rgba(241, 139, 139, 0.34)';
      }
    }

    function renderSelectionMeta() {
      var meta = currentMeta || {};
      var sourceLocation = meta.sourceLocation || {};
      var summaryParts = [];
      var sourcePath = sourceLocation.filePath || sourceLocation.fileName || meta.pageUrl || '';
      var confidence = sourceLocation.confidence;
      var signals = Array.isArray(sourceLocation.debug) ? sourceLocation.debug.filter(Boolean) : [];

      if (sourcePath) {
        summaryParts.push(trailingText(sourcePath, 34));
      } else if (meta.label) {
        summaryParts.push(meta.label);
      }
      if (sourceLocation.framework) {
        summaryParts.push(capitalize(sourceLocation.framework));
      }
      if (sourceLocation.componentName) {
        summaryParts.push(sourceLocation.componentName);
      }
      sourceSummary.textContent = summaryParts.join(' \u00b7 ') || 'Selected element';

      if (confidence || signals.length > 0) {
        confidenceSection.style.display = 'block';
        confidenceBadge.textContent = (confidence || 'low').toUpperCase();
        applyConfidence(confidence || 'low');
        confidenceSignals.textContent = signals.length > 0 ? signals.join(', ') : 'No extra debug signals';
      } else {
        confidenceSection.style.display = 'none';
      }
    }

    function placeToolbar(rect) {
      if (!options || !options.showSelectionToolbar) {
        detailsCard.style.display = 'none';
        return;
      }

      currentRect = rect;
      renderSelectionMeta();

      var detailsWidth = Math.min(640, Math.max(320, win.innerWidth - 16));
      var detailsHeight = 346;
      var centerX = rect.x + Math.min(rect.width, 220) / 2;
      var belowTop = rect.y + rect.height + 12;
      var aboveTop = rect.y - detailsHeight - 12;
      var top =
        belowTop + detailsHeight <= win.innerHeight - 8
          ? belowTop
          : Math.max(8, aboveTop);
      var detailsLeft = clamp(centerX - detailsWidth / 2, 8, Math.max(8, win.innerWidth - detailsWidth - 8));

      detailsCard.style.left = detailsLeft + 'px';
      detailsCard.style.top = top + 'px';
      detailsCard.style.width = detailsWidth + 'px';
      detailsCard.style.display = 'block';
    }

    function eventTargetInside(event, node) {
      var target = event && event.target;
      return !!target && (target === node || (typeof node.contains === 'function' && node.contains(target)));
    }

    function cancelFromEvent(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (cancelHandler) {
        cancelHandler(event);
      }
    }

    function copyWithNoteFromEvent(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (copyHandler) {
        copyHandler((noteInput.value || '').trim(), event);
      }
    }

    function handleOverlayButtonPointerDown(event) {
      if (eventTargetInside(event, footerCancelButton)) {
        cancelFromEvent(event);
      } else if (eventTargetInside(event, footerCopyButton)) {
        copyWithNoteFromEvent(event);
      }
    }

    function handleOverlayButtonClick(event) {
      if (eventTargetInside(event, footerCancelButton)) {
        cancelFromEvent(event);
      } else if (eventTargetInside(event, footerCopyButton)) {
        copyWithNoteFromEvent(event);
      }
    }

    win.addEventListener('pointerdown', handleOverlayButtonPointerDown, true);
    win.addEventListener('click', handleOverlayButtonClick, true);

    footerCancelButton.addEventListener('click', cancelFromEvent);
    footerCopyButton.addEventListener('click', copyWithNoteFromEvent);

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
      setCursor(cursor) {
        var nextCursor = cursor || 'default';
        win.__ATMOS_PREVIEW_PICK_CURSOR__ = nextCursor === 'default' ? '' : nextCursor;
        if (nextCursor === 'default') {
          cursorStyle.textContent = '';
        } else {
          cursorStyle.textContent =
            'html, body, body * { cursor: ' + nextCursor + ' !important; }' +
            '[data-atmos-preview-overlay="true"], [data-atmos-preview-overlay="true"] * { cursor: revert !important; }';
        }
        root.style.cursor = nextCursor;
        hoverBox.style.cursor = nextCursor;
        lockedBox.style.cursor = nextCursor;
        hoverLabel.style.cursor = nextCursor;
        lockedLabel.style.cursor = nextCursor;
      },
      updateHover(rect, label) {
        place(hoverBox, hoverLabel, rect, label);
      },
      clearHover() {
        hoverBox.style.display = 'none';
        hoverLabel.style.display = 'none';
      },
      lock(rect, label, meta) {
        if (meta) {
          currentMeta = meta;
        }
        place(lockedBox, lockedLabel, rect, label);
        // Always show the input card directly on selection.
        placeToolbar(rect);
        if (meta) {
          win.setTimeout(function () {
            try { noteInput.focus(); } catch (_) {}
          }, 0);
        }
      },
      clearLocked() {
        lockedBox.style.display = 'none';
        lockedLabel.style.display = 'none';
        detailsCard.style.display = 'none';
        noteInput.value = '';
        currentMeta = null;
        currentRect = null;
      },
      onCancel(handler) {
        cancelHandler = handler;
      },
      onCopy(handler) {
        copyHandler = handler;
      },
      destroy() {
        cursorStyle.remove();
        win.__ATMOS_PREVIEW_PICK_CURSOR__ = '';
        win.removeEventListener('pointerdown', handleOverlayButtonPointerDown, true);
        win.removeEventListener('click', handleOverlayButtonClick, true);
        detailsCard.remove();
        chromeRoot.remove();
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
      .map(function (candidate) { return candidate.name; })
      .reverse();
    if (!chain.length) {
      chain = candidates.slice(0, 5).map(function (candidate) { return candidate.name; }).reverse();
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

  function locateVue(element) {
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
      .map(function (candidate) { return candidate.name; })
      .reverse();
    if (!chain.length) {
      chain = candidates.slice(0, 5).map(function (candidate) { return candidate.name; }).reverse();
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
      .map(function (candidate) { return candidate.name; })
      .reverse();
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

  function locateSvelte(element) {
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
    var chain = candidates.slice(0, 5).map(function (candidate) { return candidate.componentName; }).reverse();
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
    return locateVue(element) ||
      locateAngular(element, win) ||
      (hasSvelteMetaInDocument(win) ? locateSvelte(element) : null) ||
      locateReact(element) ||
      null;
  }

  function getCapabilities(win) {
    var capabilities = ['dom-inspection', 'element-selection'];
    if (locateReact(win.document.body || win.document.documentElement)) capabilities.push('source-locator:react');
    if (locateVue(win.document.body || win.document.documentElement)) capabilities.push('source-locator:vue');
    if (locateAngular(win.document.body || win.document.documentElement, win)) capabilities.push('source-locator:angular');
    if (hasSvelteMetaInDocument(win)) capabilities.push('source-locator:svelte');
    return capabilities;
  }

  function createRuntime(config) {
    var win = config.win || window;
    var doc = win.document;
    var overlay = createPreviewOverlay(win, doc, {
      showSelectionToolbar: !!config.showSelectionToolbar,
    });
    var hoverCursor = createPreviewPickerCursor(PICKER_HOVER_COLOR, PICKER_HOVER_BORDER_COLOR);
    var lockedCursor = createPreviewPickerCursor(PICKER_LOCKED_COLOR, PICKER_LOCKED_BORDER_COLOR);
    var lastPickerCursor = '';
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

    function setPickerCursor(cursor) {
      var nextCursor = cursor || 'default';
      overlay.setCursor(nextCursor);
      if (nextCursor === lastPickerCursor) return;
      lastPickerCursor = nextCursor;
      emit({
        type: 'atmos-preview:cursor-changed',
        cursor: nextCursor,
      });
    }

    function getPageTitle() {
      return (doc.title || '').trim();
    }

    function getPageFaviconUrl() {
      var selectors = [
        'link[rel~="icon"][href]',
        'link[rel="shortcut icon"][href]',
        'link[rel="apple-touch-icon"][href]',
        'link[rel="apple-touch-icon-precomposed"][href]',
      ];
      for (var i = 0; i < selectors.length; i += 1) {
        var node = doc.querySelector(selectors[i]);
        var href = node && node.href;
        if (!href) continue;
        try {
          return new URL(href, win.location.href).href;
        } catch (_) {
          return href;
        }
      }
      try {
        return new URL('/favicon.ico', win.location.origin).href;
      } catch (_) {
        return '';
      }
    }

    function resolveOpenTabUrl(value) {
      var rawValue = (value == null ? '' : String(value)).trim();
      if (!rawValue) return '';
      try {
        var parsedUrl = new URL(rawValue, win.location.href);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? parsedUrl.href : '';
      } catch (_) {
        return '';
      }
    }

    function shouldOpenAnchorInNewTab(anchor, event) {
      var target = (anchor.getAttribute('target') || '').trim().toLowerCase();
      var opensSeparateContext = !!target && target !== '_self' && target !== '_parent' && target !== '_top';
      return event.button === 1 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        opensSeparateContext;
    }

    function emitOpenTab(targetUrl) {
      emit({
        type: 'atmos-preview:open-tab',
        pageUrl: win.location.href,
        targetUrl: targetUrl,
      });
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
        extensionVersion: EXTENSION_VERSION,
        pageTitle: getPageTitle(),
        faviconUrl: getPageFaviconUrl(),
      });
    }

    function clearSelection(notifyHost) {
      state.locked = null;
      overlay.clearLocked();
      overlay.clearHover();
      setPickerCursor(state.enabled ? hoverCursor : 'default');
      if (notifyHost) {
        emit({ type: 'atmos-preview:cleared' });
      } else {
        // Host-initiated clear also disables pick mode so hover
        // overlays do not reappear after the selection is removed.
        state.enabled = false;
        state.hovered = null;
        setPickerCursor('default');
      }
    }

    function selectElement(element) {
      var rect = getPreviewElementRect(element);
      var elementContext = inspectPreviewElement(element);
      var sourceLocation = locateSourceForElement(element, win);
      overlay.lock(
        rect,
        (sourceLocation && sourceLocation.componentName) || buildElementSelector(element),
        {
          pageUrl: win.location.href,
          sourceLocation: sourceLocation,
          label: buildElementSelector(element),
        }
      );
      setPickerCursor(lockedCursor);
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
        setPickerCursor(lockedCursor);
        return;
      }
      var target = event.target;
      if (!(target instanceof Element) || isIgnoredElement(target)) {
        overlay.clearHover();
        setPickerCursor(hoverCursor);
        state.hovered = null;
        return;
      }
      state.hovered = target;
      setPickerCursor(hoverCursor);
      var rect = getPreviewElementRect(target);
      overlay.updateHover(rect, buildElementSelector(target));
    }

    function isOverlayEventTarget(target) {
      return target instanceof Element && target.closest && target.closest('[data-atmos-preview-overlay="true"]');
    }

    function blockPagePointerEvent(event) {
      if (!state.enabled) return;
      if (isOverlayEventTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    }

    function handleClick(event) {
      if (!state.enabled) return;
      var target = event.target;
      if (isOverlayEventTarget(target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (state.locked) return;
      if (!(target instanceof Element) || isIgnoredElement(target)) return;
      state.locked = target;
      overlay.clearHover();
      selectElement(target);
    }

    function handleKeyDown(event) {
      if (!state.enabled || event.key !== 'Escape') return;
      clearSelection(true);
    }

    function handleOpenTabClick(event) {
      if (!state.sessionId || state.enabled || event.defaultPrevented) return;
      if (event.button !== 0 && event.button !== 1) return;
      var target = event.target;
      if (!(target instanceof Element) || !target.closest) return;
      var anchor = target.closest('a[href]');
      if (!anchor || !shouldOpenAnchorInNewTab(anchor, event)) return;
      var targetUrl = resolveOpenTabUrl(anchor.href);
      if (!targetUrl) return;
      event.preventDefault();
      event.stopPropagation();
      emitOpenTab(targetUrl);
    }

    function syncLockedOverlay() {
      if (!state.locked) return;
      if (!doc.contains(state.locked)) {
        clearSelection(true);
        return;
      }
      var rect = getPreviewElementRect(state.locked);
      overlay.lock(rect, buildElementSelector(state.locked));
    }

    doc.addEventListener('mousemove', handleMouseMove, true);
    doc.addEventListener('pointerdown', blockPagePointerEvent, true);
    doc.addEventListener('mousedown', blockPagePointerEvent, true);
    doc.addEventListener('mouseup', blockPagePointerEvent, true);
    doc.addEventListener('click', handleClick, true);
    doc.addEventListener('click', handleOpenTabClick, true);
    doc.addEventListener('auxclick', handleOpenTabClick, true);
    doc.addEventListener('dblclick', blockPagePointerEvent, true);
    doc.addEventListener('contextmenu', blockPagePointerEvent, true);
    win.addEventListener('keydown', handleKeyDown, true);
    win.addEventListener('scroll', syncLockedOverlay, true);
    win.addEventListener('resize', syncLockedOverlay, true);

    overlay.onCancel(function (event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      clearSelection(true);
    });
    overlay.onCopy(function (note, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!state.locked) return;
      emit({
        type: 'atmos-preview:toolbar-action',
        action: 'add',
        note: note || undefined,
      });
    });

    var lastKnownPath = win.location.pathname + win.location.hash;
    var lastKnownTitle = getPageTitle();
    var lastKnownFaviconUrl = getPageFaviconUrl();
    var originalPushState = win.history.pushState.bind(win.history);
    var originalReplaceState = win.history.replaceState.bind(win.history);
    var originalOpen = win.open.bind(win);
    var titleObserverTarget = doc.head || doc.documentElement;
    var titleObserver = null;

    function checkUrlChange() {
      var currentPath = win.location.pathname + win.location.hash;
      if (currentPath !== lastKnownPath) {
        lastKnownPath = currentPath;
        var currentUrl = win.location.href;
        var currentTitle = getPageTitle();
        var currentFaviconUrl = getPageFaviconUrl();
        lastKnownTitle = currentTitle;
        lastKnownFaviconUrl = currentFaviconUrl;
        emit({
          type: 'atmos-preview:navigation-changed',
          pageUrl: currentUrl,
          pageTitle: currentTitle,
          faviconUrl: currentFaviconUrl,
        });
      }
    }

    function handlePopState() { checkUrlChange(); }
    win.addEventListener('popstate', handlePopState);
    if (titleObserverTarget && typeof win.MutationObserver === 'function') {
      titleObserver = new win.MutationObserver(function () {
        var nextTitle = getPageTitle();
        var nextFaviconUrl = getPageFaviconUrl();
        if (nextTitle === lastKnownTitle && nextFaviconUrl === lastKnownFaviconUrl) return;
        lastKnownTitle = nextTitle;
        lastKnownFaviconUrl = nextFaviconUrl;
        emit({
          type: 'atmos-preview:title-changed',
          pageUrl: win.location.href,
          pageTitle: nextTitle,
          faviconUrl: nextFaviconUrl,
        });
      });
      titleObserver.observe(titleObserverTarget, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['href', 'rel'],
      });
    }

    win.history.pushState = function () {
      originalPushState.apply(win.history, arguments);
      checkUrlChange();
    };
    win.history.replaceState = function () {
      originalReplaceState.apply(win.history, arguments);
      checkUrlChange();
    };
    win.open = function (url, target, features) {
      var targetName = (target || '').trim().toLowerCase();
      var targetUrl = resolveOpenTabUrl(url);
      if (state.sessionId && targetUrl && targetName !== '_self' && targetName !== '_parent' && targetName !== '_top') {
        emitOpenTab(targetUrl);
        return null;
      }
      return originalOpen(url, target, features);
    };

    return {
      announceReady: announceReady,
      enterPickMode: function (sessionId) {
        state.sessionId = sessionId;
        state.enabled = true;
        setPickerCursor(hoverCursor);
        emit({
          type: 'atmos-preview:ready',
          capabilities: getCapabilities(win),
          extensionVersion: EXTENSION_VERSION,
          pageTitle: getPageTitle(),
          faviconUrl: getPageFaviconUrl(),
        });
      },
      clearSelection: clearSelection,
      exitPickMode: function () {
        state.enabled = false;
        state.locked = null;
        state.hovered = null;
        overlay.clearLocked();
        overlay.clearHover();
        setPickerCursor('default');
      },
      destroy: function () {
        setPickerCursor('default');
        state.enabled = false;
        lastPickerCursor = '';
        doc.removeEventListener('mousemove', handleMouseMove, true);
        doc.removeEventListener('pointerdown', blockPagePointerEvent, true);
        doc.removeEventListener('mousedown', blockPagePointerEvent, true);
        doc.removeEventListener('mouseup', blockPagePointerEvent, true);
        doc.removeEventListener('click', handleClick, true);
        doc.removeEventListener('click', handleOpenTabClick, true);
        doc.removeEventListener('auxclick', handleOpenTabClick, true);
        doc.removeEventListener('dblclick', blockPagePointerEvent, true);
        doc.removeEventListener('contextmenu', blockPagePointerEvent, true);
        win.removeEventListener('keydown', handleKeyDown, true);
        win.removeEventListener('scroll', syncLockedOverlay, true);
        win.removeEventListener('resize', syncLockedOverlay, true);
        win.removeEventListener('popstate', handlePopState);
        if (titleObserver) {
          titleObserver.disconnect();
        }
        win.history.pushState = originalPushState;
        win.history.replaceState = originalReplaceState;
        win.open = originalOpen;
        overlay.destroy();
      },
    };
  }

  window.__ATMOS_PREVIEW_RUNTIME__ = {
    createRuntime: createRuntime,
  };
  window.dispatchEvent(new Event('atmos-preview-runtime-ready'));
}());
