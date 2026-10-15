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
    collection: "",            // active collection filter ("" = all)
    selected: new Set(),       // ids selected on the home page
    allDocs: [],               // every document (the list can be narrowed by a search)
    extraCollections: [],      // collections created but still empty
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
  const toolbar = el("toolbar");
  const richEditor = el("richEditor");
  const newDocBtn = el("newDocBtn");
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
      
      const handleEnter = (e) => { if (e.key === "Enter" && showInput) { e.preventDefault(); handleOk(); } };
      modalOk.onclick = handleOk;
      modalCancel.onclick = handleCancel;
      modalOverlay.onclick = handleOverlayClick;
      document.addEventListener("keydown", handleEscape);
      modalInput.addEventListener("keydown", handleEnter);
      
      modal._cleanup = () => {
        modalOk.onclick = null;
        modalCancel.onclick = null;
        modalOverlay.onclick = null;
        document.removeEventListener("keydown", handleEscape);
        modalInput.removeEventListener("keydown", handleEnter);
      };
    });
  }
  
  // Popup with custom buttons. buttons: [{ label, value, primary }]. Resolves with the clicked value ("cancel" on Esc / outside click / x).
  function showChoice(title, message, buttons) {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modalInput.classList.add("hidden");
      modalInput2.classList.add("hidden");
      modalButtons.classList.add("hidden");
      const row = document.createElement("div");
      row.className = "modal-buttons";
      const finish = (v) => { closeModal(); resolve(v); };
      buttons.forEach((b) => {
        const btn = document.createElement("button");
        btn.className = "modal-btn " + (b.primary ? "modal-btn-ok" : "modal-btn-cancel");
        btn.textContent = b.label;
        btn.onclick = () => finish(b.value);
        row.appendChild(btn);
      });
      modalButtons.parentNode.appendChild(row);
      const handleEscape = (e) => { if (e.key === "Escape") finish("cancel"); };
      modalCancel.onclick = () => finish("cancel");
      modalOverlay.onclick = (e) => { if (e.target === modalOverlay) finish("cancel"); };
      document.addEventListener("keydown", handleEscape);
      modalOverlay.classList.remove("hidden");
      modal._cleanup = () => {
        row.remove();
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

  el("modalClose").addEventListener("click", () => modalCancel.click());

  async function loadDocuments() {
    const data = await api("/api/documents");
    state.documents = data.documents || [];
    state.allDocs = state.documents;
    state.extraCollections = data.collections || [];
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
    if (state.collection) docs = docs.filter((d) => d.collection === state.collection);
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
    const ids = new Set(state.allDocs.map((d) => d.id));
    state.selected.forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });
    if (state.collection && !allCollections().some(([n]) => n === state.collection)) state.collection = "";
    renderSidebarList();
    renderHome();
    renderCollections();
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
      date.textContent = fmtDate(doc.updatedAt) + (doc.collection ? " · 📁 " + doc.collection : "");
      if (doc.favorite) item.classList.add("fav");

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

      const folderBtn = document.createElement("button");
      folderBtn.className = "row-icon-btn folder-btn" + (doc.collection ? " active" : "");
      folderBtn.title = doc.collection ? `In folder "${doc.collection}" - click to change or take out` : "Move to a folder";
      folderBtn.textContent = doc.collection ? "📂" : "📁";
      folderBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const name = await pickCollection(doc.collection || "", doc.collection ? "Change folder" : "Move to folder");
        if (name !== null) moveDocsToCollection([doc.id], name);
      });
      actions.appendChild(folderBtn);
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
    const fold = mk("button", "row-icon-btn folder-btn" + (doc.collection ? " active" : ""), doc.collection ? "📂" : "📁");
    fold.title = doc.collection ? `In folder "${doc.collection}" - click to change or take out` : "Move to a folder";
    fold.addEventListener("click", async (e) => {
      e.stopPropagation();
      const name = await pickCollection(doc.collection || "", doc.collection ? "Change folder" : "Move to folder");
      if (name !== null) moveDocsToCollection([doc.id], name);
    });
    wrap.appendChild(fold);
    wrap.appendChild(star);
    wrap.appendChild(trash);
    return wrap;
  }

  function wireOpen(node, doc) {
    node.dataset.id = doc.id;
    node.tabIndex = 0;
    node.draggable = true;      // drag onto a folder to put the document (or the whole selection) inside
    node.addEventListener("dragstart", (e) => {
      const ids = state.selected.has(doc.id) ? Array.from(state.selected) : [doc.id];
      e.dataTransfer.setData(DOCS_MIME, JSON.stringify(ids));
      e.dataTransfer.setData("text/plain", doc.title || "Untitled");
      e.dataTransfer.effectAllowed = "move";
      if (ids.length > 1) { const g = mk("div", "drag-ghost", ids.length + " documents"); document.body.appendChild(g); e.dataTransfer.setDragImage(g, 10, 10); setTimeout(() => g.remove(), 0); }
      document.body.classList.add("dragging-docs");
      node.classList.add("dragging");
    });
    node.addEventListener("dragend", () => { document.body.classList.remove("dragging-docs"); node.classList.remove("dragging"); });
    node.addEventListener("click", (e) => {
      if (state.selected.size > 0 || e.ctrlKey || e.metaKey || e.shiftKey) toggleSelect(doc.id);
      else openDocument(doc.id);
    });
    node.addEventListener("keydown", (e) => {
      if (e.target !== node) return;
      if (e.key === "Enter") { e.preventDefault(); openDocument(doc.id); }
      else if (e.key === " ") { e.preventDefault(); toggleSelect(doc.id); }
    });
  }

  function renderHome() {
    const isList = state.homeView === "list";
    homeView.dataset.view = state.homeView;
    homeViewToggle.title = isList ? "Grid view" : "List view";
    homeViewToggle.setAttribute("aria-label", homeViewToggle.title);
    homeContent.innerHTML = "";
    homeView.classList.toggle("selecting", state.selected.size > 0);
    updateSelBar();

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
        row.appendChild(mk("span", "home-row-tags", [doc.collection ? "📁 " + doc.collection : "", (doc.tags || []).join(", ")].filter(Boolean).join(" · ")));
        row.appendChild(mk("span", "home-row-date", fmtDate(doc.updatedAt)));
        row.appendChild(homeActions(doc));
        row.title = doc.title || "Untitled";
        row.appendChild(selectCheck(doc));
        row.classList.toggle("selected", state.selected.has(doc.id));
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
        if (doc.collection) meta.appendChild(mk("div", "home-card-folder", "📁 " + doc.collection));
        foot.appendChild(meta);
        card.appendChild(foot);
        card.appendChild(homeActions(doc));          // buttons float over the thumbnail, so they never squeeze the name
        card.classList.toggle("is-fav", !!doc.favorite);
        card.title = doc.title || "Untitled";
        card.appendChild(selectCheck(doc));
        card.classList.toggle("selected", state.selected.has(doc.id));
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
  const jsonImportInput = el("jsonImportInput");
  el("homeImportBtn").addEventListener("click", () => jsonImportInput.click());
  jsonImportInput.addEventListener("change", () => {
    const files = Array.from(jsonImportInput.files || []);
    jsonImportInput.value = "";
    importFiles(files);
  });
  // drag files onto the home page to import them
  homeView.addEventListener("dragover", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault(); });
  homeView.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); importFiles(e.dataTransfer.files); } });


  /* ---------------- Collections (folders) ---------------- */
  const homeCollections = el("homeCollections");
  const collectionSelect = el("collectionSelect");
  function allCollections() {
    const m = new Map();
    state.allDocs.forEach((d) => { if (d.collection) m.set(d.collection, (m.get(d.collection) || 0) + 1); });
    state.extraCollections.forEach((c) => { if (!m.has(c)) m.set(c, 0); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }
  function setCollection(name) {
    state.collection = state.collection === name ? "" : name;
    renderList();
  }
  const DOCS_MIME = "application/x-docly-docs";
  const draggedIds = (e) => { try { return JSON.parse(e.dataTransfer.getData(DOCS_MIME) || "[]"); } catch (_) { return []; } };
  const hasDocs = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(DOCS_MIME);
  // make an element accept dragged documents
  function dropTarget(node, onDrop) {
    node.addEventListener("dragover", (e) => { if (hasDocs(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; node.classList.add("drop"); } });
    node.addEventListener("dragleave", () => node.classList.remove("drop"));
    node.addEventListener("drop", (e) => {
      node.classList.remove("drop");
      if (!hasDocs(e)) return;
      e.preventDefault();
      const ids = draggedIds(e);
      if (ids.length) onDrop(ids);
    });
  }
  function renderCollections() {
    const cols = allCollections();
    homeCollections.innerHTML = "";
    const chip = (cls, label, count, onClick) => {
      const b2 = mk("button", "coll-chip " + cls); b2.type = "button";
      b2.appendChild(document.createTextNode(label));
      if (count != null) b2.appendChild(mk("span", "coll-n", String(count)));
      b2.addEventListener("click", onClick);
      homeCollections.appendChild(b2);
      return b2;
    };
    const all = chip(state.collection ? "" : "active", "All documents", state.allDocs.length, () => { state.collection = ""; renderList(); });
    all.title = "Show every document";
    cols.forEach(([name, n]) => {
      const f = chip(state.collection === name ? "folder active" : "folder", (state.collection === name ? "📂 " : "📁 ") + name + " ", n, () => setCollection(name));
      f.title = "Open folder \"" + name + "\". Drag documents here to put them inside.";
      dropTarget(f, (ids) => moveDocsToCollection(ids, name));
    });
    const add = chip("coll-new", "＋ New folder", null, createCollection);
    add.title = "Create a folder (or drop documents here to put them in a new folder)";
    dropTarget(add, async (ids) => { const name = await createCollection(true); if (name) moveDocsToCollection(ids, name); });
    const out = chip("coll-out", "↩ Take out of folder", null, () => {});
    out.title = "Drop documents here to remove them from their folder";
    dropTarget(out, (ids) => moveDocsToCollection(ids, ""));
    if (state.collection) {
      const ren = mk("button", "coll-tool", "Rename folder"); ren.type = "button";
      ren.addEventListener("click", () => renameCollection(state.collection));
      const del = mk("button", "coll-tool", "Delete folder"); del.type = "button";
      del.addEventListener("click", () => deleteCollection(state.collection));
      homeCollections.appendChild(ren); homeCollections.appendChild(del);
    }
    // sidebar selector
    collectionSelect.innerHTML = "";
    const optAll = document.createElement("option"); optAll.value = ""; optAll.textContent = "All folders";
    collectionSelect.appendChild(optAll);
    cols.forEach(([name, n]) => {
      const o = document.createElement("option"); o.value = name; o.textContent = "📁 " + name + " (" + n + ")";
      collectionSelect.appendChild(o);
    });
    collectionSelect.value = state.collection;
  }
  collectionSelect.addEventListener("change", () => { state.collection = collectionSelect.value; renderList(); });

  const cleanCollectionName = (v) => String(v || "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  async function createCollection(returnName) {
    const name = cleanCollectionName(await showModal("New folder", "Name of the folder:", "", true));
    if (!name) return "";
    try {
      await api("/api/collections/create", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!state.extraCollections.includes(name)) state.extraCollections.push(name);
      if (returnName !== true) { state.collection = name; showToast("Folder created: drag documents onto it to fill it"); }
      renderList();
      return name;
    } catch (err) { showToast("Could not create the folder: " + err.message); return ""; }
  }
  async function renameCollection(name) {
    const to = cleanCollectionName(await showModal("Rename folder", "New name:", name, true));
    if (!to || to === name) return;
    try {
      await api("/api/collections/rename", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, to }) });
      state.extraCollections = state.extraCollections.map((c) => (c === name ? to : c));
      state.collection = to;
      if (state.currentDoc && state.currentDoc.collection === name) state.currentDoc.collection = to;
      await loadDocuments();
    } catch (err) { showToast("Could not rename the folder: " + err.message); }
  }
  async function deleteCollection(name) {
    const r = await showChoice("Delete folder", `Delete the folder "${name}"? Its documents are kept and simply leave the folder.`, [
      { label: "Cancel", value: "cancel" }, { label: "Delete folder", value: "delete", primary: true },
    ]);
    if (r !== "delete") return;
    try {
      await api("/api/collections/delete", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      state.extraCollections = state.extraCollections.filter((c) => c !== name);
      if (state.currentDoc && state.currentDoc.collection === name) state.currentDoc.collection = "";
      state.collection = "";
      await loadDocuments();
    } catch (err) { showToast("Delete error: " + err.message); }
  }
  // Dialog: choose a collection. Resolves with the name, "" (no collection) or null (cancelled).
  function pickCollection(current, title) {
    return new Promise((resolve) => {
      const ov = document.createElement("div"); ov.className = "modal-overlay";
      const box = document.createElement("div"); box.className = "modal tags-dialog";
      box.innerHTML = '<div class="modal-header"><h3></h3><button class="modal-close" type="button">&times;</button></div>' +
        '<div class="modal-body"><div class="pick-list"></div>' +
        '<div class="tags-dialog-add"><input type="text" class="modal-input" placeholder="New folder name" autocomplete="off"><button type="button" class="modal-btn modal-btn-ok">Create and move</button></div></div>';
      box.querySelector("h3").textContent = title || "Move to folder";
      const list = box.querySelector(".pick-list"), input = box.querySelector("input");
      const done = (v) => { document.removeEventListener("keydown", onKey, true); ov.remove(); resolve(v); };
      const chip = (label, value, active, extra) => {
        const b2 = mk("button", "coll-chip" + (active ? " active" : "") + (extra ? " " + extra : ""), label); b2.type = "button";
        b2.addEventListener("click", () => done(value)); list.appendChild(b2);
      };
      if (current) chip("↩ Take out of folder \"" + current + "\"", "", false, "coll-out-pick");
      allCollections().forEach(([n]) => chip((current === n ? "📂 " : "📁 ") + n, n, current === n, "folder"));
      if (!allCollections().length) list.appendChild(mk("div", "pick-empty", "No folders yet: type a name below to create the first one."));
      const create = () => { const n = cleanCollectionName(input.value); if (n) done(n); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } else if (e.key === "Enter" && e.target === input) { e.preventDefault(); e.stopPropagation(); create(); } };
      document.addEventListener("keydown", onKey, true);
      ov.addEventListener("mousedown", (e) => { if (e.target === ov) done(null); });
      box.querySelector(".modal-close").onclick = () => done(null);
      box.querySelector(".tags-dialog-add .modal-btn").onclick = create;
      ov.appendChild(box); document.body.appendChild(ov); input.focus();
    });
  }
  async function moveDocsToCollection(ids, name) {
    try {
      for (const id of ids) {
        await api("/api/documents/" + encodeURIComponent(id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection: name }) });
        [state.documents, state.allDocs].forEach((list) => { const d = list.find((x) => x.id === id); if (d) d.collection = name; });
        if (state.currentDoc && state.currentId === id) state.currentDoc.collection = name;
      }
      if (name && !state.allDocs.some((d) => d.collection === name)) state.extraCollections.push(name);
      renderList();
      showToast(name ? (ids.length === 1 ? `Moved to folder "${name}"` : `${ids.length} documents moved to "${name}"`) : (ids.length === 1 ? "Taken out of its folder" : `${ids.length} documents taken out of their folders`));
    } catch (err) { showToast("Could not move: " + err.message); }
  }
  async function moveCurrentToCollection() {
    if (!state.currentId) return;
    const cur = (state.currentDoc && state.currentDoc.collection) || "";
    const name = await pickCollection(cur, cur ? "Change folder" : "Move to folder");
    if (name !== null) moveDocsToCollection([state.currentId], name);
  }

  /* ---------------- Multiple selection on the home page ---------------- */
  function selectCheck(doc) {
    const b = mk("span", "sel-check");
    b.setAttribute("role", "checkbox"); b.title = "Select";
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleSelect(doc.id); });
    return b;
  }
  function toggleSelect(id) {
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    renderHome();
  }
  function updateSelBar() {
    const n = state.selected.size, bar = el("selBar");
    bar.classList.toggle("hidden", n === 0);
    el("selCount").textContent = n + " selected";
    el("selOut").classList.toggle("hidden", !state.allDocs.some((d) => state.selected.has(d.id) && d.collection));
  }
  el("selAll").addEventListener("click", () => { filteredDocuments().forEach((d) => state.selected.add(d.id)); renderHome(); });
  el("selClear").addEventListener("click", () => { state.selected.clear(); renderHome(); });
  el("selMove").addEventListener("click", async () => {
    const name = await pickCollection("", "Move " + state.selected.size + " document" + (state.selected.size === 1 ? "" : "s") + " to a folder");
    if (name !== null && name !== "") { const ids = Array.from(state.selected); state.selected.clear(); await moveDocsToCollection(ids, name); }
  });
  el("selOut").addEventListener("click", async () => {
    const ids = Array.from(state.selected); state.selected.clear(); await moveDocsToCollection(ids, "");
  });
  const safeFileName = (t) => (t || "document").replace(/[\\/:*?"<>|]+/g, "_").trim() || "document";
  async function exportDocsZip(ids) {
    const files = [], used = new Set();
    for (const id of ids) {
      const d = await api("/api/documents/" + encodeURIComponent(id));
      const base = safeFileName(d.title);
      let name = base + "_Docly.json", i = 1;
      while (used.has(name)) name = base + " (" + (++i) + ")_Docly.json";
      used.add(name);
      files.push({ name, data: JSON.stringify(buildBackup(d, d.content || ""), null, 2) });
    }
    downloadBlob(makeZip(files, "application/zip"), "Docly_backup.zip");
  }
  el("selExport").addEventListener("click", async () => {
    try { await exportDocsZip(Array.from(state.selected)); showToast("Backup (ZIP) downloaded"); }
    catch (err) { showToast("Export failed: " + err.message); }
  });
  el("selDelete").addEventListener("click", async () => {
    const ids = Array.from(state.selected), n = ids.length;
    const first = await showChoice("Delete documents", `Do you want to delete ${n} document${n === 1 ? "" : "s"}?`, [
      { label: "Cancel", value: "cancel" }, { label: "Delete", value: "delete", primary: true },
    ]);
    if (first !== "delete") return;
    const second = await showChoice("Delete or export first?", `${n} document${n === 1 ? "" : "s"} will be moved to the trash. You can also download a ZIP with one JSON backup per document: importing it again restores them as if they had never been deleted.`, [
      { label: "Cancel", value: "cancel" }, { label: "Delete", value: "delete" }, { label: "Export ZIP and delete", value: "export", primary: true },
    ]);
    if (second !== "delete" && second !== "export") return;
    if (second === "export") {
      try { await exportDocsZip(ids); } catch (err) { showToast("Export failed, nothing deleted: " + err.message); return; }
    }
    try {
      for (const id of ids) await api("/api/documents/" + encodeURIComponent(id), { method: "DELETE" });
      state.documents = state.documents.filter((d) => !ids.includes(d.id));
      state.allDocs = state.allDocs.filter((d) => !ids.includes(d.id));
      state.selected.clear();
      renderList();
      showToast(n + " document" + (n === 1 ? "" : "s") + " moved to trash");
    } catch (err) { showToast("Delete error: " + err.message); await loadDocuments(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.selected.size && !homeView.classList.contains("hidden") && modalOverlay.classList.contains("hidden")) { state.selected.clear(); renderHome(); }
  });


  /* ---------------- Header, footer and page numbers ---------------- */
  const pageHeaderEl = el("pageHeader"), pageFooterEl = el("pageFooter");
  const PN_POS = ["none", "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];
  function docLayout() {
    const l = (state.currentDoc && state.currentDoc.layout) || {};
    return { header: l.header || "", footer: l.footer || "", pageNumbers: PN_POS.includes(l.pageNumbers) ? l.pageNumbers : "none", skipFirst: !!l.skipFirst };
  }
  // Segments of the header / footer in its three zones: text, or the page number / page count fields.
  function hfSegments(kind) {
    const L = docLayout(), text = kind === "top" ? L.header : L.footer;
    const out = { l: [], c: [], r: [] };
    const title = (state.currentDoc && state.currentDoc.title) || "";
    if (text) {
      text.split(/(\{pages?\}|\{title\}|\{date\})/i).forEach((part) => {
        if (!part) return;
        const m = part.toLowerCase();
        if (m === "{page}") out.c.push({ t: "page" });
        else if (m === "{pages}") out.c.push({ t: "pages" });
        else if (m === "{title}") out.c.push({ t: "text", v: title });
        else if (m === "{date}") out.c.push({ t: "text", v: new Date().toLocaleDateString() });
        else out.c.push({ t: "text", v: part });
      });
    }
    if (L.pageNumbers !== "none" && L.pageNumbers.startsWith(kind)) {
      const z = { left: "l", center: "c", right: "r" }[L.pageNumbers.split("-")[1]];
      if (out[z].length) out[z].push({ t: "text", v: "   " });
      out[z].push({ t: "page" });
    }
    return out;
  }
  const hfEmpty = (s2) => !s2.l.length && !s2.c.length && !s2.r.length;
  const hfText = (segs, page, pages) => segs.map((x) => (x.t === "page" ? String(page) : x.t === "pages" ? String(pages) : x.v)).join("");

  function renderHeaderFooter() {
    [[pageHeaderEl, "top"], [pageFooterEl, "bottom"]].forEach(([node, kind]) => {
      const segs = state.currentDoc ? hfSegments(kind) : { l: [], c: [], r: [] };
      const on = !hfEmpty(segs);
      node.classList.toggle("on", on);
      if (!on) return;
      ["l", "c", "r"].forEach((z) => { node.querySelector(".hf-" + z).textContent = hfText(segs[z], 1, 1); });
      const cs = getComputedStyle(richEditor);
      const mTop = parseFloat(cs.paddingTop) || 0, mBot = parseFloat(cs.paddingBottom) || 0;
      node.style.paddingLeft = cs.paddingLeft; node.style.paddingRight = cs.paddingRight;
      if (kind === "top") node.style.top = Math.max(4, mTop / 2 - 6) + "px"; else node.style.bottom = Math.max(4, mBot / 2 - 6) + "px";
    });
  }

  // Printing: page-margin boxes (Chrome / Edge) carry the header, footer and page numbers on every printed page
  function applyPrintHF() {
    let st = document.getElementById("hfPrintStyle");
    if (!st) { st = document.createElement("style"); st.id = "hfPrintStyle"; document.head.appendChild(st); }
    if (!state.currentDoc) { st.textContent = ""; return; }
    const L = docLayout(), top = hfSegments("top"), bot = hfSegments("bottom");
    if (hfEmpty(top) && hfEmpty(bot)) { st.textContent = ""; return; }
    const q = (t) => '"' + String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ") + '"';
    const content = (segs) => segs.map((x) => (x.t === "page" ? "counter(page)" : x.t === "pages" ? "counter(pages)" : q(x.v))).join(" ");
    const NAMES = { l: "left", c: "center", r: "right" };
    const boxes = [];
    [["top", top], ["bottom", bot]].forEach(([kind, segs]) => ["l", "c", "r"].forEach((z) => { if (segs[z].length) boxes.push([kind + "-" + NAMES[z], content(segs[z])]); }));
    const style = "font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #555;";
    const cs = getComputedStyle(richEditor);
    const paper = window.__pagePaper ? window.__pagePaper() : { w: 12240, h: 15840 };
    let css = "@page { size: " + (paper.w / 1440) + "in " + (paper.h / 1440) + "in; margin: " + cs.paddingTop + " " + cs.paddingRight + " " + cs.paddingBottom + " " + cs.paddingLeft + ";" +
      boxes.map(([b, c]) => " @" + b + " { content: " + c + "; " + style + " }").join("") + " }";
    if (L.skipFirst) css += " @page :first {" + boxes.map(([b]) => " @" + b + " { content: none; }").join("") + " }";
    st.textContent = css;
  }
  window.addEventListener("beforeprint", () => { applyPrintHF(); });

  function setLayout(patch) {
    if (!state.currentDoc) return;
    state.currentDoc.layout = Object.assign({}, state.currentDoc.layout || {}, patch);
    renderHeaderFooter(); applyPrintHF(); scheduleSave();
  }
  async function showHeaderFooter() {
    if (!needOpenDoc()) return;
    const cur = docLayout();
    const res = await formDialog("Header & footer", [
      { key: "header", label: "Header text", type: "text", value: cur.header },
      { key: "footer", label: "Footer text", type: "text", value: cur.footer },
      { key: "pageNumbers", label: "Page numbers", type: "select", value: cur.pageNumbers, options: [["none", "None"], ["top-left", "Top left"], ["top-center", "Top center"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"], ["bottom-right", "Bottom right"]] },
      { key: "skipFirst", label: "First page", type: "select", value: cur.skipFirst ? "skip" : "show", options: [["show", "Show header, footer and number"], ["skip", "Hide them on the first page"]] },
    ], "OK");
    if (!res) return;
    setLayout({ header: String(res.header || "").slice(0, 300), footer: String(res.footer || "").slice(0, 300), pageNumbers: res.pageNumbers, skipFirst: res.skipFirst === "skip" });
    showToast("In the text you can use {page}, {pages}, {title} and {date}");
  }

  /* ---------------- Footnotes (listed at the end of the document, renumbered automatically) ---------------- */
  const fnNewId = () => "fn" + Math.random().toString(36).slice(2, 8);
  function makeFnNote(id, num, text) {
    const n = document.createElement("div");
    n.className = "fn-note"; n.dataset.fn = id;
    const sup = document.createElement("sup"); sup.className = "fn-num"; sup.textContent = String(num); sup.setAttribute("contenteditable", "false");
    const t = document.createElement("span"); t.className = "fn-text"; t.setAttribute("contenteditable", "true"); t.textContent = text || "";
    n.appendChild(sup); n.appendChild(document.createTextNode(" ")); n.appendChild(t);
    return n;
  }
  function ensureFnSection() {
    let sec = richEditor.querySelector(".fn-section");
    if (sec) return sec;
    sec = document.createElement("div");
    sec.className = "fn-section"; sec.setAttribute("contenteditable", "false");
    sec.innerHTML = '<hr class="fn-rule">';
    const last = richEditor.lastElementChild;
    if (last && last.tagName === "P" && !last.textContent.trim() && !last.querySelector("table,hr")) richEditor.insertBefore(sec, last);
    else { richEditor.appendChild(sec); const p2 = document.createElement("p"); p2.innerHTML = "<br>"; richEditor.appendChild(p2); }
    return sec;
  }
  function renumberFootnotes() {
    const refs = Array.from(richEditor.querySelectorAll("sup.fn-ref"));
    let sec = richEditor.querySelector(".fn-section");
    if (!refs.length) { if (sec) sec.remove(); return; }
    if (!sec) sec = ensureFnSection();
    const notes = new Map(Array.from(sec.querySelectorAll(".fn-note")).map((n) => [n.dataset.fn, n]));
    const seen = new Set(), keep = [];
    refs.forEach((r, i) => {
      let id = r.dataset.fn;
      if (seen.has(id)) {                       // a copied reference: give it its own note
        const src = notes.get(id), nid = fnNewId();
        r.dataset.fn = id = nid;
        notes.set(id, makeFnNote(id, i + 1, src ? src.querySelector(".fn-text").textContent : ""));
      }
      seen.add(id);
      let n = notes.get(id);
      if (!n) { n = makeFnNote(id, i + 1, ""); notes.set(id, n); }
      if (r.textContent !== String(i + 1)) r.textContent = String(i + 1);
      const num = n.querySelector(".fn-num");
      if (num.textContent !== String(i + 1)) num.textContent = String(i + 1);
      keep.push(n);
    });
    Array.from(sec.querySelectorAll(".fn-note")).forEach((n) => { if (!keep.includes(n)) n.remove(); });
    keep.forEach((n, i) => { if (sec.children[i + 1] !== n) sec.insertBefore(n, sec.children[i + 1] || null); });
  }
  function insertFootnote() {
    if (!needOpenDoc()) return;
    focusRich(); restoreSelection();
    const id = fnNewId();
    document.execCommand("insertHTML", false, '<sup class="fn-ref" data-fn="' + id + '" contenteditable="false">0</sup>');
    ensureFnSection().appendChild(makeFnNote(id, 0, ""));
    renumberFootnotes();
    const t = richEditor.querySelector('.fn-note[data-fn="' + id + '"] .fn-text');
    if (t) { t.focus(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(r); t.scrollIntoView({ block: "nearest" }); }
    scheduleSave();
  }
  let fnTimer = 0;
  richEditor.addEventListener("input", () => {
    if (!richEditor.querySelector("sup.fn-ref, .fn-section")) return;
    clearTimeout(fnTimer); fnTimer = setTimeout(renumberFootnotes, 300);
  });
  richEditor.addEventListener("click", (e) => {
    const ref = e.target.closest && e.target.closest("sup.fn-ref");
    const num = e.target.closest && e.target.closest(".fn-note .fn-num");
    if (ref) { const t = richEditor.querySelector('.fn-note[data-fn="' + ref.dataset.fn + '"]'); if (t) t.scrollIntoView({ block: "center", behavior: "smooth" }); }
    else if (num) { const r = richEditor.querySelector('sup.fn-ref[data-fn="' + num.parentNode.dataset.fn + '"]'); if (r) r.scrollIntoView({ block: "center", behavior: "smooth" }); }
  });

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

    richEditor.innerHTML = (doc.content || "").replace(/ class="cell-sel"/g, "");
    richEditor.querySelectorAll("img").forEach((img) => img.remove());   // images are not supported
    if (window.__doclyAfterOpen) window.__doclyAfterOpen();
    renderHeaderFooter(); applyPrintHF();

    renderList();
    updateStatusBar();
  }

  function closeEditor() {
    state.currentId = null;
    state.currentDoc = null;
    renderHeaderFooter(); applyPrintHF();
    editorWrap.classList.add("hidden");
    appEl.classList.add("home-mode");
    appEl.classList.remove("sidebar-closed");
    homeView.classList.remove("hidden");
    homeView.classList.remove("home-enter");
    void homeView.offsetWidth;
    homeView.classList.add("home-enter");
    renderList();
    updateStatusBar();
  }

  async function goHome() {
    if (!state.currentId) return;
    try { if (state.dirty) await doSave(true); } catch (_) {}
    try { await (state.query ? runSearch(state.query) : loadDocuments()); } catch (_) {}
    closeEditor();
  }


  function renderTags() { /* tags are managed from File > Tags */ }

  // ---- Tags dialog (File > Tags): add several tags at once, remove them, all in one place
  function openTagsDialog() {
    if (!state.currentDoc) { showToast("Open a document first"); return; }
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    const box = document.createElement("div");
    box.className = "modal tags-dialog";
    box.innerHTML = '<div class="modal-header"><h3>Tags</h3><button class="modal-close" type="button">&times;</button></div>' +
      '<div class="modal-body"><p class="tags-help">Add one or more tags (separate them with commas), then press Enter.</p>' +
      '<div class="tags-dialog-list"></div>' +
      '<div class="tags-dialog-add"><input type="text" class="modal-input" placeholder="e.g. work, ideas, 2026" autocomplete="off"><button type="button" class="modal-btn modal-btn-ok">Add</button></div>' +
      '<div class="modal-buttons"><button type="button" class="modal-btn modal-btn-ok tags-done">Done</button></div></div>';
    const list = box.querySelector(".tags-dialog-list");
    const input = box.querySelector("input");
    const draw = () => {
      list.innerHTML = "";
      const tags = state.currentDoc.tags || [];
      if (!tags.length) { const n = document.createElement("div"); n.className = "tags-empty"; n.textContent = "No tags yet."; list.appendChild(n); return; }
      tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        const t = document.createElement("span"); t.textContent = tag; chip.appendChild(t);
        const rm = document.createElement("button"); rm.type = "button"; rm.title = "Remove tag"; rm.textContent = "✕";
        rm.addEventListener("click", () => { state.currentDoc.tags = state.currentDoc.tags.filter((x) => x !== tag); draw(); scheduleSave(); });
        chip.appendChild(rm); list.appendChild(chip);
      });
    };
    const add = () => {
      const parts = input.value.split(",").map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return;
      state.currentDoc.tags = state.currentDoc.tags || [];
      parts.forEach((p) => { if (!state.currentDoc.tags.includes(p)) state.currentDoc.tags.push(p); });
      input.value = "";
      draw(); scheduleSave();
    };
    const close = () => { add(); document.removeEventListener("keydown", onKey, true); ov.remove(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      else if (e.key === "Enter" && e.target === input) { e.preventDefault(); e.stopPropagation(); add(); }
    };
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    box.querySelector(".modal-close").onclick = close;
    box.querySelector(".tags-done").onclick = close;
    box.querySelector(".tags-dialog-add .modal-btn").onclick = add;
    ov.appendChild(box); document.body.appendChild(ov);
    draw(); input.focus();
  }

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

  const statusPos = el("statusPos"), statusChars = el("statusChars"), statusWords = el("statusWords");
  // updateStatusBar() is cheap to call: the real work (reading the whole text) runs once, shortly after the last call
  let sbTimer = 0;
  function updateStatusBar() { clearTimeout(sbTimer); sbTimer = setTimeout(computeStatusBar, 100); }
  function computeStatusBar() {
    let chars = 0, words = 0, line = 1, col = 1;
    if (state.currentDoc) {
      const text = richEditor.innerText || "";
      chars = text.replace(/\n/g, "").length;
      words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0).cloneRange();
        range.setStart(richEditor, 0);
        const before = range.toString();
        line = before.split("\n").length;
        col = before.length - before.lastIndexOf("\n");
      }
    }
    if (statusPos) statusPos.textContent = "Ln " + line + ", Col " + col;
    if (statusChars) statusChars.textContent = chars + " character" + (chars === 1 ? "" : "s");
    if (statusWords) statusWords.textContent = words + " word" + (words === 1 ? "" : "s");
  }

  async function doSave(immediate) {
    if (!state.currentDoc || !state.currentId) return;
    clearTimeout(state.saveTimer);
    const doc = state.currentDoc;
    doc.content = contentHtml();
    try {
      const updated = await api("/api/documents/" + encodeURIComponent(state.currentId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: doc.content, tags: doc.tags || [], layout: doc.layout || {} }),
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
  richEditor.addEventListener("input", updateStatusBar);
  richEditor.addEventListener("keyup", updateStatusBar);
  richEditor.addEventListener("mouseup", updateStatusBar);
  document.addEventListener("selectionchange", () => { if (state.currentDoc && document.activeElement === richEditor) updateStatusBar(); });

  /* keyboard shortcuts: see the "Keyboard shortcuts (Google Docs style)" section below */

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

  // ---- Automatic title: the first sentence written in the document becomes its title
  const DEFAULT_TITLE_RE = /^(untitled( document)?|new document)(\s*\(\d+\))?$/i;
  const cleanTitle = (t) => (t || "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "").replace(/\s+/g, " ").replace(/^[ .]+|[ .]+$/g, "");
  function firstSentence() {
    const text = (richEditor.innerText || "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
    const line = text.split("\n").map((s) => s.trim()).find((s) => s.length > 0) || "";
    if (!line) return "";
    const m = line.match(/^(.+?[.!?])(\s|$)/);
    let s = (m ? m[1] : line).replace(/[.!?]+$/, "").trim();
    if (s.length > 80) {
      s = s.slice(0, 80);
      const sp = s.lastIndexOf(" ");
      if (sp > 30) s = s.slice(0, sp);
      s = s.trim();
    }
    return s;
  }
  let autoTitleTimer = null;
  function scheduleAutoTitle() {
    clearTimeout(autoTitleTimer);
    autoTitleTimer = setTimeout(autoTitle, 900);
  }
  async function autoTitle() {
    const doc = state.currentDoc, id = state.currentId;
    if (!doc || !id || document.activeElement === titleInput) return;
    const cur = doc.title || "";
    const last = LS.get("docly-autotitle:" + id, "");
    // only while the title is still a default one, or was set by this feature (not renamed by hand)
    if (!(DEFAULT_TITLE_RE.test(cur) || (last && cur === last))) return;
    const next = cleanTitle(firstSentence());
    if (!next || next === cur) return;
    try {
      const updated = await api("/api/documents/" + encodeURIComponent(id) + "/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (state.currentId !== id) return;
      doc.title = updated.title;
      titleInput.value = updated.title;
      fitTitle();
      lastSavedTitle = updated.title;
      LS.set("docly-autotitle:" + id, updated.title);
      const idx = state.documents.findIndex((d) => d.id === updated.id);
      if (idx >= 0) { state.documents[idx].title = updated.title; state.documents[idx].updatedAt = updated.updatedAt; }
      renderList();
    } catch (_) { /* the title simply stays as it is */ }
  }
  richEditor.addEventListener("input", scheduleAutoTitle);

  async function toggleFavorite(id) {
    try {
      const updated = await api("/api/documents/" + encodeURIComponent(id) + "/favorite", { method: "PUT" });
      const idx = state.documents.findIndex((d) => d.id === updated.id);
      if (idx >= 0) state.documents[idx].favorite = updated.favorite;
      const ai = state.allDocs.findIndex((d) => d.id === updated.id);
      if (ai >= 0) state.allDocs[ai].favorite = updated.favorite;
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
    const name = title || "this document";
    // Popup 1: Cancel / Delete
    const first = await showChoice("Delete document", `Do you want to delete "${name}"?`, [
      { label: "Cancel", value: "cancel" },
      { label: "Delete", value: "delete", primary: true },
    ]);
    if (first !== "delete") return;
    // Popup 2: confirmation with optional JSON export
    const second = await showChoice("Delete or export first?", `"${name}" will be moved to the trash. You can also download a copy as a JSON file before deleting it: importing it again restores the document as if it had never been deleted.`, [
      { label: "Cancel", value: "cancel" },
      { label: "Delete", value: "delete" },
      { label: "Export JSON and delete", value: "export", primary: true },
    ]);
    if (second !== "delete" && second !== "export") return;
    if (second === "export") {
      try { await exportDocumentJson(id); }
      catch (err) { showToast("Export failed, document not deleted: " + err.message); return; }
    }
    try {
      await api("/api/documents/" + encodeURIComponent(id), { method: "DELETE" });
      const sel = `[data-id="${CSS.escape(id)}"]`;
      document.querySelectorAll(`.doc-item${sel}, .home-card${sel}, .home-row${sel}`)
        .forEach((n) => n.classList.add("removing"));
      if (state.currentId === id) editorWrap.classList.add("doc-leave");
      await new Promise((res) => setTimeout(res, 260));
      state.documents = state.documents.filter((d) => d.id !== id);
      state.allDocs = state.allDocs.filter((d) => d.id !== id);
      state.selected.delete(id);
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
  const contentHtml = () => richEditor.innerHTML.replace(/ class="cell-sel"/g, "");

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
      clearTimeout(tbTimer);
      tbTimer = setTimeout(syncToolbar, 60);   // coalesce bursts of selection changes (Ctrl+A, shift+arrows…)
    }
  });
  let tbTimer = 0;

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

  function applyColor(mode, color, keepOpen) {
    restoreSelection();
    document.execCommand("styleWithCSS", false, true);
    if (mode === "text") {
      document.execCommand("foreColor", false, color === null ? "inherit" : color);
    } else {
      document.execCommand("hiliteColor", false, color === null ? "transparent" : color);
      if (color) lastHighlight = color;
    }
    document.execCommand("styleWithCSS", false, false);
    if (color && keepOpen !== "skip") {
      recentColors = [color, ...recentColors.filter((c) => c !== color)].slice(0, 10);
      try { localStorage.setItem("docly-recent-colors", JSON.stringify(recentColors)); } catch (_) {}
    }
    if (!keepOpen) closeColorPanel();
    syncToolbar();
    scheduleSave();
  }

  const cpHsv2rgb = (h, s, v) => {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
  };
  const cpRgb2hsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, mx ? d / mx : 0, mx];
  };
  const cpHex = (r, g, b) => "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  const cpParse = (str) => {
    str = String(str || "").trim();
    let m = str.match(/^#?([0-9a-f]{6})$/i);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = str.match(/^#?([0-9a-f]{3})$/i);
    if (m) { const x = m[1]; return [parseInt(x[0] + x[0], 16), parseInt(x[1] + x[1], 16), parseInt(x[2] + x[2], 16)]; }
    m = str.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
    if (m && !(m[4] !== undefined && parseFloat(m[4]) === 0)) return [+m[1], +m[2], +m[3]];
    return null;
  };
  function cpCurrentColor(mode) {
    let n = activeElement();
    if (!n) return null;
    if (mode === "text") return cpParse(window.getComputedStyle(n).color);
    while (n && n !== richEditor) {
      const p = cpParse(window.getComputedStyle(n).backgroundColor);
      if (p) return p;
      n = n.parentElement;
    }
    return null;
  }
  const EYEDROPPER_SVG = '<svg viewBox="0 0 24 24"><path d="M20.71 5.63l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L3 16.25V21h4.75l8.92-8.92 1.42 1.42 1.41-1.41-1.92-1.92 3.12-3.12c.4-.4.4-1.03.01-1.42zM6.92 19L5 17.08l8.06-8.06 1.92 1.92L6.92 19z"/></svg>';

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

    const sv = document.createElement("div");
    sv.className = "cp-sv";
    sv.innerHTML = '<div class="cp-sv-handle"></div>';
    colorPanel.appendChild(sv);

    const mid = document.createElement("div");
    mid.className = "cp-mid";
    mid.innerHTML = '<button type="button" class="cp-eye" title="Pick a color from the screen (eyedropper)">' + EYEDROPPER_SVG + '</button>' +
      '<span class="cp-preview" title="Selected color"></span>' +
      '<div class="cp-hue"><div class="cp-hue-thumb"></div></div>';
    colorPanel.appendChild(mid);

    const rgb = document.createElement("div");
    rgb.className = "cp-rgb";
    rgb.innerHTML = ["R", "G", "B"].map((l) => '<label><input class="cp-num" data-ch="' + l + '" inputmode="numeric" maxlength="3" autocomplete="off"><span>' + l + '</span></label>').join("") +
      '<label class="cp-hex-wrap"><input class="cp-hex" maxlength="7" autocomplete="off" spellcheck="false"><span>HEX</span></label>';
    colorPanel.appendChild(rgb);

    const lbl = document.createElement("div");
    lbl.className = "cp-label";
    lbl.textContent = "Recent";
    const recent = document.createElement("div");
    recent.className = "cp-recent";
    if (recentColors.length) { colorPanel.appendChild(lbl); colorPanel.appendChild(recent); }

    const handle = sv.firstChild, hue = mid.querySelector(".cp-hue"), thumb = hue.firstChild;
    const preview = mid.querySelector(".cp-preview"), eye = mid.querySelector(".cp-eye");
    const nums = Array.from(rgb.querySelectorAll(".cp-num")), hexIn = rgb.querySelector(".cp-hex");

    const start = cpCurrentColor(mode) || cpParse(mode === "text" ? "#000000" : lastHighlight) || [0, 0, 0];
    let [H, S, V] = cpRgb2hsv(start[0], start[1], start[2]);

    function render(skip) {
      const [r, g, b] = cpHsv2rgb(H, S, V);
      sv.style.background = "linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,hsl(" + H + ",100%,50%))";
      handle.style.left = S * 100 + "%";
      handle.style.top = (1 - V) * 100 + "%";
      thumb.style.left = (H / 360) * 100 + "%";
      preview.style.background = cpHex(r, g, b);
      [r, g, b].forEach((v, i) => { if (nums[i] !== skip) nums[i].value = v; });
      if (hexIn !== skip) hexIn.value = cpHex(r, g, b).toUpperCase();
    }
    const commit = () => applyColor(mode, cpHex(...cpHsv2rgb(H, S, V)), true);
    const setRgb = (r, g, b, keepHue) => {
      const [h, s, v] = cpRgb2hsv(r, g, b);
      H = keepHue && (s === 0 || v === 0) ? H : h; S = s; V = v;
    };

    const drag = (target, onMove) => {
      target.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        target.setPointerCapture(e.pointerId);
        onMove(e);
        const mv = (ev) => onMove(ev);
        const up = () => { target.removeEventListener("pointermove", mv); target.removeEventListener("pointerup", up); commit(); };
        target.addEventListener("pointermove", mv);
        target.addEventListener("pointerup", up);
      });
    };
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    drag(sv, (e) => {
      const r = sv.getBoundingClientRect();
      S = clamp01((e.clientX - r.left) / r.width);
      V = 1 - clamp01((e.clientY - r.top) / r.height);
      render();
    });
    drag(hue, (e) => {
      const r = hue.getBoundingClientRect();
      H = clamp01((e.clientX - r.left) / r.width) * 360;
      render();
    });

    nums.forEach((inp, i) => {
      inp.addEventListener("input", () => {
        inp.value = inp.value.replace(/\D/g, "").slice(0, 3);
        const cur = cpHsv2rgb(H, S, V);
        cur[i] = Math.max(0, Math.min(255, parseInt(inp.value || "0", 10)));
        setRgb(cur[0], cur[1], cur[2], true);
        render(inp);
      });
      inp.addEventListener("change", () => { render(); commit(); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
    });
    hexIn.addEventListener("input", () => {
      const p = cpParse(hexIn.value);
      if (p) { setRgb(p[0], p[1], p[2], true); render(hexIn); }
    });
    hexIn.addEventListener("change", () => { render(); commit(); });
    hexIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); hexIn.blur(); } });

    eye.addEventListener("click", async () => {
      if (!window.EyeDropper) { showToast("The eyedropper needs Chrome or Edge"); return; }
      try {
        const res = await new window.EyeDropper().open();
        const p = cpParse(res.sRGBHex);
        if (p) { setRgb(p[0], p[1], p[2], true); render(); commit(); }
      } catch (_) { /* cancelled */ }
    });

    recentColors.forEach((col) => {
      const b = document.createElement("button");
      b.className = "cp-swatch";
      b.style.background = col;
      b.title = col;
      b.addEventListener("click", () => { const p = cpParse(col); if (p) { setRgb(p[0], p[1], p[2], true); render(); commit(); } });
      recent.appendChild(b);
    });

    render();

    const btn = colorBtn(mode);
    btn.classList.add("open");
    const r = btn.getBoundingClientRect();
    colorPanel.classList.remove("hidden");
    const w = colorPanel.offsetWidth;
    colorPanel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    colorPanel.style.top = r.bottom + 4 + "px";
  }

  colorPanel.addEventListener("mousedown", (e) => { if (!e.target.closest("input")) e.preventDefault(); });
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
    // a huge selection (select all) makes every queryCommandState walk the whole document: skip them there
    const big = (() => { const r = selectionInEditor(); return !!r && !r.collapsed && r.toString().length > 2500; })();
    document.querySelectorAll(".tb-btn[data-cmd]").forEach((b) => {
      let on = false;
      if (!big) { try { on = document.queryCommandState(b.dataset.cmd); } catch (_) {} }
      b.classList.toggle("active", !!on);
    });
    const n = activeElement();
    el("linkBtn").classList.toggle("active", !!(n && n.closest && n.closest("a")));
    el("codeBtn").classList.toggle("active", !!(n && n.closest && n.closest("pre")));

    if (!big) {
      const blk = (document.queryCommandValue("formatBlock") || "").toUpperCase().replace(/[<>]/g, "");
      blockSelect.value = currentBlockStyle(blk);
      syncFontFamily();
    }
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
    applyBlockStyle(blockSelect.value);
  });

  el("undoBtn").addEventListener("click", () => { focusRich(); if (!fastUndoNow()) { document.execCommand("undo"); scheduleSave(); } });
  el("redoBtn").addEventListener("click", () => { focusRich(); if (!fastRedoNow()) { document.execCommand("redo"); scheduleSave(); } });

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
</style>
</head>
<body>
<h1>${title}</h1>
${contentHtml()}
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
    if (n.nodeType === 3) return n.nodeValue.replace(/\u200b/g, "").replace(/\s+/g, " ").replace(/([\\`*_\[\]])/g, "\\$1");
    if (n.nodeType !== 1) return "";
    const tag = n.tagName;
    if (tag === "BR") return "  \n";
    if (tag === "IMG") return "";
    if (tag === "A" && n.hasAttribute("data-bookmark")) return n.id ? `<a id="${n.id}"></a>` : "";
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
    if (/^H[1-6]$/.test(tag)) return (n.id ? `<a id="${n.id}"></a>\n` : "") + "#".repeat(+tag[1]) + " " + mdInline(n).trim();
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
    if (t === "A" && elm.hasAttribute("href")) { s.link = elm.getAttribute("href") || ""; s.u = true; s.color = "1155CC"; }
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
      p.runs = p.runs.filter((r) => r.br || r.text || r.anchor);
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
      p.anchors = elm.id ? [elm.id] : undefined;      // headings / blocks that links can point to
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
        const t = n.nodeValue.replace(/\u200b/g, "").replace(/\s+/g, " ");
        if (!t.trim() && !cur) return;
        ensure(props).runs.push({ text: t, ...st });
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === "BR") { ensure(props).runs.push({ br: true }); return; }
      if (tag === "A" && n.hasAttribute("data-bookmark")) {      // a bookmark: a spot that links can jump to
        if (n.id) ensure(props).runs.push({ anchor: n.id });
        return;
      }
      if (tag === "IMG") return;
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
      ...(window.__pagePaper ? window.__pagePaper() : { w: 12240, h: 15840 }),
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

    let bmCounter = 0;
    const bmName = (id) => "bm_" + String(id).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 36);
    const bookmarkXml = (id) => {
      const n = ++bmCounter;
      return `<w:bookmarkStart w:id="${n}" w:name="${bmName(id)}"/><w:bookmarkEnd w:id="${n}"/>`;
    };
    const runXml = (r) => {
      if (r.anchor) return bookmarkXml(r.anchor);
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

      let body = (p.anchors || []).map(bookmarkXml).join("") + prefix;
      for (let i = 0; i < p.runs.length; ) {
        const r = p.runs[i];
        if (r.link) {
          let inner = "";
          let j = i;
          while (j < p.runs.length && p.runs[j].link === r.link) inner += runXml(p.runs[j++]);
          body += r.link.charAt(0) === "#"
            ? `<w:hyperlink w:anchor="${bmName(r.link.slice(1))}" w:history="1">${inner}</w:hyperlink>`      // jumps to a bookmark in the document
            : `<w:hyperlink r:id="${linkId(r.link)}" w:history="1">${inner}</w:hyperlink>`;
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
    // header / footer: left, center and right zones separated by tab stops; page numbers are real Word fields
    const hfPart = (kind) => {
      const segs = hfSegments(kind);
      if (hfEmpty(segs)) return null;
      const total = page.w - page.left - page.right;
      const run = (x) => x.t === "page" ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'
        : x.t === "pages" ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'
        : '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="595959"/></w:rPr><w:t xml:space="preserve">' + escXml(x.v) + "</w:t></w:r>";
      const tag = kind === "top" ? "w:hdr" : "w:ftr";
      const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<' + tag + " " + NS_HF + '><w:p><w:pPr><w:pStyle w:val="' + (kind === "top" ? "Header" : "Footer") + '"/><w:tabs><w:tab w:val="clear" w:pos="4680"/><w:tab w:val="clear" w:pos="9360"/><w:tab w:val="center" w:pos="' + Math.round(total / 2) + '"/><w:tab w:val="right" w:pos="' + total + '"/></w:tabs></w:pPr>' +
        segs.l.map(run).join("") + "<w:r><w:tab/></w:r>" + segs.c.map(run).join("") + "<w:r><w:tab/></w:r>" + segs.r.map(run).join("") + "</" + tag + ">";
      return xml.replace("</" + tag + ">", "</w:p></" + tag + ">");
    };
    const NS_HF = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const hdrXml = hfPart("top"), ftrXml = hfPart("bottom");
    const hfRefs = (hdrXml ? '<w:headerReference w:type="default" r:id="rIdHdr"/>' : "") + (ftrXml ? '<w:footerReference w:type="default" r:id="rIdFtr"/>' : "");
    const titlePg = docLayout().skipFirst && (hdrXml || ftrXml) ? "<w:titlePg/>" : "";
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body}<w:sectPr>${hfRefs}<w:pgSz w:w="${page.w}" w:h="${page.h}"/><w:pgMar w:top="${page.top}" w:right="${page.right}" w:bottom="${page.bottom}" w:left="${page.left}" w:header="720" w:footer="720" w:gutter="0"/>${titlePg}</w:sectPr></w:body></w:document>`;
    const rels = links.map((href, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escXml(href)}" TargetMode="External"/>`
    ).join("") +
      (hdrXml ? '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : "") +
      (ftrXml ? '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : "");
    const hfTypes = (hdrXml ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : "") +
      (ftrXml ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : "");
    return makeZip([
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${hfTypes}</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: "word/document.xml", data: documentXml },
      ...(hdrXml ? [{ name: "word/header1.xml", data: hdrXml }] : []),
      ...(ftrXml ? [{ name: "word/footer1.xml", data: ftrXml }] : []),
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

    const bmName = (id) => "bm_" + String(id).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 36);
    const rtfBookmark = (id) => `{\\*\\bkmkstart ${bmName(id)}}{\\*\\bkmkend ${bmName(id)}}`;
    const runRtf = (r) => {
      if (r.anchor) return rtfBookmark(r.anchor);
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
    // consecutive runs that share a link become one clickable field
    const runsRtf = (runs) => {
      let out = "";
      for (let i = 0; i < runs.length; ) {
        const r = runs[i];
        if (r.link) {
          let g = "";
          let j = i;
          while (j < runs.length && runs[j].link === r.link) g += runRtf(runs[j++]);
          const inst = r.link.charAt(0) === "#"
            ? `HYPERLINK \\l "${bmName(r.link.slice(1))}"`
            : `HYPERLINK "${r.link.replace(/[\\"{}]/g, "")}"`;
          out += `{\\field{\\*\\fldinst{${inst}}}{\\fldrslt ${g}}}`;
          i = j;
        } else {
          out += runRtf(r);
          i++;
        }
      }
      return out;
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
      return s + " " + prefix + (p.anchors || []).map(rtfBookmark).join("") + runsRtf(p.runs);
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
      if (r.anchor) return `<text:bookmark text:name="${escXml(r.anchor)}"/>`;
      if (r.br) return "<text:line-break/>";
      const sn = textStyle(r);
      const t = odtText(r.text);
      return sn ? `<text:span text:style-name="${sn}">${t}</text:span>` : t;
    };
    const paraOdt = (p) => {
      let inner = (p.anchors || []).map((id) => `<text:bookmark text:name="${escXml(id)}"/>`).join("");
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
    box.innerHTML = contentHtml();

    const toc = [];
    box.querySelectorAll("h1, h2, h3").forEach((h, i) => {
      if (!h.id) h.id = "sec" + (i + 1);
      toc.push({ id: h.id, text: h.textContent.trim() || "Untitled" });
    });

    box.querySelectorAll("img").forEach((img) => img.remove());
    box.removeAttribute("xmlns");
    const bodyXml = new XMLSerializer().serializeToString(box);

    const uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en"><head><meta charset="utf-8"/><title>${title}</title><style>body{font-family:serif;line-height:1.5}h1,h2,h3{font-weight:normal}blockquote{border-left:3px solid #999;margin-left:0;padding-left:1em;color:#555}pre{background:#f3f3f3;padding:.6em;white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #999;padding:.3em .5em}</style></head><body><h1>${title}</h1>${bodyXml}</body></html>`;
    const navItems = [`<li><a href="chapter.xhtml">${title}</a></li>`, ...toc.map((t) => `<li><a href="chapter.xhtml#${t.id}">${escXml(t.text)}</a></li>`)].join("");
    const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en"><head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav></body></html>`;
    const imgManifest = "";
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:${uid}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>${imgManifest}</manifest><spine><itemref idref="chapter"/></spine></package>`;
    return makeZip([
      { name: "mimetype", data: "application/epub+zip" },
      { name: "META-INF/container.xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>` },
      { name: "OEBPS/content.opf", data: opf },
      { name: "OEBPS/nav.xhtml", data: nav },
      { name: "OEBPS/chapter.xhtml", data: chapter },
    ], "application/epub+zip");
  }
  function doExportEpub() {
    if (!hasOpenDoc()) return;
    downloadBlob(buildEpub(), exportName("epub"));
    showToast("Exported as EPUB");
  }

  // ---- PDF: a minimal direct PDF writer (no browser headers/footers, direct download)
  const HELV_WIDTHS = (() => {
    const w = new Uint16Array(128);
    const table = { " ":278,"!":278,"\"":355,"#":556,"$":556,"%":889,"&":667,"'":191,"(":333,")":333,"*":389,"+":584,",":278,"-":333,".":278,"/":278,"0":556,"1":556,"2":556,"3":556,"4":556,"5":556,"6":556,"7":556,"8":556,"9":556,":":278,";":278,"<":584,"=":584,">":584,"?":556,"@":1015,"A":667,"B":667,"C":722,"D":722,"E":667,"F":611,"G":778,"H":722,"I":278,"J":500,"K":667,"L":556,"M":833,"N":722,"O":778,"P":667,"Q":778,"R":722,"S":667,"T":611,"U":722,"V":667,"W":944,"X":667,"Y":667,"Z":611,"[":278,"\\":278,"]":278,"^":469,"_":556,"`":333,"a":556,"b":556,"c":500,"d":556,"e":556,"f":278,"g":556,"h":556,"i":222,"j":222,"k":500,"l":222,"m":833,"n":556,"o":556,"p":556,"q":556,"r":333,"s":500,"t":278,"u":556,"v":500,"w":722,"x":500,"y":500,"z":500,"{":334,"|":260,"}":334,"~":584 };
    for (let i = 0; i < 128; i++) w[i] = 500;
    for (const k in table) w[k.charCodeAt(0)] = table[k];
    return w;
  })();
  const WIDE_CHARS = { 0x2014: 1000, 0x2026: 1000, 0x2022: 350, 0x2018: 222, 0x2019: 222, 0x201C: 333, 0x201D: 333, 0x2122: 1000 };
  function textWidth(str, size, mono, bold) {
    if (mono) return (str.length * 600) / 1000 * size;
    if (bold) return textWidth(str, size, false, false) * 1.08;      // Helvetica-Bold glyphs are wider
    let u = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      u += c < 128 ? HELV_WIDTHS[c] : (WIDE_CHARS[c] || 556);
    }
    return (u / 1000) * size;
  }
  function pdfEscape(s) { return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
  // Standard PDF fonts: Helvetica (F1-F4) and Courier (F5-F8) in regular / bold / italic / bold-italic
  function pdfFontName(bold, italic, mono) { return (mono ? "F5" : "F1").replace(/\d/, (d) => String(+d + (bold ? (italic ? 3 : 1) : (italic ? 2 : 0)))); }
  const WIN1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  // text -> single bytes in WinAnsi (accents, euro sign, bullets ... are preserved; other symbols become "?")
  function pdfBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      out[i] = WIN1252[c] || (c < 256 && !(c >= 0x80 && c <= 0x9f) ? c : 0x3f);
    }
    return out;
  }
  const pdfColor = (hex) => {
    const n = parseInt(hex, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((x) => x.toFixed(3)).join(" ");
  };

  // ---- Embedded fonts for the PDF: the fonts installed on the computer are read through the browser's
  // "local fonts" permission (Chrome / Edge). TrueType fonts are embedded whole, so text keeps the chosen
  // font (Arial, Georgia…) in any PDF viewer; without access the standard PDF fonts are used.
  let localFontsCache = null;
  async function localFontList() {
    if (localFontsCache) return { list: localFontsCache };
    if (typeof window.queryLocalFonts !== "function") return { list: null, reason: "unsupported" };
    try { localFontsCache = await window.queryLocalFonts(); return { list: localFontsCache }; }
    catch (e) { return { list: null, reason: "denied" }; }
  }
  function parseTtf(buf, name) {
    const dv = new DataView(buf);
    if (buf.byteLength < 12) return null;
    const sig = dv.getUint32(0);
    if (sig !== 0x00010000 && sig !== 0x74727565) return null;           // TrueType outlines only (no .otf/CFF, no .ttc)
    const T = {};
    for (let i = 0, n = dv.getUint16(4); i < n; i++) {
      const o = 12 + i * 16;
      T[String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3))] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
    }
    if (!T.glyf || !T.loca || !T.head || !T.hhea || !T.hmtx || !T.maxp || !T.cmap) return null;
    const os2 = T["OS/2"];
    if (os2 && (dv.getUint16(os2.off + 8) & 0x0202)) return null;         // licence forbids embedding
    const upm = dv.getUint16(T.head.off + 18), numHM = dv.getUint16(T.hhea.off + 34);
    const adv = (g) => dv.getUint16(T.hmtx.off + 4 * Math.min(g, numHM - 1));
    const ct = T.cmap.off;
    let best = null;
    for (let i = 0, n = dv.getUint16(ct + 2); i < n; i++) {
      const pid = dv.getUint16(ct + 4 + i * 8), eid = dv.getUint16(ct + 6 + i * 8), off = ct + dv.getUint32(ct + 8 + i * 8), fmt = dv.getUint16(off);
      const score = pid === 3 && eid === 10 && fmt === 12 ? 4 : pid === 0 && fmt === 12 ? 3 : pid === 3 && eid === 1 && fmt === 4 ? 2 : pid === 0 && fmt === 4 ? 1 : 0;
      if (score && (!best || score > best.score)) best = { score, off, fmt };
    }
    if (!best) return null;
    const cache = new Map();
    const gidOf = (cp) => {
      if (cache.has(cp)) return cache.get(cp);
      let g = 0;
      if (best.fmt === 12) {
        let lo = 0, hi = dv.getUint32(best.off + 12) - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, o = best.off + 16 + mid * 12, s = dv.getUint32(o), e = dv.getUint32(o + 4);
          if (cp < s) hi = mid - 1; else if (cp > e) lo = mid + 1; else { g = dv.getUint32(o + 8) + (cp - s); break; }
        }
      } else if (cp < 0x10000) {
        const sc = dv.getUint16(best.off + 6) / 2, endO = best.off + 14, startO = endO + 2 * sc + 2, deltaO = startO + 2 * sc, rangeO = deltaO + 2 * sc;
        for (let k = 0; k < sc; k++) {
          if (cp <= dv.getUint16(endO + 2 * k)) {
            const st = dv.getUint16(startO + 2 * k);
            if (cp >= st) {
              const ro = dv.getUint16(rangeO + 2 * k), d = dv.getInt16(deltaO + 2 * k);
              if (ro === 0) g = (cp + d) & 0xffff;
              else { const gi = dv.getUint16(rangeO + 2 * k + ro + 2 * (cp - st)); g = gi ? (gi + d) & 0xffff : 0; }
            }
            break;
          }
        }
      }
      cache.set(cp, g);
      return g;
    };
    const k = 1000 / upm, h = T.head.off, hh = T.hhea.off, post = T.post ? T.post.off : 0;
    return {
      buf, upm, adv, gidOf, name,
      bbox: [dv.getInt16(h + 36) * k, dv.getInt16(h + 38) * k, dv.getInt16(h + 40) * k, dv.getInt16(h + 42) * k].map(Math.round),
      ascent: Math.round(dv.getInt16(hh + 4) * k), descent: Math.round(dv.getInt16(hh + 6) * k),
      capHeight: os2 && os2.len >= 96 && dv.getUint16(os2.off) >= 2 ? Math.round(dv.getInt16(os2.off + 88) * k) : Math.round(dv.getInt16(hh + 4) * k * 0.72),
      italicAngle: post ? dv.getInt32(post + 4) / 65536 : 0, fixed: post ? dv.getUint32(post + 12) !== 0 : false,
      used: new Map(),
    };
  }
  const ttfWidth = (ttf, text, size) => { let w = 0; for (const ch of text) w += ttf.adv(ttf.gidOf(ch.codePointAt(0))); return (w / ttf.upm) * size; };
  async function deflateBytes(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function modelFamilies(model, out) {
    (model || []).forEach((b) => {
      if (b.runs) b.runs.forEach((r) => { if (r.font) out.add(r.font); });
      if (b.rows) b.rows.forEach((row) => row.forEach((cell) => modelFamilies(cell, out)));
    });
    return out;
  }
  async function buildFontProvider(list, model) {
    const fams = modelFamilies(model, new Set(["Arial", "Courier New"]));
    const flags = (fd) => {
      const s = (fd.style || "").toLowerCase();
      return { b: /\bbold\b/.test(s) && !/semi|demi/.test(s), i: /italic|oblique/.test(s), odd: /light|thin|cond|narrow|semi|demi|black|heavy|medium|extra|ultra|book|display|caption/.test(s.replace(/\bbold\b/, "")) };
    };
    const variants = new Map(), loaded = new Map();
    for (const fam of fams) {
      const cands = list.filter((f) => (f.family || "").toLowerCase() === fam.toLowerCase());
      const v = {};
      for (const [b, i] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const fd = cands.filter((f) => { const x = flags(f); return !x.odd && (x.b ? 1 : 0) === b && (x.i ? 1 : 0) === i; })[0];
        if (!fd) continue;
        if (!loaded.has(fd.postscriptName)) {
          loaded.set(fd.postscriptName, (async () => { try { return parseTtf(await (await fd.blob()).arrayBuffer(), fd.postscriptName || fd.fullName || fam); } catch (e) { return null; } })());
        }
        const ttf = await loaded.get(fd.postscriptName);
        if (ttf) v["" + b + i] = ttf;
      }
      if (Object.keys(v).length) variants.set(fam.toLowerCase(), v);
    }
    if (!variants.size) return null;
    return {
      pick(family, b, i) {
        const v = variants.get((family || "").toLowerCase());
        if (!v) return null;
        for (const [wb, wi] of [[b, i], [b, 0], [0, i], [0, 0]]) {
          const ttf = v["" + (wb ? 1 : 0) + (wi ? 1 : 0)];
          if (ttf) return { ttf, synB: !!b && !wb, synI: !!i && !wi };
        }
        const any = Object.values(v)[0];
        return any ? { ttf: any, synB: !!b, synI: !!i } : null;
      },
    };
  }
  function embeddedFontObjects(ent, firstNum) {
    // 5 objects: Type0 font, CID font, descriptor, font file, ToUnicode
    const ttf = ent.ttf, ps = (ttf.name || "Font").replace(/[^A-Za-z0-9_-]/g, "") || "Font";
    const gids = Array.from(ttf.used.keys()).sort((a, b) => a - b);
    const w = gids.map((g) => g + " [" + Math.round((ttf.adv(g) * 1000) / ttf.upm) + "]").join(" ");
    const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, "0");
    const utf16 = (cp) => (cp > 0xffff ? hex4(0xd800 + ((cp - 0x10000) >> 10)) + hex4(0xdc00 + ((cp - 0x10000) & 0x3ff)) : hex4(cp));
    let bf = "";
    for (let i = 0; i < gids.length; i += 100) {
      const chunk = gids.slice(i, i + 100);
      bf += chunk.length + " beginbfchar\n" + chunk.map((g) => "<" + hex4(g) + "> <" + utf16(ttf.used.get(g)) + ">").join("\n") + "\nendbfchar\n";
    }
    const cmap = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n" + bf + "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
    const flagsN = 32 + (ttf.italicAngle ? 64 : 0) + (ttf.fixed ? 1 : 0);
    return [
      { dict: "<< /Type /Font /Subtype /Type0 /BaseFont /" + ps + " /Encoding /Identity-H /DescendantFonts [" + (firstNum + 1) + " 0 R] /ToUnicode " + (firstNum + 4) + " 0 R >>" },
      { dict: "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /" + ps + " /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor " + (firstNum + 2) + " 0 R /DW 1000 /W [" + w + "] /CIDToGIDMap /Identity >>" },
      { dict: "<< /Type /FontDescriptor /FontName /" + ps + " /Flags " + flagsN + " /FontBBox [" + ttf.bbox.join(" ") + "] /ItalicAngle " + ttf.italicAngle.toFixed(2) + " /Ascent " + ttf.ascent + " /Descent " + ttf.descent + " /CapHeight " + ttf.capHeight + " /StemV 80 /FontFile2 " + (firstNum + 3) + " 0 R >>" },
      { stream: null, fontFile: ttf },        // compressed by the caller
      { stream: new TextEncoder().encode(cmap) },
    ];
  }

  async function buildPdf(fontProvider) {
    const model = exportModel();
    const ps = pageSetup();
    const pageW = ps.w / 20, pageH = ps.h / 20;
    const marginTop = ps.top / 20, marginBottom = ps.bottom / 20, marginLeft = ps.left / 20, marginRight = ps.right / 20;
    const usableW = pageW - marginLeft - marginRight;

    const pages = [];                 // finished pages: { content: [], annots: [] }
    let content = [], annots = [];
    let y = pageH - marginTop;
    const anchors = new Map();        // bookmark / heading id -> { page, y }

    // ---- fonts: embedded (when available) or the standard PDF fonts
    const embUsed = new Map(), foCache = new Map();
    function fontFor(family, b, i, mono) {
      const key = (family || "") + "|" + (b ? 1 : 0) + (i ? 1 : 0) + (mono ? 1 : 0);
      let fo = foCache.get(key);
      if (fo) return fo;
      const sel = fontProvider ? fontProvider.pick(family || "Arial", b, i) : null;
      if (sel) {
        let ent = embUsed.get(sel.ttf);
        if (!ent) { ent = { id: "E" + (embUsed.size + 1), ttf: sel.ttf }; embUsed.set(sel.ttf, ent); }
        fo = { kind: "emb", id: ent.id, ttf: sel.ttf, synB: sel.synB, synI: sel.synI };
      } else fo = { kind: "std", b: !!b, mono: !!mono, name: pdfFontName(b, !!i, mono) };
      foCache.set(key, fo);
      return fo;
    }
    const foWidth = (fo, text, size) => (fo.kind === "emb" ? ttfWidth(fo.ttf, text, size) : textWidth(text, size, fo.mono, fo.b));
    // PDF operators that show `text` at (x, y); returns the lines to append to the page content
    function showText(fo, text, size, x, y, col) {
      const out = ["BT"];
      if (fo.kind === "emb") {
        let hex = "";
        for (const ch of text) {
          const cp = ch.codePointAt(0), g = fo.ttf.gidOf(cp);
          if (g) fo.ttf.used.set(g, cp);
          hex += g.toString(16).toUpperCase().padStart(4, "0");
        }
        out.push("/" + fo.id + " " + size + " Tf", col + " rg");
        if (fo.synB) out.push("2 Tr " + col + " RG " + (size * 0.03).toFixed(2) + " w");
        out.push(fo.synI ? "1 0 0.2 1 " + x.toFixed(2) + " " + y.toFixed(2) + " Tm" : x.toFixed(2) + " " + y.toFixed(2) + " Td", "<" + hex + "> Tj");
        if (fo.synB) out.push("0 Tr");
      } else {
        out.push("/" + fo.name + " " + size + " Tf", col + " rg", x.toFixed(2) + " " + y.toFixed(2) + " Td", "(" + pdfEscape(text) + ") Tj");
      }
      out.push("ET");
      return out;
    }
    const newPage = () => { pages.push({ content, annots }); content = []; annots = []; y = pageH - marginTop; };
    const ensureSpace = (h) => { if (y - h < marginBottom) newPage(); };

    // ---- text -> styled tokens (words and spaces), then wrapped into lines
    const isMono = (p, r) => !!(p && p.code) || /courier|mono|consolas/i.test((r && r.font) || "");
    function tokenize(runs, p, baseSize) {
      const tokens = [];
      for (const r of runs) {
        if (r.br) { tokens.push({ br: true }); continue; }
        if (r.anchor) { tokens.push({ anchor: r.anchor, text: "", w: 0, size: baseSize }); continue; }
        const mono = isMono(p, r);
        const fam = p && p.code && !/courier|mono|consolas/i.test(r.font || "") ? "Courier New" : (r.font || "Arial");
        const st = { b: !!r.b, i: !!r.i, u: !!r.u, s: !!r.s, color: r.color || "", bg: r.bg || "", link: r.link || "", size: r.size || baseSize, mono, fo: fontFor(fam, !!r.b, !!r.i, mono) };
        const parts = (r.text || "").split(" ");
        parts.forEach((word, i) => {
          if (i > 0) tokens.push({ ...st, text: " ", w: foWidth(st.fo, " ", st.size) });
          if (word) tokens.push({ ...st, text: word, w: foWidth(st.fo, word, st.size) });
        });
      }
      return tokens;
    }
    function wrapTokens(tokens, width, firstExtra) {
      const lines = [];
      let line = [], lw = 0, first = true;
      for (const t of tokens) {
        if (t.br) { lines.push(line); line = []; lw = 0; first = false; continue; }
        const avail = width - (first ? firstExtra || 0 : 0);
        if (lw + t.w > avail && line.length && t.text !== " ") { lines.push(line); line = []; lw = 0; first = false; }
        if (!line.length && t.text === " " && lines.length) continue;   // no leading space on wrapped lines
        line.push(t); lw += t.w;
      }
      if (line.length) lines.push(line);
      return lines;
    }
    const sameStyle = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.color === b.color && a.bg === b.bg && a.link === b.link && a.size === b.size && a.fo === b.fo;
    function mergeTokens(line) {
      const segs = [];
      for (const t of line) {
        if (t.anchor) { segs.push(t); continue; }
        const last = segs[segs.length - 1];
        if (last && !last.anchor && sameStyle(last, t)) { last.text += t.text; last.w += t.w; }
        else segs.push({ ...t });
      }
      return segs;
    }
    // Draws one line of tokens starting at x (baseline y). Underline, strike-through, highlight and link areas included.
    function drawLine(line, x, yy) {
      for (const sg of mergeTokens(line)) {
        if (sg.anchor) { anchors.set(sg.anchor, { page: pages.length, y: yy + sg.size }); continue; }
        if (!sg.text) continue;
        const col = sg.link ? pdfColor("1155CC") : (sg.color ? pdfColor(sg.color) : "0 0 0");
        if (sg.bg) content.push(pdfColor(sg.bg) + " rg " + x.toFixed(2) + " " + (yy - sg.size * 0.22).toFixed(2) + " " + sg.w.toFixed(2) + " " + (sg.size * 1.15).toFixed(2) + " re f");
        content.push(...showText(sg.fo, sg.text, sg.size, x, yy, col));
        if (sg.u || sg.link) content.push(col + " RG 0.6 w " + x.toFixed(2) + " " + (yy - 1.6).toFixed(2) + " m " + (x + sg.w).toFixed(2) + " " + (yy - 1.6).toFixed(2) + " l S");
        if (sg.s) content.push(col + " RG 0.6 w " + x.toFixed(2) + " " + (yy + sg.size * 0.3).toFixed(2) + " m " + (x + sg.w).toFixed(2) + " " + (yy + sg.size * 0.3).toFixed(2) + " l S");
        if (sg.link) annots.push({ rect: [x, yy - sg.size * 0.22, x + sg.w, yy + sg.size * 0.9], link: sg.link });
        x += sg.w;
      }
    }
    const lineSize = (line) => line.reduce((m, t) => Math.max(m, t.size || 0), 0) || 13;
    const lineWidth = (line) => line.reduce((s, t) => s + (t.w || 0), 0);

    function drawParagraph(p) {
      const baseSize = 13;
      const level = p.list ? p.list.level + 1 : 0;
      const indent = (p.indent || 0) * 0.75 + (p.quote ? 18 : 0);
      const firstIndent = (p.firstLine || 0) * 0.75;
      const hang = p.list ? 18 : 0;
      const left = marginLeft + indent + level * 20;
      const availW = usableW - indent - level * 20 - (p.quote ? 6 : 0);
      let tokens = tokenize(p.runs || [], p, baseSize);
      if (p.list) {
        const marker = p.list.ordered ? p.list.index + "." : "\u2022";
        tokens.unshift({ text: marker, w: foWidth(fontFor("Arial", false, false, false), marker, baseSize), size: baseSize, b: false, i: false, u: false, s: false, color: "", bg: "", link: "", mono: false, marker: true, fo: fontFor("Arial", false, false, false) });
      }
      (p.anchors || []).forEach((id) => tokens.unshift({ anchor: id, text: "", w: 0, size: baseSize }));
      const lines = wrapTokens(tokens, availW + hang, 0);
      if (!lines.length) lines.push([]);
      lines.forEach((ln, li) => {
        const size = lineSize(ln);
        const lh = size * (p.line || 1.2) + 3;
        ensureSpace(lh);
        let x = left - (li === 0 ? hang : 0) + (li === 0 ? firstIndent : 0);
        // list items: marker hangs in the margin, text lines up under it
        if (p.list && li > 0) x = left;
        const w = lineWidth(ln);
        if (p.align === "center") x = left + (availW - w) / 2;
        else if (p.align === "right") x = left + availW - w;
        const base = y - size;
        if (p.code) content.push("0.953 0.953 0.953 rg " + (left - 4).toFixed(2) + " " + (y - lh).toFixed(2) + " " + (availW + 8).toFixed(2) + " " + lh.toFixed(2) + " re f");
        if (p.quote) content.push("0.6 0.6 0.6 RG 1.5 w " + (marginLeft + indent - 8).toFixed(2) + " " + (y - lh).toFixed(2) + " m " + (marginLeft + indent - 8).toFixed(2) + " " + y.toFixed(2) + " l S");
        drawLine(ln, x, base);
        y -= lh;
      });
      y -= 4;
    }

    function drawTable(t) {
      const colW = usableW / t.cols;
      for (const row of t.rows) {
        const cells = row.map((cellModel) => {
          const lines = [];
          for (const cp of cellModel) {
            if (cp.type !== "p") continue;
            const toks = tokenize(cp.runs || [], cp, 12);
            const ls = wrapTokens(toks, colW - 10, 0);
            (ls.length ? ls : [[]]).forEach((l) => lines.push(l));
          }
          return lines;
        });
        while (cells.length < t.cols) cells.push([]);
        const heights = cells.map((ls) => ls.reduce((h, l) => h + lineSize(l) * 1.2 + 4, 0));
        const rowH = Math.max(18, ...heights) + 6;
        ensureSpace(rowH);
        const top = y;
        content.push("0.5 w 0.6 0.6 0.6 RG");
        for (let ci = 0; ci <= t.cols; ci++) {
          const x = marginLeft + ci * colW;
          content.push(x.toFixed(2) + " " + top.toFixed(2) + " m " + x.toFixed(2) + " " + (top - rowH).toFixed(2) + " l S");
        }
        content.push(marginLeft + " " + top.toFixed(2) + " m " + (marginLeft + usableW) + " " + top.toFixed(2) + " l S");
        content.push(marginLeft + " " + (top - rowH).toFixed(2) + " m " + (marginLeft + usableW) + " " + (top - rowH).toFixed(2) + " l S");
        cells.forEach((ls, ci) => {
          let ty = top - 4;
          ls.forEach((l) => {
            const size = lineSize(l);
            drawLine(l, marginLeft + ci * colW + 5, ty - size);
            ty -= size * 1.2 + 4;
          });
        });
        y = top - rowH;
      }
      y -= 8;
    }

    for (const p of model) {
      if (p.type === "hr") {
        ensureSpace(14);
        y -= 7;
        content.push("0.6 0.6 0.6 RG 0.75 w " + marginLeft + " " + y.toFixed(2) + " m " + (marginLeft + usableW) + " " + y.toFixed(2) + " l S");
        y -= 7;
      } else if (p.type === "table") drawTable(p);
      else drawParagraph(p);
    }
    pages.push({ content, annots });

    // ---- header, footer and page numbers on every page
    {
      const L = docLayout();
      const zones = [["top", hfSegments("top"), pageH - marginTop / 2 + 3], ["bottom", hfSegments("bottom"), marginBottom / 2 - 3]];
      pages.forEach((pg, idx) => {
        if (L.skipFirst && idx === 0) return;
        zones.forEach(([, segs, base]) => {
          if (hfEmpty(segs)) return;
          ["l", "c", "r"].forEach((z) => {
            const txt = hfText(segs[z], idx + 1, pages.length);
            if (!txt) return;
            const size = 9, fo = fontFor("Arial", false, false, false), w = foWidth(fo, txt, size);
            const x = z === "l" ? marginLeft : z === "r" ? marginLeft + usableW - w : marginLeft + (usableW - w) / 2;
            pg.content.push(...showText(fo, txt, size, x, base, "0.35 0.35 0.35"));
          });
        });
      });
    }

    // ---- assemble the file
    const enc = new TextEncoder();
    const N = pages.length;
    const FONTS = [["Helvetica", "F1"], ["Helvetica-Bold", "F2"], ["Helvetica-Oblique", "F3"], ["Helvetica-BoldOblique", "F4"], ["Courier", "F5"], ["Courier-Bold", "F6"], ["Courier-Oblique", "F7"], ["Courier-BoldOblique", "F8"]];
    const fontObj = (i) => 3 + N + i;                 // font objects follow the page objects
    const contentObj = (i) => 3 + N + FONTS.length + i;
    let nextObj = 3 + N + FONTS.length + N;           // annotation objects follow the content streams
    const annotObjs = [];                             // { dict }
    const pageAnnotRefs = pages.map((pg) => {
      const refs = [];
      pg.annots.forEach((a) => {
        let action;
        if (a.link.charAt(0) === "#") {
          const dest = anchors.get(a.link.slice(1));
          if (!dest) return;
          action = "/Dest [" + (3 + dest.page) + " 0 R /XYZ 0 " + Math.min(pageH, dest.y + 8).toFixed(2) + " null]";
        } else {
          action = "/A << /S /URI /URI (" + pdfEscape(encodeURI(a.link)) + ") >>";
        }
        annotObjs.push("<< /Type /Annot /Subtype /Link /Rect [" + a.rect.map((n) => n.toFixed(2)).join(" ") + "] /Border [0 0 0] " + action + " >>");
        refs.push(nextObj++ + " 0 R");
      });
      return refs;
    });

    const embList = Array.from(embUsed.values());      // embedded fonts: 5 objects each, after the annotations
    const embBase = nextObj;
    const objs = [];                                  // { dict, stream? } in object-number order
    objs.push({ dict: "<< /Type /Catalog /Pages 2 0 R >>" });
    objs.push({ dict: "<< /Type /Pages /Kids [" + pages.map((_, i) => (3 + i) + " 0 R").join(" ") + "] /Count " + N + " >>" });
    const fontRes = FONTS.map(([, nm], i) => "/" + nm + " " + fontObj(i) + " 0 R").join(" ") +
      embList.map((e, k) => " /" + e.id + " " + (embBase + 5 * k) + " 0 R").join("");
    pages.forEach((_, i) => {
      const an = pageAnnotRefs[i].length ? " /Annots [" + pageAnnotRefs[i].join(" ") + "]" : "";
      objs.push({ dict: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageW + " " + pageH + "] /Resources << /Font << " + fontRes + " >> >> /Contents " + contentObj(i) + " 0 R" + an + " >>" });
    });
    FONTS.forEach(([base]) => objs.push({ dict: "<< /Type /Font /Subtype /Type1 /BaseFont /" + base + " /Encoding /WinAnsiEncoding >>" }));
    pages.forEach((pg) => objs.push({ stream: pdfBytes(pg.content.join("\n")) }));
    annotObjs.forEach((d) => objs.push({ dict: d }));
    for (let k = 0; k < embList.length; k++) {
      const parts5 = embeddedFontObjects(embList[k], embBase + 5 * k);
      const ff = parts5.find((o) => o.fontFile);
      const comp = await deflateBytes(new Uint8Array(ff.fontFile.buf));
      ff.stream = comp; ff.extra = " /Filter /FlateDecode /Length1 " + ff.fontFile.buf.byteLength;
      parts5.forEach((o) => objs.push(o));
    }

    const header = enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const parts = [header];
    const offsets = [];
    let offset = header.length;
    objs.forEach((o, i) => {
      offsets.push(offset);
      if (o.stream) {
        const head = enc.encode((i + 1) + " 0 obj\n<< /Length " + o.stream.length + (o.extra || "") + " >>\nstream\n");
        const tail = enc.encode("\nendstream\nendobj\n");
        parts.push(head, o.stream, tail);
        offset += head.length + o.stream.length + tail.length;
      } else {
        const body = enc.encode((i + 1) + " 0 obj\n" + o.dict + "\nendobj\n");
        parts.push(body);
        offset += body.length;
      }
    });
    const xref = enc.encode("xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join(""));
    const trailer = enc.encode("trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + offset + "\n%%EOF\n");
    return new Blob([...parts, xref, trailer], { type: "application/pdf" });
  }

  async function doExportPdf() {
    if (!hasOpenDoc()) return;
    try {
      const lf = await localFontList();      // first await: the permission prompt needs the click that started the export
      let provider = null;
      if (lf.list) { try { provider = await buildFontProvider(lf.list, exportModel()); } catch (e) { provider = null; } }
      let blob;
      try { blob = await buildPdf(provider); }
      catch (e) { if (!provider) throw e; blob = await buildPdf(null); provider = null; }   // embedding failed: standard fonts
      downloadBlob(blob, exportName("pdf"));
      if (provider) showToast("Exported as PDF with embedded fonts");
      else if (lf.reason === "unsupported") showToast("Exported as PDF with standard fonts (font embedding needs Chrome or Edge)");
      else if (lf.reason === "denied") showToast("Exported as PDF with standard fonts: allow access to local fonts to embed yours");
      else showToast("Exported as PDF (your fonts were not found on this computer: standard fonts used)");
    } catch (e) {
      showToast("PDF export failed");
    }
  }

  // ---- Docly backup (.json): everything needed to restore the document
  function buildBackup(d, html) {
    return {
      app: "docly",
      version: 1,
      title: d.title || "",
      tags: d.tags || [],
      favorite: !!d.favorite,
      collection: d.collection || "",
      layout: d.layout || {},
      content: html,
      page: JSON.parse(LS.get("docly-page", "{}")),
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
      exportedAt: new Date().toISOString(),
    };
  }
  function downloadBackup(data) {
    const base = (data.title || "document").replace(/[\\/:*?"<>|]+/g, "_").trim() || "document";
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), base + "_Docly.json");
  }
  function doExportJson() {
    if (!hasOpenDoc()) return;
    downloadBackup(buildBackup(state.currentDoc, contentHtml()));
    showToast("Exported as backup (JSON)");
  }
  // Exports any document by id (used before deleting). The open document is exported from the editor so unsaved edits are included.
  async function exportDocumentJson(id) {
    if (state.currentId === id && state.currentDoc) {
      downloadBackup(buildBackup(state.currentDoc, contentHtml()));
    } else {
      const d = await api("/api/documents/" + encodeURIComponent(id));
      downloadBackup(buildBackup(d, d.content || ""));
    }
    showToast("Backup (JSON) downloaded");
  }

  /* ---------------- Import: Word (.docx), Markdown, text, HTML, Docly JSON, ZIP ---------------- */
  const IMPORT_EXT = /\.(json|docx|md|markdown|txt|html?|zip)$/i;

  // --- minimal ZIP reader (central directory + DecompressionStream for "deflate")
  async function readZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("not a valid ZIP file");
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      entries.set(name, { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), lho: dv.getUint32(p + 42, true) });
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: Array.from(entries.keys()),
      async read(name) {
        const en = entries.get(name);
        if (!en) return null;
        const start = en.lho + 30 + dv.getUint16(en.lho + 26, true) + dv.getUint16(en.lho + 28, true);
        const raw = u8.subarray(start, start + en.csize);
        if (en.method === 0) return raw;
        if (en.method !== 8) throw new Error("unsupported ZIP compression");
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      },
    };
  }

  // --- plain text
  function textToHtml(text) {
    const out = [];
    let blank = false;
    text.replace(/\r\n?/g, "\n").split("\n").forEach((l) => {
      if (!l.trim()) { if (!blank && out.length) out.push("<p><br></p>"); blank = true; }
      else { out.push("<p>" + escapeHtml(l.replace(/\t/g, "    ")) + "</p>"); blank = false; }
    });
    return out.join("") || "<p><br></p>";
  }

  // --- Markdown
  function mdInline(src) {
    const codes = [];
    let t = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    t = escapeHtml(t);
    t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");                                   // images are not supported: keep the alt text
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, txt, url) => /^\s*javascript:/i.test(url) ? txt : '<a href="' + url + '">' + txt + "</a>");
    t = t.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<a href="$1">$1</a>');
    t = t.replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, "$1<i>$2</i>").replace(/(^|[^_\w])_([^_\s][^_]*)_(?![_\w])/g, "$1<i>$2</i>")
      .replace(/~~([^~]+)~~/g, "<s>$1</s>");
    t = t.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => "<code>" + escapeHtml(codes[+i]) + "</code>");
  }
  function markdownToHtml(md) {
    const lines = md.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split("\n");
    const out = [];
    let i = 0;
    const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || "");
    const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const itemRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = line.match(/^\s*(```|~~~)/))) {                                  // fenced code
        const fence = m[1]; const code = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
        i++; out.push("<pre>" + escapeHtml(code.join("\n")) + "</pre>"); continue;
      }
      if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) { out.push("<h" + m[1].length + ">" + mdInline(m[2]) + "</h" + m[1].length + ">"); i++; continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
      if (/^\s*>/.test(line)) {
        const q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push("<blockquote>" + markdownToHtml(q.join("\n")) + "</blockquote>"); continue;
      }
      if (line.includes("|") && isTableSep(lines[i + 1])) {
        const head = cells(line); i += 2; const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
        out.push("<table><tbody><tr>" + head.map((c) => "<td><b>" + mdInline(c) + "</b></td>").join("") + "</tr>" +
          rows.map((r) => "<tr>" + head.map((_, k) => "<td>" + mdInline(r[k] || "") + "</td>").join("") + "</tr>").join("") + "</tbody></table>");
        continue;
      }
      if (itemRe.test(line)) {                                                   // lists (nested by indentation)
        const stack = []; let html = "", task = false, first = true;
        const close = (n) => { while (stack.length > n) { html += "</li></" + stack.pop().tag + ">"; } };
        while (i < lines.length && (itemRe.test(lines[i]) || (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && stack.length))) {
          const im = lines[i].match(itemRe);
          if (!im) { html += " " + mdInline(lines[i].trim()); i++; continue; }
          const indent = im[1].replace(/\t/g, "    ").length, tag = /\d/.test(im[2]) ? "ol" : "ul";
          let body = im[3], done = null;
          const tk = body.match(/^\[([ xX])\]\s+(.*)$/);
          if (tk) { done = tk[1] !== " "; body = tk[2]; if (first) task = true; }
          first = false;
          while (stack.length && stack[stack.length - 1].indent > indent) close(stack.length - 1);
          if (stack.length && stack[stack.length - 1].indent === indent) {
            if (stack[stack.length - 1].tag !== tag) { close(stack.length - 1); html += "<" + tag + "><li" + (done ? ' class="done"' : "") + ">"; stack.push({ tag, indent }); }
            else html += "</li><li" + (done ? ' class="done"' : "") + ">";
          } else { html += "<" + tag + "><li" + (done ? ' class="done"' : "") + ">"; stack.push({ tag, indent }); }
          html += mdInline(body); i++;
        }
        close(0);
        out.push(task ? html.replace(/^<ul>/, '<ul class="checklist">') : html); continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s{0,3}(#{1,6}\s|```|~~~|>)/.test(lines[i]) && !itemRe.test(lines[i]) && !/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(lines[i]) && !(lines[i].includes("|") && isTableSep(lines[i + 1]))) para.push(lines[i++]);
      out.push("<p>" + para.map((l, k) => mdInline(l.trim()) + (/ {2,}$/.test(l) && k < para.length - 1 ? "<br>" : "")).join(" ").replace(/<br> /g, "<br>") + "</p>");
    }
    return out.join("") || "<p><br></p>";
  }

  // --- HTML: keep structure and basic formatting, drop scripts, images, classes and fonts
  function htmlToDoc(html) {
    const d = new DOMParser().parseFromString(html, "text/html");
    const title = (d.title || "").trim();
    d.querySelectorAll("script,style,img,picture,svg,video,audio,canvas,iframe,object,embed,meta,link,title,noscript,form,input,button,select,textarea,nav,header,footer").forEach((n) => n.remove());
    const KEEP = new Set(["color", "background-color", "font-weight", "font-style", "text-decoration", "text-align", "font-size"]);
    d.body.querySelectorAll("*").forEach((n) => {
      Array.from(n.attributes).forEach((a) => {
        const nm = a.name.toLowerCase();
        if (nm === "href") { if (/^\s*javascript:/i.test(a.value)) n.removeAttribute(nm); }
        else if (nm === "colspan" || nm === "rowspan" || nm === "id") { /* keep */ }
        else if (nm === "style") {
          const keep = [];
          for (let k = 0; k < n.style.length; k++) { const prop = n.style[k]; if (KEEP.has(prop)) keep.push(prop + ":" + n.style.getPropertyValue(prop)); }
          if (keep.length) n.setAttribute("style", keep.join(";")); else n.removeAttribute("style");
        } else if (nm === "class" && /^(page-break|checklist|done|doc-title|doc-subtitle)$/.test(a.value)) { /* keep */ }
        else n.removeAttribute(nm);
      });
    });
    // loose text / inline content directly in <body> gets its own paragraph
    const blockish = /^(P|DIV|H[1-6]|UL|OL|TABLE|HR|PRE|BLOCKQUOTE|SECTION|ARTICLE|MAIN|ASIDE|FIGURE|DL|ADDRESS|DETAILS)$/;
    let run = [];
    const flush = () => { if (run.length && !run.every((n) => n.nodeType === 3 && !n.nodeValue.trim())) { const p = d.createElement("p"); run[0].parentNode.insertBefore(p, run[0]); run.forEach((n) => p.appendChild(n)); } run = []; };
    Array.from(d.body.childNodes).forEach((n) => { if (n.nodeType === 1 && blockish.test(n.tagName)) flush(); else run.push(n); });
    flush();
    return { title, content: d.body.innerHTML.trim() || "<p><br></p>" };
  }

  // --- Word (.docx)
  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const HILITE = { yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000", darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000" };
  async function docxToHtml(buf) {
    const zip = await readZip(buf);
    const readText = async (n) => { const x = await zip.read(n); return x ? new TextDecoder().decode(x) : ""; };
    const xml = (s) => new DOMParser().parseFromString(s, "application/xml");
    const mainSrc = await readText("word/document.xml");
    if (!mainSrc) throw new Error("not a Word document");
    const main = xml(mainSrc);
    const ch = (n, name) => (n ? Array.from(n.childNodes).filter((c) => c.nodeType === 1 && c.localName === name) : []);
    const at = (n, name) => (n ? n.getAttributeNS(W_NS, name) || n.getAttribute("w:" + name) || "" : "");
    const onoff = (pr, name) => { const e = ch(pr, name)[0]; if (!e) return false; const v = at(e, "val"); return !(v === "0" || v === "false" || v === "off"); };

    // relationships (links), styles (headings) and numbering (bullet / numbered)
    const links = {};
    Array.from(xml(await readText("word/_rels/document.xml.rels")).getElementsByTagName("Relationship")).forEach((r) => { links[r.getAttribute("Id")] = r.getAttribute("Target"); });
    const styles = {};
    Array.from(xml(await readText("word/styles.xml")).getElementsByTagNameNS(W_NS, "style")).forEach((st) => {
      const nm = ch(st, "name")[0], bo = ch(st, "basedOn")[0];
      const sp = ch(st, "pPr")[0], snp = sp && ch(sp, "numPr")[0];
      const sid = snp ? at(ch(snp, "numId")[0], "val") : "";
      styles[at(st, "styleId")] = { name: (nm ? at(nm, "val") : "").toLowerCase(), base: bo ? at(bo, "val") : "", num: sid && sid !== "0" ? sid : "", lvl: snp ? +at(ch(snp, "ilvl")[0], "val") || 0 : 0 };
    });
    const numXml = xml(await readText("word/numbering.xml"));
    const abstractFmt = {}, numToAbstract = {};
    Array.from(numXml.getElementsByTagNameNS(W_NS, "abstractNum")).forEach((a) => {
      const f = {}; ch(a, "lvl").forEach((l) => { const nf = ch(l, "numFmt")[0]; f[at(l, "ilvl")] = nf ? at(nf, "val") : "decimal"; });
      abstractFmt[at(a, "abstractNumId")] = f;
    });
    Array.from(numXml.getElementsByTagNameNS(W_NS, "num")).forEach((n) => { const a = ch(n, "abstractNumId")[0]; if (a) numToAbstract[at(n, "numId")] = at(a, "val"); });
    const listTag = (numId, lvl) => { const f = (abstractFmt[numToAbstract[numId]] || {})[lvl] || "decimal"; return f === "bullet" || f === "none" ? "ul" : "ol"; };
    const styleKind = (id) => {
      for (let k = 0; id && k < 6; k++) {
        const st = styles[id]; if (!st) break;
        let m = st.name.match(/^heading\s*([1-6])$/); if (m) return "h" + m[1];
        if (st.name === "title") return "title"; if (st.name === "subtitle") return "subtitle";
        if (/^(quote|intense quote)$/.test(st.name)) return "quote";
        id = st.base;
      }
      const m = /^Heading([1-6])$/.exec(id || ""); return m ? "h" + m[1] : "";
    };
    const knownFonts = new Set(Array.from(el("fontFamilySelect").options).map((o) => o.value.toLowerCase()));

    const runHtml = (r) => {
      const pr = ch(r, "rPr")[0];
      const css = [];
      let b = false, i = false, u = false, s = false, sup = false, sub = false;
      if (pr) {
        b = onoff(pr, "b"); i = onoff(pr, "i"); s = onoff(pr, "strike") || onoff(pr, "dstrike");
        const ue = ch(pr, "u")[0]; u = !!ue && at(ue, "val") !== "none";
        const va = at(ch(pr, "vertAlign")[0], "val"); sup = va === "superscript"; sub = va === "subscript";
        const col = at(ch(pr, "color")[0], "val"); if (/^[0-9a-f]{6}$/i.test(col) && col !== "000000") css.push("color:#" + col);
        const sz = at(ch(pr, "sz")[0], "val"); if (/^\d+$/.test(sz)) css.push("font-size:" + (+sz / 2) + "pt");
        const fn = at(ch(pr, "rFonts")[0], "ascii"); if (fn && knownFonts.has(fn.toLowerCase())) css.push("font-family:" + cssFontName(fn));
        const hl = at(ch(pr, "highlight")[0], "val"); if (HILITE[hl]) css.push("background-color:" + HILITE[hl]);
        const shd = at(ch(pr, "shd")[0], "fill"); if (/^[0-9a-f]{6}$/i.test(shd)) css.push("background-color:#" + shd);
        if (onoff(pr, "smallCaps")) css.push("font-variant:small-caps");
        if (onoff(pr, "caps")) css.push("text-transform:uppercase");
      }
      let inner = "", pageBreak = false;
      Array.from(r.childNodes).forEach((c) => {
        if (c.nodeType !== 1) return;
        switch (c.localName) {
          case "t": inner += escapeHtml(c.textContent); break;
          case "tab": inner += "\u00a0\u00a0\u00a0\u00a0"; break;
          case "br": if (at(c, "type") === "page") pageBreak = true; else inner += "<br>"; break;
          case "cr": inner += "<br>"; break;
          case "noBreakHyphen": inner += "-"; break;
          case "softHyphen": break;
          default: break;
        }
      });
      if (!inner) return { html: "", pageBreak };
      if (sub) inner = "<sub>" + inner + "</sub>"; if (sup) inner = "<sup>" + inner + "</sup>";
      if (s) inner = "<s>" + inner + "</s>"; if (u) inner = "<u>" + inner + "</u>";
      if (i) inner = "<i>" + inner + "</i>"; if (b) inner = "<b>" + inner + "</b>";
      if (css.length) inner = '<span style="' + css.join(";") + '">' + inner + "</span>";
      return { html: inner, pageBreak };
    };
    const inlineOf = (node, state) => {
      let html = "";
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType !== 1) return;
        const n = c.localName;
        if (n === "r") { const x = runHtml(c); html += x.html; if (x.pageBreak) state.pageBreak = true; }
        else if (n === "hyperlink") {
          const href = links[c.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || c.getAttribute("r:id")] || (at(c, "anchor") ? "#" + at(c, "anchor") : "");
          const inner = inlineOf(c, state);
          html += href && !/^\s*javascript:/i.test(href) ? '<a href="' + escapeHtml(href) + '">' + inner + "</a>" : inner;
        } else if (n === "ins" || n === "smartTag" || n === "sdt" || n === "sdtContent" || n === "fldSimple" || n === "customXml") html += inlineOf(c, state);
      });
      return html;
    };
    const paraInfo = (p) => {
      const pr = ch(p, "pPr")[0];
      const info = { kind: "", num: null, lvl: 0, align: "", breakBefore: false };
      if (pr) {
        info.kind = styleKind(at(ch(pr, "pStyle")[0], "val"));
        const np = ch(pr, "numPr")[0];
        if (np) { const id = at(ch(np, "numId")[0], "val"); if (id && id !== "0") { info.num = id; info.lvl = +at(ch(np, "ilvl")[0], "val") || 0; } }
        else {                                   // list defined by the paragraph style (e.g. "List Bullet")
          let sid = at(ch(pr, "pStyle")[0], "val");
          for (let k = 0; sid && k < 6; k++) { const st = styles[sid]; if (!st) break; if (st.num) { info.num = st.num; info.lvl = st.lvl; break; } sid = st.base; }
        }
        const jc = at(ch(pr, "jc")[0], "val");
        info.align = { center: "center", right: "right", end: "right", both: "justify", distribute: "justify" }[jc] || "";
        info.breakBefore = onoff(pr, "pageBreakBefore");
      }
      return info;
    };

    const out = [];
    let stack = [];   // open lists: { tag, lvl }
    const closeLists = (toDepth) => { while (stack.length > toDepth) out.push("</li></" + stack.pop().tag + ">"); };
    const blockHtml = (info, inner) => {
      const al = info.align ? ' style="text-align:' + info.align + '"' : "";
      const content = inner || "<br>";
      switch (info.kind) {
        case "title": return '<p class="doc-title"' + al + ">" + content + "</p>";
        case "subtitle": return '<p class="doc-subtitle"' + al + ">" + content + "</p>";
        case "quote": return "<blockquote" + al + ">" + content + "</blockquote>";
        default: return /^h[1-6]$/.test(info.kind) ? "<" + info.kind + al + ">" + content + "</" + info.kind + ">" : "<p" + al + ">" + content + "</p>";
      }
    };
    const handlePara = (p) => {
      const info = paraInfo(p), st = { pageBreak: false };
      const inner = inlineOf(p, st);
      if (info.breakBefore) { closeLists(0); out.push('<hr class="page-break">'); }
      if (info.num) {
        const tag = listTag(info.num, String(info.lvl));
        while (stack.length && stack[stack.length - 1].lvl > info.lvl) out.push("</li></" + stack.pop().tag + ">");
        const top = stack[stack.length - 1];
        if (top && top.lvl === info.lvl && top.tag !== tag) { out.push("</li></" + stack.pop().tag + ">"); }
        const top2 = stack[stack.length - 1];
        if (top2 && top2.lvl === info.lvl) out.push("</li><li>" + inner);
        else { out.push("<" + tag + "><li>" + inner); stack.push({ tag, lvl: info.lvl }); }
      } else {
        closeLists(0);
        out.push(blockHtml(info, inner));
      }
      if (st.pageBreak) { closeLists(0); out.push('<hr class="page-break">'); }
    };
    const handleTable = (tbl) => {
      closeLists(0);
      const rows = ch(tbl, "tr"), grid = [];
      rows.forEach((tr, ri) => {
        let col = 0; grid[ri] = [];
        ch(tr, "tc").forEach((tc) => {
          const pr = ch(tc, "tcPr")[0], gs = pr && ch(pr, "gridSpan")[0], vm = pr && ch(pr, "vMerge")[0];
          const span = gs ? +at(gs, "val") || 1 : 1;
          grid[ri].push({ tc, col, span, vm: vm ? at(vm, "val") || "continue" : null, fill: pr ? at(ch(pr, "shd")[0], "fill") : "" });
          col += span;
        });
      });
      let html = "<table><tbody>";
      grid.forEach((cells, ri) => {
        html += "<tr>";
        cells.forEach((c) => {
          if (c.vm === "continue") return;
          let rowspan = 1;
          if (c.vm === "restart") for (let k = ri + 1; k < grid.length; k++) { if (grid[k].some((x) => x.col === c.col && x.vm === "continue")) rowspan++; else break; }
          const paras = ch(c.tc, "p").map((p) => inlineOf(p, { pageBreak: false })).filter((x, k, arr) => x || k < arr.length - 1);
          const attrs = (c.span > 1 ? ' colspan="' + c.span + '"' : "") + (rowspan > 1 ? ' rowspan="' + rowspan + '"' : "") + (/^[0-9a-f]{6}$/i.test(c.fill) ? ' style="background-color:#' + c.fill + '"' : "");
          html += "<td" + attrs + ">" + (paras.join("<br>") || "<br>") + "</td>";
        });
        html += "</tr>";
      });
      out.push(html + "</tbody></table>");
    };
    const walk = (node) => {
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType !== 1) return;
        if (c.localName === "p") handlePara(c);
        else if (c.localName === "tbl") handleTable(c);
        else if (c.localName === "sdt" || c.localName === "sdtContent") walk(c);
      });
    };
    walk(ch(main.documentElement, "body")[0] || main.documentElement);
    closeLists(0);
    return out.join("").replace(/(<hr class="page-break">)+$/, "") || "<p><br></p>";
  }

  // --- router
  async function createImported(fields) {
    return api("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ type: "note" }, fields)) });
  }
  async function importOne(name, getText, getBuffer) {
    const base = name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "") || "Imported document";
    const ext = (name.match(/\.([^.]+)$/) || [, ""])[1].toLowerCase();
    if (ext === "json") {
      const data = JSON.parse(await getText());
      if (!data || typeof data.content !== "string") throw new Error("not a Docly JSON file");
      if (data.page && typeof data.page === "object") LS.set("docly-page", JSON.stringify(data.page));
      return createImported({ title: data.title || base, content: data.content, tags: data.tags || [], favorite: !!data.favorite, collection: data.collection || "", layout: data.layout || {}, createdAt: data.createdAt || undefined, updatedAt: data.updatedAt || undefined });
    }
    if (ext === "docx") return createImported({ title: base, content: await docxToHtml(await getBuffer()) });
    if (ext === "md" || ext === "markdown") return createImported({ title: base, content: markdownToHtml(await getText()) });
    if (ext === "txt") return createImported({ title: base, content: textToHtml(await getText()) });
    if (ext === "html" || ext === "htm") { const h = htmlToDoc(await getText()); return createImported({ title: h.title || base, content: h.content }); }
    throw new Error("unsupported file type");
  }
  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const created = [], failed = [];
    for (const f of files) {
      try {
        if (/\.zip$/i.test(f.name)) {
          const zip = await readZip(await f.arrayBuffer());
          for (const n of zip.names) {
            if (n.endsWith("/") || !IMPORT_EXT.test(n) || /\.zip$/i.test(n) || /^__MACOSX|\/\./.test(n)) continue;
            try { const bytes = await zip.read(n); created.push(await importOne(n, async () => new TextDecoder().decode(bytes), async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))); }
            catch (e) { failed.push(n + ": " + e.message); }
          }
        } else {
          created.push(await importOne(f.name, () => f.text(), () => f.arrayBuffer()));
        }
      } catch (e) { failed.push(f.name + ": " + (e.message || "error")); }
    }
    await loadDocuments();
    if (failed.length) showToast("Could not import: " + failed.join("; "));
    else showToast(created.length === 1 ? "Document imported" : created.length + " documents imported");
    if (created.length === 1 && created[0] && created[0].id && !failed.length) await openDocument(created[0].id);
  }
  function openImportPicker() { jsonImportInput.click(); }



  el("codeBtn").addEventListener("click", () => {
    focusRich();
    const sel = window.getSelection();
    const text = sel && sel.toString() ? sel.toString() : "code";
    const html = `<pre><code>${escapeHtml(text)}</code></pre><p><br></p>`;
    document.execCommand("insertHTML", false, html);
    scheduleSave();
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

  const BLOCK_RE = /^(P|DIV|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE)$/;
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
    applyFontFamily(fontFamilySelect.value);
  });

  /* ---- Font change: instant when the whole document is selected (Ctrl+A) ----
     The browser's own fontName command rewrites every text node and is slow on long documents.
     When everything is selected we simply set the font on each leaf block and clear fonts set on inner
     elements: the text nodes are not touched (so the browser's undo history stays valid) and the change
     has its own small undo / redo. */
  const FONT_BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,td,th,div,pre,blockquote,dt,dd";
  const cssFontName = (n) => (/[\s,]/.test(n) ? '"' + n.replace(/"/g, "") + '"' : n);
  let fastUndo = null, fastRedo = null;
  function selectionCoversAll() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const r = sel.getRangeAt(0);
    if (r.collapsed) return false;
    const w = document.createTreeWalker(richEditor, NodeFilter.SHOW_TEXT);
    let first = null, last = null, n;
    while ((n = w.nextNode())) { if (n.nodeValue.trim()) { if (!first) first = n; last = n; } }
    if (!first) return false;
    const i0 = first.nodeValue.length - first.nodeValue.trimStart().length;
    const i1 = last.nodeValue.trimEnd().length;
    return r.comparePoint(first, i0) === 0 && r.comparePoint(last, i1) === 0;
  }
  function fastSetFont(name) {
    wrapRootInline();
    const css = cssFontName(name);
    const changes = [];   // [element, kind, before, after]
    richEditor.querySelectorAll("*").forEach((e) => {
      if (e.tagName === "FONT" && e.hasAttribute("face")) { changes.push([e, "face", e.getAttribute("face"), null]); e.removeAttribute("face"); }
      if (e.style && e.style.fontFamily) { changes.push([e, "ff", e.style.fontFamily, ""]); e.style.fontFamily = ""; }
    });
    richEditor.querySelectorAll(FONT_BLOCKS).forEach((b) => {
      if (b.querySelector(FONT_BLOCKS)) return;
      const before = b.style.fontFamily;
      const prev = changes.find((c) => c[0] === b && c[1] === "ff");
      if (prev) prev[3] = css; else changes.push([b, "ff", before, css]);
      b.style.fontFamily = css;
    });
    fastUndo = { changes }; fastRedo = null;
  }
  function fastApply(changes, useAfter) {
    changes.forEach(([e, kind, before, after]) => {
      const v = useAfter ? after : before;
      if (kind === "face") { if (v == null) e.removeAttribute("face"); else e.setAttribute("face", v); }
      else e.style.fontFamily = v || "";
    });
  }
  function afterFastChange() {
    richEditor.dispatchEvent(new Event("input", { bubbles: true }));   // save, minimap, outline…
    syncToolbar();
  }
  function fastUndoNow() {
    if (!fastUndo) return false;
    fastApply(fastUndo.changes, false); fastRedo = fastUndo; fastUndo = null; afterFastChange(); return true;
  }
  function fastRedoNow() {
    if (!fastRedo) return false;
    fastApply(fastRedo.changes, true); fastUndo = fastRedo; fastRedo = null; afterFastChange(); return true;
  }
  richEditor.addEventListener("beforeinput", (e) => { if (!/^history/.test(e.inputType)) { fastUndo = null; fastRedo = null; } });

  function applyFontFamily(name) {
    if (!name) return;
    if (selectionCoversAll()) {
      fastSetFont(name);
      fontFamilySelect.value = name;
      afterFastChange();
      return;
    }
    document.execCommand("fontName", false, name);
    scheduleSave();
  }
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

  async function showFontDialog() {
    const fontName = await showModal("Font", "Font name (e.g. Arial, Calibri, Times New Roman):", "Arial", true);
    if (fontName && fontName !== "") {
      focusRich();
      applyFontFamily(fontName);
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

  /* =====================================================================
     Docly additions
     ===================================================================== */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };
  const needOpenDoc = () => { if (!state.currentDoc) { showToast("Open a document first"); return false; } return true; };

  /* ---------------- Paragraph styles (Normal, Title, Subtitle, Heading 1-6) ---------------- */
  function currentBlockStyle(blk) {
    const n = activeElement();
    const p = n && n.closest ? n.closest("p") : null;
    if (p && p.classList.contains("doc-title")) return "TITLE";
    if (p && p.classList.contains("doc-subtitle")) return "SUBTITLE";
    return ["H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE"].includes(blk) ? blk : "P";
  }
  function applyBlockStyle(style) {
    if (!needOpenDoc()) return;
    focusRich();
    restoreSelection();
    const tag = style === "TITLE" || style === "SUBTITLE" ? "P" : style;
    document.execCommand("formatBlock", false, tag);
    selectedBlocks().forEach((b) => {
      if (b.tagName !== "P") { b.classList.remove("doc-title", "doc-subtitle"); return; }
      b.classList.remove("doc-title", "doc-subtitle");
      if (style === "TITLE") b.classList.add("doc-title");
      if (style === "SUBTITLE") b.classList.add("doc-subtitle");
      if (!b.getAttribute("class")) b.removeAttribute("class");
    });
    blockSelect.value = style;
    syncToolbar();
    scheduleSave();
  }

  /* ---------------- Small floating helpers ---------------- */
  function placeFloating(node, x, y) {
    node.classList.remove("hidden");
    const w = node.offsetWidth, h = node.offsetHeight;
    node.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    node.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + "px";
  }

  // Generic form dialog: fields = [{key,label,type:"number|text|select",value,options,min,max,step}]
  function formDialog(title, fields, okLabel = "OK") {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "modal-overlay";
      const box = document.createElement("div");
      box.className = "modal";
      box.innerHTML = '<div class="modal-header"><h3></h3><button class="modal-close" type="button">&times;</button></div><div class="modal-body"></div>';
      box.querySelector("h3").textContent = title;
      const body = box.querySelector(".modal-body");
      const inputs = {};
      fields.forEach((f) => {
        const row = document.createElement("label");
        row.className = "form-row";
        const sp = document.createElement("span");
        sp.textContent = f.label;
        let inp;
        if (f.type === "select") {
          inp = document.createElement("select");
          f.options.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; inp.appendChild(o); });
        } else {
          inp = document.createElement("input");
          inp.type = f.type || "text";
          if (f.min !== undefined) inp.min = f.min;
          if (f.max !== undefined) inp.max = f.max;
          if (f.step !== undefined) inp.step = f.step;
        }
        inp.value = f.value;
        inputs[f.key] = inp;
        row.appendChild(sp); row.appendChild(inp);
        body.appendChild(row);
      });
      const act = document.createElement("div");
      act.className = "form-actions";
      act.innerHTML = '<button type="button" class="modal-btn modal-btn-cancel">Cancel</button><button type="button" class="modal-btn modal-btn-ok"></button>';
      act.querySelector(".modal-btn-ok").textContent = okLabel;
      body.appendChild(act);
      ov.appendChild(box);
      document.body.appendChild(ov);
      const done = (ok) => {
        document.removeEventListener("keydown", onKey, true);
        const out = {};
        if (ok) Object.keys(inputs).forEach((k) => { out[k] = inputs[k].value; });
        ov.remove();
        resolve(ok ? out : null);
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); done(false); }
        else if (e.key === "Enter" && e.target.tagName !== "SELECT") { e.preventDefault(); done(true); }
      };
      document.addEventListener("keydown", onKey, true);
      ov.addEventListener("mousedown", (e) => { if (e.target === ov) done(false); });
      box.querySelector(".modal-close").onclick = () => done(false);
      act.querySelector(".modal-btn-cancel").onclick = () => done(false);
      act.querySelector(".modal-btn-ok").onclick = () => done(true);
      const first = body.querySelector("input,select");
      if (first) first.focus();
    });
  }

  /* =====================================================================
     TABLES  (Google Docs style: size picker, row/column tools, merge/split, ...)
     ===================================================================== */
  const tablePicker = el("tablePicker");
  const TP_ROWS = 8, TP_COLS = 10;
  (function buildPicker() {
    const grid = document.createElement("div");
    grid.className = "tp-grid";
    const label = document.createElement("div");
    label.className = "tp-label";
    label.textContent = "Insert table";
    for (let r = 1; r <= TP_ROWS; r++) {
      for (let c = 1; c <= TP_COLS; c++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tp-cell";
        b.dataset.r = r; b.dataset.c = c;
        b.setAttribute("aria-label", r + " by " + c);
        grid.appendChild(b);
      }
    }
    const paint = (r, c) => {
      grid.querySelectorAll(".tp-cell").forEach((b) => b.classList.toggle("on", +b.dataset.r <= r && +b.dataset.c <= c));
      label.textContent = r ? c + " × " + r : "Insert table";
    };
    grid.addEventListener("mouseover", (e) => { const b = e.target.closest(".tp-cell"); if (b) paint(+b.dataset.r, +b.dataset.c); });
    grid.addEventListener("mouseleave", () => paint(0, 0));
    grid.addEventListener("click", (e) => {
      const b = e.target.closest(".tp-cell");
      if (!b) return;
      closeTablePicker();
      insertTable(+b.dataset.r, +b.dataset.c);
    });
    tablePicker.appendChild(grid);
    tablePicker.appendChild(label);
  })();
  tablePicker.addEventListener("mousedown", (e) => e.preventDefault());
  function closeTablePicker() { tablePicker.classList.add("hidden"); el("tableBtn").classList.remove("open"); }
  function openTablePicker(x, y) {
    closeColorPanel(); closeSizeMenu();
    tablePicker.querySelectorAll(".tp-cell.on").forEach((b) => b.classList.remove("on"));
    placeFloating(tablePicker, x, y);
  }
  el("tableBtn").addEventListener("click", () => {
    if (!needOpenDoc()) return;
    if (!tablePicker.classList.contains("hidden")) { closeTablePicker(); return; }
    closeMenu();
    const r = el("tableBtn").getBoundingClientRect();
    el("tableBtn").classList.add("open");
    openTablePicker(r.left, r.bottom + 4);
  });
  document.addEventListener("mousedown", (e) => {
    if (!tablePicker.contains(e.target) && !e.target.closest("#tableBtn")) closeTablePicker();
  });

  const cellOf = (n) => {
    while (n && n !== richEditor) {
      if (n.nodeType === 1 && (n.tagName === "TD" || n.tagName === "TH")) return n;
      n = n.parentNode;
    }
    return null;
  };
  function gridOf(table) {
    const g = [];
    Array.from(table.rows).forEach((tr, ri) => {
      g[ri] = g[ri] || [];
      let ci = 0;
      Array.from(tr.cells).forEach((cell) => {
        while (g[ri][ci]) ci++;
        const rs = cell.rowSpan || 1, cs = cell.colSpan || 1;
        for (let a = 0; a < rs; a++) {
          g[ri + a] = g[ri + a] || [];
          for (let b = 0; b < cs; b++) g[ri + a][ci + b] = cell;
        }
        ci += cs;
      });
    });
    return g;
  }
  const ncolsOf = (g) => g.reduce((m, r) => Math.max(m, r.length), 0);
  function posOf(table, cell) {
    const g = gridOf(table);
    for (let r = 0; r < g.length; r++) for (let c = 0; c < (g[r] || []).length; c++) if (g[r][c] === cell) return { r, c, g };
    return null;
  }

  let cellSel = null;                       // { table, r1, c1, r2, c2 }
  function clearCellSel() {
    richEditor.querySelectorAll(".cell-sel").forEach((c) => { c.classList.remove("cell-sel"); if (!c.getAttribute("class")) c.removeAttribute("class"); });
    richEditor.classList.remove("selecting-cells");
    cellSel = null;
  }
  function paintCellSel() {
    richEditor.querySelectorAll(".cell-sel").forEach((c) => c.classList.remove("cell-sel"));
    if (!cellSel) return;
    const g = gridOf(cellSel.table);
    for (let r = cellSel.r1; r <= cellSel.r2; r++) for (let c = cellSel.c1; c <= cellSel.c2; c++) if (g[r] && g[r][c]) g[r][c].classList.add("cell-sel");
    richEditor.classList.add("selecting-cells");
  }
  function selectRect(table, a, b) {
    const g = gridOf(table);
    const pa = posOf(table, a), pb = posOf(table, b);
    if (!pa || !pb) return;
    let r1 = Math.min(pa.r, pb.r), r2 = Math.max(pa.r + a.rowSpan - 1, pb.r + b.rowSpan - 1);
    let c1 = Math.min(pa.c, pb.c), c2 = Math.max(pa.c + a.colSpan - 1, pb.c + b.colSpan - 1);
    // grow the rectangle until it no longer cuts a merged cell in half
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        const cell = g[r] && g[r][c]; if (!cell) continue;
        const p = posOf(table, cell);
        const nr1 = Math.min(r1, p.r), nr2 = Math.max(r2, p.r + cell.rowSpan - 1);
        const nc1 = Math.min(c1, p.c), nc2 = Math.max(c2, p.c + cell.colSpan - 1);
        if (nr1 !== r1 || nr2 !== r2 || nc1 !== c1 || nc2 !== c2) { r1 = nr1; r2 = nr2; c1 = nc1; c2 = nc2; changed = true; }
      }
    }
    cellSel = { table, r1, c1, r2, c2 };
    paintCellSel();
  }

  function currentCell() {
    if (cellSel) { const g = gridOf(cellSel.table); return g[cellSel.r1][cellSel.c1]; }
    const r = selectionInEditor() || savedRange;
    if (!r) return null;
    const c = cellOf(r.startContainer);
    return c && richEditor.contains(c) ? c : null;
  }
  const inTable = () => !!currentCell();
  function tableCtx() {
    const cell = currentCell();
    if (!cell) { showToast("Click inside a table first"); return null; }
    const table = cell.closest("table");
    const p = posOf(table, cell);
    let r1 = p.r, r2 = p.r + cell.rowSpan - 1, c1 = p.c, c2 = p.c + cell.colSpan - 1;
    if (cellSel && cellSel.table === table) { r1 = cellSel.r1; r2 = cellSel.r2; c1 = cellSel.c1; c2 = cellSel.c2; }
    return { cell, table, r1, r2, c1, c2 };
  }
  function selectedCells(ctx) {
    const g = gridOf(ctx.table), set = new Set();
    for (let r = ctx.r1; r <= ctx.r2; r++) for (let c = ctx.c1; c <= ctx.c2; c++) if (g[r] && g[r][c]) set.add(g[r][c]);
    return Array.from(set);
  }
  function placeCaretIn(cell, selectAll) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    if (!selectAll) range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    richEditor.focus({ preventScroll: true });
  }
  const newCell = (tag = "TD") => { const c = document.createElement(tag); c.innerHTML = "<br>"; return c; };

  // ---- column widths live in a <colgroup>
  function ensureColgroup(table) {
    const n = ncolsOf(gridOf(table));
    let cg = Array.from(table.children).find((c) => c.tagName === "COLGROUP");
    if (!cg) { cg = document.createElement("colgroup"); table.insertBefore(cg, table.firstChild); }
    while (cg.children.length < n) cg.appendChild(document.createElement("col"));
    while (cg.children.length > n) cg.lastChild.remove();
    return cg;
  }
  function colPx(table, g, c) {
    for (let r = 0; r < g.length; r++) {
      const cell = g[r][c];
      if (cell && (cell.colSpan || 1) === 1) return cell.offsetWidth;
    }
    return table.offsetWidth / Math.max(1, ncolsOf(g));
  }
  function ensureColPx(table) {
    const cg = ensureColgroup(table), g = gridOf(table);
    Array.from(cg.children).forEach((col, c) => { col.style.width = Math.max(24, Math.round(colPx(table, g, c))) + "px"; });
    return cg;
  }
  function normalizeCols(table) {
    const cg = ensureColgroup(table);
    const cols = Array.from(cg.children);
    const ws = cols.map((c) => c.style.width);
    if (ws.every((w) => w.endsWith("%"))) {
      const v = ws.map(parseFloat), tot = v.reduce((a, b) => a + b, 0) || 1;
      cols.forEach((c, i) => { c.style.width = (v[i] / tot * 100).toFixed(3) + "%"; });
    } else if (ws.every((w) => w.endsWith("px"))) {
      table.style.width = ws.reduce((a, w) => a + parseFloat(w), 0) + "px";
      table.style.maxWidth = "100%";
    } else {
      const eq = (100 / cols.length).toFixed(3) + "%";
      cols.forEach((c) => { c.style.width = eq; });
      table.style.width = "100%";
    }
  }

  function insertTable(rows, cols) {
    if (!needOpenDoc()) return;
    restoreSelection(); focusRich();
    if (currentCell()) { showToast("Tables cannot be nested"); return; }
    const w = (100 / cols).toFixed(3) + "%";
    let html = '<table style="width:100%"><colgroup>' + ('<col style="width:' + w + '">').repeat(cols) + "</colgroup><tbody>";
    for (let r = 0; r < rows; r++) html += "<tr>" + "<td><br></td>".repeat(cols) + "</tr>";
    html += "</tbody></table><p><br></p>";
    const before = new Set(richEditor.querySelectorAll("table"));
    document.execCommand("insertHTML", false, html);
    const t = Array.from(richEditor.querySelectorAll("table")).find((x) => !before.has(x));
    if (t) {
      const cg = ensureColgroup(t);
      Array.from(cg.children).forEach((c) => { c.style.width = w; });
      t.style.width = "100%";
      const first = t.querySelector("td");
      if (first) placeCaretIn(first, false);
    }
    scheduleSave();
  }

  // ---- row / column operations
  function insertRowAt(table, idx, after) {
    const g = gridOf(table);
    const at = after ? idx + 1 : idx;
    const tr = document.createElement("tr");
    const seen = new Set();
    const n = ncolsOf(g);
    for (let c = 0; c < n; c++) {
      const above = g[at - 1] && g[at - 1][c], below = g[at] && g[at][c];
      if (above && below && above === below) {
        if (!seen.has(above)) { above.rowSpan = (above.rowSpan || 1) + 1; seen.add(above); }
        continue;
      }
      const ref = (after ? above : below) || above || below;
      const td = newCell(ref && ref.tagName === "TH" && !above ? "TH" : "TD");
      tr.appendChild(td);
    }
    const rows = Array.from(table.rows);
    if (at >= rows.length) rows[rows.length - 1].parentNode.appendChild(tr);
    else rows[at].parentNode.insertBefore(tr, rows[at]);
    return tr;
  }
  function deleteRowAt(table, r) {
    const g = gridOf(table), tr = table.rows[r];
    if (!tr) return;
    const done = new Set();
    for (let c = 0; c < g[r].length; c++) {
      const cell = g[r][c];
      if (!cell || done.has(cell)) continue;
      done.add(cell);
      if ((cell.rowSpan || 1) > 1) {
        if (cell.parentNode === tr) {
          const next = table.rows[r + 1];
          let ref = null;
          for (let cc = c + 1; cc < g[r + 1].length; cc++) { const x = g[r + 1][cc]; if (x && x.parentNode === next) { ref = x; break; } }
          cell.rowSpan -= 1;
          next.insertBefore(cell, ref);
        } else cell.rowSpan -= 1;
      }
    }
    tr.remove();
  }
  function insertColAt(table, c, after) {
    const g = gridOf(table);
    const cg = ensureColgroup(table);
    const at = after ? c + 1 : c;
    const seen = new Set();
    g.forEach((row, r) => {
      const left = row[at - 1], right = row[at];
      if (left && right && left === right) {
        if (!seen.has(left)) { left.colSpan = (left.colSpan || 1) + 1; seen.add(left); }
        return;
      }
      const tr = table.rows[r];
      let ref = null;
      for (let cc = at; cc < row.length; cc++) { const x = row[cc]; if (x && x.parentNode === tr) { ref = x; break; } }
      const ref0 = left || right;
      tr.insertBefore(newCell(ref0 && ref0.tagName === "TH" ? "TH" : "TD"), ref);
    });
    const neighbour = cg.children[c];
    const col = document.createElement("col");
    col.style.width = (neighbour && neighbour.style.width) || "";
    cg.insertBefore(col, cg.children[at] || null);
    normalizeCols(table);
  }
  function deleteColAt(table, c) {
    const g = gridOf(table);
    const cg = ensureColgroup(table);
    const done = new Set();
    g.forEach((row) => {
      const cell = row[c];
      if (!cell || done.has(cell)) return;
      done.add(cell);
      if ((cell.colSpan || 1) > 1) cell.colSpan -= 1; else cell.remove();
    });
    if (cg.children[c]) cg.children[c].remove();
    Array.from(table.rows).forEach((tr) => { if (!tr.cells.length) tr.remove(); });
    normalizeCols(table);
  }

  const T = {
    rowAbove() { const x = tableCtx(); if (!x) return; const n = x.r2 - x.r1 + 1; for (let i = 0; i < n; i++) insertRowAt(x.table, x.r1, false); done(x); },
    rowBelow() { const x = tableCtx(); if (!x) return; const n = x.r2 - x.r1 + 1; for (let i = 0; i < n; i++) insertRowAt(x.table, x.r2, true); done(x); },
    colLeft() { const x = tableCtx(); if (!x) return; const n = x.c2 - x.c1 + 1; for (let i = 0; i < n; i++) insertColAt(x.table, x.c1, false); done(x); },
    colRight() { const x = tableCtx(); if (!x) return; const n = x.c2 - x.c1 + 1; for (let i = 0; i < n; i++) insertColAt(x.table, x.c2, true); done(x); },
    delRow() {
      const x = tableCtx(); if (!x) return;
      const t = x.table, total = gridOf(t).length;
      if (x.r2 - x.r1 + 1 >= total) return T.delTable();
      for (let r = x.r2; r >= x.r1; r--) deleteRowAt(t, r);
      clearCellSel(); focusAfter(t, x.r1); scheduleSave();
    },
    delCol() {
      const x = tableCtx(); if (!x) return;
      const t = x.table, total = ncolsOf(gridOf(t));
      if (x.c2 - x.c1 + 1 >= total) return T.delTable();
      for (let c = x.c2; c >= x.c1; c--) deleteColAt(t, c);
      clearCellSel(); focusAfter(t, 0); scheduleSave();
    },
    delTable() {
      const x = tableCtx(); if (!x) return;
      const next = x.table.nextElementSibling;
      x.table.remove(); clearCellSel();
      if (!richEditor.firstElementChild) richEditor.innerHTML = "<p><br></p>";
      scheduleSave();
    },
    merge() {
      const x = tableCtx(); if (!x) return;
      const cells = selectedCells(x);
      if (cells.length < 2) { showToast("Select two or more cells (drag across them) to merge"); return; }
      const g = gridOf(x.table), tl = g[x.r1][x.c1];
      const parts = [];
      cells.forEach((c) => {
        if (c === tl) return;
        const html = c.innerHTML.replace(/^(<br>)+$/i, "").trim();
        if (html) parts.push(html);
        c.remove();
      });
      if (parts.length) tl.innerHTML = (tl.innerHTML.replace(/^(<br>)+$/i, "").trim() ? tl.innerHTML + "<br>" : "") + parts.join("<br>");
      tl.rowSpan = x.r2 - x.r1 + 1;
      tl.colSpan = x.c2 - x.c1 + 1;
      if (tl.rowSpan === 1) tl.removeAttribute("rowspan");
      if (tl.colSpan === 1) tl.removeAttribute("colspan");
      Array.from(x.table.rows).forEach((tr) => { if (!tr.cells.length && !gridOf(x.table).length) tr.remove(); });
      clearCellSel(); placeCaretIn(tl, false); scheduleSave();
    },
    split() {
      const x = tableCtx(); if (!x) return;
      const cell = x.cell, rs = cell.rowSpan || 1, cs = cell.colSpan || 1;
      if (rs === 1 && cs === 1) { showToast("This cell is not merged"); return; }
      const p = posOf(x.table, cell), g = p.g;
      cell.removeAttribute("rowspan"); cell.removeAttribute("colspan");
      for (let a = 0; a < rs; a++) {
        const tr = x.table.rows[p.r + a];
        if (a === 0) {
          let last = cell;
          for (let b = 1; b < cs; b++) { const nc = newCell(cell.tagName); tr.insertBefore(nc, last.nextSibling); last = nc; }
        } else {
          let ref = null;
          for (let cc = p.c + cs; cc < (g[p.r + a] || []).length; cc++) { const q = g[p.r + a][cc]; if (q && q.parentNode === tr) { ref = q; break; } }
          for (let b = 0; b < cs; b++) tr.insertBefore(newCell(cell.tagName), ref);
        }
      }
      clearCellSel(); placeCaretIn(cell, false); scheduleSave();
    },
    distRows() {
      const x = tableCtx(); if (!x) return;
      const rows = Array.from(x.table.rows);
      const sel = rows.slice(x.r1, x.r2 + 1);
      const use = sel.length > 1 ? sel : rows;
      const h = Math.round(use.reduce((a, r) => a + r.offsetHeight, 0) / use.length);
      use.forEach((r) => { r.style.height = h + "px"; });
      scheduleSave();
    },
    distCols() {
      const x = tableCtx(); if (!x) return;
      const cg = ensureColgroup(x.table);
      const eq = (100 / cg.children.length).toFixed(3) + "%";
      Array.from(cg.children).forEach((c) => { c.style.width = eq; });
      x.table.style.width = "100%";
      scheduleSave();
    },
    vAlign(v) { const x = tableCtx(); if (!x) return; selectedCells(x).forEach((c) => { c.style.verticalAlign = v; }); scheduleSave(); },
    hAlign(v) { const x = tableCtx(); if (!x) return; selectedCells(x).forEach((c) => { c.style.textAlign = v; }); scheduleSave(); },
    bg(color) { const x = tableCtx(); if (!x) return; selectedCells(x).forEach((c) => { c.style.backgroundColor = color || ""; if (!c.getAttribute("style")) c.removeAttribute("style"); }); scheduleSave(); },
    borderTargets(x) { return cellSel ? selectedCells(x) : Array.from(x.table.querySelectorAll("td,th")); },
    borderColor(color) { const x = tableCtx(); if (!x) return; T.borderTargets(x).forEach((c) => { c.style.borderColor = color; if (!c.style.borderStyle) c.style.borderStyle = "solid"; if (!c.style.borderWidth) c.style.borderWidth = "1px"; }); scheduleSave(); },
    borderWidth(px) {
      const x = tableCtx(); if (!x) return;
      T.borderTargets(x).forEach((c) => {
        if (px === 0) { c.style.borderStyle = "none"; c.style.borderWidth = "0"; }
        else { c.style.borderStyle = "solid"; c.style.borderWidth = px + "px"; if (!c.style.borderColor) c.style.borderColor = "#000"; }
      });
      scheduleSave();
    },
    async colWidth() {
      const x = tableCtx(); if (!x) return;
      const cg = ensureColPx(x.table);
      const cur = parseFloat(cg.children[x.c1].style.width) || 100;
      const v = await showModal("Column width", "Width in pixels:", String(Math.round(cur)), true);
      const px = parseInt(v, 10);
      if (!px) return;
      for (let c = x.c1; c <= x.c2; c++) cg.children[c].style.width = Math.max(24, Math.min(2000, px)) + "px";
      normalizeCols(x.table); scheduleSave();
    },
    async rowHeight() {
      const x = tableCtx(); if (!x) return;
      const cur = x.table.rows[x.r1].offsetHeight;
      const v = await showModal("Minimum row height", "Height in pixels:", String(cur), true);
      const px = parseInt(v, 10);
      if (!px) return;
      for (let r = x.r1; r <= x.r2; r++) x.table.rows[r].style.height = Math.max(10, Math.min(1000, px)) + "px";
      scheduleSave();
    },
    async props() {
      const x = tableCtx(); if (!x) return;
      const t = x.table;
      const align = t.style.marginLeft === "auto" && t.style.marginRight === "auto" ? "center" : t.style.marginLeft === "auto" ? "right" : "left";
      const res = await formDialog("Table properties", [
        { key: "w", label: "Table width (%)", type: "number", min: 10, max: 100, value: parseInt(t.style.width, 10) || 100 },
        { key: "align", label: "Table alignment", type: "select", value: align, options: [["left", "Left"], ["center", "Center"], ["right", "Right"]] },
        { key: "hdr", label: "Header row", type: "select", value: t.rows[0] && t.rows[0].cells[0] && t.rows[0].cells[0].tagName === "TH" ? "1" : "0", options: [["0", "No"], ["1", "Yes"]] },
      ], "Apply");
      if (!res) return;
      const w = Math.max(10, Math.min(100, parseInt(res.w, 10) || 100));
      t.style.width = w + "%"; t.style.maxWidth = "100%";
      const cg = ensureColgroup(t);
      const eq = (100 / cg.children.length).toFixed(3) + "%";
      Array.from(cg.children).forEach((c) => { c.style.width = eq; });
      t.style.marginLeft = res.align === "left" ? "" : "auto";
      t.style.marginRight = res.align === "right" ? "" : res.align === "center" ? "auto" : "auto";
      if (res.align === "left") { t.style.marginLeft = ""; t.style.marginRight = "auto"; }
      T.setHeader(res.hdr === "1", t);
    },
    setHeader(on, table) {
      const x = table ? { table } : tableCtx(); if (!x) return;
      const row = x.table.rows[0]; if (!row) return;
      Array.from(row.cells).forEach((c) => {
        const want = on ? "TH" : "TD";
        if (c.tagName === want) return;
        const n = document.createElement(want);
        Array.from(c.attributes).forEach((a) => n.setAttribute(a.name, a.value));
        n.innerHTML = c.innerHTML; c.replaceWith(n);
      });
      scheduleSave();
    },
    hasHeader() { const c = currentCell(); const t = c && c.closest("table"); return !!(t && t.rows[0] && t.rows[0].cells[0] && t.rows[0].cells[0].tagName === "TH"); },
  };
  function done(x) { clearCellSel(); scheduleSave(); }
  function focusAfter(table, r) {
    if (!table.isConnected) return;
    const row = table.rows[Math.min(r, table.rows.length - 1)];
    if (row && row.cells[0]) placeCaretIn(row.cells[0], false);
  }

  // palette popup reused for cell colours
  function openPaletteAt(x, y, onPick, resetLabel) {
    closeMenu(); closeSizeMenu(); closeColorPanel();
    colorMode = "custom";
    colorPanel.innerHTML = "";
    const reset = document.createElement("button");
    reset.className = "cp-reset";
    reset.innerHTML = '<span class="cp-none"></span><span></span>';
    reset.lastChild.textContent = resetLabel;
    reset.addEventListener("click", () => { closeColorPanel(); onPick(null); });
    colorPanel.appendChild(reset);
    const grid = document.createElement("div");
    grid.className = "cp-grid";
    PALETTE.forEach((row) => row.forEach((c) => {
      const b = document.createElement("button");
      b.className = "cp-swatch"; b.style.background = c; b.title = c;
      b.addEventListener("click", () => { closeColorPanel(); onPick(c); });
      grid.appendChild(b);
    }));
    colorPanel.appendChild(grid);
    placeFloating(colorPanel, x, y);
  }

  /* selecting cells with the mouse + resizing columns by dragging their border */
  let dragAnchor = null, resizing = null;
  const EDGE = 5;
  function edgeCell(e) {
    const c = cellOf(e.target);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return Math.abs(e.clientX - r.right) <= EDGE ? c : null;
  }
  richEditor.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    clearCellSel();
    const edge = edgeCell(e);
    if (edge) {
      const table = edge.closest("table"), p = posOf(table, edge);
      const ci = p.c + (edge.colSpan || 1) - 1;
      const cg = ensureColPx(table);
      resizing = { table, cg, ci, x: e.clientX, w: parseFloat(cg.children[ci].style.width), nw: cg.children[ci + 1] ? parseFloat(cg.children[ci + 1].style.width) : null };
      e.preventDefault();
      return;
    }
    dragAnchor = cellOf(e.target);
  });
  richEditor.addEventListener("mousemove", (e) => {
    if (resizing) {
      const dx = (e.clientX - resizing.x) / zoomNow();
      let w = Math.max(24, resizing.w + dx);
      if (resizing.nw !== null) {
        w = Math.min(w, resizing.w + resizing.nw - 24);
        resizing.cg.children[resizing.ci + 1].style.width = Math.round(resizing.nw - (w - resizing.w)) + "px";
      }
      resizing.cg.children[resizing.ci].style.width = Math.round(w) + "px";
      normalizeCols(resizing.table);
      return;
    }
    richEditor.style.cursor = !dragAnchor && edgeCell(e) ? "col-resize" : "";
    if (dragAnchor && e.buttons === 1) {
      const c = cellOf(e.target);
      if (!c || c.closest("table") !== dragAnchor.closest("table")) return;
      if (c === dragAnchor && !cellSel) return;
      selectRect(dragAnchor.closest("table"), dragAnchor, c);
      window.getSelection().removeAllRanges();
    }
  });
  document.addEventListener("mouseup", () => {
    if (resizing) { resizing = null; scheduleSave(); }
    dragAnchor = null;
  });

  // right click inside a table = table menu
  richEditor.addEventListener("contextmenu", (e) => {
    const c = cellOf(e.target);
    if (!c) return;
    e.preventDefault();
    if (!cellSel || !c.classList.contains("cell-sel")) { clearCellSel(); placeCaretIn(c, false); }
    openMenuAt("table", e.clientX, e.clientY);
  });

  /* =====================================================================
     Other editor features: lists, checklists, links, bookmarks, TOC, ...
     ===================================================================== */
  function toggleChecklist() {
    if (!needOpenDoc()) return;
    focusRich();
    const n = activeElement();
    const ul = n && n.closest ? n.closest("ul") : null;
    if (ul && ul.classList.contains("checklist")) { document.execCommand("insertUnorderedList"); }
    else {
      if (!ul) document.execCommand("insertUnorderedList");
      const n2 = activeElement(), ul2 = n2 && n2.closest ? n2.closest("ul") : null;
      if (ul2) ul2.classList.add("checklist");
    }
    scheduleSave();
  }
  richEditor.addEventListener("click", (e) => {
    const li = e.target.closest && e.target.closest("ul.checklist > li");
    if (li && li.parentNode.parentNode && richEditor.contains(li)) {
      const r = li.getBoundingClientRect();
      if (e.clientX < r.left + 2 && e.clientX > r.left - 30 * zoomNow()) { li.classList.toggle("done"); scheduleSave(); }
    }
    const a = e.target.closest && e.target.closest("a[href]");
    if (a && (e.ctrlKey || e.metaKey || a.closest(".toc"))) {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("#")) {
        e.preventDefault();
        const t = richEditor.querySelector('[id="' + href.slice(1).replace(/"/g, "") + '"]');
        if (t) t.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (/^https?:/i.test(href)) { window.open(href, "_blank", "noopener"); }
    }
  });
  /* ---------------- Links and bookmarks (like Google Docs) ---------------- */
  const LINK_SVG = {
    link: '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    unlink: '<svg viewBox="0 0 24 24"><path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.31 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16v-2zM2 4.27l3.11 3.11C3.29 8.12 2 9.91 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4L20 19.74 3.27 3 2 4.27z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  };
  const idSel = (id) => '[id="' + String(id).replace(/"/g, "") + '"]';
  const linkTarget = (id) => richEditor.querySelector(idSel(id));
  function targetLabel(id) {
    const t = linkTarget(id);
    if (!t) return null;
    return (t.dataset && t.dataset.bookmark) || (t.textContent || "").trim() || id;
  }
  // everything a link can point to: headings (they get an id on demand) and bookmarks
  function listLinkTargets() {
    ensureHeadingIds();
    const heads = Array.from(richEditor.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter((x) => !x.closest(".toc"))
      .map((x) => ({ id: x.id, label: x.textContent.trim() || "(empty heading)", kind: "heading" }));
    const marks = Array.from(richEditor.querySelectorAll("a[data-bookmark]")).map((b) => ({ id: b.id, label: b.dataset.bookmark, kind: "bookmark" }));
    return { heads, marks };
  }

  const TLDS = "com|org|net|edu|gov|io|dev|app|co|uk|it|de|fr|es|ch|eu|info|me|ai|tv|xyz|us|ca|nl|be|at|pt|ru|jp|cn|in|br|au|online|site|blog|tech|cloud|shop|store";
  const BARE_DOMAIN_RE = new RegExp("^[a-z0-9-]+(\\.[a-z0-9-]+)*\\.(" + TLDS + ")(:\\d+)?([/?#]\\S*)?$", "i");
  // Is this text a link? Returns the address to use, or null.
  function urlFromText(t) {
    t = (t || "").trim();
    if (!t || /\s/.test(t)) return null;
    if (/^(https?|ftp):\/\/\S+$/i.test(t) || /^mailto:\S+$/i.test(t)) return t;
    if (/^www\.\S+\.\S+$/i.test(t)) return "https://" + t;
    if (BARE_DOMAIN_RE.test(t)) return "https://" + t;
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) return "mailto:" + t;
    if (/^#[\w-]+$/.test(t) && linkTarget(t.slice(1))) return t;     // a copied bookmark link
    return null;
  }
  function normalizeHref(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (v.charAt(0) === "#" || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return "mailto:" + v;
    return "https://" + v;
  }
  function openHref(href) {
    if (href.charAt(0) === "#") {
      const t = linkTarget(href.slice(1));
      if (t) t.scrollIntoView({ block: "center", behavior: "smooth" }); else showToast("That bookmark no longer exists");
    } else if (/^mailto:/i.test(href)) window.location.href = href;
    else window.open(href, "_blank", "noopener");
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    showToast("Link copied");
  }
  const anchorAtCaret = () => { const n = activeElement(); return n && n.closest ? n.closest("a[href]") : null; };

  // ---- the small card that appears when you click a link or a bookmark
  const linkCard = document.createElement("div");
  linkCard.className = "link-card hidden";
  document.body.appendChild(linkCard);
  let cardAnchor = null;
  function hideLinkCard() { linkCard.classList.add("hidden"); cardAnchor = null; }
  function placeCard(card, a) {
    const r = a.getBoundingClientRect();
    card.classList.remove("hidden");
    const w = card.offsetWidth;
    card.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    card.style.top = Math.min(r.bottom + 6, window.innerHeight - card.offsetHeight - 8) + "px";
  }
  function showLinkCard(a) {
    const href = a.getAttribute("href") || "";
    const internal = href.charAt(0) === "#";
    const label = internal ? (targetLabel(href.slice(1)) || href) : href;
    linkCard.innerHTML = '<span class="lc-icon">' + (internal ? LINK_SVG.bookmark : LINK_SVG.link) + '</span>' +
      '<a class="lc-url" href="#"></a>' +
      '<button type="button" class="lc-btn" data-act="copy" title="Copy link">' + LINK_SVG.copy + '</button>' +
      '<button type="button" class="lc-btn" data-act="edit" title="Edit link">' + LINK_SVG.edit + '</button>' +
      '<button type="button" class="lc-btn" data-act="unlink" title="Remove link">' + LINK_SVG.unlink + '</button>';
    const u = linkCard.querySelector(".lc-url");
    u.textContent = label;
    u.title = internal ? "Go to " + label : "Open " + href;
    cardAnchor = a;
    placeCard(linkCard, a);
  }
  function showBookmarkCard(a, isNew) {
    linkCard.innerHTML = '<span class="lc-icon">' + LINK_SVG.bookmark + '</span><span class="lc-name"></span>' +
      '<button type="button" class="lc-btn" data-act="copy-bm" title="Copy link to this bookmark">' + LINK_SVG.copy + '</button>' +
      '<button type="button" class="lc-btn" data-act="rename-bm" title="Rename bookmark">' + LINK_SVG.edit + '</button>' +
      '<button type="button" class="lc-btn" data-act="remove-bm" title="Remove bookmark">' + LINK_SVG.trash + '</button>';
    linkCard.querySelector(".lc-name").textContent = (a.dataset.bookmark || "Bookmark") + (isNew ? "  \u2022  added" : "");
    cardAnchor = a;
    placeCard(linkCard, a);
  }
  linkCard.addEventListener("mousedown", (e) => e.preventDefault());
  linkCard.addEventListener("click", async (e) => {
    e.preventDefault();
    const a = cardAnchor;
    if (!a) return;
    const urlEl = e.target.closest(".lc-url");
    const btn = e.target.closest("[data-act]");
    if (urlEl) { openHref(a.getAttribute("href") || ""); return; }
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "copy") copyText(a.getAttribute("href") || "");
    else if (act === "copy-bm") copyText("#" + a.id);
    else if (act === "edit") { hideLinkCard(); openLinkEditor(a); }
    else if (act === "unlink") {
      const r = document.createRange(); r.selectNodeContents(a);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      focusRich(); document.execCommand("unlink");
      hideLinkCard(); scheduleSave(); syncToolbar();
    } else if (act === "rename-bm") {
      hideLinkCard();
      const name = await showModal("Rename bookmark", "Bookmark name:", a.dataset.bookmark || "", true);
      if (name && name.trim()) { a.dataset.bookmark = name.trim(); a.title = "Bookmark: " + name.trim(); scheduleSave(); }
    } else if (act === "remove-bm") { a.remove(); hideLinkCard(); scheduleSave(); showToast("Bookmark removed"); }
  });
  document.addEventListener("mousedown", (e) => {
    if (!linkCard.contains(e.target) && !(e.target.closest && e.target.closest("a") && richEditor.contains(e.target))) hideLinkCard();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideLinkCard(); });
  richEditor.addEventListener("input", hideLinkCard);
  document.querySelector(".page-scroll").addEventListener("scroll", hideLinkCard, { passive: true });
  richEditor.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey) return;                         // Ctrl+click opens the link directly (handled above)
    const a = e.target.closest && e.target.closest("a");
    if (!a || !richEditor.contains(a) || a.closest(".toc")) { hideLinkCard(); return; }
    if (a.hasAttribute("data-bookmark")) showBookmarkCard(a);
    else if (a.hasAttribute("href")) showLinkCard(a);
  });

  // ---- Insert link: text + link fields, with "Headings and bookmarks" suggestions
  let linkEditorEl = null;
  function closeLinkEditor() {
    if (linkEditorEl) { linkEditorEl.remove(); linkEditorEl = null; }
    document.removeEventListener("mousedown", linkEditorOutside, true);
  }
  function linkEditorOutside(e) { if (linkEditorEl && !linkEditorEl.contains(e.target)) closeLinkEditor(); }

  function openLinkEditor(existing, opts) {
    if (!needOpenDoc()) return;
    hideLinkCard(); closeLinkEditor();
    let range = null;
    if (existing) { range = document.createRange(); range.selectNodeContents(existing); }
    else { const r = selectionInEditor() || savedRange; range = r ? r.cloneRange() : null; }
    const selText = existing ? existing.textContent : (range ? range.toString() : "");
    const hadSelection = !!selText && !(range && range.collapsed);

    const box = document.createElement("div");
    box.className = "link-editor";
    box.innerHTML = '<label>Text</label><input class="le-text" placeholder="Text to display" autocomplete="off" spellcheck="false">' +
      '<label>Link</label><div class="le-linkwrap"><span class="le-ic">' + LINK_SVG.search + '</span><input class="le-url" placeholder="Paste a link or search headings and bookmarks" autocomplete="off" spellcheck="false"></div>' +
      '<div class="le-suggest"></div>' +
      '<div class="le-actions">' + (existing ? '<button type="button" class="le-remove">Remove link</button>' : '') + '<span class="le-grow"></span><button type="button" class="le-cancel">Cancel</button><button type="button" class="le-apply">Apply</button></div>';
    const textIn = box.querySelector(".le-text"), urlIn = box.querySelector(".le-url"), sug = box.querySelector(".le-suggest");
    textIn.value = selText;
    if (existing) {
      const href = existing.getAttribute("href") || "";
      if (href.charAt(0) === "#") { urlIn.value = targetLabel(href.slice(1)) || href; urlIn.dataset.href = href; } else urlIn.value = href;
    }
    let autoText = !selText;             // the text follows the chosen heading / bookmark until you type your own

    function drawSuggestions() {
      const q = urlIn.value.trim().toLowerCase();
      sug.innerHTML = "";
      if (urlIn.dataset.href || (q && urlFromText(urlIn.value) && q.charAt(0) !== "#") || /^(https?:|mailto:|www\.)/i.test(q)) { sug.classList.remove("open"); return; }
      const { heads, marks } = listLinkTargets();
      const match = (t) => !q || t.label.toLowerCase().includes(q);
      const groups = [["Headings", heads.filter(match)], ["Bookmarks", marks.filter(match)]].filter((g) => g[1].length);
      if (!groups.length) { sug.classList.remove("open"); return; }
      groups.forEach(([title, items]) => {
        const t = document.createElement("div"); t.className = "le-group"; t.textContent = title; sug.appendChild(t);
        items.slice(0, 8).forEach((it) => {
          const row = document.createElement("button");
          row.type = "button"; row.className = "le-item";
          row.innerHTML = '<span class="le-item-ic">' + (it.kind === "bookmark" ? LINK_SVG.bookmark : "<b>H</b>") + '</span><span class="le-item-label"></span>';
          row.querySelector(".le-item-label").textContent = it.label;
          row.addEventListener("mousedown", (ev) => ev.preventDefault());
          row.addEventListener("click", () => {
            urlIn.value = it.label; urlIn.dataset.href = "#" + it.id;
            if (autoText || !textIn.value.trim()) { textIn.value = it.label; autoText = true; }
            sug.classList.remove("open");
            urlIn.focus();
          });
          sug.appendChild(row);
        });
      });
      sug.classList.add("open");
    }
    urlIn.addEventListener("input", () => { delete urlIn.dataset.href; drawSuggestions(); });
    urlIn.addEventListener("focus", drawSuggestions);
    textIn.addEventListener("input", () => { autoText = false; });

    function finish() {
      const href = urlIn.dataset.href || normalizeHref(urlIn.value);
      const text = textIn.value;
      closeLinkEditor();
      if (!href) { if (existing) { const r = document.createRange(); r.selectNodeContents(existing); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); focusRich(); document.execCommand("unlink"); scheduleSave(); } return; }
      focusRich();
      const sel = window.getSelection();
      if (existing) {
        existing.setAttribute("href", href);
        if (text.trim() && text !== existing.textContent) existing.textContent = text;
        const r = document.createRange(); r.setStartAfter(existing); r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
      } else {
        if (range) { sel.removeAllRanges(); sel.addRange(range); }
        if (hadSelection && (!text.trim() || text === selText)) {
          document.execCommand("createLink", false, href);
          sel.collapseToEnd();
        } else {
          const label = text.trim() || (href.charAt(0) === "#" ? (targetLabel(href.slice(1)) || href) : href);
          document.execCommand("insertHTML", false, '<a href="' + escapeHtml(href) + '">' + escapeHtml(label) + "</a>" + (hadSelection ? "" : "&nbsp;"));
        }
      }
      scheduleSave(); syncToolbar();
    }
    box.querySelector(".le-apply").onclick = finish;
    box.querySelector(".le-cancel").onclick = () => { closeLinkEditor(); focusRich(); };
    const rm = box.querySelector(".le-remove");
    if (rm) rm.onclick = () => { urlIn.value = ""; delete urlIn.dataset.href; finish(); };
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeLinkEditor(); focusRich(); }
    });

    document.body.appendChild(box);
    linkEditorEl = box;
    // position under the selected text (or the caret)
    let rect = range ? range.getBoundingClientRect() : null;
    if (!rect || (!rect.width && !rect.height && !rect.top)) { const pr = pageArea.getBoundingClientRect(); rect = { left: pr.left + 40, bottom: pr.top + 80 }; }
    box.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - box.offsetWidth - 8)) + "px";
    box.style.top = Math.min(rect.bottom + 8, window.innerHeight - box.offsetHeight - 8) + "px";
    setTimeout(() => document.addEventListener("mousedown", linkEditorOutside, true), 0);
    (hadSelection || existing || (opts && opts.suggest) ? urlIn : textIn).focus();
    if (existing) urlIn.select();
    if (opts && opts.suggest) drawSuggestions();
  }
  async function insertLink() {
    if (!needOpenDoc()) return;
    openLinkEditor(anchorAtCaret());
  }
  el("linkBtn").addEventListener("click", insertLink);

  // ---- Bookmarks: a small marker you can link to (Insert > Bookmark)
  function slug(t) { return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "section"; }
  function ensureHeadingIds() {
    const used = new Set();
    richEditor.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h, i) => {
      let id = h.id && h.id.startsWith("h-") ? h.id : "h-" + slug(h.textContent) + "-" + (i + 1);
      while (used.has(id)) id += "x";
      used.add(id); h.id = id;
    });
  }
  function insertBookmark() {
    if (!needOpenDoc()) return;
    const names = new Set(Array.from(richEditor.querySelectorAll("a[data-bookmark]")).map((b) => b.dataset.bookmark));
    let n = 1; while (names.has("Bookmark " + n)) n++;
    const name = "Bookmark " + n;
    let id = "bm-" + slug(name), k = 2;
    while (richEditor.querySelector(idSel(id))) id = "bm-" + slug(name) + "-" + k++;
    focusRich(); restoreSelection();
    // inserted directly at the caret: the browser's insertHTML would split the paragraph around a non-editable marker
    const sel = window.getSelection();
    let r = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!r || !richEditor.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(richEditor); r.collapse(false); }
    r.collapse(false);
    const mark = document.createElement("a");
    mark.id = id; mark.dataset.bookmark = name; mark.title = "Bookmark: " + name;
    mark.setAttribute("contenteditable", "false");
    mark.textContent = "\u200b";
    const tail = document.createTextNode("\u200b");        // keeps a caret position after the marker
    r.insertNode(tail); r.insertNode(mark);
    const after = document.createRange(); after.setStart(tail, 1); after.collapse(true);
    sel.removeAllRanges(); sel.addRange(after);
    scheduleSave();
    const a = richEditor.querySelector(idSel(id));
    if (a) showBookmarkCard(a, true);
  }
  function insertInternalLink() {
    if (!needOpenDoc()) return;
    const t = listLinkTargets();
    if (!t.heads.length && !t.marks.length) { showToast("Add a heading or a bookmark first"); return; }
    openLinkEditor(anchorAtCaret(), { suggest: true });
  }

  // ---- Pasting or typing a web address turns it into a link
  function pasteAsLink(text, href) {
    const r = selectionInEditor();
    if (r && !r.collapsed) { document.execCommand("createLink", false, href); window.getSelection().collapseToEnd(); }
    else {
      const label = href.charAt(0) === "#" ? (targetLabel(href.slice(1)) || text) : text;
      document.execCommand("insertHTML", false, '<a href="' + escapeHtml(href) + '">' + escapeHtml(label) + "</a>&nbsp;");
    }
    scheduleSave(); syncToolbar();
  }
  function autoLinkBeforeCaret() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const r = sel.getRangeAt(0), node = r.startContainer;
    if (node.nodeType !== 3 || !richEditor.contains(node) || (node.parentElement && node.parentElement.closest("a"))) return;
    const upto = node.nodeValue.slice(0, r.startOffset);
    const m = upto.match(/(\S+)$/);
    if (!m) return;
    const tok = m[1].replace(/\u00a0/g, " ").replace(/[.,;:!?)\]}'"\u00bb]+$/, "");
    const href = urlFromText(tok);
    if (!href || href.charAt(0) === "#") return;
    const start = upto.length - m[1].length;
    const rg = document.createRange();
    rg.setStart(node, start); rg.setEnd(node, start + tok.length);
    sel.removeAllRanges(); sel.addRange(rg);
    document.execCommand("createLink", false, href);
    const a = anchorAtCaret();
    const after = document.createRange();
    const tail = m[1].length - tok.length;
    if (a && a.nextSibling && a.nextSibling.nodeType === 3 && tail) after.setStart(a.nextSibling, Math.min(tail, a.nextSibling.length));
    else if (a) after.setStartAfter(a);
    else return;
    after.collapse(true);
    sel.removeAllRanges(); sel.addRange(after);
    scheduleSave();
  }
  richEditor.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && state.currentDoc && isEditing()) autoLinkBeforeCaret();
  });

  function buildToc() {
    ensureHeadingIds();
    const hs = Array.from(richEditor.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter((h) => !h.closest(".toc"));
    if (!hs.length) return null;
    let html = '<div class="toc" contenteditable="false"><div class="toc-title">Table of contents</div>';
    hs.forEach((h) => { const lvl = +h.tagName[1] - 1; html += '<a href="#' + h.id + '" style="margin-left:' + lvl * 16 + 'px">' + escapeHtml(h.textContent.trim() || "(empty)") + "</a>"; });
    return html + "</div>";
  }
  function insertToc() {
    if (!needOpenDoc()) return;
    focusRich(); restoreSelection();
    const html = buildToc();
    if (!html) { showToast("Add some headings first"); return; }
    document.execCommand("insertHTML", false, html + "<p><br></p>");
    scheduleSave();
  }
  function updateToc() {
    if (!needOpenDoc()) return;
    const toc = richEditor.querySelector(".toc");
    if (!toc) { showToast("No table of contents in this document"); return; }
    const html = buildToc();
    if (!html) { toc.remove(); } else { const tmp = document.createElement("div"); tmp.innerHTML = html; toc.replaceWith(tmp.firstChild); }
    scheduleSave(); showToast("Table of contents updated");
  }
  function insertPageBreak() {
    if (!needOpenDoc()) return;
    focusRich(); restoreSelection();
    document.execCommand("insertHTML", false, '<hr class="page-break"><p><br></p>');
    scheduleSave();
  }
  function insertText(t) { if (!needOpenDoc()) return; focusRich(); restoreSelection(); document.execCommand("insertText", false, t); scheduleSave(); }
  const fmtDateLong = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const fmtTime = () => new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const SYMBOLS = {
    "Emoji": "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😍 😘 😎 🤔 😐 😢 😭 😡 👍 👎 👏 🙏 💪 👀 ❤ 💔 ⭐ 🔥 ✨ 🎉 ✅ ❌ ⚠ 💡 📌 📎 📅 ☀ ☁ ☂ ☕ 🍕 🎂 🚀".split(" "),
    "Math": "± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ⊃ ⊆ ⊇ ∧ ∨ ¬ ∀ ∃ ∅ ∴ ∵ ° ‰ ¼ ½ ¾ ² ³ ⁿ π µ".split(" "),
    "Greek": "α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω Α Β Γ Δ Ε Θ Λ Ξ Π Σ Φ Ψ Ω".split(" "),
    "Arrows": "← ↑ → ↓ ↔ ↕ ⇐ ⇑ ⇒ ⇓ ⇔ ↩ ↪ ↺ ↻ ➜ ➔ ➤ ▲ ▼ ◀ ▶ ● ○ ■ □ ◆ ◇ ★ ☆ ✓ ✗".split(" "),
    "Symbols": "© ® ™ § ¶ † ‡ • … – — « » ‹ › “ ” ‘ ’ ¡ ¿ € £ ¥ ¢ ₹ ₽ ¤ № ℃ ℉ ♠ ♣ ♥ ♦ ♩ ♪ ♫ ☎ ✉ ✂".split(" "),
  };
  function openSymbolsDialog() {
    if (!needOpenDoc()) return;
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    const box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = '<div class="modal-header"><h3>Emoji and special characters</h3><button class="modal-close" type="button">&times;</button></div><div class="modal-body"><div class="sym-tabs"></div><div class="sym-grid"></div></div>';
    const tabs = box.querySelector(".sym-tabs"), grid = box.querySelector(".sym-grid");
    const show = (name) => {
      tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.textContent === name));
      grid.innerHTML = "";
      SYMBOLS[name].forEach((ch) => { const b = document.createElement("button"); b.type = "button"; b.textContent = ch; b.onclick = () => { close(); insertText(ch); }; grid.appendChild(b); });
    };
    Object.keys(SYMBOLS).forEach((n) => { const b = document.createElement("button"); b.type = "button"; b.textContent = n; b.onclick = () => show(n); tabs.appendChild(b); });
    const close = () => { document.removeEventListener("keydown", onKey, true); ov.remove(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    box.querySelector(".modal-close").onclick = close;
    ov.appendChild(box); document.body.appendChild(ov);
    show("Emoji");
  }

  /* ---------------- Format painter ---------------- */
  let copiedFormat = null;
  function copyFormatting() {
    if (!needOpenDoc()) return;
    const n = activeElement();
    if (!n) return;
    const cs = getComputedStyle(n);
    const st = (c) => { try { return document.queryCommandState(c); } catch (_) { return false; } };
    copiedFormat = {
      bold: st("bold"), italic: st("italic"), underline: st("underline"), strike: st("strikeThrough"),
      font: (document.queryCommandValue("fontName") || "").replace(/["']/g, ""),
      size: currentFontSizePt(), color: cs.color, bg: cs.backgroundColor,
    };
    showToast("Formatting copied");
  }
  function pasteFormatting() {
    if (!needOpenDoc()) return;
    if (!copiedFormat) { showToast("Copy formatting first"); return; }
    focusRich(); restoreSelection();
    const f = copiedFormat, st = (c) => { try { return document.queryCommandState(c); } catch (_) { return false; } };
    document.execCommand("removeFormat");
    [["bold", f.bold], ["italic", f.italic], ["underline", f.underline], ["strikeThrough", f.strike]].forEach(([c, want]) => { if (want && !st(c)) document.execCommand(c); });
    if (f.font) document.execCommand("fontName", false, f.font);
    applyFontSize(f.size);
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("foreColor", false, f.color);
    if (f.bg && f.bg !== "rgba(0, 0, 0, 0)") document.execCommand("hiliteColor", false, f.bg);
    document.execCommand("styleWithCSS", false, false);
    scheduleSave(); syncToolbar();
  }

  /* ---------------- Paragraph helpers ---------------- */
  function toggleParaSpace(side) {
    if (!needOpenDoc()) return;
    focusRich();
    const prop = side === "before" ? "marginTop" : "marginBottom";
    const bl = selectedBlocks();
    const on = bl.length && bl.every((b) => b.style[prop]);
    bl.forEach((b) => { b.style[prop] = on ? "" : "12pt"; if (!b.getAttribute("style")) b.removeAttribute("style"); });
    scheduleSave();
  }
  function toggleParaBorder() {
    if (!needOpenDoc()) return;
    focusRich();
    const bl = selectedBlocks();
    const on = bl.length && bl.every((b) => b.style.border);
    bl.forEach((b) => { b.style.border = on ? "" : "1px solid #000"; b.style.padding = on ? "" : "4px 6px"; if (!b.getAttribute("style")) b.removeAttribute("style"); });
    scheduleSave();
  }
  function shadeParagraph(color) {
    focusRich();
    selectedBlocks().forEach((b) => { b.style.backgroundColor = color || ""; if (!b.getAttribute("style")) b.removeAttribute("style"); });
    scheduleSave();
  }
  function caseTo(kind) {
    if (!needOpenDoc()) return;
    focusRich(); restoreSelection();
    const r = selectionInEditor();
    const text = r ? r.toString() : "";
    if (!text) { showToast("Select some text first"); return; }
    const out = kind === "upper" ? text.toUpperCase() : kind === "lower" ? text.toLowerCase() : text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    document.execCommand("insertText", false, out);
    scheduleSave();
  }

  function toggleSmallCaps() {
    if (!needOpenDoc()) return;
    focusRich(); restoreSelection();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) { showToast("Select some text first"); return; }
    let cur = range.commonAncestorContainer;
    if (cur.nodeType !== 1) cur = cur.parentElement;
    let scSpan = null;
    while (cur && cur !== richEditor) {
      if (cur.nodeType === 1 && cur.style && cur.style.fontVariant === "small-caps") { scSpan = cur; break; }
      cur = cur.parentElement;
    }
    if (scSpan) {
      const parent = scSpan.parentNode;
      while (scSpan.firstChild) parent.insertBefore(scSpan.firstChild, scSpan);
      parent.removeChild(scSpan);
    } else {
      try {
        const span = document.createElement("span");
        span.style.fontVariant = "small-caps";
        span.appendChild(range.extractContents());
        range.insertNode(span);
        range.selectNodeContents(span);
        sel.removeAllRanges(); sel.addRange(range);
      } catch (_) {
        document.execCommand("insertHTML", false, '<span style="font-variant:small-caps">' + range.toString() + "</span>");
      }
    }
    scheduleSave();
  }

  /* ---------------- Clipboard (menu versions) ---------------- */
  async function pasteFromClipboard(plain) {
    if (!needOpenDoc()) return;
    focusRich(); restoreSelection();
    try {
      if (!plain && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          if (it.types.includes("text/html")) {
            const html = await (await it.getType("text/html")).text();
            let internal = false;
            if (internalCopy && it.types.includes("text/plain")) internal = normText(await (await it.getType("text/plain")).text()) === internalCopy;
            document.execCommand("insertHTML", false, internal ? stripImages(html) : cleanPastedHtml(html));
            scheduleSave(); return;
          }
        }
      }
      const t = await navigator.clipboard.readText();
      document.execCommand("insertText", false, t);
      scheduleSave();
    } catch (_) { showToast("Use Ctrl+V to paste (the browser blocked clipboard access)"); }
  }
  // Text copied from other programs (Word, web pages…) keeps its own font, e.g. Comic Sans: drop it so the
  // document's font is used. Content copied inside Docly keeps the fonts chosen here.
  let internalCopy = "";
  const normText = (t) => String(t || "").replace(/\r\n?/g, "\n").trim();
  const noteInternalCopy = () => { const s2 = window.getSelection(); internalCopy = normText(s2 ? s2.toString() : ""); };
  richEditor.addEventListener("copy", noteInternalCopy);
  richEditor.addEventListener("cut", noteInternalCopy);
  function cleanPastedHtml(html) {
    const d = document.createElement("div");
    d.innerHTML = html;
    d.querySelectorAll("img,picture,svg,video,canvas,script,style,meta,link,title,object,iframe").forEach((n) => n.remove());
    d.querySelectorAll("[style]").forEach((n) => { n.style.removeProperty("font-family"); if (!n.getAttribute("style")) n.removeAttribute("style"); });
    d.querySelectorAll("font[face]").forEach((n) => n.removeAttribute("face"));
    d.querySelectorAll("[class]").forEach((n) => n.removeAttribute("class"));
    return d.innerHTML;
  }
  function stripImages(html) { const d = document.createElement("div"); d.innerHTML = html; d.querySelectorAll("img,picture,svg,video,canvas,script,style").forEach((n) => n.remove()); return d.innerHTML; }
  richEditor.addEventListener("paste", (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const plainTxt = (cd.getData("text/plain") || "").trim();
    const pastedHref = urlFromText(plainTxt);
    if (pastedHref && !(activeElement() && activeElement().closest && activeElement().closest("a"))) { e.preventDefault(); pasteAsLink(plainTxt, pastedHref); return; }
    const html = cd.getData("text/html");
    const isInternal = !!internalCopy && normText(cd.getData("text/plain")) === internalCopy;
    if (html && !isInternal) {
      e.preventDefault();
      const cleaned = cleanPastedHtml(html);
      if (cleaned.trim()) document.execCommand("insertHTML", false, cleaned);
      else document.execCommand("insertText", false, cd.getData("text/plain"));
      scheduleSave();
    } else if (html && /<img|<picture|<svg/i.test(html)) {
      e.preventDefault();
      const cleaned = stripImages(html);
      if (cleaned.trim()) document.execCommand("insertHTML", false, cleaned);
      else document.execCommand("insertText", false, cd.getData("text/plain"));
      scheduleSave();
    } else if (!html && cd.files && cd.files.length) { e.preventDefault(); showToast("Images are not supported"); }
  });
  richEditor.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); showToast("Images are not supported"); }
  });

  /* ---------------- Automatic lists: "1)", "1." or "-" start a list (like Google Docs) ---------------- */
  const LIST_MARKER_RE = /^(?:(\d{1,3})[.)]|[-*\u2022])$/;
  let autoListUndo = null;   // set right after a list was auto-created, so one Backspace can take it back

  // Text typed straight into the page (outside any paragraph) confuses the browser's list commands:
  // give every run of such loose text its own <div>, keeping the caret where it was.
  function wrapRootInline() {
    const sel = window.getSelection();
    const saved = sel && sel.rangeCount ? (() => { const r = sel.getRangeAt(0); return [r.startContainer, r.startOffset, r.endContainer, r.endOffset]; })() : null;
    const isBlockish = (n) => n.nodeType === 1 && (BLOCK_RE.test(n.tagName) || /^(UL|OL|TABLE|HR)$/.test(n.tagName));
    let run = [];
    const flush = () => {
      if (run.length && !run.every((n) => n.nodeType === 3 && !n.nodeValue.trim())) {
        const d = document.createElement("div");
        run[0].parentNode.insertBefore(d, run[0]);
        run.forEach((n) => d.appendChild(n));
      }
      run = [];
    };
    Array.from(richEditor.childNodes).forEach((n) => { if (isBlockish(n)) flush(); else run.push(n); });
    flush();
    if (saved) {
      try { const r = document.createRange(); r.setStart(saved[0], saved[1]); r.setEnd(saved[2], saved[3]); sel.removeAllRanges(); sel.addRange(r); } catch (_) {}
    }
  }

  function autoListBlock(range) {
    let b = blockOf(range.startContainer);
    if (!b) {                                   // text typed straight into the page: give it a paragraph first
      document.execCommand("formatBlock", false, "P");
      const r = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0) : null;
      b = r ? blockOf(r.startContainer) : null;
    }
    return b;
  }
  const autoListEligible = (b) => b && !b.closest("li, pre, table, .toc, h1, h2, h3, h4, h5, h6, blockquote");

  function startListIn(block, ordered, startAt) {
    // an empty paragraph needs a <br> (and no stray empty text node), or Chrome applies the list to the wrong line
    if (!block.textContent && !block.querySelector("br")) {
      block.textContent = "";
      block.appendChild(document.createElement("br"));
    }
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(block, 0); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");
    const n = activeElement();
    const li = n && n.closest ? n.closest("li") : null;
    if (ordered && li && li.parentNode && startAt && startAt !== 1) li.parentNode.setAttribute("start", String(startAt));
    return li;
  }

  richEditor.addEventListener("keydown", (e) => {
    if (!state.currentDoc || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!isEditing()) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !selectionInEditor()) return;
    const range = sel.getRangeAt(0);

    // --- Backspace right after an automatic list: remove the list, keep the typed marker ("1)")
    if (e.key === "Backspace" && autoListUndo && sel.isCollapsed) {
      const n = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      const li = n && n.closest ? n.closest("li") : null;
      if (li && li === autoListUndo.li && !li.textContent.replace(/\u200b/g, "").trim()) {
        e.preventDefault();
        const ordered = li.parentNode.tagName === "OL";
        const marker = autoListUndo.marker;
        autoListUndo = null;
        document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");   // toggles the list off
        document.execCommand("insertText", false, marker);
        scheduleSave();
        return;
      }
    }
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Backspace" && e.key.length === 1) autoListUndo = null;
    if (!sel.isCollapsed) return;

    // --- Space after "1." / "1)" / "-" at the start of a paragraph
    if (e.key === " ") {
      const b0 = blockOf(range.startContainer);
      if (b0 && !autoListEligible(b0)) return;
      const probe = b0 || richEditor;
      const pre = document.createRange();
      pre.selectNodeContents(probe); pre.setEnd(range.endContainer, range.endOffset);
      const before = pre.toString().replace(/\u00a0/g, " ");
      if (!LIST_MARKER_RE.test(before)) return;
      wrapRootInline();
      const block = autoListBlock(window.getSelection().getRangeAt(0));
      if (!autoListEligible(block)) return;
      e.preventDefault();
      const m = before.match(/^(\d{1,3})[.)]$/);
      const cur = window.getSelection().getRangeAt(0);
      const del = document.createRange();
      del.selectNodeContents(block); del.setEnd(cur.endContainer, cur.endOffset);
      del.deleteContents();
      const li = startListIn(block, !!m, m ? parseInt(m[1], 10) : 1);
      autoListUndo = li ? { li, marker: before + " " } : null;
      scheduleSave(); syncToolbar();
      return;
    }

    // --- Enter on a line that starts with a list marker
    if (e.key === "Enter" && !e.shiftKey) {
      const b0 = blockOf(range.startContainer);
      if (b0 && !autoListEligible(b0)) return;
      const probe = b0 || richEditor;
      const whole = (probe.textContent || "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
      const after = document.createRange();
      after.selectNodeContents(probe); after.setStart(range.endContainer, range.endOffset);
      if (after.toString().trim()) return;                       // only when the caret is at the end of the line
      const only = whole.trim().match(LIST_MARKER_RE);          // just the marker:  "1)"  ->  list starts, stays empty
      const withText = whole.match(/^\s*(?:(\d{1,3})[.)]|[-*\u2022])\s+(\S[\s\S]*)$/);
      if (!only && !withText) return;
      wrapRootInline();
      const block = autoListBlock(window.getSelection().getRangeAt(0));
      if (!autoListEligible(block)) return;
      e.preventDefault();
      const marker = (only ? whole.trim() : whole.match(/^\s*(\d{1,3}[.)]|[-*\u2022])/)[1]);
      const num = (marker.match(/^(\d{1,3})/) || [])[1];
      // drop the marker (and the space after it) from the text
      const first = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let strip = marker.length + (only ? 0 : (whole.match(/^\s*\S+(\s+)/) || [0, ""])[1].length);
      let lead = (whole.match(/^\s*/) || [""])[0].length;
      strip += lead;
      while (strip > 0 && first.nextNode()) {
        const t = first.currentNode, take = Math.min(strip, t.nodeValue.length);
        t.nodeValue = t.nodeValue.slice(take); strip -= take;
      }
      const li = startListIn(block, !!num, num ? parseInt(num, 10) : 1);
      if (only) {
        autoListUndo = li ? { li, marker } : null;              // caret stays in the new, empty item
      } else {
        const s2 = window.getSelection(), r2 = document.createRange();
        r2.selectNodeContents(li || block); r2.collapse(false);
        s2.removeAllRanges(); s2.addRange(r2);
        document.execCommand("insertParagraph");                // text stays in item 1, caret moves to a new item
        autoListUndo = null;
      }
      scheduleSave(); syncToolbar();
    }
  });

  /* ---------------- Find / replace (next / previous) ---------------- */
  let lastFind = "";
  async function findInDoc(backwards) {
    if (!needOpenDoc()) return;
    if (!lastFind || backwards === undefined) {
      const t = await showModal("Find", "Find text:", lastFind, true);
      if (!t) return;
      lastFind = t;
      backwards = false;
    }
    focusRich();
    if (!window.find(lastFind, false, !!backwards, true, false, false, false)) showToast("No matches found");
  }

  /* ---------------- View helpers ---------------- */
  function setMode(editing) {
    richEditor.contentEditable = editing ? "true" : "false";
    document.body.classList.toggle("viewing", !editing);
    LS.set("docly-mode", editing ? "edit" : "view");
    showToast(editing ? "Editing mode" : "Viewing mode (read only)");
  }
  const isEditing = () => richEditor.contentEditable !== "false";
  function togglePageless() {
    pageArea.classList.toggle("pageless");
    LS.set("docly-pageless", pageArea.classList.contains("pageless") ? "1" : "0");
    rafRender(); mmRefresh();
  }
  function toggleNonPrinting() {
    document.body.classList.toggle("show-nonprint");
    LS.set("docly-nonprint", document.body.classList.contains("show-nonprint") ? "1" : "0");
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
  }
  function toggleToolbar() { toolbar.classList.toggle("hidden"); LS.set("docly-toolbar", toolbar.classList.contains("hidden") ? "0" : "1"); rafRender(); }
  if (LS.get("docly-toolbar", "1") === "0") toolbar.classList.add("hidden");
  if (LS.get("docly-pageless", "0") === "1") pageArea.classList.add("pageless");
  if (LS.get("docly-nonprint", "0") === "1") document.body.classList.add("show-nonprint");

  // outline of headings
  const outlinePanel = el("outlinePanel");
  function renderOutline() {
    if (outlinePanel.classList.contains("hidden")) return;
    outlinePanel.innerHTML = '<div class="outline-head"><span>Document outline</span><button type="button" aria-label="Close">&times;</button></div><div class="outline-list"></div>';
    outlinePanel.querySelector("button").onclick = toggleOutline;
    const list = outlinePanel.querySelector(".outline-list");
    ensureHeadingIds();
    const hs = richEditor.querySelectorAll("h1,h2,h3,h4,h5,h6");
    if (!hs.length) { list.innerHTML = '<div class="outline-empty">Headings you add to the document will appear here.</div>'; return; }
    hs.forEach((h) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "outline-item";
      b.style.paddingLeft = 8 + (+h.tagName[1] - 1) * 14 + "px";
      b.textContent = h.textContent.trim() || "(empty)";
      b.onclick = () => h.scrollIntoView({ block: "start", behavior: "smooth" });
      list.appendChild(b);
    });
  }
  function toggleOutline() { outlinePanel.classList.toggle("hidden"); renderOutline(); }
  let outlineTimer = null;

  /* ---------------- File helpers ---------------- */
  async function makeCopy() {
    if (!needOpenDoc()) return;
    try {
      if (state.dirty) await doSave(true);
      const title = "Copy of " + (state.currentDoc.title || "Untitled");
      const created = await api("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, type: "note" }) });
      await api("/api/documents/" + encodeURIComponent(created.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: contentHtml(), tags: state.currentDoc.tags || [] }) });
      await loadDocuments();
      showToast('Created "' + created.title + '"');
    } catch (err) { showToast("Copy error: " + err.message); }
  }
  function emailCopy() {
    if (!needOpenDoc()) return;
    const body = (richEditor.innerText || "").slice(0, 1500);
    window.location.href = "mailto:?subject=" + encodeURIComponent(state.currentDoc.title || "Document") + "&body=" + encodeURIComponent(body);
  }
  function renameDoc() { if (!needOpenDoc()) return; titleInput.focus(); titleInput.select(); }
  function setLanguage(code, label) { richEditor.lang = code; LS.set("docly-lang", code); showToast("Language: " + label); }
  richEditor.lang = LS.get("docly-lang", "en");
  function toggleSpellcheck() {
    const on = richEditor.spellcheck === false;
    richEditor.spellcheck = on; LS.set("docly-spell", on ? "1" : "0");
  }
  richEditor.spellcheck = LS.get("docly-spell", "1") === "1";
  function showDocDetails() {
    if (!needOpenDoc()) return;
    const d = state.currentDoc;
    const text = (richEditor.innerText || "").trim();
    const words = text ? text.split(/\s+/).length : 0;
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
    showModal("Document details",
      "Title: " + (d.title || "Untitled") + "\nCreated: " + fmt(d.createdAt) + "\nLast modified: " + fmt(d.updatedAt) +
      "\nWords: " + words + "\nCharacters: " + text.replace(/\n/g, "").length + "\nTables: " + richEditor.querySelectorAll("table").length +
      "\nTags: " + ((d.tags || []).join(", ") || "—"), "", false);
  }
  async function showFilePath() {
    if (!needOpenDoc()) return;
    try {
      const res = await api("/api/documents/" + encodeURIComponent(state.currentId) + "/path");
      const p = (res && res.path) || "";
      showModal("File path", "The current document is saved at:\n\n" + p, "", false);
    } catch (e) {
      showToast("Could not read file path");
    }
  }
  async function showPageSetup() {
    if (!needOpenDoc()) return;
    const m = rulerMetrics();
    const cm = (px) => (px / 96 * 2.54).toFixed(2);
    const cur = JSON.parse(LS.get("docly-page", "{}"));
    const res = await formDialog("Page setup", [
      { key: "size", label: "Paper size", type: "select", value: cur.size || "letter", options: [["letter", "Letter (21.6 × 27.9 cm)"], ["a4", "A4 (21.0 × 29.7 cm)"], ["legal", "Legal (21.6 × 35.6 cm)"]] },
      { key: "orient", label: "Orientation", type: "select", value: cur.orient || "portrait", options: [["portrait", "Portrait"], ["landscape", "Landscape"]] },
      { key: "top", label: "Top margin (cm)", type: "number", step: 0.1, min: 0, max: 8, value: cm(m.t) },
      { key: "bottom", label: "Bottom margin (cm)", type: "number", step: 0.1, min: 0, max: 8, value: cm(m.b) },
      { key: "left", label: "Left margin (cm)", type: "number", step: 0.1, min: 0, max: 8, value: cm(m.l) },
      { key: "right", label: "Right margin (cm)", type: "number", step: 0.1, min: 0, max: 8, value: cm(m.r) },
      { key: "color", label: "Page color", type: "color", value: cur.color || "#ffffff" },
    ], "OK");
    if (!res) return;
    LS.set("docly-page", JSON.stringify({ size: res.size, orient: res.orient, color: res.color }));
    const px = (v) => Math.max(0, Math.min(300, parseFloat(v) || 0)) / 2.54 * 96 + "px";
    richEditor.style.paddingTop = px(res.top); richEditor.style.paddingBottom = px(res.bottom);
    richEditor.style.paddingLeft = px(res.left); richEditor.style.paddingRight = px(res.right);
    saveMargins(); applyPage(); rafRender(); mmRefresh(); renderHeaderFooter(); applyPrintHF();
  }
  const PAPER_IN = { letter: [8.5, 11], a4: [8.2677, 11.6929], legal: [8.5, 14] };
  function applyPage() {
    const cur = JSON.parse(LS.get("docly-page", "{}"));
    let [w, h] = PAPER_IN[cur.size || "letter"];
    if (cur.orient === "landscape") [w, h] = [h, w];
    pageArea.style.width = Math.round(w * 96) + "px";
    richEditor.style.minHeight = Math.round(h * 96) + "px";
    if (cur.color && cur.color.toLowerCase() !== "#ffffff") richEditor.style.background = cur.color; else richEditor.style.background = "";
    if (typeof renderHeaderFooter === "function") { renderHeaderFooter(); applyPrintHF(); }
  }
  window.__pagePaper = () => {
    const cur = JSON.parse(LS.get("docly-page", "{}"));
    let [w, h] = PAPER_IN[cur.size || "letter"];
    if (cur.orient === "landscape") [w, h] = [h, w];
    return { w: Math.round(w * 1440), h: Math.round(h * 1440) };
  };
  function pageOrient() {
    const cur = JSON.parse(LS.get("docly-page", "{}"));
    return cur.orient || "portrait";
  }
  function setPageOrientation(orient) {
    if (!needOpenDoc()) return;
    const cur = JSON.parse(LS.get("docly-page", "{}"));
    cur.orient = orient;
    LS.set("docly-page", JSON.stringify(cur));
    applyPage(); rafRender(); mmRefresh();
    showToast("Page orientation: " + orient);
  }

  /* =====================================================================
     MINIMAP (View > Minimap, like VS Code)
     ===================================================================== */
  const minimap = el("minimap"), mmInner = el("mmInner"), mmPage = el("mmPage"), mmSlider = el("mmSlider");
  const MM_W = 120;
  let mmTimer = null, mmOn = LS.get("docly-minimap-v2", "0") === "1";
  const minimapVisible = () => mmOn;
  function mmRefresh() {
    if (!mmOn || !state.currentDoc) { minimap.classList.add("hidden"); return; }
    minimap.classList.remove("hidden");
    clearTimeout(mmTimer);
    mmTimer = setTimeout(mmRender, 120);
  }
  function mmRender() {
    if (!mmOn || !state.currentDoc) return;
    const W = richEditor.offsetWidth || 816;
    mmPage.innerHTML = contentHtml();
    mmPage.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    mmPage.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
    mmPage.style.cssText = richEditor.getAttribute("style") || "";
    mmPage.style.width = W + "px";
    mmPage.style.minHeight = "0";
    mmPage.style.transform = "scale(" + MM_W / W + ")";
    mmPage.style.transformOrigin = "0 0";
    mmInner.dataset.h = String(mmPage.offsetHeight * MM_W / W);
    mmInner.style.height = mmInner.dataset.h + "px";
    mmSync();
  }
  function mmSync() {
    if (!mmOn) return;
    const innerH = parseFloat(mmInner.dataset.h) || 0;
    const viewH = minimap.clientHeight;
    const sh = pageScroll.scrollHeight || 1, ch = pageScroll.clientHeight, st = pageScroll.scrollTop;
    const ratio = innerH / sh;                         // minimap px per document px
    const sliderH = Math.max(14, ch * ratio);
    const scrollMax = Math.max(1, sh - ch);
    const overflow = Math.max(0, innerH - viewH);      // taller than the panel: slide it like VS Code
    const offset = overflow * (st / scrollMax);
    mmInner.style.transform = "translateY(" + -offset + "px)";
    mmSlider.style.height = sliderH + "px";
    mmSlider.style.top = Math.max(0, st * ratio - offset) + "px";
    minimap._m = { innerH, viewH, sh, ch, overflow, scrollMax, ratio };
  }
  function mmScrollTo(clientY, centered) {
    const m = minimap._m; if (!m) return;
    const y = clientY - minimap.getBoundingClientRect().top;
    // invert: slider top = st*ratio - overflow*st/scrollMax  =>  st = top / (ratio - overflow/scrollMax)
    const k = m.ratio - m.overflow / m.scrollMax;
    const sliderH = parseFloat(mmSlider.style.height) || 14;
    const top = centered ? y - sliderH / 2 : y;
    const st = k > 0 ? top / k : 0;
    pageScroll.scrollTop = Math.max(0, Math.min(m.scrollMax, st));
  }
  let mmDrag = false;
  minimap.addEventListener("mousedown", (e) => {
    e.preventDefault(); mmDrag = true; minimap.classList.add("dragging");
    mmScrollTo(e.clientY, true);
  });
  document.addEventListener("mousemove", (e) => { if (mmDrag) mmScrollTo(e.clientY, true); });
  document.addEventListener("mouseup", () => { mmDrag = false; minimap.classList.remove("dragging"); });
  minimap.addEventListener("wheel", (e) => { pageScroll.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
  function toggleMinimap() {
    mmOn = !mmOn;
    LS.set("docly-minimap-v2", mmOn ? "1" : "0");
    mmRefresh(); rafRender();
  }
  pageScroll.addEventListener("scroll", mmSync, { passive: true });
  new ResizeObserver(() => { if (mmOn) mmRefresh(); }).observe(richEditor);
  new ResizeObserver(() => mmSync()).observe(minimap);
  richEditor.addEventListener("input", () => { mmRefresh(); clearTimeout(outlineTimer); outlineTimer = setTimeout(renderOutline, 400); });
  window.__doclyAfterOpen = () => { clearCellSel(); applyPage(); mmRefresh(); renderOutline(); setTimeout(mmRefresh, 60); };
  applyPage();
  if (LS.get("docly-mode", "edit") === "view") { richEditor.contentEditable = "false"; document.body.classList.add("viewing"); }

  /* =====================================================================
     HELP (?)  -> list of sections -> dialog
     ===================================================================== */
  const helpMenu = el("helpMenu"), helpOverlay = el("helpOverlay"), helpTitle = el("helpTitle"), helpBody = el("helpBody");
  function closeHelpMenu() { helpMenu.classList.add("hidden"); }
  function openHelpMenu(anchor) {
    closeMenu(); closeHelpMenu();
    let r = (anchor || helpBtn).getBoundingClientRect();
    if (!r.width) { const b = menuBar.querySelector('[data-menu="help"]'); if (b) r = b.getBoundingClientRect(); }
    placeFloating(helpMenu, r.left - 170 + r.width, r.bottom + 6);
    const f = helpMenu.querySelector("button"); if (f) f.focus();
  }
  helpBtn.addEventListener("click", (e) => { e.stopPropagation(); if (helpMenu.classList.contains("hidden")) openHelpMenu(); else closeHelpMenu(); });
  const homeHelpBtn = el("homeHelpBtn");
  homeHelpBtn.addEventListener("click", (e) => { e.stopPropagation(); if (helpMenu.classList.contains("hidden")) openHelpMenu(homeHelpBtn); else closeHelpMenu(); });
  const editorHelpBtn = el("editorHelpBtn");
  editorHelpBtn.addEventListener("click", (e) => { e.stopPropagation(); if (helpMenu.classList.contains("hidden")) openHelpMenu(editorHelpBtn); else closeHelpMenu(); });
  document.addEventListener("mousedown", (e) => { if (!helpMenu.contains(e.target) && !helpBtn.contains(e.target) && !homeHelpBtn.contains(e.target) && !editorHelpBtn.contains(e.target)) closeHelpMenu(); });
  helpMenu.addEventListener("click", (e) => { const b = e.target.closest("[data-help]"); if (b) { closeHelpMenu(); openHelpSection(b.dataset.help); } });
  helpMenu.addEventListener("keydown", (e) => {
    const items = Array.from(helpMenu.querySelectorAll("button")), i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === "Escape") { closeHelpMenu(); helpBtn.focus(); }
  });
  const closeHelpDialog = () => { helpOverlay.classList.add("hidden"); helpBody.innerHTML = ""; };
  el("helpClose").addEventListener("click", closeHelpDialog);
  helpOverlay.addEventListener("mousedown", (e) => { if (e.target === helpOverlay) closeHelpDialog(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !helpOverlay.classList.contains("hidden")) closeHelpDialog(); });

  const MIT = `MIT License

Copyright (c) 2026 Docly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

  // Same shortcuts as Google Docs (Windows / Chrome) for the features Docly has
  const SHORTCUTS = [
    ["Common actions", [
      ["Save", "Ctrl+S"], ["New document", "Ctrl+N"], ["Open document (search)", "Ctrl+O"], ["Print", "Ctrl+P"],
      ["Copy / Cut / Paste", "Ctrl+C / X / V"], ["Paste without formatting", "Ctrl+Shift+V"],
      ["Undo", "Ctrl+Z"], ["Redo", "Ctrl+Y  or  Ctrl+Shift+Z"], ["Insert or edit link", "Ctrl+K"],
      ["Find", "Ctrl+F"], ["Find next / previous", "Ctrl+G / Ctrl+Shift+G"], ["Find and replace", "Ctrl+H"],
      ["Select all", "Ctrl+A"], ["Show keyboard shortcuts", "Ctrl+/"], ["Word count", "Ctrl+Shift+C"],
      ["Compact controls (hide toolbar)", "Ctrl+Shift+F"],
    ]],
    ["Text formatting", [
      ["Bold", "Ctrl+B"], ["Italic", "Ctrl+I"], ["Underline", "Ctrl+U"], ["Strikethrough", "Alt+Shift+5"],
      ["Superscript", "Ctrl+."], ["Subscript", "Ctrl+,"], ["Increase font size", "Ctrl+Shift+."], ["Decrease font size", "Ctrl+Shift+,"],
      ["Clear formatting", "Ctrl+\\"], ["Copy text formatting", "Ctrl+Alt+C"], ["Paste text formatting", "Ctrl+Alt+V"], ["Insert footnote", "Ctrl+Alt+F"],
      ["Cycle capitalization", "Shift+F3"],
    ]],
    ["Paragraph formatting", [
      ["Normal text", "Ctrl+Alt+0"], ["Heading 1 – 6", "Ctrl+Alt+1 … 6"],
      ["Align left", "Ctrl+Shift+L"], ["Align center", "Ctrl+Shift+E"], ["Align right", "Ctrl+Shift+R"], ["Justify", "Ctrl+Shift+J"],
      ["Numbered list", "Ctrl+Shift+7"], ["Bulleted list", "Ctrl+Shift+8"], ["Checklist", "Ctrl+Shift+9"],
      ["Increase indent", "Ctrl+]"], ["Decrease indent", "Ctrl+["],
      ["Single line spacing", "Ctrl+1"], ["1.5 line spacing", "Ctrl+5"], ["Double line spacing", "Ctrl+2"],
      ["Add / remove space before paragraph", "Ctrl+0"],
    ]],
    ["Insert", [
      ["Page break", "Ctrl+Enter"], ["Next / previous table cell", "Tab / Shift+Tab"],
    ]],
    ["Menus", [
      ["File", "Alt+Shift+F"], ["Edit", "Alt+Shift+E"], ["View", "Alt+Shift+V"], ["Insert", "Alt+Shift+I"],
      ["Format", "Alt+Shift+O"], ["Tools", "Alt+Shift+T"], ["Help", "Alt+Shift+H"],
    ]],
    ["Navigation", [
      ["Start / end of document", "Ctrl+Home / Ctrl+End"], ["Move by word", "Ctrl+← / →"],
      ["Select by word", "Ctrl+Shift+← / →"], ["Select to start / end of line", "Shift+Home / End"],
    ]],
  ];

  function openHelpSection(name) {
    helpBody.innerHTML = "";
    if (name === "about") {
      helpTitle.textContent = "Program info";
      const dl = document.createElement("dl");
      [["Name", "Docly"], ["Version", "1.0"], ["What it is", "A local word processor for notes and documents."],
       ["Where data lives", "Your documents are saved as folders inside the \"documents\" folder next to the program. Nothing leaves your computer."],
       ["Requirements", "Python 3 only, no other dependencies."],
       ["Export", "Word, OpenDocument, RTF, PDF, TXT, HTML, EPUB, Markdown and JSON backup (File > Download)."]]
        .forEach(([k, v]) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); });
      helpBody.appendChild(dl);
    } else if (name === "license") {
      helpTitle.textContent = "License";
      const pre = document.createElement("pre"); pre.className = "help-license"; pre.textContent = MIT;
      const p = document.createElement("p");
      p.appendChild(document.createTextNode("Read more about the MIT license: "));
      const a = document.createElement("a"); a.href = "https://opensource.org/license/mit"; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "https://opensource.org/license/mit";
      p.appendChild(a);
      helpBody.appendChild(pre); helpBody.appendChild(p);
    } else {
      helpTitle.textContent = "Keyboard shortcuts";
      SHORTCUTS.forEach(([group, rows]) => {
        const h = document.createElement("div"); h.className = "sc-group"; h.textContent = group; helpBody.appendChild(h);
        rows.forEach(([label, keys]) => {
          const row = document.createElement("div"); row.className = "sc-row";
          const l = document.createElement("span"); l.textContent = label;
          const k = document.createElement("kbd"); k.textContent = keys;
          row.appendChild(l); row.appendChild(k); helpBody.appendChild(row);
        });
      });
    }
    helpOverlay.classList.remove("hidden");
    helpBody.scrollTop = 0;
  }
  el("infoBtn").addEventListener("click", () => openHelpSection("about"));

  /* =====================================================================
     Keyboard shortcuts (Google Docs style)
     ===================================================================== */
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const code = e.code, key = e.key;
    const ae = document.activeElement;
    const inEd = ae === richEditor || richEditor.contains(ae);
    const ready = !!state.currentDoc;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    const edit = (fn) => { if (!ready) return; stop(); if (!isEditing()) { showToast("Viewing mode: switch to Editing in View > Mode"); return; } focusRich(); fn(); };

    if (key === "F1") { stop(); openHelpMenu(); return; }
    const typing = ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
    if (typing && !(mod && ["KeyS", "KeyN", "KeyP", "KeyO", "Slash"].includes(code))) return;
    if (mod && !e.altKey && inEd) {
      if (code === "KeyZ" && !e.shiftKey && fastUndoNow()) { stop(); return; }
      if ((code === "KeyY" || (code === "KeyZ" && e.shiftKey)) && fastRedoNow()) { stop(); return; }
    }

    // ---- alt+shift: menu bar
    if (e.altKey && e.shiftKey && !mod) {
      const map = { KeyF: "file", KeyE: "edit", KeyV: "view", KeyI: "insert", KeyO: "format", KeyT: "tools", KeyH: "help", KeyB: "table" };
      if (map[code] && ready) { stop(); const b = menuBar.querySelector('[data-menu="' + map[code] + '"]'); if (b) openMenu(b); return; }
      if (code === "Digit5" && inEd) { edit(() => { document.execCommand("strikeThrough"); scheduleSave(); syncToolbar(); }); return; }
      if (code === "KeyK" && inEd) { edit(() => toggleSmallCaps()); return; }
    }

    // ---- Tab in tables / indent
    if (key === "Tab" && inEd && !mod && !e.altKey && isEditing()) {
      const cell = currentCell();
      if (cell) {
        stop();
        const t = cell.closest("table");
        let cells = Array.from(t.querySelectorAll("th,td"));
        let i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
        if (i >= cells.length) { insertRowAt(t, gridOf(t).length - 1, true); cells = Array.from(t.querySelectorAll("th,td")); scheduleSave(); }
        if (i >= 0 && cells[i]) placeCaretIn(cells[i], true);
        return;
      }
      stop(); document.execCommand(e.shiftKey ? "outdent" : "indent"); scheduleSave(); return;
    }
    if (cellSel && inEd && !mod && (key === "Backspace" || key === "Delete")) {
      stop();
      const x = tableCtx(); if (x) { selectedCells(x).forEach((c) => { c.innerHTML = "<br>"; }); scheduleSave(); }
      return;
    }
    if (cellSel && key === "Escape") { clearCellSel(); return; }
    if (cellSel && !mod && key.length === 1) { const c = currentCell(); clearCellSel(); if (c) placeCaretIn(c, false); }

    if (!mod) return;

    // ---- ctrl+alt
    if (e.altKey && !e.shiftKey) {
      if (/^Digit[0-6]$/.test(code) && inEd) { edit(() => applyBlockStyle(code === "Digit0" ? "P" : "H" + code[5])); return; }
      if (code === "KeyC" && inEd) { stop(); copyFormatting(); return; }
      if (code === "KeyF" && inEd) { stop(); insertFootnote(); return; }
      if (code === "KeyV" && inEd) { edit(pasteFormatting); return; }
      return;
    }

    // ---- ctrl+shift
    if (e.shiftKey) {
      switch (code) {
        case "KeyL": if (inEd) edit(() => { document.execCommand("justifyLeft"); scheduleSave(); syncToolbar(); }); return;
        case "KeyE": if (inEd) edit(() => { document.execCommand("justifyCenter"); scheduleSave(); syncToolbar(); }); return;
        case "KeyR": if (inEd) edit(() => { document.execCommand("justifyRight"); scheduleSave(); syncToolbar(); }); return;
        case "KeyJ": if (inEd) edit(() => { document.execCommand("justifyFull"); scheduleSave(); syncToolbar(); }); return;
        case "Digit7": if (inEd) edit(() => { document.execCommand("insertOrderedList"); scheduleSave(); }); return;
        case "Digit8": if (inEd) edit(() => { document.execCommand("insertUnorderedList"); scheduleSave(); }); return;
        case "Digit9": if (inEd) edit(toggleChecklist); return;
        case "Period": if (inEd) edit(() => stepFontSize(1)); return;
        case "Comma": if (inEd) edit(() => stepFontSize(-1)); return;
        case "KeyG": if (ready) { stop(); findInDoc(true); } return;
        case "KeyC": if (ready) { stop(); showWordCount(); } return;
        case "KeyF": if (ready) { stop(); toggleToolbar(); } return;
        default: return;
      }
    }

    // ---- ctrl only
    switch (code) {
      case "KeyS": stop(); if (ready) { doSave(true); showToast("Document saved"); } return;
      case "KeyN": stop(); newDocBtn.click(); return;
      case "KeyO": stop(); activeSearch().focus(); showToast("Search a document to open"); return;
      case "KeyP": stop(); if (ready) window.print(); else showToast("Open a document to print"); return;
      case "KeyF": stop(); if (ready) { lastFind = ""; findInDoc(); } else activeSearch().focus(); return;
      case "KeyH": stop(); if (ready) showFindReplaceDialog(); else showToast("Open a document for find and replace"); return;
      case "KeyG": if (ready) { stop(); findInDoc(false); } return;
      case "KeyK": if (ready) { stop(); insertLink(); } return;
      case "Slash": stop(); openHelpSection("shortcuts"); return;
      case "Backslash": if (inEd) edit(() => { document.execCommand("removeFormat"); scheduleSave(); syncToolbar(); }); return;
      case "Period": if (inEd) edit(() => { document.execCommand("superscript"); scheduleSave(); syncToolbar(); }); return;
      case "Comma": if (inEd) edit(() => { document.execCommand("subscript"); scheduleSave(); syncToolbar(); }); return;
      case "BracketRight": if (inEd) edit(() => { document.execCommand("indent"); scheduleSave(); }); return;
      case "BracketLeft": if (inEd) edit(() => { document.execCommand("outdent"); scheduleSave(); }); return;
      case "Digit1": if (inEd) edit(() => applyLineSpacing("1")); return;
      case "Digit5": if (inEd) edit(() => applyLineSpacing("1.5")); return;
      case "Digit2": if (inEd) edit(() => applyLineSpacing("2")); return;
      case "Digit0": if (inEd) edit(() => toggleParaSpace("before")); return;
      case "Enter": if (inEd) edit(insertPageBreak); return;
      default: return;
    }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "F3" && e.shiftKey && state.currentDoc && richEditor.contains(document.activeElement)) { e.preventDefault(); caseBtn.click(); }
  });


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

  const fontNames = Array.from(el("fontFamilySelect").options).map((o) => o.value);
  const langs = [["en", "English"], ["it", "Italiano"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["pt", "Português"]];
  const sc = (c, v) => cmd(c, v);
  const pickAnchor = () => ({ x: lastMenuAnchor.x + 12, y: lastMenuAnchor.y + 12 });

  const MENUS = {
    file: [
      { label: "New document", key: "Ctrl+N", run: () => newDocBtn.click() },
      { label: "Open document", key: "Ctrl+O", run: async () => { await goHome(); activeSearch().focus(); } },
      { label: "All documents (home)", run: () => goHome() },
      { label: "Make a copy", run: makeCopy },
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
      "-",
      { label: "Save", key: "Ctrl+S", run: needDoc(() => { doSave(true); showToast("Document saved"); }) },
      { label: "Rename", run: renameDoc },
      { label: "Add / remove favorite", run: needDoc(() => favBtn.click()) },
      { label: "Tags…", run: openTagsDialog },
      { label: "Move to folder…", run: needDoc(moveCurrentToCollection) },
      { label: "Import…", run: openImportPicker },
      { label: "Move to trash", run: needDoc(() => deleteBtn.click()) },
      "-",
      { label: "Language", sub: langs.map(([c, n]) => ({ label: n, check: () => richEditor.lang === c, run: () => setLanguage(c, n) })) },
      { label: "Page setup", run: showPageSetup },
      { label: "Print", key: "Ctrl+P", run: clickId("printBtn") },
      "-",
      { label: "Document details", run: showDocDetails },
      { label: "Word count", key: "Ctrl+Shift+C", run: needDoc(showWordCount) },
      { label: "Show file path", run: showFilePath },
    ],
    edit: [
      { label: "Undo", key: "Ctrl+Z", run: clickId("undoBtn") },
      { label: "Redo", key: "Ctrl+Y", run: clickId("redoBtn") },
      "-",
      { label: "Cut", key: "Ctrl+X", run: cmd("cut") },
      { label: "Copy", key: "Ctrl+C", run: cmd("copy") },
      { label: "Paste", key: "Ctrl+V", run: () => pasteFromClipboard(false) },
      { label: "Paste without formatting", key: "Ctrl+Shift+V", run: () => pasteFromClipboard(true) },
      { label: "Select all", key: "Ctrl+A", run: cmd("selectAll") },
      { label: "Delete", run: cmd("delete") },
      "-",
      { label: "Find", key: "Ctrl+F", run: () => { lastFind = ""; findInDoc(); } },
      { label: "Find and replace", key: "Ctrl+H", run: clickId("findBtn") },
      "-",
      { label: "Copy formatting", key: "Ctrl+Alt+C", run: copyFormatting },
      { label: "Paste formatting", key: "Ctrl+Alt+V", run: pasteFormatting },
      { label: "Clear formatting", key: "Ctrl+\\", run: clickId("clearFormatBtn") },
      "-",
      { label: "Editing preferences", sub: [
        { label: "Spelling check", check: () => richEditor.spellcheck, run: toggleSpellcheck },
      ] },
    ],
    view: [
      { label: "Mode", sub: [
        { label: "Editing", check: () => isEditing(), run: () => setMode(true) },
        { label: "Viewing", check: () => !isEditing(), run: () => setMode(false) },
      ] },
      "-",
      { label: "Print layout (pages)", check: () => !pageArea.classList.contains("pageless"), run: togglePageless },
      { label: "Ruler", check: () => rulersVisible(), run: toggleRuler },
      { label: "Document outline", check: () => !outlinePanel.classList.contains("hidden"), run: toggleOutline },
      { label: "Non-printing characters", check: () => document.body.classList.contains("show-nonprint"), run: toggleNonPrinting },
      { label: "Toolbar", key: "Ctrl+Shift+F", check: () => !toolbar.classList.contains("hidden"), run: toggleToolbar },
      { label: "Minimap", check: () => minimapVisible(), run: toggleMinimap },
      { label: "Document list", check: () => sidebarOpen(), run: toggleSidebar },
      "-",
      { label: "Zoom", sub: [
        zoomItem("0.5", "50%"), zoomItem("0.75", "75%"), zoomItem("0.9", "90%"), zoomItem("1", "100%"),
        zoomItem("1.25", "125%"), zoomItem("1.5", "150%"), zoomItem("2", "200%"),
      ] },
      { label: "Full screen", check: () => !!document.fullscreenElement, run: toggleFullscreen },
      "-",
      { label: "Light / dark theme", run: () => themeToggle.click() },
    ],
    insert: [
      { label: "Table", run: () => { if (!needOpenDoc()) return; const a = pickAnchor(); openTablePicker(a.x, a.y); } },
      { label: "Emoji and special characters", run: openSymbolsDialog },
      { label: "Link", key: "Ctrl+K", run: insertLink },
      { label: "Horizontal line", run: clickId("hrBtn") },
      { label: "Code block", run: clickId("codeBtn") },
      { label: "Checklist", key: "Ctrl+Shift+9", run: toggleChecklist },
      "-",
      { label: "Page break", key: "Ctrl+Enter", run: needDoc(insertPageBreak) },
      { label: "Footnote", key: "Ctrl+Alt+F", run: needDoc(insertFootnote) },
      { label: "Header & footer…", run: needDoc(showHeaderFooter) },
      { label: "Page numbers", sub: [
        ["none", "None"], ["top-left", "Top left"], ["top-center", "Top center"], ["top-right", "Top right"],
        ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"], ["bottom-right", "Bottom right"],
      ].map(([v, t]) => ({ label: t, check: () => docLayout().pageNumbers === v, run: needDoc(() => setLayout({ pageNumbers: v })) })) },
      { label: "Date and time", sub: [
        { label: "Date", run: () => insertText(fmtDateLong()) },
        { label: "Time", run: () => insertText(fmtTime()) },
        { label: "Date and time", run: () => insertText(fmtDateLong() + ", " + fmtTime()) },
      ] },
      "-",
      { label: "Bookmark", run: insertBookmark },
      { label: "Link to heading or bookmark", run: insertInternalLink },
      { label: "Table of contents", sub: [
        { label: "Insert table of contents", run: insertToc },
        { label: "Update table of contents", run: updateToc },
      ] },
    ],
    format: [
      { label: "Text", sub: [
        { label: "Bold", key: "Ctrl+B", run: sc("bold") },
        { label: "Italic", key: "Ctrl+I", run: sc("italic") },
        { label: "Underline", key: "Ctrl+U", run: sc("underline") },
        { label: "Strikethrough", key: "Alt+Shift+5", run: sc("strikeThrough") },
        { label: "Small caps", key: "Alt+Shift+K", run: toggleSmallCaps },
        { label: "Superscript", key: "Ctrl+.", run: sc("superscript") },
        { label: "Subscript", key: "Ctrl+,", run: sc("subscript") },
        "-",
        { label: "Size", sub: [
          { label: "Increase font size", key: "Ctrl+Shift+.", run: needDoc(() => stepFontSize(1)) },
          { label: "Decrease font size", key: "Ctrl+Shift+,", run: needDoc(() => stepFontSize(-1)) },
        ] },
        { label: "Capitalization", sub: [
          { label: "lowercase", run: () => caseTo("lower") },
          { label: "UPPERCASE", run: () => caseTo("upper") },
          { label: "Title Case", run: () => caseTo("title") },
        ] },
        "-",
        { label: "Text color", run: clickId("textColorBtn") },
        { label: "Highlight color", run: clickId("highlightBtn") },
      ] },
      { label: "Font", sub: fontNames.map((f) => ({ label: f, run: needDoc(() => { applyFontFamily(f); syncToolbar(); }) })) },
      { label: "Font size", sub: [
        { label: "Increase font size", key: "Ctrl+Shift+.", run: needDoc(() => stepFontSize(1)) },
        { label: "Decrease font size", key: "Ctrl+Shift+,", run: needDoc(() => stepFontSize(-1)) },
      ] },
      { label: "Capitalization", sub: [
        { label: "lowercase", run: () => caseTo("lower") },
        { label: "UPPERCASE", run: () => caseTo("upper") },
        { label: "Title Case", run: () => caseTo("title") },
      ] },
      { label: "Page orientation", sub: [
        { label: "Portrait", check: () => pageOrient() === "portrait", run: () => setPageOrientation("portrait") },
        { label: "Landscape", check: () => pageOrient() === "landscape", run: () => setPageOrientation("landscape") },
      ] },
      "-",
      { label: "Paragraph styles", sub: [
        { label: "Normal text", key: "Ctrl+Alt+0", run: () => applyBlockStyle("P") },
        { label: "Title", run: () => applyBlockStyle("TITLE") },
        { label: "Subtitle", run: () => applyBlockStyle("SUBTITLE") },
        { label: "Heading 1", key: "Ctrl+Alt+1", run: () => applyBlockStyle("H1") },
        { label: "Heading 2", key: "Ctrl+Alt+2", run: () => applyBlockStyle("H2") },
        { label: "Heading 3", key: "Ctrl+Alt+3", run: () => applyBlockStyle("H3") },
        { label: "Heading 4", key: "Ctrl+Alt+4", run: () => applyBlockStyle("H4") },
        { label: "Heading 5", key: "Ctrl+Alt+5", run: () => applyBlockStyle("H5") },
        { label: "Heading 6", key: "Ctrl+Alt+6", run: () => applyBlockStyle("H6") },
        { label: "Quote", run: () => applyBlockStyle("BLOCKQUOTE") },
      ] },
      { label: "Align", sub: [
        { label: "Left", key: "Ctrl+Shift+L", run: sc("justifyLeft") },
        { label: "Center", key: "Ctrl+Shift+E", run: sc("justifyCenter") },
        { label: "Right", key: "Ctrl+Shift+R", run: sc("justifyRight") },
        { label: "Justified", key: "Ctrl+Shift+J", run: sc("justifyFull") },
      ] },
      { label: "Lists", sub: [
        { label: "Bulleted list", key: "Ctrl+Shift+8", run: sc("insertUnorderedList") },
        { label: "Numbered list", key: "Ctrl+Shift+7", run: sc("insertOrderedList") },
        { label: "Checklist", key: "Ctrl+Shift+9", run: toggleChecklist },
      ] },
      { label: "Indent", sub: [
        { label: "Increase indent", key: "Ctrl+]", run: sc("indent") },
        { label: "Decrease indent", key: "Ctrl+[", run: sc("outdent") },
      ] },
      { label: "Line spacing", sub: [
        { label: "Single", key: "Ctrl+1", run: () => applyLineSpacing("1") },
        { label: "1.15", run: () => applyLineSpacing("1.15") },
        { label: "1.5", key: "Ctrl+5", run: () => applyLineSpacing("1.5") },
        { label: "Double", key: "Ctrl+2", run: () => applyLineSpacing("2") },
      ] },
      { label: "Paragraph spacing", sub: [
        { label: "Add / remove space before", key: "Ctrl+0", run: () => toggleParaSpace("before") },
        { label: "Add / remove space after", run: () => toggleParaSpace("after") },
      ] },
      { label: "Paragraph borders and shading", sub: [
        { label: "Border on / off", run: toggleParaBorder },
        { label: "Shading…", run: () => { if (!needOpenDoc()) return; const a = pickAnchor(); openPaletteAt(a.x, a.y, shadeParagraph, "None"); } },
      ] },
      "-",
      { label: "Clear formatting", key: "Ctrl+\\", run: clickId("clearFormatBtn") },
    ],
    table: [
      { label: "Insert table", run: () => { if (!needOpenDoc()) return; const a = pickAnchor(); openTablePicker(a.x, a.y); } },
      "-",
      { label: "Insert row above", disabled: () => !inTable(), run: T.rowAbove },
      { label: "Insert row below", disabled: () => !inTable(), run: T.rowBelow },
      { label: "Insert column left", disabled: () => !inTable(), run: T.colLeft },
      { label: "Insert column right", disabled: () => !inTable(), run: T.colRight },
      "-",
      { label: "Delete row", disabled: () => !inTable(), run: T.delRow },
      { label: "Delete column", disabled: () => !inTable(), run: T.delCol },
      { label: "Delete table", disabled: () => !inTable(), run: T.delTable },
      "-",
      { label: "Merge cells", disabled: () => !cellSel, run: T.merge },
      { label: "Split cell", disabled: () => !inTable(), run: T.split },
      "-",
      { label: "Distribute rows", disabled: () => !inTable(), run: T.distRows },
      { label: "Distribute columns", disabled: () => !inTable(), run: T.distCols },
      "-",
      { label: "Cell vertical alignment", disabled: () => !inTable(), sub: [
        { label: "Top", run: () => T.vAlign("top") }, { label: "Middle", run: () => T.vAlign("middle") }, { label: "Bottom", run: () => T.vAlign("bottom") },
      ] },
      { label: "Cell content alignment", disabled: () => !inTable(), sub: [
        { label: "Left", run: () => T.hAlign("left") }, { label: "Center", run: () => T.hAlign("center") },
        { label: "Right", run: () => T.hAlign("right") }, { label: "Justified", run: () => T.hAlign("justify") },
      ] },
      { label: "Cell background color…", disabled: () => !inTable(), run: () => { const a = pickAnchor(); openPaletteAt(a.x, a.y, T.bg, "None"); } },
      { label: "Border color…", disabled: () => !inTable(), run: () => { const a = pickAnchor(); openPaletteAt(a.x, a.y, (c) => c && T.borderColor(c), "Cancel"); } },
      { label: "Border width", disabled: () => !inTable(), sub: [
        { label: "No border", run: () => T.borderWidth(0) }, { label: "1 pt", run: () => T.borderWidth(1) },
        { label: "2 pt", run: () => T.borderWidth(2) }, { label: "3 pt", run: () => T.borderWidth(3) },
        { label: "4 pt", run: () => T.borderWidth(4) }, { label: "6 pt", run: () => T.borderWidth(6) },
      ] },
      "-",
      { label: "Column width…", disabled: () => !inTable(), run: T.colWidth },
      { label: "Minimum row height…", disabled: () => !inTable(), run: T.rowHeight },
      { label: "Header row", disabled: () => !inTable(), check: () => inTable() && T.hasHeader(), run: () => T.setHeader(!T.hasHeader()) },
      { label: "Table properties…", disabled: () => !inTable(), run: T.props },
    ],
    tools: [
      { label: "Word count", key: "Ctrl+Shift+C", run: needDoc(showWordCount) },
      { label: "Spelling check", check: () => richEditor.spellcheck, run: toggleSpellcheck },
      { label: "Change case", run: clickId("caseBtn") },
      "-",
      { label: "Text color", run: clickId("textColorBtn") },
      { label: "Highlight color", run: clickId("highlightBtn") },
    ],
    help: [
      { label: "Program info", run: () => openHelpSection("about") },
      { label: "License", run: () => openHelpSection("license") },
      { label: "Keyboard shortcuts", key: "Ctrl+/", run: () => openHelpSection("shortcuts") },
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
      if (item.disabled && item.disabled()) b.disabled = true;
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
  let lastMenuAnchor = { x: 120, y: 120 };
  function openMenuAt(name, x, y) {
    closeMenu(); closeTablePicker(); closeHelpMenu();
    menuPanel.innerHTML = "";
    renderMenuItems(MENUS[name], menuPanel);
    lastMenuAnchor = { x, y };
    menuPanel.classList.remove("hidden");
    const w = menuPanel.offsetWidth, h = menuPanel.offsetHeight;
    menuPanel.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 8)) + "px";
    menuPanel.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 8)) + "px";
  }
  function openMenu(btn) {
    const name = btn.dataset.menu;
    closeTablePicker(); closeHelpMenu(); closeColorPanel(); closeSizeMenu();
    menuPanel.innerHTML = "";
    renderMenuItems(MENUS[name], menuPanel);
    const r = btn.getBoundingClientRect();
    lastMenuAnchor = { x: r.left, y: r.bottom + 2 };
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
