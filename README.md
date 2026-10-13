# Docly

**Docly** is a word processor that runs entirely on your computer: no account, no cloud, no Internet. Your documents are plain files in the `documents/` folder.

![Home, light theme](images/home-light-theme.png)

![Home, dark theme](images/home-dark-theme.png)

![Editor, light theme](images/editor-light-theme.png)

![Editor, dark theme](images/editor-dark-theme.png)

---

## How to use

### Start

1. Install **Python 3** (tick *Add Python to PATH*): <https://www.python.org/downloads/>
2. Unzip the `Docly` folder anywhere.
3. Double-click **`start.bat`**. The browser opens Docly at `http://127.0.0.1:8756`.

On macOS/Linux run `python3 server.py` inside the `Docly` folder.

To quit: wait for **Saved** at the top, close the tab, then close the black server window (or `Ctrl+C`).

### First steps

1. On the home page click **Create new document** (or **Import JSON**).
2. Type a name, press **OK** and start writing in the page.
3. Everything saves automatically less than a second after each change.
4. Export from **File ▸ Download** (Word, OpenDocument, RTF, PDF, TXT, HTML, EPUB, Markdown, JSON backup). Open any document again from the home page or the search box.

### Quick commands

| Keys | Action | Keys | Action |
|---|---|---|---|
| `Ctrl+S` | Save | `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+N` | New document | `Ctrl+C` `X` `V` | Copy / Cut / Paste |
| `Ctrl+O` | Open (search) | `Ctrl+Shift+V` | Paste without formatting |
| `Ctrl+B` / `I` / `U` | Bold / Italic / Underline | `Ctrl+A` | Select all |
| `Ctrl+K` | Insert or edit link | `Ctrl+F` | Find |
| `Ctrl+Alt+1…6` | Heading 1–6 | `Ctrl+H` | Find and replace |
| `Ctrl+Shift+7` / `8` / `9` | Numbered / bulleted / check list | `Ctrl+P` | Print |
| `Ctrl+Enter` | Page break | `Ctrl+/` or `F1` | All shortcuts |

---

## Full list of commands

### Keyboard shortcuts

**Common actions**

