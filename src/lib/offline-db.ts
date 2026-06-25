// Offline-first storage layer backed by IndexedDB.
// Goals:
//  - Nothing is kept only in memory: every read/write is persisted to IDB.
//  - Local data is NEVER deleted before the server confirms it received it.
//  - Failed sync attempts keep the data and retry automatically.
//  - Survives page reload, browser close and device restart.

const DB_NAME = "wms_offline_v1";
const DB_VERSION = 1;

// Object stores
export const STORES = {
  PENDING_STATUS: "pending_status", // queued status updates {id: item_id, ...}
  PENDING_OBS: "pending_obs",       // queued observation updates
  PENDING_EXTRAS: "pending_extras", // queued extra_items inserts (with local uuid)
  PENDING_EXTRA_DELETES: "pending_extra_deletes",
  ITEMS_SNAPSHOT: "items_snapshot", // last known inventory_items (key: id)
  EXTRAS_SNAPSHOT: "extras_snapshot", // extras (key: id)
  INV_SNAPSHOT: "inv_snapshot",     // inventory metadata (key: id)
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const ensure = (name: string, opts: IDBObjectStoreParameters & { indexes?: Array<{ name: string; keyPath: string }> } = { keyPath: "id" }) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: opts.keyPath ?? "id" });
          if (opts.indexes) for (const ix of opts.indexes) store.createIndex(ix.name, ix.keyPath);
        }
      };
      ensure(STORES.PENDING_STATUS, { keyPath: "id" });
      ensure(STORES.PENDING_OBS, { keyPath: "id" });
      ensure(STORES.PENDING_EXTRAS, { keyPath: "local_id", indexes: [{ name: "inventory_id", keyPath: "inventory_id" }] });
      ensure(STORES.PENDING_EXTRA_DELETES, { keyPath: "id" });
      ensure(STORES.ITEMS_SNAPSHOT, { keyPath: "id", indexes: [{ name: "inventory_id", keyPath: "inventory_id" }] });
      ensure(STORES.EXTRAS_SNAPSHOT, { keyPath: "id", indexes: [{ name: "inventory_id", keyPath: "inventory_id" }] });
      ensure(STORES.INV_SNAPSHOT, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx<T>(stores: StoreName | StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores as string | string[], mode);
    let result: T;
    Promise.resolve(fn(t)).then((r) => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("tx aborted"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(store: StoreName, value: unknown) {
  return tx(store, "readwrite", (t) => reqToPromise(t.objectStore(store).put(value as any)));
}

export async function idbBulkPut(store: StoreName, values: unknown[]) {
  if (values.length === 0) return;
  return tx(store, "readwrite", async (t) => {
    const s = t.objectStore(store);
    for (const v of values) s.put(v as any);
  });
}

export async function idbDelete(store: StoreName, key: IDBValidKey) {
  return tx(store, "readwrite", (t) => reqToPromise(t.objectStore(store).delete(key)));
}

export async function idbGet<T = unknown>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return tx(store, "readonly", (t) => reqToPromise(t.objectStore(store).get(key)) as Promise<T | undefined>);
}

export async function idbGetAll<T = unknown>(store: StoreName): Promise<T[]> {
  return tx(store, "readonly", (t) => reqToPromise(t.objectStore(store).getAll()) as Promise<T[]>);
}

export async function idbGetByIndex<T = unknown>(store: StoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
  return tx(store, "readonly", (t) => {
    const ix = t.objectStore(store).index(indexName);
    return reqToPromise(ix.getAll(value)) as Promise<T[]>;
  });
}

export async function idbCount(store: StoreName): Promise<number> {
  return tx(store, "readonly", (t) => reqToPromise(t.objectStore(store).count()));
}
