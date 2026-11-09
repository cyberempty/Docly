/* Docly - main.js
 * Desktop app (Electron). Starts a small local server on 127.0.0.1 (random free port, reachable only
 * from this computer) that serves static/ and the REST API, and opens it in its own window.
 * Documents live in ./documents (one "<name>_Docly" folder per document) and everything the app
 * remembers (folders, settings, window size) lives in ./documents/preference.json.
 */
"use strict";

const { app, BrowserWindow, Menu, shell, dialog, session, screen, nativeImage } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE_DIR = __dirname;
const DOCS_DIR = path.join(BASE_DIR, "documents");
const STATIC_DIR = path.join(BASE_DIR, "static");
const APP_TRASH_DIR = path.join(BASE_DIR, ".trash");
const ICON_PNG = path.join(STATIC_DIR, "icon.png");
const ICON_ICO = path.join(STATIC_DIR, "icon.ico");
const HOST = "127.0.0.1";
const VALID_TYPES = new Set(["note"]);
const META_FILE = "document.json";
const FOLDER_SUFFIX = "_Docly";
const PREFS_FILE = path.join(DOCS_DIR, "preference.json");
const LEGACY_FOLDERS_FILE = path.join(DOCS_DIR, ".folders.json");
const LEGACY_SETTINGS_FILE = path.join(DOCS_DIR, ".settings.json");
const PAGE_NUMBERS = new Set(["none", "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"]);

/* ---------------- App identity and portable data ---------------- */
app.setName("Docly");
if (process.platform === "win32") app.setAppUserModelId("Docly");
if (process.platform === "linux") app.commandLine.appendSwitch("no-sandbox");   // the downloaded engine has no SUID helper

/* ---------------- Helpers (same rules as the former server.py) ---------------- */
function nowIso() { return new Date().toISOString().slice(0, 19) + "+00:00"; }

function validIso(value) {
  if (typeof value !== "string" || !value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return null; }
}

