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
  const homeView = el("homeView");
  const homeContent = el("homeContent");
  const homeSearchInput = el("homeSearchInput");
  const homeViewToggle = el("homeViewToggle");
  const appEl = el("app");
  state.homeView = "grid";
  // the home always starts in grid (blocks) view
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
    renderSidebarList();
    renderHome();
  }

  function renderSidebarList() {
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
      item.className = "doc-item" + (doc.id === state.currentId ? " active" : "") + (doc.id === state.justCreated ? " doc-item-new" : "");
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

  /* ---------------- Home (document browser) ---------------- */
  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function homeActions(doc) {
    const wrap = mk("div", "home-actions");
    const star = mk("button", "row-icon-btn star" + (doc.favorite ? " active" : ""), doc.favorite ? "★" : "☆");
    star.title = doc.favorite ? "Remove from favorites" : "Add to favorites";
    star.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(doc.id); });
    const trash = mk("button", "row-icon-btn trash", "✕");
    trash.title = "Delete (move to trash)";
    trash.addEventListener("click", (e) => { e.stopPropagation(); deleteDocument(doc.id, doc.title); });
    wrap.appendChild(star);
    wrap.appendChild(trash);
    return wrap;
  }

  function wireOpen(node, doc) {
    node.dataset.id = doc.id;
    node.tabIndex = 0;
    node.addEventListener("click", () => openDocument(doc.id));
    node.addEventListener("keydown", (e) => {
      if (e.target === node && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDocument(doc.id); }
    });
  }

  function renderHome() {
    const isList = state.homeView === "list";
    homeView.dataset.view = state.homeView;
    homeViewToggle.title = isList ? "Grid view" : "List view";
    homeViewToggle.setAttribute("aria-label", homeViewToggle.title);
    homeContent.innerHTML = "";

    const docs = filteredDocuments();
    if (docs.length === 0) {
      const empty = mk("div", "home-empty");
      if (state.query) {
        empty.appendChild(mk("strong", null, "No results"));
        empty.appendChild(document.createTextNode("Nothing matches your search."));
      } else if (state.documents.length === 0) {
        empty.appendChild(mk("strong", null, "Welcome to Docly"));
        empty.appendChild(document.createTextNode("You have no documents yet. Click “Blank document” above to create your first one."));
      } else {
        empty.appendChild(mk("strong", null, "Nothing here"));
        empty.appendChild(document.createTextNode("No documents in this section."));
      }
      homeContent.appendChild(empty);
      return;
    }

    if (isList) {
      const list = mk("div", "home-list");
      const head = mk("div", "home-list-head");
      ["Name", "Tags", "Last modified", ""].forEach((t) => head.appendChild(mk("span", null, t)));
      list.appendChild(head);
      for (const doc of docs) {
        const row = mk("div", "home-row");
        const name = mk("div", "home-row-name");
        name.appendChild(mk("span", "home-doc-icon"));
        name.appendChild(mk("span", "home-row-title", doc.title || "Untitled"));
        row.appendChild(name);
        row.appendChild(mk("span", "home-row-tags", (doc.tags || []).join(", ")));
        row.appendChild(mk("span", "home-row-date", fmtDate(doc.updatedAt)));
        row.appendChild(homeActions(doc));
        row.title = doc.title || "Untitled";
        wireOpen(row, doc);
        list.appendChild(row);
      }
      homeContent.appendChild(list);
    } else {
      const grid = mk("div", "home-grid");
      for (const doc of docs) {
        const card = mk("div", "home-card");
        card.appendChild(mk("div", "home-card-thumb", doc.preview || ""));
        const foot = mk("div", "home-card-foot");
        foot.appendChild(mk("span", "home-doc-icon"));
        const meta = mk("div", "home-card-meta");
        meta.appendChild(mk("div", "home-card-title", doc.title || "Untitled"));
        meta.appendChild(mk("div", "home-card-date", fmtDate(doc.updatedAt)));
        foot.appendChild(meta);
        foot.appendChild(homeActions(doc));
        card.appendChild(foot);
        card.title = doc.title || "Untitled";
        wireOpen(card, doc);
        grid.appendChild(card);
      }
      homeContent.appendChild(grid);
    }
  }

  homeViewToggle.addEventListener("click", () => {
    state.homeView = state.homeView === "grid" ? "list" : "grid";
    renderHome();
  });
  el("homeNewBtn").addEventListener("click", () => newDocBtn.click());

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

    // coming from the home page: the document opens with the sidebar closed
    if (appEl.classList.contains("home-mode")) appEl.classList.add("sidebar-closed");
    appEl.classList.remove("home-mode");
    homeView.classList.add("hidden");
    editorWrap.classList.remove("hidden");
    editorWrap.classList.remove("doc-enter");
    void editorWrap.offsetWidth;
    editorWrap.classList.add("doc-enter");

    titleInput.value = doc.title || "";
    fitTitle();
    rafRender();
    favBtn.classList.toggle("active", !!doc.favorite);
    setSaveStatus("saved");

    renderTags();

    richEditor.innerHTML = doc.content || "";

    renderList();
  }

  function closeEditor() {
    state.currentId = null;
    state.currentDoc = null;
    editorWrap.classList.add("hidden");
    appEl.classList.add("home-mode");
    appEl.classList.remove("sidebar-closed");
    homeView.classList.remove("hidden");
    homeView.classList.remove("home-enter");
    void homeView.offsetWidth;
    homeView.classList.add("home-enter");
    renderList();
  }

  async function goHome() {
    if (!state.currentId) return;
    try { if (state.dirty) await doSave(true); } catch (_) {}
    try { await (state.query ? runSearch(state.query) : loadDocuments()); } catch (_) {}
    closeEditor();
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
      activeSearch().focus();
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
      activeSearch().focus();
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
      const sel = `[data-id="${CSS.escape(id)}"]`;
      document.querySelectorAll(`.doc-item${sel}, .home-card${sel}, .home-row${sel}`)
        .forEach((n) => n.classList.add("removing"));
      if (state.currentId === id) editorWrap.classList.add("doc-leave");
      await new Promise((res) => setTimeout(res, 260));
      state.documents = state.documents.filter((d) => d.id !== id);
      if (state.currentId === id) closeEditor();
      editorWrap.classList.remove("doc-leave");
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
      state.justCreated = doc.id;
      clearTimeout(state.justCreatedTimer);
      state.justCreatedTimer = setTimeout(() => { state.justCreated = null; }, 800);
      await loadDocuments();
      await openDocument(doc.id);
    } catch (err) {
      showToast("Document creation error: " + err.message);
    }
  });
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.filter === state.filter));
      renderList();
    });
  });

  function onSearchInput(src) {
    const other = src === searchInput ? homeSearchInput : searchInput;
    other.value = src.value;
    state.query = src.value.trim();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => runSearch(state.query), 250);
  }
  searchInput.addEventListener("input", () => onSearchInput(searchInput));
  homeSearchInput.addEventListener("input", () => onSearchInput(homeSearchInput));

  const activeSearch = () => (appEl.classList.contains("home-mode") ? homeSearchInput : searchInput);

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
  const SIZE_PRESETS = [8, 9, 10, 11, 12, 13, 14, 18, 24, 30, 36, 48, 60, 72, 96];
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
    return isNaN(px) ? 13 : px * 0.75;
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

  /* ---------------- Export (TXT, HTML, Markdown, Word, RTF, JSON backup) ---------------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportName(ext) {
    const base = (state.currentDoc.title || "document").replace(/[\\/:*?"<>|]+/g, "_").trim() || "document";
    return base + "." + ext;
  }
  function hasOpenDoc() {
    if (!state.currentDoc) { showToast("No document open"); return false; }
    return true;
  }
  const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escXml = (s) => escHtml(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // ---- Plain text
  function doExportTxt() {
    if (!hasOpenDoc()) return;
    downloadBlob(new Blob([richEditor.innerText], { type: "text/plain;charset=utf-8" }), exportName("txt"));
    showToast("Exported as TXT");
  }

  // ---- Web page
  function doExportHtml() {
    if (!hasOpenDoc()) return;
    const title = escHtml(state.currentDoc.title || "Document");
    const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
  h1, h2, h3 { color: #333; font-weight: 400; }
  code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
  pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 10px; color: #666; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ddd; padding: 8px; }
  th { background: #f4f4f4; }
  img { max-width: 100%; }
</style>
</head>
<body>
<h1>${title}</h1>
${richEditor.innerHTML}
</body>
</html>`;
    downloadBlob(new Blob([page], { type: "text/html;charset=utf-8" }), exportName("html"));
    showToast("Exported as HTML");
  }

  // ---- Markdown
  const MD_BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "HR", "TABLE"]);
  function mdWrap(s, mark) {
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : s;
  }
  function mdInline(n) {
    if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, " ").replace(/([\\`*_\[\]])/g, "\\$1");
    if (n.nodeType !== 1) return "";
    const tag = n.tagName;
    if (tag === "BR") return "  \n";
    if (tag === "IMG") return `![${n.getAttribute("alt") || ""}](${n.getAttribute("src") || ""})`;
    if (tag === "CODE") return n.textContent ? "`" + n.textContent + "`" : "";
    let s = Array.from(n.childNodes).map(mdInline).join("");
    const css = n.style || {};
    const deco = css.textDecorationLine || css.textDecoration || "";
    const bold = tag === "B" || tag === "STRONG" || css.fontWeight === "bold" || parseInt(css.fontWeight, 10) >= 600;
    const ital = tag === "I" || tag === "EM" || css.fontStyle === "italic";
    const strike = tag === "S" || tag === "STRIKE" || tag === "DEL" || deco.includes("line-through");
    const under = tag === "U" || deco.includes("underline");
    if (tag === "A" && s.trim()) s = `[${s}](${n.getAttribute("href") || ""})`;
    if (tag === "SUP") s = `<sup>${s}</sup>`;
    if (tag === "SUB") s = `<sub>${s}</sub>`;
    if (under && tag !== "A") s = `<u>${s}</u>`;
    if (strike) s = mdWrap(s, "~~");
    if (ital) s = mdWrap(s, "*");
    if (bold) s = mdWrap(s, "**");
    return s;
  }
  function mdBlocks(container) {
    const out = [];
    let buf = "";
    const flush = () => {
      const t = buf.replace(/[ \t]+\n/g, "\n").trim();
      if (t) out.push(t);
      buf = "";
    };
    for (const n of container.childNodes) {
      if (n.nodeType === 3 || (n.nodeType === 1 && !MD_BLOCK.has(n.tagName))) {
        buf += mdInline(n);
      } else if (n.nodeType === 1) {
        flush();
        const b = mdBlock(n);
        if (b) out.push(b);
      }
    }
    flush();
    return out.join("\n\n");
  }
  function mdList(list, depth) {
    const ordered = list.tagName === "OL";
    const lines = [];
    Array.from(list.children).filter((c) => c.tagName === "LI").forEach((li, i) => {
      const nested = [];
      let text = "";
      for (const n of li.childNodes) {
        if (n.nodeType === 1 && (n.tagName === "UL" || n.tagName === "OL")) nested.push(n);
        else text += mdInline(n);
      }
      lines.push("   ".repeat(depth) + (ordered ? `${i + 1}. ` : "- ") + text.trim().replace(/\n/g, " "));
      nested.forEach((nl) => lines.push(mdList(nl, depth + 1)));
    });
    return lines.join("\n");
  }
  function mdTable(t) {
    const rows = Array.from(t.rows).map((r) =>
      Array.from(r.cells).map((c) => mdInline(c).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim() || " ")
    );
    if (!rows.length) return "";
    const cols = Math.max(...rows.map((r) => r.length));
    const line = (r) => { while (r.length < cols) r.push(" "); return "| " + r.join(" | ") + " |"; };
    return [line(rows[0]), "|" + " --- |".repeat(cols), ...rows.slice(1).map(line)].join("\n");
  }
  function mdBlock(n) {
    const tag = n.tagName;
    if (/^H[1-6]$/.test(tag)) return "#".repeat(+tag[1]) + " " + mdInline(n).trim();
    if (tag === "UL" || tag === "OL") return mdList(n, 0);
    if (tag === "BLOCKQUOTE") return mdBlocks(n).split("\n").map((l) => "> " + l).join("\n");
    if (tag === "PRE") return "```\n" + n.textContent.replace(/\n$/, "") + "\n```";
    if (tag === "HR") return "---";
    if (tag === "TABLE") return mdTable(n);
    return mdBlocks(n);
  }
  function doExportMd() {
    if (!hasOpenDoc()) return;
    const md = `# ${state.currentDoc.title || "Document"}\n\n${mdBlocks(richEditor)}\n`;
    downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), exportName("md"));
    showToast("Exported as Markdown");
  }

  // ---- Shared document model (used by Word and RTF)
  const colorCtx = document.createElement("canvas").getContext("2d");
  function cssToHex(v) {
    if (!v) return null;
    colorCtx.fillStyle = "#000000";
    colorCtx.fillStyle = v;
    const c = colorCtx.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase();
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
      return [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase();
    }
    return null;
  }
  function ptFromCss(v) {
    const m = String(v).match(/([\d.]+)\s*(pt|px)/);
    if (!m) return null;
    return m[2] === "pt" ? parseFloat(m[1]) : parseFloat(m[1]) * 0.75;
  }
  const FONT_TAG_SIZES = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 };
  const HEADING_PT = { 1: 24, 2: 19, 3: 15, 4: 13, 5: 13, 6: 13 };

  function inheritStyle(elm, st) {
    const s = { ...st };
    const t = elm.tagName;
    if (t === "B" || t === "STRONG" || t === "TH") s.b = true;
    if (t === "I" || t === "EM") s.i = true;
    if (t === "U") s.u = true;
    if (t === "S" || t === "STRIKE" || t === "DEL") s.s = true;
    if (t === "SUP") s.sup = true;
    if (t === "SUB") s.sub = true;
    if (t === "CODE" || t === "PRE") s.font = "Courier New";
    if (t === "A") { s.link = elm.getAttribute("href") || ""; s.u = true; s.color = "1155CC"; }
    if (t === "FONT") {
      const face = elm.getAttribute("face");
      if (face) s.font = face.split(",")[0].replace(/["']/g, "").trim();
      const col = elm.getAttribute("color");
      if (col && t !== "A") s.color = cssToHex(col) || s.color;
      const sz = FONT_TAG_SIZES[elm.getAttribute("size")];
      if (sz) s.size = sz;
    }
    const css = elm.style;
    if (css) {
      if (css.fontWeight === "bold" || parseInt(css.fontWeight, 10) >= 600) s.b = true;
      if (css.fontStyle === "italic") s.i = true;
      const deco = css.textDecorationLine || css.textDecoration || "";
      if (deco.includes("underline")) s.u = true;
      if (deco.includes("line-through")) s.s = true;
      if (css.color && t !== "A") s.color = cssToHex(css.color) || s.color;
      if (css.backgroundColor) { const bg = cssToHex(css.backgroundColor); if (bg) s.bg = bg; }
      if (css.fontSize) { const pt = ptFromCss(css.fontSize); if (pt) s.size = pt; }
      if (css.fontFamily) s.font = css.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      if (css.verticalAlign === "super") s.sup = true;
      if (css.verticalAlign === "sub") s.sub = true;
    }
    return s;
  }

  // Walks the editor DOM and returns a flat list of blocks:
  //   { type: "p", runs, align, indent, firstLine, line, heading, quote, code, list }
  //   { type: "hr" } | { type: "table", cols, rows: [[blocks]] }
  function buildModel(root, baseStyle) {
    const out = [];
    let cur = null;

    const newPara = (props) => ({ type: "p", runs: [], ...props });
    const ensure = (props) => { if (!cur) cur = newPara(props); return cur; };
    const flush = () => {
      if (!cur) return;
      const p = cur;
      cur = null;
      let hadBr = false;
      while (p.runs.length && p.runs[p.runs.length - 1].br) { p.runs.pop(); hadBr = true; }
      if (!p.code) {
        const first = p.runs[0];
        const last = p.runs[p.runs.length - 1];
        if (first && first.text) first.text = first.text.replace(/^\s+/, "");
        if (last && last.text) last.text = last.text.replace(/\s+$/, "");
      }
      p.runs = p.runs.filter((r) => r.br || r.text);
      if (p.runs.length || hadBr) out.push(p);
    };
    const blockProps = (elm, base) => {
      const p = { ...base };
      const css = elm.style || {};
      if (css.textAlign) p.align = css.textAlign;
      const ml = parseFloat(css.marginLeft);
      if (ml) p.indent = (base.indent || 0) + ml;
      const ti = parseFloat(css.textIndent);
      if (ti) p.firstLine = ti;
      const lh = parseFloat(css.lineHeight);
      if (lh) p.line = lh;
      return p;
    };

    function walkChildren(parent, st, props) {
      for (const n of Array.from(parent.childNodes)) walkNode(n, st, props);
    }
    function listWalk(list, st, props) {
      const ordered = list.tagName === "OL";
      const level = props.list ? props.list.level + 1 : 0;
      Array.from(list.children).filter((c) => c.tagName === "LI").forEach((li, i) => {
        flush();
        const np = blockProps(li, { ...props, list: { ordered, level, index: i + 1 } });
        walkChildren(li, inheritStyle(li, st), np);
        flush();
      });
    }
    function walkNode(n, st, props) {
      if (n.nodeType === 3) {
        if (props.code) {
          const parts = n.nodeValue.split("\n");
          parts.forEach((part, i) => {
            if (i > 0) ensure(props).runs.push({ br: true });
            if (part) ensure(props).runs.push({ text: part, ...st });
          });
          return;
        }
        const t = n.nodeValue.replace(/\s+/g, " ");
        if (!t.trim() && !cur) return;
        ensure(props).runs.push({ text: t, ...st });
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === "BR") { ensure(props).runs.push({ br: true }); return; }
      if (tag === "IMG") { ensure(props).runs.push({ text: "[image]", ...st }); return; }
      if (tag === "HR") { flush(); out.push({ type: "hr" }); return; }
      if (tag === "TABLE") {
        flush();
        const rows = Array.from(n.rows).map((r) => Array.from(r.cells).map((c) => buildModel(c, inheritStyle(c, st))));
        out.push({ type: "table", cols: Math.max(1, ...rows.map((r) => r.length)), rows });
        return;
      }
      if (tag === "UL" || tag === "OL") { flush(); listWalk(n, st, props); return; }
      if (/^(P|DIV|H[1-6]|BLOCKQUOTE|PRE)$/.test(tag)) {
        flush();
        const np = blockProps(n, { ...props, list: undefined });
        let st2 = inheritStyle(n, st);
        if (/^H[1-6]$/.test(tag)) { np.heading = +tag[1]; if (!n.style.fontSize) st2 = { ...st2, size: HEADING_PT[+tag[1]] }; }
        if (tag === "BLOCKQUOTE") np.quote = true;
        if (tag === "PRE") { np.code = true; st2 = { ...st2, size: 11 }; }
        walkChildren(n, st2, np);
        flush();
        return;
      }
      walkChildren(n, inheritStyle(n, st), props);
    }

    walkChildren(root, baseStyle, {});
    flush();
    return out;
  }
  const exportModel = () => buildModel(richEditor, { size: 13, font: "Arial" });

  function pageSetup() {
    const m = rulerMetrics();
    const tw = (px) => Math.round(px * 15);
    return {
      w: 12240, h: 15840,
      top: tw(m.t), bottom: tw(m.b), left: tw(m.l), right: tw(m.r),
    };
  }

  // ---- Word (.docx): a real Office Open XML package written with a tiny ZIP writer
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeZip(files, mime) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const centralSize = central.reduce((n, a) => n + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
      type: mime || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  function buildDocx(blocks) {
    const page = pageSetup();
    const links = [];
    const linkId = (href) => {
      let i = links.indexOf(href);
      if (i < 0) { links.push(href); i = links.length - 1; }
      return "rId" + (i + 1);
    };
    const JC = { left: "left", center: "center", right: "right", justify: "both" };
    const BULLETS = ["\u2022", "\u25E6", "\u25AA"];

    const runXml = (r) => {
      if (r.br) return "<w:r><w:br/></w:r>";
      let pr = "";
      if (r.font) pr += `<w:rFonts w:ascii="${escXml(r.font)}" w:hAnsi="${escXml(r.font)}" w:cs="${escXml(r.font)}"/>`;
      if (r.b) pr += "<w:b/>";
      if (r.i) pr += "<w:i/>";
      if (r.s) pr += "<w:strike/>";
      if (r.color) pr += `<w:color w:val="${r.color}"/>`;
      if (r.size) pr += `<w:sz w:val="${Math.round(r.size * 2)}"/><w:szCs w:val="${Math.round(r.size * 2)}"/>`;
      if (r.u) pr += '<w:u w:val="single"/>';
      if (r.bg) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${r.bg}"/>`;
      if (r.sup) pr += '<w:vertAlign w:val="superscript"/>';
      else if (r.sub) pr += '<w:vertAlign w:val="subscript"/>';
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${escXml(r.text)}</w:t></w:r>`;
    };

    const paraXml = (p) => {
      let ppr = "";
      if (p.quote) ppr += '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="999999"/></w:pBdr>';
      if (p.code) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="F3F3F3"/>';
      if (p.line) ppr += `<w:spacing w:line="${Math.round(p.line * 240)}" w:lineRule="auto"/>`;
      let left = Math.round((p.indent || 0) * 15) + (p.quote ? 360 : 0);
      let prefix = "";
      if (p.list) {
        left += (p.list.level + 1) * 360;
        const label = p.list.ordered ? `${p.list.index}.` : BULLETS[p.list.level % 3];
        prefix = `<w:r><w:t xml:space="preserve">${label}</w:t></w:r><w:r><w:tab/></w:r>`;
        ppr += `<w:ind w:left="${left}" w:hanging="360"/>`;
      } else if (left || p.firstLine) {
        ppr += `<w:ind w:left="${left}"${p.firstLine ? ` w:firstLine="${Math.round(p.firstLine * 15)}"` : ""}/>`;
      }
      if (p.align && JC[p.align]) ppr += `<w:jc w:val="${JC[p.align]}"/>`;
      if (p.heading && p.heading <= 3) ppr += `<w:outlineLvl w:val="${p.heading - 1}"/>`;

      let body = prefix;
      for (let i = 0; i < p.runs.length; ) {
        const r = p.runs[i];
        if (r.link) {
          let inner = "";
          let j = i;
          while (j < p.runs.length && p.runs[j].link === r.link) inner += runXml(p.runs[j++]);
          body += `<w:hyperlink r:id="${linkId(r.link)}" w:history="1">${inner}</w:hyperlink>`;
          i = j;
        } else {
          body += runXml(r);
          i++;
        }
      }
      return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${body}</w:p>`;
    };

    const blocksXml = (list) => list.map((b) => {
      if (b.type === "hr") {
        return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>';
      }
      if (b.type === "table") {
        const total = page.w - page.left - page.right;
        const colW = Math.floor(total / b.cols);
        const border = ["top", "left", "bottom", "right", "insideH", "insideV"]
          .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join("");
        const grid = Array.from({ length: b.cols }, () => `<w:gridCol w:w="${colW}"/>`).join("");
        const rows = b.rows.map((row) => {
          const cells = row.map((cell) => {
            const inner = blocksXml(cell) || "<w:p/>";
            return `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
          });
          while (cells.length < b.cols) cells.push(`<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);
          return `<w:tr>${cells.join("")}</w:tr>`;
        }).join("");
        return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl><w:p/>`;
      }
      return paraXml(b);
    }).join("");

    const body = blocksXml(blocks);
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="${page.w}" w:h="${page.h}"/><w:pgMar w:top="${page.top}" w:right="${page.right}" w:bottom="${page.bottom}" w:left="${page.left}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const rels = links.map((href, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escXml(href)}" TargetMode="External"/>`
    ).join("");
    return makeZip([
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: "word/document.xml", data: documentXml },
      { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` },
    ]);
  }
  function doExportDocx() {
    if (!hasOpenDoc()) return;
    downloadBlob(buildDocx(exportModel()), exportName("docx"));
    showToast("Exported as Word document");
  }

  // ---- Rich Text Format (.rtf)
  function buildRtf(blocks) {
    const page = pageSetup();
    const fonts = [];
    const colors = [];
    const fontIdx = (n) => {
      n = n || "Arial";
      let i = fonts.indexOf(n);
      if (i < 0) { fonts.push(n); i = fonts.length - 1; }
      return i;
    };
    const colorIdx = (hex) => {
      let i = colors.indexOf(hex);
      if (i < 0) { colors.push(hex); i = colors.length - 1; }
      return i + 1;
    };
    const esc = (t) => {
      let o = "";
      for (let k = 0; k < t.length; k++) {
        const ch = t[k];
        const c = t.charCodeAt(k);
        if (ch === "\\" || ch === "{" || ch === "}") o += "\\" + ch;
        else if (c === 9) o += "\\tab ";
        else if (c === 10) o += "\\line ";
        else if (c < 32) continue;
        else if (c > 126) o += "\\u" + (c > 32767 ? c - 65536 : c) + "?";
        else o += ch;
      }
      return o;
    };
    const ALIGN = { left: "\\ql", center: "\\qc", right: "\\qr", justify: "\\qj" };
    const BULLETS = ["\u2022", "\u25E6", "\u25AA"];

    const runRtf = (r) => {
      if (r.br) return "\\line ";
      let s = `\\f${fontIdx(r.font)}\\fs${Math.round((r.size || 13) * 2)}`;
      if (r.b) s += "\\b";
      if (r.i) s += "\\i";
      if (r.u) s += "\\ul";
      if (r.s) s += "\\strike";
      if (r.sup) s += "\\super";
      else if (r.sub) s += "\\sub";
      if (r.color) s += `\\cf${colorIdx(r.color)}`;
      if (r.bg) s += `\\highlight${colorIdx(r.bg)}`;
      return `{${s} ${esc(r.text)}}`;
    };
    const paraRtf = (p, inCell) => {
      let s = "\\pard" + (inCell ? "\\intbl" : "");
      let left = Math.round((p.indent || 0) * 15) + (p.quote ? 360 : 0);
      let first = Math.round((p.firstLine || 0) * 15);
      let prefix = "";
      if (p.list) {
        left += (p.list.level + 1) * 360;
        first = -360;
        const label = p.list.ordered ? `${p.list.index}.` : BULLETS[p.list.level % 3];
        prefix = `{\\f${fontIdx("Arial")}\\fs28 ${esc(label)}}\\tab `;
      }
      if (left) s += `\\li${left}`;
      if (first) s += `\\fi${first}`;
      if (p.align && ALIGN[p.align]) s += ALIGN[p.align];
      if (p.line) s += `\\sl${Math.round(p.line * 240)}\\slmult1`;
      return s + " " + prefix + p.runs.map(runRtf).join("");
    };
    const blocksRtf = (list, inCell) => list.map((b) => {
      if (b.type === "hr") return "\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n";
      if (b.type === "table") {
        const total = page.w - page.left - page.right;
        const colW = Math.floor(total / b.cols);
        const brd = "\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10";
        let out = "";
        for (const row of b.rows) {
          let def = "\\trowd\\trgaph108";
          for (let c = 0; c < b.cols; c++) def += `${brd}\\cellx${colW * (c + 1)}`;
          let cells = "";
          for (let c = 0; c < b.cols; c++) {
            const cell = (row[c] || []).filter((x) => x.type === "p");
            const text = cell.length ? cell.map((p) => paraRtf(p, true)).join("\\par\n") : "\\pard\\intbl ";
            cells += `${text}\\cell\n`;
          }
          out += `${def}\n${cells}\\row\n`;
        }
        return out + "\\pard \\par\n";
      }
      return paraRtf(b, inCell) + "\\par\n";
    }).join("");

    const body = blocksRtf(blocks, false);
    const fontTbl = fonts.map((f, i) => `{\\f${i}\\fnil\\fcharset0 ${f.replace(/[;{}\\]/g, "")};}`).join("");
    const colorTbl = colors.map((hex) => {
      const n = parseInt(hex, 16);
      return `\\red${(n >> 16) & 255}\\green${(n >> 8) & 255}\\blue${n & 255};`;
    }).join("");
    if (!fonts.length) fonts.push("Arial");
    return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl${fontTbl || "{\\f0\\fnil\\fcharset0 Arial;}"}}{\\colortbl;${colorTbl}}\\paperw${page.w}\\paperh${page.h}\\margl${page.left}\\margr${page.right}\\margt${page.top}\\margb${page.bottom}\\uc1\n${body}}`;
  }
  function doExportRtf() {
    if (!hasOpenDoc()) return;
    downloadBlob(new Blob([buildRtf(exportModel())], { type: "application/rtf" }), exportName("rtf"));
    showToast("Exported as Rich Text");
  }

  // ---- OpenDocument Text (.odt)
  function buildOdt(blocks) {
    const page = pageSetup();
    const inch = (tw) => (tw / 1440).toFixed(3) + "in";
    const tStyles = new Map();
    const pStyles = new Map();
    const extraStyles = [];
    const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"';
    const BULLETS = ["\u2022", "\u25E6", "\u25AA"];
    const ALIGN = { left: "start", center: "center", right: "end", justify: "justify" };

    const textStyle = (r) => {
      let a = "";
      if (r.font) a += ` fo:font-family="${escXml(r.font)}"`;
      if (r.size) a += ` fo:font-size="${r.size}pt"`;
      if (r.b) a += ' fo:font-weight="bold"';
      else if (r.nb) a += ' fo:font-weight="normal"';
      if (r.i) a += ' fo:font-style="italic"';
      if (r.u) a += ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"';
      if (r.s) a += ' style:text-line-through-style="solid"';
      if (r.color) a += ` fo:color="#${r.color}"`;
      if (r.bg) a += ` fo:background-color="#${r.bg}"`;
      if (r.sup) a += ' style:text-position="super 58%"';
      else if (r.sub) a += ' style:text-position="sub 58%"';
      if (!a) return null;
      if (!tStyles.has(a)) tStyles.set(a, "T" + (tStyles.size + 1));
      return tStyles.get(a);
    };
    const paraStyle = (p) => {
      let a = "";
      let left = (p.indent || 0) * 0.75 + (p.quote ? 18 : 0);
      let first = (p.firstLine || 0) * 0.75;
      if (p.list) { left += (p.list.level + 1) * 18; first = -18; }
      if (left) a += ` fo:margin-left="${left}pt"`;
      if (first) a += ` fo:text-indent="${first}pt"`;
      if (p.align && ALIGN[p.align]) a += ` fo:text-align="${ALIGN[p.align]}"`;
      if (p.line) a += ` fo:line-height="${Math.round(p.line * 100)}%"`;
      if (p.quote) a += ' fo:border-left="1.5pt solid #999999" fo:padding-left="6pt"';
      if (p.code) a += ' fo:background-color="#f3f3f3"';
      if (p.hr) a += ' fo:border-bottom="0.75pt solid #999999"';
      if (!a) return null;
      if (!pStyles.has(a)) pStyles.set(a, "P" + (pStyles.size + 1));
      return pStyles.get(a);
    };
    const odtText = (t) => escXml(t)
      .replace(/\t/g, "<text:tab/>")
      .replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`);
    const runOdt = (r) => {
      if (r.br) return "<text:line-break/>";
      const sn = textStyle(r);
      const t = odtText(r.text);
      return sn ? `<text:span text:style-name="${sn}">${t}</text:span>` : t;
    };
    const paraOdt = (p) => {
      let inner = "";
      if (p.list) {
        const label = p.list.ordered ? `${p.list.index}.` : BULLETS[p.list.level % 3];
        inner += `${escXml(label)}<text:tab/>`;
      }
      // headings are not bold in the editor, so switch off LibreOffice's default heading weight
      const runs = p.heading ? p.runs.map((r) => (r.br ? r : { ...r, nb: true })) : p.runs;
      for (let i = 0; i < runs.length; ) {
        const r = runs[i];
        if (r.link) {
          let g = "";
          let j = i;
          while (j < runs.length && runs[j].link === r.link) g += runOdt(runs[j++]);
          inner += `<text:a xlink:type="simple" xlink:href="${escXml(r.link)}">${g}</text:a>`;
          i = j;
        } else {
          inner += runOdt(r);
          i++;
        }
      }
      const sn = paraStyle(p);
      const attr = sn ? ` text:style-name="${sn}"` : "";
      if (p.heading && p.heading <= 6) return `<text:h text:outline-level="${p.heading}"${attr}>${inner}</text:h>`;
      return `<text:p${attr}>${inner}</text:p>`;
    };
    let tableCount = 0;
    const blocksOdt = (list) => list.map((b) => {
      if (b.type === "hr") return `<text:p text:style-name="${paraStyle({ hr: true })}"/>`;
      if (b.type === "table") {
        const n = ++tableCount;
        const total = page.w - page.left - page.right;
        const colW = Math.floor(total / b.cols);
        extraStyles.push(`<style:style style:name="Tbl${n}" style:family="table"><style:table-properties style:width="${inch(colW * b.cols)}" table:align="margins"/></style:style>`);
        extraStyles.push(`<style:style style:name="Col${n}" style:family="table-column"><style:table-column-properties style:column-width="${inch(colW)}"/></style:style>`);
        const rows = b.rows.map((row) => {
          const cells = row.map((cell) => `<table:table-cell table:style-name="Cell" office:value-type="string">${blocksOdt(cell) || "<text:p/>"}</table:table-cell>`);
          while (cells.length < b.cols) cells.push('<table:table-cell table:style-name="Cell" office:value-type="string"><text:p/></table:table-cell>');
          return `<table:table-row>${cells.join("")}</table:table-row>`;
        }).join("");
        return `<table:table table:name="Table${n}" table:style-name="Tbl${n}"><table:table-column table:style-name="Col${n}" table:number-columns-repeated="${b.cols}"/>${rows}</table:table><text:p/>`;
      }
      return paraOdt(b);
    }).join("");

    const body = blocksOdt(blocks);
    const auto = [
      ...Array.from(tStyles, ([a, name]) => `<style:style style:name="${name}" style:family="text"><style:text-properties${a}/></style:style>`),
      ...Array.from(pStyles, ([a, name]) => `<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties${a}/></style:style>`),
      '<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.04in" fo:border="0.5pt solid #999999"/></style:style>',
      ...extraStyles,
    ].join("");
    const title = escXml(state.currentDoc.title || "Document");
    const mime = "application/vnd.oasis.opendocument.text";
    return makeZip([
      { name: "mimetype", data: mime },
      { name: "META-INF/manifest.xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>` },
      { name: "meta.xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS}><office:meta><dc:title>${title}</dc:title><meta:generator>Docly</meta:generator></office:meta></office:document-meta>` },
      { name: "styles.xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS}><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${inch(page.w)}" fo:page-height="${inch(page.h)}" fo:margin-top="${inch(page.top)}" fo:margin-bottom="${inch(page.bottom)}" fo:margin-left="${inch(page.left)}" fo:margin-right="${inch(page.right)}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>` },
      { name: "content.xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}><office:automatic-styles>${auto}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>` },
    ], mime);
  }
  function doExportOdt() {
    if (!hasOpenDoc()) return;
    downloadBlob(buildOdt(exportModel()), exportName("odt"));
    showToast("Exported as OpenDocument");
  }

  // ---- EPUB (.epub): a zipped XHTML book with a table of contents built from the headings
  function buildEpub() {
    const title = escXml(state.currentDoc.title || "Document");
    const doc = document.implementation.createHTMLDocument("");
    const box = doc.createElement("div");
    box.innerHTML = richEditor.innerHTML;

    const toc = [];
    box.querySelectorAll("h1, h2, h3").forEach((h, i) => {
      h.id = "sec" + (i + 1);
      toc.push({ id: h.id, text: h.textContent.trim() || "Untitled" });
    });

    const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg", "image/webp": "webp" };
    const images = [];
    box.querySelectorAll("img").forEach((img, i) => {
      const m = (img.getAttribute("src") || "").match(/^data:(image\/[\w.+-]+);base64,([\s\S]*)$/);
      if (!m) return;
      try {
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        const name = `images/img${i + 1}.${EXT[m[1]] || "img"}`;
        images.push({ name, mime: m[1], data: bytes });
        img.setAttribute("src", name);
        if (!img.hasAttribute("alt")) img.setAttribute("alt", "");
      } catch (_) {}
    });
    box.removeAttribute("xmlns");
    const bodyXml = new XMLSerializer().serializeToString(box);

    const uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en"><head><meta charset="utf-8"/><title>${title}</title><style>body{font-family:serif;line-height:1.5}h1,h2,h3{font-weight:normal}blockquote{border-left:3px solid #999;margin-left:0;padding-left:1em;color:#555}pre{background:#f3f3f3;padding:.6em;white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #999;padding:.3em .5em}img{max-width:100%}</style></head><body><h1>${title}</h1>${bodyXml}</body></html>`;
    const navItems = [`<li><a href="chapter.xhtml">${title}</a></li>`, ...toc.map((t) => `<li><a href="chapter.xhtml#${t.id}">${escXml(t.text)}</a></li>`)].join("");
    const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en"><head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav></body></html>`;
    const imgManifest = images.map((im, i) => `<item id="img${i + 1}" href="${im.name}" media-type="${im.mime}"/>`).join("");
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:${uid}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>${imgManifest}</manifest><spine><itemref idref="chapter"/></spine></package>`;
    return makeZip([
      { name: "mimetype", data: "application/epub+zip" },
      { name: "META-INF/container.xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>` },
      { name: "OEBPS/content.opf", data: opf },
      { name: "OEBPS/nav.xhtml", data: nav },
      { name: "OEBPS/chapter.xhtml", data: chapter },
      ...images.map((im) => ({ name: "OEBPS/" + im.name, data: im.data })),
    ], "application/epub+zip");
  }
  function doExportEpub() {
    if (!hasOpenDoc()) return;
    downloadBlob(buildEpub(), exportName("epub"));
    showToast("Exported as EPUB");
  }

  // ---- PDF: uses the browser's own PDF writer (the document title becomes the file name)
  function doExportPdf() {
    if (!hasOpenDoc()) return;
    const previous = document.title;
    document.title = state.currentDoc.title || "document";
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    showToast('Choose "Save as PDF" as the destination');
    setTimeout(() => window.print(), 150);
  }

  // ---- Docly backup (.json): everything needed to restore the document
  function doExportJson() {
    if (!hasOpenDoc()) return;
    const d = state.currentDoc;
    const data = {
      app: "docly",
      title: d.title || "",
      tags: d.tags || [],
      favorite: !!d.favorite,
      content: richEditor.innerHTML,
      exportedAt: new Date().toISOString(),
    };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), exportName("json"));
    showToast("Exported as backup (JSON)");
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



  /* ---------------- Rulers (a frame along the top and left of the view) ---------------- */
  const CM = 96 / 2.54;
  const editorBody = el("editorBody");
  const pageScroll = document.querySelector(".page-scroll");
  const hRuler = el("hRuler");
  const hTrack = el("hTrack");
  const hPage = el("hPage");
  const hBody = el("hBody");
  const hScale = el("hScale");
  const vRuler = el("vRuler");
  const vPage = el("vPage");
  const vBody = el("vBody");
  const vScale = el("vScale");
  const hmL = el("hmL");
  const hmR = el("hmR");
  const vmT = el("vmT");
  const vmB = el("vmB");
  const mFirst = el("rmFirst");
  const mLeft = el("rmLeft");
  const mRight = el("rmRight");

  const rulersVisible = () => !editorBody.classList.contains("no-ruler");
  const zoomNow = () => parseFloat(pageArea.style.zoom) || 1;

  // Page size and margins in the page's own (unzoomed) pixels
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

  // Tick marks every 0.25 cm (small), 0.5 cm (medium), whole cm = number.
  // Only the visible range lo..hi is drawn.
  function buildScale(origin, step, lo, hi, bodyEnd, horizontal, thick) {
    let out = "";
    const iStart = Math.ceil((lo - origin) / step);
    const iEnd = Math.floor((hi - origin) / step);
    for (let i = iStart; i <= iEnd; i++) {
      const pos = origin + i * step;
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

  let rulerFrame = 0;
  function rafRender() {
    if (rulerFrame) return;
    rulerFrame = requestAnimationFrame(() => { rulerFrame = 0; renderRulers(); });
  }

  function renderRulers() {
    if (!state.currentDoc || !rulersVisible()) return;
    const m = rulerMetrics();
    if (!m.W) return;
    const z = zoomNow();
    const hr = hRuler.getBoundingClientRect();
    const vr = vRuler.getBoundingClientRect();
    const pr = pageArea.getBoundingClientRect();
    if (!hr.width || !vr.height) return;

    // the rulers stop where the page's scrollbars begin
    const sbw = pageScroll.offsetWidth - pageScroll.clientWidth;
    const sbh = pageScroll.offsetHeight - pageScroll.clientHeight;
    const trackW = Math.max(0, hr.width - sbw);
    const trackH = Math.max(0, vr.height - sbh);
    hTrack.style.right = sbw + "px";

    // horizontal: page position in ruler coordinates
    const pl = pr.left - hr.left;
    const pageW = m.W * z;
    const x0 = pl + (m.bl + m.l) * z;
    const x1 = pl + (m.W - m.bl - m.r) * z;
    hPage.style.left = pl + "px";
    hPage.style.width = pageW + "px";
    hBody.style.left = x0 + "px";
    hBody.style.width = Math.max(0, x1 - x0) + "px";
    hScale.innerHTML = `<svg width="${trackW}" height="16">${buildScale(x0, (CM / 4) * z, Math.max(0, pl), Math.min(trackW, pl + pageW), x1, true, 16)}</svg>`;
    hmL.style.left = x0 - 4 + "px";
    hmR.style.left = x1 - 4 + "px";

    // vertical: page position in ruler coordinates
    const pt = pr.top - vr.top;
    const pageH = m.H * z;
    const y0 = pt + (m.bt + m.t) * z;
    const y1 = pt + (m.H - m.bt - m.b) * z;
    vPage.style.top = pt + "px";
    vPage.style.height = pageH + "px";
    vBody.style.top = y0 + "px";
    vBody.style.height = Math.max(0, y1 - y0) + "px";
    vScale.innerHTML = `<svg width="22" height="${trackH}">${buildScale(y0, (CM / 4) * z, Math.max(0, pt), Math.min(trackH, pt + pageH), y1, false, 22)}</svg>`;
    vmT.style.top = y0 - 4 + "px";
    vmB.style.top = y1 - 4 + "px";

    updateRulerMarkers();
  }

  function firstSelectedBlock() {
    const r = selectionInEditor() || savedRange;
    return r ? blockOf(r.startContainer) : null;
  }

  function updateRulerMarkers() {
    if (!state.currentDoc || !rulersVisible()) return;
    const m = rulerMetrics();
    const z = zoomNow();
    const pl = pageArea.getBoundingClientRect().left - hRuler.getBoundingClientRect().left;
    const x0 = m.bl + m.l;
    const blk = firstSelectedBlock();
    const cs = blk ? window.getComputedStyle(blk) : null;
    const ml = cs ? parseFloat(cs.marginLeft) || 0 : 0;
    const ti = cs ? parseFloat(cs.textIndent) || 0 : 0;
    const mr = cs ? parseFloat(cs.marginRight) || 0 : 0;
    mLeft.style.left = pl + (x0 + ml) * z - 5 + "px";
    mFirst.style.left = pl + (x0 + ml + ti) * z - 5 + "px";
    mRight.style.left = pl + (m.W - m.bl - m.r - mr) * z - 5 + "px";
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
    const z = zoomNow();
    const x0 = m0.bl + m0.l;
    const b0 = blocks[0] ? window.getComputedStyle(blocks[0]) : null;
    const ml0 = b0 ? parseFloat(b0.marginLeft) || 0 : 0;
    let changedBlocks = false;
    let changedMargins = false;

    function move(ev) {
      // pointer position in the page's own pixels, measured from the page's top-left corner
      const pr = pageArea.getBoundingClientRect();
      const pos = horizontal ? (ev.clientX - pr.left) / z : (ev.clientY - pr.top) / z;
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
  [hRuler, vRuler].forEach((r) => r.addEventListener("mousedown", (e) => e.preventDefault()));

  // Show / hide the rulers (off by default, the choice is remembered)
  function toggleRuler() {
    editorBody.classList.toggle("no-ruler");
    try { localStorage.setItem("docly-ruler", rulersVisible() ? "1" : "0"); } catch (_) {}
    rafRender();
  }
  // rulers are off by default; they come back only if the user turned them on
  editorBody.classList.add("no-ruler");
  try { if (localStorage.getItem("docly-ruler") === "1") editorBody.classList.remove("no-ruler"); } catch (_) {}

  // keep the rulers in step with scrolling, resizing and zoom
  pageScroll.addEventListener("scroll", rafRender, { passive: true });
  new ResizeObserver(rafRender).observe(richEditor);
  new ResizeObserver(rafRender).observe(pageScroll);
  new MutationObserver(rafRender).observe(pageArea, { attributes: true, attributeFilter: ["style"] });

  /* ---------------- Sidebar toggle ---------------- */
  const appRoot = el("app");
  const sidebarOpen = () => !appRoot.classList.contains("sidebar-closed");
  function toggleSidebar() {
    appRoot.classList.toggle("sidebar-closed");
    rafRender();
  }
  /* the sidebar always starts open */
  el("sidebarToggle").addEventListener("click", toggleSidebar);
  el("sidebarOpenBtn").addEventListener("click", toggleSidebar);
  el("homeBtn").addEventListener("click", goHome);
  const brandHome = el("brandHome");
  brandHome.addEventListener("click", goHome);
  brandHome.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHome(); } });

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
      { label: "All documents (home)", run: () => goHome() },
      { label: "Save", key: "Ctrl+S", run: needDoc(() => { doSave(true); showToast("Document saved"); }) },
      { label: "Add / remove favorite", run: needDoc(() => favBtn.click()) },
      "-",
      { label: "Download", sub: [
        { label: "Microsoft Word (.docx)", run: doExportDocx },
        { label: "OpenDocument Format (.odt)", run: doExportOdt },
        { label: "Rich Text Format (.rtf)", run: doExportRtf },
        { label: "PDF Document (.pdf)", run: doExportPdf },
        { label: "Plain Text (.txt)", run: doExportTxt },
        { label: "Web Page (.html)", run: doExportHtml },
        { label: "EPUB Publication (.epub)", run: doExportEpub },
        { label: "Markdown (.md)", run: doExportMd },
        "-",
        { label: "Docly backup (.json)", run: doExportJson },
      ] },
      { label: "Print", key: "Ctrl+P", run: clickId("printBtn") },
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
      { label: "Ruler", check: () => rulersVisible(), run: toggleRuler },
      { label: "Toolbar", check: () => !toolbar.classList.contains("hidden"),
        run: () => toolbar.classList.toggle("hidden") },
      { label: "Document list", check: () => sidebarOpen(),
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
