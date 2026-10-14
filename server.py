#!/usr/bin/env python3
import json
import mimetypes
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote, parse_qs, quote

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
# All user data lives in the "documents" folder next to server.py (relative path), so the whole
# Docly folder can be moved or renamed and every document and folder moves with it.
DOCS_DIR = os.path.join(BASE_DIR, "documents")
LEGACY_DOCS_DIR = os.path.join(STATIC_DIR, "documents")   # previous location, migrated on start
PREF_FILE_NAME = "preference.json"
HOST = "127.0.0.1"
PORT = 8756
VALID_TYPES = {"note"}
META_FILE = "document.json"
APP_TRASH_DIR = os.path.join(DOCS_DIR, ".trash")

_lock = threading.RLock()
_index = {}

def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def valid_iso(value):
    if not isinstance(value, str):
        return None
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value
    except ValueError:
        return None

PREF_FILE = os.path.join(DOCS_DIR, PREF_FILE_NAME)
LEGACY_FOLDERS_FILE = os.path.join(DOCS_DIR, ".folders.json")

def _read_pref():
    try:
        with open(PREF_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}

def _write_pref(data):
    os.makedirs(DOCS_DIR, exist_ok=True)
    tmp = PREF_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PREF_FILE)

def load_folders():
    """Names of the folders (collections) that exist, including empty ones."""
    names = _read_pref().get("folders")
    return [clean_collection(n) for n in names if clean_collection(n)] if isinstance(names, list) else []

def save_folders(names):
    seen, out = set(), []
    for n in names:
        n = clean_collection(n)
        if n and n.lower() not in seen:
            seen.add(n.lower())
            out.append(n)
    data = _read_pref()          # keep any other preference stored in the file
    data["version"] = 1
    data["folders"] = sorted(out, key=str.lower)
    _write_pref(data)

def migrate_legacy_data():
    """Move data from the previous layout (static/documents, documents/.folders.json) into ./documents."""
    os.makedirs(DOCS_DIR, exist_ok=True)
    if os.path.isdir(LEGACY_DOCS_DIR) and os.path.abspath(LEGACY_DOCS_DIR) != os.path.abspath(DOCS_DIR):
        for entry in os.listdir(LEGACY_DOCS_DIR):
            src = os.path.join(LEGACY_DOCS_DIR, entry)
            if entry == ".folders.json":
                continue
            dst = os.path.join(DOCS_DIR, entry)
            if not os.path.exists(dst):
                shutil.move(src, dst)
        old_folders = os.path.join(LEGACY_DOCS_DIR, ".folders.json")
        if os.path.isfile(old_folders) and not os.path.isfile(LEGACY_FOLDERS_FILE):
            shutil.copy2(old_folders, LEGACY_FOLDERS_FILE)
        if os.path.isfile(old_folders):
            try:
                os.remove(old_folders)
            except OSError:
                pass
        try:
            if not os.listdir(LEGACY_DOCS_DIR):
                os.rmdir(LEGACY_DOCS_DIR)
        except OSError:
            pass
    # .folders.json -> preference.json
    if os.path.isfile(LEGACY_FOLDERS_FILE):
        try:
            with open(LEGACY_FOLDERS_FILE, "r", encoding="utf-8") as f:
                old = json.load(f)
        except (OSError, ValueError):
            old = []
        if isinstance(old, list):
            save_folders(load_folders() + [n for n in old if isinstance(n, str)])
        try:
            os.replace(LEGACY_FOLDERS_FILE, LEGACY_FOLDERS_FILE + ".migrated")
        except OSError:
            pass
    # always make sure preference.json exists (never delete it!)
    if not os.path.isfile(PREF_FILE):
        save_folders(load_folders())

def clean_collection(value):
    """Collection (folder) name: plain text, up to 60 characters, empty = none."""
    if not isinstance(value, str):
        return ""
    value = re.sub(r"[\x00-\x1f]", "", value)
    return re.sub(r"\s+", " ", value).strip()[:60]

def clean_layout(value):
    """Header / footer / page-number settings: a small dict of short strings."""
    out = {}
    if not isinstance(value, dict):
        return out
    for key in ("header", "footer"):
        v = value.get(key)
        if isinstance(v, str):
            out[key] = v[:300]
    pn = value.get("pageNumbers")
    if pn in ("none", "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"):
        out["pageNumbers"] = pn
    if value.get("skipFirst") is True:
        out["skipFirst"] = True
    return out

def strip_html(html):
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def sanitize_name(name):
    name = (name or "").strip()
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = "Untitled"
    return name[:120]

FOLDER_SUFFIX = "_Docly"

