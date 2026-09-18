import React from 'react';
import { BeadQualitySubScores } from '../../types';

interface SubScoresGridProps {
  subScores: BeadQualitySubScores;
}

export const SubScoresGrid: React.FC<SubScoresGridProps> = React.memo(
  ({ subScores }) => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col">
          <span className="text-[11px] text-slate-400 font-medium">Speed Consistency</span>
          <span className="text-xl font-bold font-mono text-cyan-400 my-1">
            {subScores.speedConsistency}%
          </span>
          <span className="text-[10px] text-slate-500">Travel pace smoothness</span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col">
          <span className="text-[11px] text-slate-400 font-medium">Angle Technique</span>
          <span className="text-xl font-bold font-mono text-amber-400 my-1">
            {subScores.angleTechnique}%
          </span>
          <span className="text-[10px] text-slate-500">Push angle & work alignment</span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col">
          <span className="text-[11px] text-slate-400 font-medium">CTWD Control</span>
          <span className="text-xl font-bold font-mono text-emerald-400 my-1">
            {subScores.ctwdControl}%
          </span>
          <span className="text-[10px] text-slate-500">Standoff distance holding</span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col">
          <span className="text-[11px] text-slate-400 font-medium">Parameter Tuning</span>
          <span className="text-xl font-bold font-mono text-orange-400 my-1">
            {subScores.parameterBalance}%
          </span>
          <span className="text-[10px] text-slate-500">Voltage & WFS synchronization</span>
        </div>
      </div>
    );
  }
);

SubScoresGrid.displayName = 'SubScoresGrid';
