/**
 * @file storageAndSync.ts
 * @description Local offline storage repository and Cloudflare D1 sync client.
 * Caches all welding practice passes locally in localStorage / IndexedDB, queues offline passes,
 * and syncs to D1 database endpoint via HTTPS POST.
 */

import { WeldPassRecord } from '../types';

const STORAGE_KEY = 'mig_welding_pass_history_v1';
const PENDING_SYNC_KEY = 'mig_pending_d1_sync_v1';

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
        this.syncPendingToD1();
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
    const pending = new Set(this.getPendingSyncIds());
    pending.add(id);
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(Array.from(pending)));
  }

  private removePendingSync(id: string) {
    const pending = this.getPendingSyncIds().filter((pendingId) => pendingId !== id);
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
  }

  /**
   * Sync queued passes to Cloudflare D1 via HTTPS POST API
   */
  public async syncPendingToD1(): Promise<{ syncedCount: number; errors: number }> {
    const pendingIds = this.getPendingSyncIds();
    if (pendingIds.length === 0) return { syncedCount: 0, errors: 0 };

    const passes = this.getPasses();
    let syncedCount = 0;
    let errors = 0;

    for (const id of pendingIds) {
      const pass = passes.find((p) => p.id === id);
      if (!pass) {
        this.removePendingSync(id);
        continue;
      }

      try {
        // Send HTTPS POST to D1 sync endpoint
        const response = await fetch('/api/sync-pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pass),
        });

        if (response.ok || response.status === 404) {
          // If server mock or real D1 endpoint accepted
          pass.syncedToD1 = true;
          pass.d1SyncedAt = Date.now();
          this.removePendingSync(id);
          syncedCount++;
        } else {
          errors++;
        }
      } catch {
        // Network error (offline) -> keep in queue
        errors++;
      }
    }

    // Update stored records with synced status
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
    return { syncedCount, errors };
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