function writeJsonAtomic(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function cleanCollection(value) {
  if (typeof value !== "string") return "";
  value = value.replace(/[\x00-\x1f]/g, "").replace(/\s+/g, " ").trim();
  return Array.from(value).slice(0, 60).join("");
}

function cleanLayout(value) {
  const out = {};
  if (!isObj(value)) return out;
  for (const key of ["header", "footer"]) {
    if (typeof value[key] === "string") out[key] = Array.from(value[key]).slice(0, 300).join("");
  }
  if (PAGE_NUMBERS.has(value.pageNumbers)) out.pageNumbers = value.pageNumbers;
  if (value.skipFirst === true) out.skipFirst = true;
  return out;
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeName(name) {
  name = (typeof name === "string" ? name : "").trim();
  name = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().replace(/^[ .]+|[ .]+$/g, "");
  if (!name) name = "Untitled";
  return Array.from(name).slice(0, 120).join("");
}

function sortNames(names) {
  return names.slice().sort((a, b) => {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/* ---------------- preference.json: folders + settings (+ window state) ---------------- */
function readPrefs() {
  let folders = null, settings = null;
  const data = readJson(PREFS_FILE);
  if (isObj(data)) {
    if (Array.isArray(data.folders)) folders = data.folders.map(cleanCollection).filter(Boolean);
    if (isObj(data.settings)) settings = data.settings;
    else if (Object.keys(data).some((k) => k.startsWith("docly-"))) {       // flat format of an older version
      settings = {};
      for (const k of Object.keys(data)) if (k.startsWith("docly-")) settings[k] = data[k];
    }
  }
  if (settings === null) {
    const legacy = readJson(LEGACY_SETTINGS_FILE);
    if (isObj(legacy)) settings = legacy;
  }
  if (folders === null) {
    const legacy = readJson(LEGACY_FOLDERS_FILE);
    folders = Array.isArray(legacy) ? legacy.map(cleanCollection).filter(Boolean) : [];
  }
  return { folders, settings };
}

function writePrefs(folders, settings) {
  const seen = new Set(), names = [];
  for (const n of folders || []) {
    const c = cleanCollection(n);
    if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); names.push(c); }
  }
  const out = { folders: sortNames(names) };
  if (settings !== null && settings !== undefined) out.settings = settings;
  const cur = readJson(PREFS_FILE);
  if (isObj(cur) && isObj(cur.window)) out.window = cur.window;          // keep the window state
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  writeJsonAtomic(PREFS_FILE, out);
  for (const legacy of [LEGACY_FOLDERS_FILE, LEGACY_SETTINGS_FILE]) {
    try { fs.unlinkSync(legacy); } catch (_) { /* not there */ }
  }
}

function loadFolders() { return readPrefs().folders; }
function saveFolders(names) { writePrefs(names, readPrefs().settings); }
function loadSettings() { return readPrefs().settings; }

function saveSettings(values) {
  const clean = {};
  for (const k of Object.keys(values || {})) {
    const v = values[k];
    if (/^docly-[a-z0-9-]{1,40}$/.test(k) && typeof v === "string" && v.length <= 50000) clean[k] = v;
    if (Object.keys(clean).length >= 60) break;
  }
  writePrefs(readPrefs().folders, clean);
  return clean;
}

function saveWindowState(state) {
  try {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    const cur = readJson(PREFS_FILE);
    const out = isObj(cur) ? cur : readPrefsAsFile();
    out.window = state;
    writeJsonAtomic(PREFS_FILE, out);
  } catch (_) { /* not important */ }
}

function readPrefsAsFile() {      // no (valid) preference.json yet: start from the legacy files, if any
  const p = readPrefs();
  const out = { folders: sortNames(p.folders) };
  if (p.settings !== null) out.settings = p.settings;
  return out;
}

/* ---------------- Documents ---------------- */
let index = new Map();            // id -> folder name

function ensureDocsDir() { fs.mkdirSync(DOCS_DIR, { recursive: true }); }

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (_) { return false; } }

function buildIndex() {
  ensureDocsDir();
  const idx = new Map();
  for (const entry of fs.readdirSync(DOCS_DIR).sort()) {
    const folder = path.join(DOCS_DIR, entry);
    const meta = path.join(folder, META_FILE);
    if (isDir(folder) && isFile(meta)) {
      const data = readJson(meta);
      if (isObj(data) && data.id) idx.set(data.id, entry);
    }
  }
  return idx;
}

function uniqueFolderName(base, ignore) {
  let candidate = base + FOLDER_SUFFIX, i = 1;
  for (;;) {
    if (!isDir(path.join(DOCS_DIR, candidate)) || (ignore != null && candidate.toLowerCase() === ignore.toLowerCase())) return candidate;
    i++;
    candidate = `${base} (${i})${FOLDER_SUFFIX}`;
  }
}

function loadDoc(id) {
  const folder = index.get(id);
  if (!folder) return [null, null];
  const data = readJson(path.join(DOCS_DIR, folder, META_FILE));
  return isObj(data) ? [data, folder] : [null, null];
}

function saveDoc(data, folder) { writeJsonAtomic(path.join(DOCS_DIR, folder, META_FILE), data); }

function publicMeta(d) {
  return {
    id: d.id,
    title: d.title !== undefined ? d.title : "Untitled",
    type: d.type !== undefined ? d.type : "note",
    favorite: Boolean(d.favorite),
    tags: d.tags !== undefined ? d.tags : [],
    collection: d.collection !== undefined ? d.collection : "",
    preview: Array.from(stripHtml(d.content)).slice(0, 160).join(""),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function allDocsSorted() {
  const docs = [];
  for (const id of Array.from(index.keys())) {
    const [data] = loadDoc(id);
    if (data) docs.push(data);
  }
  docs.sort((a, b) => {
    const x = a.updatedAt || "", y = b.updatedAt || "";
    return x < y ? 1 : x > y ? -1 : 0;
  });
  return docs;
}

/* ---------------- Trash ---------------- */
function localTrash(p) {
  fs.mkdirSync(APP_TRASH_DIR, { recursive: true });
  const d = new Date(), z = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  const dest = path.join(APP_TRASH_DIR, `${stamp} - ${path.basename(p)}`);
  try { fs.renameSync(p, dest); } catch (_) { fs.cpSync(p, dest, { recursive: true }); fs.rmSync(p, { recursive: true, force: true }); }
}

async function sendToTrash(p) {
  try { await shell.trashItem(p); } catch (_) { localTrash(p); }
}

/* ---------------- HTTP server ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".icns": "image/icns",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
};

let serverPort = 0;

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store" });
  res.end(body);
}
function sendError(res, status, message) { sendJson(res, status, { error: message }); }

function sendFile(res, file) {
  if (!isFile(file)) return sendError(res, 404, "File not found");
  const data = fs.readFileSync(file);
  res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": data.length, "Cache-Control": "no-cache" });
  res.end(data);
}

function serveStatic(res, rel) {
  rel = rel.replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  const root = path.resolve(STATIC_DIR);
  let full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return sendError(res, 403, "Forbidden");
  if (!isFile(full)) full = path.join(root, "index.html");
  sendFile(res, full);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.length) return resolve({});
      try { const v = JSON.parse(raw); resolve(isObj(v) ? v : null); } catch (_) { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

function decode(s) { try { return decodeURIComponent(s); } catch (_) { return s; } }

function hostAllowed(req) {
  // Only this app may talk to the API: blocks other web pages and DNS-rebinding tricks.
  const host = req.headers.host || "";
  if (host !== `${HOST}:${serverPort}` && host !== `localhost:${serverPort}`) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${HOST}:${serverPort}` && origin !== `http://localhost:${serverPort}`) return false;
  return true;
}

async function handle(req, res) {
  if (!hostAllowed(req)) return sendError(res, 403, "Forbidden");
  const url = new URL(req.url, `http://${HOST}`);
  const p = decode(url.pathname);
  const method = req.method;

  if (method === "GET" || method === "HEAD") {
    if (p === "/api/settings") return sendJson(res, 200, { settings: loadSettings() });

    if (p === "/api/documents") {
      return sendJson(res, 200, { documents: allDocsSorted().map(publicMeta), collections: loadFolders() });
    }

    if (p === "/api/search") {
      const query = (url.searchParams.get("q") || "").trim().toLowerCase();
      const docs = allDocsSorted();
      const results = !query ? docs.map(publicMeta) : docs.filter((d) => {
        const hay = [d.title || "", stripHtml(d.content), (Array.isArray(d.tags) ? d.tags : []).join(" "), d.collection || ""].join(" ").toLowerCase();
        return hay.includes(query);
      }).map(publicMeta);
      return sendJson(res, 200, { documents: results });
    }

    let m = p.match(/^\/api\/documents\/([^/]+)$/);
    if (m) {
      const [data] = loadDoc(decode(m[1]));
      return data ? sendJson(res, 200, data) : sendError(res, 404, "Document not found");
    }

    m = p.match(/^\/api\/documents\/([^/]+)\/path$/);
    if (m) {
      const [data, folder] = loadDoc(decode(m[1]));
      return data ? sendJson(res, 200, { path: path.join(DOCS_DIR, folder) }) : sendError(res, 404, "Document not found");
    }

    if (p.startsWith("/api/")) return sendError(res, 404, "Endpoint not found");
    return serveStatic(res, p);
  }

  if (method === "POST" || method === "PUT") {
    const body = await readBody(req);

    if (p === "/api/settings") {
      const values = body && body.settings;
      if (!isObj(values)) return sendError(res, 400, "Invalid settings");
      return sendJson(res, 200, { ok: true, count: Object.keys(saveSettings(values)).length });
    }

    if (method === "POST") {
      if (p === "/api/documents") {
        if (body === null) return sendError(res, 400, "Invalid JSON");
        const title = sanitizeName(body.title || "Untitled");
        const type = body.type !== undefined ? body.type : "note";
        if (!VALID_TYPES.has(type)) return sendError(res, 400, "Invalid document type");
        ensureDocsDir();
        const folder = uniqueFolderName(title);
        fs.mkdirSync(path.join(DOCS_DIR, folder), { recursive: true });
        const id = crypto.randomUUID(), ts = nowIso();
        // Optional fields: used when importing a JSON backup to restore the document as it was
        const data = {
          id, title, type,
          content: typeof body.content === "string" ? body.content : "",
          tags: Array.isArray(body.tags) ? body.tags.slice(0, 30).map((t) => Array.from(String(t)).slice(0, 40).join("")) : [],
          favorite: Boolean(body.favorite),
          collection: cleanCollection(body.collection),
          layout: cleanLayout(body.layout),
          createdAt: validIso(body.createdAt) || ts,
          updatedAt: validIso(body.updatedAt) || ts,
        };
        saveDoc(data, folder);
        index.set(id, folder);
        return sendJson(res, 201, data);
      }
      return sendError(res, 404, "Endpoint not found");
    }

    /* PUT */
    if (p === "/api/collections/create") {
      const name = body ? cleanCollection(body.name) : "";
      if (!name) return sendError(res, 400, "Missing folder name");
      saveFolders(loadFolders().concat([name]));
      return sendJson(res, 200, { ok: true, name });
    }

    if (p === "/api/collections/rename" || p === "/api/collections/delete") {
      if (body === null) return sendError(res, 400, "Invalid JSON");
      const isRename = p.endsWith("rename");
      const oldName = cleanCollection(body.name);
      const newName = isRename ? cleanCollection(body.to) : "";
      if (!oldName || (isRename && !newName)) return sendError(res, 400, "Missing collection name");
      const names = loadFolders().filter((n) => n.toLowerCase() !== oldName.toLowerCase());
      if (newName) names.push(newName);
      saveFolders(names);
      let changed = 0;
      for (const [id, folder] of Array.from(index.entries())) {
        const [data] = loadDoc(id);
        if (data && (data.collection || "") === oldName) { data.collection = newName; saveDoc(data, folder); changed++; }
      }
      return sendJson(res, 200, { ok: true, changed });
    }

    let m = p.match(/^\/api\/documents\/([^/]+)\/rename$/);
    if (m) {
      const id = decode(m[1]);
      if (body === null || typeof body.title !== "string" || !body.title.trim()) return sendError(res, 400, "Missing title");
      let [data, folder] = loadDoc(id);
      if (!data) return sendError(res, 404, "Document not found");
      const newTitle = sanitizeName(body.title);
      const newFolder = uniqueFolderName(newTitle, folder);
      if (newFolder !== folder) {
        fs.renameSync(path.join(DOCS_DIR, folder), path.join(DOCS_DIR, newFolder));
        index.set(id, newFolder);
        folder = newFolder;
      }
      data.title = newTitle;
      data.updatedAt = nowIso();
      saveDoc(data, folder);
      return sendJson(res, 200, data);
    }

    m = p.match(/^\/api\/documents\/([^/]+)\/favorite$/);
    if (m) {
      const [data, folder] = loadDoc(decode(m[1]));
      if (!data) return sendError(res, 404, "Document not found");
      data.favorite = !data.favorite;
      data.updatedAt = nowIso();
      saveDoc(data, folder);
      return sendJson(res, 200, data);
    }

    m = p.match(/^\/api\/documents\/([^/]+)$/);
    if (m) {
      if (body === null) return sendError(res, 400, "Invalid JSON");
      const [data, folder] = loadDoc(decode(m[1]));
      if (!data) return sendError(res, 404, "Document not found");
      let touch = false;
      if ("content" in body) { data.content = body.content; touch = true; }
      if (Array.isArray(body.tags)) {
        data.tags = body.tags.slice(0, 30).map((t) => Array.from(String(t)).slice(0, 40).join(""));
        touch = true;
      }
      if ("layout" in body) { data.layout = cleanLayout(body.layout); touch = true; }
      if ("collection" in body) {
        data.collection = cleanCollection(body.collection);              // moving does not change "last modified"
        if (data.collection) saveFolders(loadFolders().concat([data.collection]));
      }
      if (touch) data.updatedAt = nowIso();
      saveDoc(data, folder);
      return sendJson(res, 200, data);
    }

    return sendError(res, 404, "Endpoint not found");
  }

  if (method === "DELETE") {
    const m = p.match(/^\/api\/documents\/([^/]+)$/);
    if (m) {
      const id = decode(m[1]);
      const [data, folder] = loadDoc(id);
      if (!data) return sendError(res, 404, "Document not found");
      await sendToTrash(path.join(DOCS_DIR, folder));
      index.delete(id);
      return sendJson(res, 200, { ok: true });
    }
  }
  return sendError(res, 404, "Endpoint not found");
}

function startServer() {
  return new Promise((resolve, reject) => {
    ensureDocsDir();
    index = buildIndex();
    const server = http.createServer((req, res) => {
      handle(req, res).catch((e) => {
        try { sendError(res, 500, "Server error: " + (e && e.message ? e.message : e)); } catch (_) { /* closed */ }
      });
    });
    server.on("error", reject);
    server.listen(0, HOST, () => { serverPort = server.address().port; resolve(server); });
  });
}

/* ---------------- Window ---------------- */
let mainWindow = null;
let saveTimer = null;
const DEFAULT_SIZE = { width: 1280, height: 820 };

function restoredBounds() {
  const w = (readJson(PREFS_FILE) || {}).window;
  const out = { ...DEFAULT_SIZE, maximized: true, fullscreen: false };   // first start: maximized window
  if (!isObj(w)) return out;
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (num(w.width) && num(w.height) && w.width >= 600 && w.height >= 400) { out.width = Math.round(w.width); out.height = Math.round(w.height); }
  if (num(w.x) && num(w.y)) {
    const visible = screen.getAllDisplays().some((d) => {      // only reuse the position if it is still on a screen
      const a = d.workArea;
      return w.x < a.x + a.width - 60 && w.x + out.width > a.x + 60 && w.y >= a.y - 10 && w.y < a.y + a.height - 60;
    });
    if (visible) { out.x = Math.round(w.x); out.y = Math.round(w.y); }
  }
  out.maximized = typeof w.maximized === "boolean" ? w.maximized : true;
  out.fullscreen = w.fullscreen === true;
  return out;
}

function rememberWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const full = mainWindow.isFullScreen();
  const maximized = mainWindow.isMaximized();
  const b = (full || maximized) ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  saveWindowState({ x: b.x, y: b.y, width: b.width, height: b.height, maximized, fullscreen: full });
}

function scheduleRemember() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(rememberWindow, 400);
}

