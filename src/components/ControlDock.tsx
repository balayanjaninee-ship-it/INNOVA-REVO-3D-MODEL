import { useState, FormEvent } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Lightbulb,
  Palette,
  RotateCw,
  Sliders,
  FileText,
  DoorOpen,
  AlertTriangle,
  Sun,
  Moon,
  PenTool,
} from 'lucide-react';
import {
  areAnyPartsOpen,
  ArticulationState,
  FleetFormValidation,
  FleetSheetData,
  LiveryStyle,
  PAINT_FINISHES,
  PaintId,
  STEERING_LIMIT_DEG,
  StudioTheme,
  validateFleetForm,
  VehicleState,
  ViewMode,
} from '../model/vehicleConfig';

type DockTab = 'controls' | 'appearance' | 'sheet';

interface ControlDockProps {
  state: VehicleState;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSetViewMode: (view: ViewMode) => void;
  onTogglePart: (part: keyof ArticulationState) => void;
  onToggleAllParts: () => void;
  onToggleLight: (light: keyof VehicleState['lighting']) => void;
  onSetSteeringDeg: (deg: number) => void;
  onToggleWheelSpin: () => void;
  onToggleAutoRotate: () => void;
  onSetPaint: (paintId: PaintId) => void;
  onSetStudioTheme: (theme: StudioTheme) => void;
  onSetLiveryStyle: (style: LiveryStyle) => void;
  onApplyFleetSheet: (sheet: FleetSheetData) => void;
  onExportSheet: () => void;
}

const VIEW_ITEMS: Array<{ id: ViewMode; label: string }> = [
  { id: 'orbit', label: '3D Orbit' },
  { id: 'four-view', label: 'Four View' },
  { id: 'right', label: 'Right' },
  { id: 'left', label: 'Left' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'cabin', label: 'Cabin' },
];

