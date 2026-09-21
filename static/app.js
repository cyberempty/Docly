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
    if (modal._cleanup) {
      modal._cleanup();
      modal._cleanup = null;
    }
  }

  function initTheme() {
    const saved = localStorage.getItem("docly-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    themeToggle.textContent = saved === "dark" ? "☾" : "☀";
  }
  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("docly-theme", next);
    themeToggle.textContent = next === "dark" ? "☾" : "☀";
  });

  helpBtn.addEventListener("click", showHelpDialog);

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
    favBtn.textContent = doc.favorite ? "⭐" : "☆";
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
        document.execCommand("insertHTML", false, '<div style="line-height: 1.0;">&nbsp;</div>');
        scheduleSave();
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === "2") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("insertHTML", false, '<div style="line-height: 2.0;">&nbsp;</div>');
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "5") {
      e.preventDefault();
      if (state.currentDoc) {
        focusRich();
        document.execCommand("insertHTML", false, '<div style="line-height: 1.5;">&nbsp;</div>');
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "]") {
      e.preventDefault();
      if (state.currentDoc) {
        applyFontSizeDelta(2);
        scheduleSave();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "[") {
      e.preventDefault();
      if (state.currentDoc) {
        applyFontSizeDelta(-2);
        scheduleSave();
      }
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
      lastSavedTitle = updated.title;
      const idx = state.documents.findIndex((d) => d.id === updated.id);
      if (idx >= 0) { state.documents[idx].title = updated.title; state.documents[idx].updatedAt = updated.updatedAt; }
      renderList();
    } catch (err) {
      showToast("Rename error: " + err.message);
      titleInput.value = lastSavedTitle;
    }
  });

  async function toggleFavorite(id) {
    try {
      const updated = await api("/api/documents/" + encodeURIComponent(id) + "/favorite", { method: "PUT" });
      const idx = state.documents.findIndex((d) => d.id === updated.id);
      if (idx >= 0) state.documents[idx].favorite = updated.favorite;
      if (state.currentId === id) {
        state.currentDoc.favorite = updated.favorite;
        favBtn.textContent = updated.favorite ? "⭐" : "☆";
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

  function getCurrentFontSizePx() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 16;
    let node = sel.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== richEditor && node !== document.body) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.style && node.style.fontSize) {
          const px = parseFloat(node.style.fontSize);
          if (!isNaN(px)) return px;
        }
        const style = window.getComputedStyle(node);
        if (style && style.fontSize) {
          const px = parseFloat(style.fontSize);
          if (!isNaN(px)) return px;
        }
      }
      node = node.parentElement;
    }
    const editorStyle = window.getComputedStyle(richEditor);
    if (editorStyle && editorStyle.fontSize) {
      const px = parseFloat(editorStyle.fontSize);
      if (!isNaN(px)) return px;
    }
    return 16;
  }

  function setFontSizePixels(px) {
    px = Math.min(72, Math.max(8, Math.round(px)));
    focusRich();
    fontSizeInput.value = px;
    document.execCommand("styleWithCSS", false, true);
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    function setOnRange(range) {
      const span = document.createElement("span");
      span.style.fontSize = px + "px";
      const frag = range.extractContents();
      const walker = document.createTreeWalker(frag, NodeFilter.SHOW_ELEMENT, null);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === Node.ELEMENT_NODE && n.style && n.style.fontSize) {
          n.style.removeProperty("font-size");
        }
      }
      span.appendChild(frag);
      range.insertNode(span);
      const textWalker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let hasText = false;
      while (textWalker.nextNode()) {
        if (textWalker.currentNode.nodeValue.length > 0 &&
            textWalker.currentNode.nodeValue.replace(/[\u200B\u00A0\s]/g, "").length > 0) {
          hasText = true;
          break;
        }
      }
      const newRange = document.createRange();
      if (!hasText) {
        newRange.setStartAfter(span);
      } else {
        newRange.selectNodeContents(span);
      }
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    if (sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      let target = null;
      let walk = range.startContainer;
      while (walk && walk !== richEditor) {
        if (walk.nodeType === Node.ELEMENT_NODE && walk.style && walk.style.fontSize) {
          target = walk;
          break;
        }
        walk = walk.parentNode;
      }
      if (target) {
        target.style.fontSize = px + "px";
        const newRange = document.createRange();
        newRange.setStart(range.startContainer, range.startOffset);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        const tmp = document.createElement("span");
        tmp.style.fontSize = px + "px";
        const textBefore = range.startContainer;
        const offsetBefore = range.startOffset;
        tmp.innerHTML = "\uFEFF";
        range.insertNode(tmp);
        const newRange = document.createRange();
        newRange.setStart(tmp, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        setTimeout(() => {
          if (tmp && tmp.parentNode && tmp.innerHTML.replace(/[\u200B\uFEFF]/g, "") === "") {
            const pn = tmp.parentNode;
            const t = document.createTextNode("");
            pn.replaceChild(t, tmp);
            const nr = document.createRange();
            nr.setStart(t, 0);
            nr.collapse(true);
            sel.removeAllRanges();
            sel.addRange(nr);
          }
        }, 0);
      }
    } else {
      setOnRange(sel.getRangeAt(0));
    }
  }

  function applyFontSizeDelta(delta) {
    const current = getCurrentFontSizePx();
    setFontSizePixels(current + delta);
  }

  const toolbarCmdButtons = document.querySelectorAll(".tb-btn[data-cmd]");
  toolbarCmdButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      focusRich();
      document.execCommand(btn.dataset.cmd, false, null);
      scheduleSave();
    });
  });

  blockSelect.addEventListener("change", () => {
    focusRich();
    document.execCommand("formatBlock", false, blockSelect.value);
    scheduleSave();
  });

  el("undoBtn").addEventListener("click", () => { focusRich(); document.execCommand("undo"); scheduleSave(); });
  el("redoBtn").addEventListener("click", () => { focusRich(); document.execCommand("redo"); scheduleSave(); });

  el("fontSizeUp").addEventListener("click", () => {
    applyFontSizeDelta(2);
    scheduleSave();
  });

  el("fontSizeDown").addEventListener("click", () => {
    applyFontSizeDelta(-2);
    scheduleSave();
  });

  el("fontSizeSet").addEventListener("click", () => {
    const size = parseFloat(fontSizeInput.value);
    if (!isNaN(size) && size >= 8 && size <= 72) {
      setFontSizePixels(size);
      scheduleSave();
    }
  });

  el("textColorBtn").addEventListener("click", async () => {
    const color = await showModal("Text color", "Enter color (e.g. #ff0000, red):", "#000000", true);
    if (color) {
      focusRich();
      document.execCommand("foreColor", false, color);
      scheduleSave();
    }
  });

  el("highlightBtn").addEventListener("click", async () => {
    const color = await showModal("Highlight color", "Enter highlight color (e.g. #ffff00, yellow):", "#ffff00", true);
    if (color) {
      focusRich();
      document.execCommand("hiliteColor", false, color);
      scheduleSave();
    }
  });

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

  el("lineSpacing1").addEventListener("click", () => {
    focusRich();
    document.execCommand("insertHTML", false, '<div style="line-height: 1.0;">&nbsp;</div>');
    scheduleSave();
  });

  el("lineSpacing15").addEventListener("click", () => {
    focusRich();
    document.execCommand("insertHTML", false, '<div style="line-height: 1.5;">&nbsp;</div>');
    scheduleSave();
  });

  el("lineSpacing2").addEventListener("click", () => {
    focusRich();
    document.execCommand("insertHTML", false, '<div style="line-height: 2.0;">&nbsp;</div>');
    scheduleSave();
  });

  el("exportTxt").addEventListener("click", () => {
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
  });

  el("exportHtml").addEventListener("click", () => {
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
  });

  el("exportPdf").addEventListener("click", () => {
    if (!state.currentDoc) {
      showToast("No document open");
      return;
    }
    window.print();
  });

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

    const content = richEditor.innerHTML;
    const newContent = content.replace(new RegExp(findTerm, 'gi'), replaceTerm);

    if (newContent !== content) {
      richEditor.innerHTML = newContent;
      scheduleSave();
      showToast("Replacement completed");
    } else {
      showToast("No matches found");
    }
  }

  function showHelpDialog() {
    const helpText = `
═══════════════════════════════════════════════════════════
                    DOCLY SHORTCUTS
═══════════════════════════════════════════════════════════

[FILE MANAGEMENT]
───────────────────────────────────────────────────────────
Ctrl+N    - New document
Ctrl+O    - Search document
Ctrl+S    - Save document
Ctrl+P    - Print
F1        - Help

[TEXT FORMATTING]
───────────────────────────────────────────────────────────
Ctrl+B    - Bold
Ctrl+I    - Italic
Ctrl+U    - Underline
Ctrl+D    - Font dialog
Ctrl+]    - Increase font size
Ctrl+[    - Decrease font size
Ctrl+Space - Remove formatting
Ctrl+Z    - Undo
Ctrl+Y    - Redo

[PARAGRAPHS]
───────────────────────────────────────────────────────────
Ctrl+L    - Align left
Ctrl+E    - Center
Ctrl+R    - Align right
Ctrl+J    - Justify
Ctrl+M    - Increase indent
Ctrl+Shift+M - Decrease indent
Ctrl+1    - Single line spacing
Ctrl+2    - Double line spacing
Ctrl+5    - 1.5 line spacing
Ctrl+Shift+L - Bullet list

[SEARCH AND NAVIGATION]
───────────────────────────────────────────────────────────
Ctrl+F    - Find
Ctrl+H    - Find and replace
Ctrl+G    - Go to position
Double click - Select word
Triple click - Select paragraph
Ctrl+Home - Start of document
Ctrl+End  - End of document

[EXPORT]
───────────────────────────────────────────────────────────
Use toolbar buttons to export as:
• TXT (Plain text)
• HTML (Formatted web page)
• PDF (Print to PDF)

═══════════════════════════════════════════════════════════
`;
    showModal("Keyboard shortcuts", helpText, "", false);
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

  richEditor.addEventListener("keyup", () => {
    if (state.currentDoc) fontSizeInput.value = Math.round(getCurrentFontSizePx());
  });
  richEditor.addEventListener("mouseup", () => {
    if (state.currentDoc) fontSizeInput.value = Math.round(getCurrentFontSizePx());
  });

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

  initTheme();
  loadDocuments().catch((err) => showToast("Loading error: " + err.message));
})();
