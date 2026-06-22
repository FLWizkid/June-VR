/**
 * Training scene (SPEC STEP 6 — "attach both to a common scene hierarchy").
 *
 * Composes the two pieces of content into ONE hierarchy under the world root:
 *   - the EXISTING `CuffScene` (cuff entity + all interaction/animation/training controllers), and
 *   - the `EnvironmentRoot` (env GLB seam + procedural stand-in), whose transform is INDEPENDENT of
 *     the cuff and which is HIDDEN in AR (optical see-through — never paint over the real world).
 *
 * This is a thin orchestrator: it does not duplicate cuff/interaction logic (that stays in CuffScene)
 * and does not duplicate session logic (that stays in core/xrBootstrap + app). It exists so the app
 * holds a single object that owns "the whole training world" and so environment + cuff are mounted
 * together.
 */

import type { QualityProfile } from '../config/qualityProfiles';
import type { AssetRegistry } from '../core/assetRegistry';
import type { CuffMaterialLibrary } from '../materials/cuffMaterials';
import { CuffSize } from '../entities/cuffVariants';
import { EnvironmentRoot } from '../entities/environmentRoot';
import { CuffScene, type CuffSceneDeps } from './cuffScene';

export interface TrainingSceneDeps extends CuffSceneDeps {
  readonly materials: CuffMaterialLibrary;
  readonly assets: AssetRegistry;
}

export class TrainingScene {
  /** The composited cuff sub-scene (cuff + controllers + training). */
  readonly cuffScene: CuffScene;
  /** The environment seam/stand-in (independent transform; hidden in AR). */
  readonly environment: EnvironmentRoot;

  constructor(deps: TrainingSceneDeps) {
    // Cuff + controllers (mounts the cuff under worldRoot itself).
    this.cuffScene = new CuffScene(deps);

    // Environment mounted under the SAME world root, independent of the cuff transform.
    this.environment = new EnvironmentRoot(deps.device, deps.assets);
    deps.worldRoot.addChild(this.environment.root);
  }

  /** Build cuff + environment. Await before first frame. */
  async initialize(size: CuffSize = CuffSize.Medium): Promise<void> {
    // Build the environment first (cheap / non-blocking on failure), then the cuff.
    await this.environment.build();
    await this.cuffScene.initialize(size);
  }

  /** Apply a quality profile to the composited content. */
  applyProfile(profile: QualityProfile): void {
    this.cuffScene.applyProfile(profile);
  }

  /** AR vs preview: hide the environment in AR; cuff sub-scene handles its own AR lifecycle. */
  setArMode(arActive: boolean): void {
    this.environment.setArMode(arActive);
  }

  /** True if a real environment GLB loaded (vs procedural stand-in) — for status/README. */
  get environmentIsReal(): boolean {
    return this.environment.isRealModel;
  }

  dispose(): void {
    this.cuffScene.dispose();
    this.environment.dispose();
  }
}
