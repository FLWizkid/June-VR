/**
 * Texture-set seam (SPEC §10, R6). THIS IS THE SWAP POINT for real art.
 *
 * `TEXTURE_SOURCE` selects whether cuff materials use procedurally generated textures (default, no
 * files needed) or real files from public/assets/textures/. To ship real art:
 *   1. Drop files into public/assets/textures/ (names below).
 *   2. Set TEXTURE_SOURCE = 'file'.
 *   3. Fill any missing URLs at the TODO markers.
 * No other module changes.
 *
 * Procedural generation here is intentionally simple (CPU-drawn canvases) — enough to read as
 * distinct fabric / Velcro / rubber / dial surfaces at runtime without any downloads.
 */

import * as pc from 'playcanvas';
import type { CuffMaterialId } from './cuffMaterials';
import type { AssetRegistry } from '../core/assetRegistry';
import { TRAINING_CLINICAL } from '../config/trainingConfig';

export type TextureSource = 'procedural' | 'file';

/** Flip to 'file' once real textures are present. */
export const TEXTURE_SOURCE: TextureSource = 'procedural';

/** Maps for one material surface. */
export interface MaterialTextureSet {
  diffuseMap: pc.Texture | null;
  normalMap: pc.Texture | null;
  ormMap: pc.Texture | null;
}

const EMPTY_SET: MaterialTextureSet = { diffuseMap: null, normalMap: null, ormMap: null };

/**
 * File URLs for real assets. TODO(real-assets): confirm/extend these paths to match delivered files
 * (see ASSET_PIPELINE.md §6 and README "Exact user files still needed").
 */
const FILE_URLS: Partial<Record<CuffMaterialId, { albedo?: string; normal?: string; orm?: string }>> = {
  fabric: {
    albedo: 'assets/textures/fabric_albedo.ktx2', // TODO(real-assets)
    normal: 'assets/textures/fabric_normal.ktx2', // TODO(real-assets)
    orm: 'assets/textures/fabric_orm.ktx2', // TODO(real-assets)
  },
  velcroHook: {
    albedo: 'assets/textures/velcro_albedo.ktx2', // TODO(real-assets)
    normal: 'assets/textures/velcro_normal.ktx2', // TODO(real-assets)
    orm: 'assets/textures/velcro_orm.ktx2', // TODO(real-assets)
  },
  rubberTube: {
    albedo: 'assets/textures/tube_albedo.ktx2', // TODO(real-assets)
    normal: 'assets/textures/tube_normal.ktx2', // TODO(real-assets)
    orm: 'assets/textures/tube_orm.ktx2', // TODO(real-assets)
  },
  gaugeFace: {
    albedo: 'assets/textures/gauge_dial.png', // TODO(real-assets)
  },
  label: {
    albedo: 'assets/textures/label_albedo.png', // TODO(real-assets)
  },
};

/**
 * Provides texture sets per material. In 'procedural' mode it generates small canvas textures once
 * and caches them. In 'file' mode it loads via the AssetRegistry (falling back to procedural if a
 * file is missing, so the app never breaks).
 */
export class TextureSetProvider {
  private readonly device: pc.GraphicsDevice;
  private readonly assets: AssetRegistry;
  private readonly cache = new Map<CuffMaterialId, MaterialTextureSet>();

  constructor(device: pc.GraphicsDevice, assets: AssetRegistry) {
    this.device = device;
    this.assets = assets;
  }

  /** Get (and lazily build) the texture set for a material id. */
  async get(id: CuffMaterialId): Promise<MaterialTextureSet> {
    const cached = this.cache.get(id);
    if (cached) return cached;

    let set: MaterialTextureSet;
    if (TEXTURE_SOURCE === 'file') {
      set = await this.loadFromFiles(id);
    } else {
      set = this.generateProcedural(id);
    }
    this.cache.set(id, set);
    return set;
  }

  private async loadFromFiles(id: CuffMaterialId): Promise<MaterialTextureSet> {
    const urls = FILE_URLS[id];
    if (!urls) return this.generateProcedural(id);

    const [diffuseMap, normalMap, ormMap] = await Promise.all([
      urls.albedo ? this.assets.loadTexture(urls.albedo, true) : Promise.resolve(null),
      urls.normal ? this.assets.loadTexture(urls.normal, false) : Promise.resolve(null),
      urls.orm ? this.assets.loadTexture(urls.orm, false) : Promise.resolve(null),
    ]);

    // If the key color map failed to load, fall back to procedural so the surface still reads.
    if (!diffuseMap && !normalMap && !ormMap) return this.generateProcedural(id);
    return { diffuseMap, normalMap, ormMap };
  }

