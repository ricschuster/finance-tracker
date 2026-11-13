import { contextBridge, ipcRenderer } from 'electron'
import type { BackupSettings, CsvExportFilter } from '../core/backup'
import type { DataStatus } from '../main/data-ipc'
import type { LedgerApi } from '../core/ledger/handlers'
import type { ImportApi } from '../core/import/handlers'
import { IMPORT_METHODS } from '../core/import/methods'
import { LEDGER_METHODS } from '../core/ledger/methods'
import type { RulesApi } from '../core/rules/handlers'
import { RULES_METHODS } from '../core/rules/methods'
import type { ReportsApi } from '../core/reports/handlers'
import { REPORTS_METHODS } from '../core/reports/methods'
import type { SearchApi } from '../core/search/handlers'
import { SEARCH_METHODS } from '../core/search/methods'

const ledger = Object.fromEntries(
  LEDGER_METHODS.map((name) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(`ledger:${name}`, ...args),
  ]),
) as unknown as LedgerApi

const rules = Object.fromEntries(
  RULES_METHODS.map((name) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(`rules:${name}`, ...args),
  ]),
) as unknown as RulesApi

const search = Object.fromEntries(
  SEARCH_METHODS.map((name) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(`search:${name}`, ...args),
  ]),
) as unknown as SearchApi

const reports = Object.fromEntries(
  REPORTS_METHODS.map((name) => [
    name,
    (...args: unknown[]) => ipcRenderer.invoke(`reports:${name}`, ...args),
  ]),
) as unknown as ReportsApi

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

const data = {
  status: (): Promise<DataStatus> => ipcRenderer.invoke('data:status'),
  setSettings: (s: BackupSettings): Promise<DataStatus> =>
    ipcRenderer.invoke('data:setSettings', s),
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('data:chooseFolder'),
  backupNow: (): Promise<DataStatus> => ipcRenderer.invoke('data:backupNow'),
  exportDatabase: (): Promise<string | null> => ipcRenderer.invoke('data:exportDatabase'),
  exportCsv: (filter?: CsvExportFilter): Promise<string | null> =>
    ipcRenderer.invoke('data:exportCsv', filter),
  restoreDatabase: (): Promise<
    { status: 'cancelled' | 'restarting' } | { status: 'invalid'; reason: string }
  > => ipcRenderer.invoke('data:restoreDatabase'),
}

const api = {
  getAppInfo: (): Promise<{ version: string; schemaVersion: number }> =>
    ipcRenderer.invoke('app:info'),
  ledger,
  importer,
  rules,
  search,
  reports,
  data,
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
