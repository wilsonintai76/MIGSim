import React from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Download,
  Flame,
  RotateCcw,
  Wrench,
  X,
} from 'lucide-react';
import { R3FBeadVisualizer } from './report/R3FBeadVisualizer';
import { WeldPassRecord } from '../types';
import { AttributionCard } from './report/AttributionCard';
import { SubScoresGrid } from './report/SubScoresGrid';
import { DefectsList } from './report/DefectsList';

interface FeedbackReportModalProps {
  passRecord: WeldPassRecord | null;
  onClose: () => void;
  onRetry: () => void;
  onExportJSON: () => void;
}

export const FeedbackReportModal: React.FC<FeedbackReportModalProps> = ({
  passRecord,
  onClose,
  onRetry,
  onExportJSON,
}) => {
  if (!passRecord) return null;

  const { result, parameters, durationSeconds, sampleCount } = passRecord;
  const { overallScore, subScores, attribution, defects } = result;

  const getAttributionBadge = () => {
    switch (attribution.primaryIssue) {
      case 'parameter':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-950/80 border border-orange-600 text-orange-300 text-xs font-bold uppercase tracking-wider">
            <Wrench className="w-3.5 h-3.5" /> Parameter Setting Issue
          </div>
        );
      case 'technique':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-950/80 border border-purple-600 text-purple-300 text-xs font-bold uppercase tracking-wider">
            <Flame className="w-3.5 h-3.5" /> Hand Technique Issue
          </div>
        );
      case 'both':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-950/80 border border-red-600 text-red-300 text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" /> Combined Parameter + Technique Issue
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" /> Optimal Quality Pass
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-7 shadow-2xl text-slate-100 flex flex-col gap-6 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header with Title & Overall Score */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">Weld Pass Evaluation Report</h2>
                {getAttributionBadge()}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Pass recorded: {new Date(passRecord.timestamp).toLocaleTimeString()} &bull; Duration: {durationSeconds.toFixed(1)}s &bull; {sampleCount} telemetry samples
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Big Score Card & Attribution Summary Banner */}
        <AttributionCard overallScore={overallScore} attribution={attribution} />

        {/* 3D Interactive Bead Visualizer */}
        <R3FBeadVisualizer result={result} parameters={parameters} />

        {/* 4 Detailed Sub-Scores */}
        <SubScoresGrid subScores={subScores} />

        {/* Defects & Corrective Coaching Section */}
        <DefectsList defects={defects} recommendations={attribution.recommendations} />

        {/* Footer Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={onExportJSON}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export Pass Data (JSON)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Close
            </button>
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Practice Next Pass
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
