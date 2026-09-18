import React, { useState } from 'react';
import {
  Award,
  CloudCheck,
  Download,
  FileSpreadsheet,
  History,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { storageService } from '../services/storageAndSync';
import { WeldPassRecord } from '../types';

interface PassHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  passes: WeldPassRecord[];
  onSelectPass: (pass: WeldPassRecord) => void;
  onRefresh: () => void;
}

export const PassHistoryModal: React.FC<PassHistoryModalProps> = ({
  isOpen,
  onClose,
  passes,
  onSelectPass,
  onRefresh,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    const res = await storageService.syncPendingToD1();
    setIsSyncing(false);
    setSyncMessage(
      res.errors === 0
        ? `Synced ${res.syncedCount} passes to Cloudflare D1.`
        : `Synced ${res.syncedCount} passes (${res.errors} offline queued).`
    );
    onRefresh();
    setTimeout(() => setSyncMessage(null), 4000);
  };

  const handleClearAll = () => {
    if (confirm('Clear all local practice passes?')) {
      storageService.clearAll();
      onRefresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-7 shadow-2xl text-slate-100 flex flex-col gap-5 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700 flex items-center justify-center text-cyan-400">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Student Practice Pass History</h2>
              <p className="text-xs text-slate-400">Offline cached records & Cloudflare D1 synchronized logs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync to D1'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-800 text-xs text-cyan-200 flex items-center gap-2">
            <span>&bull;</span> {syncMessage}
          </div>
        )}

        {/* Action bar: Export CSV / JSON & Clear */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => storageService.exportCSV()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => storageService.exportJSON()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export JSON</span>
            </button>
          </div>

          {passes.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-950/60 hover:text-red-300 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {/* Passes Table / Card list */}
        {passes.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-2xl border border-slate-800">
            No weld passes recorded yet. Complete a practice pass to see detailed analytics!
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {passes.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onSelectPass(p);
                  onClose();
                }}
                className="p-4 rounded-2xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/50 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-mono font-bold text-sm border ${
                      p.result.overallScore >= 80
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : p.result.overallScore >= 65
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                        : 'bg-amber-950/80 border-amber-500 text-amber-300'
                    }`}
                  >
                    <span>{p.result.overallScore}</span>
                    <span className="text-[9px] uppercase font-sans font-normal text-slate-400">Score</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {p.parameters.material.replace('_', ' ').toUpperCase()} ({p.parameters.materialThickness_mm}mm)
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          p.result.attribution.primaryIssue === 'parameter'
                            ? 'bg-orange-950 text-orange-300'
                            : p.result.attribution.primaryIssue === 'technique'
                            ? 'bg-purple-950 text-purple-300'
                            : p.result.attribution.primaryIssue === 'both'
                            ? 'bg-red-950 text-red-300'
                            : 'bg-emerald-950 text-emerald-300'
                        }`}
                      >
                        {p.result.attribution.primaryIssue === 'none' ? 'Optimal' : `${p.result.attribution.primaryIssue} issue`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(p.timestamp).toLocaleString()} &bull; {p.parameters.voltage_V}V / {p.parameters.current_A}A &bull; {p.result.defects.length} defect(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-400">
                    W: {p.result.meanBeadWidth_mm}mm | P: {p.result.meanPenetration_mm}mm
                  </span>
                  <button className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold">
                    View Report &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
