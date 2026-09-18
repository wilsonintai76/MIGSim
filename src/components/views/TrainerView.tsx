import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  Cpu,
  Flame,
  Gauge,
  HelpCircle,
  Laptop,
  Maximize2,
  Minimize2,
  Navigation,
  Radio,
  RotateCcw,
  RotateCw,
  Shield,
  Smartphone,
  Sparkles,
  User,
  Vibrate,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { TrackingHUD } from '../TrackingHUD';
import { ParameterPanel } from '../ParameterPanel';
import {
  BLESensorState,
  LiveTorchSample,
  WeldingParameters,
  WeldPassRecord,
  WPSProcedure,
} from '../../types';

interface TrainerViewProps {
  parameters: WeldingParameters;
  onParametersChange: (newParams: WeldingParameters) => void;
  bleState: BLESensorState;
  isRecording: boolean;
  onStartPass: () => void;
  onFinishPass: (samples: LiveTorchSample[]) => void;
  onOpenHardwareGuide: () => void;
  latestPass: WeldPassRecord | null;
  onOpenReport: (pass: WeldPassRecord) => void;
  activeWps: WPSProcedure;
  studentName: string;
  onSelectStudentName: (name: string) => void;
  onSwitchToInstructor: () => void;
}

export const TrainerView: React.FC<TrainerViewProps> = ({
  parameters,
  onParametersChange,
  bleState,
  isRecording,
  onStartPass,
  onFinishPass,
  onOpenHardwareGuide,
  latestPass,
  onOpenReport,
  activeWps,
  studentName,
  onSelectStudentName,
  onSwitchToInstructor,
}) => {
  // Mobile device frame preview on desktop screens
  const [deviceFrameMode, setDeviceFrameMode] = useState<boolean>(true);
  const [phoneOrientation, setPhoneOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Bottom Sheet Drawers for Mobile UI
  const [activeBottomSheet, setActiveBottomSheet] = useState<'none' | 'wps' | 'parameters' | 'history'>('none');
  const [isEditingStudent, setIsEditingStudent] = useState<boolean>(false);
  const [tempStudentName, setTempStudentName] = useState<string>(studentName);

  const getScoreBadgeClass = (score: number) => {
    if (score >= 85) return 'text-emerald-400 border-emerald-500 bg-emerald-950/60';
    if (score >= 70) return 'text-cyan-400 border-cyan-500 bg-cyan-950/60';
    if (score >= 55) return 'text-amber-400 border-amber-500 bg-amber-950/60';
    return 'text-red-400 border-red-500 bg-red-950/60';
  };

  const handleSaveStudentName = () => {
    if (tempStudentName.trim()) {
      onSelectStudentName(tempStudentName.trim());
    }
    setIsEditingStudent(false);
  };

  const isLandscape = phoneOrientation === 'landscape';

  // The actual mobile view content
  const mobileContent = (
    <div className={`w-full flex flex-col text-slate-100 ${isLandscape ? 'pb-24' : 'pb-28'} relative`}>
      {/* Top Mobile Bar: Welder Name & Quick Mode Indicators */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-lg flex items-center justify-between gap-2 mb-3">
        {/* Student Profile Pill */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
            <User className="w-4 h-4" />
          </div>
          {isEditingStudent ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={tempStudentName}
                onChange={(e) => setTempStudentName(e.target.value)}
                className="bg-slate-950 border border-cyan-500 text-xs px-2 py-1 rounded-lg text-white font-medium w-28 focus:outline-none"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveStudentName()}
              />
              <button
                onClick={handleSaveStudentName}
                className="text-[10px] bg-cyan-600 px-2 py-1 rounded-lg font-bold hover:bg-cyan-500"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setTempStudentName(studentName);
                setIsEditingStudent(true);
              }}
              className="text-left group truncate"
              title="Click to change student name"
            >
              <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider flex items-center gap-1">
                Booth #1 <span className="group-hover:text-cyan-300 underline">(edit)</span>
              </div>
              <div className="text-xs font-bold text-white group-hover:text-cyan-400 transition truncate max-w-[120px] sm:max-w-none">
                {studentName}
              </div>
            </button>
          )}
        </div>

        {/* Right Status Badges: WPS Quick Button + BLE Status */}
        <div className="flex items-center gap-1.5">
          {/* WPS Pill (Tap to open bottom sheet) */}
          <button
            onClick={() => setActiveBottomSheet(activeBottomSheet === 'wps' ? 'none' : 'wps')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-mono font-bold border transition ${
              activeBottomSheet === 'wps'
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:text-cyan-300'
            }`}
            title="Open WPS Procedure Specifications Drawer"
          >
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span>{activeWps.code}</span>
          </button>

          {/* Orientation Quick Switcher Button */}
          <button
            onClick={() => setPhoneOrientation(isLandscape ? 'portrait' : 'landscape')}
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono transition"
            title={`Switch to ${isLandscape ? 'Portrait' : 'Landscape'} mode`}
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline capitalize">{isLandscape ? 'Portrait' : 'Landscape'}</span>
          </button>
        </div>
      </div>

      {/* Core Torch Tracking HUD with Overlay Architecture */}
      <div className="w-full">
        <TrackingHUD
          parameters={parameters}
          isRecording={isRecording}
          onStartPass={onStartPass}
          onFinishPass={onFinishPass}
          bleState={bleState}
          onConnectBLE={onOpenHardwareGuide}
          onOpenHardwareGuide={onOpenHardwareGuide}
          activeWps={activeWps}
        />
      </div>

      {/* In Portrait Mode: Display Latest Pass Card & Optional Parameters below */}
      {!isLandscape && latestPass && (
        <div className="w-full bg-slate-900/90 rounded-2xl border border-slate-800 p-3.5 shadow-xl flex flex-col gap-3 mt-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-cyan-400" />
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Last Pass Result
                </span>
                <span className="text-xs font-bold text-white">
                  {latestPass.result.attribution.primaryIssue === 'none'
                    ? 'Sound Weld'
                    : `${latestPass.result.attribution.primaryIssue} issue`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`px-2.5 py-1 rounded-xl border text-center font-mono font-black text-base ${getScoreBadgeClass(
                  latestPass.result.overallScore
                )}`}
              >
                {latestPass.result.overallScore} / 100
              </div>
              <button
                onClick={() => onOpenReport(latestPass)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition"
              >
                Report <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            {latestPass.result.attribution.summary}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-[9px] text-slate-400 block">Bead Width</span>
              <span className="font-mono font-bold text-cyan-400">
                {latestPass.result.meanBeadWidth_mm}mm
              </span>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-[9px] text-slate-400 block">Penetration</span>
              <span className="font-mono font-bold text-red-400">
                {latestPass.result.meanPenetration_mm}mm
              </span>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-[9px] text-slate-400 block">Heat Input</span>
              <span className="font-mono font-bold text-amber-400">
                {latestPass.result.heatInput_kJ_per_mm.toFixed(2)} kJ/mm
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Sticky Bottom Thumb Menu / Dock (Ergonomic for Mobile Gloves) */}
      <nav className="fixed bottom-3 inset-x-3 sm:max-w-md sm:mx-auto z-40 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl p-2 flex items-center justify-between gap-1 sm:gap-2">
        {/* Item 1: WPS Quick-Sheet Drawer Button */}
        <button
          onClick={() => setActiveBottomSheet(activeBottomSheet === 'wps' ? 'none' : 'wps')}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition ${
            activeBottomSheet === 'wps'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-600'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
          title="Open WPS Procedure specs"
        >
          <Shield className="w-4 h-4 mb-0.5 text-cyan-400" />
          <span className="text-[9px] font-mono font-bold">WPS</span>
        </button>

        {/* Item 2: Machine Parameters Drawer Button */}
        <button
          onClick={() => setActiveBottomSheet(activeBottomSheet === 'parameters' ? 'none' : 'parameters')}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition ${
            activeBottomSheet === 'parameters'
              ? 'bg-orange-950 text-orange-300 border border-orange-600'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
          title="Adjust Machine Voltage & Wire Feed"
        >
          <Wrench className="w-4 h-4 mb-0.5 text-orange-400" />
          <span className="text-[9px] font-mono font-bold">Volts/WFS</span>
        </button>

        {/* Item 3: Center Primary Large Arc Trigger / Pass Action Button */}
        <div className="flex items-center justify-center -my-3">
          <button
            onClick={() => {
              if (isRecording) {
                // finish pass with simulated trigger
                onStartPass(); // toggles or triggers
              } else {
                onStartPass();
              }
            }}
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex flex-col items-center justify-center font-mono font-black text-[10px] sm:text-xs transition-all transform active:scale-95 shadow-xl border-2 ${
              isRecording
                ? 'bg-red-600 border-red-300 text-white animate-pulse shadow-red-500/50'
                : bleState.isArmed
                ? 'bg-gradient-to-tr from-amber-500 to-orange-500 border-white text-slate-950 shadow-orange-500/40 hover:brightness-110'
                : 'bg-gradient-to-tr from-cyan-600 to-emerald-500 border-cyan-300 text-white shadow-cyan-500/30 hover:brightness-110'
            }`}
            title="Large Ergonomic Touch Trigger (Starts recording pass if real switch unpressed)"
          >
            <Flame className="w-5 h-5 fill-current" />
            <span className="tracking-tighter uppercase mt-0.5">
              {isRecording ? 'STOP' : bleState.isArmed ? 'ARC ON' : 'TRIGGER'}
            </span>
          </button>
        </div>

        {/* Item 4: Orientation Toggle */}
        <button
          onClick={() => setPhoneOrientation(isLandscape ? 'portrait' : 'landscape')}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition ${
            isLandscape
              ? 'bg-amber-950 text-amber-300 border border-amber-600'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
          title={`Switch orientation (${isLandscape ? 'Landscape' : 'Portrait'})`}
        >
          <RotateCw className="w-4 h-4 mb-0.5 text-amber-400" />
          <span className="text-[9px] font-mono font-bold">{isLandscape ? 'Wide' : 'Tall'}</span>
        </button>

        {/* Item 5: Pass Report / History */}
        <button
          onClick={() => {
            if (latestPass) {
              onOpenReport(latestPass);
            } else {
              setActiveBottomSheet(activeBottomSheet === 'history' ? 'none' : 'history');
            }
          }}
          className="flex flex-col items-center justify-center w-14 h-12 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
          title="Open Last Pass Feedback Report"
        >
          <Award className="w-4 h-4 mb-0.5 text-emerald-400" />
          <span className="text-[9px] font-mono font-bold">Report</span>
        </button>
      </nav>

      {/* Bottom Sheet Modal / Drawer for WPS Procedures */}
      {activeBottomSheet === 'wps' && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-slate-950 border-t-2 border-cyan-500/60 rounded-t-3xl p-4 sm:p-6 shadow-[0_-15px_40px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-200 max-h-[80vh] overflow-y-auto">
          <div className="max-w-md mx-auto flex flex-col gap-3">
            {/* Grab handle */}
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto" />

            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-cyan-400" />
                <div>
                  <h4 className="text-sm font-bold text-white font-mono">{activeWps.code}</h4>
                  <span className="text-[10px] text-slate-400">{activeWps.standard}</span>
                </div>
              </div>
              <button
                onClick={() => setActiveBottomSheet('none')}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{activeWps.notes}</p>

            {/* Target Parameters Grid */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Target Volts</span>
                <span className="text-cyan-400 font-bold text-sm">{activeWps.voltage_V} V</span>
                <span className="text-[9px] text-slate-500 block">&plusmn;{activeWps.voltageTolerance_V}V</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Target WFS</span>
                <span className="text-amber-400 font-bold text-sm">{activeWps.wireFeedSpeed_m_min} m/m</span>
                <span className="text-[9px] text-slate-500 block">&plusmn;{activeWps.wireFeedSpeedTolerance}</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Push Angle</span>
                <span className="text-purple-400 font-bold text-sm">
                  {activeWps.targetTravelAngleMin_deg}&deg;-{activeWps.targetTravelAngleMax_deg}&deg;
                </span>
                <span className="text-[9px] text-slate-500 block">Target: 12&deg;</span>
              </div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
              <span className="text-slate-400 font-mono text-[11px]">Travel Speed Corridor:</span>
              <span className="text-emerald-400 font-mono font-bold">
                {activeWps.targetTravelSpeedMin_mm_s} - {activeWps.targetTravelSpeedMax_mm_s} mm/s
              </span>
            </div>

            <button
              onClick={() => setActiveBottomSheet('none')}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition mt-1"
            >
              Close & Return to HUD
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sheet Modal / Drawer for Parameters */}
      {activeBottomSheet === 'parameters' && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-slate-950 border-t-2 border-orange-500/60 rounded-t-3xl p-4 sm:p-6 shadow-[0_-15px_40px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
          <div className="max-w-md mx-auto flex flex-col gap-3">
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto" />

            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-400" />
                <h4 className="text-sm font-bold text-white font-mono">Machine Parameters</h4>
              </div>
              <button
                onClick={() => setActiveBottomSheet('none')}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ParameterPanel
              parameters={parameters}
              onChange={onParametersChange}
              disabled={isRecording}
            />

            <button
              onClick={() => setActiveBottomSheet('none')}
              className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-lg transition mt-2"
            >
              Save Settings & Return
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full flex flex-col items-center">
      {/* Desktop Helper Banner: Switch between simulated Phone Bezel and Fluid Layout */}
      <div className="w-full max-w-5xl mb-3 hidden md:flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Smartphone className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white">Trainer View (Mobile UI)</span>
          <span className="text-slate-500">&bull;</span>
          <span className="text-slate-400">
            {isLandscape
              ? 'Landscape Cockpit (Best for linear seam tracking & wide angle)'
              : 'Portrait Ergonomic (Best for mobile setup & single-hand hold)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Orientation toggle */}
          <button
            onClick={() =>
              setPhoneOrientation(isLandscape ? 'portrait' : 'landscape')
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            title="Rotate phone orientation"
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span className="capitalize">{phoneOrientation} Mode</span>
          </button>

          {/* Frame mode toggle */}
          <button
            onClick={() => setDeviceFrameMode(!deviceFrameMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
              deviceFrameMode
                ? 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle realistic mobile device mockup bezel"
          >
            {deviceFrameMode ? <Smartphone className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{deviceFrameMode ? 'Device Bezel' : 'Fluid Screen'}</span>
          </button>

          {/* Jump to Instructor */}
          <button
            onClick={onSwitchToInstructor}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-xs transition font-semibold"
          >
            <Laptop className="w-3.5 h-3.5 text-cyan-400" />
            <span>Instructor UI</span>
          </button>
        </div>
      </div>

      {/* Render Mobile View Container */}
      {deviceFrameMode ? (
        <div className="w-full flex justify-center py-2 px-2">
          {/* Simulated Smartphone Bezel (on desktop) / Fluid on mobile */}
          <div
            className={`transition-all duration-300 bg-slate-950 rounded-[40px] md:border-[10px] md:border-slate-800 md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] md:ring-1 md:ring-slate-700/50 overflow-hidden relative flex flex-col ${
              isLandscape
                ? 'w-full max-w-[820px]'
                : 'w-full max-w-[430px]'
            }`}
          >
            {/* Top Phone Speaker / Dynamic Island on desktop */}
            <div className="hidden md:flex justify-center pt-2 pb-1 bg-slate-950 z-20">
              <div className="w-24 h-4 bg-slate-900 rounded-full flex items-center justify-center gap-2 border border-slate-800/80">
                <div className="w-2 h-2 rounded-full bg-slate-800" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-slate-800" />
              </div>
            </div>

            {/* Scrollable Mobile Screen Body */}
            <div className="p-2 sm:p-3 overflow-y-auto max-h-[calc(100vh-140px)] md:max-h-[820px] custom-scrollbar">
              {mobileContent}
            </div>

            {/* Bottom Home Indicator Bar on desktop */}
            <div className="hidden md:flex justify-center py-1.5 bg-slate-950">
              <div className="w-32 h-1 bg-slate-700 rounded-full" />
            </div>
          </div>
        </div>
      ) : (
        /* Fluid Full-Width Mobile layout */
        <div className="w-full max-w-4xl px-2">{mobileContent}</div>
      )}
    </div>
  );
};
