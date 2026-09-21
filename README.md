# Docly

Un workspace di scrittura **locale, offline e minimalista**. Nessun cloud,
nessun account, nessuna telemetria: tutto quello che scrivi resta sul tuo
computer, dentro la cartella `documents/`.

## Cosa puoi creare

- **Documents** — rich text editor with headings, bold/italic/underline,
  lists, links, quotes, tables, images, code blocks, plus tags and favorites.

## Quick start

Only **Python 3** is required (no Node.js/npm/Bun/Deno, no libraries to
install).

**Linux / macOS**
```bash
./start.sh
```
or directly:
```bash
python3 server.py
```

**Windows**
```
start.bat
```
or:
```
python server.py
```

The browser opens automatically at `http://127.0.0.1:8756`. If it doesn't
open by itself, paste it manually in the address bar. To start without
attempting to open the browser (e.g. on a server), use:
```bash
python3 server.py --no-browser
```

To stop Docly: `CTRL+C` in the terminal.

## Where documents are saved

```
Docly/
└── documents/
    ├── Document name/
    │   ├── document.json      ← title, type, content, tags, favorites…
    │   └── assets/             ← images pasted in the document
    ├── Second document/
    │   ├── document.json
    │   └── assets/
```

- Each document is an independent folder: creating a document with title
  "Meeting notes", Docly creates `documents/Meeting notes/`.
- Renaming a document also renames the folder on disk.
- Changes are saved automatically (with a short debounce to avoid continuous
  writes) — in the editor header you see the status **Saving…** / **Saved**.
  You can also force immediate save with `Ctrl+S` / `Cmd+S`.
- **Backup**: just copy the entire `documents/` folder elsewhere (USB drive,
  another computer, personal cloud…). Nothing else is needed.
- On startup, Docly automatically reads `documents/` and shows everything it
  finds; if the folder doesn't exist, it creates it.

## App features

- Light / dark theme (toggle at the top of the sidebar).
- Full-text search on title, content and tags.
- Sections: All, Recent, Favorites.
- Rename, delete (with confirmation) and favorites directly from the document
  row in the sidebar (icons * and X) or from the editor header. Deleting a
  document moves it to the **operating system's trash** (Windows Recycle Bin,
  macOS Trash, Linux Trash): it's never a permanent deletion and the document
  can be restored from there. If for some reason the system trash is not
  accessible, the document is moved to `Docly/.trash/` instead of being lost.
- Tags dedicated to documents.
- Advanced rich text editor with toolbar: headings, bold, italic, underline,
  strikethrough, bulleted/numbered lists, links, quotes, tables, images, code
  blocks, undo/redo, paragraph alignment, indentation, line spacing, font size,
  text color, highlighting, superscript/subscript, case conversion.
- Complete keyboard shortcuts (press F1 to see the full list).
- Advanced find and replace functions.
- Export to TXT and HTML formats.
- Built-in help (press F1 or click the ? button).

## Keyboard shortcuts

### File management
- `Ctrl+N` - New document
- `Ctrl+O` - Search document
- `Ctrl+S` - Save document
- `Ctrl+P` - Print
- `F1` - Help

### Text formatting
- `Ctrl+B` - Bold
- `Ctrl+I` - Italic
- `Ctrl+U` - Underline
- `Ctrl+D` - Font dialog
- `Ctrl+]` - Increase font size
- `Ctrl+[` - Decrease font size
- `Ctrl+Space` - Remove formatting
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo

### Paragraphs
- `Ctrl+L` - Align left
- `Ctrl+E` - Center
- `Ctrl+R` - Align right
- `Ctrl+J` - Justify
- `Ctrl+M` - Increase indent
- `Ctrl+Shift+M` - Decrease indent
- `Ctrl+1` - Single line spacing
- `Ctrl+2` - Double line spacing
- `Ctrl+5` - 1.5 line spacing
- `Ctrl+Shift+L` - Bullet list

### Search and navigation
- `Ctrl+F` - Find
- `Ctrl+H` - Find and replace
- `Ctrl+G` - Go to position
- `Double click` - Select word
- `Triple click` - Select paragraph
- `Ctrl+Home` - Start of document
- `Ctrl+End` - End of document

## Technical requirements and design choices

- **Backend**: Python 3 (standard library only — `http.server`, `json`,
  `uuid`, etc.), a single `server.py` file. No dependencies to install,
  no database: the "database" is the filesystem itself.
- **Frontend**: HTML/CSS/JavaScript "vanilla", executed by the browser,
  no build, no bundler, no Node.js needed for execution.
- No encryption/E2EE, no login, no remote sync, no analytics: Docly works
  on a computer completely disconnected from the Internet.

## Project structure

```
Docly/
├── server.py       ← backend (Python standard library)
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── documents/      ← your documents go here (created automatically)
├── start.sh
├── start.bat
└── README.md
```

## Notes

- The default port is `8756`; to change it, modify the `PORT` constant at
  the top of `server.py`.
- The project is designed to be simple to read and modify: the entire
  backend is in a single file.
