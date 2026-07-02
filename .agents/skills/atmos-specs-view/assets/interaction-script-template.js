(() => {
  const dataEl = document.getElementById("spec-view-data") || document.getElementById("app-data");
  if (!dataEl) throw new Error("Missing specs view data payload");
  const data = JSON.parse(dataEl.textContent || "{}");
  const ui = data.ui || {};
  const docs = data.docs || {};
  const docNames = Object.keys(docs);
  const md = window.markdownit ? window.markdownit({ html: false, linkify: true, typographer: true }) : null;

  const stableSourceKey = data.sources?.map((source) => source.spec_path || source.spec_id).join("|") || data.view_id;
  const storageKey = `atmos-specs-view:${data.view_id || "view"}:${stableSourceKey}`;
  const legacyStorageKeys = [
    `atmos-spec-view:${data.view_id || stableSourceKey}`,
    `atmos-specs-view:${data.view_id || "view"}`,
  ];

  let activeDoc = docNames[0] || "";
  let viewMode = "rendered";
  const feedback = loadFeedback();

  const tabs = Array.from(document.querySelectorAll("[data-doc]"));
  const rendered = document.getElementById("document-viewer") || document.getElementById("markdown-rendered") || document.getElementById("spec-detail-panel");
  const source = document.getElementById("document-source") || document.getElementById("markdown-source");
  const title = document.getElementById("active-doc-title") || document.getElementById("document-title");
  const decisions = document.getElementById("file-decisions") || document.getElementById("section-decisions") || document.getElementById("spec-decisions");
  const globalNotes = document.getElementById("global-notes");
  const sourceDialog = document.getElementById("source-dialog");
  const reviewDialog = document.getElementById("review-dialog");
  const toast = document.getElementById("toast") || createToast();

  function t(key, fallback) {
    return ui[key] || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function loadFeedback() {
    try {
      const raw = localStorage.getItem(storageKey) || legacyStorageKeys.map((key) => localStorage.getItem(key)).find(Boolean);
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }

  function saveFeedback() {
    localStorage.setItem(storageKey, JSON.stringify(feedback, null, 2));
  }

  function createToast() {
    const el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.className = "toast";
    document.body.appendChild(el);
    return el;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
      return;
    }
    dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      dialog.close();
      return;
    }
    dialog.removeAttribute("open");
  }

  function openSourceDialog() {
    renderDoc();
    openDialog(sourceDialog);
  }

  function closeSourceDialog() {
    closeDialog(sourceDialog);
  }

  function openReviewDialog() {
    openDialog(reviewDialog);
  }

  function closeReviewDialog() {
    closeDialog(reviewDialog);
  }

  function renderTabs() {
    tabs.forEach((tab) => {
      const selected = tab.dataset.doc === activeDoc;
      tab.setAttribute("aria-selected", String(selected));
      tab.classList.toggle("active", selected);
    });
  }

  function renderDoc() {
    if (!activeDoc || !rendered || !source) return;
    const markdown = docs[activeDoc] || "";
    if (title) title.textContent = activeDoc;
    rendered.innerHTML = md ? md.render(markdown) : `<pre>${escapeHtml(markdown)}</pre>`;
    renderMermaidBlocks(rendered);
    source.textContent = markdown;
    rendered.hidden = viewMode !== "rendered";
    source.hidden = viewMode !== "source";
    document.querySelectorAll('[data-action="show-rendered"]').forEach((button) => {
      button.classList.toggle("active", viewMode === "rendered");
    });
    document.querySelectorAll('[data-action="show-source"]').forEach((button) => {
      button.classList.toggle("active", viewMode === "source");
    });
    renderTabs();
  }

  function renderMermaidBlocks(root) {
    if (!window.mermaid || !root) return;
    const fallbackToSource = () => {
      root.querySelectorAll(".language-mermaid, .mermaid").forEach((node) => {
        const fallback = document.createElement("pre");
        fallback.className = "raw-view mermaid-fallback";
        fallback.textContent = node.textContent || "";
        node.replaceWith(fallback);
      });
    };
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: data.mermaid_theme || "default",
      });
      const result = window.mermaid.run({ nodes: root.querySelectorAll(".language-mermaid, .mermaid") });
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          console.warn("Mermaid render failed", error);
          fallbackToSource();
        });
      }
    } catch (error) {
      console.warn("Mermaid render failed", error);
      fallbackToSource();
    }
  }

  function renderDecisions() {
    if (!decisions) return;
    decisions.replaceChildren(...docNames.map((name) => createDecisionControl(name)));
    if (globalNotes) globalNotes.value = feedback.global_notes || "";
  }

  function createDecisionControl(name) {
    const entry = feedback[name] || { decision: "unreviewed", notes: "" };
    const section = document.createElement("section");
    section.className = "decision";
    section.dataset.decisionFile = name;

    const heading = document.createElement("strong");
    heading.textContent = name;
    section.appendChild(heading);

    const row = document.createElement("div");
    row.className = "choice-row";
    [
      ["unreviewed", t("unreviewed", "Unreviewed")],
      ["approved", t("approved", "Approved")],
      ["needs-changes", t("needsChanges", "Needs changes")],
      ["needs-answer", t("needsAnswer", "Needs answer")],
      ["ignore", t("ignore", "Ignore for now")],
    ].forEach(([value, labelText]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `decision-${name}`;
      input.value = value;
      input.checked = entry.decision === value;
      label.append(input, document.createTextNode(` ${labelText}`));
      row.appendChild(label);
    });
    section.appendChild(row);

    const notes = document.createElement("textarea");
    notes.dataset.noteFor = name;
    notes.placeholder = t("fileNotesPlaceholder", "Notes for this document").replace("{file}", name);
    notes.value = entry.notes || "";
    section.appendChild(notes);

    return section;
  }

  function buildFeedbackJson() {
    const decisions = Object.fromEntries(docNames.map((name) => [name, feedback[name] || { decision: "unreviewed", notes: "" }]));
    return {
      view_id: data.view_id,
      mode: data.mode,
      style: data.style,
      generated_at: data.generated_at,
      sources: data.sources || [],
      decisions,
      changed_decisions: Object.fromEntries(Object.entries(decisions).filter(([, entry]) => (entry.decision && entry.decision !== "unreviewed") || entry.notes)),
      global_notes: feedback.global_notes || "",
    };
  }

  function buildAgentPrompt() {
    const json = buildFeedbackJson();
    const source = (json.sources && json.sources[0]) || {};
    const lines = [
      t("promptIntro", "Continue from this specs view."),
      "",
      `${t("spec", "Spec")}: ${json.view_id || ""}`,
      `${t("path", "Path")}: ${source.spec_path || ""}`,
      `${t("viewStyle", "View style")}: ${json.style || ""}`,
      "",
      `${t("overallNotes", "Overall notes")}:`,
      json.global_notes || t("noNotes", "None"),
      "",
      `${t("perFileDecisions", "Per-file decisions")}:`,
    ];

    docNames.forEach((name) => {
      const entry = json.decisions[name] || { decision: "unreviewed", notes: "" };
      lines.push(`- ${name}: ${entry.decision || "unreviewed"}`);
      if (entry.notes) lines.push(`  ${t("notes", "Notes")}: ${entry.notes}`);
    });

    if (data.synthesis?.needs_attention?.length) {
      lines.push("", `${t("attentionItems", "View-highlighted attention items")}:`);
      data.synthesis.needs_attention.forEach((item) => {
        lines.push(`- ${item.title || item.name || ""}: ${item.detail || item.summary || ""} (${item.source || ""})`);
      });
    }

    if (data.synthesis?.open_questions?.length) {
      lines.push("", `${t("openQuestions", "Open questions")}:`);
      data.synthesis.open_questions.forEach((item) => {
        lines.push(`- ${item.title || item.name || ""}: ${item.detail || item.summary || ""} (${item.source || ""})`);
      });
    }

    lines.push("", JSON.stringify(json, null, 2));
    lines.push("", t("promptInstruction", "Apply only the requested spec changes; otherwise report what is already ready."));
    return lines.join("\n");
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const box = document.createElement("textarea");
      box.value = text;
      document.body.appendChild(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    showToast(message);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeDoc = tab.dataset.doc || activeDoc;
      renderDoc();
    });
  });

  document.querySelectorAll('[data-action="show-rendered"]').forEach((button) => {
    button.addEventListener("click", () => {
      viewMode = "rendered";
      renderDoc();
    });
  });

  document.querySelectorAll('[data-action="show-source"]').forEach((button) => {
    button.addEventListener("click", () => {
      viewMode = "source";
      renderDoc();
    });
  });

  document.querySelectorAll('[data-action="copy-active-source"], [data-action="copy-source"]').forEach((button) => {
    button.addEventListener("click", () => copyText(docs[activeDoc] || "", t("copiedMarkdown", "Markdown copied")));
  });

  document.querySelectorAll('[data-action="copy-agent-prompt"]').forEach((button) => {
    button.addEventListener("click", () => copyText(buildAgentPrompt(), t("copiedAgentPrompt", "Agent prompt copied")));
  });

  document.querySelectorAll('[data-action="copy-json"]').forEach((button) => {
    button.addEventListener("click", () => copyText(JSON.stringify(buildFeedbackJson(), null, 2), t("copiedJson", "JSON copied")));
  });

  document.querySelectorAll('[data-action="open-source"]').forEach((button) => {
    button.addEventListener("click", openSourceDialog);
  });

  document.querySelectorAll('[data-action="close-source"]').forEach((button) => {
    button.addEventListener("click", closeSourceDialog);
  });

  document.querySelectorAll('[data-action="open-review"]').forEach((button) => {
    button.addEventListener("click", openReviewDialog);
  });

  document.querySelectorAll('[data-action="close-review"]').forEach((button) => {
    button.addEventListener("click", closeReviewDialog);
  });

  if (sourceDialog) {
    sourceDialog.addEventListener("click", (event) => {
      if (event.target === sourceDialog) closeSourceDialog();
    });
  }

  if (reviewDialog) {
    reviewDialog.addEventListener("click", (event) => {
      if (event.target === reviewDialog) closeReviewDialog();
    });
  }

  if (decisions) {
    decisions.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "radio") return;
      const file = input.closest("[data-decision-file]")?.dataset.decisionFile;
      if (!file) return;
      feedback[file] = feedback[file] || {};
      feedback[file].decision = input.value;
      saveFeedback();
    });

    decisions.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLTextAreaElement) || !input.dataset.noteFor) return;
      feedback[input.dataset.noteFor] = feedback[input.dataset.noteFor] || {};
      feedback[input.dataset.noteFor].notes = input.value;
      saveFeedback();
    });
  }

  if (globalNotes) {
    globalNotes.addEventListener("input", () => {
      feedback.global_notes = globalNotes.value;
      saveFeedback();
    });
  }

  docNames.forEach((name) => {
    feedback[name] = feedback[name] || { decision: "unreviewed", notes: "" };
  });
  renderDecisions();
  renderDoc();
  saveFeedback();
})();
