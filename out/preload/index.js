"use strict";
const electron = require("electron");
const api = {
  getAppInfo: () => electron.ipcRenderer.invoke("app:info")
};
electron.contextBridge.exposeInMainWorld("api", api);
