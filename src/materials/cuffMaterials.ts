/**
 * Cuff material library (SPEC §6). One distinct PBR material per physical surface class.
 *
 * Realism is concentrated here. Base parameters (color/roughness/metalness) are defined as data so
 * they read clearly and so the real-asset texture sets (textureSets.ts) layer on top without code
 * changes. Anti-requirements enforced via materialFactory (no emissive, no mirror gloss).
 */

import * as pc from 'playcanvas';
import { createPbrMaterial, applyAnisotropy, type PbrParams } from '../core/materialFactory';
import { TextureSetProvider } from './textureSets';

/** Stable ids; these MUST match GLB material slot names for real assets (ASSET_PIPELINE §5/§6). */
export type CuffMaterialId =
  | 'fabric'
  | 'velcroHook'
  | 'velcroLoop'
  | 'stitching'
  | 'label'
  | 'rubberTube'
  | 'connector'
  | 'gaugeBody'
  | 'gaugeFace'
  | 'needle'
  | 'lens'
  | 'metalTrim';

export const CUFF_MATERIAL_IDS: readonly CuffMaterialId[] = [
  'fabric',
  'velcroHook',
  'velcroLoop',
  'stitching',
  'label',
  'rubberTube',
  'connector',
  'gaugeBody',
  'gaugeFace',
  'needle',
  'lens',
  'metalTrim',
];

const col = (r: number, g: number, b: number): pc.Color => new pc.Color(r, g, b);

/**
 * Base PBR parameters per surface. Colors are linear-ish approximations tuned to read on an
 * additive see-through display (avoid pure black silhouettes; matte where physically matte).
 */
const BASE_PARAMS: Record<CuffMaterialId, PbrParams> = {
  // Woven nylon cuff body — navy medical fabric, very rough, dielectric. Base albedo lifted off deep
  // navy so lit fabric reads AS fabric rather than a near-black silhouette (the fabric dominates the
  // close-up inspection frame and was falling to black on the walls the key light misses); still an
  // unmistakable medical navy, not a toy blue (CLAUDE.md rule 2). Real texture sets layer on top.
  fabric: { diffuse: col(0.32, 0.36, 0.48), metalness: 0.0, roughness: 0.92, twoSided: false },
  // Velcro hook side — darker, rough, micro-structured.
  velcroHook: { diffuse: col(0.12, 0.14, 0.18), metalness: 0.0, roughness: 0.85 },
  // Velcro loop side — slightly lighter fuzzy nap.
  velcroLoop: { diffuse: col(0.2, 0.23, 0.28), metalness: 0.0, roughness: 0.95 },
  // Stitching thread — light contrast seams.
  stitching: { diffuse: col(0.75, 0.76, 0.72), metalness: 0.0, roughness: 0.7 },
  // Printed label — off-white matte.
  label: { diffuse: col(0.86, 0.86, 0.83), metalness: 0.0, roughness: 0.6, twoSided: true },
  // Rubber inflation tubing — dark grey, soft sheen dielectric.
  rubberTube: { diffuse: col(0.07, 0.08, 0.09), metalness: 0.0, roughness: 0.55 },
  // Plastic connector / bulb / valve body.
  connector: { diffuse: col(0.05, 0.05, 0.06), metalness: 0.0, roughness: 0.4 },
  // Gauge housing — brushed metal/plastic.
  gaugeBody: { diffuse: col(0.55, 0.56, 0.58), metalness: 0.8, roughness: 0.45 },
  // Printed dial face — matte white print.
  gaugeFace: { diffuse: col(0.92, 0.92, 0.9), metalness: 0.0, roughness: 0.65 },
  // Gauge needle — dark, slight metal.
  needle: { diffuse: col(0.08, 0.09, 0.11), metalness: 0.3, roughness: 0.5 },
  // Transparent gauge lens — thin dielectric.
  lens: { diffuse: col(0.9, 0.92, 0.95), metalness: 0.0, roughness: 0.08, opacity: 0.22 },
  // Chrome/steel bezel and ferrules.
  metalTrim: { diffuse: col(0.8, 0.81, 0.83), metalness: 1.0, roughness: 0.2 },
};

/**
 * Builds and owns all cuff materials. Materials are created with procedural or file texture sets and
 * can be re-tuned for quality (anisotropy) and inspection mode at runtime.
 */
export class CuffMaterialLibrary {
  private readonly textures: TextureSetProvider;
  private readonly materials = new Map<CuffMaterialId, pc.StandardMaterial>();
  private anisotropy = 8;

  constructor(textures: TextureSetProvider) {
    this.textures = textures;
  }

  /** Build every material (async because texture sets may load files). Idempotent. */
  async build(): Promise<void> {
    for (const id of CUFF_MATERIAL_IDS) {
      if (this.materials.has(id)) continue;
      const params = BASE_PARAMS[id];
      const set = await this.textures.get(id);
      const mat = createPbrMaterial(params, {
        diffuseMap: set.diffuseMap,
        normalMap: set.normalMap,
        ormMap: set.ormMap,
      });
      mat.name = `cuff:${id}`;
      applyAnisotropy(mat, this.anisotropy);
      this.materials.set(id, mat);
    }
  }

  /** Get a built material; throws only if `build()` was not awaited (programmer error). */
  get(id: CuffMaterialId): pc.StandardMaterial {
    const m = this.materials.get(id);
    if (!m) throw new Error(`cuff material "${id}" not built; call build() first`);
    return m;
  }

  /** Update anisotropy across all materials (called on quality changes / inspection mode). */
  setAnisotropy(anisotropy: number): void {
    if (anisotropy === this.anisotropy) return;
    this.anisotropy = anisotropy;
    for (const m of this.materials.values()) {
      applyAnisotropy(m, anisotropy);
      m.update();
    }
  }

  dispose(): void {
    for (const m of this.materials.values()) m.destroy();
    this.materials.clear();
  }
}