export function ControlDock({
  state,
  collapsed,
  onToggleCollapse,
  onSetViewMode,
  onTogglePart,
  onToggleAllParts,
  onToggleLight,
  onSetSteeringDeg,
  onToggleWheelSpin,
  onToggleAutoRotate,
  onSetPaint,
  onSetStudioTheme,
  onSetLiveryStyle,
  onApplyFleetSheet,
  onExportSheet,
}: ControlDockProps) {
  const [activeTab, setActiveTab] = useState<DockTab>('controls');
  const [draftSheet, setDraftSheet] = useState<FleetSheetData>(state.fleetSheet);
  const [validation, setValidation] = useState<FleetFormValidation>({
    valid: true,
    errors: {},
  });
  const [savedNotice, setSavedNotice] = useState(false);

  const anyOpen = areAnyPartsOpen(state.articulation);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = validateFleetForm(draftSheet);
    setValidation(res);
    if (!res.valid) {
      setSavedNotice(false);
      return;
    }
    onApplyFleetSheet({
      driverName: draftSheet.driverName.trim(),
      dateTime: draftSheet.dateTime.trim(),
      plateNumber: draftSheet.plateNumber.trim().toUpperCase(),
      bodyNumber: draftSheet.bodyNumber.trim().toUpperCase(),
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2200);
  };

  return (
    <section
      aria-label="Vehicle Interactive Controls"
      className="pointer-events-none fixed right-0 bottom-3 left-0 z-20 flex flex-col items-center px-3"
    >
      {/* Collapse / Expand Handle (Cinema / Zen Mode) */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show Controls' : 'Hide Controls'}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-md border border-slate-700/90 bg-slate-900/95 px-3 py-1 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      {/* Unified Collapsible Bottom Control Dock (Solid/RGBA, ZERO backdrop-filter over WebGL) */}
      {!collapsed && (
        <div
          data-testid="control-dock"
          className="pointer-events-auto w-full max-w-[940px] rounded-xl border border-slate-700/80 bg-slate-950/95 text-slate-100 shadow-2xl"
        >
          {/* Row 1: Camera / Four-View Switcher + Tab Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
            {/* View Mode Segmented Controls */}
            <div
              role="group"
              aria-label="Camera Views"
              className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0"
            >
              {VIEW_ITEMS.map((v) => {
                const active = state.viewMode === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSetViewMode(v.id)}
                    aria-pressed={active}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#34d399] ${
                      active
                        ? 'bg-[#019240] text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>

            {/* Panel Tabs */}
            <div role="tablist" aria-label="Control Categories" className="flex items-center gap-1">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'controls'}
                onClick={() => setActiveTab('controls')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === 'controls'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Interactive</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'appearance'}
                onClick={() => setActiveTab('appearance')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === 'appearance'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Paint & Studio</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'sheet'}
                onClick={() => setActiveTab('sheet')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === 'sheet'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Fleet Sheet</span>
              </button>
            </div>
          </div>

          {/* Row 2: Active Tab Content */}
          <div className="px-3 py-2.5">
            {activeTab === 'controls' && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                {/* Articulated Doors, Hood & Tailgate */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleAllParts}
                    aria-pressed={anyOpen}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                      anyOpen
                        ? 'border-[#019240] bg-[#019240]/25 text-emerald-200 hover:bg-[#019240]/35'
                        : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{anyOpen ? 'Close All' : 'Open All'}</span>
                  </button>

                  {(
                    [
                      ['frontLeftDoor', 'FL Door'],
                      ['frontRightDoor', 'FR Door'],
                      ['rearLeftDoor', 'RL Door'],
                      ['rearRightDoor', 'RR Door'],
                      ['hood', 'Hood'],
                      ['tailgate', 'Tailgate'],
                    ] as const
                  ).map(([key, label]) => {
                    const isOpen = state.articulation[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onTogglePart(key)}
                        aria-pressed={isOpen}
                        className={`rounded-md border px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                          isOpen
                            ? 'border-[#019240] bg-[#019240] text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Lights, Wheel Spin & Steering */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleLight('headlights')}
                    aria-pressed={state.lighting.headlights}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      state.lighting.headlights
                        ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Lights</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleLight('hazards')}
                    aria-pressed={state.lighting.hazards}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      state.lighting.hazards
                        ? 'border-amber-500 bg-amber-500 text-slate-950 font-semibold'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Hazards</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleLight('cabinLight')}
                    aria-pressed={state.lighting.cabinLight}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      state.lighting.cabinLight
                        ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    Cabin Light
                  </button>

                  <button
                    type="button"
                    onClick={onToggleWheelSpin}
                    aria-pressed={state.wheelSpin}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      state.wheelSpin
                        ? 'border-[#019240] bg-[#019240] text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Roll Wheels</span>
                  </button>

                  <label className="flex items-center gap-2 pl-1 text-xs text-slate-300 whitespace-nowrap">
                    <span>Steer</span>
                    <input
                      type="range"
                      min={-STEERING_LIMIT_DEG}
                      max={STEERING_LIMIT_DEG}
                      step={1}
                      value={state.steeringDeg}
                      onChange={(e) => onSetSteeringDeg(Number(e.target.value))}
                      aria-label="Front Wheel Steering Angle"
                      className="studio-slider w-20"
                    />
                    <span className="w-8 text-right font-mono text-[11px] tabular-nums text-slate-200">
                      {state.steeringDeg > 0 ? `+${state.steeringDeg}°` : `${state.steeringDeg}°`}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5">
                {/* Paint Finishes matching attached Toyota Innova photos */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Paint</span>
                  <div className="flex items-center gap-1.5" role="group" aria-label="Paint Finishes">
                    {PAINT_FINISHES.map((paint) => {
                      const active = state.paintId === paint.id;
                      return (
                        <button
                          key={paint.id}
                          type="button"
                          onClick={() => onSetPaint(paint.id)}
                          aria-pressed={active}
                          aria-label={`Paint ${paint.name}`}
                          title={paint.name}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                            active
                              ? 'border-[#34d399] bg-slate-800 text-white'
                              : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white'
                          }`}
                        >
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded-full border border-white/30 ${
                              paint.id === 'white-pearl'
                                ? 'bg-[#f1f3f5]'
                                : paint.id === 'alumina-bronze'
                                  ? 'bg-[#9a8f7e]'
                                  : paint.id === 'red-mica'
                                    ? 'bg-[#9c141d]'
                                    : paint.id === 'silver-metallic'
                                      ? 'bg-[#bfc5cc]'
                                      : 'bg-[#1b1f26]'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="hidden sm:inline">{paint.name.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Studio Lighting / Blueprint Sketch Mode */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Lighting</span>
                  <div className="flex items-center gap-1" role="group" aria-label="Studio Mode">
                    {(
                      [
                        ['studio', 'Studio', Sun],
                        ['night', 'Night', Moon],
                        ['sketch', 'Sketch', PenTool],
                      ] as const
                    ).map(([id, label, Icon]) => {
                      const active = state.studioTheme === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onSetStudioTheme(id)}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                            active
                              ? 'border-[#019240] bg-[#019240] text-white'
                              : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PANELCO III Livery Mode & Auto-Rotate */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Branding</span>
                  <div className="flex items-center gap-1" role="group" aria-label="PANELCO III Livery">
                    {(
                      [
                        ['color', 'Color Seal'],
                        ['monochrome', 'Ink Seal'],
                        ['hidden', 'Off'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSetLiveryStyle(id)}
                        aria-pressed={state.liveryStyle === id}
                        className={`rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                          state.liveryStyle === id
                            ? 'border-[#019240] bg-[#019240] text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={onToggleAutoRotate}
                    aria-pressed={state.autoRotate}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      state.autoRotate
                        ? 'border-[#019240] bg-[#019240] text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Turntable</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'sheet' && (
              <form onSubmit={handleFormSubmit} noValidate className="space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
                    <span>Designated Driver</span>
                    <input
                      type="text"
                      value={draftSheet.driverName}
                      onChange={(e) =>
                        setDraftSheet((prev) => ({ ...prev, driverName: e.target.value }))
                      }
                      placeholder="Driver full name"
                      className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
                    <span>Date & Time</span>
                    <input
                      type="text"
                      value={draftSheet.dateTime}
                      onChange={(e) =>
                        setDraftSheet((prev) => ({ ...prev, dateTime: e.target.value }))
                      }
                      placeholder="YYYY-MM-DD HH:MM"
                      className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
                    <span>Plate Number</span>
                    <input
                      type="text"
                      value={draftSheet.plateNumber}
                      onChange={(e) =>
                        setDraftSheet((prev) => ({ ...prev, plateNumber: e.target.value }))
                      }
                      placeholder="SAA 3841"
                      className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs uppercase text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
                    <span>Body Number</span>
                    <input
                      type="text"
                      value={draftSheet.bodyNumber}
                      onChange={(e) =>
                        setDraftSheet((prev) => ({ ...prev, bodyNumber: e.target.value }))
                      }
                      placeholder="P3-014"
                      className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs uppercase text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-h-[16px] text-xs" role="status" aria-live="polite">
                    {!validation.valid ? (
                      <span className="text-rose-400">
                        {Object.values(validation.errors)[0]}
                      </span>
                    ) : savedNotice ? (
                      <span className="text-emerald-400">
                        Updated 3D license plate and Four-View sheet header.
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Updates the 3D Innova license plate and Four-View inspection sheet.
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-[#019240] px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#017533]"
                    >
                      Apply to Vehicle
                    </button>
                    <button
                      type="button"
                      onClick={onExportSheet}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Export 4-View PNG</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
