/**
 * @file storageAndSync.ts
 * @description Local offline storage repository and Cloudflare D1 sync client.
 * Caches all welding practice passes locally in localStorage, queues offline passes,
 * and syncs them to the Worker API in batches (`POST /api/passes`).
 */

import type { PassSyncResult, SyncPassesResponse } from '../../shared/api';
import { WeldPassRecord } from '../types';
import { api } from './api';

const STORAGE_KEY = 'mig_welding_pass_history_v1';
const PENDING_SYNC_KEY = 'mig_pending_d1_sync_v1';

/** Passes are batched so a queued session costs a handful of requests, not one per pass. */
const SYNC_BATCH_SIZE = 10;

/** Rejections caused by the request itself: retrying will not help. */
const PERMANENT_STATUSES = [400, 409, 413, 422];

type BatchOutcome =
  | { kind: 'ok'; syncedAt: number; results: PassSyncResult[] }
  | { kind: 'auth' }
  | { kind: 'permanent' }
  | { kind: 'transient' };

/**
 * The JSON body `POST /api/passes` expects, lifted from the RPC client so it can never
 * drift from the server schema.
 */
type SyncPassesJson = NonNullable<Parameters<typeof api.passes.$post>[0]>['json'];

export interface SyncSummary {
  syncedCount: number;
  errors: number;
  /** Passes the server refused permanently; they were dropped from the queue. */
  rejected: number;
  /** True when the queue was left intact because the session is missing or expired. */
  pendingAuth: boolean;
}

