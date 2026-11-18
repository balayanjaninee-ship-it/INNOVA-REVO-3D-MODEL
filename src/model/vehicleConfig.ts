export type ViewMode =
  | 'orbit'
  | 'four-view'
  | 'right'
  | 'left'
  | 'front'
  | 'rear'
  | 'cabin';

export type StudioTheme = 'studio' | 'night' | 'sketch';

export type LiveryStyle = 'color' | 'monochrome' | 'hidden';

export type PaintId =
  | 'white-pearl'
  | 'alumina-bronze'
  | 'red-mica'
  | 'silver-metallic'
  | 'attitude-black';

export interface PaintFinish {
  id: PaintId;
  name: string;
  swatchHex: string;
  bodyColor: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  decalInk: 'dark' | 'light';
}

export interface ArticulationState {
  frontLeftDoor: boolean;
  frontRightDoor: boolean;
  rearLeftDoor: boolean;
  rearRightDoor: boolean;
  hood: boolean;
  tailgate: boolean;
}

export interface LightingState {
  headlights: boolean;
  hazards: boolean;
  cabinLight: boolean;
}

export interface FleetSheetData {
  driverName: string;
  dateTime: string;
  plateNumber: string;
  bodyNumber: string;
}

export interface FleetFormValidation {
  valid: boolean;
  errors: Partial<Record<keyof FleetSheetData, string>>;
}

export interface VehicleState {
  viewMode: ViewMode;
  paintId: PaintId;
  studioTheme: StudioTheme;
  liveryStyle: LiveryStyle;
  articulation: ArticulationState;
  lighting: LightingState;
  steeringDeg: number;
  wheelSpin: boolean;
  autoRotate: boolean;
  fleetSheet: FleetSheetData;
}

/** Official PANELCO III brand identity constants sampled directly from the attached logo */
export const PANELCO_BRAND = {
  name: 'PANELCO III',
  fullName: 'Pangasinan III Electric Cooperative, Inc.',
  tagline: 'Your delight, our success.',
  logoUrl: '/assets/aistudio/image_3e2aebef.png',
  greenHex: '#019240',
  greenDarkHex: '#017533',
  greenLightHex: '#34d399',
} as const;

/** Real-world Toyota Innova (AN140 Facelift) dimensions in meters */
export const INNOVA_DIMENSIONS = {
  length: 4.735,
  width: 1.83,
  height: 1.795,
  wheelbase: 2.75,
  frontAxleZ: 1.42,
  rearAxleZ: -1.33,
  trackHalfWidth: 0.785,
  wheelRadius: 0.345,
  tireWidth: 0.228,
  groundClearance: 0.20,
} as const;

export const PAINT_FINISHES: readonly PaintFinish[] = [
  {
    id: 'white-pearl',
    name: 'White Pearl CS',
    swatchHex: '#f1f3f5',
    bodyColor: 0xe6eaf0,
    metalness: 0.22,
    roughness: 0.20,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    decalInk: 'dark',
  },
  {
    id: 'alumina-bronze',
    name: 'Alumina Bronze',
    swatchHex: '#9a8f7e',
    bodyColor: 0x8f8371,
    metalness: 0.72,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    decalInk: 'dark',
  },
  {
    id: 'red-mica',
    name: 'Red Mica Metallic',
    swatchHex: '#9c141d',
    bodyColor: 0x8d0f1a,
    metalness: 0.68,
    roughness: 0.20,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    decalInk: 'light',
  },
  {
    id: 'silver-metallic',
    name: 'Silver Metallic',
    swatchHex: '#bfc5cc',
    bodyColor: 0xb7c0ca,
    metalness: 0.80,
    roughness: 0.20,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    decalInk: 'dark',
  },
  {
    id: 'attitude-black',
    name: 'Attitude Black',
    swatchHex: '#1b1f26',
    bodyColor: 0x11151c,
    metalness: 0.62,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.035,
    decalInk: 'light',
  },
] as const;

export const STEERING_LIMIT_DEG = 32;

export const DEFAULT_VEHICLE_STATE: VehicleState = {
  viewMode: 'orbit',
  paintId: 'white-pearl',
  studioTheme: 'studio',
  liveryStyle: 'color',
  articulation: {
    frontLeftDoor: false,
    frontRightDoor: false,
    rearLeftDoor: false,
    rearRightDoor: false,
    hood: false,
    tailgate: false,
  },
  lighting: {
    headlights: true,
    hazards: false,
    cabinLight: false,
  },
  steeringDeg: 0,
  wheelSpin: false,
  autoRotate: false,
  fleetSheet: {
    driverName: 'Juan Dela Cruz',
    dateTime: '2026-11-17 08:30 AM',
    plateNumber: 'SAA 3841',
    bodyNumber: 'P3-014',
  },
};