| Keys | Action |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+N` | New document |
| `Ctrl+O` | Open document (search) |
| `Ctrl+P` | Print |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Ctrl+Shift+V` | Paste without formatting |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+K` | Insert or edit link |
| `Ctrl+F` | Find |
| `Ctrl+G` / `Ctrl+Shift+G` | Find next / previous |
| `Ctrl+H` | Find and replace |
| `Ctrl+A` | Select all |
| `Ctrl+/` | Show keyboard shortcuts |
| `Ctrl+Shift+C` | Word count |
| `Ctrl+Shift+F` | Compact controls (hide toolbar) |

**Text formatting**

| Keys | Action |
|---|---|
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / Italic / Underline |
| `Alt+Shift+5` | Strikethrough |
| `Alt+Shift+K` | Small caps |
| `Ctrl+.` / `Ctrl+,` | Superscript / Subscript |
| `Ctrl+Shift+.` / `Ctrl+Shift+,` | Increase / decrease font size |
| `Ctrl+\` | Clear formatting |
| `Ctrl+Alt+C` / `Ctrl+Alt+V` | Copy / paste text formatting |
| `Shift+F3` | Cycle capitalization |

**Paragraph formatting**

| Keys | Action |
|---|---|
| `Ctrl+Alt+0` | Normal text |
| `Ctrl+Alt+1` … `6` | Heading 1 – 6 |
| `Ctrl+Shift+L` / `E` / `R` / `J` | Align left / center / right / justify |
| `Ctrl+Shift+7` | Numbered list |
| `Ctrl+Shift+8` | Bulleted list |
| `Ctrl+Shift+9` | Checklist |
| `Ctrl+]` / `Ctrl+[` | Increase / decrease indent |
| `Ctrl+1` / `Ctrl+5` / `Ctrl+2` | Single / 1.5 / double line spacing |
| `Ctrl+0` | Add / remove space before paragraph |

**Insert and tables**

| Keys | Action |
|---|---|
| `Ctrl+Enter` | Page break |
| `Tab` / `Shift+Tab` | Next / previous table cell (a new row is added after the last cell) |

**Menus**

| Keys | Action |
|---|---|
| `Alt+Shift+F` | File |
| `Alt+Shift+E` | Edit |
| `Alt+Shift+V` | View |
| `Alt+Shift+I` | Insert |
| `Alt+Shift+O` | Format |
| `Alt+Shift+B` | Table |
| `Alt+Shift+T` | Tools |
| `Alt+Shift+H` | Help |

**Navigation**

| Keys | Action |
|---|---|
| `Ctrl+Home` / `Ctrl+End` | Start / end of the document |
| `Ctrl+←` / `Ctrl+→` | Move by word |
| `Ctrl+Shift+←` / `Ctrl+Shift+→` | Select by word |
| `Shift+Home` / `Shift+End` | Select to start / end of line |

While you type in a text field (search, dialogs) the editor shortcuts are disabled; only `Ctrl+S`, `Ctrl+N`, `Ctrl+O`, `Ctrl+P`, `Ctrl+/` and `F1` stay active. Browsers may reserve some combinations: use the menus instead.

### Mouse

| Action | What it does |
|---|---|
| Click a document in the list | Open it |
| Click the title (top bar) | Rename the document |
| Click the ☆ star | Add / remove from Favorites |
| Click the 🗑 bin | Delete (see *Delete* below) |
| Click a link | Open it in a new tab |
| Drag across table cells | Select cells |
| Right-click inside a table | Table menu |
| Click on the minimap | Jump to that part of the document |

### Interface buttons

- **Top bar**: home, document list, document name (click to rename), favorite, delete, save status (*Saving…* / *Saved*), menus.
- **Toolbar**: Undo, Redo, Print, Zoom, Paragraph style, Font, Font size − / +, Bold, Italic, Underline, Strikethrough, Text color, Highlight, Superscript, Subscript, Change case, Link, Remove link, Table, Horizontal line, Code block, Align (left, center, right, justify), Line spacing, Bulleted list, Numbered list, Decrease / increase indent, Clear formatting, Find and replace.
- **Top right**: Help, Program info, Light / dark theme.
- **Home**: search, Create new document, Import JSON, list / grid view, filters **All / Recent / Favorites**.
- **Status bar**: cursor position (line, column), characters, words.

### Menus

- **File**: New document · Open document · All documents (home) · Make a copy · Download ▸ (Word, OpenDocument, RTF, PDF, TXT, HTML, EPUB, Markdown, Docly backup JSON) · Save · Rename · Add / remove favorite · Tags… · Move to trash · Language ▸ · Page setup · Print · Document details · Word count · Show file path
- **Edit**: Undo · Redo · Cut · Copy · Paste · Paste without formatting · Select all · Delete · Find · Find and replace · Copy formatting · Paste formatting · Clear formatting · Editing preferences ▸ Spelling check
- **View**: Mode ▸ (Editing, Viewing) · Print layout (pages) · Ruler · Document outline · Non-printing characters · Toolbar · Minimap · Document list · Zoom ▸ (50% – 200%) · Full screen · Light / dark theme
- **Insert**: Table · Emoji and special characters · Link · Horizontal line · Code block · Checklist · Page break · Date and time ▸ · Bookmark · Link to heading or bookmark · Table of contents ▸ (insert, update)
- **Format**: Text ▸ · Font ▸ · Font size ▸ · Capitalization ▸ · Page orientation ▸ · Paragraph styles ▸ (Normal, Title, Subtitle, Heading 1–6, Quote) · Align ▸ · Lists ▸ · Indent ▸ · Line spacing ▸ · Paragraph spacing ▸ · Paragraph borders and shading ▸ · Clear formatting
- **Table**: Insert table · Insert row above / below · Insert column left / right · Delete row / column / table · Merge cells · Split cell · Distribute rows / columns · Cell vertical and content alignment · Cell background color · Border color and width · Column width · Minimum row height · Header row · Table properties
- **Tools**: Word count · Spelling check · Change case · Text color · Highlight color
- **Help**: Program info · License · Keyboard shortcuts

### Context menu (right-click)

- **Inside a table**: the **Table** menu (rows, columns, merge, split, alignment, colors, borders, properties).

---

## Full list of functions

### Documents

- **Create**: **Create new document** on the home page, `Ctrl+N` or File ▸ New document. Imported and copied documents are new documents too.
- **Rename**: click the title, or File ▸ Rename. The folder on disk is renamed with it.
- **Favorites and tags**: star a document to find it under **Favorites**; add comma-separated tags with File ▸ Tags… Search covers title, text and tags.
- **Recent**: the 15 most recently modified documents.
- **Make a copy**: File ▸ Make a copy creates *Copy of …* with the same content.
- **Document details**: title, creation and modification dates, words, characters, tables, tags. **Show file path** gives the folder on disk.
- **Delete**: two confirmations. First *Cancel / Delete*, then *Cancel / Delete / Export JSON and delete*. The folder goes to the **Recycle Bin / Trash**.
- **Restore**: export with *Export JSON and delete* (or File ▸ Download ▸ Docly backup), then **Import JSON** on the home page: the document comes back with its title, content, tags, favorite and dates, as if it had never been deleted.
- **Names**: up to 120 characters, spaces allowed, invalid Windows characters removed, duplicates get `(2)`, `(3)`…; folders are named `NAME_Docly`.

### Text and paragraphs

- **Character formatting**: bold, italic, underline, strikethrough, small caps, superscript, subscript, font, size, text color, highlight, change case (lowercase, UPPERCASE, Title Case).
- **Paragraph styles**: Normal text, Title, Subtitle, Heading 1–6, Quote.
- **Paragraphs**: alignment, indents, line spacing (single, 1.15, 1.5, double), space before / after, borders and shading.
- **Lists**: bulleted, numbered and checklists; typing a list marker starts a list automatically.
- **Copy / paste formatting** and **clear formatting**.
- **Paste**: images in pasted content are removed (see *Limits*); `Ctrl+Shift+V` pastes plain text.

### Insert

- **Tables**: size picker, rows, columns, merge and split cells, cell selection, header row, column width, row height, borders, background colors, alignment, distribute evenly.
- **Links**: to a web page (opens in a new tab), to a heading or to a bookmark; pasting a URL over selected text makes a link.
- **Bookmarks and table of contents**: insert, update.
- **Other**: horizontal line, code block, emoji and special characters, date and time, page break.

### Find and replace

`Ctrl+F` finds, `Ctrl+G` / `Ctrl+Shift+G` go to the next / previous match, `Ctrl+H` finds and replaces.

### View

- **Print layout** (pages) or continuous page, ruler showing page, margins and indent markers, **document outline** (headings), **minimap** (off by default), non-printing characters, zoom 50–200%, full screen, hide the toolbar, document list on the left.
- **Modes**: *Editing* or *Viewing* (read only).
- **Theme**: light or dark. Theme, language, ruler, minimap, toolbar and page setup are remembered by the browser.

### Page setup

Paper **Letter**, **A4** or **Legal**, portrait or landscape, margins in centimeters (top, bottom, left, right), page color.

### Language and spelling

Document language (English, Italiano, Español, Français, Deutsch, Português) and browser spell check on / off.

### Save and export

- **Save**: autosave less than a second after each change, manual `Ctrl+S`, status *Saving… / Saved*, safe atomic writes, warning if you close the tab with unsaved changes.
- **Download**: Word `.docx`, OpenDocument `.odt`, Rich Text `.rtf`, `.pdf`, plain text `.txt`, web page `.html`, `.epub`, Markdown `.md`, and **Docly backup** `.json`.
- **PDF**: generated directly in the browser (no print dialog, no browser header or footer). Text stays selectable and links are **blue** and clickable.
- **Docly backup**: file named `<Document name>_Docly.json` with the whole document (title, content, tags, favorite, page setup, dates).
- **Import**: only the Docly JSON backup. It always creates a new document and never overwrites an existing one.
- **Print**: `Ctrl+P` prints the page without the interface.

---

## About the project

### Folder structure

```
Docly/
├── start.bat      ← double-click to start
├── server.py      ← local server and API (Python standard library only)
├── README.md
├── images/        ← 4 screenshots (home and editor, light and dark)
├── static/        ← index.html, style.css, app.js (the editor)
└── documents/     ← your documents: one folder each, named NAME_Docly, with document.json
```

### How it works

- **Backend**: `server.py` serves the site and saves documents to disk through a small REST API. It listens only on `127.0.0.1:8756`.
- **Frontend**: plain HTML, CSS and JavaScript with no framework or external libraries. All exports (Word, OpenDocument, RTF, PDF, EPUB and the others) are generated in the browser.
- **Privacy**: nothing leaves your computer and it works fully offline.
- **Data**: `document.json` holds id, title, content (HTML), tags, favorite and dates. Backup = copy the `documents/` folder, or use Docly backup (JSON) → Import JSON.

| Method | Path | Function |
|---|---|---|
| `GET` / `POST` | `/api/documents` | list / create |
| `GET` / `PUT` / `DELETE` | `/api/documents/<id>` | read / save / move to Recycle Bin |
| `GET` | `/api/documents/<id>/path` | folder path on disk |
| `PUT` | `/api/documents/<id>/rename` · `/favorite` | rename / toggle favorite |
| `GET` | `/api/search?q=` | search title, text and tags |

### Limits and tips

- **Images are not supported**: pictures are removed when you paste, drop or open content that contains them. Docly is for text, tables and lists.
- Page size, orientation, color and margins are saved in the browser and apply to every document, not to a single one.
- The `.docx`, `.odt`, `.rtf` and `.epub` exports have not been checked in every program; open them once before sending them.
- The PDF uses the standard PDF fonts (Helvetica and Courier), so other fonts are replaced.
- Old version still showing? Reload with `Ctrl+F5`. Port 8756 busy? Docly is already running: close the other window.

---

*Docly: local word processor. All data stays on your computer.*