export class StorageAndSyncService {
  /**
   * Get all saved weld passes from local storage
   */
  public getPasses(): WeldPassRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to load weld passes from storage:', err);
      return [];
    }
  }

  /**
   * Save a newly recorded weld pass
   */
  public savePass(record: WeldPassRecord): void {
    try {
      const passes = this.getPasses();
      const updated = [record, ...passes];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // Add to pending sync queue
      this.enqueuePendingSync(record.id);

      // Attempt immediate sync if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void this.syncPendingToD1().catch((err) =>
          console.error('Background pass sync failed:', err),
        );
      }
    } catch (err) {
      console.error('Failed to save weld pass:', err);
    }
  }

  /**
   * Delete a pass
   */
  public deletePass(id: string): void {
    try {
      const passes = this.getPasses().filter((p) => p.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
      // A deleted record must not stay queued for sync.
      this.setPendingSyncIds(this.getPendingSyncIds().filter((pendingId) => pendingId !== id));
    } catch (err) {
      console.error('Failed to delete pass:', err);
    }
  }

  /**
   * Clear all records
   */
  public clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PENDING_SYNC_KEY);
  }

  private getPendingSyncIds(): string[] {
    try {
      const data = localStorage.getItem(PENDING_SYNC_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private enqueuePendingSync(id: string) {
    this.setPendingSyncIds([...new Set([...this.getPendingSyncIds(), id])]);
  }

  private setPendingSyncIds(ids: string[]) {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(ids));
  }

  /** A pass the server has accepted locally and in D1. */
  private markSynced(pass: WeldPassRecord, syncedAt: number) {
    pass.syncedToD1 = true;
    pass.d1SyncedAt = syncedAt;
  }

  /**
   * Sync queued passes to Cloudflare D1 in batches via `POST /api/passes`.
   *
   * A pass leaves the queue only when the server accepted it, or refused it
   * permanently (see `PERMANENT_STATUSES`). Anything else — offline, a 5xx, or a
   * missing/expired session — leaves the queue untouched so no measurement is lost.
   */
  public async syncPendingToD1(): Promise<SyncSummary> {
    const passes = this.getPasses();
    const byId = new Map(passes.map((pass) => [pass.id, pass]));

    // Records deleted locally are dropped from the queue rather than retried forever.
    const stillPending = new Set(this.getPendingSyncIds().filter((id) => byId.has(id)));
    const summary: SyncSummary = {
      syncedCount: 0,
      errors: 0,
      rejected: 0,
      pendingAuth: false,
    };

    const settle = (id: string) => stillPending.delete(id);
    const queue = [...stillPending];

    outer: for (let offset = 0; offset < queue.length; offset += SYNC_BATCH_SIZE) {
      const batch = queue
        .slice(offset, offset + SYNC_BATCH_SIZE)
        .map((id) => byId.get(id)!);

      const outcome = await this.postPassBatch(batch);

      if (outcome.kind === 'auth') {
        summary.pendingAuth = true;
        break;
      }

      if (outcome.kind === 'transient') {
        // Offline or server-side failure: keep every pass in this batch queued.
        summary.errors += batch.length;
        continue;
      }

      if (outcome.kind === 'permanent') {
        // The batch as a whole was refused, so one bad record must not cost us the
        // other nine: retry them individually to find the offender.
        for (const pass of batch) {
          const single = await this.postPassBatch([pass]);

          if (single.kind === 'auth') {
            summary.pendingAuth = true;
            break outer;
          }
          if (single.kind === 'ok' && single.results[0]?.status !== 'rejected') {
            this.markSynced(pass, single.syncedAt);
            settle(pass.id);
            summary.syncedCount++;
            continue;
          }
          if (single.kind === 'ok' || single.kind === 'permanent') {
            console.warn('Pass refused by the server:', pass.id);
            settle(pass.id);
            summary.rejected++;
            continue;
          }
          summary.errors++;
        }
        continue;
      }

      const results = new Map(outcome.results.map((result) => [result.id, result]));
      for (const pass of batch) {
        const result = results.get(pass.id);

        if (result?.status === 'rejected') {
          console.warn('Pass refused by the server:', pass.id, result.error);
          settle(pass.id);
          summary.rejected++;
        } else if (result) {
          this.markSynced(pass, outcome.syncedAt);
          settle(pass.id);
          summary.syncedCount++;
        } else {
          // The server did not mention this pass; assume it was not stored.
          summary.errors++;
        }
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
    this.setPendingSyncIds([...stillPending]);
    return summary;
  }

  private async postPassBatch(passes: WeldPassRecord[]): Promise<BatchOutcome> {
    /*
     * The Worker validates pass records with a `looseObject` schema so fields a newer
     * simulator adds survive the round trip. Zod's input type for such a schema carries a
     * `[key: string]: unknown` index signature that our domain interfaces deliberately do
     * not declare, so the queue is relaxed here, at the wire boundary, rather than widening
     * `WeldPassRecord` and losing excess-property checking across the whole app.
     */
    const json: SyncPassesJson = { passes: passes as unknown as SyncPassesJson['passes'] };

    try {
      const response = await api.passes.$post({ json });

      if (response.status === 401 || response.status === 403) return { kind: 'auth' };

      if (!response.ok) {
        // 404/405 mean the API is not deployed here, which is not the client's fault
        // — treat it as transient so a static-only deploy cannot drain the queue.
        return PERMANENT_STATUSES.includes(response.status)
          ? { kind: 'permanent' }
          : { kind: 'transient' };
      }

      const payload = (await response.json()) as SyncPassesResponse | null;
      if (!payload || !Array.isArray(payload.results)) {
        console.error('Pass sync returned an unexpected response body');
        return { kind: 'transient' };
      }

      return {
        kind: 'ok',
        syncedAt: payload.syncedAt ?? Date.now(),
        results: payload.results,
      };
    } catch {
      // Offline, DNS failure or an aborted request.
      return { kind: 'transient' };
    }
  }

  /**
   * Export all passes as downloadable JSON
   */
  public exportJSON(): void {
    const passes = this.getPasses();
    const blob = new Blob([JSON.stringify(passes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GMAW_Welding_Passes_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export summary as CSV
   */
  public exportCSV(): void {
    const passes = this.getPasses();
    if (passes.length === 0) return;

    const headers = [
      'Timestamp',
      'Student',
      'Overall Score',
      'Parameter Score',
      'Technique Score',
      'Primary Issue',
      'Material',
      'Thickness (mm)',
      'Current (A)',
      'Voltage (V)',
      'WFS (m/min)',
      'CTWD (mm)',
      'Heat Input (kJ/mm)',
      'Bead Width (mm)',
      'Penetration (mm)',
      'Defects Count',
    ];

    const rows = passes.map((p) => [
      new Date(p.timestamp).toISOString(),
      `"${p.studentName}"`,
      p.result.overallScore,
      p.result.attribution.parameterScore,
      p.result.attribution.techniqueScore,
      p.result.attribution.primaryIssue,
      p.parameters.material,
      p.parameters.materialThickness_mm,
      p.parameters.current_A,
      p.parameters.voltage_V,
      p.parameters.wireFeedSpeed_m_min,
      p.parameters.stickout_mm,
      p.result.heatInput_kJ_per_mm,
      p.result.meanBeadWidth_mm,
      p.result.meanPenetration_mm,
      p.result.defects.length,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GMAW_Training_Log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const storageService = new StorageAndSyncService();
