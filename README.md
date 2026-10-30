# Adinsure Document Flow Viewer

VS Code extension for visualizing and editing the lifecycle of **Adinsure**
documents. Works with project files:

- `documentFlow.json` — states and transitions;
- `configuration.json` — actors, permissions, attachments;
- `translation/translation.csv` — translations (one column per language);
- `documentFlow.ui.json` — graph coordinates;
- `authorization/authorization.csv` — role mapping;
- `documentRelation/*` — related documents;
- `flowRules/*.js` — transition rules (checks and actions);
- `document/<DocName>/UI/ClientAction/*.js` — client actions;
- `configuration/@config-*/infrastructure/masterEntity/AttachmentType/` —
  attachment type catalog.

## Features

### Language support

The extension supports two independent language mechanisms:

**Data language** — the language of Adinsure data (state names, transition
names, actor names, attachment types, document titles). The list of available
languages is derived from the columns of `translation.csv` (`Translation_en-US`,
`Translation_ru-RU`, `Translation_mk-MK`, …). Pick the language with the `🌐`
selector in the main toolbar. The choice is not persisted — each time the
document opens, the default language is used:

- if there is exactly one non-English column, it is chosen automatically;
- if there are several, the first one in CSV order is chosen;
- `en-US` is always the last option in the list.

Data-language switching is done client-side without reloading the webview —
graph, table, matrix, actors view, forms and validator are re-rendered
instantly.

**UI language** — the language of the extension interface (buttons, dialogs,
hints, validation messages). Configured through VS Code setting
`adinsureDocFlow.uiLanguage`:

- `"auto"` (default) — follows `vscode.env.language`;
- `"ru-RU"` — Russian;
- `"en-US"` — English.

The two languages are independent: you can have an English UI while viewing
data in Macedonian, or vice versa. Changing the setting takes effect
immediately without reloading the extension host.

### Three view modes

Cycled by one button in the main toolbar:
**Table → Graph → Matrix → Actors → Table**. The current mode is persisted
between sessions.

### Table view

- All document states with the list of actors and their permissions.
- **Click on a state name** — open the edit form.
- **`×` button next to a name** — delete the state with all references.
- Transitions are colored: source state is blue, transitions are green.
- Actor permissions — collapsible blocks: `comments`, `operations`,
  `transitions`, `attachments`. Use the toolbar buttons to collapse or expand
  everything at once.
- **"Terminal" column** — `isTerminal` checkbox, edited inline.
- Sorting by state name (click the column header): unsorted → A→Z → Z→A.
- Transitions triggered through related documents (`documentRelation`) are
  marked as `(relation)`. Related actions that do not change the status
  (e.g. creating an amendment) are placed in a separate `links:` section
  and shown with the human-readable document name.

### Graph view

- **SVG graph** with rounded state rectangles and smooth transition paths
  (arcs at corners).
- **Dagre layout** — hierarchical node layout with minimal crossings.
  Direction toggles: `↕` top-to-bottom / `↔` left-to-right.
- **Edge anchoring** — connection points are determined by the actual gap
  between states, not by the difference of centers. This eliminates "hooks"
  when states overlap along one axis.
- **Obstacle avoidance** — if a line crosses another state, the route
  automatically detours around it.
- **Selection and multi-selection** — click, `Ctrl+click`, click on the
  background resets.
- **Related elements are highlighted** with a turquoise dashed outline when a
  state or transition is selected.
- **Action toolbar** — edit, delete (with confirmation).
- **Double-click** on a state opens the edit form; on a transition — the
  transition editor; `Alt+double-click` on a transition adds an intermediate
  point at the click location.
- **Precise movement** — `Ctrl+arrows` moves selected states by 1 px,
  `Shift+Ctrl+arrows` — by 10 px.
- **Create transition by drawing** — right-click on a state starts a dashed
  line; click on the target state creates a transition with code `From_To`
  and opens the form. `Escape` cancels drawing.
- **Manual transition routes** — a selected transition exposes handles:
  edge points (snap to state edges), intermediate points (move/remove with
  right-click), segment strips (shift the whole segment).
- **Segment strip on every segment** — including the first and the last
  (and the single segment of a straight two-point transition).
- **Move segments with arrow keys** — click a segment strip to make it
  active (highlighted blue). `Ctrl+arrows` moves it by 1 px perpendicular
  to its direction, `Ctrl+Shift+arrows` — by 10 px. Arrow keys along the
  segment axis are ignored. `Escape`, click on a state, transition or
  background removes the active segment.
- **Edge-point snap during segment drag** — when you drag the strip of an
  edge segment, the point on the state slides along its edge (with a 10px
  padding from the corners) and never detaches from the state.
