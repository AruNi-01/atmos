// Canonical preview runtime shared by the desktop preview bridge and browser extension.
(function () {
  if (window.__ATMOS_PREVIEW_RUNTIME__) return;

  var EXTENSION_VERSION = '0.1.2';

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
    function createBox(color) {
      var segments = ['top', 'right', 'bottom', 'left'].map(function () {
        var segment = doc.createElement('div');
        segment.dataset.atmosPreviewOverlay = 'true';
        segment.style.position = 'fixed';
        segment.style.background = color;
        segment.style.pointerEvents = 'none';
        segment.style.display = 'none';
        segment.style.zIndex = '2147483646';
        doc.documentElement.appendChild(segment);
        return segment;
      });
      return {
        segments: segments,
      };
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
      label.style.zIndex = '2147483647';
      doc.documentElement.appendChild(label);
      return label;
    }

    const hoverBox = createBox('#2563eb');
    const lockedBox = createBox('#f97316');
    const hoverLabel = createLabel();
    const lockedLabel = createLabel();

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
      button.style.gap = '8px';
      button.style.height = '34px';
      button.style.border = '0';
      button.style.outline = 'none';
      button.style.cursor = 'pointer';
      button.style.pointerEvents = 'auto';
      button.style.fontFamily = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif';
      button.style.fontSize = '13px';
      button.style.lineHeight = '1';
      button.style.transition = 'background 140ms ease, color 140ms ease, transform 140ms ease, opacity 140ms ease';
      button.addEventListener('mousedown', function (event) {
        event.stopPropagation();
      }, true);
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
      }, true);
      return button;
    }

    function createToolbarIconButton(path, title) {
      const button = createButtonBase();
      button.title = title;
      button.style.width = '34px';
      button.style.minWidth = '34px';
      button.style.borderRadius = '9px';
      button.style.background = 'transparent';
      button.style.color = '#f5f5f7';
      button.appendChild(createSvgIcon(path, 17));
      button.addEventListener('mouseenter', function () {
        button.style.background = 'rgba(255, 255, 255, 0.08)';
      });
      button.addEventListener('mouseleave', function () {
        button.style.background = 'transparent';
      });
      return button;
    }

    function createToolbarTextButton(iconPath, label, title) {
      const button = createButtonBase();
      button.title = title || label;
      button.style.padding = '0 12px';
      button.style.borderRadius = '10px';
      button.style.background = 'transparent';
      button.style.color = '#f5f5f7';
      button.style.fontWeight = '600';
      button.appendChild(createSvgIcon(iconPath, 17));
      const text = doc.createElement('span');
      text.textContent = label;
      button.appendChild(text);
      button.addEventListener('mouseenter', function () {
        button.style.background = 'rgba(255, 255, 255, 0.08)';
      });
      button.addEventListener('mouseleave', function () {
        button.style.background = 'transparent';
      });
      return button;
    }

    function createFooterButton(label, variant, iconPath) {
      const button = createButtonBase();
      button.style.padding = '0 15px';
      button.style.borderRadius = '12px';
      button.style.fontWeight = '600';
      button.style.minWidth = label === 'Cancel' ? '88px' : '152px';
      if (variant === 'primary') {
        button.style.background = '#f4f4f6';
        button.style.color = '#1f1f24';
      } else {
        button.style.background = 'transparent';
        button.style.color = '#f5f5f7';
      }
      if (iconPath) {
        button.appendChild(createSvgIcon(iconPath, 17));
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

    const toolbar = doc.createElement('div');
    toolbar.dataset.atmosPreviewOverlay = 'true';
    toolbar.style.position = 'fixed';
    toolbar.style.display = 'none';
    toolbar.style.alignItems = 'center';
    toolbar.style.gap = '3px';
    toolbar.style.padding = '4px';
    toolbar.style.borderRadius = '12px';
    toolbar.style.border = '1px solid rgba(255, 255, 255, 0.14)';
    toolbar.style.background = 'rgba(23, 23, 27, 0.96)';
    toolbar.style.boxShadow = '0 14px 36px rgba(0, 0, 0, 0.28)';
    toolbar.style.pointerEvents = 'auto';
    toolbar.style.backdropFilter = 'blur(16px)';
    toolbar.style.webkitBackdropFilter = 'blur(16px)';
    toolbar.style.zIndex = '2147483647';
    toolbar.style.width = 'auto';
    toolbar.style.whiteSpace = 'nowrap';
    doc.documentElement.appendChild(toolbar);

    const detailsCard = doc.createElement('div');
    detailsCard.dataset.atmosPreviewOverlay = 'true';
    detailsCard.style.position = 'fixed';
    detailsCard.style.display = 'none';
    detailsCard.style.pointerEvents = 'auto';
    detailsCard.style.borderRadius = '16px';
    detailsCard.style.border = '1px solid rgba(255, 255, 255, 0.14)';
    detailsCard.style.background = 'rgba(27, 27, 32, 0.98)';
    detailsCard.style.boxShadow = '0 22px 50px rgba(0, 0, 0, 0.34)';
    detailsCard.style.backdropFilter = 'blur(18px)';
    detailsCard.style.webkitBackdropFilter = 'blur(18px)';
    detailsCard.style.padding = '18px 20px 20px';
    detailsCard.style.boxSizing = 'border-box';
    detailsCard.style.zIndex = '2147483647';
    doc.documentElement.appendChild(detailsCard);

    [toolbar, detailsCard].forEach(function (node) {
      node.addEventListener('mousedown', stopPropagation);
      node.addEventListener('mouseup', stopPropagation);
      node.addEventListener('click', stopPropagation);
      node.addEventListener('dblclick', stopPropagation);
    });

    const cancelIconPath = '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>';
    const copyIconPath = '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
    const chevronDownIconPath = '<path d="m6 9 6 6 6-6"></path>';

    const topCancelButton = createToolbarTextButton(cancelIconPath, 'Cancel', 'Cancel selection');
    const quickCopyButton = createToolbarIconButton(copyIconPath, 'Copy for AI');
    const expandButton = createToolbarIconButton(chevronDownIconPath, 'Add note');
    expandButton.style.transformOrigin = '50% 50%';
    toolbar.appendChild(topCancelButton);
    toolbar.appendChild(quickCopyButton);
    toolbar.appendChild(expandButton);

    const sourceSummary = doc.createElement('div');
    sourceSummary.style.color = '#b9b9c2';
    sourceSummary.style.fontSize = '13px';
    sourceSummary.style.lineHeight = '1.4';
    sourceSummary.style.marginBottom = '14px';
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
    noteInput.style.minHeight = '104px';
    noteInput.style.resize = 'none';
    noteInput.style.boxSizing = 'border-box';
    noteInput.style.borderRadius = '12px';
    noteInput.style.border = '1px solid rgba(255, 255, 255, 0.14)';
    noteInput.style.background = 'rgba(41, 41, 47, 0.98)';
    noteInput.style.boxShadow = 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)';
    noteInput.style.color = '#f5f5f7';
    noteInput.style.padding = '12px 14px';
    noteInput.style.fontSize = '13px';
    noteInput.style.lineHeight = '1.45';
    noteInput.style.outline = 'none';
    noteInput.style.marginBottom = '16px';
    noteInput.addEventListener('mousedown', stopPropagation);
    noteInput.addEventListener('mouseup', stopPropagation);
    noteInput.addEventListener('click', stopPropagation);
    detailsCard.appendChild(noteInput);

    const confidenceSection = doc.createElement('div');
    confidenceSection.style.display = 'none';
    confidenceSection.style.marginBottom = '18px';
    detailsCard.appendChild(confidenceSection);

    const confidenceHeader = doc.createElement('div');
    confidenceHeader.style.display = 'flex';
    confidenceHeader.style.alignItems = 'center';
    confidenceHeader.style.justifyContent = 'space-between';
    confidenceHeader.style.gap = '12px';
    confidenceHeader.style.marginBottom = '10px';
    confidenceSection.appendChild(confidenceHeader);

    const confidenceTitle = doc.createElement('div');
    confidenceTitle.textContent = 'Source Code Confidence';
    confidenceTitle.style.color = '#b9b9c2';
    confidenceTitle.style.fontSize = '12px';
    confidenceTitle.style.fontWeight = '600';
    confidenceHeader.appendChild(confidenceTitle);

    const confidenceBadge = doc.createElement('span');
    confidenceBadge.style.display = 'inline-flex';
    confidenceBadge.style.alignItems = 'center';
    confidenceBadge.style.justifyContent = 'center';
    confidenceBadge.style.minWidth = '64px';
    confidenceBadge.style.padding = '0 12px';
    confidenceBadge.style.height = '30px';
    confidenceBadge.style.borderRadius = '999px';
    confidenceBadge.style.fontSize = '11px';
    confidenceBadge.style.fontWeight = '700';
    confidenceBadge.style.letterSpacing = '0.12em';
    confidenceHeader.appendChild(confidenceBadge);

    const confidenceSignals = doc.createElement('div');
    confidenceSignals.style.borderRadius = '12px';
    confidenceSignals.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    confidenceSignals.style.background = 'rgba(35, 35, 41, 0.85)';
    confidenceSignals.style.padding = '12px 14px';
    confidenceSignals.style.color = '#b9b9c2';
    confidenceSignals.style.fontSize = '12px';
    confidenceSignals.style.lineHeight = '1.45';
    confidenceSection.appendChild(confidenceSignals);

    const footer = doc.createElement('div');
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.justifyContent = 'space-between';
    footer.style.gap = '12px';
    detailsCard.appendChild(footer);

    const footerCancelButton = createFooterButton('Cancel', 'ghost');
    const footerCopyButton = createFooterButton('Copy for AI', 'primary', copyIconPath);
    footer.appendChild(footerCancelButton);
    footer.appendChild(footerCopyButton);

    let expanded = false;
    let currentMeta = null;
    let currentRect = null;
    let cancelHandler = null;
    let copyHandler = null;

    function setExpanded(nextExpanded) {
      expanded = !!nextExpanded;
      expandButton.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
      detailsCard.style.display = expanded ? 'block' : 'none';
      if (currentRect) {
        placeToolbar(currentRect);
      }
    }

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
        toolbar.style.display = 'none';
        detailsCard.style.display = 'none';
        return;
      }

      currentRect = rect;
      renderSelectionMeta();

      toolbar.style.width = 'auto';
      toolbar.style.visibility = 'hidden';
      toolbar.style.display = 'inline-flex';
      var toolbarWidth = Math.max(156, Math.ceil(toolbar.getBoundingClientRect().width));
      var toolbarHeight = 42;
      var detailsWidth = Math.min(480, Math.max(280, win.innerWidth - 16));
      var detailsHeight = expanded ? 260 : 0;
      var gap = expanded ? 10 : 0;
      var totalHeight = toolbarHeight + detailsHeight + gap;
      var centerX = rect.x + Math.min(rect.width, 220) / 2;
      var belowTop = rect.y + rect.height + 12;
      var aboveTop = rect.y - totalHeight - 12;
      var top =
        belowTop + totalHeight <= win.innerHeight - 8
          ? belowTop
          : Math.max(8, aboveTop);
      var toolbarLeft = clamp(centerX - toolbarWidth / 2, 8, Math.max(8, win.innerWidth - toolbarWidth - 8));
      var detailsLeft = clamp(centerX - detailsWidth / 2, 8, Math.max(8, win.innerWidth - detailsWidth - 8));

      toolbar.style.left = toolbarLeft + 'px';
      toolbar.style.top = top + 'px';
      toolbar.style.visibility = 'visible';
      toolbar.style.display = 'inline-flex';

      detailsCard.style.left = detailsLeft + 'px';
      detailsCard.style.top = (top + toolbarHeight + gap) + 'px';
      detailsCard.style.width = detailsWidth + 'px';
      detailsCard.style.display = expanded ? 'block' : 'none';
    }

    topCancelButton.addEventListener('click', function (event) {
      if (cancelHandler) {
        cancelHandler(event);
      }
    });
    footerCancelButton.addEventListener('click', function (event) {
      if (cancelHandler) {
        cancelHandler(event);
      }
    });
    quickCopyButton.addEventListener('click', function (event) {
      if (copyHandler) {
        copyHandler('', event);
      }
    });
    footerCopyButton.addEventListener('click', function (event) {
      if (copyHandler) {
        copyHandler((noteInput.value || '').trim(), event);
      }
    });
    expandButton.addEventListener('click', function () {
      setExpanded(!expanded);
      if (expanded) {
        win.setTimeout(function () {
          noteInput.focus();
        }, 0);
      }
    });

    function place(box, label, rect, text) {
      var thickness = 2;
      var width = Math.max(rect.width, thickness);
      var height = Math.max(rect.height, thickness);
      var top = box.segments[0];
      var right = box.segments[1];
      var bottom = box.segments[2];
      var left = box.segments[3];

      top.style.display = 'block';
      top.style.left = rect.x + 'px';
      top.style.top = rect.y + 'px';
      top.style.width = width + 'px';
      top.style.height = thickness + 'px';

      bottom.style.display = 'block';
      bottom.style.left = rect.x + 'px';
      bottom.style.top = (rect.y + height - thickness) + 'px';
      bottom.style.width = width + 'px';
      bottom.style.height = thickness + 'px';

      left.style.display = 'block';
      left.style.left = rect.x + 'px';
      left.style.top = rect.y + 'px';
      left.style.width = thickness + 'px';
      left.style.height = height + 'px';

      right.style.display = 'block';
      right.style.left = (rect.x + width - thickness) + 'px';
      right.style.top = rect.y + 'px';
      right.style.width = thickness + 'px';
      right.style.height = height + 'px';

      label.style.display = text ? 'block' : 'none';
      label.textContent = text || '';
      label.style.left = rect.x + 'px';
      label.style.top = Math.max(8, rect.y - 32) + 'px';
    }

    function clearBox(box) {
      box.segments.forEach(function (segment) {
        segment.style.display = 'none';
      });
    }

    return {
      setCursor() {},
      updateHover(rect, label) {
        place(hoverBox, hoverLabel, rect, label);
      },
      clearHover() {
        clearBox(hoverBox);
        hoverLabel.style.display = 'none';
      },
      lock(rect, label, meta) {
        if (meta) {
          currentMeta = meta;
        }
        place(lockedBox, lockedLabel, rect, label);
        placeToolbar(rect);
      },
      clearLocked() {
        clearBox(lockedBox);
        lockedLabel.style.display = 'none';
        toolbar.style.display = 'none';
        detailsCard.style.display = 'none';
        noteInput.value = '';
        currentMeta = null;
        currentRect = null;
        setExpanded(false);
      },
      onCancel(handler) {
        cancelHandler = handler;
      },
      onCopy(handler) {
        copyHandler = handler;
      },
      destroy() {
        toolbar.remove();
        detailsCard.remove();
        hoverBox.segments.forEach(function (segment) { segment.remove(); });
        lockedBox.segments.forEach(function (segment) { segment.remove(); });
        hoverLabel.remove();
        lockedLabel.remove();
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

    function getPageTitle() {
      return (doc.title || '').trim();
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
      });
    }

    function clearSelection(notifyHost) {
      state.locked = null;
      overlay.clearLocked();
      overlay.clearHover();
      overlay.setCursor('default');
      if (notifyHost) {
        emit({ type: 'atmos-preview:cleared' });
      } else {
        // Host-initiated clear also disables pick mode so hover
        // overlays do not reappear after the selection is removed.
        state.enabled = false;
        state.hovered = null;
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
        overlay.setCursor('default');
        state.hovered = null;
        return;
      }
      state.hovered = target;
      var computedCursor = '';
      try {
        computedCursor = win.getComputedStyle(target).cursor || '';
      } catch (_) {}
      overlay.setCursor(computedCursor);
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
    doc.addEventListener('click', handleClick, true);
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
        action: 'copy',
        note: note || undefined,
      });
    });

    var lastKnownPath = win.location.pathname + win.location.hash;
    var lastKnownTitle = getPageTitle();
    var originalPushState = win.history.pushState.bind(win.history);
    var originalReplaceState = win.history.replaceState.bind(win.history);
    var titleObserverTarget = doc.head || doc.documentElement;
    var titleObserver = null;

    function checkUrlChange() {
      var currentPath = win.location.pathname + win.location.hash;
      if (currentPath !== lastKnownPath) {
        lastKnownPath = currentPath;
        var currentUrl = win.location.href;
        var currentTitle = getPageTitle();
        lastKnownTitle = currentTitle;
        emit({
          type: 'atmos-preview:navigation-changed',
          pageUrl: currentUrl,
          pageTitle: currentTitle,
        });
      }
    }

    function handlePopState() { checkUrlChange(); }
    win.addEventListener('popstate', handlePopState);
    if (titleObserverTarget && typeof win.MutationObserver === 'function') {
      titleObserver = new win.MutationObserver(function () {
        var nextTitle = getPageTitle();
        if (nextTitle === lastKnownTitle) return;
        lastKnownTitle = nextTitle;
        emit({
          type: 'atmos-preview:title-changed',
          pageTitle: nextTitle,
        });
      });
      titleObserver.observe(titleObserverTarget, {
        subtree: true,
        childList: true,
        characterData: true,
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

    return {
      announceReady: announceReady,
      enterPickMode: function (sessionId) {
        state.sessionId = sessionId;
        state.enabled = true;
        emit({
          type: 'atmos-preview:ready',
          capabilities: getCapabilities(win),
          extensionVersion: EXTENSION_VERSION,
          pageTitle: getPageTitle(),
        });
      },
      clearSelection: clearSelection,
      exitPickMode: function () {
        state.enabled = false;
        state.locked = null;
        state.hovered = null;
        overlay.clearLocked();
        overlay.clearHover();
        overlay.setCursor('default');
      },
      destroy: function () {
        state.enabled = false;
        doc.removeEventListener('mousemove', handleMouseMove, true);
        doc.removeEventListener('click', handleClick, true);
        win.removeEventListener('keydown', handleKeyDown, true);
        win.removeEventListener('scroll', syncLockedOverlay, true);
        win.removeEventListener('resize', syncLockedOverlay, true);
        win.removeEventListener('popstate', handlePopState);
        if (titleObserver) {
          titleObserver.disconnect();
        }
        win.history.pushState = originalPushState;
        win.history.replaceState = originalReplaceState;
        overlay.destroy();
      },
    };
  }

  window.__ATMOS_PREVIEW_RUNTIME__ = {
    createRuntime: createRuntime,
  };
  window.dispatchEvent(new Event('atmos-preview-runtime-ready'));
}());
