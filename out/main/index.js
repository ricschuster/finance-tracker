"use strict";
const node_path = require("node:path");
const electron = require("electron");
const Database = require("better-sqlite3");
const migrations = [
  `CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   INSERT INTO settings (key, value) VALUES ('home_currency', 'CAD');`
];
function migrate(db, list = migrations) {
  const current = db.pragma("user_version", { simple: true });
  if (current > list.length) {
    throw new Error(`Database version ${current} is newer than this app supports (${list.length})`);
  }
  for (let v = current; v < list.length; v++) {
    const sql = list[v];
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return list.length;
}
function openDatabase(path) {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(node_path.join(__dirname, "../renderer/index.html"));
  }
}
void electron.app.whenReady().then(() => {
  const db = openDatabase(node_path.join(electron.app.getPath("userData"), "finance.sqlite"));
  electron.ipcMain.handle("app:info", () => ({
    version: electron.app.getVersion(),
    schemaVersion: db.pragma("user_version", { simple: true })
  }));
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