- **Action legend** — a movable dock with hints (book button in the graph
  toolbar). Position and visibility are persisted between sessions.
- **Save positions** to `documentFlow.ui.json`.
- **Zoom** — `%` field in the toolbar and `Ctrl+wheel`.
- **Hide transition labels** — `🏷️` button in the toolbar.

### Transition matrix

Compact N×N table: rows and columns are states, intersections are
transitions "from row to column".

- Row/column headers — **3-letter abbreviations**, generated automatically
  with collision resolution. Full name and translation are in the tooltip
  and in the legend.
- **Filled cell** — transition exists, arrow icon shown, tooltip contains
  the transition code and its translation.
- **Empty cell** — double-click creates a transition "i → j" with
  prefilled form fields.
- **Cell with transition** — double-click opens the edit form.
- **Click on a row/column header** — edit the state.
- **Diagonal** (self-transition) and **rows of terminal states** are gray
  and inactive; clicks are ignored.
- Legend of abbreviations is shown on the right in 2 columns.

### Actors view

- All actors, with chips of states and transitions they have access to.
- Click on a state chip — edit actor permissions in that state.
- Click on a transition chip — open the transition.
- Add/remove actor from a state, add/remove transition from an actor.
- Rename actor (updates `documentFlow.json`, `configuration.json`,
  `translation.csv`, `authorization.csv`).
- Duplicate actor (copy permissions across states).
- Delete actor from all states and from authorization.
- Edit actor roles in `authorization.csv`.

### Document comparison

New `⇄` button in the main toolbar — compare the current document with
another document in the project (or a folder chosen manually).

Compares:

- states (`isTerminal`, presence/absence, translations);
- transitions (`from`, `to`, `actionToRunBefore`, `serverSideEvents`,
  `allowOnValidationErrors`, presence/absence);
- global actors (`documentFlow.actors`);
- actors in each state (membership);
- actor permissions (`allowComments`, operations, transitions, attachments);
- document attachments (`configuration.attachments`);
- `initialState`.

Choose the reference document from the list of all documents in the
project, or pick a folder manually. The current document is marked and
excluded from the list.

The diff is shown as a flat list of atomic actions with a verb
(`Add`, `Delete`, `Change`, `Allow`, `Deny`, `Enable`, `Disable`) and a
context in parentheses (`(object in documentFlow.states)`,
`(membership)`, `(actor property)`, `(actor right)`, `(attachment right)`).

Apply with checkboxes for each action. Three selection modes:
"Select all except delete", "Select all", "Deselect all". On apply:

- order is sorted by operation type (add → change → remove) so that
  cascading deletions do not break references;
- double confirmation if the selection contains deletions (client
  `showConfirm` + server `showWarningMessage`);
- for new transitions, `flowRules/<code>.js` and
  `ClientAction/<action>.js` are copied from the reference (only if the
  file is missing in the current document);
- `authorization.csv` lines `Allow Actor` for the reference document are
  copied to the current one with `CodeName` replaced;
- translations for new elements are copied for all **common** language
  columns (present in both `translation.csv` files); new language columns
  are not created automatically.

### Editing

- **Add state** — code, translation, `isTerminal`, outgoing transitions,
  actor permissions.
- **Edit state** — rename code (updates all references in all files),
  translation, `isTerminal`, outgoing transitions, actor permissions.
  Incoming transitions are shown for reference.
- **Delete state** — with all references: from `documentFlow.json`,
  `configuration.json`, `translation.csv`, `documentFlow.ui.json`,
  `flowRules/*.js` of all transitions of this state.
- **Auto-generated transition code** by the `From_To` rule. Manual input
  is fixed — automation no longer overwrites it.
- **Transition editor** — code, `to`, translation, `actionToRunBefore`,
  `serverSideEvents` (`broadcastEvent`), `allowOnValidationErrors`
  (`all = true/false`, `codes`, `exceptForCodes`). The form title clearly
  says "Create transition" or "Edit transition".
- **Copy actor to other states** with preserved permissions or under a
  new name. Duplicates are skipped.
- **Delete actor from a specific state** — `×` button next to the name.
- **Authorization editor** — `🔑` button opens `authorization.csv` and
  allows editing the "ApplicationRole → Actor" mapping.
- **Flow skeleton** — `🏗️` button creates a document skeleton in an empty
  folder or extends the existing one: states, transition matrix,
  translations.

### Actor permissions

- **Transitions** — table of checkboxes with all outgoing transitions of
  the state. Updates on the fly when outgoing transitions are edited in
  the same form. References to transitions that no longer exist among
  outgoing ones are shown in a separate block and removed on save (with
  a warning).
