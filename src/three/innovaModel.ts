import * as THREE from 'three';
import {
  ArticulationState,
  getPaintFinish,
  INNOVA_DIMENSIONS,
  LightingState,
  LiveryStyle,
  PaintId,
  PANELCO_BRAND,
  resolveDecalInkHex,
  resolveTaglineColorHex,
  StudioTheme,
} from '../model/vehicleConfig';
import { ProceduralTextureBundle } from './textures';

export type InteractablePart =
  | 'frontLeftDoor'
  | 'frontRightDoor'
  | 'rearLeftDoor'
  | 'rearRightDoor'
  | 'hood'
  | 'tailgate'
  | 'headlights';

export interface InnovaRig {
  root: THREE.Group;
  interactables: THREE.Object3D[];
  applyPaintAndTheme: (
    paintId: PaintId,
    studioTheme: StudioTheme,
    liveryStyle: LiveryStyle,
  ) => void;
  applyLighting: (lighting: LightingState, hazardPulseOn: boolean) => void;
  setArticulationAngles: (angles: {
    frontLeftDoor: number;
    frontRightDoor: number;
    rearLeftDoor: number;
    rearRightDoor: number;
    hood: number;
    tailgate: number;
  }) => void;
  setWheelKinematics: (steeringRad: number, spinRad: number) => void;
  dispose: () => void;
}

/**
 * Rounded Organic Toyota Innova AN140 Front Corner Half-Width Profile vs Height Y.
 * Eliminates the tall flat vertical rectangle front silhouette: tucks smoothly inward at
 * the lower chin and tumbles organically inward toward the upper hood/headlight shoulder.
 */
function frontCornerWidthAtY(y: number): number {
  const t = Math.max(0, Math.min(1, (y - 0.22) / (0.96 - 0.22)));
  const lowerTuck = -Math.pow(Math.max(0, 0.26 - t) / 0.26, 2.0) * 0.072;
  const upperTumble = -Math.pow(Math.max(0, t - 0.56) / 0.44, 1.85) * 0.068;
  const midSwell = Math.sin(t * Math.PI) * 0.022;
  return 0.868 + midSwell + lowerTuck + upperTumble;
}

/**
 * Continuous Elliptic-Parabolic Front Nose Plan-View Curve.
 * Curves smoothly from the centerline emblem all the way around the bumper cheeks
 * into the front wheel arches (ZERO flat boxy wall and ZERO sudden corner bends).
 */
function noseWrapAt(uAbs: number): number {
  const c = Math.max(0, Math.min(1.06, uAbs));
  return 0.175 * c * c + 0.355 * Math.pow(c, 3.25);
}

/**
 * Unified Rounded Toyota Innova Front Fascia Z Surface.
 * Shared across front bumper, front fenders, grille, chrome U-surround, headlights,
 * recessed fog-lamp pockets, lower air dam, and clam-shell hood leading lip so every
 * front component seats flush with ZERO floating gaps or mismatched corners.
 */
function frontFasciaZ(x: number, y: number): number {
  const wY = frontCornerWidthAtY(y);
  const uAbs = Math.abs(x) / Math.max(0.5, wY);
  const wrap = noseWrapAt(uAbs);

  // Smooth rounded side-profile: aerodynamic chin tuck below, plump bumper nose around y=0.45,
  // sleek ~18-degree backward rake through grille & headlights rolling gently into the hood crown
  let yProfile = 0;
  if (y < 0.44) {
    const k = (0.44 - y) / 0.23;
    yProfile = 0.022 - 0.132 * Math.pow(k, 1.75);
  } else if (y <= 0.56) {
    const k = (y - 0.44) / 0.12;
    yProfile = 0.022 * Math.cos(k * Math.PI * 0.5);
  } else {
    const dy = y - 0.56;
    yProfile = -0.31 * dy - 0.18 * dy * dy;
  }

  return 2.385 - wrap + yProfile;
}

/**
 * Shared Side-Body Barrel Profile X Coordinate (world half-width).
 * Gives authentic double-curved stamped sheetmetal with subtle rocker tuck,
 * convex lower-mid belly, crisp upper beltline shoulder crease, and smooth tumblehome.
 */
function sideBarrelX(y: number, yBelt: number): number {
  const t = Math.max(0, Math.min(1, (y - 0.24) / Math.max(0.1, yBelt - 0.24)));
  const barrel = Math.sin(t * Math.PI) * 0.036;
  const lowerScallop = -Math.exp(-Math.pow((t - 0.22) / 0.095, 2)) * 0.013;
  const shoulderCrease = Math.exp(-Math.pow((t - 0.84) / 0.075, 2)) * 0.011;
  const topTumble = -Math.pow(Math.max(0, t - 0.70) / 0.30, 2.0) * 0.048;
  const sillTuck = -Math.pow(Math.max(0, 0.15 - t) / 0.15, 2.0) * 0.044;
  return 0.872 + barrel + lowerScallop + shoulderCrease + topTumble + sillTuck;
}

/** Exact curved hood Y coordinate in hood-pivot local coordinates (pivot at y=1.132, z=0.95) */
function hoodSurfacePoint(u: number, t: number): [number, number, number] {
  const uAbs = Math.abs(u);
  // Wide rounded clam-shell crown matching front fender shoulder smoothly
  const halfW = 0.802 - Math.pow(t, 2.0) * (0.802 - 0.722);
  const x = u * halfW;

  // Leading edge sweeps gracefully from center grille brow (0.882) up over swept headlights (0.946)
  const outsideT = Math.max(0, Math.min(1, (Math.abs(x) - 0.425) / (0.80 - 0.425)));
  const yBrow = 0.882 + Math.pow(outsideT, 0.92) * 0.062;
  const zFrontWorld = frontFasciaZ(x, yBrow) + 0.008;
  const zWorld = 0.95 + t * (zFrontWorld - 0.95);
  const zLocal = zWorld - 0.95;

  const targetFrontYLocal = yBrow - 1.132;
  // Soft rounded bullnose dome curving organically into the grille brow (eliminates flat boxy hood edge!)
  const archDome = Math.sin(t * Math.PI) * 0.032;
  const noseRollDown = -Math.pow(Math.max(0, (t - 0.82) / 0.18), 2.1) * 0.018;
  const baseDrop = t * targetFrontYLocal + archDome + noseRollDown;
  const crown = (1 - u * u) * 0.046 * (1 - t * 0.38);
  const creasePos = 0.66 - t * 0.14;
  const vCrease = Math.exp(-Math.pow((uAbs - creasePos) / 0.12, 2)) * 0.012 * (1 - t * 0.35);
  const sideRoll = -Math.pow(uAbs, 3.0) * 0.028 * (1 - t * 0.32);

  return [x, baseDrop + crown + vCrease + sideRoll, zLocal];
}

/** Exact curved windshield world point: u in [-1,1], t in [0=bottom, 1=top] */
function windshieldSurfacePoint(u: number, t: number): [number, number, number] {
  const z = 1.00 - t * 0.76;
  const y = 1.128 + t * 0.562 - u * u * 0.032 * t;
  const halfW = 0.765 - t * 0.148;
  const bow = (1 - u * u) * (0.058 - t * 0.012);
  return [u * halfW, y, z + bow];
}

/** Exact rear bumper world point: u in [-1,1], y in [0.27, 0.72] */
function rearBumperZ(uAbs: number, y: number): number {
  const curveIn = Math.pow(uAbs, 2.25) * 0.245;
  const lowerTuck = y < 0.38 ? ((0.38 - y) / 0.12) * 0.075 : 0;
  const upperStep = y > 0.65 ? ((y - 0.65) / 0.07) * 0.042 : 0;
  return -2.35 + curveIn + lowerTuck + upperStep;
}

/**
 * Builds a smooth lofted BufferGeometry from structured rings[r][p].
 * Winding convention:
 *   V = rings[r+1] - rings[r], U = rings[r][p+1] - rings[r][p]
 *   flipWinding = false -> front normal along (V x U)
 *   flipWinding = true  -> front normal along (U x V)
 */
