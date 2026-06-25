// Offline queue with safe sync.
// Contract:
//  - Every change is persisted to IndexedDB synchronously before any network attempt.
//  - Queue entries are removed ONLY after the server confirms the write.
//  - On any failure, entry stays with incremented attempts + lastError; will retry.
//  - Snapshots of items/extras are kept in IDB so the inventory survives reloads
//    offline. Snapshots are written only on successful server reads; never wiped
//    by sync.
//  - syncAll() validates that pending count is 0 after a run before reporting OK.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  STORES,
  idbBulkPut,
  idbCount,
  idbDelete,
  idbGetAll,
  idbGetByIndex,
  idbPut,
} from "./offline-db";

export type Status = "pendente" | "conferido" | "faltando";

export interface PendingStatus {
  id: string; // inventory_item id (PK)
  status: Status;
  conferido_em: string | null;
  queued_at: number;
  attempts: number;
  lastError?: string | null;
}

export interface PendingObs {
  id: string; // inventory_item id
  observacoes: string;
  queued_at: number;
  attempts: number;
  lastError?: string | null;
}

export interface PendingExtra {
  local_id: string; // local uuid until server-confirmed
  inventory_id: string;
  endereco: string | null;
  cliente: string | null;
  nota_fiscal: string | null;
  observacoes: string;
  queued_at: number;
  attempts: number;
  lastError?: string | null;
}

export interface PendingExtraDelete {
  id: string; // server id
  queued_at: number;
  attempts: number;
  lastError?: string | null;
}

// ---------- enqueue ----------

export async function enqueueStatusUpdate(item_id: string, status: Status) {
  const entry: PendingStatus = {
    id: item_id,
    status,
    conferido_em: status !== "pendente" ? new Date().toISOString() : null,
    queued_at: Date.now(),
    attempts: 0,
    lastError: null,
  };
  await idbPut(STORES.PENDING_STATUS, entry);
  // Also patch the local snapshot so UI is consistent after reload.
  const snap = await (await import("./offline-db")).idbGet<any>(STORES.ITEMS_SNAPSHOT, item_id);
  if (snap) {
    snap.status = status;
    snap.conferido_em = entry.conferido_em;
    await idbPut(STORES.ITEMS_SNAPSHOT, snap);
  }
  notifyChange();
}

export async function enqueueObsUpdate(item_id: string, observacoes: string) {
  const entry: PendingObs = {
    id: item_id,
    observacoes,
    queued_at: Date.now(),
    attempts: 0,
    lastError: null,
  };
  await idbPut(STORES.PENDING_OBS, entry);
  const snap = await (await import("./offline-db")).idbGet<any>(STORES.ITEMS_SNAPSHOT, item_id);
  if (snap) {
    snap.observacoes = observacoes;
    await idbPut(STORES.ITEMS_SNAPSHOT, snap);
  }
  notifyChange();
}

export async function enqueueExtraInsert(extra: Omit<PendingExtra, "queued_at" | "attempts" | "lastError">) {
  const entry: PendingExtra = { ...extra, queued_at: Date.now(), attempts: 0, lastError: null };
  await idbPut(STORES.PENDING_EXTRAS, entry);
  // Show it locally in the snapshot so the UI sees it offline.
  await idbPut(STORES.EXTRAS_SNAPSHOT, {
    id: entry.local_id,
    inventory_id: entry.inventory_id,
    endereco: entry.endereco,
    cliente: entry.cliente,
    nota_fiscal: entry.nota_fiscal,
    observacoes: entry.observacoes,
    created_at: new Date(entry.queued_at).toISOString(),
    _pending: true,
  });
  notifyChange();
}

export async function enqueueExtraDelete(id: string) {
  await idbPut(STORES.PENDING_EXTRA_DELETES, { id, queued_at: Date.now(), attempts: 0, lastError: null });
  // Optimistically remove from snapshot.
  await idbDelete(STORES.EXTRAS_SNAPSHOT, id);
  notifyChange();
}

// ---------- snapshots ----------

