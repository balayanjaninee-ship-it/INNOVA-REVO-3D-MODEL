import { Maximize2 } from 'lucide-react';
import { FleetSheetData, FourViewId, StudioTheme } from '../model/vehicleConfig';

interface FourViewOverlayProps {
  visible: boolean;
  studioTheme: StudioTheme;
  fleetSheet: FleetSheetData;
  dockCollapsed: boolean;
  onFocusView: (view: FourViewId) => void;
}

const QUADRANT_META: Array<{ id: FourViewId; label: string; corner: string }> = [
  { id: 'right', label: 'RIGHT SIDE VIEW', corner: 'col-1 row-1' },
  { id: 'left', label: 'LEFT SIDE VIEW', corner: 'col-2 row-1' },
  { id: 'front', label: 'FRONT VIEW', corner: 'col-1 row-2' },
  { id: 'rear', label: 'REAR VIEW', corner: 'col-2 row-2' },
];

export function FourViewOverlay({
  visible,
  studioTheme,
  fleetSheet,
  dockCollapsed,
  onFocusView,
}: FourViewOverlayProps) {
  if (!visible) return null;

  const isDark = studioTheme === 'night';
  const dividerClass = isDark ? 'border-slate-700/80' : 'border-slate-300/90';
  const labelTextClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const subTextClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const focusBtnClass = isDark
    ? 'bg-slate-800/95 text-slate-200 hover:bg-blue-600 hover:text-white border-slate-700'
    : 'bg-white/95 text-slate-700 hover:bg-blue-700 hover:text-white border-slate-300';

  const topOffsetClass = 'top-[68px]';
  const bottomOffsetClass = dockCollapsed ? 'bottom-9' : 'bottom-[154px]';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10"
      data-testid="four-view-overlay"
      aria-label="PANELCO III Four View Orthographic Layout"
    >
      {/* Top-Right Compact Vehicle Sketch Sheet Summary (matches attached paper header) */}
      <div
        className={`pointer-events-none fixed top-3 right-4 hidden items-center gap-5 border px-3.5 py-2 text-xs md:flex ${
          isDark
            ? 'border-slate-700 bg-slate-900/92 text-slate-200'
            : 'border-slate-300 bg-white/95 text-slate-800'
        }`}
      >
        <span className="font-bold tracking-wide whitespace-nowrap">INNOVA / REVO</span>
        <span className={subTextClass} aria-hidden="true">
          |
        </span>
        <div className="flex items-center gap-4 tabular-nums">
          <span className="whitespace-nowrap">
            <span className={subTextClass}>Driver: </span>
            <strong className="font-semibold">{fleetSheet.driverName || '—'}</strong>
          </span>
          <span className="whitespace-nowrap font-mono">
            <span className={`${subTextClass} font-sans`}>Plate / Body: </span>
            <strong className="font-semibold">
              {[fleetSheet.plateNumber, fleetSheet.bodyNumber].filter(Boolean).join(' / ') || '—'}
            </strong>
          </span>
        </div>
      </div>

      {/* 2x2 Quadrant Grid Lines & Interactive View Labels */}
      <div
        className={`fixed right-0 left-0 grid grid-cols-2 grid-rows-2 border-t border-b ${dividerClass} ${topOffsetClass} ${bottomOffsetClass}`}
      >
        {QUADRANT_META.map((q, idx) => {
          const isLeftCol = idx % 2 === 0;
          const isTopRow = idx < 2;
          return (
            <div
              key={q.id}
              className={`relative flex flex-col justify-between p-2.5 sm:p-3.5 ${
                isLeftCol ? `border-r ${dividerClass}` : ''
              } ${isTopRow ? `border-b ${dividerClass}` : ''}`}
            >
              <div className="flex items-start justify-end">
                <button
                  type="button"
                  onClick={() => onFocusView(q.id)}
                  className={`pointer-events-auto inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${focusBtnClass}`}
                  aria-label={`Inspect ${q.label} in 3D`}
                >
                  <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  <span>Inspect</span>
                </button>
              </div>
              <div className="flex items-end justify-center pb-0.5">
                <span
                  className={`text-[11px] font-bold tracking-[0.14em] whitespace-nowrap sm:text-xs ${labelTextClass}`}
                >
                  {q.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Sheet Caption when Controls are Collapsed */}
      {dockCollapsed && (
        <div
          className={`fixed right-0 bottom-2 left-0 text-center text-xs font-semibold tracking-wide ${subTextClass}`}
        >
          PANELCO III VEHICLE SKETCH (Four View)
        </div>
      )}
    </div>
  );
}
