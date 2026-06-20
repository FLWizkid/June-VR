/**
 * Low-level StandardMaterial construction helpers.
 *
 * Centralizes the metalness-workflow PBR defaults and the additive-display sanity rules from
 * SPEC §4/§6 (no emissive on physical surfaces, no mirror gloss, ORM channel wiring). Higher-level
 * cuff materials (materials/cuffMaterials.ts) compose these.
 *
 * Verified against playcanvas@2.19 StandardMaterial: `useMetalness`, `metalness`, `gloss`,
 * `glossInvert`, `diffuse`, `normalMap`, `aoMap`, `metalnessMap`, `glossMap`, `opacity`, `blendType`.
 */

import * as pc from 'playcanvas';

export interface PbrParams {
  /** Base color (linear). */
  readonly diffuse: pc.Color;
  /** 0 = dielectric, 1 = metal. */
  readonly metalness: number;
  /**
   * Perceptual roughness [0..1]. Stored as gloss with `glossInvert = true` so authoring stays in
   * roughness terms (matches glTF/ORM).
   */
  readonly roughness: number;
  /** Optional transparency [0..1]; <1 enables alpha blending. */
  readonly opacity?: number;
  /** Two-sided lighting (for thin fabric/labels). */
  readonly twoSided?: boolean;
}

export interface PbrMaps {
  readonly diffuseMap?: pc.Texture | null;
  readonly normalMap?: pc.Texture | null;
  /** Packed ORM (R=AO, G=Roughness, B=Metalness). Channels are wired below. */
  readonly ormMap?: pc.Texture | null;
  /** Standalone AO map (used if no packed ORM). */
  readonly aoMap?: pc.Texture | null;
}

/**
 * Create a StandardMaterial configured for training-grade PBR realism on an optical see-through
 * display. No emissive, no exaggerated specular.
 */
export function createPbrMaterial(params: PbrParams, maps: PbrMaps = {}): pc.StandardMaterial {
  const m = new pc.StandardMaterial();

  // Metalness workflow.
  m.useMetalness = true;
  m.diffuse.copy(params.diffuse);
  m.metalness = clamp01(params.metalness);

  // Roughness expressed via gloss + invert so 0 = rough, 1 = smooth in our params maps to a sane
  // material response. (gloss=1-roughness conceptually; glossInvert makes the engine treat the
  // stored value as roughness.)
  m.gloss = clamp01(params.roughness);
  m.glossInvert = true;

  // Additive display: never emit; keep ambient occlusion of specular reasonable.
  m.emissive.set(0, 0, 0);
  m.occludeSpecular = pc.SPECOCC_AO;

  if (params.opacity !== undefined && params.opacity < 1) {
    m.opacity = clamp01(params.opacity);
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
  }

  if (params.twoSided) {
    m.cull = pc.CULLFACE_NONE;
    m.twoSidedLighting = true;
  }

  // Texture maps.
  if (maps.diffuseMap) m.diffuseMap = maps.diffuseMap;
  if (maps.normalMap) m.normalMap = maps.normalMap;

  if (maps.ormMap) {
    // Packed ORM: AO=R, Roughness(as gloss w/ invert)=G, Metalness=B.
    m.aoMap = maps.ormMap;
    m.aoMapChannel = 'r';
    m.glossMap = maps.ormMap;
    m.glossMapChannel = 'g';
    m.metalnessMap = maps.ormMap;
    m.metalnessMapChannel = 'b';
  } else if (maps.aoMap) {
    m.aoMap = maps.aoMap;
    m.aoMapChannel = 'r';
  }

  m.update();
  return m;
}

/**
 * Apply the active quality profile's anisotropy to every texture on a material (close-up sharpness).
 * Safe to call repeatedly when quality changes. Allocation-free (sets each map field directly).
 */
export function applyAnisotropy(material: pc.StandardMaterial, anisotropy: number): void {
  if (material.diffuseMap) material.diffuseMap.anisotropy = anisotropy;
  if (material.normalMap) material.normalMap.anisotropy = anisotropy;
  if (material.aoMap) material.aoMap.anisotropy = anisotropy;
  if (material.glossMap) material.glossMap.anisotropy = anisotropy;
  if (material.metalnessMap) material.metalnessMap.anisotropy = anisotropy;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
