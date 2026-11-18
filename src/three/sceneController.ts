import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  CAMERA_PRESETS,
  computeFourViewRects,
  dampValue,
  FleetSheetData,
  formatPlateDisplay,
  FourViewId,
  PANELCO_BRAND,
  StudioTheme,
  VehicleState,
  ViewMode,
} from '../model/vehicleConfig';
import {
  buildInnovaModel,
  getTargetArticulationAngles,
  InnovaRig,
  InteractablePart,
} from './innovaModel';
import { createProceduralTextures, ProceduralTextureBundle } from './textures';

export interface SceneCallbacks {
  onPartClicked: (part: InteractablePart) => void;
  onPartHovered: (part: InteractablePart | null) => void;
  onContextLost: (lost: boolean) => void;
}

export interface SceneController {
  syncState: (next: VehicleState) => void;
  setReservedInsets: (topPx: number, bottomPx: number) => void;
  exportFourViewSheet: (sheet: FleetSheetData) => string | null;
  dispose: () => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

// Module-level pre-allocated scratch helpers (zero GC inside animation loop)
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

export function createInnovaSceneController(
  container: HTMLElement,
  initialState: VehicleState,
  callbacks: SceneCallbacks,
): SceneController {
  const isSoftwareGl = detectSoftwareWebGL();

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('data-testid', 'innova-webgl-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdbe2ea);
  scene.fog = new THREE.FogExp2(0xdbe2ea, 0.017);

  // Photographic Automotive Cyclorama Softbox Light-Tent PMREM Environment:
  // Dark studio floor + crisp charcoal horizon + overhead diffused silk light bank + side edge cards
  // gives real automotive sheetmetal tonal falloff and clearcoat horizon lines (eliminates cartoon flat shading!).
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x28303c);
  const envTempGeos: THREE.BufferGeometry[] = [];
  const envTempMats: THREE.Material[] = [];

  const trackEnvGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    envTempGeos.push(g);
    return g;
  };
  const trackEnvMat = <T extends THREE.Material>(m: T): T => {
    envTempMats.push(m);
    return m;
  };

  // Upper cool-white cyclorama sky dome
  const skyDome = new THREE.Mesh(
    trackEnvGeo(new THREE.SphereGeometry(18, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48)),
    trackEnvMat(new THREE.MeshBasicMaterial({ color: 0x8a95a6, side: THREE.BackSide })),
  );
  envScene.add(skyDome);

  // Dark slate lower studio bounce floor (creates crisp dark lower reflections along doors & chrome!)
  const darkFloor = new THREE.Mesh(
    trackEnvGeo(new THREE.CircleGeometry(18, 32)),
    trackEnvMat(new THREE.MeshBasicMaterial({ color: 0x161a22, side: THREE.DoubleSide })),
  );
  darkFloor.rotation.x = -Math.PI / 2;
  darkFloor.position.y = -2.2;
  envScene.add(darkFloor);

  // Charcoal horizon band for genuine automotive clearcoat beltline reflection split
  const horizonBand = new THREE.Mesh(
    trackEnvGeo(new THREE.CylinderGeometry(16, 16, 3.6, 36, 1, true)),
    trackEnvMat(new THREE.MeshBasicMaterial({ color: 0x1e2530, side: THREE.BackSide })),
  );
  horizonBand.position.y = 0.2;
  envScene.add(horizonBand);

