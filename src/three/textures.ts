import * as THREE from 'three';
import { PANELCO_BRAND } from '../model/vehicleConfig';

export interface ProceduralTextureBundle {
  sealColor: THREE.CanvasTexture;
  sealMonoDark: THREE.CanvasTexture;
  sealMonoLight: THREE.CanvasTexture;
  taglineGreen: THREE.CanvasTexture;
  taglineGreenLight: THREE.CanvasTexture;
  taglineDark: THREE.CanvasTexture;
  taglineLight: THREE.CanvasTexture;
  hoodWordmarkDark: THREE.CanvasTexture;
  hoodWordmarkLight: THREE.CanvasTexture;
  rearWordmarkDark: THREE.CanvasTexture;
  rearWordmarkLight: THREE.CanvasTexture;
  innovaBadge: THREE.CanvasTexture;
  licensePlate: THREE.CanvasTexture;
  tireBump: THREE.CanvasTexture;
  grilleMeshBump: THREE.CanvasTexture;
  engineCover: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  floorGrid: THREE.CanvasTexture;
  getLogoCanvas: () => HTMLCanvasElement;
  updateLicensePlate: (plateText: string) => void;
  dispose: () => void;
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Draws a crisp PANELCO III green emblem fallback before the attached official PNG
 * finishes decoding (takes only a few milliseconds locally).
 */
function drawFallbackPanelcoSeal(
  canvas: HTMLCanvasElement,
  variant: 'color' | 'mono-dark' | 'mono-light',
): void {
  const size = canvas.width;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const isColor = variant === 'color';
  const isMonoLight = variant === 'mono-light';

  ctx.clearRect(0, 0, size, size);

  // Outer green ring matching attached PANELCO III logo
  ctx.beginPath();
  ctx.arc(cx, cy, 480, 0, Math.PI * 2);
  ctx.fillStyle = isColor ? PANELCO_BRAND.greenHex : isMonoLight ? '#f8fafc' : '#111827';
  ctx.fill();

  // Inner white disc
  ctx.beginPath();
  ctx.arc(cx, cy, 342, 0, Math.PI * 2);
  ctx.fillStyle = isMonoLight ? '#0f172a' : '#ffffff';
  ctx.fill();

  // Central golden bulb silhouette
  ctx.beginPath();
  ctx.arc(cx, cy - 30, 175, 0, Math.PI * 2);
  ctx.fillStyle = isColor ? '#facc15' : isMonoLight ? '#e2e8f0' : '#334155';
  ctx.fill();

  ctx.fillStyle = isColor ? '#111827' : isMonoLight ? '#0f172a' : '#ffffff';
  ctx.font = '800 84px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PANELCO III', cx, cy + 412);
}

/**
 * Renders the user's attached official PANELCO III seal PNG tightly cropped around its
 * true circular bounding box (measured on source 595x500 PNG: x=94..522, y=32..450)
 * into color, monochrome dark-ink (Sketch/Light Paint), and monochrome light-ink variants.
 */
