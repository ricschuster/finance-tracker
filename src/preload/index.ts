import { contextBridge, ipcRenderer } from 'electron'
import type { LedgerApi } from '../core/ledger/handlers'
import type { ImportApi } from '../core/import/handlers'
import { IMPORT_METHODS } from '../core/import/methods'
import { LEDGER_METHODS } from '../core/ledger/methods'

const ledger = Object.fromEntries(
  LEDGER_METHODS.map((name) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(`ledger:${name}`, ...args),
  ]),
) as unknown as LedgerApi

const importer = {
  ...(Object.fromEntries(
    IMPORT_METHODS.map((name) => [
      name,
      (...args: unknown[]) => ipcRenderer.invoke(`import:${name}`, ...args),
    ]),
  ) as unknown as ImportApi),
  pickFile: (): Promise<{ name: string; text: string } | null> =>
    ipcRenderer.invoke('import:pickFile'),
}

const api = {
  getAppInfo: (): Promise<{ version: string; schemaVersion: number }> =>
    ipcRenderer.invoke('app:info'),
  ledger,
  importer,
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
