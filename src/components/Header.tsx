import React from 'react';
import {
  Cpu,
  Flame,
  GraduationCap,
  History,
  Laptop,
  Smartphone,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { AppRole, BLESensorState } from '../types';

interface HeaderProps {
  bleState: BLESensorState;
  onOpenHardwareGuide: () => void;
  onOpenHistory: () => void;
  passCount: number;
  activeRole: AppRole;
  onSelectRole: (role: AppRole) => void;
}

export const Header: React.FC<HeaderProps> = ({
  bleState,
  onOpenHardwareGuide,
  onOpenHistory,
  passCount,
  activeRole,
  onSelectRole,
}) => {
  return (
    <header className="w-full bg-slate-900/95 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md px-3 py-2.5 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Logo & Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
            <Flame className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                MIGSim <span className="text-xs px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-700 text-cyan-300 font-mono font-normal">GMAW PWA</span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 hidden lg:block">
              Dual-System Training: Mobile Torch UI + Instructor Web Supervision
            </p>
          </div>
        </div>

        {/* Center: Prominent Two-Distinct View Switcher (Trainer Mobile UI vs Instructor Web UI) */}
        <div className="order-3 sm:order-2 w-full sm:w-auto flex justify-center">
          <div className="inline-flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-inner">
            {/* Trainer Role Tab (Mobile UI) */}
            <button
              onClick={() => onSelectRole('trainer')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeRole === 'trainer'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Switch to Welder Trainer View (optimized for mobile smartphone on torch)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Trainer (Mobile UI)</span>
            </button>

            {/* Instructor Role Tab (Web UI) */}
            <button
              onClick={() => onSelectRole('instructor')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeRole === 'instructor'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Switch to Instructor Supervision View (Web Dashboard)"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Instructor (Web UI)</span>
            </button>
          </div>
        </div>

        {/* Right: Actions & Tools */}
        <div className="order-2 sm:order-3 flex items-center gap-2">
          {/* Hardware & BLE Guide */}
          <button
            id="btn-hardware-guide"
            onClick={onOpenHardwareGuide}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition shadow-sm"
            title="ESP32-C3 Firmware, GATT UUIDs & Marker Print Sheet"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Hardware & BLE</span>
            <span className="md:hidden">BLE</span>
          </button>

          {/* Practice History */}
          <button
            id="btn-history"
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition shadow-sm"
            title="View Weld Passes History"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">History ({passCount})</span>
            <span className="md:hidden">{passCount}</span>
          </button>

          {/* PWA Install Button */}
          <PWAInstallButton />
        </div>
      </div>
    </header>
  );
};
