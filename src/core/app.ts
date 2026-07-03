/**
 * Application bootstrap + main loop (SPEC §4/§7/§11). Ties together: PlayCanvas Application, scene
 * factory, capability detection, quality selection, performance monitor, XR session lifecycle,
 * interaction dispatch, and UI.
 *
 * Frame loop (`app.on('update')`) is allocation-free: only number math + already-allocated objects.
 *
 * Verified APIs (playcanvas@2.19): pc.Application(canvas, opts), app.start(), app.on('update', cb),
 * app.setCanvasFillMode/Resolution, app.graphicsDevice.maxPixelRatio, app.xr (nullable), XrManager
 * events 'start'/'end'.
 */

import * as pc from 'playcanvas';

import { APP_CONFIG } from '../config/appConfig';
import {
  detectEnvironment,
  readXrFeatures,
  type EnvironmentCapabilities,
} from '../config/capabilities';
import { QualityTier, getProfile } from '../config/qualityProfiles';
import { FeatureFlags, InteractionLayer } from './featureFlags';
import { createScene, setArMode, type SceneRoots } from './sceneFactory';
import { AssetRegistry } from './assetRegistry';
import { PerformanceMonitor } from './performanceMonitor';
import { XrBootstrap } from './xrBootstrap';

import { CuffMaterialLibrary } from '../materials/cuffMaterials';
import { TextureSetProvider } from '../materials/textureSets';
import { LightingRig } from '../scene/lightingRig';
import { Environment } from '../scene/environment';
import { TrainingScene } from '../scene/trainingScene';
import { formatCapabilityDebug } from '../scene/debugScene';
import { selectInteractionLayer, describeLayer } from '../ar/fallbackModes';
import { ImageTracker, type MarkerResult } from '../ar/imageTracking';
import { CuffSize } from '../entities/cuffVariants';

import { LoadingScreen } from '../ui/loadingScreen';
import { ArEntryButton } from '../ui/arEntryButton';
import { UnsupportedMessage, reasonForUnsupported } from '../ui/unsupportedMessage';
import { StatusPanel } from '../ui/statusPanel';
import { QualityPanel } from '../ui/qualityPanel';
import { TrainingPanel } from '../ui/trainingPanel';

import { createLogger } from '../utils/logging';

const log = createLogger('app');

export class ARCuffApplication {
  private readonly app: pc.Application;
  private readonly roots: SceneRoots;
  private readonly flags = new FeatureFlags();
  private readonly perf: PerformanceMonitor;
  private readonly xr: XrBootstrap;
  private readonly imageTracker: ImageTracker;

  private readonly assets: AssetRegistry;
  private readonly textures: TextureSetProvider;
  private readonly materials: CuffMaterialLibrary;
  private readonly lighting: LightingRig;
  private readonly environment: Environment;
  private trainingScene: TrainingScene | null = null;

  // UI
  private readonly loading: LoadingScreen;
  private readonly arButton: ArEntryButton;
  private readonly unsupported: UnsupportedMessage;
  private readonly statusPanel: StatusPanel;
  private readonly qualityPanel: QualityPanel;
  private readonly trainingPanel: TrainingPanel;

  private env: EnvironmentCapabilities | null = null;
  private startTime = 0;

  /** Convenience accessor: the cuff sub-scene inside the training scene (null until built). */
  private get cuffScene() {
    return this.trainingScene ? this.trainingScene.cuffScene : null;
  }

