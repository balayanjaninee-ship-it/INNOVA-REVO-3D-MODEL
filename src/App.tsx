import { useCallback, useEffect, useRef, useState } from 'react';
import {
  areAnyPartsOpen,
  ArticulationState,
  clampSteeringDeg,
  DEFAULT_VEHICLE_STATE,
  FleetSheetData,
  FourViewId,
  LiveryStyle,
  PaintId,
  setAllArticulation,
  StudioTheme,
  VehicleState,
  ViewMode,
} from './model/vehicleConfig';
import { InteractablePart } from './three/innovaModel';
import { createInnovaSceneController, SceneController } from './three/sceneController';
import { PanelcoLogo } from './components/PanelcoLogo';
import { FourViewOverlay } from './components/FourViewOverlay';
import { ControlDock } from './components/ControlDock';

const PART_LABELS: Record<InteractablePart, string> = {
  frontLeftDoor: 'Front Left Door (Click to toggle)',
  frontRightDoor: 'Front Right Door (Click to toggle)',
  rearLeftDoor: 'Rear Left Door (Click to toggle)',
  rearRightDoor: 'Rear Right Door (Click to toggle)',
  hood: 'Engine Hood (Click to toggle)',
  tailgate: 'Rear Tailgate (Click to toggle)',
  headlights: 'LED Headlights (Click to toggle)',
};