def unique_folder_name(base, ignore=None):
    # Projects inside "documents" are stored as "<project name>_Docly"
    candidate = base + FOLDER_SUFFIX
    i = 1
    while True:
        path = os.path.join(DOCS_DIR, candidate)
        if not os.path.isdir(path) or (ignore is not None and candidate.lower() == ignore.lower()):
            return candidate
        i += 1
        candidate = f"{base} ({i}){FOLDER_SUFFIX}"

def ensure_docs_dir():
    os.makedirs(DOCS_DIR, exist_ok=True)

def build_index():
    ensure_docs_dir()
    idx = {}
    for entry in sorted(os.listdir(DOCS_DIR)):
        folder = os.path.join(DOCS_DIR, entry)
        meta_path = os.path.join(folder, META_FILE)
        if os.path.isdir(folder) and os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                doc_id = data.get("id")
                if doc_id:
                    idx[doc_id] = entry
            except Exception:
                continue
    return idx

def load_doc(doc_id):
    with _lock:
        folder = _index.get(doc_id)
        if not folder:
            return None, None
        path = os.path.join(DOCS_DIR, folder, META_FILE)
        if not os.path.isfile(path):
            return None, None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data, folder

def save_doc(data, folder):
    path = os.path.join(DOCS_DIR, folder, META_FILE)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def public_meta(data):
    preview = strip_html(data.get("content", ""))[:160]
    return {
        "id": data.get("id"),
        "title": data.get("title", "Untitled"),
        "type": data.get("type", "note"),
        "favorite": bool(data.get("favorite", False)),
        "tags": data.get("tags", []),
        "collection": data.get("collection", ""),
        "preview": preview,
        "createdAt": data.get("createdAt"),
        "updatedAt": data.get("updatedAt"),
    }

def all_docs_sorted():
    with _lock:
        docs = []
        for doc_id, folder in list(_index.items()):
            data, _ = load_doc(doc_id)
            if data:
                docs.append(data)
    docs.sort(key=lambda d: d.get("updatedAt", ""), reverse=True)
    return docs