  constructor(canvas: HTMLCanvasElement) {
    // Create the Application. It builds a WebGL2 graphics device and registers component systems.
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: true, // transparent buffer for optical see-through compositing
        depth: true,
        powerPreference: 'high-performance',
      },
    });

    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    this.startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // Scene + core systems.
    this.roots = createScene(this.app);
    this.assets = new AssetRegistry(this.app);
    this.textures = new TextureSetProvider(this.app.graphicsDevice, this.assets);
    this.materials = new CuffMaterialLibrary(this.textures);
    this.lighting = new LightingRig(this.app, this.roots.lightRoot);
    this.environment = new Environment(this.app, this.assets);
    this.perf = new PerformanceMonitor(APP_CONFIG.defaultQualityTier);
    this.xr = new XrBootstrap(this.app);

    // Image tracking is a first-class, UNGATED feature (CLAUDE.md §4.1). The tracker registers a
    // placeholder marker now; the XR bootstrap adds its images to the engine before each session
    // start. Real marker bytes (from the Room environment assets) are supplied via setMarkerImage.
    this.imageTracker = new ImageTracker(this.app);
    this.xr.setImageTracker(this.imageTracker);

    // UI (created up-front; loading screen covers them until ready).
    this.loading = new LoadingScreen();
    this.arButton = new ArEntryButton();
    this.unsupported = new UnsupportedMessage();
    this.statusPanel = new StatusPanel();
    this.qualityPanel = new QualityPanel();
    this.trainingPanel = new TrainingPanel();

    this.flags.setQualityTier(this.perf.currentTier);
  }

  /** Full async startup. Resolves once the scene is interactive. */
  async start(): Promise<void> {
    this.app.start();

    // 1) Capability detection (pre-session).
    this.loading.setMessage('Detecting capabilities...');
    this.env = await detectEnvironment(this.app.graphicsDevice);
    this.flags.setEnvironment(this.env);

    // 2) Apply the default quality profile.
    this.applyQuality(this.perf.currentTier);

    // 3) Build materials (procedural placeholders by default) + optional environment.
    this.loading.setMessage('Building materials...');
    await this.materials.build();
    await this.environment.load();
    this.environment.configure();
    this.environment.setArMode(false);

    // 4) Build the training scene (environment stand-in + cuff + controllers in one hierarchy).
    this.loading.setMessage('Assembling training scene...');
    this.trainingScene = new TrainingScene({
      app: this.app,
      device: this.app.graphicsDevice,
      camera: this.roots.camera,
      worldRoot: this.roots.worldRoot,
      materials: this.materials,
      assets: this.assets,
    });
    await this.trainingScene.initialize(CuffSize.Medium);
    this.trainingScene.applyProfile(getProfile(this.perf.currentTier));
    this.trainingScene.setArMode(false); // show env stand-in in preview
    this.trainingScene.cuffScene.setOnInputChange(() => this.reselectInteractionLayer());

    // 5) Wire UI handlers + XR lifecycle.
    this.wireUi();
    this.wireXrLifecycle();
    this.imageTracker.onMarker((result) => this.onMarkerPose(result));
    this.updateArAvailabilityUi();

    // 6) Performance monitor -> quality changes.
    this.perf.setTierChangeHandler((next) => this.applyQuality(next));

    // 7) Initial interaction layer (no session yet -> place/inspect).
    this.reselectInteractionLayer();

    // 8) Main loop.
    this.app.on('update', (dt: number) => this.onUpdate(dt));

    // Log load time against the budget.
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const loadSeconds = (now - this.startTime) / 1000;
    log.info(
      `startup complete in ${loadSeconds.toFixed(2)}s ` +
        `(budget ${APP_CONFIG.loadBudgetSeconds.min}-${APP_CONFIG.loadBudgetSeconds.max}s)`,
    );

    this.loading.hide();
    this.refreshStatus();
  }

  // --- frame loop (ALLOCATION-FREE) ---

  private onUpdate(dt: number): void {
    // Frame time in ms for the perf monitor (dt is seconds).
    const frameMs = dt * 1000;
    this.perf.update(dt, frameMs);

    // Lighting estimation sync (no-op if unavailable).
    this.lighting.update();

    // Image-tracking tick (ungated, allocation-free — CLAUDE.md §4.1/§2). No-op until a marker is
    // registered with real image bytes and actively tracked in a live session.
    this.imageTracker.update();

    // Interaction tick.
    if (this.cuffScene) this.cuffScene.update(dt);

    // Periodic status refresh is cheap; throttle to ~4 Hz via accumulator.
    this.statusAccum += dt;
    if (this.statusAccum >= 0.25) {
      this.statusAccum = 0;
      this.refreshStatus();
    }
  }

  private statusAccum = 0;
  private lastMarkerId = '';

  /**
   * Consume a tracked-marker pose. Scaffold seam (CLAUDE.md §4.1): the marker world pose is
   * available here for future anchoring of the training scene to a printed Room marker. For now it
   * only logs when a marker is first seen (allocation-free; `result` is reused — do not retain it).
   */
  private onMarkerPose(result: MarkerResult): void {
    if (result.id === this.lastMarkerId) return;
    this.lastMarkerId = result.id;
    log.debug(`marker "${result.id}" tracked (emulated=${result.emulated})`);
  }

  // --- quality ---

  private applyQuality(tier: QualityTier): void {
    const profile = getProfile(tier);

    // Device pixel ratio clamp (desktop/inspect).
    const device = this.app.graphicsDevice;
    if (typeof device.maxPixelRatio === 'number') {
      device.maxPixelRatio = Math.min(
        profile.maxPixelRatio,
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      );
    }

    this.lighting.applyProfile(profile);
    this.materials.setAnisotropy(profile.anisotropy);
    this.cuffScene?.applyProfile(profile);
    this.xr.applyProfile(profile);

    this.flags.setQualityTier(tier);
    this.qualityPanel.setActiveTier(tier);
    log.info(`quality -> ${profile.label}`);
  }

  // --- interaction layer selection ---

  private reselectInteractionLayer(): void {
    const sessionActive = this.xr.active;
    const handsTracked = sessionActive && !!this.cuffScene && this.cuffScene.handsTracked();
    const raySourcePresent = sessionActive && !!this.cuffScene && this.cuffScene.raySourcePresent();

    const layer = selectInteractionLayer({ sessionActive, handsTracked, raySourcePresent });
    this.flags.setInteractionLayer(layer);
    this.cuffScene?.setLayer(layer);
    log.info(`interaction layer -> ${describeLayer(layer)}`);

    // Update in-session feature flags too.
    this.flags.setXrFeatures(readXrFeatures(this.app));
  }

  // --- UI wiring ---

  private wireUi(): void {
    this.arButton.setOnEnter(() => {
      void this.enterAr();
    });

    this.qualityPanel.setHandlers({
      onTier: (tier) => {
        this.perf.forceTier(tier);
        this.applyQuality(tier);
      },
      onSize: (size) => {
        // Route through the training scene: it detaches/re-mounts the arm + stethoscope around the
        // rebuild (cuff.build clears the root's children — a bare cuffScene.setSize would destroy them).
        void this.trainingScene?.setSize(size);
      },
      onInflate: () => {
        this.cuffScene?.triggerInflationCycle();
      },
      onElbow: (deg) => {
        this.trainingScene?.setElbowFlexion(deg);
      },
      onPump: () => {
        this.cuffScene?.pumpBulb();
      },
      onValve: () => {
        this.cuffScene?.cycleValve();
      },
    });
    // Valve state can change from ANY path (3D bulb/screen presses, UI, pumping) — mirror it in UI.
    this.cuffScene?.setOnValveChange((state) => this.qualityPanel.setValveState(state));

    // Training panel: mode/next/restart wired to the training layer; status pushed from the machine.
    this.trainingPanel.setHandlers({
      onMode: (mode) => this.cuffScene?.setTrainingMode(mode),
      onNext: () => this.cuffScene?.trainingNext(),
      onRestart: () => this.cuffScene?.trainingRestart(),
    });
    this.cuffScene?.onTrainingStatus((status) => this.trainingPanel.setStatus(status));

    // Desktop inspect input: drag to orbit, wheel to zoom (only meaningful out of AR).
    this.wireDesktopInspectInput();
  }

  private wireDesktopInspectInput(): void {
    if (typeof window === 'undefined') return;
    let dragging = false;
    let partDragging = false;
    let lastX = 0;
    let lastY = 0;
    const canvas = this.app.graphicsDevice.canvas as HTMLCanvasElement;

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.xr.active) return;
      // Part interactions first (arm/band/device drags, bulb pump, valve press); when the pointer
      // lands on a part, camera orbit stands down for this drag. Empty space still orbits.
      partDragging = this.cuffScene?.pointerDown(e.clientX, e.clientY) ?? false;
      if (partDragging) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      if (partDragging) {
        this.cuffScene?.pointerUp();
        partDragging = false;
      }
      dragging = false;
    });
    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.xr.active || !this.cuffScene) return;
      if (partDragging) {
        this.cuffScene.pointerMove(e.clientX, e.clientY);
        return;
      }
      if (!dragging) return;
      const dx = (e.clientX - lastX) * 0.3;
      const dy = (e.clientY - lastY) * 0.3;
      lastX = e.clientX;
      lastY = e.clientY;
      this.cuffScene.orbit(dx, dy);
    });
    canvas.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (this.xr.active || !this.cuffScene) return;
        e.preventDefault();
        this.cuffScene.zoom(e.deltaY * 0.0005);
      },
      { passive: false },
    );
  }

  private wireXrLifecycle(): void {
    const xr = this.app.xr;
    if (!xr) return;

    xr.on('start', () => {
      log.info('XR session started');
      setArMode(this.roots, true);
      this.environment.setArMode(true);
      this.trainingScene?.setArMode(true); // hide env stand-in (optical see-through)
      this.flags.setSessionActive(true);
      this.arButton.setInSession(true);
      this.unsupported.hide();
      this.cuffScene?.onSessionStart();
      this.reselectInteractionLayer();
    });

    xr.on('end', () => {
      log.info('XR session ended');
      setArMode(this.roots, false);
      this.environment.setArMode(false);
      this.trainingScene?.setArMode(false); // restore env stand-in in preview
      this.lighting.resetToDefaults();
      this.flags.setSessionActive(false);
      this.arButton.setInSession(false);
      this.cuffScene?.onSessionEnd();
      this.reselectInteractionLayer();
      this.updateArAvailabilityUi();
    });

    // Availability can change after load; keep the button in sync.
    xr.on('available:immersive-ar', () => this.updateArAvailabilityUi());
  }

  private async enterAr(): Promise<void> {
    const cam = this.roots.camera.camera;
    if (!cam) return;
    const profile = getProfile(this.perf.currentTier);
    const result = await this.xr.startAr(cam, profile);
    if (!result.ok) {
      log.warn('AR start failed', result.error);
      this.unsupported.show(
        result.error ? `AR could not start: ${result.error.message}` : 'AR could not start.',
      );
    }
  }

  private updateArAvailabilityUi(): void {
    const env = this.env;
    const arAvailable = this.xr.isArAvailable() && !!env && env.secureContext;
    if (arAvailable) {
      this.arButton.setAvailable(true);
      this.unsupported.hide();
    } else {
      const reason = env
        ? reasonForUnsupported(env.secureContext, env.webxrPresent, this.xr.isArAvailable())
        : 'Detecting capabilities...';
      this.arButton.setAvailable(false, reason);
      // Only surface the full panel when we are confident AR is unsupported (not mid-detection).
      if (env && (!env.secureContext || !env.webxrPresent || !env.immersiveArSupported)) {
        this.unsupported.show(reason);
      }
    }
  }

  private refreshStatus(): void {
    const state = this.flags.get();
    this.statusPanel.setCapabilities(
      formatCapabilityDebug(state.environment, state.xrFeatures, state.interactionLayer, state.sessionActive),
    );
    this.statusPanel.setPerformance(this.perf.snapshot());
  }

  /** Expose the engine app (e.g. for teardown in tests/tools). */
  get engine(): pc.Application {
    return this.app;
  }
}

// Re-export for convenience.
export { InteractionLayer };
