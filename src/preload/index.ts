import { contextBridge, ipcRenderer } from 'electron'
import type { LedgerApi } from '../core/ledger/handlers'
import { LEDGER_METHODS } from '../core/ledger/methods'

const ledger = Object.fromEntries(
  LEDGER_METHODS.map((name) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(`ledger:${name}`, ...args),
  ]),
) as unknown as LedgerApi

const api = {
  getAppInfo: (): Promise<{ version: string; schemaVersion: number }> =>
    ipcRenderer.invoke('app:info'),
  ledger,
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