class DoclyHandler(BaseHTTPRequestHandler):
    server_version = "Docly/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, message):
        self._send_json(status, {"error": message})

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def _send_file(self, path, download_name=None):
        if not os.path.isfile(path):
            self._send_error_json(404, "File not found")
            return
        ctype, _ = mimetypes.guess_type(path)
        ctype = ctype or "application/octet-stream"
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if download_name:
            self.send_header("Content-Disposition", f'inline; filename="{download_name}"')
        self.end_headers()
        self.wfile.write(data)

    def _serve_static(self, rel_path):
        rel_path = rel_path.lstrip("/")
        if rel_path == "":
            rel_path = "index.html"
        full = os.path.normpath(os.path.join(STATIC_DIR, rel_path))
        if not full.startswith(os.path.normpath(STATIC_DIR) + os.sep) and full != os.path.normpath(STATIC_DIR):
            self._send_error_json(403, "Forbidden")
            return
        # user data is only reachable through the API, never as a plain file
        if full.startswith(os.path.normpath(DOCS_DIR) + os.sep) or full == os.path.normpath(DOCS_DIR):
            self._send_error_json(403, "Forbidden")
            return
        if not os.path.isfile(full):
            full = os.path.join(STATIC_DIR, "index.html")
        self._send_file(full)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        qs = parse_qs(parsed.query)

        if path == "/api/documents":
            with _lock:
                docs = [public_meta(d) for d in all_docs_sorted()]
                folders = load_folders()
            self._send_json(200, {"documents": docs, "collections": folders})
            return

        if path == "/api/search":
            query = (qs.get("q", [""])[0] or "").strip().lower()
            with _lock:
                docs = all_docs_sorted()
            if not query:
                results = [public_meta(d) for d in docs]
            else:
                results = []
                for d in docs:
                    haystack = " ".join([
                        d.get("title", ""),
                        strip_html(d.get("content", "")),
                        " ".join(d.get("tags", [])),
                        d.get("collection", ""),
                    ]).lower()
                    if query in haystack:
                        results.append(public_meta(d))
            self._send_json(200, {"documents": results})
            return

        m = re.match(r"^/api/documents/([^/]+)$", path)
        if m:
            doc_id = unquote(m.group(1))
            with _lock:
                data, _ = load_doc(doc_id)
            if not data:
                self._send_error_json(404, "Document not found")
                return
            self._send_json(200, data)
            return

        m = re.match(r"^/api/documents/([^/]+)/path$", path)
        if m:
            doc_id = unquote(m.group(1))
            with _lock:
                data, folder = load_doc(doc_id)
            if not data:
                self._send_error_json(404, "Document not found")
                return
            doc_path = os.path.join(DOCS_DIR, folder)
            self._send_json(200, {"path": doc_path})
            return

        if path.startswith("/api/"):
            self._send_error_json(404, "Endpoint not found")
            return

        self._serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/documents":
            body = self._read_json_body()
            if body is None:
                self._send_error_json(400, "Invalid JSON")
                return
            title = sanitize_name(body.get("title") or "Untitled")
            doc_type = body.get("type", "note")
            if doc_type not in VALID_TYPES:
                self._send_error_json(400, "Invalid document type")
                return
            with _lock:
                ensure_docs_dir()
                folder = unique_folder_name(title)
                folder_path = os.path.join(DOCS_DIR, folder)
                os.makedirs(folder_path, exist_ok=True)
                doc_id = str(uuid.uuid4())
                ts = now_iso()
                # Optional fields: used when importing a JSON backup to restore the document as it was
                content = body.get("content")
                tags = body.get("tags")
                data = {
                    "id": doc_id,
                    "title": title,
                    "type": doc_type,
                    "content": content if isinstance(content, str) else "",
                    "tags": [str(t)[:40] for t in tags][:30] if isinstance(tags, list) else [],
                    "favorite": bool(body.get("favorite", False)),
                    "collection": clean_collection(body.get("collection")),
                    "layout": clean_layout(body.get("layout")),
                    "createdAt": valid_iso(body.get("createdAt")) or ts,
                    "updatedAt": valid_iso(body.get("updatedAt")) or ts,
                }
                save_doc(data, folder)
                _index[doc_id] = folder
            self._send_json(201, data)
            return

        self._send_error_json(404, "Endpoint not found")

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/collections/create":
            body = self._read_json_body()
            name = clean_collection(body.get("name")) if isinstance(body, dict) else ""
            if not name:
                self._send_error_json(400, "Missing folder name")
                return
            with _lock:
                save_folders(load_folders() + [name])
            self._send_json(200, {"ok": True, "name": name})
            return

        if path in ("/api/collections/rename", "/api/collections/delete"):
            body = self._read_json_body()
            if not isinstance(body, dict):
                self._send_error_json(400, "Invalid JSON")
                return
            old_name = clean_collection(body.get("name"))
            new_name = clean_collection(body.get("to")) if path.endswith("rename") else ""
            if not old_name or (path.endswith("rename") and not new_name):
                self._send_error_json(400, "Missing collection name")
                return
            changed = 0
            with _lock:
                names = [n for n in load_folders() if n.lower() != old_name.lower()]
                if new_name:
                    names.append(new_name)
                save_folders(names)
                for doc_id, folder in list(_index.items()):
                    data, _ = load_doc(doc_id)
                    if data and data.get("collection", "") == old_name:
                        data["collection"] = new_name
                        save_doc(data, folder)
                        changed += 1
            self._send_json(200, {"ok": True, "changed": changed})
            return

        m = re.match(r"^/api/documents/([^/]+)/rename$", path)
        if m:
            doc_id = unquote(m.group(1))
            body = self._read_json_body()
            if body is None or not body.get("title", "").strip():
                self._send_error_json(400, "Missing title")
                return
            with _lock:
                data, folder = load_doc(doc_id)
                if not data:
                    self._send_error_json(404, "Document not found")
                    return
                new_title = sanitize_name(body["title"])
                new_folder = unique_folder_name(new_title, ignore=folder)
                if new_folder != folder:
                    old_path = os.path.join(DOCS_DIR, folder)
                    new_path = os.path.join(DOCS_DIR, new_folder)
                    os.rename(old_path, new_path)
                    _index[doc_id] = new_folder
                    folder = new_folder
                data["title"] = new_title
                data["updatedAt"] = now_iso()
                save_doc(data, folder)
            self._send_json(200, data)
            return

        m = re.match(r"^/api/documents/([^/]+)/favorite$", path)
        if m:
            self._toggle_field(unquote(m.group(1)), "favorite")
            return

        m = re.match(r"^/api/documents/([^/]+)$", path)
        if m:
            doc_id = unquote(m.group(1))
            body = self._read_json_body()
            if body is None:
                self._send_error_json(400, "Invalid JSON")
                return
            with _lock:
                data, folder = load_doc(doc_id)
                if not data:
                    self._send_error_json(404, "Document not found")
                    return
                touch = False
                if "content" in body:
                    data["content"] = body["content"]
                    touch = True
                if "tags" in body and isinstance(body["tags"], list):
                    data["tags"] = [str(t)[:40] for t in body["tags"]][:30]
                    touch = True
                if "layout" in body:
                    data["layout"] = clean_layout(body["layout"])
                    touch = True
                if "collection" in body:
                    data["collection"] = clean_collection(body["collection"])   # moving does not change "last modified"
                    if data["collection"]:
                        save_folders(load_folders() + [data["collection"]])
                if touch:
                    data["updatedAt"] = now_iso()
                save_doc(data, folder)
            self._send_json(200, data)
            return

        self._send_error_json(404, "Endpoint not found")

    def _toggle_field(self, doc_id, field):
        with _lock:
            data, folder = load_doc(doc_id)
            if not data:
                self._send_error_json(404, "Document not found")
                return
            data[field] = not bool(data.get(field, False))
            data["updatedAt"] = now_iso()
            save_doc(data, folder)
        self._send_json(200, data)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        m = re.match(r"^/api/documents/([^/]+)$", path)
        if m:
            doc_id = unquote(m.group(1))
            with _lock:
                data, folder = load_doc(doc_id)
                if not data:
                    self._send_error_json(404, "Document not found")
                    return
                folder_path = os.path.join(DOCS_DIR, folder)
                send_to_trash(folder_path)
                _index.pop(doc_id, None)
            self._send_json(200, {"ok": True})
            return
        self._send_error_json(404, "Endpoint not found")