function isOwnUrl(u) {
  try { const o = new URL(u); return o.protocol === "http:" && o.hostname === HOST && Number(o.port) === serverPort; } catch (_) { return false; }
}

function openExternal(u) {
  if (/^(https?|mailto):/i.test(u)) shell.openExternal(u).catch(() => {});
}

function createWindow() {
  const st = restoredBounds();
  if (!isObj((readJson(PREFS_FILE) || {}).window)) {      // first start: write the default window state into preference.json
    saveWindowState({ width: st.width, height: st.height, maximized: true, fullscreen: false });
  }
  const settings = loadSettings() || {};
  const dark = settings["docly-theme-v2"] === "dark" || settings["docly-theme"] === "dark";
  const win = new BrowserWindow({
    width: st.width, height: st.height, x: st.x, y: st.y,
    minWidth: 760, minHeight: 520,
    show: false,
    title: "Docly",
    icon: process.platform === "darwin" ? undefined : (fs.existsSync(ICON_ICO) && process.platform === "win32" ? ICON_ICO : ICON_PNG),
    backgroundColor: dark ? "#111111" : "#ffffff",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  mainWindow = win;
  if (process.platform !== "darwin") win.setMenuBarVisibility(false);
  if (st.maximized) win.maximize();
  win.once("ready-to-show", () => { win.show(); if (st.fullscreen) win.setFullScreen(true); });

  for (const ev of ["resize", "move", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) win.on(ev, scheduleRemember);
  win.on("close", () => { clearTimeout(saveTimer); rememberWindow(); });
  win.on("closed", () => { mainWindow = null; });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  wc.on("will-navigate", (e, url) => { if (!isOwnUrl(url)) { e.preventDefault(); openExternal(url); } });
  wc.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11" && process.platform !== "darwin") {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  wc.on("context-menu", (_e, params) => {          // spelling suggestions on misspelled words
    if (!params.misspelledWord) return;
    const items = params.dictionarySuggestions.map((s) => ({ label: s, click: () => wc.replaceMisspelling(s) }));
    if (!items.length) items.push({ label: "No suggestions", enabled: false });
    items.push({ type: "separator" }, { label: "Add to dictionary", click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.loadURL(`http://${HOST}:${serverPort}/`);
  return win;
}

function setupSession() {
  const ses = session.defaultSession;
  const allowed = new Set(["local-fonts", "clipboard-read", "clipboard-sanitized-write", "fullscreen"]);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => cb(allowed.has(permission) && isOwnUrl((details && details.requestingUrl) || wc.getURL())));
  ses.setPermissionCheckHandler((wc, permission, origin) => allowed.has(permission) && isOwnUrl(origin || ""));

  // Exports (TXT, HTML, Word, RTF, PDF...) are downloads: ask where to save them
  ses.on("will-download", (_e, item) => {
    const target = dialog.showSaveDialogSync(mainWindow || undefined, {
      title: "Save",
      defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
    });
    if (!target) { item.cancel(); return; }
    item.setSavePath(target);
  });
}

function setupMenu() {
  if (process.platform !== "darwin") { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Docly", submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "pasteAndMatchStyle" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }] },
  ]));
}

/* ---------------- Start ---------------- */
let httpServer = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();                                   // Docly is already open: that window comes to the front
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      httpServer = await startServer();
    } catch (e) {
      dialog.showErrorBox("Docly", "Could not start Docly:\n" + (e && e.message ? e.message : e));
      app.quit();
      return;
    }
    console.log(`Docly: http://${HOST}:${serverPort}  (documents: ${DOCS_DIR})`);
    if (process.platform === "darwin" && app.dock && fs.existsSync(ICON_PNG)) app.dock.setIcon(nativeImage.createFromPath(ICON_PNG));
    setupMenu();
    setupSession();
    createWindow();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => { try { if (httpServer) httpServer.close(); } catch (_) { /* ignore */ } });
}