export default function App() {
  const [vehicleState, setVehicleState] = useState<VehicleState>(DEFAULT_VEHICLE_STATE);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hoveredPart, setHoveredPart] = useState<InteractablePart | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SceneController | null>(null);

  // Stable callback refs so Three.js scene mounts once and never tears down on UI updates
  const handlePartClickedRef = useRef<(part: InteractablePart) => void>(() => {});
  handlePartClickedRef.current = (part: InteractablePart) => {
    setVehicleState((prev) => {
      if (part === 'headlights') {
        return {
          ...prev,
          lighting: { ...prev.lighting, headlights: !prev.lighting.headlights },
        };
      }
      return {
        ...prev,
        articulation: {
          ...prev.articulation,
          [part]: !prev.articulation[part],
        },
      };
    });
  };

  // Mount WebGL canvas & Three.js controller exactly once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const controller = createInnovaSceneController(container, DEFAULT_VEHICLE_STATE, {
      onPartClicked: (part) => handlePartClickedRef.current(part),
      onPartHovered: (part) => setHoveredPart(part),
      onContextLost: (lost) => setContextLost(lost),
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Push React state changes into the Three.js scene controller without re-mounting WebGL
  useEffect(() => {
    controllerRef.current?.syncState(vehicleState);
  }, [vehicleState]);

  // Keep Four-View vertical insets synced with collapsed/expanded dock height
  useEffect(() => {
    controllerRef.current?.setReservedInsets(68, dockCollapsed ? 38 : 154);
  }, [dockCollapsed]);

  // Keyboard shortcuts (1-7 views, H hide/show dock, O open/close all, L headlights)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'h') {
        setDockCollapsed((prev) => !prev);
      } else if (key === '1') {
        setVehicleState((s) => ({ ...s, viewMode: 'orbit' }));
      } else if (key === '2') {
        setVehicleState((s) => ({ ...s, viewMode: 'four-view' }));
      } else if (key === '3') {
        setVehicleState((s) => ({ ...s, viewMode: 'right' }));
      } else if (key === '4') {
        setVehicleState((s) => ({ ...s, viewMode: 'left' }));
      } else if (key === '5') {
        setVehicleState((s) => ({ ...s, viewMode: 'front' }));
      } else if (key === '6') {
        setVehicleState((s) => ({ ...s, viewMode: 'rear' }));
      } else if (key === '7') {
        setVehicleState((s) => ({ ...s, viewMode: 'cabin' }));
      } else if (key === 'l') {
        setVehicleState((s) => ({
          ...s,
          lighting: { ...s.lighting, headlights: !s.lighting.headlights },
        }));
      } else if (key === 'o') {
        setVehicleState((s) => ({
          ...s,
          articulation: setAllArticulation(!areAnyPartsOpen(s.articulation)),
        }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSetViewMode = useCallback((viewMode: ViewMode) => {
    setVehicleState((prev) => ({ ...prev, viewMode }));
  }, []);

  const handleFocusFromFourView = useCallback((view: FourViewId) => {
    setVehicleState((prev) => ({ ...prev, viewMode: view }));
  }, []);

  const handleTogglePart = useCallback((part: keyof ArticulationState) => {
    setVehicleState((prev) => ({
      ...prev,
      articulation: { ...prev.articulation, [part]: !prev.articulation[part] },
    }));
  }, []);

  const handleToggleAllParts = useCallback(() => {
    setVehicleState((prev) => ({
      ...prev,
      articulation: setAllArticulation(!areAnyPartsOpen(prev.articulation)),
    }));
  }, []);

  const handleToggleLight = useCallback((light: keyof VehicleState['lighting']) => {
    setVehicleState((prev) => ({
      ...prev,
      lighting: { ...prev.lighting, [light]: !prev.lighting[light] },
    }));
  }, []);

  const handleSetSteeringDeg = useCallback((deg: number) => {
    setVehicleState((prev) => ({ ...prev, steeringDeg: clampSteeringDeg(deg) }));
  }, []);

  const handleToggleWheelSpin = useCallback(() => {
    setVehicleState((prev) => ({ ...prev, wheelSpin: !prev.wheelSpin }));
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setVehicleState((prev) => ({ ...prev, autoRotate: !prev.autoRotate }));
  }, []);

  const handleSetPaint = useCallback((paintId: PaintId) => {
    setVehicleState((prev) => ({ ...prev, paintId }));
  }, []);

  const handleSetStudioTheme = useCallback((studioTheme: StudioTheme) => {
    setVehicleState((prev) => ({ ...prev, studioTheme }));
  }, []);

  const handleSetLiveryStyle = useCallback((liveryStyle: LiveryStyle) => {
    setVehicleState((prev) => ({ ...prev, liveryStyle }));
  }, []);

  const handleApplyFleetSheet = useCallback((fleetSheet: FleetSheetData) => {
    setVehicleState((prev) => ({ ...prev, fleetSheet }));
  }, []);

  const handleExportSheet = useCallback(() => {
    const dataUrl = controllerRef.current?.exportFourViewSheet(vehicleState.fleetSheet);
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    const slug = (vehicleState.fleetSheet.bodyNumber || vehicleState.fleetSheet.plateNumber || 'innova')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    link.download = `panelco-iii-innova-four-view-${slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [vehicleState.fleetSheet]);

  const isDarkCanvas = vehicleState.studioTheme === 'night';

  return (
    <main
      className={`relative h-screen w-screen overflow-hidden select-none ${
        isDarkCanvas ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
      data-view-mode={vehicleState.viewMode}
      data-paint={vehicleState.paintId}
      data-theme={vehicleState.studioTheme}
      data-open-parts={String(areAnyPartsOpen(vehicleState.articulation))}
    >
      {/* Dedicated Isolated Full-Bleed WebGL Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {/* Graceful WebGL Context Loss Fallback */}
      {contextLost && (
        <div
          role="alert"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center text-white"
        >
          <PanelcoLogo className="mb-4 h-16 w-16" />
          <h2 className="text-lg font-bold">3D Graphics Context Interrupted</h2>
          <p className="mt-1 max-w-md text-sm text-slate-300">
            The WebGL viewport paused while graphics memory was reclaimed. Reload or switch back to resume interactive rendering.
          </p>
        </div>
      )}

      {/* Minimal Top-Left PANELCO III Brand Lockup & Tagline */}
      <header className="pointer-events-none fixed top-3 left-4 z-20 flex items-center gap-3">
        <PanelcoLogo className="h-12 w-12 drop-shadow-sm" />
        <div className="flex flex-col">
          <div className="flex items-baseline gap-2">
            <h1
              className={`text-base font-extrabold tracking-tight whitespace-nowrap sm:text-lg ${
                isDarkCanvas ? 'text-white' : 'text-slate-900'
              }`}
            >
              PANELCO III
            </h1>
            <span
              className={`hidden text-xs font-medium whitespace-nowrap sm:inline ${
                isDarkCanvas ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              · Toyota Innova 3D Four-View
            </span>
          </div>
          <p
            className={`font-script text-[15px] font-bold leading-tight whitespace-nowrap sm:text-base ${
              isDarkCanvas ? 'text-[#34d399]' : 'text-[#019240]'
            }`}
          >
            Your delight, our success.
          </p>
        </div>
      </header>

      {/* Subtle Interactive Hover Part Readout (3D Orbit Mode Only) */}
      {hoveredPart && vehicleState.viewMode !== 'four-view' && (
        <div
          className="pointer-events-none fixed top-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-slate-700/80 bg-slate-900/95 px-3 py-1 text-xs font-medium text-slate-100 whitespace-nowrap"
          aria-live="polite"
        >
          {PART_LABELS[hoveredPart]}
        </div>
      )}

      {/* Live Four-View Quadrant Framing & Labels */}
      <FourViewOverlay
        visible={vehicleState.viewMode === 'four-view'}
        studioTheme={vehicleState.studioTheme}
        fleetSheet={vehicleState.fleetSheet}
        dockCollapsed={dockCollapsed}
        onFocusView={handleFocusFromFourView}
      />

      {/* Unified Collapsible Bottom Control Dock */}
      <ControlDock
        state={vehicleState}
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
        onSetViewMode={handleSetViewMode}
        onTogglePart={handleTogglePart}
        onToggleAllParts={handleToggleAllParts}
        onToggleLight={handleToggleLight}
        onSetSteeringDeg={handleSetSteeringDeg}
        onToggleWheelSpin={handleToggleWheelSpin}
        onToggleAutoRotate={handleToggleAutoRotate}
        onSetPaint={handleSetPaint}
        onSetStudioTheme={handleSetStudioTheme}
        onSetLiveryStyle={handleSetLiveryStyle}
        onApplyFleetSheet={handleApplyFleetSheet}
        onExportSheet={handleExportSheet}
      />
    </main>
  );
}