function buildLoftedSurface(
  rings: Array<Array<[number, number, number]>>,
  flipWinding = false,
): THREE.BufferGeometry {
  const ringCount = rings.length;
  const ptsPerRing = rings[0].length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < ringCount; r++) {
    const v = r / Math.max(1, ringCount - 1);
    for (let p = 0; p < ptsPerRing; p++) {
      const [x, y, z] = rings[r][p];
      positions.push(x, y, z);
      uvs.push(p / Math.max(1, ptsPerRing - 1), v);
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    for (let p = 0; p < ptsPerRing - 1; p++) {
      const a = r * ptsPerRing + p;
      const b = a + 1;
      const c = (r + 1) * ptsPerRing + p;
      const d = c + 1;
      if (flipWinding) {
        indices.push(a, b, c, b, d, c);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Bakes physically-calibrated automotive ambient occlusion into a geometry's vertex colors.
 * Gives realistic studio crevice depth near the ground/rockers, wheel arches, under-chin,
 * and panel edges — works at ZERO runtime FPS cost even when software WebGL disables shadows.
 */
function applyAutomotiveBodyAO(
  geo: THREE.BufferGeometry,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);

  const fz = INNOVA_DIMENSIONS.frontAxleZ;
  const rz = INNOVA_DIMENSIONS.rearAxleZ;
  const wy = INNOVA_DIMENSIONS.wheelRadius;

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + offsetX;
    const wyP = pos.getY(i) + offsetY;
    const wz = pos.getZ(i) + offsetZ;
    const ny = norm ? norm.getY(i) : 0;

    // 1. Subtle ground-bounce & under-sill darkening (y < 0.48)
    let ao = 1.0;
    if (wyP < 0.50) {
      const lowFrac = Math.max(0, Math.min(1, (0.50 - wyP) / 0.30));
      ao *= 1.0 - lowFrac * 0.24;
    }

    // 2. Downward-facing underside shading
    if (ny < -0.15) {
      ao *= 1.0 - Math.min(1, (-ny - 0.15) / 0.85) * 0.22;
    }

    // 3. Soft ambient occlusion rim around front & rear wheel arches
    if (Math.abs(wx) > 0.68) {
      const dFront = Math.hypot(wz - fz, wyP - wy);
      const dRear = Math.hypot(wz - rz, wyP - wy);
      const dArch = Math.min(dFront, dRear);
      if (dArch < 0.455) {
        const archFrac = Math.max(0, Math.min(1, (0.455 - dArch) / 0.085));
        ao *= 1.0 - archFrac * 0.24;
      }
    }

    // 4. Gentle recessed darkening right around lower bumper corners & recessed pockets
    if (wz > 1.85 && wyP < 0.36) {
      ao *= 0.90;
    }

    const v = Math.max(0.62, Math.min(1.0, ao));
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = Math.min(1.0, v * 1.006); // Ultra-subtle cool shadow tint like real studio bounce
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

/** Helper ensuring non-AO body meshes still provide white vertex colors when sharing bodyPaintMat */
function fillWhiteVertexColors(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.attributes.color) {
    const count = geo.attributes.position.count;
    const arr = new Float32Array(count * 3);
    arr.fill(1.0);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  return geo;
}

/**
 * Smooth sculpted 3D side door outer skin lofted along -Z
 * (V = -Z, U = +Y -> VxU = +X left outward; flipWinding = sideSign < 0)
 */
function buildSideDoorSkinGeometry(
  zStart: number,
  zEnd: number,
  sideSign: 1 | -1,
  hasRearWheelCutout: boolean,
): THREE.BufferGeometry {
  const dzLen = zEnd - zStart;
  const stations = 14;
  const rings: Array<Array<[number, number, number]>> = [];

  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const zLocal = dzLen * t;
    const zWorld = zStart + zLocal;

    let yBottom = 0.272;
    if (hasRearWheelCutout) {
      const dzRear = zWorld - INNOVA_DIMENSIONS.rearAxleZ;
      const rClear = 0.404;
      if (dzRear < rClear) {
        const archY =
          INNOVA_DIMENSIONS.wheelRadius + Math.sqrt(Math.max(0, rClear * rClear - dzRear * dzRear));
        yBottom = Math.max(0.272, archY);
      }
    }

    const yBelt = 1.115 + ((0.94 - zWorld) / 2.17) * 0.045;
    const planTuck = -Math.pow(Math.max(0, (zWorld - 0.56) / 0.38), 2) * 0.011;

    const ys = [
      yBottom,
      yBottom + 0.055,
      Math.max(yBottom + 0.10, 0.42),
      Math.max(yBottom + 0.14, 0.54),
      0.70,
      0.86,
      0.985,
      yBelt - 0.04,
      yBelt,
      yBelt + 0.014,
    ];

    const ring: Array<[number, number, number]> = [];
    for (let k = 0; k < ys.length; k++) {
      const y = ys[k];
      let xWorld = sideBarrelX(y, yBelt) + planTuck;
      if (k === 0) xWorld -= 0.025;
      if (k === ys.length - 1) xWorld -= 0.045;
      ring.push([sideSign * (xWorld - 0.875), y, zLocal]);
    }
    rings.push(ring);
  }

  const geo = buildLoftedSurface(rings, sideSign < 0);
  return applyAutomotiveBodyAO(geo, sideSign * 0.875, 0, zStart);
}

/**
 * Polar-lofted double-curved 3D Front Fender around the circular front wheel arch.
 * Its leading edge matches frontCornerWidthAtY(y) and frontFasciaZ(x, y) EXACTLY so the
 * rounded front bumper flows continuously into the front fender with ZERO seam or dent!
 */
function buildSculptedFrontFenderGeometry(sideSign: 1 | -1): THREE.BufferGeometry {
  const zAxle = INNOVA_DIMENSIONS.frontAxleZ; // 1.42
  const yAxle = INNOVA_DIMENSIONS.wheelRadius; // 0.345
  const rArch = 0.402;
  const steps = 28;
  const rings: Array<Array<[number, number, number]>> = [];

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const theta = Math.PI + 0.18 - f * (Math.PI + 0.34);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const zArch = zAxle + rArch * cosT;
    const yArch = Math.max(0.245, yAxle + rArch * sinT);

    let zOut: number;
    let yOut: number;
    let xOutOverride: number | null = null;

    if (f < 0.28) {
      const u = f / 0.28;
      zOut = 0.94;
      yOut = 0.272 + u * (1.12 - 0.272);
    } else if (f < 0.72) {
      // Upper rounded fender shoulder curving down from cowl (z=0.94, y=1.12) to outer headlight corner
      const u = (f - 0.28) / 0.44;
      const yEnd = 0.942;
      const xEnd = frontCornerWidthAtY(yEnd);
      const zEnd = frontFasciaZ(xEnd, yEnd);
      zOut = 0.94 + u * (zEnd - 0.94);
      yOut = 1.12 - u * (1.12 - yEnd) - Math.sin(u * Math.PI) * -0.012;
    } else {
      // Exact shared leading seam with frontBumperMesh (ZERO corner crease or gap!)
      const u = (f - 0.72) / 0.28;
      yOut = 0.942 - u * (0.942 - 0.255);
      xOutOverride = frontCornerWidthAtY(yOut);
      zOut = frontFasciaZ(xOutOverride, yOut);
    }

    const row: Array<[number, number, number]> = [];
    const radStops = [0, 0.08, 0.36, 0.72, 1.0];
    for (let p = 0; p < radStops.length; p++) {
      const rp = radStops[p];
      const z = zArch + (zOut - zArch) * rp;
      const y = yArch + (yOut - yArch) * rp;

      const forwardFrac = Math.max(0, (z - 1.38) / 0.56);
      const planTaper = -Math.pow(forwardFrac, 2.0) * 0.036;
      const yBeltAtZ = 1.12 - Math.max(0, (z - 0.94) / 0.94) * 0.175;
      let xAbs = sideBarrelX(y, Math.max(0.84, yBeltAtZ)) + planTaper;

      if (xOutOverride !== null && rp > 0.35) {
        const blend = (rp - 0.35) / 0.65;
        xAbs = xAbs * (1 - blend) + xOutOverride * blend;
      }

      if (p === 0) {
        xAbs -= 0.052;
      } else if (p === 1) {
        xAbs += 0.014;
      } else if (p === 2) {
        xAbs += 0.008;
      } else if (p === 4 && f >= 0.28 && f < 0.72) {
        xAbs -= 0.052;
      }

      row.push([sideSign * xAbs, y, z]);
    }
    rings.push(row);
  }

  return applyAutomotiveBodyAO(buildLoftedSurface(rings, sideSign > 0));
}

/**
 * Polar-lofted double-curved 3D Rear Quarter Fender around the circular rear wheel arch.
 * Extends cleanly down to y=0.275 and wraps solidly into the rear bumper & taillight corner
 * so ZERO white gap or notch appears behind the rear wheels!
 */
function buildSculptedRearQuarterGeometry(sideSign: 1 | -1): THREE.BufferGeometry {
  const zAxle = INNOVA_DIMENSIONS.rearAxleZ; // -1.33
  const yAxle = INNOVA_DIMENSIONS.wheelRadius; // 0.345
  const rArch = 0.402;
  const steps = 28;
  const rings: Array<Array<[number, number, number]>> = [];

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    // Sweep cleanly around rear wheel arch from behind wheel (PI + 0.18) up to rear door vertical shutline (1.28 rad -> z=-1.215, y=0.730)
    const theta = Math.PI + 0.18 - f * (Math.PI + 0.18 - 1.28);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const zArch = zAxle + rArch * cosT;
    const yArch = Math.max(0.268, yAxle + rArch * sinT);

    let zOut: number;
    let yOut: number;
    if (f < 0.36) {
      // Rear trailing corner meeting curved rear bumper (y=0.28..0.70) & wraparound taillight (y=0.70..1.16)
      const u = f / 0.36;
      yOut = 0.278 + u * (1.158 - 0.278);
      if (yOut <= 0.70) {
        // Matches rearBumper outer wing smoothly (ZERO gap behind rear wheel!)
        zOut = rearBumperZ(0.95, yOut) + 0.015;
      } else {
        const ut = (yOut - 0.70) / (1.158 - 0.70);
        zOut = -2.235 - Math.sin(ut * Math.PI * 0.65) * 0.045;
      }
    } else if (f < 0.76) {
      const u = (f - 0.36) / 0.40;
      zOut = -2.255 + u * (-1.225 - -2.255);
      yOut = 1.158 + (1 - u) * 0.004;
    } else {
      const u = (f - 0.76) / 0.24;
      zOut = -1.225;
      yOut = 1.16 - u * (1.16 - 0.730);
    }

    const row: Array<[number, number, number]> = [];
    const radStops = [0, 0.08, 0.36, 0.72, 1.0];
    for (let p = 0; p < radStops.length; p++) {
      const rp = radStops[p];
      const z = zArch + (zOut - zArch) * rp;
      const y = yArch + (yOut - yArch) * rp;

      const rearTaper = -Math.pow(Math.max(0, (-1.62 - z) / 0.68), 2.0) * 0.058;
      let xAbs = sideBarrelX(y, 1.16) + rearTaper;

      if (p === 0) {
        xAbs -= 0.052;
      } else if (p === 1) {
        xAbs += 0.014;
      } else if (p === 2) {
        xAbs += 0.009;
      }

      row.push([sideSign * xAbs, y, z]);
    }
    rings.push(row);
  }

  return applyAutomotiveBodyAO(buildLoftedSurface(rings, sideSign > 0));
}

/**
 * Builds a body-conforming curved side-door vinyl decal mesh that hugs sideBarrelX
 * with a tight 0.0025m clearance (eliminates floating flat planes hovering off curved doors!).
 */
function buildConformingSideDecal(
  sideSign: 1 | -1,
  zHinge: number,
  zCenterLocal: number,
  yCenter: number,
  width: number,
  height: number,
): THREE.BufferGeometry {
  const cols = 10;
  const rows = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // 0 = bottom, 1 = top
    const y = yCenter - height * 0.5 + v * height;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols; // 0 = screen-left when viewing outward face, 1 = screen-right
      // Looking at +X (left) side from outside: screen-left is +Z, screen-right is -Z -> zLocal decreases with u
      // Looking at -X (right) side from outside: screen-left is -Z, screen-right is +Z -> zLocal increases with u
      // Thus U = -sideSign*Z, V = +Y -> U x V = +sideSign*X (strictly OUTWARD & non-mirrored!)
      const zLocal = zCenterLocal - sideSign * (u - 0.5) * width;
      const zWorld = zHinge + zLocal;
      const yBelt = 1.115 + ((0.94 - zWorld) / 2.17) * 0.045;
      const planTuck = -Math.pow(Math.max(0, (zWorld - 0.56) / 0.38), 2) * 0.011;
      const xWorld = sideBarrelX(y, yBelt) + planTuck + 0.0032;
      positions.push(sideSign * (xWorld - 0.875), y, zLocal);
      uvs.push(u, v);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = (r + 1) * (cols + 1) + c;
      const e = d + 1;
      // U goes right on outward face, V goes up -> (U x V) points OUTWARD (+X on left, -X on right)
      indices.push(a, b, e, a, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a hood-conforming curved decal mesh hugging the exact clam-shell hood crown
 * so "PANELCO III" wraps organically across the rounded hood with ZERO floating edges.
 */
function buildConformingHoodDecal(): THREE.BufferGeometry {
  const cols = 12;
  const rows = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // v=1 toward windshield (top of readable text), v=0 toward grille (bottom)
    const t = 0.80 - v * 0.24; // sits cleanly forward on the rounded hood
    for (let c = 0; c <= cols; c++) {
      const uTex = c / cols; // Looking from front (+Z) toward car: screen-left is -X, screen-right is +X
      const uHood = (uTex - 0.5) * 1.18;
      const [hx, hy, hz] = hoodSurfacePoint(uHood, t);
      positions.push(hx, hy + 0.0042, hz);
      uvs.push(uTex, v);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = (r + 1) * (cols + 1) + c;
      const e = d + 1;
      // U goes +X, V goes -Z -> (U x V) = +Y UPWARD & non-mirrored from front view!
      indices.push(a, b, e, a, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Authentic Toyota Innova 17" 10-Spoke (5 Split-Y Twin-Spoke) Two-Tone CNC-Machined Alloy Wheel
 * with deep vulcanized rubber tire, ventilated disc rotor, and brake caliper.
 */
function createWheelAssembly(
  sideSign: 1 | -1,
  isFront: boolean,
  materials: {
    tire: THREE.MeshStandardMaterial;
    alloyFace: THREE.MeshStandardMaterial;
    alloyDark: THREE.MeshStandardMaterial;
    chrome: THREE.MeshStandardMaterial;
    brakeDisc: THREE.MeshStandardMaterial;
    caliper: THREE.MeshStandardMaterial;
  },
  geometriesToDispose: THREE.BufferGeometry[],
): {
  knuckleGroup: THREE.Group;
  spinGroup: THREE.Group;
} {
  const { wheelRadius: R, tireWidth: W } = INNOVA_DIMENSIONS;
  const knuckleGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  knuckleGroup.add(spinGroup);

  const halfW = W / 2;
  const rimR = R * 0.665;

  // Rounded Michelin-profile pneumatic tire sidewall & shoulder tread
  const tirePts: THREE.Vector2[] = [
    new THREE.Vector2(rimR - 0.008, -halfW * 0.80),
    new THREE.Vector2(rimR + 0.026, -halfW * 0.98),
    new THREE.Vector2(rimR + 0.068, -halfW),
    new THREE.Vector2(R - 0.032, -halfW * 0.98),
    new THREE.Vector2(R - 0.008, -halfW * 0.82),
    new THREE.Vector2(R, -halfW * 0.48),
    new THREE.Vector2(R, halfW * 0.48),
    new THREE.Vector2(R - 0.008, halfW * 0.82),
    new THREE.Vector2(R - 0.032, halfW * 0.98),
    new THREE.Vector2(rimR + 0.068, halfW),
    new THREE.Vector2(rimR + 0.026, halfW * 0.98),
    new THREE.Vector2(rimR - 0.008, halfW * 0.80),
  ];
  const tireGeo = new THREE.LatheGeometry(tirePts, 40);
  tireGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(tireGeo);

  const tireMesh = new THREE.Mesh(tireGeo, materials.tire);
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  spinGroup.add(tireMesh);

  // Dark satin gunmetal alloy inner barrel
  const barrelGeo = new THREE.CylinderGeometry(rimR, rimR, W * 0.82, 36, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(barrelGeo);
  spinGroup.add(new THREE.Mesh(barrelGeo, materials.alloyDark));

  // CNC-machined bright outer rim lip flange seated flush inside tire bead
  const lipGeo = new THREE.TorusGeometry(rimR - 0.006, 0.013, 12, 40);
  lipGeo.rotateY(Math.PI / 2);
  geometriesToDispose.push(lipGeo);
  const lip = new THREE.Mesh(lipGeo, materials.alloyFace);
  lip.position.x = sideSign * (halfW * 0.72);
  spinGroup.add(lip);

  // Recessed inner spoke-well backing ring
  const innerRimStepGeo = new THREE.TorusGeometry(rimR * 0.85, 0.024, 8, 32);
  innerRimStepGeo.rotateY(Math.PI / 2);
  geometriesToDispose.push(innerRimStepGeo);
  const innerRimStep = new THREE.Mesh(innerRimStepGeo, materials.alloyDark);
  innerRimStep.position.x = sideSign * (halfW * 0.40);
  spinGroup.add(innerRimStep);

  // Elegant Tapered 10-Spoke (5 Split-Y) Two-Tone Innova Alloy Spokes reaching flush into rim barrel!
  const spokeLen = rimR - 0.042;
  const spokeShape = new THREE.Shape();
  spokeShape.moveTo(-0.012, 0);
  spokeShape.lineTo(0.012, 0);
  spokeShape.lineTo(0.0075, spokeLen);
  spokeShape.lineTo(-0.0075, spokeLen);
  spokeShape.closePath();

  const spokeFaceGeo = new THREE.ExtrudeGeometry(spokeShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.002,
    bevelSegments: 2,
  });
  spokeFaceGeo.rotateY(Math.PI / 2);
  geometriesToDispose.push(spokeFaceGeo);

  const spokeBackShape = new THREE.Shape();
  spokeBackShape.moveTo(-0.017, 0);
  spokeBackShape.lineTo(0.017, 0);
  spokeBackShape.lineTo(0.012, spokeLen);
  spokeBackShape.lineTo(-0.012, spokeLen);
  spokeBackShape.closePath();
  const spokeBackGeo = new THREE.ExtrudeGeometry(spokeBackShape, {
    depth: 0.020,
    bevelEnabled: false,
  });
  spokeBackGeo.rotateY(Math.PI / 2);
  geometriesToDispose.push(spokeBackGeo);

  for (let i = 0; i < 5; i++) {
    const baseAngle = (i / 5) * Math.PI * 2;
    for (const pairSign of [-1, 1] as const) {
      const a = baseAngle + pairSign * 0.19;
      const spokeHolder = new THREE.Group();
      spokeHolder.position.set(sideSign * (halfW * 0.58), 0, 0);
      spokeHolder.rotation.x = -a;

      const backBlade = new THREE.Mesh(spokeBackGeo, materials.alloyDark);
      backBlade.position.set(sideSign > 0 ? -0.014 : -0.006, 0.036, 0);
      backBlade.rotation.x = pairSign * 0.08;
      spokeHolder.add(backBlade);

      const frontBlade = new THREE.Mesh(spokeFaceGeo, materials.alloyFace);
      frontBlade.position.set(sideSign > 0 ? 0.004 : -0.016, 0.036, 0);
      frontBlade.rotation.x = pairSign * 0.08;
      spokeHolder.add(frontBlade);

      spinGroup.add(spokeHolder);
    }
  }

  // Sculpted Center Hub, Recessed Center Cap & 5 Chrome Acorn Lug Nuts
  const hubGeo = new THREE.CylinderGeometry(0.056, 0.064, 0.036, 24);
  hubGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(hubGeo);
  const hub = new THREE.Mesh(hubGeo, materials.alloyFace);
  hub.position.x = sideSign * (halfW * 0.60);
  spinGroup.add(hub);

  const capRingGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.042, 20);
  capRingGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(capRingGeo);
  const capRing = new THREE.Mesh(capRingGeo, materials.alloyDark);
  capRing.position.x = sideSign * (halfW * 0.62);
  spinGroup.add(capRing);

  const capBadgeGeo = new THREE.TorusGeometry(0.014, 0.0028, 8, 18);
  capBadgeGeo.rotateY(Math.PI / 2);
  capBadgeGeo.scale(1, 0.75, 1.15);
  geometriesToDispose.push(capBadgeGeo);
  const capBadge = new THREE.Mesh(capBadgeGeo, materials.chrome);
  capBadge.position.x = sideSign * (halfW * 0.735);
  spinGroup.add(capBadge);

  const lugGeo = new THREE.CylinderGeometry(0.0072, 0.0078, 0.020, 8);
  lugGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(lugGeo);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
    const lug = new THREE.Mesh(lugGeo, materials.chrome);
    lug.position.set(
      sideSign * (halfW * 0.68),
      Math.cos(a) * 0.041,
      Math.sin(a) * 0.041,
    );
    spinGroup.add(lug);
  }

  // Ventilated brushed-steel brake disc rotor, inner axle hub & stationary caliper
  const discGeo = new THREE.CylinderGeometry(rimR * 0.74, rimR * 0.74, 0.022, 28);
  discGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(discGeo);
  const disc = new THREE.Mesh(discGeo, materials.brakeDisc);
  disc.position.x = sideSign * 0.010;
  spinGroup.add(disc);

  const discHatGeo = new THREE.CylinderGeometry(rimR * 0.36, rimR * 0.38, 0.045, 20);
  discHatGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(discHatGeo);
  const discHat = new THREE.Mesh(discHatGeo, materials.alloyDark);
  discHat.position.x = sideSign * 0.015;
  spinGroup.add(discHat);

  // Inner knuckle & brake backing plate closing wheel hub solidly
  const backPlateGeo = new THREE.CylinderGeometry(rimR * 0.72, rimR * 0.72, 0.014, 24);
  backPlateGeo.rotateZ(Math.PI / 2);
  geometriesToDispose.push(backPlateGeo);
  const backPlate = new THREE.Mesh(backPlateGeo, materials.alloyDark);
  backPlate.position.x = sideSign * -0.022;
  knuckleGroup.add(backPlate);

  const caliperGeo = new THREE.BoxGeometry(0.048, 0.115, 0.068);
  geometriesToDispose.push(caliperGeo);
  const caliper = new THREE.Mesh(caliperGeo, materials.caliper);
  caliper.position.set(sideSign * 0.016, 0.025, isFront ? -rimR * 0.56 : rimR * 0.56);
  knuckleGroup.add(caliper);

  return { knuckleGroup, spinGroup };
}

/** 3D sculpted chrome Toyota triple-ellipse emblem */
function createToyotaEmblem(
  scale: number,
  chromeMat: THREE.MeshStandardMaterial,
  darkBackMat: THREE.MeshStandardMaterial,
  geometriesToDispose: THREE.BufferGeometry[],
): THREE.Group {
  const g = new THREE.Group();

  const outerGeo = new THREE.TorusGeometry(0.066 * scale, 0.009 * scale, 12, 32);
  outerGeo.scale(1.40, 0.94, 1);
  geometriesToDispose.push(outerGeo);
  g.add(new THREE.Mesh(outerGeo, chromeMat));

  const innerVertGeo = new THREE.TorusGeometry(0.044 * scale, 0.0072 * scale, 10, 24);
  innerVertGeo.scale(0.54, 1.28, 1);
  geometriesToDispose.push(innerVertGeo);
  g.add(new THREE.Mesh(innerVertGeo, chromeMat));

  const innerHorizGeo = new THREE.TorusGeometry(0.042 * scale, 0.0072 * scale, 10, 24);
  innerHorizGeo.scale(1.44, 0.44, 1);
  geometriesToDispose.push(innerHorizGeo);
  const innerHoriz = new THREE.Mesh(innerHorizGeo, chromeMat);
  innerHoriz.position.y = 0.017 * scale;
  g.add(innerHoriz);

  const backGeo = new THREE.CircleGeometry(0.064 * scale, 28);
  backGeo.scale(1.38, 0.92, 1);
  geometriesToDispose.push(backGeo);
  const back = new THREE.Mesh(backGeo, darkBackMat);
  back.position.z = -0.007 * scale;
  g.add(back);

  return g;
}

function tagInteractable(
  obj: THREE.Object3D,
  part: InteractablePart,
  interactables: THREE.Object3D[],
) {
  obj.userData.interactablePart = part;
  interactables.push(obj);
}

export function buildInnovaModel(
  textures: ProceduralTextureBundle,
  isSoftwareGl: boolean,
): InnovaRig {
  const root = new THREE.Group();
  root.name = 'ToyotaInnovaPanelcoIII';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const interactables: THREE.Object3D[] = [];
  const sketchEdgeLines: THREE.LineSegments[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // --- Photographic Automotive Showroom Clearcoat & Trim PBR Materials ---
  const bodyPaintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xe6eaf0,
      metalness: 0.22,
      roughness: 0.20,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.32,
      vertexColors: true,
    }),
  );

  const darkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x14181f,
      metalness: 0.10,
      roughness: 0.78,
      envMapIntensity: 0.55,
    }),
  );

  const grilleHoneycombMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x090b0f,
      metalness: 0.05,
      roughness: 0.96,
      bumpMap: textures.grilleMeshBump,
      bumpScale: 0.011,
      envMapIntensity: 0.18,
    }),
  );

  const glossBlackMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0d12,
      metalness: 0.22,
      roughness: 0.14,
      clearcoat: 0.95,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.30,
    }),
  );

  const grilleSlateMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x262d37,
      metalness: 0.58,
      roughness: 0.28,
      clearcoat: 0.55,
      envMapIntensity: 1.25,
    }),
  );

  const chromeMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xeef3f8,
      metalness: 0.98,
      roughness: 0.08,
      clearcoat: 0.7,
      envMapIntensity: 1.85,
    }),
  );

  // Realistic smoked laminated automotive privacy glass
  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b121b,
      metalness: 0.16,
      roughness: 0.03,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: isSoftwareGl ? 0.66 : 0.58,
      depthWrite: false,
      envMapIntensity: 2.15,
    }),
  );

  const clearLensMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xeaf2fa,
      metalness: 0.12,
      roughness: 0.03,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      envMapIntensity: 2.10,
    }),
  );

  // Deep vulcanized rubber tire material (no washed-out grey cartoon tires!)
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111317,
      metalness: 0.03,
      roughness: 0.90,
      bumpMap: textures.tireBump,
      bumpScale: 0.012,
      envMapIntensity: 0.32,
    }),
  );

  const alloyFaceMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xdce3ec,
      metalness: 0.94,
      roughness: 0.15,
      clearcoat: 0.6,
      envMapIntensity: 1.65,
    }),
  );

  const alloyDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d222b,
      metalness: 0.68,
      roughness: 0.38,
      envMapIntensity: 1.05,
    }),
  );

  const brakeDiscMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9aa4b0,
      metalness: 0.88,
      roughness: 0.32,
    }),
  );

  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c697a,
      metalness: 0.56,
      roughness: 0.38,
    }),
  );

  const interiorDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x191d24,
      metalness: 0.05,
      roughness: 0.86,
      envMapIntensity: 0.45,
    }),
  );

  const seatFabricMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2b2623,
      metalness: 0.02,
      roughness: 0.92,
      envMapIntensity: 0.35,
    }),
  );

  const woodAccentMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x4b3020,
      metalness: 0.1,
      roughness: 0.24,
      clearcoat: 0.75,
    }),
  );

  // Realistic optical glass LED projector material (dark optical crystal with crisp inner illumination, NOT flat cartoon white!)
  const headlightEmissiveMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x9ab0c8,
      emissive: 0xeef5ff,
      emissiveIntensity: 0.95,
      metalness: 0.25,
      roughness: 0.08,
      clearcoat: 1.0,
      envMapIntensity: 1.9,
    }),
  );

  const drlEmissiveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeef6ff,
      emissive: 0xeef6ff,
      emissiveIntensity: 1.5,
      roughness: 0.12,
    }),
  );

  const fogOpticMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x627386,
      emissive: 0xfff4dd,
      emissiveIntensity: 0.32,
      metalness: 0.35,
      roughness: 0.08,
      clearcoat: 1.0,
      envMapIntensity: 1.8,
    }),
  );

  // Deep automotive ruby-red LED tail lamp acrylic
  const tailLightMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x7e0a12,
      emissive: 0xb91c1c,
      emissiveIntensity: 0.55,
      roughness: 0.08,
      metalness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.75,
    }),
  );

  const reverseLightMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xdce4ee,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
      roughness: 0.10,
      metalness: 0.22,
      clearcoat: 0.95,
      envMapIntensity: 1.6,
    }),
  );

  // Smoked amber crystal turn-signal lens (never bright cartoon yellow!)
  const hazardMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x9a4b06,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.0,
      roughness: 0.14,
      metalness: 0.18,
      clearcoat: 0.9,
      envMapIntensity: 1.4,
    }),
  );

  const domeEmissiveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 0.0,
      roughness: 0.3,
    }),
  );

  const engineBlockMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.engineCover,
      roughness: 0.52,
      metalness: 0.22,
    }),
  );

  const plateMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.licensePlate,
      roughness: 0.30,
      metalness: 0.10,
    }),
  );

  const sketchEdgeMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.62,
    }),
  );

  // Body-conforming decal materials with polygonOffset (zero Z-fighting, zero floating!)
  const sealDecalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.sealColor,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.30,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  const taglineDecalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.taglineGreen,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.30,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  const hoodWordmarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.hoodWordmarkDark,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.34,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  const rearWordmarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.rearWordmarkDark,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.34,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  const innovaBadgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.innovaBadge,
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.22,
      metalness: 0.62,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  const decalMeshes: THREE.Mesh[] = [];

  const addSketchOutline = (mesh: THREE.Mesh, thresholdAngle = 22) => {
    const edgeGeo = trackGeo(new THREE.EdgesGeometry(mesh.geometry, thresholdAngle));
    const lines = new THREE.LineSegments(edgeGeo, sketchEdgeMat);
    lines.visible = false;
    mesh.add(lines);
    sketchEdgeLines.push(lines);
  };

  // =========================================================================
  // 1. UNDERBODY CHASSIS, SEALED WHEEL-WELL LINERS, AXLES & EXHAUST
  // =========================================================================
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  const floorPan = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.48, 0.095, 4.18)),
    darkTrimMat,
  );
  floorPan.position.set(0, 0.278, -0.02);
  floorPan.castShadow = true;
  floorPan.receiveShadow = true;
  chassisGroup.add(floorPan);

  // Dark inner body core tucked strictly inside chassis rails (seals underbody with ZERO bumper poke-through)
  const frontUnderSplash = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.84, 0.24, 0.36)),
    darkTrimMat,
  );
  frontUnderSplash.position.set(0, 0.38, 1.82);
  chassisGroup.add(frontUnderSplash);

  const rearUnderSplash = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.96, 0.24, 0.36)),
    darkTrimMat,
  );
  rearUnderSplash.position.set(0, 0.39, -1.78);
  chassisGroup.add(rearUnderSplash);

  for (const s of [-1, 1] as const) {
    // Sculpted painted rocker sill + lower black aero pinch-weld strip
    const rockerGeo = trackGeo(
      applyAutomotiveBodyAO(new THREE.BoxGeometry(0.145, 0.094, 2.04), s * 0.785, 0.258, 0.04),
    );
    const rockerSkirt = new THREE.Mesh(rockerGeo, bodyPaintMat);
    rockerSkirt.position.set(s * 0.785, 0.258, 0.04);
    rockerSkirt.castShadow = true;
    chassisGroup.add(rockerSkirt);

    const pinchStrip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.065, 0.028, 2.00)),
      darkTrimMat,
    );
    pinchStrip.position.set(s * 0.775, 0.206, 0.04);
    chassisGroup.add(pinchStrip);

    // Complete dark wheel-well arch liners + front/rear vertical mud-splash baffles (ZERO see-through wheel wells!)
    for (const axleZ of [INNOVA_DIMENSIONS.frontAxleZ, INNOVA_DIMENSIONS.rearAxleZ]) {
      const linerGeo = trackGeo(
        new THREE.CylinderGeometry(0.398, 0.398, 0.34, 28, 1, true, -0.18, Math.PI + 0.36),
      );
      linerGeo.rotateZ(Math.PI / 2);
      const liner = new THREE.Mesh(linerGeo, darkTrimMat);
      liner.position.set(s * 0.715, INNOVA_DIMENSIONS.wheelRadius, axleZ);
      chassisGroup.add(liner);

      const backWall = new THREE.Mesh(
        trackGeo(new THREE.CircleGeometry(0.40, 28, -0.18, Math.PI + 0.36)),
        darkTrimMat,
      );
      backWall.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      backWall.position.set(s * 0.555, INNOVA_DIMENSIONS.wheelRadius, axleZ);
      chassisGroup.add(backWall);
    }
  }

  // Front subframe axle + rear axle differential, underbody spare wheel, chrome exhaust tip
  const frontSubframe = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 1.38, 12)),
    darkTrimMat,
  );
  frontSubframe.rotation.z = Math.PI / 2;
  frontSubframe.position.set(0, 0.34, INNOVA_DIMENSIONS.frontAxleZ);
  chassisGroup.add(frontSubframe);

  const rearAxle = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 1.38, 12)),
    darkTrimMat,
  );
  rearAxle.rotation.z = Math.PI / 2;
  rearAxle.position.set(0, 0.34, INNOVA_DIMENSIONS.rearAxleZ);
  chassisGroup.add(rearAxle);

  const diffHousing = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.105, 14, 12)),
    darkTrimMat,
  );
  diffHousing.position.set(0, 0.34, INNOVA_DIMENSIONS.rearAxleZ);
  chassisGroup.add(diffHousing);

  const spareTire = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.275, 0.275, 0.16, 20)),
    tireMat,
  );
  spareTire.position.set(0, 0.31, -1.84);
  chassisGroup.add(spareTire);

  const exhaustTip = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.032, 0.034, 0.24, 16)),
    chromeMat,
  );
  exhaustTip.rotation.x = Math.PI / 2;
  exhaustTip.position.set(-0.54, 0.295, -2.18);
  chassisGroup.add(exhaustTip);

  // =========================================================================
  // 2. ROUNDED TOYOTA INNOVA AN140 FRONT FASCIA, SEAMLESS SCULPTED FENDERS,
  //    COMPACT TRAPEZOIDAL 5-BAR GRILLE, FLUSH WRAPAROUND LED HEADLIGHTS &
  //    BODY-CONFORMING RECESSED PENTAGONAL FOG-LAMP POCKETS
  // =========================================================================
  const frontClipGroup = new THREE.Group();
  root.add(frontClipGroup);

  // 2A. Polar-Lofted Front Fenders + Solid Inner Upper Fender Apron Deck (ZERO hood/cowl gap!)
  for (const s of [-1, 1] as const) {
    const fenderMesh = new THREE.Mesh(
      trackGeo(buildSculptedFrontFenderGeometry(s)),
      bodyPaintMat,
    );
    fenderMesh.castShadow = true;
    fenderMesh.receiveShadow = true;
    addSketchOutline(fenderMesh, 26);
    frontClipGroup.add(fenderMesh);

    // Solid painted upper fender shoulder bridge sealing seamlessly under the clam-shell hood edge & A-pillar base
    const shoulderRings: Array<Array<[number, number, number]>> = [];
    const yEndF = 0.942;
    const zEndF = frontFasciaZ(frontCornerWidthAtY(yEndF), yEndF);
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const z = 0.94 + u * (zEndF - 0.94);
      const yEdge = 1.12 - u * (1.12 - yEndF) + Math.sin(u * Math.PI) * 0.012;
      const forwardFrac = Math.max(0, (z - 1.38) / 0.56);
      const planTaper = -Math.pow(forwardFrac, 2.0) * 0.036;
      const xOuter = sideBarrelX(yEdge, Math.max(0.84, yEdge)) + planTaper - 0.038;
      const xInner = Math.max(0.42, xOuter - 0.26);
      shoulderRings.push([
        [s * xInner, yEdge - 0.020, z],
        [s * ((xInner + xOuter) * 0.5), yEdge + 0.008, z],
        [s * xOuter, yEdge - 0.002, z],
      ]);
    }
    const shoulderDeck = new THREE.Mesh(
      trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(shoulderRings, s < 0))),
      bodyPaintMat,
    );
    shoulderDeck.castShadow = true;
    shoulderDeck.receiveShadow = true;
    frontClipGroup.add(shoulderDeck);
  }

  // 2B. Smoothly Rounded Full-Width Front Bumper Apron & Cheeks (shares exact edge with Front Fenders!)
  const grilleHalfWidthAtY = (y: number) => {
    const t = Math.max(0, Math.min(1, (y - 0.505) / (0.855 - 0.505)));
    return 0.348 + t * (0.428 - 0.348);
  };

  const bumperRings: Array<Array<[number, number, number]>> = [];
  const bumperCols = 38;
  const bumperYs = [0.215, 0.255, 0.315, 0.39, 0.465, 0.535, 0.62, 0.71, 0.775, 0.84, 0.895, 0.942];
  for (let ci = 0; ci <= bumperCols; ci++) {
    const u = (ci / bumperCols) * 2 - 1;
    const uAbs = Math.abs(u);
    const colRing: Array<[number, number, number]> = [];
    for (let ri = 0; ri < bumperYs.length; ri++) {
      const y = bumperYs[ri];
      const wY = frontCornerWidthAtY(y);
      const x = u * wY;
      let z = frontFasciaZ(x, y);

      // Gentle smooth aerodynamic cheek character swell above/around fog pockets (damped inside fog recess)
      const fogMask =
        1 -
        Math.exp(-Math.pow((Math.abs(x) - 0.655) / 0.105, 2)) *
          Math.exp(-Math.pow((y - 0.495) / 0.135, 2));
      const cheekSwell =
        Math.exp(-Math.pow((uAbs - 0.74) / 0.18, 2)) *
        Math.exp(-Math.pow((y - 0.56) / 0.20, 2)) *
        0.011 *
        fogMask;

      // Smoothly recessed grille cavity (headlight housing sits flush on continuous bumper skin with ZERO underside notch!)
      const gHalf = grilleHalfWidthAtY(y) + 0.012;
      const inGrille = Math.abs(x) < gHalf && y >= 0.498 && y <= 0.872;

      const recess = inGrille ? -0.042 : 0;
      const underTray = ri === 0 ? -0.085 : 0;

      z += cheekSwell + recess + underTray;
      colRing.push([x, y, z]);
    }
    bumperRings.push(colRing);
  }
  const frontBumperMesh = new THREE.Mesh(
    trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(bumperRings, false))),
    bodyPaintMat,
  );
  frontBumperMesh.castShadow = true;
  frontBumperMesh.receiveShadow = true;
  addSketchOutline(frontBumperMesh, 24);
  frontClipGroup.add(frontBumperMesh);

  // Subtle lower black aero front splitter lip under outer lower corners
  const chinLipRings: Array<Array<[number, number, number]>> = [];
  for (let ci = 0; ci <= 22; ci++) {
    const u = (ci / 22) * 2 - 1;
    const x = u * frontCornerWidthAtY(0.245) * 0.96;
    const zLow = frontFasciaZ(x, 0.245);
    chinLipRings.push([
      [x * 0.95, 0.205, zLow - 0.065],
      [x, 0.232, zLow + 0.005],
      [x, 0.252, zLow + 0.002],
    ]);
  }
  frontClipGroup.add(new THREE.Mesh(trackGeo(buildLoftedSurface(chinLipRings, false)), darkTrimMat));

  // 2C. AUTHENTIC SLEEK ROUNDED INNOVA TRAPEZOIDAL 5-BAR GRILLE + SCULPTED CHROME U-RIBBON
  const grilleBackRings: Array<Array<[number, number, number]>> = [];
  for (let ci = 0; ci <= 16; ci++) {
    const u = (ci / 16) * 2 - 1;
    const col: Array<[number, number, number]> = [];
    for (let ri = 0; ri <= 6; ri++) {
      const y = 0.502 + (ri / 6) * (0.862 - 0.502);
      const x = u * (grilleHalfWidthAtY(y) + 0.006);
      col.push([x, y, frontFasciaZ(x, y) - 0.022]);
    }
    grilleBackRings.push(col);
  }
  frontClipGroup.add(
    new THREE.Mesh(trackGeo(buildLoftedSurface(grilleBackRings, false)), grilleHoneycombMat),
  );

  // 5 Sculpted Curved Dark-Slate Horizontal Slats hugging the rounded Innova nose contour
  const slatYs = [0.548, 0.610, 0.672, 0.734, 0.796];
  for (let i = 0; i < slatYs.length; i++) {
    const yC = slatYs[i];
    const hw = grilleHalfWidthAtY(yC) - 0.006;
    const slatRings: Array<Array<[number, number, number]>> = [];
    for (let k = 0; k <= 16; k++) {
      const x = ((k / 16) * 2 - 1) * hw;
      const zFace = frontFasciaZ(x, yC) + 0.011;
      slatRings.push([
        [x, yC - 0.012, zFace - 0.026],
        [x, yC - 0.010, zFace],
        [x, yC + 0.010, zFace + 0.002],
        [x, yC + 0.012, zFace - 0.026],
      ]);
    }
    frontClipGroup.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(slatRings, false)), grilleSlateMat),
    );

    // Subtle crisp machined chrome top-edge trim on the upper two grille slats
    if (i >= 3) {
      const accentPts: THREE.Vector3[] = [];
      for (let k = 0; k <= 14; k++) {
        const x = ((k / 14) * 2 - 1) * hw;
        accentPts.push(new THREE.Vector3(x, yC + 0.010, frontFasciaZ(x, yC) + 0.013));
      }
      frontClipGroup.add(
        new THREE.Mesh(
          trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(accentPts), 16, 0.0034, 6, false)),
          chromeMat,
        ),
      );
    }
  }

  // Sleek Flush Gloss-Black Upper Grille Brow tapering invisibly into the headlight tops (ZERO protruding horns!)
  const browRings: Array<Array<[number, number, number]>> = [];
  for (let ci = 0; ci <= 26; ci++) {
    const u = (ci / 26) * 2 - 1;
    const x = u * 0.78;
    const outsideT = Math.max(0, (Math.abs(x) - 0.425) / (0.78 - 0.425));
    const browH = 0.028 * (1 - outsideT * 0.74);
    const yTop = 0.876 + Math.pow(outsideT, 0.92) * 0.056;
    const yBot = yTop - browH;
    const zTop = frontFasciaZ(x, yTop) + 0.011 - outsideT * 0.007;
    const zBot = frontFasciaZ(x, yBot) + 0.013 - outsideT * 0.007;
    browRings.push([
      [x, yBot, zBot - 0.028],
      [x, yBot, zBot],
      [x, yTop, zTop],
      [x, yTop, zTop - 0.028],
    ]);
  }
  const upperBrowMesh = new THREE.Mesh(
    trackGeo(buildLoftedSurface(browRings, false)),
    glossBlackMat,
  );
  addSketchOutline(upperBrowMesh, 30);
  frontClipGroup.add(upperBrowMesh);

  // Signature Sculpted Chrome U-Surround Ribbon (sleek beveled metallic molding — NOT a bulky floating tube!)
  const chromeUControl: Array<[number, number]> = [
    [-0.785, 0.878],
    [-0.640, 0.822],
    [-0.495, 0.785],
    [-0.432, 0.768],
    [-0.410, 0.700],
    [-0.382, 0.605],
    [-0.355, 0.512],
    [-0.328, 0.500],
    [-0.165, 0.498],
    [0, 0.498],
    [0.165, 0.498],
    [0.328, 0.500],
    [0.355, 0.512],
    [0.382, 0.605],
    [0.410, 0.700],
    [0.432, 0.768],
    [0.495, 0.785],
    [0.640, 0.822],
    [0.785, 0.878],
  ];
  const chromeCurve2D = new THREE.CatmullRomCurve3(
    chromeUControl.map(([cx, cy]) => new THREE.Vector3(cx, cy, 0)),
    false,
    'catmullrom',
    0.25,
  );
  const chromeRibbonRings: Array<Array<[number, number, number]>> = [];
  const ribbonSamples = 56;
  for (let i = 0; i <= ribbonSamples; i++) {
    const frac = i / ribbonSamples;
    const pt = chromeCurve2D.getPoint(frac);
    const tan = chromeCurve2D.getTangent(frac);
    // Outward normal in XY plane pointing away from grille center
    const nx = tan.y;
    const ny = -tan.x;
    const tipFade = Math.min(1, Math.min(frac, 1 - frac) / 0.08);
    const halfThick = 0.0115 * (0.45 + 0.55 * tipFade);

    const xIn = pt.x - nx * halfThick;
    const yIn = pt.y - ny * halfThick;
    const xOut = pt.x + nx * halfThick;
    const yOut = pt.y + ny * halfThick;

    const zIn = frontFasciaZ(xIn, yIn);
    const zMid = frontFasciaZ(pt.x, pt.y);
    const zOut = frontFasciaZ(xOut, yOut);

    chromeRibbonRings.push([
      [xIn, yIn, zIn - 0.012],
      [xIn, yIn, zIn + 0.012],
      [pt.x, pt.y, zMid + 0.018],
      [xOut, yOut, zOut + 0.012],
      [xOut, yOut, zOut - 0.012],
    ]);
  }
  frontClipGroup.add(
    new THREE.Mesh(trackGeo(buildLoftedSurface(chromeRibbonRings, true)), chromeMat),
  );

  // Sculpted 3D Chrome Toyota Triple-Ellipse Emblem recessed cleanly into the upper slats
  const frontEmblem = createToyotaEmblem(0.84, chromeMat, glossBlackMat, geometries);
  frontEmblem.position.set(0, 0.742, frontFasciaZ(0, 0.742) + 0.022);
  frontEmblem.rotation.x = -0.26;
  frontClipGroup.add(frontEmblem);

  // 2D. REAL INNOVA SLEEK MATTE-BLACK TRAPEZOIDAL LOWER AIR DAM + PAINTED LOWER CHIN LIP + PLATE
  const lowerDamRings: Array<Array<[number, number, number]>> = [];
  for (let ci = 0; ci <= 20; ci++) {
    const u = (ci / 20) * 2 - 1;
    const col: Array<[number, number, number]> = [];
    for (let ri = 0; ri <= 4; ri++) {
      const t = ri / 4; // 0 = bottom (y=0.258), 1 = top (y=0.468)
      const y = 0.258 + t * (0.468 - 0.258);
      const hw = 0.555 - t * (0.555 - 0.362);
      const x = u * hw;
      col.push([x, y, frontFasciaZ(x, y) + 0.008]);
    }
    lowerDamRings.push(col);
  }
  const lowerDamMesh = new THREE.Mesh(
    trackGeo(buildLoftedSurface(lowerDamRings, false)),
    darkTrimMat,
  );
  addSketchOutline(lowerDamMesh, 28);
  frontClipGroup.add(lowerDamMesh);

  // Signature Real Innova Body-Colored Lower Center Chin Spoiler Lip under the license plate!
  const centerChinRings: Array<Array<[number, number, number]>> = [];
  for (let ci = 0; ci <= 14; ci++) {
    const u = (ci / 14) * 2 - 1;
    const col: Array<[number, number, number]> = [];
    for (let ri = 0; ri <= 3; ri++) {
      const t = ri / 3;
      const y = 0.232 + t * 0.068;
      const hw = 0.39 - t * 0.07;
      const x = u * hw;
      col.push([x, y, frontFasciaZ(x, y) + 0.013]);
    }
    centerChinRings.push(col);
  }
  const centerChinLip = new THREE.Mesh(
    trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(centerChinRings, false))),
    bodyPaintMat,
  );
  frontClipGroup.add(centerChinLip);

  // Subtle horizontal cooling louvers inside lower air dam
  for (const ly of [0.318, 0.348]) {
    const t = (ly - 0.258) / (0.468 - 0.258);
    const hw = 0.52 - t * 0.16;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const x = ((k / 12) * 2 - 1) * hw;
      pts.push(new THREE.Vector3(x, ly, frontFasciaZ(x, ly) + 0.014));
    }
    frontClipGroup.add(
      new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.005, 6, false)),
        grilleSlateMat,
      ),
    );
  }

  // Front License Plate Plinth seated flush on the curved upper black lower-bumper bridge
  const plateZCenter = frontFasciaZ(0, 0.402);
  const frontPlatePlinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.40, 0.148, 0.036)),
    glossBlackMat,
  );
  frontPlatePlinth.position.set(0, 0.402, plateZCenter + 0.006);
  frontPlatePlinth.rotation.x = 0.03;
  frontClipGroup.add(frontPlatePlinth);

  const frontPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.376, 0.134, 0.010)),
    plateMat,
  );
  frontPlate.position.set(0, 0.402, plateZCenter + 0.024);
  frontPlate.rotation.x = 0.03;
  frontClipGroup.add(frontPlate);

  // 2E. WRAPAROUND SMOKED DUAL-PROJECTOR LED HEADLIGHTS & BODY-CONFORMING RECESSED FOG POCKETS
  const headlightBeams: THREE.Mesh[] = [];
  for (const s of [-1, 1] as const) {
    const hlGroup = new THREE.Group();
    frontClipGroup.add(hlGroup);

    // Swept wraparound smoked headlight bucket + flush curved outer polycarbonate cover
    const hlSteps = 16;
    const hlBackRings: Array<Array<[number, number, number]>> = [];
    const hlLensRings: Array<Array<[number, number, number]>> = [];

    for (let i = 0; i <= hlSteps; i++) {
      const t = i / hlSteps; // 0 = inner grille edge, 1 = outer fender wraparound tip
      const xAbs = 0.425 + t * (0.832 - 0.425);
      const x = s * xAbs;

      const yBot = 0.776 + Math.pow(t, 1.12) * 0.118;
      const yTop = 0.876 + Math.pow(t, 0.92) * 0.062;
      const zMid = frontFasciaZ(x, (yBot + yTop) * 0.5);

      // Taper smoothly to a razor-clean wraparound corner tucked flush into the fender surface
      const tipPinch = t > 0.72 ? Math.pow((t - 0.72) / 0.28, 1.35) * 0.034 : 0;
      const yb = yBot + tipPinch * 0.62;
      const yt = yTop - tipPinch * 0.38;
      const tipTuck = t > 0.72 ? ((t - 0.72) / 0.28) * 0.012 : 0;

      // Dark smoked interior reflector bucket anchored solidly back inside the recessed bumper pocket
      hlBackRings.push([
        [x, yb, zMid - 0.028],
        [x, yb, zMid - 0.002 - tipTuck],
        [x, (yb + yt) * 0.5, zMid + 0.005 - tipTuck],
        [x, yt, zMid - 0.002 - tipTuck],
        [x, yt, zMid - 0.028],
      ]);

      // Flush curved polycarbonate outer clear cover sitting cleanly at body contour (+0.016m)
      hlLensRings.push([
        [x, yb, zMid + 0.004 - tipTuck],
        [x, (yb + yt) * 0.5, zMid + 0.017 - tipTuck],
        [x, yt, zMid + 0.004 - tipTuck],
      ]);
    }

    const hlBucket = new THREE.Mesh(
      trackGeo(buildLoftedSurface(hlBackRings, s < 0)),
      glossBlackMat,
    );
    tagInteractable(hlBucket, 'headlights', interactables);
    hlGroup.add(hlBucket);

    // Precision chrome internal reflector divider bar
    const innerTrimPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = 0.05 + (k / 10) * 0.74;
      const x = s * (0.425 + t * (0.832 - 0.425));
      const y = 0.794 + Math.pow(t, 1.12) * 0.098;
      innerTrimPts.push(new THREE.Vector3(x, y, frontFasciaZ(x, y) + 0.009));
    }
    hlGroup.add(
      new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(innerTrimPts), 16, 0.0042, 6, false)),
        chromeMat,
      ),
    );

    // Dual Realistic Smoked-Glass LED Projector Optics inside Chrome Shrouds (NOT cartoon white balls!)
    const projectorTStops = [
      { t: 0.24, r: 0.024 },
      { t: 0.54, r: 0.028 },
    ];
    for (const { t, r } of projectorTStops) {
      const xAbs = 0.425 + t * (0.832 - 0.425);
      const x = s * xAbs;
      const y = 0.830 + t * 0.068;
      const z = frontFasciaZ(x, y) + 0.007;
      // Tangent yaw matching nose curve precisely
      const dzdx = (frontFasciaZ(xAbs + 0.03, y) - frontFasciaZ(xAbs - 0.03, y)) / 0.06;
      const yaw = s * Math.atan(dzdx);

      const chromeShroud = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(r, 0.0056, 10, 24)),
        chromeMat,
      );
      chromeShroud.position.set(x, y, z);
      chromeShroud.rotation.y = yaw;
      hlGroup.add(chromeShroud);

      const ledLens = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(r * 0.74, 16, 12)),
        headlightEmissiveMat,
      );
      ledLens.scale.set(1, 1, 0.55);
      ledLens.position.set(x, y, z + 0.001);
      ledLens.rotation.y = yaw;
      hlGroup.add(ledLens);
    }

    // Razor-thin LED Daytime Running Lightguide along lower headlamp contour
    const drlPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = 0.06 + (k / 10) * 0.74;
      const x = s * (0.425 + t * (0.832 - 0.425));
      const y = 0.798 + Math.pow(t, 1.12) * 0.098 + (k === 10 ? 0.012 : 0);
      drlPts.push(new THREE.Vector3(x, y, frontFasciaZ(x, y) + 0.012));
    }
    hlGroup.add(
      new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(drlPts), 16, 0.0036, 6, false)),
        drlEmissiveMat,
      ),
    );

    // Smoked Corner Amber Turn-Signal Crystal tucked cleanly inside the swept headlight pocket
    const turnT = 0.80;
    const txAbs = 0.425 + turnT * (0.832 - 0.425);
    const tx = s * txAbs;
    const ty = 0.896;
    const tz = frontFasciaZ(tx, ty) + 0.005;
    const dzdxTurn = (frontFasciaZ(txAbs + 0.03, ty) - frontFasciaZ(txAbs - 0.03, ty)) / 0.06;
    const frontTurn = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.056, 0.016, 0.014)),
      hazardMat,
    );
    frontTurn.position.set(tx, ty, tz);
    frontTurn.rotation.y = s * Math.atan(dzdxTurn);
    frontTurn.rotation.z = s * 0.14;
    hlGroup.add(frontTurn);

    // Flush Curved Clear Polycarbonate Outer Lens
    const hlLens = new THREE.Mesh(
      trackGeo(buildLoftedSurface(hlLensRings, s < 0)),
      clearLensMat,
    );
    hlLens.renderOrder = 3;
    hlGroup.add(hlLens);

    // Volumetric Headlight Beam (strictly Night Studio mode only)
    const beamGeo = trackGeo(new THREE.ConeGeometry(0.46, 3.0, 20, 1, true));
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 1.5);
    const beamMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfff8dc,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(s * 0.62, 0.85, 2.15);
    beam.rotation.x = 0.08;
    beam.visible = false;
    hlGroup.add(beam);
    headlightBeams.push(beam);

    // BODY-CONFORMING RECESSED PENTAGONAL INNOVA FOG-LAMP HOUSING (proud, crisp matte/gloss black bezel!)
    // Sampled directly on frontFasciaZ across a fine grid so every corner hugs the rounded bumper cheek cleanly!
    const fogCenterAbsX = 0.650;
    const fogCenterY = 0.502;
    const fogBezelRings: Array<Array<[number, number, number]>> = [];
    const fogRows = 8;
    const fogCols = 8;
    for (let ci = 0; ci <= fogCols; ci++) {
      const fu = ci / fogCols; // 0 = inner edge, 1 = outer edge
      const col: Array<[number, number, number]> = [];
      for (let ri = 0; ri <= fogRows; ri++) {
        const fv = ri / fogRows; // 0 = bottom, 1 = top
        // Iconic Innova pentagonal fog-lamp bezel: broad flat top, tapered inner-bottom chin
        const yBotAtU = fogCenterY - 0.112 + (1 - fu) * 0.046;
        const yTopAtU = fogCenterY + 0.098 + fu * 0.022;
        const y = yBotAtU + fv * (yTopAtU - yBotAtU);
        const halfWAtV = 0.082 * (0.50 + 0.50 * Math.pow(fv, 0.65));
        const xAbs = fogCenterAbsX + (fu * 2 - 1) * halfWAtV;
        const x = s * xAbs;

        // Raised perimeter trim lip (+0.015m) sloping cleanly into a recessed dark pocket (+0.008m) above bumper skin
        const edgeDist = Math.min(fu, 1 - fu, fv, 1 - fv);
        const cupOffset =
          edgeDist < 0.14
            ? 0.006 + (edgeDist / 0.14) * 0.012
            : 0.018 - Math.min(1, (edgeDist - 0.14) / 0.30) * 0.008;
        col.push([x, y, frontFasciaZ(x, y) + cupOffset]);
      }
      fogBezelRings.push(col);
    }
    frontClipGroup.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(fogBezelRings, s < 0)), glossBlackMat),
    );

    // Recessed circular dark-glass fog optic & subtle smoked-amber indicator tucked inside curved black pentagon
    const fogOptX = s * (fogCenterAbsX + 0.008);
    const fogOptY = fogCenterY + 0.030;
    const fogOptZ = frontFasciaZ(fogOptX, fogOptY) + 0.016;
    const dzdxFog =
      (frontFasciaZ(fogCenterAbsX + 0.04, fogOptY) - frontFasciaZ(fogCenterAbsX - 0.04, fogOptY)) /
      0.08;
    const fogYaw = s * Math.atan(dzdxFog);

    const fogChromeRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.027, 0.0046, 10, 22)),
      chromeMat,
    );
    fogChromeRing.position.set(fogOptX, fogOptY, fogOptZ + 0.003);
    fogChromeRing.rotation.y = fogYaw;
    frontClipGroup.add(fogChromeRing);

    const fogLens = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.024, 14, 12)),
      fogOpticMat,
    );
    fogLens.scale.set(1, 1, 0.48);
    fogLens.position.set(fogOptX, fogOptY, fogOptZ + 0.001);
    fogLens.rotation.y = fogYaw;
    frontClipGroup.add(fogLens);

    const fogTurnX = s * (fogCenterAbsX + 0.008);
    const fogTurnY = fogCenterY - 0.042;
    const fogTurnZ = frontFasciaZ(fogTurnX, fogTurnY) + 0.014;
    const fogTurnLens = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.036, 0.030, 0.012)),
      hazardMat,
    );
    fogTurnLens.position.set(fogTurnX, fogTurnY, fogTurnZ);
    fogTurnLens.rotation.y = fogYaw;
    frontClipGroup.add(fogTurnLens);
  }

  // =========================================================================
  // 3. ARTICULATED ROUNDED CLAM-SHELL HOOD + CONFORMING DECAL + 2.8L D-4D ENGINE
  // =========================================================================
  const engineBayGroup = new THREE.Group();
  root.add(engineBayGroup);

  const engineWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.36, 0.50, 1.02)),
    darkTrimMat,
  );
  engineWall.position.set(0, 0.56, 1.54);
  engineBayGroup.add(engineWall);

  const engineBlock = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.64, 0.22, 0.72)),
    engineBlockMat,
  );
  engineBlock.position.set(0, 0.84, 1.54);
  engineBayGroup.add(engineBlock);

  const batteryBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.22, 0.18, 0.24)),
    glossBlackMat,
  );
  batteryBox.position.set(0.42, 0.75, 1.64);
  engineBayGroup.add(batteryBox);

  const radiatorBar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.86, 0.055, 0.08)),
    alloyDarkMat,
  );
  radiatorBar.position.set(0, 0.76, 1.94);
  engineBayGroup.add(radiatorBar);

  // Articulated Hood Pivot at cowl (z = 0.95, y = 1.132)
  const hoodPivot = new THREE.Group();
  hoodPivot.position.set(0, 1.132, 0.95);
  root.add(hoodPivot);

  const hoodRings: Array<Array<[number, number, number]>> = [];
  const hoodZSteps = 16;
  const hoodXSteps = 20;
  for (let zi = 0; zi <= hoodZSteps; zi++) {
    const t = zi / hoodZSteps;
    const ring: Array<[number, number, number]> = [];
    for (let xi = 0; xi <= hoodXSteps; xi++) {
      const u = (xi / hoodXSteps) * 2 - 1;
      ring.push(hoodSurfacePoint(u, t));
    }
    hoodRings.push(ring);
  }
  const hoodMesh = new THREE.Mesh(
    trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(hoodRings, false), 0, 1.132, 0.95)),
    bodyPaintMat,
  );
  hoodMesh.castShadow = true;
  hoodMesh.receiveShadow = true;
  addSketchOutline(hoodMesh, 25);
  tagInteractable(hoodMesh, 'hood', interactables);
  hoodPivot.add(hoodMesh);

  const hoodUnder = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.84, 0.016, 0.74)),
    darkTrimMat,
  );
  hoodUnder.position.set(0, -0.145, 0.48);
  hoodUnder.rotation.x = 0.21;
  hoodPivot.add(hoodUnder);

  // Body-Conforming Curved PANELCO III Hood Wordmark (ZERO floating edges!)
  const hoodDecal = new THREE.Mesh(trackGeo(buildConformingHoodDecal()), hoodWordmarkMat);
  hoodDecal.renderOrder = 3;
  hoodPivot.add(hoodDecal);
  decalMeshes.push(hoodDecal);

  // =========================================================================
  // 4. GREENHOUSE: CURVED WINDSHIELD, SCULPTED SHEETMETAL A-PILLARS (NO TUBES!),
  //    FLUSH B/C/D-PILLARS, INTEGRATED ROOF SPOILER & BODY-CONFORMING TAILLIGHTS
  // =========================================================================
  const greenhouseGroup = new THREE.Group();
  root.add(greenhouseGroup);

  // Sculpted Crowned Roof Panel (V=-Z, U=+X -> UxV = +Y UPWARD, flipWinding=true)
  const roofRings: Array<Array<[number, number, number]>> = [];
  const roofZStations: Array<[number, number, number]> = [
    [0.24, 1.702, 0.618],
    [-0.18, 1.748, 0.634],
    [-0.78, 1.758, 0.634],
    [-1.42, 1.742, 0.620],
    [-2.04, 1.692, 0.594],
  ];
  for (const [z, yPeak, halfW] of roofZStations) {
    const ring: Array<[number, number, number]> = [];
    for (let xi = 0; xi <= 12; xi++) {
      const u = (xi / 12) * 2 - 1;
      ring.push([u * halfW, yPeak - Math.pow(u, 2) * 0.044, z]);
    }
    roofRings.push(ring);
  }
  const roofMesh = new THREE.Mesh(
    trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(roofRings, true))),
    bodyPaintMat,
  );
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  addSketchOutline(roofMesh, 26);
  greenhouseGroup.add(roofMesh);

  // Subtle dark roof drip-molding channels seated flush in roof seam
  for (const s of [-1, 1] as const) {
    const dripCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.568, 1.664, 0.24),
      new THREE.Vector3(s * 0.584, 1.716, -0.78),
      new THREE.Vector3(s * 0.552, 1.658, -2.02),
    ]);
    greenhouseGroup.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(dripCurve, 16, 0.007, 6, false)), darkTrimMat),
    );
  }

  // Interior headliner neatly tucked inside the roof dome (never pokes through windshield corners!)
  const headlinerMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbc7be, roughness: 0.94 }),
  );
  const headliner = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.06, 0.025, 2.12)),
    headlinerMat,
  );
  headliner.position.set(0, 1.668, -0.89);
  greenhouseGroup.add(headliner);

  const domeLens = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.16, 0.018, 0.095)),
    domeEmissiveMat,
  );
  domeLens.position.set(0, 1.652, -0.15);
  greenhouseGroup.add(domeLens);

  // Aerodynamic Shark-Fin Roof Antenna rooted flush into roof crown
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.088, 0);
  finShape.lineTo(0.088, 0);
  finShape.quadraticCurveTo(0.035, 0.070, -0.056, 0.072);
  finShape.lineTo(-0.088, 0);
  const finGeo = trackGeo(
    fillWhiteVertexColors(
      new THREE.ExtrudeGeometry(finShape, {
        depth: 0.02,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.006,
        bevelSegments: 2,
      }),
    ),
  );
  finGeo.rotateY(-Math.PI / 2);
  const sharkFin = new THREE.Mesh(finGeo, bodyPaintMat);
  sharkFin.position.set(0.01, 1.716, -1.70);
  greenhouseGroup.add(sharkFin);

  // Integrated Aerodynamic Rear Roof Spoiler anchored solidly to trailing roof edge & D-pillars (ZERO floating gap!)
  const spoilerRings: Array<Array<[number, number, number]>> = [];
  for (let ci = 0; ci <= 14; ci++) {
    const u = (ci / 14) * 2 - 1;
    const x = u * 0.598;
    const bow = (1 - u * u) * -0.028;
    const drop = Math.pow(u, 2) * -0.044;
    spoilerRings.push([
      [x, 1.654 + drop, -1.96 + bow],
      [x, 1.694 + drop, -1.98 + bow],
      [x, 1.696 + drop, -2.205 + bow],
      [x, 1.652 + drop, -2.215 + bow],
      [x, 1.646 + drop, -2.06 + bow],
    ]);
  }
  const spoilerMesh = new THREE.Mesh(
    trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(spoilerRings, true))),
    bodyPaintMat,
  );
  spoilerMesh.castShadow = true;
  greenhouseGroup.add(spoilerMesh);

  const highStopLamp = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, 0.020, 0.018)),
    tailLightMat,
  );
  highStopLamp.position.set(0, 1.676, -2.238);
  greenhouseGroup.add(highStopLamp);

  // Curved Raked Panoramic Windshield
  const wsRings: Array<Array<[number, number, number]>> = [];
  for (let r = 0; r <= 8; r++) {
    const t = r / 8;
    const ring: Array<[number, number, number]> = [];
    for (let c = 0; c <= 12; c++) {
      const u = (c / 12) * 2 - 1;
      ring.push(windshieldSurfacePoint(u, t));
    }
    wsRings.push(ring);
  }
  const windshield = new THREE.Mesh(trackGeo(buildLoftedSurface(wsRings, true)), glassMat);
  windshield.renderOrder = 2;
  greenhouseGroup.add(windshield);

  // Curved Top Windshield Ceramic Frit Header flush along curved glass top
  const wsFritRings: Array<Array<[number, number, number]>> = [];
  for (let r = 0; r <= 2; r++) {
    const t = 0.92 + (r / 2) * 0.08;
    const ring: Array<[number, number, number]> = [];
    for (let c = 0; c <= 12; c++) {
      const u = (c / 12) * 2 - 1;
      const [wx, wy, wz] = windshieldSurfacePoint(u, t);
      ring.push([wx, wy, wz + 0.003]);
    }
    wsFritRings.push(ring);
  }
  greenhouseGroup.add(
    new THREE.Mesh(trackGeo(buildLoftedSurface(wsFritRings, true)), glossBlackMat),
  );

  // Wide Curved Cowl Scuttle Panel sealing hood-to-windshield-to-A-pillar corner solidly (ZERO hole!)
  const cowlRings: Array<Array<[number, number, number]>> = [];
  for (let c = 0; c <= 14; c++) {
    const u = (c / 14) * 2 - 1;
    const [wx, wy, wz] = windshieldSurfacePoint(u, 0);
    cowlRings.push([
      [wx * 1.05, wy - 0.035, wz - 0.08],
      [wx * 1.05, wy + 0.005, wz + 0.015],
      [wx * 1.03, wy - 0.018, wz + 0.085],
    ]);
  }
  greenhouseGroup.add(
    new THREE.Mesh(trackGeo(buildLoftedSurface(cowlRings, false)), darkTrimMat),
  );

  // Flush Glass-Conforming Dual Aero Windshield Wipers (anchored cleanly onto cowl, hugging curved glass!)
  const wiperSpecs = [
    { uStart: -0.58, uEnd: 0.06, tBase: 0.02, tTip: 0.075 },
    { uStart: 0.08, uEnd: 0.72, tBase: 0.02, tTip: 0.085 },
  ];
  for (const w of wiperSpecs) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const f = k / 6;
      const u = w.uStart + f * (w.uEnd - w.uStart);
      const t = w.tBase + f * (w.tTip - w.tBase);
      const [wx, wy, wz] = windshieldSurfacePoint(u, t);
      pts.push(new THREE.Vector3(wx, wy, wz + 0.010));
    }
    greenhouseGroup.add(
      new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0075, 6, false)),
        darkTrimMat,
      ),
    );
    // Cowl pivot hub anchoring wiper arm solidly into cowl trim
    const [px, py, pz] = windshieldSurfacePoint(w.uStart, 0.005);
    const hub = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.014, 0.016, 0.028, 10)),
      darkTrimMat,
    );
    hub.position.set(px, py - 0.004, pz + 0.006);
    greenhouseGroup.add(hub);
  }

  // Interior Rear-View Mirror mounted on a stem attached cleanly to the top windshield frit
  const rvStem = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8)),
    darkTrimMat,
  );
  rvStem.position.set(0, 1.59, 0.34);
  rvStem.rotation.x = 0.55;
  greenhouseGroup.add(rvStem);

  const rvMirror = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.22, 0.056, 0.032)),
    interiorDarkMat,
  );
  rvMirror.position.set(0, 1.555, 0.31);
  greenhouseGroup.add(rvMirror);

  // Pillars, Polar-Lofted Rear Quarter Fenders, Tumblehome D-Pillars & Body-Conforming Wraparound Taillights
  for (const s of [-1, 1] as const) {
    // SCULPTED SHEETMETAL A-PILLAR (lofted chamfered automotive pillar anchored solidly into fender & roof — NO round pipe!)
    const aPillarRings: Array<Array<[number, number, number]>> = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10; // 0 = base inside cowl/fender corner, 1 = roof cant rail join
      const [wx, wy, wz] = windshieldSurfacePoint(s * 0.99, t);
      const topBlend = Math.pow(t, 2.6);
      const yA = wy - topBlend * 0.016;
      const xIn = wx - s * 0.012;
      const xOut = wx + s * (0.046 - t * 0.022);
      const xBack = wx + s * (0.026 - t * 0.010);
      const zFront = wz + 0.012 - topBlend * 0.008;
      const zRear = wz - (0.068 - t * 0.016);
      aPillarRings.push([
        [xIn, yA + 0.002, zFront],
        [xOut, yA + 0.003, wz + 0.002],
        [xBack, yA - 0.005, zRear],
        [xIn - s * 0.015, yA - 0.018, zRear],
      ]);
    }
    const aPillarMesh = new THREE.Mesh(
      trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(aPillarRings, s < 0))),
      bodyPaintMat,
    );
    aPillarMesh.castShadow = true;
    aPillarMesh.receiveShadow = true;
    greenhouseGroup.add(aPillarMesh);

    // Sculpted Roof Cant Rail flowing seamlessly from A-pillar top to D-pillar & roof spoiler!
    const cantRings: Array<Array<[number, number, number]>> = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const z = 0.24 - t * 2.28;
      const yArc = 1.662 + Math.sin(t * Math.PI) * 0.052;
      const halfW = 0.618 + Math.sin(t * Math.PI) * 0.018 - t * 0.022;
      cantRings.push([
        [s * (halfW - 0.028), yArc + 0.014, z],
        [s * (halfW + 0.020), yArc + 0.004, z],
        [s * (halfW + 0.024), yArc - 0.022, z],
        [s * (halfW - 0.015), yArc - 0.026, z],
      ]);
    }
    const cantRailMesh = new THREE.Mesh(
      trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(cantRings, s > 0))),
      bodyPaintMat,
    );
    cantRailMesh.castShadow = true;
    greenhouseGroup.add(cantRailMesh);

    // Flush Tumblehome-Matched Gloss-Black B-Pillar & C-Pillar Appliqués (zero gaps top or bottom!)
    for (const [zMid, wPillar, yBotP] of [
      [-0.145, 0.092, 1.135],
      [-1.232, 0.088, 1.158],
    ] as const) {
      const pillarRings: Array<Array<[number, number, number]>> = [];
      for (let ri = 0; ri <= 4; ri++) {
        const pt = ri / 4;
        const y = yBotP + pt * (1.666 - yBotP);
        const xOuter = 0.852 - pt * (0.852 - 0.636);
        pillarRings.push([
          [s * (xOuter - 0.022), y, zMid + wPillar * 0.5],
          [s * (xOuter + 0.004), y, zMid + wPillar * 0.5],
          [s * (xOuter + 0.004), y, zMid - wPillar * 0.5],
          [s * (xOuter - 0.022), y, zMid - wPillar * 0.5],
        ]);
      }
      greenhouseGroup.add(
        new THREE.Mesh(trackGeo(buildLoftedSurface(pillarRings, s > 0)), glossBlackMat),
      );
    }

    // Polar-Lofted Double-Curved Rear Quarter Fender (seamless circular wheel arch & rear bumper join!)
    const rearQuarterMesh = new THREE.Mesh(
      trackGeo(buildSculptedRearQuarterGeometry(s)),
      bodyPaintMat,
    );
    rearQuarterMesh.castShadow = true;
    rearQuarterMesh.receiveShadow = true;
    addSketchOutline(rearQuarterMesh, 26);
    greenhouseGroup.add(rearQuarterMesh);

    // Smoothly Tapered Tumblehome Painted Upswept Quarter Sill (Innova Shark-Fin Signature!)
    const dSillRings: Array<Array<[number, number, number]>> = [
      [
        [s * 0.855, 1.155, -1.23],
        [s * 0.845, 1.155, -1.65],
        [s * 0.822, 1.155, -2.03],
        [s * 0.785, 1.155, -2.25],
      ],
      [
        [s * 0.842, 1.168, -1.23],
        [s * 0.812, 1.245, -1.65],
        [s * 0.748, 1.385, -2.00],
        [s * 0.715, 1.385, -2.18],
      ],
    ];
    const upsweptSill = new THREE.Mesh(
      trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(dSillRings, s > 0))),
      bodyPaintMat,
    );
    upsweptSill.castShadow = true;
    greenhouseGroup.add(upsweptSill);

    // Tapered Painted D-Pillar Column reaching cleanly up into the integrated roof spoiler
    const dColRings: Array<Array<[number, number, number]>> = [
      [
        [s * 0.748, 1.375, -1.96],
        [s * 0.715, 1.375, -2.18],
      ],
      [
        [s * 0.672, 1.54, -2.01],
        [s * 0.652, 1.54, -2.14],
      ],
      [
        [s * 0.614, 1.678, -2.00],
        [s * 0.594, 1.678, -2.12],
      ],
    ];
    const dPillarMesh = new THREE.Mesh(
      trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(dColRings, s > 0))),
      bodyPaintMat,
    );
    dPillarMesh.castShadow = true;
    addSketchOutline(dPillarMesh, 26);
    greenhouseGroup.add(dPillarMesh);

    // Rear-facing D-pillar cap framing rear glass cleanly
    const dRearCapRings: Array<Array<[number, number, number]>> = [
      [
        [s * 0.785, 1.155, -2.25],
        [s * 0.695, 1.155, -2.275],
      ],
      [
        [s * 0.715, 1.385, -2.18],
        [s * 0.658, 1.385, -2.20],
      ],
      [
        [s * 0.594, 1.678, -2.12],
        [s * 0.568, 1.678, -2.10],
      ],
    ];
    greenhouseGroup.add(
      new THREE.Mesh(
        trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(dRearCapRings, s > 0))),
        bodyPaintMat,
      ),
    );

    // Signature Innova Upswept Rear Quarter Glass
    const rqWinGeo = trackGeo(
      buildLoftedSurface(
        [
          [
            [s * 0.835, 1.168, -1.23],
            [s * 0.805, 1.242, -1.65],
            [s * 0.742, 1.382, -1.96],
          ],
          [
            [s * 0.642, 1.668, -1.23],
            [s * 0.632, 1.662, -1.65],
            [s * 0.612, 1.654, -2.01],
          ],
        ],
        s > 0,
      ),
    );
    const rqWinMesh = new THREE.Mesh(rqWinGeo, glassMat);
    rqWinMesh.renderOrder = 2;
    greenhouseGroup.add(rqWinMesh);

    // Gleaming Chrome Window Beltline Trim sweeping smoothly up along the rear quarter window
    const trimCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.848, 1.166, -1.23),
      new THREE.Vector3(s * 0.816, 1.242, -1.65),
      new THREE.Vector3(s * 0.754, 1.384, -1.97),
    ]);
    greenhouseGroup.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(trimCurve, 12, 0.0085, 8, false)), chromeMat),
    );

    // BODY-CONFORMING WRAPAROUND INNOVA BOOMERANG OUTER LED TAIL LAMP (replaces floating red boxes!)
    // Wraps organically from the side rear quarter panel (z=-2.02) smoothly around the corner to the tailgate (x=0.70, z=-2.29)
    const tailCornerPts: Array<[number, number]> = [
      [0.835, -2.035],
      [0.822, -2.135],
      [0.798, -2.225],
      [0.760, -2.275],
      [0.695, -2.292],
    ];
    const outerTailRings: Array<Array<[number, number, number]>> = [];
    for (let i = 0; i < tailCornerPts.length; i++) {
      const f = i / (tailCornerPts.length - 1);
      const [ax, az] = tailCornerPts[i];
      // Boomerang taper: sleek narrow leading blade on side fender expanding cleanly at rear face
      const yBot = 1.015 - Math.pow(f, 0.85) * 0.095;
      const yTop = 1.132 + Math.sin(f * Math.PI * 0.6) * 0.022;
      const bulge = Math.sin(f * Math.PI) * 0.008 + 0.005;
      outerTailRings.push([
        [s * (ax - 0.015), yBot, az + 0.012],
        [s * (ax + bulge), yBot, az - bulge],
        [s * (ax + bulge + 0.004), (yBot + yTop) * 0.5, az - bulge - 0.004],
        [s * (ax + bulge), yTop, az - bulge],
        [s * (ax - 0.015), yTop, az + 0.012],
      ]);
    }
    greenhouseGroup.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(outerTailRings, s < 0)), tailLightMat),
    );

    // Flush crystal clear strip & subtle amber corner lens conformed directly onto outer tail lamp wrap
    const clearStripRings: Array<Array<[number, number, number]>> = [];
    for (let i = 1; i < tailCornerPts.length; i++) {
      const [ax, az] = tailCornerPts[i];
      clearStripRings.push([
        [s * (ax + 0.012), 0.992, az - 0.012],
        [s * (ax + 0.012), 1.028, az - 0.012],
      ]);
    }
    greenhouseGroup.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(clearStripRings, s < 0)), reverseLightMat),
    );

    const turnStripRings: Array<Array<[number, number, number]>> = [];
    for (let i = 1; i <= 3; i++) {
      const [ax, az] = tailCornerPts[i];
      turnStripRings.push([
        [s * (ax + 0.013), 0.952, az - 0.013],
        [s * (ax + 0.013), 0.986, az - 0.013],
      ]);
    }
    greenhouseGroup.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(turnStripRings, s < 0)), hazardMat),
    );

    // Solid painted corner filler panel bridging between rear quarter, outer taillight & rear bumper (ZERO gap!)
    const rearCornerFillerRings: Array<Array<[number, number, number]>> = [];
    for (let i = 0; i < tailCornerPts.length; i++) {
      const [ax, az] = tailCornerPts[i];
      rearCornerFillerRings.push([
        [s * (ax + 0.002), 0.675, az + 0.012],
        [s * (ax + 0.002), 0.950, az + 0.002],
      ]);
    }
    greenhouseGroup.add(
      new THREE.Mesh(
        trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(rearCornerFillerRings, s < 0))),
        bodyPaintMat,
      ),
    );
  }

  // Sculpted Curved Rear Bumper wrapping seamlessly into Rear Quarter Fenders (ZERO notch behind wheels!)
  const rearBumperRings: Array<Array<[number, number, number]>> = [];
  for (let i = 0; i <= 22; i++) {
    const u = (i / 22) * 2 - 1;
    const uAbs = Math.abs(u);
    const x = u * 0.865;
    rearBumperRings.push([
      [x * 0.94, 0.275, rearBumperZ(uAbs, 0.275) + 0.06],
      [x * 0.985, 0.355, rearBumperZ(uAbs, 0.355)],
      [x, 0.535, rearBumperZ(uAbs, 0.535)],
      [x * 0.985, 0.680, rearBumperZ(uAbs, 0.680)],
      [x * 0.94, 0.705, rearBumperZ(uAbs, 0.705) + 0.14],
    ]);
  }
  const rearBumper = new THREE.Mesh(
    trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(rearBumperRings, true))),
    bodyPaintMat,
  );
  rearBumper.castShadow = true;
  rearBumper.receiveShadow = true;
  addSketchOutline(rearBumper, 24);
  greenhouseGroup.add(rearBumper);

  // Curved lower rear diffuser valance conforming flush to rear bumper curve
  const diffuserRings: Array<Array<[number, number, number]>> = [];
  for (let i = 0; i <= 14; i++) {
    const u = ((i / 14) * 2 - 1) * 0.64;
    const x = u * 0.865;
    const uAbs = Math.abs(u);
    diffuserRings.push([
      [x, 0.285, rearBumperZ(uAbs, 0.285) - 0.008],
      [x, 0.365, rearBumperZ(uAbs, 0.365) - 0.008],
    ]);
  }
  greenhouseGroup.add(
    new THREE.Mesh(trackGeo(buildLoftedSurface(diffuserRings, true)), darkTrimMat),
  );

  // Flush curved rear bumper reflectors
  for (const s of [-1, 1] as const) {
    const refRings: Array<Array<[number, number, number]>> = [];
    for (let k = 0; k <= 4; k++) {
      const u = s * (0.62 + (k / 4) * 0.20);
      const x = u * 0.865;
      const uAbs = Math.abs(u);
      refRings.push([
        [x, 0.422, rearBumperZ(uAbs, 0.422) - 0.008],
        [x, 0.450, rearBumperZ(uAbs, 0.450) - 0.008],
      ]);
    }
    greenhouseGroup.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(refRings, s > 0)), tailLightMat),
    );
  }

  // =========================================================================
  // 5. FOUR ARTICULATED DOORS + FLUSH MIRRORS + ANCHORED HANDLES + CONFORMING DECALS
  // =========================================================================
  const buildDoorAssembly = (
    sideSign: 1 | -1,
    isFront: boolean,
    partKey: InteractablePart,
  ): THREE.Group => {
    const zHinge = isFront ? 0.94 : -0.15;
    const zRear = isFront ? -0.14 : -1.23;
    const doorLen = zHinge - zRear;

    const pivot = new THREE.Group();
    pivot.position.set(sideSign * 0.875, 0, zHinge);
    root.add(pivot);

    const skinGeo = trackGeo(buildSideDoorSkinGeometry(zHinge, zRear, sideSign, !isFront));
    const skinMesh = new THREE.Mesh(skinGeo, bodyPaintMat);
    skinMesh.castShadow = true;
    skinMesh.receiveShadow = true;
    addSketchOutline(skinMesh, 26);
    tagInteractable(skinMesh, partKey, interactables);
    pivot.add(skinMesh);

    // Ultra-refined hairline door shutline shadow flush in trailing door seam
    const seamLine = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.004, isFront ? 0.80 : 0.60, 0.003)),
      darkTrimMat,
    );
    seamLine.position.set(sideSign * 0.008, isFront ? 0.69 : 0.83, -doorLen + 0.0015);
    pivot.add(seamLine);

    const innerCard = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.05, 0.72, doorLen - 0.04)),
      interiorDarkMat,
    );
    innerCard.position.set(sideSign * -0.052, 0.68, -doorLen / 2);
    pivot.add(innerCard);

    // Polished Chrome Beltline Molding Strip seated cleanly along base of side windows
    const sillChrome = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.018, 0.016, doorLen - 0.008)),
      chromeMat,
    );
    sillChrome.position.set(sideSign * -0.026, isFront ? 1.124 : 1.150, -doorLen / 2);
    pivot.add(sillChrome);

    // Tumblehome-Matched Tinted Door Glass
    const winRings: Array<Array<[number, number, number]>> = [];
    if (isFront) {
      winRings.push([
        [sideSign * -0.030, 1.124, -0.04],
        [sideSign * -0.030, 1.137, -0.55],
        [sideSign * -0.030, 1.150, -doorLen + 0.01],
      ]);
      winRings.push([
        [sideSign * -0.232, 1.648, -0.66],
        [sideSign * -0.232, 1.664, -0.88],
        [sideSign * -0.232, 1.672, -doorLen + 0.01],
      ]);
    } else {
      winRings.push([
        [sideSign * -0.030, 1.150, -0.01],
        [sideSign * -0.030, 1.158, -doorLen / 2],
        [sideSign * -0.030, 1.168, -doorLen + 0.01],
      ]);
      winRings.push([
        [sideSign * -0.232, 1.672, -0.01],
        [sideSign * -0.232, 1.676, -doorLen / 2],
        [sideSign * -0.232, 1.668, -doorLen + 0.01],
      ]);
    }
    const winMesh = new THREE.Mesh(
      trackGeo(buildLoftedSurface(winRings, sideSign > 0)),
      glassMat,
    );
    winMesh.renderOrder = 2;
    pivot.add(winMesh);

    // Flush Gloss-Black Upper Window Channel Frame
    const topFrameLen = isFront ? 0.44 : doorLen;
    const topFrameZ = isFront ? -0.86 : -doorLen / 2;
    const topFrame = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.026, 0.022, topFrameLen)),
      glossBlackMat,
    );
    topFrame.position.set(sideSign * -0.236, 1.654, topFrameZ);
    pivot.add(topFrame);

    // SOLIDLY ANCHORED Ergonomic Chrome Door Pull-Handle (mounting stalks penetrate cleanly inside door skin!)
    const handleY = isFront ? 0.992 : 1.012;
    const handleZ = -doorLen + 0.16;
    const zWorldH = zHinge + handleZ;
    const yBeltH = 1.115 + ((0.94 - zWorldH) / 2.17) * 0.045;
    const skinLocalX = sideBarrelX(handleY, yBeltH) - 0.875;

    const handleGroup = new THREE.Group();
    handleGroup.position.set(sideSign * skinLocalX, handleY, handleZ);

    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sideSign * -0.014, 0, -0.072),
      new THREE.Vector3(sideSign * 0.020, 0, -0.044),
      new THREE.Vector3(sideSign * 0.022, 0, 0.034),
      new THREE.Vector3(sideSign * -0.014, 0, 0.072),
    ]);
    const handleBarGeo = trackGeo(new THREE.TubeGeometry(handleCurve, 14, 0.012, 8, false));
    handleBarGeo.scale(0.85, 1.15, 1.0);
    handleGroup.add(new THREE.Mesh(handleBarGeo, chromeMat));

    // Flush recessed finger pocket backing cleanly against door skin
    const handleCup = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.008, 0.044, 0.120)),
      darkTrimMat,
    );
    handleCup.position.x = sideSign * -0.002;
    handleGroup.add(handleCup);
    pivot.add(handleGroup);

    if (isFront) {
      // SOLIDLY MOUNTED Aerodynamic Two-Tone Wing Mirror (ZERO floating gap at A-pillar, ZERO floating signal bar!)
      // Positioned flush onto the exact door beltline / A-pillar corner (xLocal = -0.042)
      const mirrorGroup = new THREE.Group();
      mirrorGroup.position.set(sideSign * -0.042, 1.132, -0.215);

      // Gloss-black triangular A-pillar window sail firmly seated into door frame & A-pillar
      const sailShape = new THREE.Shape();
      sailShape.moveTo(-0.075, -0.015);
      sailShape.lineTo(0.085, -0.015);
      sailShape.lineTo(-0.055, 0.115);
      sailShape.closePath();
      const sailGeo = trackGeo(
        new THREE.ExtrudeGeometry(sailShape, { depth: 0.038, bevelEnabled: false }),
      );
      sailGeo.rotateY(Math.PI / 2);
      const sail = new THREE.Mesh(sailGeo, glossBlackMat);
      sail.position.set(sideSign > 0 ? -0.022 : -0.016, 0.0, 0.0);
      mirrorGroup.add(sail);

      // Curved gloss-black mounting stalk flowing continuously out of the sail into mirror housing
      const armCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sideSign * -0.005, 0.015, 0.005),
        new THREE.Vector3(sideSign * 0.072, 0.026, -0.006),
        new THREE.Vector3(sideSign * 0.132, 0.046, -0.018),
      ]);
      mirrorGroup.add(
        new THREE.Mesh(trackGeo(new THREE.TubeGeometry(armCurve, 10, 0.018, 8, false)), glossBlackMat),
      );

      // Unified sculpted aerodynamic two-tone mirror shell sub-group (all parts share exact mirror rotation!)
      const shellGroup = new THREE.Group();
      shellGroup.position.set(sideSign * 0.148, 0.052, -0.018);
      shellGroup.rotation.y = sideSign * -0.18;
      mirrorGroup.add(shellGroup);

      const capGeo = trackGeo(
        fillWhiteVertexColors(
          new THREE.SphereGeometry(0.094, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
        ),
      );
      capGeo.scale(1.06, 0.72, 0.68);
      const cap = new THREE.Mesh(capGeo, bodyPaintMat);
      cap.castShadow = true;
      shellGroup.add(cap);

      const lowerGeo = trackGeo(
        new THREE.SphereGeometry(0.093, 18, 12, 0, Math.PI * 2, Math.PI * 0.50, Math.PI * 0.50),
      );
      lowerGeo.scale(1.05, 0.56, 0.67);
      shellGroup.add(new THREE.Mesh(lowerGeo, glossBlackMat));

      // Curved LED turn-signal lightguide hugging the EXACT front ellipsoid equator (ZERO floating bar!)
      const sigPts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) {
        const ang = -0.78 + (k / 10) * 1.56;
        sigPts.push(
          new THREE.Vector3(
            Math.sin(ang) * 0.094 * 1.06,
            -0.004,
            Math.cos(ang) * 0.094 * 0.68 + 0.002,
          ),
        );
      }
      shellGroup.add(
        new THREE.Mesh(
          trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sigPts), 12, 0.0052, 6, false)),
          hazardMat,
        ),
      );

      // Flush recessed rear mirror housing backing & reflective glass lens (tucked neatly inside shell!)
      const mirrorBezel = new THREE.Mesh(
        trackGeo(new THREE.CircleGeometry(0.068, 22)),
        glossBlackMat,
      );
      mirrorBezel.scale.set(1.22, 0.78, 1);
      mirrorBezel.rotation.y = Math.PI;
      mirrorBezel.position.set(0, 0.002, -0.056);
      shellGroup.add(mirrorBezel);

      const mirrorGlass = new THREE.Mesh(
        trackGeo(new THREE.CircleGeometry(0.061, 22)),
        chromeMat,
      );
      mirrorGlass.scale.set(1.22, 0.78, 1);
      mirrorGlass.rotation.y = Math.PI;
      mirrorGlass.position.set(0, 0.002, -0.058);
      shellGroup.add(mirrorGlass);

      pivot.add(mirrorGroup);

      // BODY-CONFORMING CURVED OFFICIAL PANELCO III CIRCULAR GREEN SEAL ON FRONT DOORS
      const sealMesh = new THREE.Mesh(
        trackGeo(buildConformingSideDecal(sideSign, zHinge, -0.52, 0.70, 0.45, 0.45)),
        sealDecalMat,
      );
      sealMesh.renderOrder = 3;
      pivot.add(sealMesh);
      decalMeshes.push(sealMesh);
    } else {
      // BODY-CONFORMING CURVED LOGO-GREEN TAGLINE ("Your delight, our success.") ON REAR DOORS
      const taglineMesh = new THREE.Mesh(
        trackGeo(buildConformingSideDecal(sideSign, zHinge, -0.52, 0.78, 0.82, 0.205)),
        taglineDecalMat,
      );
      taglineMesh.renderOrder = 3;
      pivot.add(taglineMesh);
      decalMeshes.push(taglineMesh);
    }

    return pivot;
  };

  const frontLeftDoorPivot = buildDoorAssembly(1, true, 'frontLeftDoor');
  const frontRightDoorPivot = buildDoorAssembly(-1, true, 'frontRightDoor');
  const rearLeftDoorPivot = buildDoorAssembly(1, false, 'rearLeftDoor');
  const rearRightDoorPivot = buildDoorAssembly(-1, false, 'rearRightDoor');

  // =========================================================================
  // 6. ARTICULATED REAR TAILGATE + FLUSH INNER LED LAMPS + CONFORMING BRANDING
  // =========================================================================
  const tailgatePivot = new THREE.Group();
  tailgatePivot.position.set(0, 1.675, -2.06);
  root.add(tailgatePivot);

  // Exact curved tailgate surface helper so lamps, garnish, plate & decals conform 100% flush!
  const tailgateSurfaceZ = (x: number, yLoc: number): number => {
    const u = Math.max(-1, Math.min(1, x / 0.74));
    const bow = (1 - u * u) * -0.032;
    let baseZ = -0.255;
    if (yLoc <= -0.78) {
      const f = (yLoc - -1.00) / 0.22;
      baseZ = -0.255 + f * (-0.282 - -0.255);
    } else if (yLoc <= -0.50) {
      const f = (yLoc - -0.78) / 0.28;
      baseZ = -0.282 + f * (-0.242 - -0.282);
    } else {
      const f = (yLoc - -0.50) / 0.05;
      baseZ = -0.242 + f * (-0.205 - -0.242);
    }
    return baseZ + bow;
  };

  // Sculpted Tailgate Panel (V=+Y, U=+X -> VxU = -Z REARWARD! flipWinding = false!)
  const gateRings: Array<Array<[number, number, number]>> = [];
  const gateYStops: Array<[number, number]> = [
    [-1.00, 0.725],
    [-0.78, 0.750],
    [-0.50, 0.735],
    [-0.45, 0.715],
  ];
  for (const [yLoc, halfW] of gateYStops) {
    const ring: Array<[number, number, number]> = [];
    for (let xi = 0; xi <= 14; xi++) {
      const u = (xi / 14) * 2 - 1;
      const x = u * halfW;
      ring.push([x, yLoc, tailgateSurfaceZ(x, yLoc)]);
    }
    gateRings.push(ring);
  }
  const tailgatePanel = new THREE.Mesh(
    trackGeo(applyAutomotiveBodyAO(buildLoftedSurface(gateRings, false), 0, 1.675, -2.06)),
    bodyPaintMat,
  );
  tailgatePanel.castShadow = true;
  tailgatePanel.receiveShadow = true;
  addSketchOutline(tailgatePanel, 24);
  tagInteractable(tailgatePanel, 'tailgate', interactables);
  tailgatePivot.add(tailgatePanel);

  // Inner tailgate trim card
  const gateInner = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.30, 0.54, 0.05)),
    interiorDarkMat,
  );
  gateInner.position.set(0, -0.73, -0.205);
  tailgatePivot.add(gateInner);

  // Raked Rear Windshield Glass
  const rearGlassRings: Array<Array<[number, number, number]>> = [
    [
      [-0.69, -0.46, -0.208],
      [0, -0.46, -0.240],
      [0.69, -0.46, -0.208],
    ],
    [
      [-0.56, -0.015, -0.032],
      [0, -0.015, -0.056],
      [0.56, -0.015, -0.032],
    ],
  ];
  const rearGlass = new THREE.Mesh(
    trackGeo(buildLoftedSurface(rearGlassRings, false)),
    glassMat,
  );
  rearGlass.renderOrder = 2;
  tailgatePivot.add(rearGlass);

  // Flush Rear Windshield Wiper anchored cleanly onto lower tailgate glass pivot
  const rearWiperHub = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.015, 0.017, 0.025, 10)),
    darkTrimMat,
  );
  rearWiperHub.rotation.x = Math.PI / 2;
  rearWiperHub.position.set(0.02, -0.445, -0.240);
  tailgatePivot.add(rearWiperHub);

  const rearWiper = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.34, 0.015, 0.014)),
    darkTrimMat,
  );
  rearWiper.position.set(-0.14, -0.422, -0.236);
  rearWiper.rotation.z = 0.09;
  tailgatePivot.add(rearWiper);

  // Flush Body-Conforming Inner L-Shaped Tailgate LED Lamp Lenses (connect seamlessly to outer quarter lamps!)
  for (const s of [-1, 1] as const) {
    const innerRedRings: Array<Array<[number, number, number]>> = [];
    for (let k = 0; k <= 6; k++) {
      const f = k / 6;
      const x = s * (0.33 + f * 0.375);
      const yBot = -0.642 - f * 0.008;
      const yTop = -0.528 + f * 0.004;
      innerRedRings.push([
        [x, yBot, tailgateSurfaceZ(x, yBot) - 0.012],
        [x, yTop, tailgateSurfaceZ(x, yTop) - 0.012],
      ]);
    }
    tailgatePivot.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(innerRedRings, s > 0)), tailLightMat),
    );

    const revRings: Array<Array<[number, number, number]>> = [];
    for (let k = 0; k <= 5; k++) {
      const f = k / 5;
      const x = s * (0.35 + f * 0.32);
      revRings.push([
        [x, -0.638, tailgateSurfaceZ(x, -0.638) - 0.016],
        [x, -0.602, tailgateSurfaceZ(x, -0.602) - 0.016],
      ]);
    }
    tailgatePivot.add(
      new THREE.Mesh(trackGeo(buildLoftedSurface(revRings, s > 0)), reverseLightMat),
    );
  }

  // Curved Chrome Rear Garnish Strip hugging tailgate bow
  const garnishRings: Array<Array<[number, number, number]>> = [];
  for (let k = 0; k <= 10; k++) {
    const x = ((k / 10) * 2 - 1) * 0.33;
    const zB = tailgateSurfaceZ(x, -0.68);
    garnishRings.push([
      [x, -0.696, zB - 0.016],
      [x, -0.664, zB - 0.016],
    ]);
  }
  tailgatePivot.add(new THREE.Mesh(trackGeo(buildLoftedSurface(garnishRings, true)), chromeMat));

  const rearEmblem = createToyotaEmblem(0.88, chromeMat, glossBlackMat, geometries);
  rearEmblem.position.set(0, -0.575, tailgateSurfaceZ(0, -0.575) - 0.014);
  rearEmblem.rotation.y = Math.PI;
  tailgatePivot.add(rearEmblem);

  // Flush Body-Conforming Rear "INNOVA" Badge & "PANELCO III" Wordmark (ZERO floating gap behind tailgate!)
  const buildTailgateDecal = (
    xCenter: number,
    yCenter: number,
    width: number,
    height: number,
  ): THREE.BufferGeometry => {
    const cols = 8;
    const rows = 4;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const y = yCenter - height * 0.5 + v * height;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols; // looking from rear (-Z toward +Z): left is +X, right is -X
        const x = xCenter + (0.5 - u) * width;
        positions.push(x, y, tailgateSurfaceZ(x, y) - 0.004);
        uvs.push(u, v);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = (r + 1) * (cols + 1) + c;
        const e = d + 1;
        // U goes -X (screen-right in Rear View), V goes +Y -> (U x V) = -Z REARWARD!
        indices.push(a, b, e, a, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  const innovaBadgeMesh = new THREE.Mesh(
    trackGeo(buildTailgateDecal(0.51, -0.71, 0.27, 0.068)),
    innovaBadgeMat,
  );
  innovaBadgeMesh.renderOrder = 3;
  tailgatePivot.add(innovaBadgeMesh);

  const rearWordmarkMesh = new THREE.Mesh(
    trackGeo(buildTailgateDecal(0, -0.79, 0.88, 0.22)),
    rearWordmarkMat,
  );
  rearWordmarkMesh.renderOrder = 3;
  tailgatePivot.add(rearWordmarkMesh);
  decalMeshes.push(rearWordmarkMesh);

  // Rear License Plate seated flush on tailgate recess
  const rearPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.385, 0.140, 0.016)),
    plateMat,
  );
  rearPlate.position.set(0, -0.938, tailgateSurfaceZ(0, -0.938) - 0.008);
  rearPlate.rotation.y = Math.PI;
  tailgatePivot.add(rearPlate);

  // =========================================================================
  // 7. DETAILED 3-ROW CABIN INTERIOR (WITH STEEL HEADREST POSTS — ZERO FLOATING HEADRESTS!)
  // =========================================================================
  const interiorGroup = new THREE.Group();
  root.add(interiorGroup);

  const dashboard = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.42, 0.34, 0.48)),
    interiorDarkMat,
  );
  dashboard.position.set(0, 0.94, 0.72);
  interiorGroup.add(dashboard);

  const dashTrim = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.34, 0.042, 0.036)),
    woodAccentMat,
  );
  dashTrim.position.set(0, 0.98, 0.47);
  interiorGroup.add(dashTrim);

  const infotainment = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.26, 0.16, 0.03)),
    glossBlackMat,
  );
  infotainment.position.set(0, 1.00, 0.48);
  interiorGroup.add(infotainment);

  const centerConsole = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.24, 0.40, 0.88)),
    interiorDarkMat,
  );
  centerConsole.position.set(0, 0.52, 0.18);
  interiorGroup.add(centerConsole);

  const shifter = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.016, 0.014, 0.15, 10)),
    chromeMat,
  );
  shifter.position.set(0, 0.78, 0.36);
  interiorGroup.add(shifter);

  // LHD Steering Wheel (+X Driver Side, Philippines) with center hub & 3 spokes
  const steeringCol = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.032, 0.036, 0.28, 12)),
    darkTrimMat,
  );
  steeringCol.rotation.x = Math.PI / 2 - 0.35;
  steeringCol.position.set(0.36, 1.01, 0.50);
  interiorGroup.add(steeringCol);

  const steeringGroup = new THREE.Group();
  steeringGroup.position.set(0.36, 1.05, 0.39);
  steeringGroup.rotation.x = -0.35;
  interiorGroup.add(steeringGroup);

  steeringGroup.add(
    new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.165, 0.019, 10, 24)), interiorDarkMat),
  );
  const wheelHub = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.032, 16)),
    interiorDarkMat,
  );
  wheelHub.rotation.x = Math.PI / 2;
  steeringGroup.add(wheelHub);
  for (const ang of [0, Math.PI, -Math.PI / 2]) {
    const swSpoke = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.15, 0.022, 0.018)),
      alloyDarkMat,
    );
    swSpoke.rotation.z = ang;
    swSpoke.position.set(Math.cos(ang) * 0.075, Math.sin(ang) * 0.075, 0);
    steeringGroup.add(swSpoke);
  }

  // Contoured Automotive Seats anchored to floor pedestals with twin steel headrest posts!
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 8));
  const buildSeat = (x: number, z: number, width: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.32, z);

    // Seat pedestal base connecting cleanly down to floor pan (y = 0.32 -> 0.44)
    const pedestal = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(width * 0.78, 0.16, 0.38)),
      darkTrimMat,
    );
    pedestal.position.set(0, 0.08, 0.02);
    g.add(pedestal);

    const cushion = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(width, 0.14, 0.48)),
      seatFabricMat,
    );
    cushion.position.set(0, 0.21, 0.05);
    g.add(cushion);

    // Rounded side bolsters on backrest for authentic automotive seat contour
    const backrest = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(width * 0.92, 0.56, 0.13)),
      seatFabricMat,
    );
    backrest.position.set(0, 0.52, -0.17);
    backrest.rotation.x = -0.17;
    g.add(backrest);

    // Twin chrome steel headrest support posts connecting backrest solidly into headrest (ZERO floating!)
    for (const px of [-width * 0.13, width * 0.13]) {
      const post = new THREE.Mesh(postGeo, chromeMat);
      post.position.set(px, 0.81, -0.22);
      post.rotation.x = -0.17;
      g.add(post);
    }

    const headrest = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(width * 0.44, 0.16, 0.10)),
      seatFabricMat,
    );
    headrest.position.set(0, 0.89, -0.235);
    headrest.rotation.x = -0.10;
    g.add(headrest);

    interiorGroup.add(g);
  };

  buildSeat(0.36, 0.02, 0.48);
  buildSeat(-0.36, 0.02, 0.48);
  buildSeat(0.35, -0.82, 0.48);
  buildSeat(-0.35, -0.82, 0.48);
  buildSeat(0.32, -1.56, 0.44);
  buildSeat(-0.32, -1.56, 0.44);

  const cabinPointLight = new THREE.PointLight(0xffefc2, 0, 2.8, 1.8);
  cabinPointLight.position.set(0, 1.56, -0.15);
  interiorGroup.add(cabinPointLight);

  // =========================================================================
  // 8. FOUR 10-SPOKE TWO-TONE CNC-MACHINED ALLOY WHEELS WITH STEERING KNUCKLES
  // =========================================================================
  const wheelMats = {
    tire: tireMat,
    alloyFace: alloyFaceMat,
    alloyDark: alloyDarkMat,
    chrome: chromeMat,
    brakeDisc: brakeDiscMat,
    caliper: caliperMat,
  };

  const frontLeftWheel = createWheelAssembly(1, true, wheelMats, geometries);
  frontLeftWheel.knuckleGroup.position.set(
    INNOVA_DIMENSIONS.trackHalfWidth,
    INNOVA_DIMENSIONS.wheelRadius,
    INNOVA_DIMENSIONS.frontAxleZ,
  );
  root.add(frontLeftWheel.knuckleGroup);

  const frontRightWheel = createWheelAssembly(-1, true, wheelMats, geometries);
  frontRightWheel.knuckleGroup.position.set(
    -INNOVA_DIMENSIONS.trackHalfWidth,
    INNOVA_DIMENSIONS.wheelRadius,
    INNOVA_DIMENSIONS.frontAxleZ,
  );
  root.add(frontRightWheel.knuckleGroup);

  const rearLeftWheel = createWheelAssembly(1, false, wheelMats, geometries);
  rearLeftWheel.knuckleGroup.position.set(
    INNOVA_DIMENSIONS.trackHalfWidth,
    INNOVA_DIMENSIONS.wheelRadius,
    INNOVA_DIMENSIONS.rearAxleZ,
  );
  root.add(rearLeftWheel.knuckleGroup);

  const rearRightWheel = createWheelAssembly(-1, false, wheelMats, geometries);
  rearRightWheel.knuckleGroup.position.set(
    -INNOVA_DIMENSIONS.trackHalfWidth,
    INNOVA_DIMENSIONS.wheelRadius,
    INNOVA_DIMENSIONS.rearAxleZ,
  );
  root.add(rearRightWheel.knuckleGroup);

  // =========================================================================
  // 9. GROUNDED MULTI-TIER AMBIENT OCCLUSION CONTACT SHADOW PLANE (FLUSH AT Y=0)
  // =========================================================================
  const contactShadow = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(3.2, 5.6)),
    trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        opacity: 0.80,
        depthWrite: false,
      }),
    ),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.006;
  root.add(contactShadow);

  let lastStudioTheme: StudioTheme = 'studio';

  const applyPaintAndTheme = (
    paintId: PaintId,
    studioTheme: StudioTheme,
    liveryStyle: LiveryStyle,
  ) => {
    lastStudioTheme = studioTheme;
    const finish = getPaintFinish(paintId);
    const isSketch = studioTheme === 'sketch';

    if (isSketch) {
      bodyPaintMat.color.setHex(0xf8fafc);
      bodyPaintMat.metalness = 0.04;
      bodyPaintMat.roughness = 0.72;
      bodyPaintMat.clearcoat = 0.15;
      bodyPaintMat.envMapIntensity = 0.45;
      contactShadow.visible = false;
    } else {
      bodyPaintMat.color.setHex(finish.bodyColor);
      bodyPaintMat.metalness = finish.metalness;
      bodyPaintMat.roughness = finish.roughness;
      bodyPaintMat.clearcoat = finish.clearcoat;
      bodyPaintMat.clearcoatRoughness = finish.clearcoatRoughness;
      bodyPaintMat.envMapIntensity = studioTheme === 'night' ? 1.60 : 1.32;
      contactShadow.visible = true;
    }

    for (const line of sketchEdgeLines) {
      line.visible = isSketch;
    }

    const decalsVisible = liveryStyle !== 'hidden';
    for (const m of decalMeshes) {
      m.visible = decalsVisible;
    }

    const inkHex = resolveDecalInkHex(paintId, studioTheme, liveryStyle);
    const useLightInk = inkHex === '#f8fafc';
    const taglineHex = resolveTaglineColorHex(paintId, studioTheme, liveryStyle);

    if (isSketch || liveryStyle === 'monochrome') {
      sealDecalMat.map = useLightInk ? textures.sealMonoLight : textures.sealMonoDark;
      taglineDecalMat.map = useLightInk ? textures.taglineLight : textures.taglineDark;
    } else {
      sealDecalMat.map = textures.sealColor;
      taglineDecalMat.map =
        taglineHex === PANELCO_BRAND.greenLightHex
          ? textures.taglineGreenLight
          : textures.taglineGreen;
    }

    hoodWordmarkMat.map = useLightInk
      ? textures.hoodWordmarkLight
      : textures.hoodWordmarkDark;
    rearWordmarkMat.map = useLightInk
      ? textures.rearWordmarkLight
      : textures.rearWordmarkDark;

    sealDecalMat.needsUpdate = true;
    taglineDecalMat.needsUpdate = true;
    hoodWordmarkMat.needsUpdate = true;
    rearWordmarkMat.needsUpdate = true;
  };

  const applyLighting = (lighting: LightingState, hazardPulseOn: boolean) => {
    const hlOn = lighting.headlights;
    const isNight = lastStudioTheme === 'night';
    headlightEmissiveMat.emissiveIntensity = hlOn ? (isNight ? 2.4 : 0.95) : 0.04;
    drlEmissiveMat.emissiveIntensity = hlOn ? (isNight ? 2.3 : 1.45) : 0.15;
    fogOpticMat.emissiveIntensity = hlOn ? (isNight ? 1.5 : 0.32) : 0.02;
    tailLightMat.emissiveIntensity = hlOn ? (isNight ? 1.75 : 0.55) : 0.08;

    for (const beam of headlightBeams) {
      beam.visible = hlOn && isNight;
    }

    const hazardActive = lighting.hazards && hazardPulseOn;
    hazardMat.emissiveIntensity = hazardActive ? 2.8 : 0.0;

    domeEmissiveMat.emissiveIntensity = lighting.cabinLight ? 2.4 : 0.0;
    cabinPointLight.intensity = lighting.cabinLight ? 1.9 : 0.0;
  };

  const setArticulationAngles = (angles: {
    frontLeftDoor: number;
    frontRightDoor: number;
    rearLeftDoor: number;
    rearRightDoor: number;
    hood: number;
    tailgate: number;
  }) => {
    frontLeftDoorPivot.rotation.y = -angles.frontLeftDoor;
    frontRightDoorPivot.rotation.y = angles.frontRightDoor;
    rearLeftDoorPivot.rotation.y = -angles.rearLeftDoor;
    rearRightDoorPivot.rotation.y = angles.rearRightDoor;
    hoodPivot.rotation.x = -angles.hood;
    tailgatePivot.rotation.x = angles.tailgate;
  };

  const setWheelKinematics = (steeringRad: number, spinRad: number) => {
    frontLeftWheel.knuckleGroup.rotation.y = steeringRad;
    frontRightWheel.knuckleGroup.rotation.y = steeringRad;
    frontLeftWheel.spinGroup.rotation.x = spinRad;
    frontRightWheel.spinGroup.rotation.x = spinRad;
    rearLeftWheel.spinGroup.rotation.x = spinRad;
    rearRightWheel.spinGroup.rotation.x = spinRad;
  };

  return {
    root,
    interactables,
    applyPaintAndTheme,
    applyLighting,
    setArticulationAngles,
    setWheelKinematics,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function getTargetArticulationAngles(art: ArticulationState) {
  return {
    frontLeftDoor: art.frontLeftDoor ? 0.98 : 0,
    frontRightDoor: art.frontRightDoor ? 0.98 : 0,
    rearLeftDoor: art.rearLeftDoor ? 1.05 : 0,
    rearRightDoor: art.rearRightDoor ? 1.05 : 0,
    hood: art.hood ? 0.72 : 0,
    tailgate: art.tailgate ? 1.24 : 0,
  };
}