function paintOfficialLogoIntoCanvases(
  img: HTMLImageElement,
  colorCanvas: HTMLCanvasElement,
  monoDarkCanvas: HTMLCanvasElement,
  monoLightCanvas: HTMLCanvasElement,
): void {
  const size = colorCanvas.width;
  const pad = 22;
  const dst = size - pad * 2;

  // Measured tight circular bounds of /assets/aistudio/image_3e2aebef.png (595x500)
  const srcW = img.naturalWidth || 595;
  const srcH = img.naturalHeight || 500;
  const sx = Math.round(srcW * (93 / 595));
  const sy = Math.round(srcH * (30 / 500));
  const sw = Math.round(srcW * (428 / 595));
  const sh = Math.round(srcH * (422 / 500));

  const cCtx = colorCanvas.getContext('2d')!;
  cCtx.clearRect(0, 0, size, size);
  cCtx.imageSmoothingEnabled = true;
  cCtx.imageSmoothingQuality = 'high';
  cCtx.drawImage(img, sx, sy, sw, sh, pad, pad, dst, dst);

  // Derive crisp high-contrast monochrome dark-ink & light-ink seal textures for Sketch / Ink Seal modes
  const srcData = cCtx.getImageData(0, 0, size, size);
  const darkData = new ImageData(new Uint8ClampedArray(srcData.data), size, size);
  const lightData = new ImageData(new Uint8ClampedArray(srcData.data), size, size);

  for (let i = 0; i < srcData.data.length; i += 4) {
    const a = srcData.data[i + 3];
    if (a < 10) continue;
    const r = srcData.data[i];
    const g = srcData.data[i + 1];
    const b = srcData.data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // Dark technical ink (preserves crisp black outer ring text, inner artwork & white core contrast)
    const darkVal = lum > 228 ? 250 : Math.max(15, Math.min(220, Math.round((lum - 25) * 1.1)));
    darkData.data[i] = darkVal;
    darkData.data[i + 1] = darkVal;
    darkData.data[i + 2] = Math.min(255, darkVal + 4);
    darkData.data[i + 3] = a;

    // Light silver/white ink for dark paints in Ink Seal mode
    const inv = 255 - darkVal;
    const lightVal = Math.max(30, Math.min(248, Math.round(inv * 0.92 + 18)));
    lightData.data[i] = lightVal;
    lightData.data[i + 1] = lightVal;
    lightData.data[i + 2] = Math.min(255, lightVal + 4);
    lightData.data[i + 3] = a;
  }

  monoDarkCanvas.getContext('2d')!.putImageData(darkData, 0, 0);
  monoLightCanvas.getContext('2d')!.putImageData(lightData, 0, 0);
}

function createTaglineCanvas(
  inkHex: string,
  outlineHex?: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 700 96px "Dancing Script", "Brush Script MT", Georgia, cursive';

  if (outlineHex) {
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outlineHex;
    ctx.strokeText(PANELCO_BRAND.tagline, canvas.width / 2, canvas.height / 2 + 6);
  }

  ctx.fillStyle = inkHex;
  ctx.fillText(PANELCO_BRAND.tagline, canvas.width / 2, canvas.height / 2 + 6);

  return canvas;
}

function createWordmarkCanvas(
  text: string,
  inkHex: string,
  fontSize = 112,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = inkHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", "Arial Black", Arial, sans-serif`;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  return canvas;
}

function drawLicensePlateCanvas(canvas: HTMLCanvasElement, plateText: string): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Sleek dark anodized license frame
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);

  // Clean reflective Philippine-style white fleet plate inner body
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(10, 10, w - 20, h - 20);

  // PANELCO III Logo-Green header band (#019240)
  ctx.fillStyle = PANELCO_BRAND.greenHex;
  ctx.fillRect(10, 10, w - 20, 44);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PANELCO III  ·  FLEET UNIT', w / 2, 33);

  // Main Plate / Body Number
  const display = (plateText.trim() || 'INNOVA').toUpperCase().slice(0, 12);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 92px "JetBrains Mono", "Plus Jakarta Sans", monospace';
  ctx.fillText(display, w / 2, 122);

  // Bottom micro strip
  ctx.fillStyle = '#334155';
  ctx.font = '600 18px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('PANGASINAN III ELECTRIC COOPERATIVE', w / 2, 174);
}

function createTireBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#747474';
  ctx.fillRect(0, 0, 256, 256);

  // 4 circumferential highway ribs + fine sipes
  ctx.fillStyle = '#202020';
  for (const gx of [52, 104, 152, 204]) {
    ctx.fillRect(gx, 0, 9, 256);
  }
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 5;
  for (let y = 0; y < 256; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(50, y + 10);
    ctx.moveTo(62, y + 10);
    ctx.lineTo(104, y);
    ctx.moveTo(114, y);
    ctx.lineTo(152, y + 10);
    ctx.moveTo(162, y + 10);
    ctx.lineTo(204, y);
    ctx.moveTo(214, y);
    ctx.lineTo(256, y + 10);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 12);
  tex.needsUpdate = true;
  return tex;
}

function createGrilleMeshBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1f232a';
  ctx.fillRect(0, 0, 128, 128);

  // Subtle honeycomb diamond pattern
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 3;
  const step = 16;
  for (let y = -16; y < 144; y += step) {
    for (let x = -16; x < 144; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y + step / 2);
      ctx.lineTo(x + step / 2, y);
      ctx.lineTo(x + step, y + step / 2);
      ctx.lineTo(x + step / 2, y + step);
      ctx.closePath();
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.needsUpdate = true;
  return tex;
}

function createEngineCoverTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1f242c';
  ctx.fillRect(0, 0, 512, 512);

  // Molded intake ribs
  ctx.fillStyle = '#2d3440';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(52, 64 + i * 54, 408, 32);
  }

  // Brushed aluminum badge plate
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(68, 300, 376, 130);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 44px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOYOTA', 256, 344);
  ctx.font = '700 32px "JetBrains Mono", monospace';
  ctx.fillText('D-4D 2.8L TURBO', 256, 396);

  return finalizeColorTexture(canvas, maxAnisotropy);
}

/**
 * Multi-tier automotive ambient-occlusion contact shadow with dark tire footprints
 * and soft under-body shadow so the Innova sits firmly planted on the showroom floor.
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);

  // Soft outer studio bounce penumbra
  ctx.save();
  ctx.translate(256, 256);
  ctx.scale(0.55, 0.98);
  const outer = ctx.createRadialGradient(0, 0, 38, 0, 0, 248);
  outer.addColorStop(0, 'rgba(6, 10, 18, 0.86)');
  outer.addColorStop(0.46, 'rgba(8, 12, 22, 0.66)');
  outer.addColorStop(0.74, 'rgba(12, 18, 28, 0.24)');
  outer.addColorStop(1, 'rgba(12, 18, 28, 0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(0, 0, 248, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Dense dark under-chassis occlusion footprint
  ctx.save();
  ctx.translate(256, 256);
  ctx.scale(0.44, 0.86);
  const core = ctx.createRadialGradient(0, 0, 14, 0, 0, 198);
  core.addColorStop(0, 'rgba(3, 5, 10, 0.88)');
  core.addColorStop(0.68, 'rgba(4, 7, 14, 0.62)');
  core.addColorStop(1, 'rgba(4, 7, 14, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, 198, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Four intense rubber-on-floor tire contact patches (mapped to plane 3.2m x 5.6m)
  const wheels: Array<[number, number]> = [
    [256 - (0.785 / 1.6) * 256, 256 - (1.42 / 2.8) * 256],
    [256 + (0.785 / 1.6) * 256, 256 - (1.42 / 2.8) * 256],
    [256 - (0.785 / 1.6) * 256, 256 - (-1.33 / 2.8) * 256],
    [256 + (0.785 / 1.6) * 256, 256 - (-1.33 / 2.8) * 256],
  ];
  for (const [wx, wy] of wheels) {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.scale(0.72, 1.42);
    const wg = ctx.createRadialGradient(0, 0, 5, 0, 0, 38);
    wg.addColorStop(0, 'rgba(1, 3, 7, 0.98)');
    wg.addColorStop(0.48, 'rgba(2, 5, 10, 0.72)');
    wg.addColorStop(0.82, 'rgba(4, 8, 16, 0.22)');
    wg.addColorStop(1, 'rgba(4, 8, 16, 0)');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFloorGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#dfe5ec';
  ctx.fillRect(0, 0, 1024, 1024);

  // Ultra-subtle architectural showroom concrete joints (avoids distracting grid lines)
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.06)';
  ctx.lineWidth = 2;
  const step = 256;
  for (let i = 0; i <= 1024; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  const tex = finalizeColorTexture(canvas, maxAnisotropy);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

export function createProceduralTextures(
  maxAnisotropy: number,
  initialPlate: string,
  onLogoLoaded?: () => void,
): ProceduralTextureBundle {
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 512;
  plateCanvas.height = 200;
  drawLicensePlateCanvas(plateCanvas, initialPlate);
  const licensePlate = finalizeColorTexture(plateCanvas, maxAnisotropy);

  const sealColorCanvas = document.createElement('canvas');
  sealColorCanvas.width = 1024;
  sealColorCanvas.height = 1024;
  drawFallbackPanelcoSeal(sealColorCanvas, 'color');

  const sealMonoDarkCanvas = document.createElement('canvas');
  sealMonoDarkCanvas.width = 1024;
  sealMonoDarkCanvas.height = 1024;
  drawFallbackPanelcoSeal(sealMonoDarkCanvas, 'mono-dark');

  const sealMonoLightCanvas = document.createElement('canvas');
  sealMonoLightCanvas.width = 1024;
  sealMonoLightCanvas.height = 1024;
  drawFallbackPanelcoSeal(sealMonoLightCanvas, 'mono-light');

  const sealColor = finalizeColorTexture(sealColorCanvas, maxAnisotropy);
  const sealMonoDark = finalizeColorTexture(sealMonoDarkCanvas, maxAnisotropy);
  const sealMonoLight = finalizeColorTexture(sealMonoLightCanvas, maxAnisotropy);

  // Asynchronously paint the user's attached official PANELCO III green logo PNG into the 3 seal textures
  let disposed = false;
  const logoImg = new Image();
  logoImg.decoding = 'async';
  logoImg.onload = () => {
    if (disposed) return;
    paintOfficialLogoIntoCanvases(
      logoImg,
      sealColorCanvas,
      sealMonoDarkCanvas,
      sealMonoLightCanvas,
    );
    sealColor.needsUpdate = true;
    sealMonoDark.needsUpdate = true;
    sealMonoLight.needsUpdate = true;
    onLogoLoaded?.();
  };
  logoImg.src = PANELCO_BRAND.logoUrl;

  // Tagline textures matching the exact green in the PANELCO III logo (#019240)
  const taglineGreen = finalizeColorTexture(
    createTaglineCanvas(PANELCO_BRAND.greenHex),
    maxAnisotropy,
  );
  const taglineGreenLight = finalizeColorTexture(
    createTaglineCanvas(PANELCO_BRAND.greenLightHex, 'rgba(6, 78, 59, 0.72)'),
    maxAnisotropy,
  );
  const taglineDark = finalizeColorTexture(createTaglineCanvas('#111827'), maxAnisotropy);
  const taglineLight = finalizeColorTexture(createTaglineCanvas('#f8fafc'), maxAnisotropy);

  const hoodWordmarkDark = finalizeColorTexture(
    createWordmarkCanvas('PANELCO III', '#0f172a', 122),
    maxAnisotropy,
  );
  const hoodWordmarkLight = finalizeColorTexture(
    createWordmarkCanvas('PANELCO III', '#f8fafc', 122),
    maxAnisotropy,
  );
  const rearWordmarkDark = finalizeColorTexture(
    createWordmarkCanvas('PANELCO III', '#0f172a', 116),
    maxAnisotropy,
  );
  const rearWordmarkLight = finalizeColorTexture(
    createWordmarkCanvas('PANELCO III', '#f8fafc', 116),
    maxAnisotropy,
  );
  const innovaBadge = finalizeColorTexture(
    createWordmarkCanvas('INNOVA', '#334155', 110),
    maxAnisotropy,
  );
  const tireBump = createTireBumpTexture();
  const grilleMeshBump = createGrilleMeshBumpTexture();
  const engineCover = createEngineCoverTexture(maxAnisotropy);
  const contactShadow = createContactShadowTexture();
  const floorGrid = createFloorGridTexture(maxAnisotropy);

  const allTextures: THREE.Texture[] = [
    sealColor,
    sealMonoDark,
    sealMonoLight,
    taglineGreen,
    taglineGreenLight,
    taglineDark,
    taglineLight,
    hoodWordmarkDark,
    hoodWordmarkLight,
    rearWordmarkDark,
    rearWordmarkLight,
    innovaBadge,
    licensePlate,
    tireBump,
    grilleMeshBump,
    engineCover,
    contactShadow,
    floorGrid,
  ];

  return {
    sealColor,
    sealMonoDark,
    sealMonoLight,
    taglineGreen,
    taglineGreenLight,
    taglineDark,
    taglineLight,
    hoodWordmarkDark,
    hoodWordmarkLight,
    rearWordmarkDark,
    rearWordmarkLight,
    innovaBadge,
    licensePlate,
    tireBump,
    grilleMeshBump,
    engineCover,
    contactShadow,
    floorGrid,
    getLogoCanvas: () => sealColorCanvas,
    updateLicensePlate(plateText: string) {
      drawLicensePlateCanvas(plateCanvas, plateText);
      licensePlate.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      for (const tex of allTextures) {
        tex.dispose();
      }
    },
  };
}
