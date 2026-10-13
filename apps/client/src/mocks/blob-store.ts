/**
 * Arşiv dosya içerikleri (data URL). localStorage kotasına takılmamak için IndexedDB'de
 * (`idb-keyval`) tutulur; IndexedDB olmayan ortamlarda (jsdom/testler) bellek içi Map kullanılır.
 */
import { clear, createStore, del, get, set, type UseStore } from "idb-keyval"

interface BlobStore {
  get(id: string): Promise<string | undefined>
  set(id: string, dataUrl: string): Promise<void>
  del(id: string): Promise<void>
  clear(): Promise<void>
}

function createIdbStore(): BlobStore {
  let store: UseStore | undefined
  const s = () => (store ??= createStore("prime-ofis-arsiv", "dosya"))
  return {
    get: (id) => get<string>(id, s()),
    set: (id, dataUrl) => set(id, dataUrl, s()),
    del: (id) => del(id, s()),
    clear: () => clear(s()),
  }
}

function createMemoryStore(): BlobStore {
  const map = new Map<string, string>()
  return {
    get: async (id) => map.get(id),
    set: async (id, dataUrl) => void map.set(id, dataUrl),
    del: async (id) => void map.delete(id),
    clear: async () => map.clear(),
  }
}

const store: BlobStore =
  typeof indexedDB === "undefined" ? createMemoryStore() : createIdbStore()

export const getBlob = (id: string) => store.get(id)
export const putBlob = (id: string, dataUrl: string) => store.set(id, dataUrl)
export const delBlob = (id: string) => store.del(id)
export const clearBlobs = () => store.clear()
