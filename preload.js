"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Convert an absolute filesystem path into a URL served by the main process.
const assetUrl = (p) => "local://asset/" + encodeURIComponent(p);

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,

  assetUrl,

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:set", s),
  exportSettings: () => ipcRenderer.invoke("settings:export"),
  importSettings: () => ipcRenderer.invoke("settings:import"),

  // Scanning
  chooseFolder: (multi) => ipcRenderer.invoke("folder:choose", multi),
  scan: (roots) => ipcRenderer.invoke("projects:scan", roots),

  // Clipboard
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),

  // Filesystem
  createFolder: (parentPath, name) =>
    ipcRenderer.invoke("fs:create-folder", { parentPath, name }),
  createFile: (dirPath, name, content) =>
    ipcRenderer.invoke("fs:create-file", { dirPath, name, content }),
  createProject: (parentPath, name) =>
    ipcRenderer.invoke("fs:create-project", { parentPath, name }),
  renamePath: (targetPath, newName) =>
    ipcRenderer.invoke("fs:rename", { targetPath, newName }),
  movePath: (targetPath) => ipcRenderer.invoke("fs:move", { targetPath }),
  trashPath: (targetPath) => ipcRenderer.invoke("fs:trash", targetPath),

  // Projects
  openRemote: (url) => ipcRenderer.invoke("shell:open-remote", url),
  captureThumbs: (items) => ipcRenderer.invoke("thumbs:get", items),
  clearThumbs: () => ipcRenderer.invoke("thumbs:clear"),

  // Editors
  detectEditors: () => ipcRenderer.invoke("editor:detect"),
  openInEditor: (dir, editor, command) =>
    ipcRenderer.invoke("editor:open", { dir, editor, command }),

  // Theme
  getSystemTheme: () => ipcRenderer.invoke("theme:get"),
  onSystemThemeChange: (cb) =>
    ipcRenderer.on("theme:system-changed", (e, v) => cb(v)),
  onProjectsChanged: (cb) => ipcRenderer.on("projects:changed", () => cb()),

  // Drag & drop helper
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Shell
  openPath: (p) => ipcRenderer.invoke("shell:open-path", p),
  revealInExplorer: (p) => ipcRenderer.invoke("shell:reveal", p),
  openInTerminal: (p) => ipcRenderer.invoke("shell:open-terminal", p),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),

  // Window controls
  windowMinimize: () => ipcRenderer.send("window:minimize"),
  windowToggleMaximize: () => ipcRenderer.send("window:maximize"),
  windowClose: () => ipcRenderer.send("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onWindowMaximizedChange: (cb) =>
    ipcRenderer.on("window:maximized-changed", (e, v) => cb(v)),
});