export async function writeItemsSnapshot(items: any[]) {
  await idbBulkPut(STORES.ITEMS_SNAPSHOT, items);
}
export async function writeExtrasSnapshot(extras: any[]) {
  await idbBulkPut(STORES.EXTRAS_SNAPSHOT, extras);
}
export async function writeInventorySnapshot(inv: any) {
  await idbPut(STORES.INV_SNAPSHOT, inv);
}

export async function readItemsSnapshot(inventoryId: string): Promise<any[]> {
  return idbGetByIndex<any>(STORES.ITEMS_SNAPSHOT, "inventory_id", inventoryId);
}
export async function readExtrasSnapshot(inventoryId: string): Promise<any[]> {
  return idbGetByIndex<any>(STORES.EXTRAS_SNAPSHOT, "inventory_id", inventoryId);
}
export async function readInventorySnapshot(id: string) {
  const { idbGet } = await import("./offline-db");
  return idbGet<any>(STORES.INV_SNAPSHOT, id);
}

// Merge pending updates into items so the UI reflects local changes even when
// the snapshot was written before the change.
export async function applyPendingToItems(items: any[]): Promise<any[]> {
  const [status, obs] = await Promise.all([
    idbGetAll<PendingStatus>(STORES.PENDING_STATUS),
    idbGetAll<PendingObs>(STORES.PENDING_OBS),
  ]);
  const sMap = new Map(status.map((s) => [s.id, s]));
  const oMap = new Map(obs.map((o) => [o.id, o]));
  return items.map((it) => {
    const s = sMap.get(it.id);
    const o = oMap.get(it.id);
    return {
      ...it,
      ...(s ? { status: s.status, conferido_em: s.conferido_em } : {}),
      ...(o ? { observacoes: o.observacoes } : {}),
    };
  });
}

// ---------- queue introspection ----------

export interface QueueCounts {
  status: number;
  obs: number;
  extras: number;
  extraDeletes: number;
  total: number;
}

export async function getQueueCounts(): Promise<QueueCounts> {
  const [status, obs, extras, extraDeletes] = await Promise.all([
    idbCount(STORES.PENDING_STATUS),
    idbCount(STORES.PENDING_OBS),
    idbCount(STORES.PENDING_EXTRAS),
    idbCount(STORES.PENDING_EXTRA_DELETES),
  ]);
  const total = status + obs + extras + extraDeletes;
  return { status, obs, extras, extraDeletes, total };
}

// ---------- sync ----------

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  initialCount: number;
  finalCount: number;
  sent: number;
  ok: number;
  failed: number;
  errors: Array<{ kind: string; id: string; message: string }>;
  verified: boolean; // finalCount === 0
}

let _syncing = false;
let _changeListeners = new Set<() => void>();
function notifyChange() {
  for (const fn of _changeListeners) fn();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  }
}

