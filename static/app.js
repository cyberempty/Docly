(function () {
  "use strict";

  const state = {
    documents: [],
    currentId: null,
    currentDoc: null,
    filter: "all",
    query: "",
    saveTimer: null,
    searchTimer: null,
    dirty: false,
  };
  const el = (id) => document.getElementById(id);
  const docList = el("docList");
  const docCount = el("docCount");
  const searchInput = el("searchInput");
  const emptyState = el("emptyState");
  const editorWrap = el("editorWrap");
  const titleInput = el("titleInput");
  const titleMeasure = document.createElement("canvas").getContext("2d");
  // Size the title box to its text (like Google Docs)
  function fitTitle() {
    const cs = window.getComputedStyle(titleInput);
    titleMeasure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = titleInput.value || titleInput.placeholder;
    const w = Math.ceil(titleMeasure.measureText(text).width) + 24;
    titleInput.style.width = Math.min(420, Math.max(110, w)) + "px";
  }
  const saveStatus = el("saveStatus");
  const favBtn = el("favBtn");
  const deleteBtn = el("deleteBtn");
  const tagsRow = el("tagsRow");
  const tagsList = el("tagsList");
  const tagInput = el("tagInput");
  const toolbar = el("toolbar");
  const richEditor = el("richEditor");
  const newDocBtn = el("newDocBtn");
  const imageInput = el("imageInput");
  const themeToggle = el("themeToggle");
  const helpBtn = el("helpBtn");
  const fontSizeInput = el("fontSizeInput");
  const pageArea = el("pageArea");
  const toast = el("toast");
  const blockSelect = el("blockSelect");
  const caseBtn = el("caseBtn");
  const modalOverlay = el("modalOverlay");
  const modal = el("modal");
  const modalTitle = el("modalTitle");
  const modalMessage = el("modalMessage");
  const modalInput = el("modalInput");
  const modalButtons = el("modalButtons");
  const modalCancel = el("modalCancel");
  const modalOk = el("modalOk");
  const modalInput2 = el("modalInput2");

  async function api(path, options) {
    const res = await fetch(path, options);
    let data = null;
    try { data = await res.json(); } catch (e) { }
    if (!res.ok) {
      throw new Error((data && data.error) || `HTTP Error ${res.status}`);
    }
    return data;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add("hidden"), 2200);
  }

  function showModal(title, message, defaultValue = "", showInput = false) {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      
      if (showInput) {
        modalInput.value = defaultValue;
        modalInput.classList.remove("hidden");
        modalInput2.classList.add("hidden");
        modalInput.focus();
      } else {
        modalInput.classList.add("hidden");
        modalInput2.classList.add("hidden");
      }
      
      modalButtons.classList.remove("hidden");
      modalOverlay.classList.remove("hidden");
      
      const handleOk = () => {
        const result = showInput ? modalInput.value : true;
        closeModal();
        resolve(result);
      };
      
      const handleCancel = () => {
        closeModal();
        resolve(null);
      };
      
      const handleOverlayClick = (e) => {
        if (e.target === modalOverlay) {
          handleCancel();
        }
      };
      
      const handleEscape = (e) => {
        if (e.key === "Escape") {
          handleCancel();
        }
      };
      
      modalOk.onclick = handleOk;
      modalCancel.onclick = handleCancel;
      modalOverlay.onclick = handleOverlayClick;
      document.addEventListener("keydown", handleEscape);
      
      modal._cleanup = () => {
        modalOk.onclick = null;
        modalCancel.onclick = null;
        modalOverlay.onclick = null;
        document.removeEventListener("keydown", handleEscape);
      };
    });
  }
  
  function closeModal() {
    modalOverlay.classList.add("hidden");
    modal.classList.remove("modal-help");
    if (modal._cleanup) {
      modal._cleanup();
      modal._cleanup = null;
    }
  }

  function initTheme() {
    const saved = localStorage.getItem("docly-theme-v2") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    themeToggle.textContent = saved === "dark" ? "☾" : "☀";
  }
  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("docly-theme-v2", next);
    themeToggle.textContent = next === "dark" ? "☾" : "☀";
  });

  helpBtn.addEventListener("click", showHelpDialog);
  el("modalClose").addEventListener("click", () => modalCancel.click());

  async function loadDocuments() {
    const data = await api("/api/documents");
    state.documents = data.documents || [];
    renderList();
  }

  async function runSearch(query) {
    if (!query) {
      await loadDocuments();
      return;
    }
    const data = await api("/api/search?q=" + encodeURIComponent(query));
    state.documents = data.documents || [];
    renderList();
  }

  function filteredDocuments() {
    let docs = state.documents.slice();
    switch (state.filter) {
      case "recent":
        docs = docs.slice(0, 15);
        break;
      case "favorites":
        docs = docs.filter((d) => d.favorite);
        break;
      default:
        break;
    }
    return docs;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
  }

  function renderList() {
    const docs = filteredDocuments();
    docList.innerHTML = "";
    docCount.textContent = `${state.documents.length} document${state.documents.length === 1 ? "" : "s"}`;

    if (docs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "doc-list-empty";
      empty.textContent = state.query
        ? "No results for your search."
        : "No documents in this section.";
      docList.appendChild(empty);
      return;
    }

    for (const doc of docs) {
      const item = document.createElement("div");
      item.className = "doc-item" + (doc.id === state.currentId ? " active" : "");
      item.dataset.id = doc.id;
      item.title = doc.title || "Untitled";

      const title = document.createElement("span");
      title.className = "doc-item-title";
      title.textContent = doc.title || "Untitled";

      const date = document.createElement("span");
      date.className = "doc-item-date";
      date.textContent = fmtDate(doc.updatedAt);

      const actions = document.createElement("div");
      actions.className = "doc-item-actions";

      const starBtn = document.createElement("button");
      starBtn.className = "row-icon-btn star" + (doc.favorite ? " active" : "");
      starBtn.title = doc.favorite ? "Remove from favorites" : "Add to favorites";
      starBtn.textContent = doc.favorite ? "★" : "☆";
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(doc.id);
      });

      const trashBtn = document.createElement("button");
      trashBtn.className = "row-icon-btn trash";
      trashBtn.title = "Delete (move to trash)";
      trashBtn.textContent = "✕";
      trashBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteDocument(doc.id, doc.title);
      });

      actions.appendChild(starBtn);
      actions.appendChild(trashBtn);

      item.appendChild(title);
      item.appendChild(date);
      item.appendChild(actions);

      item.addEventListener("click", () => openDocument(doc.id));
      docList.appendChild(item);
    }
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function openDocument(id) {
    if (state.dirty) await doSave(true);

    const doc = await api("/api/documents/" + encodeURIComponent(id));
    state.currentId = doc.id;
    state.currentDoc = doc;
    state.dirty = false;

    emptyState.classList.add("hidden");
    editorWrap.classList.remove("hidden");

    titleInput.value = doc.title || "";
    fitTitle();
    favBtn.classList.toggle("active", !!doc.favorite);
    setSaveStatus("saved");

    renderTags();

    richEditor.innerHTML = doc.content || "";
    richEditor.setAttribute("data-placeholder", "Start writing…");

    renderList();
  }

  function closeEditor() {
    state.currentId = null;
    state.currentDoc = null;
    editorWrap.classList.add("hidden");
    emptyState.classList.remove("hidden");
  }


  function renderTags() {
    tagsList.innerHTML = "";
    const tags = (state.currentDoc && state.currentDoc.tags) || [];
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `<span>${escapeHtml(tag)}</span>`;
      const rm = document.createElement("button");
      rm.textContent = "✕";
      rm.addEventListener("click", () => {
        state.currentDoc.tags = state.currentDoc.tags.filter((t) => t !== tag);
        renderTags();
        scheduleSave();
      });
      chip.appendChild(rm);
      tagsList.appendChild(chip);
    }
  }

  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = tagInput.value.trim();
      if (val && state.currentDoc) {
        state.currentDoc.tags = state.currentDoc.tags || [];
        if (!state.currentDoc.tags.includes(val)) {
          state.currentDoc.tags.push(val);
          renderTags();
          scheduleSave();
        }
      }
      tagInput.value = "";
    }
  });

  function setSaveStatus(status) {
    if (status === "saving") {
      saveStatus.textContent = "Saving…";
      saveStatus.className = "save-status saving";
    } else {
      saveStatus.textContent = "Saved";
      saveStatus.className = "save-status saved";
    }
  }

  function scheduleSave() {
    if (!state.currentDoc) return;
    state.dirty = true;
    setSaveStatus("saving");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => doSave(false), 700);
  }

  async function doSave(immediate) {
    if (!state.currentDoc || !state.currentId) return;
    clearTimeout(state.saveTimer);
    const doc = state.currentDoc;
    doc.content = richEditor.innerHTML;
    try {
      const updated = await api("/api/documents/" + encodeURIComponent(state.currentId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: doc.content, tags: doc.tags || [] }),
      });
      state.dirty = false;
      setSaveStatus("saved");
      const idx = state.documents.findIndex((d) => d.id === updated.id);
      const preview = stripHtml(doc.content).slice(0, 160);
      const patch = {
        id: updated.id, title: updated.title, type: updated.type,
        favorite: updated.favorite, archived: updated.archived, tags: updated.tags,
        preview, createdAt: updated.createdAt, updatedAt: updated.updatedAt,
      };
      if (idx >= 0) state.documents[idx] = patch; else state.documents.unshift(patch);
      renderList();
    } catch (err) {
      setSaveStatus("saving");
      showToast("Save error: " + err.message);
    }
  }

  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return (tmp.textContent || "").replace(/\s+/g, " ").trim();
  }

  richEditor.addEventListener("input", scheduleSave);

  document.addEventListener("keydown", async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      doSave(true);
      showToast("Document saved");
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      newDocBtn.click();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      searchInput.focus();
      showToast("Search document to open");
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      if (state.currentDoc) {
        window.print();
      } else {
        showToast("Open a document to print");
      }
    }

    if (e.key === "F1") {
      e.preventDefault();
      showHelpDialog();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchInput.focus();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
      e.preventDefault();
      if (state.currentDoc) {
        showFindReplaceDialog();
      } else {
        showToast("Open a document for find and replace");
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      if (state.currentDoc) {
        focusRich();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
      if (state.currentDoc) {
        focusRich();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
      if (state.currentDoc) {
        focusRich();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("justifyLeft");
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("justifyCenter");
        scheduleSave();
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("justifyRight");
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("justifyFull");
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("indent");
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("outdent");
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "1") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        applyLineSpacing("1.0");
        scheduleSave();
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === "2") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        applyLineSpacing("2.0");
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "5") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        applyLineSpacing("1.5");
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "]" || (e.shiftKey && (e.key === ">" || e.key === ".")))) {
      e.preventDefault();
      if (state.currentDoc) stepFontSize(1);
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "[" || (e.shiftKey && (e.key === "<" || e.key === ",")))) {
      e.preventDefault();
      if (state.currentDoc) stepFontSize(-1);
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (state.currentDoc) {
        showFontDialog();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("insertUnorderedList");
        scheduleSave();
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
      e.preventDefault();
      if (state.currentDoc) {
        const position = await showModal("Go to position", "Enter character position:", "0", true);
        if (position !== null && position !== "") {
          const pos = parseInt(position, 10);
          if (!isNaN(pos)) {
            const range = document.createRange();
            const selection = window.getSelection();

            try {
              range.setStart(richEditor, 0);
              range.setEnd(richEditor, 0);

              let charCount = 0;
              let found = false;

              function traverseNodes(node) {
                if (found) return;

                if (node.nodeType === Node.TEXT_NODE) {
                  if (charCount + node.length >= pos) {
                    range.setStart(node, pos - charCount);
                    range.setEnd(node, pos - charCount);
                    found = true;
                  } else {
                    charCount += node.length;
                  }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                  for (let child of node.childNodes) {
                    traverseNodes(child);
                    if (found) return;
                  }
                }
              }

              traverseNodes(richEditor);

              if (found) {
                selection.removeAllRanges();
                selection.addRange(range);
                richEditor.focus();
              } else {
                showToast("Position not found");
              }
            } catch (err) {
              showToast("Navigation error");
            }
          }
        }
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === "Home") {
      e.preventDefault();
      if (state.currentDoc) {
        richEditor.focus();
        const range = document.createRange();
        range.selectNodeContents(richEditor);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "End") {
      e.preventDefault();
      if (state.currentDoc) {
        richEditor.focus();
        const range = document.createRange();
        range.selectNodeContents(richEditor);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === " ") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("removeFormat");
        scheduleSave();
      }
    }
  });

  let lastSavedTitle = "";
  titleInput.addEventListener("input", fitTitle);
  titleInput.addEventListener("focus", () => { lastSavedTitle = titleInput.value; });
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); titleInput.blur(); }
  });
  titleInput.addEventListener("blur", async () => {
    if (!state.currentId) return;
    const newTitle = titleInput.value.trim() || "Untitled";
    if (newTitle === lastSavedTitle) return;
    try {
      const updated = await api("/api/documents/" + encodeURIComponent(state.currentId) + "/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      state.currentDoc.title = updated.title;
      titleInput.value = updated.title;
      fitTitle();
      lastSavedTitle = updated.title;
      const idx = state.documents.findIndex((d) => d.id === updated.id);
      if (idx >= 0) { state.documents[idx].title = updated.title; state.documents[idx].updatedAt = updated.updatedAt; }
      renderList();
    } catch (err) {
      showToast("Rename error: " + err.message);
      titleInput.value = lastSavedTitle;
      fitTitle();
    }
  });

  async function toggleFavorite(id) {
    try {
      const updated = await api("/api/documents/" + encodeURIComponent(id) + "/favorite", { method: "PUT" });
      const idx = state.documents.findIndex((d) => d.id === updated.id);
      if (idx >= 0) state.documents[idx].favorite = updated.favorite;
      if (state.currentId === id) {
        state.currentDoc.favorite = updated.favorite;
        favBtn.classList.toggle("active", !!updated.favorite);
      }
      renderList();
    } catch (err) {
      showToast("Favorites error: " + err.message);
    }
  }

  async function deleteDocument(id, title) {
    const confirmed = await showModal("Delete document", `Delete "${title || "this document"}"? It will be moved to the computer's trash.`, "", false);
    if (!confirmed) return;
    try {
      await api("/api/documents/" + encodeURIComponent(id), { method: "DELETE" });
      state.documents = state.documents.filter((d) => d.id !== id);
      if (state.currentId === id) closeEditor();
      renderList();
      showToast("Document moved to trash");
    } catch (err) {
      showToast("Delete error: " + err.message);
    }
  }

  favBtn.addEventListener("click", () => {
    if (state.currentId) toggleFavorite(state.currentId);
  });

  deleteBtn.addEventListener("click", () => {
    if (!state.currentId) return;
    deleteDocument(state.currentId, state.currentDoc && state.currentDoc.title);
  });

  newDocBtn.addEventListener("click", async () => {
    const defaultName = "New document";
    const title = await showModal("New document", "Document name:", defaultName, true);
    if (title === null || title === "") return;
    try {
      const doc = await api("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || defaultName, type: "note" }),
      });
      await loadDocuments();
      await openDocument(doc.id);
    } catch (err) {
      showToast("Document creation error: " + err.message);
    }
  });
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.dataset.filter;
      renderList();
    });
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value.trim();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => runSearch(state.query), 250);
  });

  function focusRich() { richEditor.focus(); }

  /* ---------------- Selection helpers ---------------- */
  let savedRange = null;

  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    return richEditor.contains(r.commonAncestorContainer) ? r : null;
  }

  // Remember the last selection made inside the editor, so that popups and
  // inputs (which steal the selection) can hand it back.
  document.addEventListener("selectionchange", () => {
    const r = selectionInEditor();
    if (r) {
      savedRange = r.cloneRange();
      syncToolbar();
    }
  });

  function restoreSelection() {
    if (savedRange && !selectionInEditor()) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    richEditor.focus({ preventScroll: true });
  }

  function activeElement() {
    const r = selectionInEditor() || savedRange;
    if (!r) return null;
    let n = r.startContainer;
    if (n.nodeType === Node.ELEMENT_NODE && !r.collapsed && n.childNodes[r.startOffset]) {
      n = n.childNodes[r.startOffset];
    }
    return n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
  }

  // Keep the editor focused (and its selection intact) when clicking toolbar buttons
  toolbar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });

  /* ---------------- Font size (points, like Google Docs) ---------------- */
  const SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];
  const MIN_PT = 1;
  const MAX_PT = 400;
  const sizeMenu = el("sizeMenu");

  const fmtPt = (pt) => String(Math.round(pt * 2) / 2);

  function currentFontSizePt() {
    let n = activeElement();
    while (n && n !== richEditor) {
      const fs = n.style && n.style.fontSize;
      if (fs) {
        const v = parseFloat(fs);
        if (!isNaN(v)) return fs.endsWith("px") ? v * 0.75 : v;
      }
      n = n.parentElement;
    }
    const el0 = activeElement() || richEditor;
    const px = parseFloat(window.getComputedStyle(el0).fontSize);
    return isNaN(px) ? 14 : px * 0.75;
  }

  function applyFontSize(pt) {
    if (isNaN(pt)) return;
    pt = Math.min(MAX_PT, Math.max(MIN_PT, Math.round(pt * 2) / 2));
    restoreSelection();
    const sel = window.getSelection();
    if (!selectionInEditor()) return;
    const range = sel.getRangeAt(0);

    if (range.collapsed) {
      // no text selected: the next characters typed get the new size
      const span = document.createElement("span");
      span.style.fontSize = pt + "pt";
      span.textContent = "\u200B";
      range.insertNode(span);
      const r = document.createRange();
      r.setStart(span.firstChild, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      document.execCommand("styleWithCSS", false, false);
      document.execCommand("fontSize", false, "7");
      let first = null;
      let last = null;
      richEditor.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement("span");
        span.style.fontSize = pt + "pt";
        while (f.firstChild) span.appendChild(f.firstChild);
        span.querySelectorAll("[style]").forEach((c) => c.style.removeProperty("font-size"));
        f.replaceWith(span);
        if (!first) first = span;
        last = span;
      });
      if (first) {
        const r = document.createRange();
        r.setStartBefore(first);
        r.setEndAfter(last);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    fontSizeInput.value = fmtPt(pt);
    scheduleSave();
  }

  function stepFontSize(dir) {
    const cur = currentFontSizePt();
    let next;
    if (dir > 0) {
      next = SIZE_PRESETS.find((s) => s > cur + 0.01);
      if (next === undefined) next = cur + 10;
    } else {
      next = [...SIZE_PRESETS].reverse().find((s) => s < cur - 0.01);
      if (next === undefined) next = cur - 1;
    }
    applyFontSize(next);
  }

  function closeSizeMenu() { sizeMenu.classList.add("hidden"); }
  function openSizeMenu() {
    closeMenu();
    closeColorPanel();
    const cur = Math.round(currentFontSizePt() * 2) / 2;
    sizeMenu.innerHTML = "";
    SIZE_PRESETS.forEach((s) => {
      const b = document.createElement("button");
      b.className = "size-item" + (s === cur ? " current" : "");
      b.textContent = s;
      b.addEventListener("click", () => {
        closeSizeMenu();
        applyFontSize(s);
      });
      sizeMenu.appendChild(b);
    });
    const r = fontSizeInput.getBoundingClientRect();
    sizeMenu.style.left = r.left + "px";
    sizeMenu.style.top = r.bottom + 4 + "px";
    sizeMenu.classList.remove("hidden");
    const curBtn = sizeMenu.querySelector(".current");
    if (curBtn) curBtn.scrollIntoView({ block: "nearest" });
  }

  sizeMenu.addEventListener("mousedown", (e) => e.preventDefault());
  fontSizeInput.addEventListener("focus", () => { fontSizeInput.select(); openSizeMenu(); });
  fontSizeInput.addEventListener("mousedown", () => {
    if (document.activeElement === fontSizeInput && sizeMenu.classList.contains("hidden")) openSizeMenu();
  });
  fontSizeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = parseFloat(fontSizeInput.value.replace(",", "."));
      closeSizeMenu();
      if (!isNaN(v)) applyFontSize(v); else restoreSelection();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSizeMenu();
      restoreSelection();
      fontSizeInput.value = fmtPt(currentFontSizePt());
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      stepFontSize(e.key === "ArrowUp" ? 1 : -1);
      fontSizeInput.focus();
    }
  });
  fontSizeInput.addEventListener("blur", () => {
    closeSizeMenu();
    fontSizeInput.value = fmtPt(currentFontSizePt());
  });

  el("fontSizeUp").addEventListener("click", () => stepFontSize(1));
  el("fontSizeDown").addEventListener("click", () => stepFontSize(-1));

  /* ---------------- Color palettes ---------------- */
  const PALETTE = [
    ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"],
    ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"],
    ["#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc"],
    ["#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
    ["#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"],
    ["#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79"],
    ["#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"],
    ["#5b0f00", "#660000", "#783f04", "#7f6000", "#274e13", "#0c343d", "#1c4587", "#073763", "#20124d", "#4c1130"],
  ];
  const colorPanel = el("colorPanel");
  const cpNative = el("cpNative");
  let colorMode = null; // "text" | "highlight"
  let lastHighlight = "#ffff00";
  let recentColors = [];
  try { recentColors = JSON.parse(localStorage.getItem("docly-recent-colors") || "[]"); } catch (_) { recentColors = []; }

  function colorBtn(mode) { return el(mode === "text" ? "textColorBtn" : "highlightBtn"); }

  function closeColorPanel() {
    colorPanel.classList.add("hidden");
    el("textColorBtn").classList.remove("open");
    el("highlightBtn").classList.remove("open");
    colorMode = null;
  }

  function applyColor(mode, color) {
    restoreSelection();
    document.execCommand("styleWithCSS", false, true);
    if (mode === "text") {
      document.execCommand("foreColor", false, color === null ? "inherit" : color);
    } else {
      document.execCommand("hiliteColor", false, color === null ? "transparent" : color);
      if (color) lastHighlight = color;
    }
    document.execCommand("styleWithCSS", false, false);
    if (color && !PALETTE.some((row) => row.includes(color))) {
      recentColors = [color, ...recentColors.filter((c) => c !== color)].slice(0, 10);
      try { localStorage.setItem("docly-recent-colors", JSON.stringify(recentColors)); } catch (_) {}
    }
    closeColorPanel();
    syncToolbar();
    scheduleSave();
  }

  function swatch(color, mode) {
    const b = document.createElement("button");
    b.className = "cp-swatch";
    b.style.background = color;
    b.title = color;
    b.addEventListener("click", () => applyColor(mode, color));
    return b;
  }

  function openColorPanel(mode) {
    if (colorMode === mode) { closeColorPanel(); return; }
    closeMenu();
    closeSizeMenu();
    closeColorPanel();
    colorMode = mode;
    colorPanel.innerHTML = "";

    const reset = document.createElement("button");
    reset.className = "cp-reset";
    reset.innerHTML = '<span class="cp-none"></span><span></span>';
    reset.lastChild.textContent = mode === "text" ? "Reset" : "None";
    reset.addEventListener("click", () => applyColor(mode, null));
    colorPanel.appendChild(reset);

    const grid = document.createElement("div");
    grid.className = "cp-grid";
    PALETTE.forEach((row) => row.forEach((c) => grid.appendChild(swatch(c, mode))));
    colorPanel.appendChild(grid);

    const custom = document.createElement("div");
    custom.className = "cp-custom";
    const lbl = document.createElement("div");
    lbl.className = "cp-label";
    lbl.textContent = "Custom";
    custom.appendChild(lbl);
    const row = document.createElement("div");
    row.className = "cp-recent";
    const plus = document.createElement("button");
    plus.className = "cp-swatch cp-plus";
    plus.title = "Custom color";
    plus.textContent = "+";
    plus.addEventListener("click", () => {
      cpNative.value = "#4a86e8";
      cpNative.onchange = () => applyColor(mode, cpNative.value);
      cpNative.click();
    });
    row.appendChild(plus);
    recentColors.forEach((c) => row.appendChild(swatch(c, mode)));
    custom.appendChild(row);
    colorPanel.appendChild(custom);

    const btn = colorBtn(mode);
    btn.classList.add("open");
    const r = btn.getBoundingClientRect();
    colorPanel.classList.remove("hidden");
    const w = colorPanel.offsetWidth;
    colorPanel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    colorPanel.style.top = r.bottom + 4 + "px";
  }

  colorPanel.addEventListener("mousedown", (e) => e.preventDefault());
  el("textColorBtn").addEventListener("click", () => openColorPanel("text"));
  el("highlightBtn").addEventListener("click", () => openColorPanel("highlight"));

  document.addEventListener("mousedown", (e) => {
    if (!colorPanel.contains(e.target) && !e.target.closest("#textColorBtn, #highlightBtn")) closeColorPanel();
    if (e.target !== fontSizeInput && !sizeMenu.contains(e.target)) closeSizeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeColorPanel(); closeSizeMenu(); }
  });
  window.addEventListener("blur", () => { closeColorPanel(); closeSizeMenu(); });

  function updateColorBars() {
    const textBar = document.querySelector("#textColorBtn .bar-text");
    const hiBar = document.querySelector("#highlightBtn .bar-hi");
    if (hiBar) hiBar.style.fill = lastHighlight;
    const n = activeElement();
    if (!n || !textBar) return;
    const base = window.getComputedStyle(richEditor).color;
    const cur = window.getComputedStyle(n).color;
    textBar.style.fill = cur === base ? "" : cur;
  }

  /* ---------------- Toolbar state (active buttons) ---------------- */
  function syncToolbar() {
    if (!state.currentDoc || !selectionInEditor()) return;
    document.querySelectorAll(".tb-btn[data-cmd]").forEach((b) => {
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch (_) {}
      b.classList.toggle("active", !!on);
    });
    const n = activeElement();
    el("linkBtn").classList.toggle("active", !!(n && n.closest && n.closest("a")));
    el("codeBtn").classList.toggle("active", !!(n && n.closest && n.closest("pre")));

    const blk = (document.queryCommandValue("formatBlock") || "").toUpperCase().replace(/[<>]/g, "");
    blockSelect.value = ["H1", "H2", "H3", "BLOCKQUOTE"].includes(blk) ? blk : "P";
    syncFontFamily();
    if (document.activeElement !== fontSizeInput) fontSizeInput.value = fmtPt(currentFontSizePt());
    updateColorBars();
    updateRulerMarkers();
  }
  richEditor.addEventListener("keyup", syncToolbar);
  richEditor.addEventListener("mouseup", syncToolbar);

  const toolbarCmdButtons = document.querySelectorAll(".tb-btn[data-cmd]");
  toolbarCmdButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      focusRich();
      document.execCommand(btn.dataset.cmd, false, null);
      syncToolbar();
      scheduleSave();
    });
  });

  blockSelect.addEventListener("change", () => {
    focusRich();
    document.execCommand("formatBlock", false, blockSelect.value);
    syncToolbar();
    scheduleSave();
  });

  el("undoBtn").addEventListener("click", () => { focusRich(); document.execCommand("undo"); scheduleSave(); });
  el("redoBtn").addEventListener("click", () => { focusRich(); document.execCommand("redo"); scheduleSave(); });

  caseBtn.addEventListener("click", () => {
    focusRich();
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const text = range.toString();

      if (!text) return;

      const caseType = caseBtn.dataset.caseType || "lower";
      let newText;

      switch (caseType) {
        case "lower":
          newText = text.toLowerCase();
          caseBtn.dataset.caseType = "upper";
          break;
        case "upper":
          newText = text.toUpperCase();
          caseBtn.dataset.caseType = "title";
          break;
        case "title":
          newText = text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
          caseBtn.dataset.caseType = "lower";
          break;
        default:
          newText = text.toLowerCase();
          caseBtn.dataset.caseType = "upper";
      }

      document.execCommand("insertText", false, newText);
      scheduleSave();
    }
  });

  function doExportTxt() {
    if (!state.currentDoc) {
      showToast("No document open");
      return;
    }

    const textContent = stripHtml(richEditor.innerHTML);
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.currentDoc.title || "document"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported as TXT");
  }

  function doExportHtml() {
    if (!state.currentDoc) {
      showToast("No document open");
      return;
    }

    const content = richEditor.innerHTML;
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${state.currentDoc.title || "Document"}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
        h1, h2, h3 { color: #333; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
        blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 10px; color: #666; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #ddd; padding: 8px; }
        th { background: #f4f4f4; }
    </style>
</head>
<body>
    <h1>${state.currentDoc.title || "Document"}</h1>
    ${content}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.currentDoc.title || "document"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported as HTML");
  }

  el("linkBtn").addEventListener("click", async () => {
    const url = await showModal("Insert link", "Enter link URL:", "https://", true);
    if (!url) return;
    focusRich();
    document.execCommand("createLink", false, url);
    scheduleSave();
  });

  el("codeBtn").addEventListener("click", () => {
    focusRich();
    const sel = window.getSelection();
    const text = sel && sel.toString() ? sel.toString() : "code";
    const html = `<pre><code>${escapeHtml(text)}</code></pre><p><br></p>`;
    document.execCommand("insertHTML", false, html);
    scheduleSave();
  });

  el("tableBtn").addEventListener("click", async () => {
    focusRich();
    const rowsStr = await showModal("Table rows", "Number of rows:", "3", true);
    const colsStr = await showModal("Table columns", "Number of columns:", "3", true);
    let rows = parseInt(rowsStr, 10) || 3;
    let cols = parseInt(colsStr, 10) || 3;
    rows = Math.min(Math.max(rows, 1), 20);
    cols = Math.min(Math.max(cols, 1), 10);
    let html = "<table><tbody>";
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) html += "<td>&nbsp;</td>";
      html += "</tr>";
    }
    html += "</tbody></table><p><br></p>";
    document.execCommand("insertHTML", false, html);
    scheduleSave();
  });

  el("imageBtn").addEventListener("click", () => {
    if (!state.currentId) return;
    imageInput.click();
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    imageInput.value = "";
    if (!file || !state.currentId) return;
    const formData = new FormData();
    formData.append("file", file, file.name);
    try {
      showToast("Uploading image…");
      const res = await fetch("/api/documents/" + encodeURIComponent(state.currentId) + "/assets", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload error");
      focusRich();
      document.execCommand("insertHTML", false, `<img src="${data.url}" alt="image"><p><br></p>`);
      scheduleSave();
    } catch (err) {
      showToast("Image upload error: " + err.message);
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  async function showFindReplaceDialog() {
    const findTerm = await showModal("Find", "Find text:", "", true);
    if (!findTerm) return;

    const replaceTerm = await showModal("Replace", "Replace with:", "", true);
    if (replaceTerm === null) return;

    const re = new RegExp(findTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const walker = document.createTreeWalker(richEditor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let count = 0;
    for (const node of nodes) {
      const next = node.nodeValue.replace(re, () => { count++; return replaceTerm; });
      if (next !== node.nodeValue) node.nodeValue = next;
    }

    if (count > 0) {
      scheduleSave();
      showToast(count + (count === 1 ? " replacement made" : " replacements made"));
    } else {
      showToast("No matches found");
    }
  }

  const BLOCK_RE = /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE|PRE)$/;
  function blockOf(n) {
    while (n && n !== richEditor) {
      if (n.nodeType === 1 && BLOCK_RE.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  }

  // Block elements touched by the current selection (wraps bare text in <p> if needed)
  function selectedBlocks() {
    restoreSelection();
    if (!selectionInEditor()) return [];
    const sel = window.getSelection();
    let range = sel.getRangeAt(0);
    if (!blockOf(range.startContainer)) {
      document.execCommand("formatBlock", false, "P");
      if (sel.rangeCount === 0) return [];
      range = sel.getRangeAt(0);
    }
    const blocks = new Set();
    const first = blockOf(range.startContainer);
    const last = blockOf(range.endContainer);
    if (first) blocks.add(first);
    if (last) blocks.add(last);
    const walker = document.createTreeWalker(richEditor, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (BLOCK_RE.test(n.tagName) && range.intersectsNode(n)) blocks.add(n);
    }
    return Array.from(blocks);
  }

  function applyLineSpacing(value) {
    if (!state.currentDoc) return;
    focusRich();
    selectedBlocks().forEach((b) => { b.style.lineHeight = value; });
    scheduleSave();
  }

  el("lineSpacingSelect").addEventListener("change", (e) => {
    if (e.target.value) applyLineSpacing(e.target.value);
    e.target.selectedIndex = 0;
  });

  el("printBtn").addEventListener("click", () => {
    if (state.currentDoc) window.print();
  });

  el("clearFormatBtn").addEventListener("click", () => {
    focusRich();
    document.execCommand("removeFormat");
    scheduleSave();
  });

  el("findBtn").addEventListener("click", () => {
    if (state.currentDoc) showFindReplaceDialog();
  });

  el("hrBtn").addEventListener("click", () => {
    focusRich();
    document.execCommand("insertHorizontalRule");
    scheduleSave();
  });

  el("unlinkBtn").addEventListener("click", () => {
    focusRich();
    document.execCommand("unlink");
    scheduleSave();
  });

  const fontFamilySelect = el("fontFamilySelect");
  fontFamilySelect.addEventListener("change", () => {
    focusRich();
    document.execCommand("fontName", false, fontFamilySelect.value);
    scheduleSave();
  });
  function syncFontFamily() {
    if (!state.currentDoc) return;
    const cur = (document.queryCommandValue("fontName") || "").replace(/["']/g, "").split(",")[0].trim().toLowerCase();
    const match = Array.from(fontFamilySelect.options).find((o) => o.value.toLowerCase() === cur);
    fontFamilySelect.value = match ? match.value : "Arial";
  }
  richEditor.addEventListener("keyup", syncFontFamily);
  richEditor.addEventListener("mouseup", syncFontFamily);

  const zoomSelect = el("zoomSelect");
  zoomSelect.addEventListener("change", () => {
    pageArea.style.zoom = zoomSelect.value;
  });

  function showHelpDialog() {
    const helpText = `FILE
Ctrl+N        New document
Ctrl+O        Search documents
Ctrl+S        Save
Ctrl+P        Print / save as PDF
F1            Help

TEXT
Ctrl+B / I / U   Bold / italic / underline
Ctrl+D        Font name
Ctrl+Shift+.  Increase font size
Ctrl+Shift+,  Decrease font size
Ctrl+Space    Clear formatting
Ctrl+Z / Y    Undo / redo

PARAGRAPH
Ctrl+L / E / R / J   Left / center / right / justify
Ctrl+M        Increase indent
Ctrl+Shift+M  Decrease indent
Ctrl+1 / 5 / 2   Line spacing 1.0 / 1.5 / 2.0
Ctrl+Shift+L  Bulleted list

FIND AND NAVIGATE
Ctrl+F        Search documents
Ctrl+H        Find and replace
Ctrl+G        Go to position
Ctrl+Home     Start of document
Ctrl+End      End of document`;
    showModal("Keyboard shortcuts", helpText, "", false);
    modal.classList.add("modal-help");
  }

  async function showFontDialog() {
    const fontName = await showModal("Font", "Font name (e.g. Arial, Calibri, Times New Roman):", "Arial", true);
    if (fontName && fontName !== "") {
      focusRich();
      document.execCommand("fontName", false, fontName);
      scheduleSave();
    }
  }
  let clickCount = 0;
  let clickTimer = null;


  richEditor.addEventListener("click", (e) => {
    clickCount++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      if (clickCount >= 3) {
        const selection = window.getSelection();
        const node = selection.anchorNode;
        if (node) {
          const paragraph = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
          if (paragraph) {
            const range = document.createRange();
            range.selectNodeContents(paragraph);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
      clickCount = 0;
    }, 300);
  });



  /* ---------------- Rulers (like Google Docs) ---------------- */
  const CM = 96 / 2.54;
  const hTrack = el("hTrack");
  const hBody = el("hBody");
  const hScale = el("hScale");
  const vRuler = el("vRuler");
  const vBody = el("vBody");
  const vScale = el("vScale");
  const hmL = el("hmL");
  const hmR = el("hmR");
  const vmT = el("vmT");
  const vmB = el("vmB");
  const mFirst = el("rmFirst");
  const mLeft = el("rmLeft");
  const mRight = el("rmRight");

  function rulerMetrics() {
    const cs = window.getComputedStyle(richEditor);
    return {
      W: richEditor.offsetWidth,
      H: richEditor.offsetHeight,
      bl: richEditor.clientLeft,
      bt: richEditor.clientTop,
      l: parseFloat(cs.paddingLeft) || 0,
      r: parseFloat(cs.paddingRight) || 0,
      t: parseFloat(cs.paddingTop) || 0,
      b: parseFloat(cs.paddingBottom) || 0,
    };
  }

  // Tick marks every 0.25 cm: small, half-cm medium, whole cm = number
  function buildScale(len, origin, bodyEnd, horizontal) {
    const q = CM / 4;
    const thick = horizontal ? 18 : 18;
    let out = "";
    const start = -Math.floor(origin / q);
    const end = Math.floor((len - origin) / q);
    for (let i = start; i <= end; i++) {
      const pos = origin + i * q;
      if (pos < 0 || pos > len) continue;
      const mod = ((i % 4) + 4) % 4;
      if (mod === 0) {
        const n = i / 4;
        if (n > 0 && pos < bodyEnd - 4) {
          out += horizontal
            ? `<text x="${pos.toFixed(1)}" y="12" text-anchor="middle">${n}</text>`
            : `<text x="${thick / 2}" y="${(pos + 3).toFixed(1)}" text-anchor="middle">${n}</text>`;
        }
      } else {
        const size = mod === 2 ? 6 : 3;
        const a = (thick - size) / 2;
        const b = (thick + size) / 2;
        out += horizontal
          ? `<line x1="${pos.toFixed(1)}" x2="${pos.toFixed(1)}" y1="${a}" y2="${b}"/>`
          : `<line y1="${pos.toFixed(1)}" y2="${pos.toFixed(1)}" x1="${a}" x2="${b}"/>`;
      }
    }
    return out;
  }

  function renderRulers() {
    if (!state.currentDoc || pageArea.classList.contains("no-ruler")) return;
    const m = rulerMetrics();
    if (!m.W) return;

    const x0 = m.bl + m.l;
    const x1 = m.W - m.bl - m.r;
    hBody.style.left = x0 + "px";
    hBody.style.width = Math.max(0, x1 - x0) + "px";
    hScale.innerHTML = `<svg width="${m.W}" height="18">${buildScale(m.W, x0, x1, true)}</svg>`;
    hmL.style.left = x0 - 4 + "px";
    hmR.style.left = x1 - 4 + "px";

    const y0 = m.bt + m.t;
    const y1 = m.H - m.bt - m.b;
    vBody.style.top = y0 + "px";
    vBody.style.height = Math.max(0, y1 - y0) + "px";
    vScale.innerHTML = `<svg width="18" height="${m.H}">${buildScale(m.H, y0, y1, false)}</svg>`;
    vmT.style.top = y0 - 4 + "px";
    vmB.style.top = y1 - 4 + "px";

    updateRulerMarkers();
  }

  function firstSelectedBlock() {
    const r = selectionInEditor() || savedRange;
    return r ? blockOf(r.startContainer) : null;
  }

  function updateRulerMarkers() {
    if (!state.currentDoc || pageArea.classList.contains("no-ruler")) return;
    const m = rulerMetrics();
    const x0 = m.bl + m.l;
    const blk = firstSelectedBlock();
    const cs = blk ? window.getComputedStyle(blk) : null;
    const ml = cs ? parseFloat(cs.marginLeft) || 0 : 0;
    const ti = cs ? parseFloat(cs.textIndent) || 0 : 0;
    const mr = cs ? parseFloat(cs.marginRight) || 0 : 0;
    mLeft.style.left = x0 + ml - 5 + "px";
    mFirst.style.left = x0 + ml + ti - 5 + "px";
    mRight.style.left = m.W - m.bl - m.r - mr - 5 + "px";
  }

  const snap = (v) => Math.round(v / 6) * 6; // 1/16 inch
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function saveMargins() {
    const s = richEditor.style;
    try {
      localStorage.setItem("docly-margins", JSON.stringify({ l: s.paddingLeft, r: s.paddingRight, t: s.paddingTop, b: s.paddingBottom }));
    } catch (_) {}
  }
  (function loadMargins() {
    try {
      const o = JSON.parse(localStorage.getItem("docly-margins") || "{}");
      if (o.l) richEditor.style.paddingLeft = o.l;
      if (o.r) richEditor.style.paddingRight = o.r;
      if (o.t) richEditor.style.paddingTop = o.t;
      if (o.b) richEditor.style.paddingBottom = o.b;
    } catch (_) {}
  })();

  function startRulerDrag(kind, e) {
    e.preventDefault();
    e.stopPropagation();
    const horizontal = ["first", "left", "right", "mleft", "mright"].includes(kind);
    const indentKind = ["first", "left", "right"].includes(kind);
    const blocks = indentKind ? selectedBlocks() : [];
    const m0 = rulerMetrics();
    const x0 = m0.bl + m0.l;
    const b0 = blocks[0] ? window.getComputedStyle(blocks[0]) : null;
    const ml0 = b0 ? parseFloat(b0.marginLeft) || 0 : 0;
    let changedBlocks = false;
    let changedMargins = false;

    function move(ev) {
      const rect = (horizontal ? hTrack : vRuler).getBoundingClientRect();
      const scale = (horizontal ? rect.width / m0.W : rect.height / m0.H) || 1;
      const pos = horizontal ? (ev.clientX - rect.left) / scale : (ev.clientY - rect.top) / scale;
      const bodyW = m0.W - m0.bl * 2 - m0.l - m0.r;
      if (kind === "left") {
        const ml = clamp(snap(pos - x0), 0, bodyW - 60);
        blocks.forEach((b) => { b.style.marginLeft = ml ? ml + "px" : ""; });
        changedBlocks = true;
      } else if (kind === "first") {
        const ti = Math.max(-ml0, snap(pos - x0 - ml0));
        blocks.forEach((b) => { b.style.textIndent = ti ? ti + "px" : ""; });
        changedBlocks = true;
      } else if (kind === "right") {
        const mr = clamp(snap(m0.W - m0.bl - m0.r - pos), 0, bodyW - 60);
        blocks.forEach((b) => { b.style.marginRight = mr ? mr + "px" : ""; });
        changedBlocks = true;
      } else if (kind === "mleft") {
        richEditor.style.paddingLeft = clamp(snap(pos - m0.bl), 0, m0.W - m0.bl * 2 - m0.r - 160) + "px";
        changedMargins = true;
      } else if (kind === "mright") {
        richEditor.style.paddingRight = clamp(snap(m0.W - m0.bl - pos), 0, m0.W - m0.bl * 2 - m0.l - 160) + "px";
        changedMargins = true;
      } else if (kind === "mtop") {
        richEditor.style.paddingTop = clamp(snap(pos - m0.bt), 0, 400) + "px";
        changedMargins = true;
      } else if (kind === "mbottom") {
        richEditor.style.paddingBottom = clamp(snap(m0.H - m0.bt - pos), 0, 400) + "px";
        changedMargins = true;
      }
      renderRulers();
    }
    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      if (changedMargins) saveMargins();
      if (changedBlocks) scheduleSave();
      renderRulers();
    }
    document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  [["rmFirst", "first"], ["rmLeft", "left"], ["rmRight", "right"], ["hmL", "mleft"], ["hmR", "mright"], ["vmT", "mtop"], ["vmB", "mbottom"]]
    .forEach(([id, kind]) => el(id).addEventListener("mousedown", (e) => startRulerDrag(kind, e)));
  [el("hRuler"), vRuler].forEach((r) => r.addEventListener("mousedown", (e) => e.preventDefault()));

  function toggleRuler() {
    pageArea.classList.toggle("no-ruler");
    try { localStorage.setItem("docly-ruler", pageArea.classList.contains("no-ruler") ? "0" : "1"); } catch (_) {}
    renderRulers();
  }
  try { if (localStorage.getItem("docly-ruler") === "0") pageArea.classList.add("no-ruler"); } catch (_) {}

  new ResizeObserver(renderRulers).observe(richEditor);

  /* ---------------- Sidebar toggle ---------------- */
  const sidebarPanel = document.querySelector(".sidebar");
  function toggleSidebar() {
    sidebarPanel.classList.toggle("hidden");
    try { localStorage.setItem("docly-sidebar", sidebarPanel.classList.contains("hidden") ? "0" : "1"); } catch (_) {}
  }
  try { if (localStorage.getItem("docly-sidebar") === "0") sidebarPanel.classList.add("hidden"); } catch (_) {}
  el("sidebarToggle").addEventListener("click", toggleSidebar);

  /* ---------------- Menu bar ---------------- */
  const menuBar = el("menuBar");
  const menuPanel = el("menuPanel");
  const sidebarEl = document.querySelector(".sidebar");
  const zoomSel = el("zoomSelect");

  const clickId = (id) => () => el(id).click();
  const needDoc = (fn) => () => {
    if (!state.currentDoc) { showToast("Open a document first"); return; }
    focusRich();
    fn();
  };
  const cmd = (c, v = null) => needDoc(() => { document.execCommand(c, false, v); syncToolbar(); scheduleSave(); });
  const blockFmt = (tag) => needDoc(() => {
    document.execCommand("formatBlock", false, tag);
    blockSelect.value = tag;
    syncToolbar();
    scheduleSave();
  });
  const setZoom = (v) => () => { zoomSel.value = v; pageArea.style.zoom = v; };
  const zoomItem = (v, label) => ({ label, check: () => zoomSel.value === v, run: setZoom(v) });

  function showWordCount() {
    const text = (richEditor.innerText || "").trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.replace(/\n/g, "").length;
    const noSpaces = text.replace(/\s/g, "").length;
    showModal("Word count", `Words: ${words}\nCharacters: ${chars}\nCharacters (no spaces): ${noSpaces}`, "", false);
  }

  const MENUS = {
    file: [
      { label: "New document", key: "Ctrl+N", run: () => newDocBtn.click() },
      { label: "Save", key: "Ctrl+S", run: needDoc(() => { doSave(true); showToast("Document saved"); }) },
      { label: "Add / remove favorite", run: needDoc(() => favBtn.click()) },
      "-",
      { label: "Download as text (.txt)", run: doExportTxt },
      { label: "Download as web page (.html)", run: doExportHtml },
      { label: "Print / save as PDF", key: "Ctrl+P", run: clickId("printBtn") },
      "-",
      { label: "Move to trash", run: needDoc(() => deleteBtn.click()) },
    ],
    edit: [
      { label: "Undo", key: "Ctrl+Z", run: clickId("undoBtn") },
      { label: "Redo", key: "Ctrl+Y", run: clickId("redoBtn") },
      "-",
      { label: "Cut", key: "Ctrl+X", run: cmd("cut") },
      { label: "Copy", key: "Ctrl+C", run: cmd("copy") },
      { label: "Select all", key: "Ctrl+A", run: cmd("selectAll") },
      "-",
      { label: "Find and replace", key: "Ctrl+H", run: clickId("findBtn") },
      "-",
      { label: "Clear formatting", key: "Ctrl+Space", run: clickId("clearFormatBtn") },
    ],
    view: [
      { label: "Zoom", sub: [
        zoomItem("0.5", "50%"), zoomItem("0.75", "75%"), zoomItem("1", "100%"),
        zoomItem("1.25", "125%"), zoomItem("1.5", "150%"), zoomItem("2", "200%"),
      ] },
      "-",
      { label: "Ruler", check: () => !pageArea.classList.contains("no-ruler"), run: toggleRuler },
      { label: "Toolbar", check: () => !toolbar.classList.contains("hidden"),
        run: () => toolbar.classList.toggle("hidden") },
      { label: "Document list", check: () => !sidebarEl.classList.contains("hidden"),
        run: toggleSidebar },
      "-",
      { label: "Light / dark theme", run: () => themeToggle.click() },
    ],
    insert: [
      { label: "Image", run: clickId("imageBtn") },
      { label: "Table", run: clickId("tableBtn") },
      { label: "Link", run: clickId("linkBtn") },
      { label: "Horizontal line", run: clickId("hrBtn") },
      { label: "Code block", run: clickId("codeBtn") },
    ],
    format: [
      { label: "Text", sub: [
        { label: "Bold", key: "Ctrl+B", run: cmd("bold") },
        { label: "Italic", key: "Ctrl+I", run: cmd("italic") },
        { label: "Underline", key: "Ctrl+U", run: cmd("underline") },
        { label: "Strikethrough", run: cmd("strikeThrough") },
        { label: "Superscript", run: cmd("superscript") },
        { label: "Subscript", run: cmd("subscript") },
      ] },
      { label: "Paragraph styles", sub: [
        { label: "Normal text", run: blockFmt("P") },
        { label: "Heading 1", run: blockFmt("H1") },
        { label: "Heading 2", run: blockFmt("H2") },
        { label: "Heading 3", run: blockFmt("H3") },
        { label: "Quote", run: blockFmt("BLOCKQUOTE") },
      ] },
      { label: "Alignment", sub: [
        { label: "Left", key: "Ctrl+L", run: cmd("justifyLeft") },
        { label: "Center", key: "Ctrl+E", run: cmd("justifyCenter") },
        { label: "Right", key: "Ctrl+R", run: cmd("justifyRight") },
        { label: "Justified", key: "Ctrl+J", run: cmd("justifyFull") },
      ] },
      { label: "Lists and indents", sub: [
        { label: "Bulleted list", key: "Ctrl+Shift+L", run: cmd("insertUnorderedList") },
        { label: "Numbered list", run: cmd("insertOrderedList") },
        { label: "Increase indent", key: "Ctrl+M", run: cmd("indent") },
        { label: "Decrease indent", key: "Ctrl+Shift+M", run: cmd("outdent") },
      ] },
      { label: "Line spacing", sub: [
        { label: "Single", key: "Ctrl+1", run: () => applyLineSpacing("1") },
        { label: "1.15", run: () => applyLineSpacing("1.15") },
        { label: "1.5", key: "Ctrl+5", run: () => applyLineSpacing("1.5") },
        { label: "Double", key: "Ctrl+2", run: () => applyLineSpacing("2") },
      ] },
      "-",
      { label: "Clear formatting", key: "Ctrl+Space", run: clickId("clearFormatBtn") },
    ],
    tools: [
      { label: "Word count", run: needDoc(showWordCount) },
      { label: "Change case", run: clickId("caseBtn") },
      "-",
      { label: "Text color", run: clickId("textColorBtn") },
      { label: "Highlight color", run: clickId("highlightBtn") },
    ],
    help: [
      { label: "Keyboard shortcuts", key: "F1", run: () => showHelpDialog() },
    ],
  };

  function renderMenuItems(items, container) {
    for (const item of items) {
      if (item === "-") {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        container.appendChild(sep);
        continue;
      }
      const wrap = document.createElement("div");
      wrap.className = "menu-item-wrap";
      const b = document.createElement("button");
      b.className = "menu-item";
      const chk = document.createElement("span");
      chk.className = "menu-check";
      chk.textContent = item.check && item.check() ? "✓" : "";
      const lbl = document.createElement("span");
      lbl.className = "menu-label";
      lbl.textContent = item.label;
      b.appendChild(chk);
      b.appendChild(lbl);
      if (item.sub) {
        const arrow = document.createElement("span");
        arrow.className = "menu-arrow";
        arrow.textContent = "▶";
        b.appendChild(arrow);
        const sub = document.createElement("div");
        sub.className = "menu-sub";
        renderMenuItems(item.sub, sub);
        wrap.appendChild(b);
        wrap.appendChild(sub);
      } else {
        if (item.key) {
          const k = document.createElement("span");
          k.className = "menu-key";
          k.textContent = item.key;
          b.appendChild(k);
        }
        b.addEventListener("click", () => { closeMenu(); item.run(); });
        wrap.appendChild(b);
      }
      container.appendChild(wrap);
    }
  }

  let openMenuName = null;
  let hoverOpened = null;
  function closeMenu() {
    menuPanel.classList.add("hidden");
    menuBar.querySelectorAll(".menu-btn").forEach((b) => b.classList.remove("open"));
    openMenuName = null;
    hoverOpened = null;
  }
  function openMenu(btn) {
    const name = btn.dataset.menu;
    menuPanel.innerHTML = "";
    renderMenuItems(MENUS[name], menuPanel);
    const r = btn.getBoundingClientRect();
    menuPanel.style.left = r.left + "px";
    menuPanel.style.top = r.bottom + 2 + "px";
    menuPanel.classList.remove("hidden");
    menuBar.querySelectorAll(".menu-btn").forEach((b) => b.classList.toggle("open", b === btn));
    openMenuName = name;
  }

  // keep the text selection while using menus
  menuBar.addEventListener("mousedown", (e) => e.preventDefault());
  menuPanel.addEventListener("mousedown", (e) => e.preventDefault());
  menuBar.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // a menu that was just opened by hovering stays open on click
      if (hoverOpened === btn.dataset.menu) { hoverOpened = null; return; }
      if (openMenuName === btn.dataset.menu) closeMenu(); else openMenu(btn);
    });
    btn.addEventListener("mouseenter", () => {
      if (openMenuName && openMenuName !== btn.dataset.menu) {
        openMenu(btn);
        hoverOpened = btn.dataset.menu;
      }
    });
  });
  document.addEventListener("mousedown", (e) => {
    if (!menuPanel.contains(e.target) && !menuBar.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("blur", closeMenu);

  initTheme();
  loadDocuments().catch((err) => showToast("Loading error: " + err.message));
})();
