import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getAppInfo: (): Promise<{ version: string; schemaVersion: number }> =>
    ipcRenderer.invoke('app:info'),
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