  // Main overhead automotive photography silk softbox bank (3 crisp light ribbons)
  const mainSoftboxGeo = trackEnvGeo(new THREE.PlaneGeometry(11.5, 2.2));
  const brightSilkMat = trackEnvMat(
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
  for (const sx of [-2.8, 0, 2.8]) {
    const panel = new THREE.Mesh(mainSoftboxGeo, brightSilkMat);
    panel.position.set(sx, 8.2, 0.2);
    panel.rotation.x = Math.PI / 2;
    envScene.add(panel);
  }

  // Front-top angled nose highlight softbox (sculpts smooth rounded hood & grille chrome highlights)
  const noseBank = new THREE.Mesh(
    trackEnvGeo(new THREE.PlaneGeometry(8.5, 2.6)),
    trackEnvMat(new THREE.MeshBasicMaterial({ color: 0xf7faff, side: THREE.DoubleSide })),
  );
  noseBank.position.set(0, 5.4, 9.2);
  noseBank.lookAt(0, 0.8, 0);
  envScene.add(noseBank);

  // Elongated warm & cool side specular reflection cards (gives liquid highlights along curved doors & fenders)
  const sideCardGeo = trackEnvGeo(new THREE.PlaneGeometry(11.0, 1.55));
  const warmSideMat = trackEnvMat(
    new THREE.MeshBasicMaterial({ color: 0xfff6ea, side: THREE.DoubleSide }),
  );
  const coolSideMat = trackEnvMat(
    new THREE.MeshBasicMaterial({ color: 0xdfecff, side: THREE.DoubleSide }),
  );

  const leftCard = new THREE.Mesh(sideCardGeo, warmSideMat);
  leftCard.position.set(9.6, 3.2, 0.3);
  leftCard.rotation.y = -Math.PI / 2;
  envScene.add(leftCard);

  const rightCard = new THREE.Mesh(sideCardGeo, coolSideMat);
  rightCard.position.set(-9.6, 3.2, 0.3);
  rightCard.rotation.y = Math.PI / 2;
  envScene.add(rightCard);

  // Rear subtle rim reflection card
  const rearCard = new THREE.Mesh(
    trackEnvGeo(new THREE.PlaneGeometry(7.5, 1.8)),
    coolSideMat,
  );
  rearCard.position.set(0, 4.2, -9.8);
  rearCard.lookAt(0, 0.9, 0);
  envScene.add(rearCard);

  const envTarget = pmremGenerator.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;
  for (const g of envTempGeos) g.dispose();
  for (const m of envTempMats) m.dispose();
  pmremGenerator.dispose();

  // Balanced 3-Point Automotive Studio Lighting Rig (delivers true tonal depth without blowing out white paint)
  const hemiLight = new THREE.HemisphereLight(0xdce8fa, 0x3b424d, 0.56);
  hemiLight.position.set(0, 12, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.85);
  keyLight.position.set(6.4, 8.6, 6.2);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1.0;
  keyLight.shadow.camera.far = 26;
  keyLight.shadow.camera.left = -4.5;
  keyLight.shadow.camera.right = 4.5;
  keyLight.shadow.camera.top = 4.5;
  keyLight.shadow.camera.bottom = -4.5;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8dcf8, 0.48);
  fillLight.position.set(-6.5, 3.8, 4.8);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xd2e4ff, 0.85);
  rimLight.position.set(-5.8, 5.4, -6.8);
  scene.add(rimLight);

  const softboxLights: THREE.RectAreaLight[] = [];
  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
    const overheadSoftbox = new THREE.RectAreaLight(0xffffff, 2.4, 7.8, 3.4);
    overheadSoftbox.position.set(0, 4.6, 0.4);
    overheadSoftbox.lookAt(0, 0.8, 0);
    scene.add(overheadSoftbox);
    softboxLights.push(overheadSoftbox);
  }

  // Procedural Textures & Sculpted Toyota Innova Model
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let triggerLogoRefresh = () => {};
  const textures: ProceduralTextureBundle = createProceduralTextures(
    maxAniso,
    formatPlateDisplay(initialState.fleetSheet),
    () => triggerLogoRefresh(),
  );

  // Architectural Showroom Floor & Subtle Double Turntable Ring
  const floorGeo = new THREE.CircleGeometry(28, 48);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.floorGrid,
    roughness: 0.62,
    metalness: 0.08,
  });
  const studioFloor = new THREE.Mesh(floorGeo, floorMat);
  studioFloor.receiveShadow = true;
  studioFloor.position.y = 0;
  scene.add(studioFloor);

  const ringGeo = new THREE.RingGeometry(2.74, 2.80, 72);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x019240,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const turntableRing = new THREE.Mesh(ringGeo, ringMat);
  turntableRing.position.y = 0.004;
  scene.add(turntableRing);

  const innova: InnovaRig = buildInnovaModel(textures, isSoftwareGl);
  scene.add(innova.root);

  // Main 3D Perspective Camera + OrbitControls
  const initW = Math.max(2, container.clientWidth || window.innerWidth);
  const initH = Math.max(2, container.clientHeight || window.innerHeight);
  const perspCamera = new THREE.PerspectiveCamera(
    CAMERA_PRESETS.orbit.fov,
    initW / initH,
    0.1,
    120,
  );
  perspCamera.position.set(...CAMERA_PRESETS.orbit.position);

  const controls = new OrbitControls(perspCamera, renderer.domElement);
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2.4;
  controls.maxDistance = 12.5;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.target.set(...CAMERA_PRESETS.orbit.target);
  controls.update();

  // Four dedicated Orthographic Cameras for live 2x2 Four-View Mode
  const orthoCameras: Record<FourViewId, THREE.OrthographicCamera> = {
    right: new THREE.OrthographicCamera(-3, 3, 1.6, -1.6, 0.1, 40),
    left: new THREE.OrthographicCamera(-3, 3, 1.6, -1.6, 0.1, 40),
    front: new THREE.OrthographicCamera(-2.4, 2.4, 1.5, -1.5, 0.1, 40),
    rear: new THREE.OrthographicCamera(-2.4, 2.4, 1.5, -1.5, 0.1, 40),
  };

  let state: VehicleState = { ...initialState };
  let topInsetPx = 68;
  let bottomInsetPx = 148;
  let lastPlateText = formatPlateDisplay(initialState.fleetSheet);

  // Smooth kinematic state
  const currentAngles = {
    frontLeftDoor: 0,
    frontRightDoor: 0,
    rearLeftDoor: 0,
    rearRightDoor: 0,
    hood: 0,
    tailgate: 0,
  };
  let currentSteerRad = 0;
  let wheelSpinRad = 0;
  let hazardElapsed = 0;
  let hazardPulseOn = false;
  let isCameraTransitioning = false;
  let targetFov = CAMERA_PRESETS.orbit.fov;

  const applyStudioEnvironment = (theme: StudioTheme, viewMode: ViewMode) => {
    const isFourView = viewMode === 'four-view';
    if (theme === 'night') {
      scene.background = new THREE.Color(0x0d121b);
      scene.fog = new THREE.FogExp2(0x0d121b, 0.025);
      floorMat.color.setHex(0x1f2634);
      floorMat.roughness = 0.44;
      ringMat.color.setHex(0x475569);
      hemiLight.intensity = 0.28;
      keyLight.intensity = 0.85;
      fillLight.intensity = 0.25;
      rimLight.intensity = 1.15;
      for (const l of softboxLights) l.intensity = 1.35;
      studioFloor.visible = !isFourView;
      turntableRing.visible = !isFourView;
    } else if (theme === 'sketch') {
      scene.background = new THREE.Color(0xf8f9fb);
      scene.fog = null;
      floorMat.color.setHex(0xffffff);
      floorMat.roughness = 0.95;
      ringMat.color.setHex(0xcbd5e1);
      hemiLight.intensity = 1.05;
      keyLight.intensity = 1.15;
      fillLight.intensity = 0.45;
      rimLight.intensity = 0.55;
      for (const l of softboxLights) l.intensity = 1.0;
      studioFloor.visible = false;
      turntableRing.visible = false;
    } else {
      scene.background = new THREE.Color(0xdbe2ea);
      scene.fog = isFourView ? null : new THREE.FogExp2(0xdbe2ea, 0.017);
      floorMat.color.setHex(0xffffff);
      floorMat.roughness = 0.66;
      ringMat.color.setHex(0x019240);
      hemiLight.intensity = 0.56;
      keyLight.intensity = 1.85;
      fillLight.intensity = 0.48;
      rimLight.intensity = 0.85;
      for (const l of softboxLights) l.intensity = 2.4;
      studioFloor.visible = !isFourView;
      turntableRing.visible = !isFourView;
    }
  };

  innova.applyPaintAndTheme(state.paintId, state.studioTheme, state.liveryStyle);
  innova.applyLighting(state.lighting, false);
  applyStudioEnvironment(state.studioTheme, state.viewMode);

  // Pre-warm shaders once on hardware GPUs
  if (!isSoftwareGl) {
    renderer.compile(scene, perspCamera);
  }

  // --- Coalesced On-Demand Rendering with Software-WebGL afterDraw Pacing ---
  let disposed = false;
  let frameId = 0;
  let renderBusy = false;
  let renderDirty = false;
  let lastTimestamp = performance.now();

  function afterDraw(cb: () => void) {
    if (disposed) return;
    const gl = renderer.getContext() as WebGL2RenderingContext | null;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    } else {
      frameId = window.setTimeout(cb, 80);
    }
  }

  function renderActiveViewport(width: number, height: number) {
    if (state.viewMode === 'four-view') {
      const quads = computeFourViewRects(width, height, topInsetPx, bottomInsetPx);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.clear();
      renderer.setScissorTest(true);

      for (const q of quads) {
        const cam = orthoCameras[q.id];
        const aspect = Math.max(0.2, q.width / Math.max(1, q.height));
        // Ensure full 4.74m car length always fits side views comfortably even on narrow quadrants
        const minHalfW = q.id === 'right' || q.id === 'left' ? 2.85 : 1.55;
        let halfH = q.orthoHalfHeight;
        let halfW = halfH * aspect;
        if (halfW < minHalfW) {
          halfW = minHalfW;
          halfH = halfW / aspect;
        }
        cam.left = -halfW;
        cam.right = halfW;
        cam.top = halfH;
        cam.bottom = -halfH;
        cam.position.set(...q.cameraPosition);
        cam.lookAt(...q.cameraTarget);
        cam.updateProjectionMatrix();

        renderer.setViewport(q.x, q.y, q.width, q.height);
        renderer.setScissor(q.x, q.y, q.width, q.height);
        renderer.render(scene, cam);
      }
      renderer.setScissorTest(false);
    } else {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.render(scene, perspCamera);
    }
  }

  const computeResponsiveFov = (baseFov: number, aspect: number): number => {
    if (aspect >= 1) return baseFov;
    return Math.min(64, baseFov / Math.pow(Math.max(0.35, aspect), 0.44));
  };

  function stepSimulation(dt: number): boolean {
    let stillMoving = false;
    const targets = getTargetArticulationAngles(state.articulation);
    const lambda = isSoftwareGl ? 32 : 9;

    const keys = [
      'frontLeftDoor',
      'frontRightDoor',
      'rearLeftDoor',
      'rearRightDoor',
      'hood',
      'tailgate',
    ] as const;

    for (const k of keys) {
      const next = dampValue(currentAngles[k], targets[k], lambda, dt);
      if (Math.abs(next - targets[k]) > 0.001) {
        stillMoving = true;
      }
      currentAngles[k] = next;
    }
    innova.setArticulationAngles(currentAngles);

    // Smooth front wheel steering
    const targetSteerRad = THREE.MathUtils.degToRad(state.steeringDeg);
    currentSteerRad = dampValue(currentSteerRad, targetSteerRad, isSoftwareGl ? 32 : 11, dt);
    if (Math.abs(currentSteerRad - targetSteerRad) > 0.001) {
      stillMoving = true;
    }

    // Continuous wheel spin if enabled
    if (state.wheelSpin) {
      wheelSpinRad = (wheelSpinRad + dt * 4.2) % (Math.PI * 2);
      stillMoving = true;
    }
    innova.setWheelKinematics(currentSteerRad, wheelSpinRad);

    // Hazard blink cycle (~1.4Hz)
    if (state.lighting.hazards) {
      hazardElapsed += dt;
      const nextPulse = Math.floor(hazardElapsed * 2.2) % 2 === 0;
      if (nextPulse !== hazardPulseOn) {
        hazardPulseOn = nextPulse;
        innova.applyLighting(state.lighting, hazardPulseOn);
      }
      stillMoving = true;
    } else if (hazardPulseOn) {
      hazardPulseOn = false;
      innova.applyLighting(state.lighting, false);
    }

    // Smooth scripted camera transition in 3D view
    const desiredFov = computeResponsiveFov(targetFov, perspCamera.aspect);
    if (isCameraTransitioning && state.viewMode !== 'four-view') {
      const camLambda = isSoftwareGl ? 34 : 7.5;
      const alpha = 1 - Math.exp(-camLambda * Math.min(dt, 0.1));
      perspCamera.position.lerp(_camGoalPos, alpha);
      controls.target.lerp(_camGoalTarget, alpha);
      perspCamera.fov = dampValue(perspCamera.fov, desiredFov, camLambda, dt);
      perspCamera.updateProjectionMatrix();

      if (
        perspCamera.position.distanceTo(_camGoalPos) < 0.015 &&
        controls.target.distanceTo(_camGoalTarget) < 0.01
      ) {
        perspCamera.position.copy(_camGoalPos);
        controls.target.copy(_camGoalTarget);
        perspCamera.fov = desiredFov;
        perspCamera.updateProjectionMatrix();
        isCameraTransitioning = false;
      } else {
        stillMoving = true;
      }
    } else if (Math.abs(perspCamera.fov - desiredFov) > 0.1) {
      perspCamera.fov = desiredFov;
      perspCamera.updateProjectionMatrix();
    }

    // Auto-rotate in 3D mode (disabled automatically in Four-View & software WebGL unless explicitly turned on)
    const shouldRotate =
      state.autoRotate && state.viewMode !== 'four-view' && !isCameraTransitioning;
    controls.autoRotate = shouldRotate;
    controls.autoRotateSpeed = 1.4;
    if (shouldRotate) {
      stillMoving = true;
    }

    if (state.viewMode !== 'four-view') {
      const dampingMoved = controls.update();
      if (dampingMoved && !isSoftwareGl) {
        stillMoving = true;
      }
    }

    return stillMoving;
  }

  let renderedWidth = 0;
  let renderedHeight = 0;

  function requestRender() {
    if (disposed) return;
    if (renderBusy) {
      renderDirty = true;
      return;
    }
    renderBusy = true;
    frameId = requestAnimationFrame((now) => {
      if (disposed) return;
      renderDirty = false;
      const dt = Math.min(0.1, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      const w = Math.max(2, container.clientWidth || window.innerWidth);
      const h = Math.max(2, container.clientHeight || window.innerHeight);
      if (w !== renderedWidth || h !== renderedHeight) {
        renderedWidth = w;
        renderedHeight = h;
        perspCamera.aspect = w / h;
        perspCamera.fov = computeResponsiveFov(targetFov, w / h);
        perspCamera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }

      const needsMore = stepSimulation(dt);
      renderActiveViewport(w, h);

      const done = () => {
        renderBusy = false;
        if (renderDirty || needsMore) {
          requestRender();
        }
      };

      if (isSoftwareGl) {
        afterDraw(done);
      } else {
        done();
      }
    });
  }

  const handleResize = () => {
    requestRender();
  };
  triggerLogoRefresh = () => {
    requestRender();
  };

  // Initial size & immediate first frame
  const startW = Math.max(2, container.clientWidth || window.innerWidth);
  const startH = Math.max(2, container.clientHeight || window.innerHeight);
  renderedWidth = startW;
  renderedHeight = startH;
  perspCamera.aspect = startW / startH;
  perspCamera.updateProjectionMatrix();
  renderer.setSize(startW, startH, false);

  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);

  // Cancel scripted camera transition immediately when user grabs OrbitControls
  const onControlsStart = () => {
    isCameraTransitioning = false;
  };
  const onControlsChange = () => {
    requestRender();
  };
  controls.addEventListener('start', onControlsStart);
  controls.addEventListener('change', onControlsChange);

  // --- Lightweight Raycasting on Innova Interactables (Click + Throttled Hover) ---
  let pointerDownX = 0;
  let pointerDownY = 0;
  let lastHoverCheck = 0;
  let lastHoveredPart: InteractablePart | null = null;

  const pickInteractable = (clientX: number, clientY: number): InteractablePart | null => {
    if (state.viewMode === 'four-view') return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, perspCamera);
    const hits = _raycaster.intersectObjects(innova.interactables, false);
    if (hits.length > 0) {
      return (hits[0].object.userData.interactablePart as InteractablePart) ?? null;
    }
    return null;
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
  };

  const onPointerUp = (e: PointerEvent) => {
    const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    if (dist > 6) return; // Drag orbit, not a click
    const part = pickInteractable(e.clientX, e.clientY);
    if (part) {
      callbacks.onPartClicked(part);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - lastHoverCheck < 55) return;
    lastHoverCheck = now;
    const part = pickInteractable(e.clientX, e.clientY);
    if (part !== lastHoveredPart) {
      lastHoveredPart = part;
      renderer.domElement.style.cursor = part ? 'pointer' : 'grab';
      callbacks.onPartHovered(part);
    }
  };

  const onContextLost = (e: Event) => {
    e.preventDefault();
    callbacks.onContextLost(true);
  };
  const onContextRestored = () => {
    callbacks.onContextLost(false);
    requestRender();
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  // Trigger initial draw
  requestRender();

  // --- Export Crisp Printable PANELCO III VEHICLE SKETCH (Four View) PNG ---
  const exportFourViewSheet = (sheet: FleetSheetData): string | null => {
    try {
      const exportW = 1600;
      const exportH = 1120;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = exportW;
      outCanvas.height = exportH;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return null;

      // Clean white drafting paper background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportW, exportH);

      // Outer border
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 36, exportW - 72, exportH - 72);

      // Top Left Official PANELCO III Green Seal + INNOVA/REVO Box
      ctx.drawImage(textures.getLogoCanvas(), 68, 58, 92, 92);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(174, 68, 178, 52);
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 20px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('INNOVA / REVO', 190, 94);

      ctx.fillStyle = PANELCO_BRAND.greenHex;
      ctx.font = 'italic 700 18px "Dancing Script", Georgia, cursive';
      ctx.fillText(PANELCO_BRAND.tagline, 174, 140);

      // Header Fields matching the attached PANELCO III sheet
      const fields: Array<[string, string, number]> = [
        ["DESIGNATED DRIVER'S NAME", sheet.driverName, 78],
        ['SIGNATURE, DATE & TIME', sheet.dateTime, 114],
        [
          'PLATE NUMBER / BODY NUMBER',
          [sheet.plateNumber, sheet.bodyNumber].filter(Boolean).join('  /  '),
          150,
        ],
      ];
      for (const [label, value, y] of fields) {
        ctx.fillStyle = '#334155';
        ctx.font = '600 15px "Plus Jakarta Sans", Arial, sans-serif';
        ctx.fillText(label, 360, y);
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 17px "JetBrains Mono", monospace';
        ctx.fillText(value || '—', 640, y);
        ctx.beginPath();
        ctx.moveTo(632, y + 11);
        ctx.lineTo(1320, y + 11);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Synchronously render live 4 orthographic quadrants on the WebGL canvas
      const prevMode = state.viewMode;
      const prevFloorVis = studioFloor.visible;
      const prevRingVis = turntableRing.visible;
      const prevBg = scene.background;
      const prevFog = scene.fog;

      state = { ...state, viewMode: 'four-view' };
      studioFloor.visible = false;
      turntableRing.visible = false;
      scene.background = new THREE.Color(0xffffff);
      scene.fog = null;

      const curW = Math.max(2, container.clientWidth || window.innerWidth);
      const curH = Math.max(2, container.clientHeight || window.innerHeight);
      const savedTop = topInsetPx;
      const savedBottom = bottomInsetPx;
      topInsetPx = 0;
      bottomInsetPx = 0;
      renderActiveViewport(curW, curH);

      // Draw live rendered 4-view quad into the sheet canvas
      ctx.drawImage(renderer.domElement, 72, 185, exportW - 144, 790);

      // Restore viewport state immediately
      topInsetPx = savedTop;
      bottomInsetPx = savedBottom;
      state = { ...state, viewMode: prevMode };
      studioFloor.visible = prevFloorVis;
      turntableRing.visible = prevRingVis;
      scene.background = prevBg;
      scene.fog = prevFog;
      requestRender();

      // View Titles matching exact placement on the attached sheet
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 21px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RIGHT SIDE VIEW', 72 + (exportW - 144) * 0.25, 570);
      ctx.fillText('LEFT SIDE VIEW', 72 + (exportW - 144) * 0.75, 570);
      ctx.fillText('FRONT VIEW', 72 + (exportW - 144) * 0.25, 995);
      ctx.fillText('REAR VIEW', 72 + (exportW - 144) * 0.75, 995);

      // Bottom Title Banner
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(72, 1022, exportW - 144, 44);
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 18px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('PANELCO III VEHICLE SKETCH (Four View)', exportW / 2, 1045);

      return outCanvas.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  return {
    syncState(next: VehicleState) {
      const prevView = state.viewMode;
      const prevPaint = state.paintId;
      const prevTheme = state.studioTheme;
      const prevLivery = state.liveryStyle;

      state = {
        ...next,
        articulation: { ...next.articulation },
        lighting: { ...next.lighting },
        fleetSheet: { ...next.fleetSheet },
      };

      // Update paint, theme & branding decals
      if (
        prevPaint !== next.paintId ||
        prevTheme !== next.studioTheme ||
        prevLivery !== next.liveryStyle
      ) {
        innova.applyPaintAndTheme(next.paintId, next.studioTheme, next.liveryStyle);
      }

      if (prevTheme !== next.studioTheme || prevView !== next.viewMode) {
        applyStudioEnvironment(next.studioTheme, next.viewMode);
      }

      // Update live license plate canvas texture
      const plateDisplay = formatPlateDisplay(next.fleetSheet);
      if (plateDisplay !== lastPlateText) {
        lastPlateText = plateDisplay;
        textures.updateLicensePlate(plateDisplay);
      }

      // Update lighting state immediately
      innova.applyLighting(next.lighting, next.lighting.hazards ? hazardPulseOn : false);

      // Trigger smooth camera preset transition when ViewMode changes
      if (prevView !== next.viewMode) {
        controls.enabled = next.viewMode !== 'four-view';
        if (next.viewMode !== 'four-view') {
          const preset = CAMERA_PRESETS[next.viewMode];
          _camGoalPos.set(...preset.position);
          _camGoalTarget.set(...preset.target);
          targetFov = preset.fov;
          isCameraTransitioning = true;
        } else {
          isCameraTransitioning = false;
        }
      }

      requestRender();
    },

    setReservedInsets(topPx: number, bottomPx: number) {
      if (topInsetPx !== topPx || bottomInsetPx !== bottomPx) {
        topInsetPx = topPx;
        bottomInsetPx = bottomPx;
        requestRender();
      }
    },

    exportFourViewSheet,

    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      innova.dispose();
      textures.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
