import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Gauge,
  GraduationCap,
  Layers,
  LayoutGrid,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { BeadVisualizer3D } from '../BeadVisualizer3D';
import { FeedbackReportModal } from '../FeedbackReportModal';
import {
  StudentStation,
  WeldingParameters,
  WeldPassRecord,
  WPSProcedure,
} from '../../types';
import { instructorService } from '../../services/instructorService';
import { storageService } from '../../services/storageAndSync';

interface InstructorViewProps {
  passes: WeldPassRecord[];
  activeWps: WPSProcedure;
  onDeployWpsToTrainer: (wps: WPSProcedure) => void;
  onSelectPassForReport: (pass: WeldPassRecord) => void;
  onRefreshPasses: () => void;
  onSwitchToTrainer: () => void;
}

type InstructorTab = 'workstations' | 'pass_log' | 'wps_library' | 'analytics';

export const InstructorView: React.FC<InstructorViewProps> = ({
  passes,
  activeWps,
  onDeployWpsToTrainer,
  onSelectPassForReport,
  onRefreshPasses,
  onSwitchToTrainer,
}) => {
  const [activeTab, setActiveTab] = useState<InstructorTab>('workstations');
  const [wpsList, setWpsList] = useState<WPSProcedure[]>(instructorService.getWPSList());
  const [stations, setStations] = useState<StudentStation[]>(instructorService.getStations());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string>('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('all');
  
  // Pass inspection modal/drawer
  const [inspectingPass, setInspectingPass] = useState<WeldPassRecord | null>(null);
  const [instructorGradeInput, setInstructorGradeInput] = useState<'PASS' | 'RETEST' | 'REJECT'>('PASS');
  const [instructorNotesInput, setInstructorNotesInput] = useState<string>('');
  const [gradeSuccessMessage, setGradeSuccessMessage] = useState<string | null>(null);

  // New WPS modal
  const [isCreatingWps, setIsCreatingWps] = useState<boolean>(false);
  const [newWps, setNewWps] = useState<Partial<WPSProcedure>>({
    code: 'WPS-CUSTOM-05',
    title: 'Custom GMAW Qualification Joint',
    standard: 'AWS D1.1 Structural Steel',
    jointType: 'butt',
    weldingPosition: '1F_1G',
    material: 'mild_steel',
    materialThickness_mm: 3.0,
    wireDiameter_mm: 0.9,
    shieldingGas: '75Ar_25CO2',
    voltage_V: 19.5,
    voltageTolerance_V: 1.0,
    current_A: 135,
    currentTolerance_A: 15,
    wireFeedSpeed_m_min: 6.5,
    wireFeedSpeedTolerance: 0.5,
    stickout_mm: 12,
    targetTravelSpeedMin_mm_s: 4.5,
    targetTravelSpeedMax_mm_s: 7.5,
    targetTravelAngleMin_deg: 10,
    targetTravelAngleMax_deg: 15,
    targetWorkAngle_deg: 90,
    notes: 'Maintain steady travel speed and 12mm stickout.',
  });

  // Calculate Cohort KPIs
  const totalPasses = passes.length;
  const avgScore =
    totalPasses > 0
      ? Math.round(passes.reduce((acc, p) => acc + p.result.overallScore, 0) / totalPasses)
      : 0;
  const defectFreePasses = passes.filter((p) => p.result.defects.length === 0).length;
  const defectFreePercent = totalPasses > 0 ? Math.round((defectFreePasses / totalPasses) * 100) : 0;
  const activeStationsCount = stations.filter((s) => s.status !== 'offline').length;

  const getScoreBadgeClass = (score: number) => {
    if (score >= 85) return 'text-emerald-400 border-emerald-500 bg-emerald-950/40';
    if (score >= 70) return 'text-cyan-400 border-cyan-500 bg-cyan-950/40';
    if (score >= 55) return 'text-amber-400 border-amber-500 bg-amber-950/40';
    return 'text-red-400 border-red-500 bg-red-950/40';
  };

  // Filtered passes
  const filteredPasses = passes.filter((p) => {
    const matchesSearch =
      p.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.parameters.jointType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStudent =
      selectedStudentFilter === 'all' || p.studentName === selectedStudentFilter;
    const matchesGrade =
      selectedGradeFilter === 'all' ||
      (selectedGradeFilter === 'pass' && p.result.overallScore >= 85) ||
      (selectedGradeFilter === 'borderline' && p.result.overallScore >= 70 && p.result.overallScore < 85) ||
      (selectedGradeFilter === 'reject' && p.result.overallScore < 70);
    return matchesSearch && matchesStudent && matchesGrade;
  });

  // Unique students list
  const studentNames = Array.from(new Set(passes.map((p) => p.studentName)));

  // Save Instructor Grade & Notes
  const handleSaveGrade = () => {
    if (!inspectingPass) return;
    const updated = instructorService.gradePass(
      inspectingPass.id,
      instructorGradeInput,
      instructorNotesInput,
      'CWI Instructor Miller'
    );
    if (updated) {
      setInspectingPass(updated);
      onRefreshPasses();
      setGradeSuccessMessage('Evaluation grade & feedback saved successfully!');
      setTimeout(() => setGradeSuccessMessage(null), 3000);
    }
  };

  // Deploy WPS to Trainer
  const handleDeployWps = (wps: WPSProcedure) => {
    instructorService.setActiveWPS(wps.id);
    onDeployWpsToTrainer(wps);
  };

  // Save New Custom WPS
  const handleCreateWpsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWps.code || !newWps.title) return;
    const created: WPSProcedure = {
      id: `wps-${Date.now()}`,
      code: newWps.code,
      title: newWps.title,
      standard: newWps.standard || 'AWS D1.1',
      jointType: newWps.jointType || 'butt',
      weldingPosition: newWps.weldingPosition || '1F_1G',
      material: newWps.material || 'mild_steel',
      materialThickness_mm: Number(newWps.materialThickness_mm) || 3.0,
      wireDiameter_mm: Number(newWps.wireDiameter_mm) || 0.9,
      shieldingGas: newWps.shieldingGas || '75Ar_25CO2',
      voltage_V: Number(newWps.voltage_V) || 19.5,
      voltageTolerance_V: Number(newWps.voltageTolerance_V) || 1.0,
      current_A: Number(newWps.current_A) || 135,
      currentTolerance_A: Number(newWps.currentTolerance_A) || 15,
      wireFeedSpeed_m_min: Number(newWps.wireFeedSpeed_m_min) || 6.5,
      wireFeedSpeedTolerance: Number(newWps.wireFeedSpeedTolerance) || 0.5,
      stickout_mm: Number(newWps.stickout_mm) || 12,
      targetTravelSpeedMin_mm_s: Number(newWps.targetTravelSpeedMin_mm_s) || 4.5,
      targetTravelSpeedMax_mm_s: Number(newWps.targetTravelSpeedMax_mm_s) || 7.5,
      targetTravelAngleMin_deg: Number(newWps.targetTravelAngleMin_deg) || 10,
      targetTravelAngleMax_deg: Number(newWps.targetTravelAngleMax_deg) || 15,
      targetWorkAngle_deg: Number(newWps.targetWorkAngle_deg) || 90,
      notes: newWps.notes || '',
    };
    instructorService.saveWPS(created);
    setWpsList(instructorService.getWPSList());
    setIsCreatingWps(false);
  };

  return (
    <div className="w-full flex flex-col gap-6 text-slate-100 animate-fade-in">
      {/* 1. Instructor Master Header & Ribbon */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-700 flex items-center justify-center text-white shadow-xl shadow-cyan-600/20 border border-cyan-400/30">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-white tracking-tight">
                Instructor Supervision Console
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-700">
                Web UI Dashboard
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              AWS D1.1 GMAW Cohort Training, Real-time Workstations & WPS Procedure Management
            </p>
          </div>
        </div>

        {/* Global Toolbar Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => storageService.exportCSV()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition shadow-sm"
            title="Download CSV report of all student passes"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => storageService.exportJSON()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition shadow-sm"
            title="Export full JSON pass archive"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export JSON</span>
          </button>

          {/* Switch to Trainer Button */}
          <button
            onClick={onSwitchToTrainer}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-600/30 transition"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Switch to Trainer (Mobile UI)</span>
          </button>
        </div>
      </div>

      {/* 2. Cohort KPI Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider block">
              Cohort Passes
            </span>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {totalPasses}
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              Across {studentNames.length || 1} active welders
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800 flex items-center justify-center text-cyan-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider block">
              Cohort Mean Score
            </span>
            <div className={`text-2xl font-black font-mono mt-1 ${getScoreBadgeClass(avgScore)}`}>
              {avgScore} / 100
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {avgScore >= 85 ? 'AWS D1.1 Certified tier' : 'Needs technique focus'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800 flex items-center justify-center text-amber-400">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider block">
              Defect-Free Rate
            </span>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
              {defectFreePercent}%
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {defectFreePasses} of {totalPasses} sound welds
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider block">
              Active WPS
            </span>
            <div className="text-base font-bold text-cyan-300 truncate max-w-[140px] mt-1" title={activeWps.code}>
              {activeWps.code}
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {activeWps.material === 'mild_steel' ? 'Mild Steel' : activeWps.material} &bull; {activeWps.materialThickness_mm}mm
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800 flex items-center justify-center text-purple-400">
            <Shield className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('workstations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'workstations'
              ? 'border-cyan-500 text-cyan-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Workstation Booths & Roster ({stations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('pass_log')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'pass_log'
              ? 'border-cyan-500 text-cyan-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>AWS D1.1 Pass Log & Grading ({passes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('wps_library')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'wps_library'
              ? 'border-cyan-500 text-cyan-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>WPS Procedures Library ({wpsList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 whitespace-nowrap ${
            activeTab === 'analytics'
              ? 'border-cyan-500 text-cyan-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Defect & Technique Analytics</span>
        </button>
      </div>

      {/* 4. Tab Contents */}

      {/* TAB 1: WORKSTATION BOOTHS */}
      {activeTab === 'workstations' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400">
              Monitoring welding booths in shop floor training lab. Broadcast assigned WPS directly to any workstation.
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active Arc
              </span>
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-500" /> Ready
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-500" /> Standby
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {stations.map((st) => {
              const assignedWps = wpsList.find((w) => w.id === st.currentWpsId) || activeWps;
              const studentPasses = passes.filter((p) => p.studentName === st.name);
              const latestStudentPass = studentPasses[0] || null;

              return (
                <div
                  key={st.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-4 relative overflow-hidden group hover:border-slate-700 transition"
                >
                  {/* Status strip top accent */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${
                      st.status === 'active_arc'
                        ? 'bg-amber-500'
                        : st.status === 'ready'
                        ? 'bg-cyan-500'
                        : 'bg-slate-700'
                    }`}
                  />

                  {/* Booth Header */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                        Booth #{st.stationNumber}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          st.status === 'active_arc'
                            ? 'bg-amber-950 text-amber-300 border-amber-600 animate-pulse'
                            : st.status === 'ready'
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {st.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{st.name}</h4>
                        <span className="text-[11px] text-slate-400">
                          {studentPasses.length} total passes recorded
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned WPS Info */}
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-1 text-xs">
                    <span className="text-[10px] font-mono text-cyan-400 uppercase">
                      Current Assigned WPS:
                    </span>
                    <span className="font-bold text-white text-xs truncate">
                      {assignedWps.code}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {assignedWps.voltage_V}V &bull; {assignedWps.wireFeedSpeed_m_min} m/min &bull; {assignedWps.materialThickness_mm}mm
                    </span>
                  </div>

                  {/* Student Performance Score Stats */}
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Avg Score</span>
                      <span className="font-mono font-bold text-base text-cyan-400">
                        {st.avgScore}%
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Last Pass</span>
                      <span
                        className={`font-mono font-bold text-base ${
                          (st.lastScore || 0) >= 85
                            ? 'text-emerald-400'
                            : (st.lastScore || 0) >= 70
                            ? 'text-cyan-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {st.lastScore ? `${st.lastScore}%` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                    <button
                      onClick={() => handleDeployWps(assignedWps)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                      title="Push active parameters to this welder's device"
                    >
                      <Send className="w-3 h-3 text-cyan-400" />
                      <span>Deploy WPS</span>
                    </button>

                    {latestStudentPass && (
                      <button
                        onClick={() => setInspectingPass(latestStudentPass)}
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-xs font-semibold text-cyan-300 transition"
                        title="Audit latest pass"
                      >
                        Audit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PASS AUDIT LOG & GRADING */}
      {activeTab === 'pass_log' && (
        <div className="flex flex-col gap-4">
          {/* Filters Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search student, pass ID, or joint..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Student filter */}
              <select
                value={selectedStudentFilter}
                onChange={(e) => setSelectedStudentFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Welder Trainees</option>
                {studentNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Grade filter */}
              <select
                value={selectedGradeFilter}
                onChange={(e) => setSelectedGradeFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Score Tiers</option>
                <option value="pass">Certified (≥ 85%)</option>
                <option value="borderline">Borderline (70 - 84%)</option>
                <option value="reject">Defective / Retest (&lt; 70%)</option>
              </select>
            </div>

            <span className="text-xs text-slate-400 font-mono">
              Showing {filteredPasses.length} of {passes.length} records
            </span>
          </div>

          {/* Passes Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Welder / Student</th>
                    <th className="p-3.5">Joint & Position</th>
                    <th className="p-3.5">Machine vs Technique</th>
                    <th className="p-3.5">Heat Input</th>
                    <th className="p-3.5">Score</th>
                    <th className="p-3.5">Instructor Sign-Off</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredPasses.map((p) => {
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5 font-mono text-[11px] text-slate-400">
                          {new Date(p.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-white block">{p.studentName}</span>
                          <span className="font-mono text-[10px] text-slate-500">{p.id}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-medium text-slate-200 capitalize">
                            {p.parameters.jointType.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {p.parameters.materialThickness_mm}mm &bull; {p.parameters.voltage_V}V
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400 font-mono">
                              P: {p.result.attribution.parameterScore}%
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="text-purple-400 font-mono">
                              T: {p.result.attribution.techniqueScore}%
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate max-w-[160px]">
                            {p.result.attribution.primaryIssue === 'none'
                              ? 'Sound Weld'
                              : `${p.result.attribution.primaryIssue} error`}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono">
                          <span className="text-cyan-400 font-semibold">
                            {p.result.heatInput_kJ_per_mm.toFixed(2)}
                          </span>{' '}
                          <span className="text-[10px] text-slate-500">kJ/mm</span>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-lg border font-mono font-bold text-xs ${getScoreBadgeClass(
                              p.result.overallScore
                            )}`}
                          >
                            {p.result.overallScore}%
                          </span>
                        </td>
                        <td className="p-3.5">
                          {p.instructorGrade ? (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                p.instructorGrade === 'PASS'
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                  : p.instructorGrade === 'RETEST'
                                  ? 'bg-amber-950 text-amber-300 border-amber-700'
                                  : 'bg-red-950 text-red-300 border-red-700'
                              }`}
                            >
                              {p.instructorGrade}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono uppercase">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setInspectingPass(p);
                                setInstructorGradeInput(
                                  (p.instructorGrade as any) ||
                                    (p.result.overallScore >= 85
                                      ? 'PASS'
                                      : p.result.overallScore >= 70
                                      ? 'RETEST'
                                      : 'REJECT')
                                );
                                setInstructorNotesInput(p.instructorNotes || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 text-xs font-semibold transition"
                            >
                              Audit / Grade
                            </button>
                            <button
                              onClick={() => onSelectPassForReport(p)}
                              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                              title="Inspect Full Feedback Report"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPasses.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        No weld passes match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WPS PROCEDURES LIBRARY */}
      {activeTab === 'wps_library' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3.5 rounded-2xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">
                Welding Procedure Specifications (WPS) Catalog
              </h3>
              <p className="text-xs text-slate-400">
                Prequalified AWS D1.1, D1.2, and D1.6 specifications. Deploy procedures directly to student welder torches.
              </p>
            </div>

            <button
              onClick={() => setIsCreatingWps(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Custom WPS</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wpsList.map((wps) => {
              const isActive = activeWps.id === wps.id;

              return (
                <div
                  key={wps.id}
                  className={`bg-slate-900/90 rounded-2xl p-5 border shadow-xl flex flex-col justify-between gap-4 transition ${
                    isActive
                      ? 'border-cyan-500/80 ring-1 ring-cyan-500/30 shadow-cyan-500/10'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        {wps.code}
                      </span>
                      {isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-950 text-cyan-300 border border-cyan-600">
                          Active Assigned
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">{wps.standard}</span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-white leading-snug">{wps.title}</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{wps.notes}</p>
                  </div>

                  {/* Target Spec Matrix */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-center font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Voltage</span>
                      <span className="font-bold text-white">
                        {wps.voltage_V}V <span className="text-slate-500 font-normal">±{wps.voltageTolerance_V}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Current</span>
                      <span className="font-bold text-amber-400">
                        {wps.current_A}A <span className="text-slate-500 font-normal">±{wps.currentTolerance_A}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Wire Feed</span>
                      <span className="font-bold text-cyan-400">
                        {wps.wireFeedSpeed_m_min} <span className="text-slate-500 text-[10px]">m/min</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Push Angle</span>
                      <span className="font-bold text-purple-400">
                        {wps.targetTravelAngleMin_deg}°-{wps.targetTravelAngleMax_deg}°
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Travel Speed</span>
                      <span className="font-bold text-emerald-400">
                        {wps.targetTravelSpeedMin_mm_s}-{wps.targetTravelSpeedMax_mm_s} <span className="text-[10px]">mm/s</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">CTWD Standoff</span>
                      <span className="font-bold text-slate-200">{wps.stickout_mm}mm</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Gas: {wps.shieldingGas.replace('_', ' ')}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeployWps(wps)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 cursor-default'
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md'
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        <span>{isActive ? 'Currently Deployed' : 'Deploy to Trainer'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: COHORT DEFECT & TECHNIQUE ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Defect Frequency Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between gap-4">
              <div>
                <span className="text-xs font-mono uppercase text-slate-400 tracking-wider block">
                  AWS D1.1 Defect Taxonomy Breakdown
                </span>
                <h3 className="text-sm font-bold text-white mt-1">
                  Root Cause Defect Occurrences Across Class
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-amber-300 font-medium">Toe Undercut (Excessive Travel Angle &gt;15°)</span>
                    <span className="font-mono text-amber-400 font-bold">42% of errors</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: '42%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-red-300 font-medium">Lack of Root Penetration (Travel Speed Too High)</span>
                    <span className="font-mono text-red-400 font-bold">28% of errors</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: '28%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-purple-300 font-medium">Surface Porosity (Gas Flow / Excessive CTWD)</span>
                    <span className="font-mono text-purple-400 font-bold">18% of errors</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: '18%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-orange-300 font-medium">Excessive Spatter (Arc Voltage Misalignment)</span>
                    <span className="font-mono text-orange-400 font-bold">12% of errors</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: '12%' }} />
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                Instructional takeaway: Direct coaching toward stabilizing torch push angle between 10°–15° will resolve 42% of identified weld defects.
              </p>
            </div>

            {/* Attribution Ratio: Machine Settings vs Torch Technique */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between gap-4">
              <div>
                <span className="text-xs font-mono uppercase text-slate-400 tracking-wider block">
                  Error Attribution Split
                </span>
                <h3 className="text-sm font-bold text-white mt-1">
                  Machine Parameter Errors vs. Torch Hand Technique
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center my-2">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <Wrench className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                  <span className="text-2xl font-black font-mono text-orange-400 block">34%</span>
                  <span className="text-xs text-slate-400">Machine Parameter Errors</span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <Flame className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <span className="text-2xl font-black font-mono text-purple-400 block">66%</span>
                  <span className="text-xs text-slate-400">Torch Hand Technique Errors</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                Data verifies that students have mastered basic power source dial setup, but require additional tactile tracking training for travel speed constancy and push angle control.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. Pass Inspection & Grading Sign-off Drawer/Modal */}
      {inspectingPass && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 my-auto max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Pass Inspection & Instructor Sign-off
                  </h3>
                  <p className="text-xs text-slate-400">
                    Welder: <span className="text-white font-bold">{inspectingPass.studentName}</span> &bull; {new Date(inspectingPass.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setInspectingPass(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Score & Attribution Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-400 block">Overall Score</span>
                <span className={`text-2xl font-black font-mono ${getScoreBadgeClass(inspectingPass.result.overallScore)}`}>
                  {inspectingPass.result.overallScore}%
                </span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-400 block">Heat Input</span>
                <span className="text-2xl font-black font-mono text-cyan-400">
                  {inspectingPass.result.heatInput_kJ_per_mm.toFixed(2)} <span className="text-xs font-normal">kJ/mm</span>
                </span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-400 block">Defects Detected</span>
                <span className={`text-2xl font-black font-mono ${inspectingPass.result.defects.length === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {inspectingPass.result.defects.length}
                </span>
              </div>
            </div>

            {/* Bead 3D/2D Visualizer */}
            <BeadVisualizer3D
              result={inspectingPass.result}
              parameters={inspectingPass.parameters}
            />

            {/* Instructor Evaluation Sign-off Box */}
            <div className="bg-slate-950 rounded-2xl p-4 border border-cyan-900/60 flex flex-col gap-3">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Official Instructor Audit Sign-Off
              </span>

              {gradeSuccessMessage && (
                <div className="bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs px-3 py-2 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{gradeSuccessMessage}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-slate-300 font-medium">Compliance Grade:</label>
                {(['PASS', 'RETEST', 'REJECT'] as const).map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => setInstructorGradeInput(grade)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      instructorGradeInput === grade
                        ? grade === 'PASS'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500 ring-2 ring-emerald-500/30'
                          : grade === 'RETEST'
                          ? 'bg-amber-950 text-amber-300 border-amber-500 ring-2 ring-amber-500/30'
                          : 'bg-red-950 text-red-300 border-red-500 ring-2 ring-red-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {grade === 'PASS'
                      ? '✓ PASS (AWS D1.1 Certified)'
                      : grade === 'RETEST'
                      ? '⚠ RETEST (Technique Deviation)'
                      : '✗ REJECT (Disqualified)'}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">
                  Instructor Pedagogical Feedback Notes:
                </label>
                <textarea
                  value={instructorNotesInput}
                  onChange={(e) => setInstructorNotesInput(e.target.value)}
                  placeholder="e.g. Excellent travel speed constancy. Push angle was slightly high in the final 30mm; practice keeping wrist locked during torch extension."
                  className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-cyan-500 min-h-[80px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveGrade}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Sign-Off & Sync</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Create Custom WPS Modal */}
      {isCreatingWps && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <form
            onSubmit={handleCreateWpsSubmit}
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" /> Create Custom Welding Procedure Specification
              </h3>
              <button
                type="button"
                onClick={() => setIsCreatingWps(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">WPS Code</label>
                <input
                  type="text"
                  value={newWps.code || ''}
                  onChange={(e) => setNewWps({ ...newWps, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Standard Reference</label>
                <input
                  type="text"
                  value={newWps.standard || ''}
                  onChange={(e) => setNewWps({ ...newWps, standard: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1">Procedure Title</label>
                <input
                  type="text"
                  value={newWps.title || ''}
                  onChange={(e) => setNewWps({ ...newWps, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Target Voltage (V)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newWps.voltage_V || 19.5}
                  onChange={(e) => setNewWps({ ...newWps, voltage_V: parseFloat(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Target Current (A)</label>
                <input
                  type="number"
                  value={newWps.current_A || 135}
                  onChange={(e) => setNewWps({ ...newWps, current_A: parseInt(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Wire Feed Speed (m/min)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newWps.wireFeedSpeed_m_min || 6.5}
                  onChange={(e) => setNewWps({ ...newWps, wireFeedSpeed_m_min: parseFloat(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Plate Thickness (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={newWps.materialThickness_mm || 3.0}
                  onChange={(e) => setNewWps({ ...newWps, materialThickness_mm: parseFloat(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreatingWps(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 shadow-md"
              >
                Save WPS Procedure
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