export interface CameraPreset {
  id: Exclude<ViewMode, 'four-view'>;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/**
 * Handedness note:
 * The Innova faces +Z (front bumper at +2.38m, rear at -2.35m).
 * Looking from behind (-Z toward +Z): +X is LEFT (driver side, LHD Philippines), -X is RIGHT.
 * Therefore:
 *  - Right Side View camera at (-X) sees front (+Z) pointing RIGHT (matches PANELCO III Four-View sketch).
 *  - Left Side View camera at (+X) sees front (+Z) pointing LEFT (matches PANELCO III Four-View sketch).
 */
export const CAMERA_PRESETS: Record<Exclude<ViewMode, 'four-view'>, CameraPreset> = {
  orbit: {
    id: 'orbit',
    label: '3D Orbit',
    position: [4.25, 1.62, 4.55],
    target: [0, 0.78, 0.14],
    fov: 36,
  },
  right: {
    id: 'right',
    label: 'Right Side',
    position: [-6.4, 0.96, 0],
    target: [0, 0.86, 0],
    fov: 34,
  },
  left: {
    id: 'left',
    label: 'Left Side',
    position: [6.4, 0.96, 0],
    target: [0, 0.86, 0],
    fov: 34,
  },
  front: {
    id: 'front',
    label: 'Front View',
    position: [0, 0.96, 5.75],
    target: [0, 0.66, 0.2],
    fov: 33,
  },
  rear: {
    id: 'rear',
    label: 'Rear View',
    position: [0, 0.98, -5.85],
    target: [0, 0.68, -0.15],
    fov: 33,
  },
  cabin: {
    id: 'cabin',
    label: 'Cabin',
    position: [2.15, 1.55, 1.65],
    target: [0.05, 1.02, 0.15],
    fov: 42,
  },
};

export type FourViewId = 'right' | 'left' | 'front' | 'rear';

export interface FourViewQuadrant {
  id: FourViewId;
  label: string;
  /** WebGL bottom-left scissor x in CSS pixels */
  x: number;
  /** WebGL bottom-left scissor y in CSS pixels */
  y: number;
  width: number;
  height: number;
  /** CSS top-left overlay positioning */
  cssLeft: number;
  cssTop: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  /** Vertical half-size of orthographic frustum in meters */
  orthoHalfHeight: number;
}

/**
 * Computes exact 2x2 non-overlapping scissor rects matching the PANELCO III
 * Four View Vehicle Sketch layout:
 *   Top-Left:     RIGHT SIDE VIEW  (nose points right)
 *   Top-Right:    LEFT SIDE VIEW   (nose points left)
 *   Bottom-Left:  FRONT VIEW
 *   Bottom-Right: REAR VIEW
 */
export function computeFourViewRects(
  canvasWidth: number,
  canvasHeight: number,
  topReservedPx = 0,
  bottomReservedPx = 0,
): FourViewQuadrant[] {
  const safeW = Math.max(2, Math.floor(canvasWidth));
  const safeH = Math.max(2, Math.floor(canvasHeight));
  const usableTop = Math.min(safeH - 2, Math.max(0, Math.floor(topReservedPx)));
  const usableBottom = Math.min(safeH - usableTop - 2, Math.max(0, Math.floor(bottomReservedPx)));
  const usableH = Math.max(2, safeH - usableTop - usableBottom);

  const leftW = Math.floor(safeW / 2);
  const rightW = safeW - leftW;
  const topH = Math.floor(usableH / 2);
  const bottomH = usableH - topH;

  // WebGL y = 0 is the bottom of the canvas
  const bottomRowY = usableBottom;
  const topRowY = usableBottom + bottomH;

  return [
    {
      id: 'right',
      label: 'RIGHT SIDE VIEW',
      x: 0,
      y: topRowY,
      width: leftW,
      height: topH,
      cssLeft: 0,
      cssTop: usableTop,
      cameraPosition: [-12, 0.92, 0],
      cameraTarget: [0, 0.92, 0],
      orthoHalfHeight: 1.55,
    },
    {
      id: 'left',
      label: 'LEFT SIDE VIEW',
      x: leftW,
      y: topRowY,
      width: rightW,
      height: topH,
      cssLeft: leftW,
      cssTop: usableTop,
      cameraPosition: [12, 0.92, 0],
      cameraTarget: [0, 0.92, 0],
      orthoHalfHeight: 1.55,
    },
    {
      id: 'front',
      label: 'FRONT VIEW',
      x: 0,
      y: bottomRowY,
      width: leftW,
      height: bottomH,
      cssLeft: 0,
      cssTop: usableTop + topH,
      cameraPosition: [0, 0.92, 12],
      cameraTarget: [0, 0.92, 0],
      orthoHalfHeight: 1.48,
    },
    {
      id: 'rear',
      label: 'REAR VIEW',
      x: leftW,
      y: bottomRowY,
      width: rightW,
      height: bottomH,
      cssLeft: leftW,
      cssTop: usableTop + topH,
      cameraPosition: [0, 0.92, -12],
      cameraTarget: [0, 0.92, 0],
      orthoHalfHeight: 1.48,
    },
  ];
}

export function getPaintFinish(paintId: PaintId): PaintFinish {
  return PAINT_FINISHES.find((p) => p.id === paintId) ?? PAINT_FINISHES[0];
}

/**
 * Resolves decal lettering/tagline color so branding stays crisp on every paint
 * and in monochrome Blueprint/Sketch mode.
 */
export function resolveDecalInkHex(
  paintId: PaintId,
  studioTheme: StudioTheme,
  liveryStyle: LiveryStyle,
): string {
  if (studioTheme === 'sketch' || liveryStyle === 'monochrome') {
    const finish = getPaintFinish(paintId);
    if (studioTheme === 'sketch') return '#111827';
    return finish.decalInk === 'light' ? '#f8fafc' : '#111827';
  }
  const finish = getPaintFinish(paintId);
  return finish.decalInk === 'light' ? '#f8fafc' : '#0f172a';
}

/**
 * Resolves the PANELCO III tagline color matching the exact logo green (#019240),
 * switching to bright emerald green on dark paints for legibility and monochrome ink in sketch/ink modes.
 */
export function resolveTaglineColorHex(
  paintId: PaintId,
  studioTheme: StudioTheme,
  liveryStyle: LiveryStyle,
): string {
  if (studioTheme === 'sketch' || liveryStyle === 'monochrome') {
    return resolveDecalInkHex(paintId, studioTheme, liveryStyle);
  }
  const finish = getPaintFinish(paintId);
  return finish.decalInk === 'light' ? PANELCO_BRAND.greenLightHex : PANELCO_BRAND.greenHex;
}

export function clampSteeringDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(-STEERING_LIMIT_DEG, Math.min(STEERING_LIMIT_DEG, Math.round(deg)));
}