  /**
   * Procedural placeholder textures. We generate a tiled detail pattern per surface family so
   * fabric/Velcro/rubber/dial are visually distinguishable at close range without any files.
   */
  private generateProcedural(id: CuffMaterialId): MaterialTextureSet {
    switch (id) {
      case 'fabric':
        return { diffuseMap: this.weaveTexture(0.32, 0.36, 0.42), normalMap: null, ormMap: null };
      case 'velcroHook':
      case 'velcroLoop':
        return { diffuseMap: this.noiseTexture(0.18, 0.2, 0.24, 14), normalMap: null, ormMap: null };
      case 'label':
        return { diffuseMap: this.labelTexture(), normalMap: null, ormMap: null };
      case 'gaugeFace':
        return { diffuseMap: this.dialTexture(), normalMap: null, ormMap: null };
      default:
        return EMPTY_SET;
    }
  }

  // --- procedural canvas generators (run once each, cached) ---

  private makeTexture(canvas: HTMLCanvasElement, srgb: boolean): pc.Texture {
    const tex = new pc.Texture(this.device, {
      width: canvas.width,
      height: canvas.height,
      format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
      mipmaps: true,
      addressU: pc.ADDRESS_REPEAT,
      addressV: pc.ADDRESS_REPEAT,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
    });
    tex.setSource(canvas);
    return tex;
  }

  private weaveTexture(r: number, g: number, b: number): pc.Texture | null {
    const ctx = newCanvas(128);
    if (!ctx) return null;
    const { canvas } = ctx;
    ctx.fillStyle = rgb(r, g, b);
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = rgb(r * 0.8, g * 0.8, b * 0.8);
    ctx.lineWidth = 1;
    for (let i = 0; i < 128; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }
    return this.makeTexture(canvas, true);
  }

  private noiseTexture(r: number, g: number, b: number, cell: number): pc.Texture | null {
    const ctx = newCanvas(128);
    if (!ctx) return null;
    const { canvas } = ctx;
    for (let y = 0; y < 128; y += cell) {
      for (let x = 0; x < 128; x += cell) {
        const j = (Math.random() - 0.5) * 0.1;
        ctx.fillStyle = rgb(r + j, g + j, b + j);
        ctx.fillRect(x, y, cell, cell);
      }
    }
    return this.makeTexture(canvas, true);
  }

  private labelTexture(): pc.Texture | null {
    const ctx = newCanvas(256);
    if (!ctx) return null;
    const { canvas } = ctx;
    ctx.fillStyle = '#e9e9e6';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#15171a';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ADULT', 128, 96);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('22 - 32 cm', 128, 134);
    ctx.strokeStyle = '#15171a';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 40, 216, 150);
    return this.makeTexture(canvas, true);
  }

  private dialTexture(): pc.Texture | null {
    const ctx = newCanvas(256);
    if (!ctx) return null;
    const { canvas } = ctx;
    const dialAngle = (v: number): number => -Math.PI * 0.75 + (v / 300) * Math.PI * 1.5;
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    ctx.strokeStyle = '#1a1c1f';
    ctx.fillStyle = '#1a1c1f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.stroke();

    // Red danger zone arc at the top of the range (CLAUDE.md gauge spec).
    ctx.strokeStyle = '#c1272d';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 101, dialAngle(260), dialAngle(300));
    ctx.stroke();

    // Demo systolic/diastolic teaching markers (SME-REVIEW: illustrative values from
    // TRAINING_CLINICAL, not a measured reading) — the observe step asks the learner to watch the
    // needle fall through these marks.
    const marker = (v: number, color: string): void => {
      const a = dialAngle(v);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 80, Math.sin(a) * 80);
      ctx.lineTo(Math.cos(a) * 106, Math.sin(a) * 106);
      ctx.stroke();
    };
    marker(TRAINING_CLINICAL.demoSystolicMmHg, '#c1272d'); // systolic — red
    marker(TRAINING_CLINICAL.demoDiastolicMmHg, '#1f7a33'); // diastolic — green

    // Tick marks 0..300 mmHg around ~270 degrees.
    ctx.strokeStyle = '#1a1c1f';
    for (let v = 0; v <= 300; v += 10) {
      const a = dialAngle(v);
      const major = v % 20 === 0;
      const r0 = major ? 86 : 96;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * 106, Math.sin(a) * 106);
      ctx.lineWidth = major ? 2 : 1;
      ctx.stroke();
    }
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('mmHg', 0, 60);
    return this.makeTexture(canvas, true);
  }

  /** Release generated textures. */
  dispose(): void {
    for (const set of this.cache.values()) {
      set.diffuseMap?.destroy();
      set.normalMap?.destroy();
      set.ormMap?.destroy();
    }
    this.cache.clear();
  }
}

function newCanvas(size: number): (CanvasRenderingContext2D & { canvas: HTMLCanvasElement }) | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  return ctx as (CanvasRenderingContext2D & { canvas: HTMLCanvasElement }) | null;
}

function rgb(r: number, g: number, b: number): string {
  const c = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
