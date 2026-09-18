import React from 'react';
import { RootCauseAttribution } from '../../types';

interface AttributionCardProps {
  overallScore: number;
  attribution: RootCauseAttribution;
}

export const AttributionCard: React.FC<AttributionCardProps> = React.memo(
  ({ overallScore, attribution }) => {
    const getScoreColor = (score: number) => {
      if (score >= 85) return 'text-emerald-400 border-emerald-500 bg-emerald-950/40';
      if (score >= 70) return 'text-cyan-400 border-cyan-500 bg-cyan-950/40';
      if (score >= 55) return 'text-amber-400 border-amber-500 bg-amber-950/40';
      return 'text-red-400 border-red-500 bg-red-950/40';
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Main Score Radial / Badge */}
        <div
          className={`rounded-2xl border p-5 flex flex-col items-center justify-center text-center shadow-lg ${getScoreColor(
            overallScore
          )}`}
        >
          <span className="text-xs uppercase font-bold tracking-widest text-slate-400 mb-1">
            Overall Bead Score
          </span>
          <div className="text-5xl font-black font-mono my-1">{overallScore}</div>
          <span className="text-xs font-semibold text-slate-300">
            {overallScore >= 85
              ? 'AWS D1.1 Code Acceptable'
              : overallScore >= 70
              ? 'Satisfactory / Minor Tuning'
              : 'Defective / Requires Rework'}
          </span>
        </div>

        {/* Attribution Comparison: Parameters vs Hand Technique */}
        <div className="md:col-span-2 rounded-2xl bg-slate-950/70 border border-slate-800 p-5 flex flex-col justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Root Cause Attribution Breakdown
            </span>
            <p className="text-sm font-medium text-slate-200 mt-1">
              {attribution.summary}
            </p>
          </div>

          {/* Score Comparison Bars */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-orange-300 font-medium">Machine Parameters</span>
                <span className="font-mono font-bold text-orange-400">
                  {attribution.parameterScore}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${attribution.parameterScore}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-purple-300 font-medium">Torch Technique</span>
                <span className="font-mono font-bold text-purple-400">
                  {attribution.techniqueScore}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full"
                  style={{ width: `${attribution.techniqueScore}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

AttributionCard.displayName = 'AttributionCard';