export function areAnyPartsOpen(art: ArticulationState): boolean {
  return (
    art.frontLeftDoor ||
    art.frontRightDoor ||
    art.rearLeftDoor ||
    art.rearRightDoor ||
    art.hood ||
    art.tailgate
  );
}

export function setAllArticulation(open: boolean): ArticulationState {
  return {
    frontLeftDoor: open,
    frontRightDoor: open,
    rearLeftDoor: open,
    rearRightDoor: open,
    hood: open,
    tailgate: open,
  };
}

/** Frame-rate independent exponential damping step */
export function dampValue(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  const safeDt = Math.max(0, Math.min(dt, 0.1));
  const factor = 1 - Math.exp(-lambda * safeDt);
  const next = current + (target - current) * factor;
  return Math.abs(target - next) < 0.0005 ? target : next;
}

/**
 * Validates fleet vehicle sketch fields strictly without silently inventing values.
 */
export function validateFleetForm(data: FleetSheetData): FleetFormValidation {
  const errors: Partial<Record<keyof FleetSheetData, string>> = {};
  const driver = data.driverName.trim();
  const dateTime = data.dateTime.trim();
  const plate = data.plateNumber.trim();
  const body = data.bodyNumber.trim();

  if (driver.length < 2) {
    errors.driverName = 'Enter the designated driver name (min 2 characters).';
  }
  if (dateTime.length < 4) {
    errors.dateTime = 'Enter inspection date and time.';
  }
  if (!plate && !body) {
    errors.plateNumber = 'Enter a plate number or body number.';
  } else if (plate.length > 12) {
    errors.plateNumber = 'Plate number must be 12 characters or fewer.';
  }
  if (body.length > 12) {
    errors.bodyNumber = 'Body number must be 12 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/** Formats the primary badge displayed on the 3D Innova license plate */
export function formatPlateDisplay(sheet: FleetSheetData): string {
  const plate = sheet.plateNumber.trim().toUpperCase();
  if (plate) return plate;
  const body = sheet.bodyNumber.trim().toUpperCase();
  if (body) return body;
  return 'INNOVA';
}