- **Operations** — checkboxes for operations + `exclusiveToAssignedUser`
  flag.
- **Attachments** — permissions for attachments added to the document
  (see the "Attachments" section). Rendered as a table with columns
  `Attachment type | Create | Read | Update | Delete`.
- **Unmanaged properties are preserved as-is.** If an actor in
  `configuration.json` has fields the extension does not manage (for
  example `uiSchema`, `availableActivityTypes`, `ui`), they are not lost
  on save. Same for transitions in `documentFlow.json` (for example
  `whenBlocked`, `requiredAttachments`).

### Attachments (AttachmentType)

Paperclip button in the toolbar — manage attachment types.

**Catalog** (`configuration/@config-*/infrastructure/masterEntity/AttachmentType/`):

- List of all attachment types in the project with translations.
- **Add type** — new code + translation. Written to `data.csv` and
  `translation/translation.csv`. Adding can be undone before closing the
  window (real removal from files).
- **Delete type** — removes from catalog (with confirmation).
- `data.csv` supports multi-column format (`\t`-separated) with optional
  header `Code`; all columns are preserved on save. If a column name
  contains `description`, its value for a new type is set to the code.

**Document attachments** (`configuration.json → attachments[]`):

- **Add to document** — select from the catalog (types not yet in the
  document) + permission mode:
  - do not set;
  - "read for all" — actors who already have an attachment with `Read`;
  - "by template" — copy permissions from each actor's first attachment.
- **Remove from document** — removes from `attachments[]` and from
  `attachmentsRestrictions` of all actors of all states.

### FlowRules and ClientAction

- **FlowRules** — `📄 flowRules` button next to the transition code field.
  Opens `flowRules/<code>.js` in the editor; if the file is missing,
  offers to create it from a template. When a transition is renamed, the
  file is renamed automatically; when deleted — removed.
- **ClientAction** — buttons next to `actionToRunBefore`:
  - **＋ Create** — set a name and create
    `document/<DocName>/UI/ClientAction/<action>.js` (or bind an existing
    one from another package);
  - **📄** — open the file in the editor;
  - **✎** — rename the file (together with the function name inside);
  - **🗑** — delete the file.
  If a file with the given name does not exist, the field is cleared so
  as not to mislead with a nonexistent function. The
  `actionToRunBefore` value is written to `documentFlow.json` on save.

### Checks and utility panels

**Validator** (`🔍 Check`):

1. Unreachable states relative to `initialState`.
2. Terminal states with outgoing transitions.
3. Missing translations for the current data language (separately for
   states and transitions).
4. States without actors.
5. **System transitions.** A transition available only to `System` /
   `ServiceExecutor` actors (or to no one) must have
   `broadcastEvent.serverSideEvents = true`. The actor list is the
   `SERVER_SIDE_ONLY_ACTORS` constant in `media/modules/forms-other.js`.
6. Problems in `documentRelation` relations.

**Relations panel** (`🔗 Relations`):

- Searches `documentRelation/*/configuration.json` **across the whole
  project** — in `configuration/@config-*` and in `node_modules/@config-*`.
- Relations are split into **outgoing** (our document → others) and
  **incoming** (others → our document).
- Each card shows the source package.
- Duplicate `documentRelation` name in `configuration/` and in
  `node_modules/` is treated as an override: priority to `configuration`,
  the base is marked as overridden (badge "override").
- A true duplicate (same name in two `configuration` packages, or in two
  `node_modules` packages) is marked with a "duplicate" badge and appears
  in the problem list.

## Installation

### From `.vsix`

    npm install -g @vscode/vsce       # one-time, requires Node.js 20+
    vsce package
    code --install-extension adinsure-document-flow-viewer-0.6.1.vsix

### Rebuild after changes

    vsce package
    code --uninstall-extension BakhtiarD.adinsure-document-flow-viewer
    code --install-extension adinsure-document-flow-viewer-X.Y.Z.vsix

Then `Ctrl+Shift+P → Developer: Reload Window`.

## Development

- Frontend webview — vanilla JS, no bundler, modules in
  `media/modules/*` as IIFEs with a global `window.PF`.
- Backend — Node.js in `src/*`.
- More details in `HANDOFF.md` (architecture, conventions, refactoring
  history).

### Localization files

- UI strings — `media/locales/*.js` (webview) and `src/locales/*.js`
  (extension host). One file per language. Add a new language by creating
  a new file with the corresponding dictionary — no code changes needed.
- Data translations — `translation.csv` columns `Translation_<lang>`.
  No registration required; the extension discovers them automatically.

## License

MIT.