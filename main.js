"use strict";

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  shell,
  clipboard,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { spawn, execFileSync } = require("child_process");

const { scan } = require("./scanner");
const { thumbPathFor, captureSite } = require("./capture");

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".tiff": "image/tiff",
};

// Custom scheme so the renderer can stream local project images securely.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow = null;
let tray = null;
let isQuitting = false;

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return { roots: [], sort: "name", view: "grid" };
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Build a safe child path, rejecting traversal / invalid Windows filename chars.
function safeJoin(base, name) {
  if (typeof name !== "string") throw new Error("Name is required");
  const clean = name.trim();
  if (!clean) throw new Error("Name is required");
  if (/[\\/]/.test(clean)) throw new Error("Name cannot contain slashes");
  if (clean === "." || clean === "..") throw new Error("Invalid name");
  if (/[<>:"|?*\u0000-\u001f]/.test(clean))
    throw new Error("Name contains invalid characters");
  return path.join(base, clean);
}

function openInTerminal(dir) {
  const wt = spawn("wt.exe", ["-d", dir], { detached: true, stdio: "ignore" });
  wt.on("error", () => {
    const cmd = spawn(
      "cmd.exe",
      ["/c", "start", "cmd.exe", "/K", "cd", "/d", dir],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    cmd.on("error", () => {});
    cmd.unref();
  });
  wt.unref();
}

// ---------- Editor integration ----------
const EDITOR_CANDIDATES = [
  {
    id: "zed",
    name: "Zed",
    commands: ["zed"],
    paths:
      process.platform === "win32"
        ? [
            path.join(
              process.env.LOCALAPPDATA || "",
              "Programs",
              "Zed",
              "zed.exe",
            ),
            path.join(
              process.env.LOCALAPPDATA || "",
              "Programs",
              "Zed",
              "Zed.exe",
            ),
            path.join(process.env.LOCALAPPDATA || "", "Zed", "zed.exe"),
            path.join(process.env.PROGRAMFILES || "", "Zed", "Zed.exe"),
          ]
        : [
            "/usr/local/bin/zed",
            "/opt/homebrew/bin/zed",
            "/Applications/Zed.app/Contents/MacOS/zed",
          ],
  },
  {
    id: "code",
    name: "VS Code",
    commands: ["code"],
    paths:
      process.platform === "win32"
        ? [
            path.join(
              process.env.LOCALAPPDATA || "",
              "Programs",
              "Microsoft VS Code",
              "Code.exe",
            ),
          ]
        : [
            "/usr/local/bin/code",
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
          ],
  },
  {
    id: "cursor",
    name: "Cursor",
    commands: ["cursor"],
    paths:
      process.platform === "win32"
        ? [
            path.join(
              process.env.LOCALAPPDATA || "",
              "Programs",
              "cursor",
              "Cursor.exe",
            ),
            path.join(
              process.env.LOCALAPPDATA || "",
              "Programs",
              "Cursor",
              "Cursor.exe",
            ),
          ]
        : [
            "/usr/local/bin/cursor",
            "/Applications/Cursor.app/Contents/MacOS/Cursor",
          ],
  },
];

function findExecutable(cmd) {
  try {
    const out = execFileSync(
      process.platform === "win32" ? "where" : "which",
      [cmd],
      {
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).toString();
    return (
      out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)[0] || null
    );
  } catch {
    return null;
  }
}

function detectEditors() {
  const found = [];
  for (const ed of EDITOR_CANDIDATES) {
    let command = ed.paths.find((p) => p && fs.existsSync(p)) || null;
    if (!command)
      command = ed.commands.map(findExecutable).find(Boolean) || null;
    if (command) found.push({ id: ed.id, name: ed.name, command });
  }
  return found;
}

function openInEditor(dir, editorId, commandOverride) {
  let command =
    commandOverride && commandOverride.trim() ? commandOverride.trim() : null;
  if (!command) {
    const editors = detectEditors();
    if (!editors.length) return { ok: false, error: "No editor found" };
    const ed = editors.find((e) => e.id === editorId) || editors[0];
    command = ed.command;
  }
  try {
    const child = spawn(command, [dir], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- Git remote ----------
function normalizeRemote(url) {
  if (!url) return null;
  const u = String(url).trim();
  const scp = u.match(/^git@([^:]+):(.+)$/i);
  if (scp) return "https://" + scp[1] + "/" + scp[2].replace(/\.git$/i, "");
  const ssh = u.match(/^ssh:\/\/git@([^/]+)\/(.+)$/i);
  if (ssh) return "https://" + ssh[1] + "/" + ssh[2].replace(/\.git$/i, "");
  if (/^https?:\/\//i.test(u)) return u.replace(/\.git$/i, "");
  return null;
}

// ---------- Tray + window ----------
function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  try {
    let img = nativeImage.createFromPath(
      path.join(__dirname, "assets", "icon-32.png"),
    );
    if (img.isEmpty()) return;
    img = img.resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip("Projects");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Projects  (Ctrl+Shift+D)", click: showWindow },
        { label: "Hide", click: () => mainWindow && mainWindow.hide() },
        { type: "separator" },
        {
          label: "Quit",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", showWindow);
  } catch {
    /* tray not supported */
  }
}

function registerShortcuts() {
  try {
    globalShortcut.register("CommandOrControl+Shift+D", () => {
      if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused())
        mainWindow.hide();
      else showWindow();
    });
  } catch {
    /* ignore */
  }
}

// ---------- Auto-detect projects (file watching) ----------
const IGNORE_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".svelte-kit",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "vendor",
  ".idea",
  ".vscode",
  "bin",
  "obj",
]);

let watchers = [];
let rescanTimer = null;

function isIgnoredRel(rel) {
  if (!rel) return false;
  return String(rel)
    .split(/[\\/]/)
    .some((seg) => IGNORE_SEGMENTS.has(seg));
}

function scheduleRescan() {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("projects:changed");
  }, 1200);
}

function stopWatching() {
  for (const w of watchers) {
    try {
      w.close();
    } catch {}
  }
  watchers = [];
}

function startWatching(roots) {
  stopWatching();
  for (const root of roots || []) {
    try {
      const w = fs.watch(root, { recursive: true }, (event, filename) => {
        if (isIgnoredRel(filename)) return;
        scheduleRescan();
      });
      w.on("error", () => {});
      watchers.push(w);
    } catch {
      // recursive watch unsupported (e.g. Linux) \u2014 watch the top level instead
      try {
        const w = fs.watch(root, () => scheduleRescan());
        w.on("error", () => {});
        watchers.push(w);
      } catch {}
    }
  }
}

function registerIpc() {
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (e, s) => {
    const before = getSettings();
    const r = saveSettings(s);
    const rootsChanged =
      !!(s && Array.isArray(s.roots)) &&
      JSON.stringify(s.roots) !== JSON.stringify(before.roots || []);
    if (rootsChanged) startWatching(s.roots);
    return r;
  });

  ipcMain.handle("settings:export", async () => {
    try {
      const r = await dialog.showSaveDialog(mainWindow, {
        title: "Export configuration",
        defaultPath: "projects-dashboard-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(r.filePath, JSON.stringify(getSettings(), null, 2));
      return { ok: true, path: r.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("settings:import", async () => {
    try {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: "Import configuration",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (r.canceled || !r.filePaths.length)
        return { ok: false, canceled: true };
      const data = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8"));
      if (!data || typeof data !== "object")
        return { ok: false, error: "Invalid file" };
      const merged = Object.assign(getSettings(), data);
      saveSettings(merged);
      return { ok: true, settings: merged };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("folder:choose", async (e, multi) => {
    const properties = ["openDirectory"];
    if (multi !== false) properties.push("multiSelections");
    const r = await dialog.showOpenDialog(mainWindow, {
      title: multi === false ? "Choose a folder" : "Choose project folders",
      buttonLabel: "Add",
      properties,
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle("projects:scan", (e, roots) => {
    const s = getSettings();
    return scan(Array.isArray(roots) ? roots : [], {
      git: s.gitEnabled !== false,
    });
  });

  ipcMain.handle("shell:open-remote", (e, url) => {
    try {
      const web = normalizeRemote(url);
      if (!web) return { ok: false, error: "No repository URL" };
      shell.openExternal(web);
      return { ok: true, url: web };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Capture live-site screenshots to use as thumbnails (main process only).
  ipcMain.handle("thumbs:get", async (e, items) => {
    const s = getSettings();
    if (s.captureScreenshots === false) return { ok: false, disabled: true };
    const dir = path.join(app.getPath("userData"), "thumbnails");
    const ttl = 7 * 24 * 60 * 60 * 1000;
    const thumbs = {};
    for (const it of (Array.isArray(items) ? items : []).slice(0, 10)) {
      if (!it || !it.path || typeof it.url !== "string") continue;
      if (!/^https?:\/\//i.test(it.url)) continue;
      const file = thumbPathFor(dir, it.url);
      try {
        const st = fs.statSync(file);
        if (Date.now() - st.mtimeMs < ttl) {
          thumbs[it.path] = file;
          continue;
        }
      } catch {
        /* not cached yet */
      }
      const r = await captureSite(it.url, file);
      if (r && r.ok && r.file) thumbs[it.path] = r.file;
    }
    return { ok: true, thumbs };
  });

  ipcMain.handle("thumbs:clear", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "thumbnails");
      await fsp.rm(dir, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:create-folder", async (e, { parentPath, name }) => {
    try {
      const full = safeJoin(parentPath, name);
      await fsp.mkdir(full);
      return { ok: true, path: full };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:create-file", async (e, { dirPath, name, content }) => {
    try {
      const full = safeJoin(dirPath, name);
      await fsp.writeFile(full, content || "", { flag: "wx" });
      return { ok: true, path: full };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:create-project", async (e, { parentPath, name }) => {
    try {
      const full = safeJoin(parentPath, name);
      await fsp.mkdir(full);
      await fsp.writeFile(path.join(full, "README.md"), `# ${name}\n\n`, {
        flag: "wx",
      });
      return { ok: true, path: full };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:rename", async (e, { targetPath, newName }) => {
    try {
      const dest = safeJoin(path.dirname(targetPath), newName);
      await fsp.rename(targetPath, dest);
      return { ok: true, path: dest };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:move", async (e, { targetPath }) => {
    try {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: "Move to…",
        buttonLabel: "Move here",
        properties: ["openDirectory"],
      });
      if (r.canceled || !r.filePaths.length)
        return { ok: false, canceled: true };
      const dest = path.join(r.filePaths[0], path.basename(targetPath));
      try {
        await fsp.rename(targetPath, dest);
      } catch (err) {
        if (err.code === "EXDEV") {
          await fsp.cp(targetPath, dest, { recursive: true });
          await fsp.rm(targetPath, { recursive: true, force: true });
        } else {
          throw err;
        }
      }
      return { ok: true, path: dest };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:trash", async (e, targetPath) => {
    try {
      await shell.trashItem(targetPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("clipboard:write", (e, text) => {
    clipboard.writeText(String(text == null ? "" : text));
    return { ok: true };
  });

  ipcMain.handle("editor:detect", () =>
    detectEditors().map((x) => ({ id: x.id, name: x.name })),
  );
  ipcMain.handle("editor:open", (e, { dir, editor, command }) =>
    openInEditor(dir, editor, command),
  );

  ipcMain.handle("theme:get", () => ({
    system: nativeTheme.shouldUseDarkColors ? "dark" : "light",
  }));

  ipcMain.handle("shell:open-path", (e, p) => shell.openPath(p));
  ipcMain.handle("shell:reveal", (e, p) => shell.showItemInFolder(p));
  ipcMain.handle("shell:open-terminal", (e, p) => {
    openInTerminal(p);
    return { ok: true };
  });

  ipcMain.handle("shell:open-external", (e, url) => {
    try {
      const u = String(url || "");
      if (!/^https?:\/\//i.test(u)) return { ok: false, error: "Invalid URL" };
      shell.openExternal(u);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.on("window:minimize", () => mainWindow && mainWindow.minimize());
  ipcMain.on("window:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("window:close", () => mainWindow && mainWindow.close());
  ipcMain.handle(
    "window:is-maximized",
    () => !!(mainWindow && mainWindow.isMaximized()),
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: "#e9ebf4",
    title: "Projects",
    icon: path.join(__dirname, "assets", "icon-256.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("maximize", () =>
    mainWindow.webContents.send("window:maximized-changed", true),
  );
  mainWindow.on("unmaximize", () =>
    mainWindow.webContents.send("window:maximized-changed", false),
  );

  // Close to tray (when enabled).
  mainWindow.on("close", (e) => {
    if (!isQuitting && getSettings().closeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  protocol.handle("local", async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const data = await fsp.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, {
        headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  registerIpc();
  createWindow();
  createTray();
  registerShortcuts();
  startWatching(getSettings().roots || []);

  nativeTheme.on("updated", () => {
    if (mainWindow) {
      mainWindow.webContents.send(
        "theme:system-changed",
        nativeTheme.shouldUseDarkColors ? "dark" : "light",
      );
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});
app.on("will-quit", () => {
  stopWatching();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