export async function syncAll(): Promise<SyncReport> {
  const startedAt = new Date().toISOString();
  const errors: SyncReport["errors"] = [];
  let sent = 0, ok = 0, failed = 0;

  if (_syncing) {
    return {
      startedAt, finishedAt: new Date().toISOString(),
      initialCount: 0, finalCount: 0, sent: 0, ok: 0, failed: 0, errors: [], verified: false,
    };
  }
  _syncing = true;
  try {
    const initial = await getQueueCounts();
    console.info("[offline-sync] start", initial);

    // 1) Status updates
    const statuses = await idbGetAll<PendingStatus>(STORES.PENDING_STATUS);
    for (const s of statuses) {
      sent++;
      const { error } = await supabase
        .from("inventory_items")
        .update({ status: s.status, conferido_em: s.conferido_em })
        .eq("id", s.id);
      if (error) {
        failed++;
        s.attempts += 1; s.lastError = error.message;
        await idbPut(STORES.PENDING_STATUS, s);
        errors.push({ kind: "status", id: s.id, message: error.message });
        console.warn("[offline-sync] status failed", s.id, error.message);
      } else {
        await idbDelete(STORES.PENDING_STATUS, s.id);
        ok++;
      }
    }

    // 2) Observation updates
    const obses = await idbGetAll<PendingObs>(STORES.PENDING_OBS);
    for (const o of obses) {
      sent++;
      const { error } = await supabase
        .from("inventory_items")
        .update({ observacoes: o.observacoes })
        .eq("id", o.id);
      if (error) {
        failed++;
        o.attempts += 1; o.lastError = error.message;
        await idbPut(STORES.PENDING_OBS, o);
        errors.push({ kind: "obs", id: o.id, message: error.message });
        console.warn("[offline-sync] obs failed", o.id, error.message);
      } else {
        await idbDelete(STORES.PENDING_OBS, o.id);
        ok++;
      }
    }

    // 3) Extra inserts
    const extras = await idbGetAll<PendingExtra>(STORES.PENDING_EXTRAS);
    for (const e of extras) {
      sent++;
      const { data, error } = await supabase
        .from("extra_items")
        .insert({
          inventory_id: e.inventory_id,
          endereco: e.endereco,
          cliente: e.cliente,
          nota_fiscal: e.nota_fiscal,
          observacoes: e.observacoes,
        })
        .select()
        .single();
      if (error || !data) {
        failed++;
        e.attempts += 1; e.lastError = error?.message ?? "no data";
        await idbPut(STORES.PENDING_EXTRAS, e);
        errors.push({ kind: "extra_insert", id: e.local_id, message: e.lastError ?? "" });
        console.warn("[offline-sync] extra insert failed", e.local_id, e.lastError);
      } else {
        // Replace local-only snapshot row with server row.
        await idbDelete(STORES.EXTRAS_SNAPSHOT, e.local_id);
        await idbPut(STORES.EXTRAS_SNAPSHOT, data);
        await idbDelete(STORES.PENDING_EXTRAS, e.local_id);
        ok++;
      }
    }

    // 4) Extra deletes
    const dels = await idbGetAll<PendingExtraDelete>(STORES.PENDING_EXTRA_DELETES);
    for (const d of dels) {
      sent++;
      const { error } = await supabase.from("extra_items").delete().eq("id", d.id);
      if (error) {
        failed++;
        d.attempts += 1; d.lastError = error.message;
        await idbPut(STORES.PENDING_EXTRA_DELETES, d);
        errors.push({ kind: "extra_delete", id: d.id, message: error.message });
      } else {
        await idbDelete(STORES.PENDING_EXTRA_DELETES, d.id);
        ok++;
      }
    }

    const final = await getQueueCounts();
    const report: SyncReport = {
      startedAt,
      finishedAt: new Date().toISOString(),
      initialCount: initial.total,
      finalCount: final.total,
      sent, ok, failed, errors,
      verified: final.total === 0 && failed === 0,
    };
    console.info("[offline-sync] done", report);
    notifyChange();
    return report;
  } finally {
    _syncing = false;
  }
}

// Backwards-compatible name used by other files.
export const syncQueue = syncAll;

// ---------- hook ----------

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const c = await getQueueCounts().catch(() => ({ total: 0 } as QueueCounts));
      if (mounted) setPending(c.total);
    };
    refresh();
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    const onChange = () => refresh();
    _changeListeners.add(onChange);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    window.addEventListener("offline-queue-changed", onChange);
    const interval = window.setInterval(refresh, 5000);
    return () => {
      mounted = false;
      _changeListeners.delete(onChange);
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
      window.removeEventListener("offline-queue-changed", onChange);
      window.clearInterval(interval);
    };
  }, []);

  return { online, pending };
}

// Auto-retry loop: when navigator is online and there is pending work, retry
// at most every 15s. Idempotent — multiple callers are safe.
if (typeof window !== "undefined") {
  let lastRun = 0;
  const tick = async () => {
    if (!navigator.onLine) return;
    if (Date.now() - lastRun < 15000) return;
    const c = await getQueueCounts().catch(() => null);
    if (!c || c.total === 0) return;
    lastRun = Date.now();
    syncAll().catch((e) => console.warn("[offline-sync] tick error", e));
  };
  window.addEventListener("online", tick);
  window.setInterval(tick, 20000);
}

// Re-export queue size for callers that used the old API.
export async function queueSize(): Promise<number> {
  const c = await getQueueCounts();
  return c.total;
}
