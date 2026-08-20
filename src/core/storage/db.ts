import { openDB } from 'idb'
import type { ReaderDocument, ReaderPreferences, TranslationRecord } from '../document/types'

const DB_NAME = 'margin-reader'
const DB_VERSION = 1

const db = () => openDB(DB_NAME, DB_VERSION, {
  upgrade(database) {
    if (!database.objectStoreNames.contains('documents')) database.createObjectStore('documents', { keyPath: 'id' })
    if (!database.objectStoreNames.contains('translations')) database.createObjectStore('translations', { keyPath: ['documentId', 'blockId'] })
    if (!database.objectStoreNames.contains('preferences')) database.createObjectStore('preferences')
    if (!database.objectStoreNames.contains('dictionaryCache')) database.createObjectStore('dictionaryCache')
    if (!database.objectStoreNames.contains('ocrCache')) database.createObjectStore('ocrCache')
  },
})

export async function saveDocument(document: ReaderDocument, persist = true) {
  if (persist) await (await db()).put('documents', document)
  sessionStorage.setItem('margin-reader:current', JSON.stringify(document))
}

export async function loadDocuments(): Promise<ReaderDocument[]> {
  return (await (await db()).getAll('documents')).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteDocument(id: string) {
  await (await db()).delete('documents', id)
}

export function loadSessionDocument(): ReaderDocument | null {
  try { return JSON.parse(sessionStorage.getItem('margin-reader:current') ?? 'null') } catch { return null }
}

export async function saveTranslation(record: TranslationRecord) {
  await (await db()).put('translations', record)
}

export async function loadTranslations(documentId: string): Promise<TranslationRecord[]> {
  return (await (await db()).getAll('translations')).filter((record) => record.documentId === documentId)
}

export async function cacheDictionary(key: string, value?: unknown) {
  const database = await db()
  if (value !== undefined) await database.put('dictionaryCache', { value, at: Date.now() }, key)
  return (await database.get('dictionaryCache', key))?.value
}

export async function savePreferences(preferences: ReaderPreferences) {
  await (await db()).put('preferences', preferences, 'reader')
}

export async function loadPreferences(): Promise<ReaderPreferences | undefined> {
  return (await db()).get('preferences', 'reader')
}