def _trash_windows(path):
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR),
            ("pTo", wintypes.LPCWSTR),
            ("fFlags", ctypes.c_uint),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", ctypes.c_void_p),
            ("lpszProgressTitle", wintypes.LPCWSTR),
        ]

    FO_DELETE = 3
    FOF_ALLOWUNDO = 0x40
    FOF_NOCONFIRMATION = 0x10
    FOF_SILENT = 0x4
    FOF_NOERRORUI = 0x400

    op = SHFILEOPSTRUCTW()
    op.hwnd = None
    op.wFunc = FO_DELETE
    op.pFrom = path + "\0"
    op.pTo = None
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
    result = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    if result != 0:
        raise OSError(f"SHFileOperationW returned code {result}")

def _trash_macos(path):
    escaped = path.replace("\\", "\\\\").replace('"', '\\"')
    script = f'tell application "Finder" to delete POSIX file "{escaped}"'
    subprocess.run(["osascript", "-e", script], check=True,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def _trash_linux(path):
    home = os.path.expanduser("~")
    data_home = os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share")
    trash_files = os.path.join(data_home, "Trash", "files")
    trash_info = os.path.join(data_home, "Trash", "info")
    os.makedirs(trash_files, exist_ok=True)
    os.makedirs(trash_info, exist_ok=True)

    base = os.path.basename(path.rstrip(os.sep))
    dest_name = base
    i = 1
    while os.path.exists(os.path.join(trash_files, dest_name)) or \
            os.path.exists(os.path.join(trash_info, dest_name + ".trashinfo")):
        i += 1
        dest_name = f"{base} ({i})"

    shutil.move(path, os.path.join(trash_files, dest_name))
    info = (
        "[Trash Info]\n"
        f"Path={quote(path)}\n"
        f"DeletionDate={datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}\n"
    )
    with open(os.path.join(trash_info, dest_name + ".trashinfo"), "w", encoding="utf-8") as f:
        f.write(info)

def _trash_local_fallback(path):
    os.makedirs(APP_TRASH_DIR, exist_ok=True)
    base = os.path.basename(path.rstrip(os.sep))
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(APP_TRASH_DIR, f"{stamp} - {base}")
    shutil.move(path, dest)

def send_to_trash(path):
    system = platform.system()
    try:
        if system == "Windows":
            _trash_windows(path)
        elif system == "Darwin":
            _trash_macos(path)
        elif system == "Linux":
            _trash_linux(path)
        else:
            _trash_local_fallback(path)
    except Exception:
        _trash_local_fallback(path)

def open_browser_delayed():
    time.sleep(0.8)
    try:
        opened = webbrowser.open(f"http://{HOST}:{PORT}")
        if not opened:
            print(f"  (unable to open browser automatically: open manually http://{HOST}:{PORT})")
    except Exception:
        pass

def main():
    global _index
    ensure_docs_dir()
    migrate_legacy_data()
    _index = build_index()
    server = ThreadingHTTPServer((HOST, PORT), DoclyHandler)
    print(f"Open browser at: http://{HOST}:{PORT}")
    print(f"Documents saved in: {DOCS_DIR}")
    print(f"Main file (do not delete): {PREF_FILE}")
    if "--no-browser" not in sys.argv:
        threading.Thread(target=open_browser_delayed, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        server.shutdown()

if __name__ == "__main__":
    main()
