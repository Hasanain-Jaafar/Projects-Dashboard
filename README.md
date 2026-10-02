# Projects Dashboard

A glassy, Apple-inspired desktop dashboard for your local code projects — a fast
personal command center for finding, understanding, and opening your work.
Built with Electron: frameless window, pastel glassmorphism, and
SF-Symbol-style icons.

## Features

- **Auto-detects projects** from the folder(s) you point it at (reads
  `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `.csproj`, etc.)
  and keeps watching — new projects appear automatically.
- **Cards** with name, description, preview image, difficulty rating,
  live/status badge, tags, and compact **Git** + **last-activity** info.
- **Stack chips** show up to 4 icons per card (the rest collapse into a `+N`
  chip with a tooltip). Every chip has a tooltip, and full labels appear in the
  project details and the sidebar **Stacks** filter. Frameworks are listed
  first, redundant signals (JavaScript beside TypeScript, Node on every JS
  project) and VCS/forge entries (Git, GitHub) are filtered out.
- **Git status (read-only, never writes)**: branch, uncommitted changes,
  ahead/behind, last commit, and remote. Uncommitted work is highlighted in
  orange, ahead/behind shows as "*n* not pushed" / "*n* behind", and clicking
  the change count lists the changed files. Detached HEADs, repos git refuses
  to read, and missing git binaries are all handled without showing bogus
  "Clean" state.
- **Project details** panel: General, Stack, Git, Activity, Organization
  (favorite + tags) and a private **Notes** field.
- **Favorites** and **custom tags**, both persisted between launches.
- **Filters** (status, Git state, tags, favorites) and **sorting** by name,
  recently modified, recently updated, Git activity, stack, or favorites.
- **Quick actions**: open in editor, run project, open terminal, open folder,
  reveal in Explorer, copy path, open Git repository.
- **Grid / list views**, light/dark/system theme plus accent picker, tray icon
  and a global hotkey.

## Run it

```bash
npm install
npm start
```

## How it works

| File | Purpose |
| --- | --- |
| `main.js` | Main process: frameless window, `local://` image protocol, filesystem / Git / process IPC, settings persistence |
| `scanner.js` | Walks your folders, detects projects, extracts metadata and read-only Git status |
| `preload.js` | Safe `window.api` bridge (context isolation enabled) |
| `renderer/` | The glassy UI: `index.html`, `styles.css`, `icons.js`, `app.js`, `extras.js` |

All filesystem, Git, and process work happens in the main process; the renderer
only gets a small, explicit API through `preload.js`.

## Usage tips

1. Click **Add folder / Projects folder** (or **Settings → Add folder**) and
   choose the folder where all your projects live. New folders are detected
   automatically.
2. Click a card for details, **double-click a card to open it in your editor**,
   or use the hover buttons (**open in editor**, **run**, **terminal**, reveal)
   and the right-click menu for quick actions. The details modal also puts the
   primary actions right under the title, so nothing is buried.
3. **Hover a card and tap the star** to favorite it, then use the **Favorites**
   entry in the sidebar or the **Filter** menu to focus on it.
4. Use **New project** to scaffold a folder with a `README.md`, or **New file /
   New folder** from a project's detail view or right-click menu.

### Running a project

The **Run project** action (card hover button, right-click menu, or details
panel) reads your `package.json` scripts and prefers `dev`, then `start`.
It uses the detected package manager (`npm`, `pnpm`, `yarn`, or `bun`) and runs
in the project folder. The menu label shows exactly which script will be
executed, and the action is disabled when no runnable script exists.

### Live indicator

A card shows a green **Live** badge (clickable, opens the site) when the project
declares a URL. The dashboard looks for it in this order:

1. `.dashboard.json` at the project root — `url`, `live`, `liveUrl`, or `homepage`
2. `package.json` (or `composer.json`) — `homepage`, `live`, `liveUrl`, `url`, or `deployUrl`
3. `pyproject.toml` — `Homepage`

Example `package.json`:

```json
{
  "name": "my-app",
  "homepage": "https://my-app.example.com"
}
```

Or drop a `.dashboard.json` next to it:

```json
{ "url": "https://my-app.example.com" }
```

You can also set or override the URL per project from the right-click menu
(**Set live URL…**) or the details panel; per-project overrides are stored in
the app settings, not in your repository.

### Thumbnails

A card uses, in order: a preview image shipped with the project (`cover`,
`screenshot`, `logo`, …), a screenshot captured from the project's **live URL**,
or a monogram of the project name. Captured screenshots are taken in a
sandboxed, node-less window in the main process, cached for a week under the
app's user-data folder, and can be disabled or cleared in **Settings → Project
detection**. This makes a network request to the project's live URL.

### Names

The project name comes from an explicit `displayName`/`productName` in
`package.json`, then the README's first heading (which preserves the author's
casing, e.g. `BudgetOS`), then the package name, then the folder. You can
override it per project: **Rename project…** in the right-click menu, or the
pencil next to the title in the details panel. Renaming the folder on disk is a
separate action (**Rename folder…**).

### Descriptions

A card's description comes from, in order: the project manifest
(`package.json` / `pyproject.toml` / `Cargo.toml` / `composer.json` /
`pubspec.yaml`), then the first real paragraph of the README. Raw markdown is
stripped (images, badges, links, code blocks, frontmatter), the README title is
skipped, and common scaffold boilerplate (create-next-app, Create React App,
Vite, etc.) is ignored so you never see "This is a Next.js project bootstrapped
with…" on a card.

If nothing good is found, the details panel shows **Add description** — click it
to write your own. Your description is saved to the app settings (never written
into your repository) and overrides the detected one. Right-click a card and
pick **Edit description…**, or use the button in the details panel, at any time.

### Difficulty

Difficulty is a subjective, user-assigned rating (Beginner, Easy, Moderate,
Hard, Expert) — it isn't detected. On a card it appears as a small labelled
chip (a coloured dot plus the level name); unrated projects show nothing. Click
the chip to pick a level from a popover, use **Set difficulty…** in the
right-click menu, or use the labelled segmented control in the details panel.
The dot's colour is a cool-to-warm intensity ramp, so it reads as "harder"
rather than "better or worse".

### Status

Statuses are `Development`, `Live`, `Paused`, `Archived`, and `Broken`. They are
user-defined (set from the details panel) and persist. By default a project with
a live URL is treated as **Live**, everything else as **Development**.
