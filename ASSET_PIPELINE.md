# ASSET PIPELINE — AR Blood Pressure Cuff

How to turn the user's source art (3D model + reference photos) into **PlayCanvas-friendly,
XR-optimized** assets, and how that maps onto the code's material/variant seams.
**No Unity** is part of this pipeline.

> Until real assets arrive, the app runs on **procedural placeholders** (see
> `src/materials/textureSets.ts` and `src/entities/cuffVariants.ts`). Everything below describes the
> drop-in replacement path. `TODO:` markers in the code mark exactly where a real file is consumed.

---

## 1. Required source files from the user

| Purpose | Expected file(s) | Drop into | Required? |
| --- | --- | --- | --- |
| Cuff 3D model (single source) | `cuff_source.glb` (or `.fbx`/`.blend` to convert) | export → `public/assets/models/` | **Yes** |
| Albedo/base-color maps (per material) | `*_albedo.png/.ktx2` | `public/assets/textures/` | Yes (for realism) |
| Normal maps | `*_normal.png/.ktx2` | `public/assets/textures/` | Yes |
| Roughness / Metalness / AO (packed) | `*_orm.png/.ktx2` (R=AO, G=Rough, B=Metal) | `public/assets/textures/` | Yes |
| Printed label / dial art | `*_label_albedo.png`, `gauge_dial.png` | `public/assets/textures/` | Recommended |
| Reference photos | any (`.jpg/.png`) | not shipped; used for tuning only | Optional |
| Environment lighting (IBL) | prefiltered `env_atlas.ktx2` **or** raw `env.hdr` | `public/assets/env/` | Optional |
| Environment scene (preview only) | `training_room.glb` | `public/assets/env/` | Optional |
| Patient arm (foreground, shown in AR) | `patient_arm.glb` | `public/assets/models/` | Optional |

**Final required filenames** (what the code's seam expects when you flip from placeholder to real)
are listed in `README.md` → "Assets: detected vs. NOT detected" and mirrored by `TODO:` markers in
`src/materials/textureSets.ts`, `src/entities/cuffVariants.ts`, and `src/entities/environmentRoot.ts`.

**Environment GLB seam (`assets/env/training_room.glb`).** Loaded by `entities/environmentRoot.ts`
when present, replacing the procedural floor/grid stand-in. It is **preview-only**: the entire
environment root is **disabled while an XR/AR session is active** (optical see-through must not paint
over the real world). Model it in **metres**, +Y up / −Z forward, keep it modest (it is secondary to
the cuff in the perf budget), and keep its origin at the floor so the cuff rests on it in preview.

**Patient-arm GLB seam (`assets/models/patient_arm.glb`).** Loaded by `entities/patientArm.ts` when
present, replacing the **procedural arm** stand-in (tapered upper-arm + elbow + forearm + hand, matte
skin PBR). Unlike the environment, the arm is **FOREGROUND training content and IS shown in AR** — it
is the limb the trainee wraps the cuff onto. Model in **metres**, +Y up / −Z forward; a clean upper
arm of roughly adult dimensions is enough. The cuff is mounted on the upper-arm site defined by
`CUFF_ON_ARM.alongUpperArm01` (config/trainingConfig.ts); a delivered mesh should ideally tag a
landmark node for the cuff site (artery marker over the brachial artery, lower edge ~2–3 cm above the
elbow crease). Anatomy/pose are **SME-review** affordances (TRAINING_LOGIC.md §7); finalize on-device.
Toggle with `TrainingScene.setArmVisible(false)` at sites that use a real manikin/arm.

**IBL seam (`assets/env/env_atlas.ktx2` preferred, or `assets/env/env.hdr`).** Loaded by
`scene/environment.ts` for **reflections only** (never a painted skybox — AR is optical see-through).
Prefer a **prefiltered** `env_atlas.ktx2` (the format `scene.envAtlas` expects — no runtime cost). A
raw equirect **`env.hdr`** also works and is prefiltered at load via `EnvLighting.generateLightingSource`
+ `generateAtlas` (capability-guarded; falls back to constant ambient on any failure). Optional — the
app never depends on it.

**Real fabric-cuff mesh + cuff textures are STILL the key missing art.** The deployable cuff body is
currently the **procedural fabric wrap** (now a curved band hugging the arm) composited onto the real
gauge device; the per-surface cuff **texture sets** (fabric/Velcro/tube/label/dial) are also absent
(procedural defaults). Supply a real cuff mesh via `cuffVariants.ts` `modelUrl` and the textures per
§4–§7 to reach final realism.

Not required (v1): any **marker/image-tracking** images — WebXR image tracking is **unsupported** on
Android XR, so none are shipped. `public/assets/tracking/` stays empty.

---

## 2. Model preparation rules

- Deliver **one** clean source model; the three cuff sizes are **variants** of it (see §10), not
  three unrelated meshes.
- **Real-world scale in meters.** 1 PlayCanvas/WebXR world unit = **1 meter**. A medium adult cuff
  bladder is ~0.13 m tall and wraps a ~0.30 m circumference — model to life size.
- **Triangle budget:** target the cuff at **≤ ~60–80k tris** for close inspection; decimate hidden/
  interior geometry. Use normal+AO maps to carry stitching/weave detail rather than dense geometry.
- **Watertight enough** for clean silhouettes; no inverted normals (additive AR makes flipped faces
  obvious).
- **Single UV set** (UV0) unless a second set is genuinely needed for a lightmap/decal; keep UVs
  non-overlapping for baked AO.
- **Apply transforms** (freeze scale/rotation) before export; origin at the natural grab/placement
  point (cuff center, resting on its bottom face).
- Remove cameras, lights, rigs, and Unity/DCC-specific extras from the export.

---

## 3. Scale / orientation rules

- **Units:** meters. If the model came from a Unity project (also metric) verify nothing pre-scaled
  it (Unity FBX import scale of 0.01 is a classic trap).
- **Up axis:** **+Y up**. **Forward:** **−Z** (glTF/PlayCanvas convention). Re-orient in the DCC,
  then re-export — do not fix orientation by rotating the runtime entity.
- **Origin:** at the cuff's resting base center so placement (on a surface) and pinch-grab feel right.
- After export, validate in `npm run dev` desktop inspect mode: the cuff should sit correctly and be
  roughly the size of a real cuff next to a 1 m reference.

---

## 4. Texture requirements

- **Metalness workflow** (matches `StandardMaterial.useMetalness = true`).
- **Color space:** albedo/label = sRGB; normal/ORM = linear. KTX2/PNG must tag/handle this correctly.
- **ORM packing:** **R = Ambient Occlusion, G = Roughness, B = Metalness** (glTF convention). The
  code wires `aoMap`(R via channel), `glossMap`+`glossInvert`(roughness→gloss), `metalnessMap`(B).
- **Normal maps:** tangent-space, +Y (OpenGL) green; if authored DirectX (−Y), flip green on export.
- **Power-of-two** dimensions for mipmaps; provide mips (or let KTX2 carry them).
- **No baked lighting** in albedo (lighting is dynamic + IBL). AO map only for contact/cavity shadow.

---

## 5. Material separation requirements

The renderer expects **distinct materials per surface class** so each can have correct PBR response
(see `src/materials/cuffMaterials.ts`, keyed by `CuffMaterialId`). Author the model so these are
**separate material slots / submeshes**:

| Material id | Surface | Character |
| --- | --- | --- |
| `fabric` | woven cuff body | high roughness, weave normal, ~0 metal |
| `velcroHook` / `velcroLoop` | Velcro | rough, distinct micro-normal |
| `stitching` | seams/thread | thin, via normal/AO (or slim geo) |
| `label` | printed markings/sizing text | crisp albedo decal, matte |
| `rubberTube` | tubing | soft sheen dielectric, mid rough |
| `connector` | bulb/valve/ferrule plastic | rigid, lower rough |
| `gaugeBody` | gauge housing | metal/plastic |
| `gaugeFace` | printed dial | matte printed |
| `needle` | gauge needle | dark matte / slight metal |
| `lens` | gauge cover | thin transparent dielectric |
| `metalTrim` | bezels/steel details | chrome/steel, low rough |

Keep material count reasonable (atlas where sensible) but **never merge** classes with different
roughness/metalness identity.

---

## 6. Naming conventions

- Model: `cuff_source.glb`. Instantiated render root is renamed in code; mesh/material **slot names
  must match the `CuffMaterialId` strings** above (e.g. material named `fabric`, `rubberTube`, …) so
  the code can bind the right `StandardMaterial` to each submesh.
- Textures: `<material>_<map>.<ext>` → `fabric_albedo.ktx2`, `fabric_normal.ktx2`,
  `fabric_orm.ktx2`, `gauge_dial.png`, `label_albedo.png`, …
- Variants: see §10 — `cuff_small`, `cuff_medium`, `cuff_large` (or a single rig + scale params).
- Environment: `env.hdr` (source) → `env_atlas.ktx2` (prefiltered, shipped).

---

## 7. Quality tiers for texture resolution

Provide up to three tiers; the runtime quality profile picks one (and close-up inspection biases up):

| Tier | Albedo/Label | Normal | ORM | Use |
| --- | --- | --- | --- | --- |
| **Balanced** | 1024 | 1024 | 512 | default / thermal-limited |
| **High** | 2048 | 2048 | 1024 | normal viewing |
| **Ultra** | 4096 (labels/dial), 2048 others | 2048 | 2048 | 6–12 in inspection |

Ship as **KTX2** so all tiers stay small to download and cheap on GPU. Keep label/dial sharp (text
legibility at close range) even when other maps drop a tier.

---

## 8. GLB export rules

- Export **`.glb`** (binary, self-contained) — single file, embedded buffers.
- Include: positions, normals, **tangents** (needed for normal maps), UV0, per-submesh materials.
- glTF **PBR metallic-roughness** materials; textures referenced (will be replaced/overridden by the
  code's `StandardMaterial`s by slot name, but valid glTF materials keep the file previewable).
- No Draco *and* meshopt double-compression; pick **meshopt** (via gltfpack, §9).
- Validate with the glTF validator (0 errors) before shipping.

---

## 9. gltfpack optimization commands (documented — **not run here**)

> `gltfpack` (from meshoptimizer) is **not installed** in this environment. Run these on your machine.
> Install: `npm i -g gltfpack` (or download a release binary).

```bash
# Geometry: quantize + meshopt-compress, keep tangents & UVs.
gltfpack -i cuff_source.glb -o cuff_medium.glb -cc -kn

# Same, but also convert textures to KTX2/Basis (UASTC for normals, ETC1S for others):
gltfpack -i cuff_source.glb -o cuff_medium.glb -cc -kn -tc -tu "normal" -tq 8

# Per-size variants (if exported as separate meshes):
gltfpack -i cuff_small_source.glb  -o cuff_small.glb  -cc -kn -tc
gltfpack -i cuff_large_source.glb  -o cuff_large.glb  -cc -kn -tc
```

Flag notes: `-cc` meshopt compression, `-kn` keep node names (so material/slot binding by name still
works), `-tc` encode textures to KTX2, `-tu <class>` mark which maps use UASTC (normals),
`-tq` texture quality. PlayCanvas decodes meshopt + KTX2/Basis at runtime (the engine ships the
decoders; ensure they are enabled in `core/app.ts` asset setup when real assets land — see the
`TODO:` in `assetRegistry.ts`).

---

## 10. Optional KTX2 workflow (standalone, without gltfpack)

If you keep textures separate from the GLB (the code's `textureSets.ts` loads them as standalone
textures), encode each with KTX-Software / Basis:

```bash
# Color (sRGB), ETC1S, with mips:
toktx --t2 --encode etc1s --genmipmap --assign_oetf srgb fabric_albedo.ktx2 fabric_albedo.png

# Normal map: UASTC (higher quality), linear, no sRGB:
toktx --t2 --encode uastc --genmipmap --assign_oetf linear fabric_normal.ktx2 fabric_normal.png

# ORM (linear), ETC1S:
toktx --t2 --encode etc1s --genmipmap --assign_oetf linear fabric_orm.ktx2 fabric_orm.png
```

Place outputs in `public/assets/textures/` with the names from §6. The runtime enables the **Basis
transcoder** (see asset setup) so `.ktx2` loads directly.

---

## 11. Processing a Unity-origin asset into a PlayCanvas-friendly asset

Even though v1 ships **no Unity**, a model may have been authored in a Unity project. To convert:

1. **Export from the DCC, not from Unity.** Get the original `.blend`/`.fbx`/`.glb`; avoid baking in
   Unity import settings.
2. In **Blender** (or equivalent): set units to **meters**, fix **scale** (watch the Unity 0.01 FBX
   factor), set **+Y up / −Z forward**, **apply transforms**, set origin to resting base center.
3. **Rebuild materials** to glTF metallic-roughness; name material slots to match `CuffMaterialId`
   (§5/§6). Discard Unity Standard-shader-specific params.
4. **Re-bake** AO/normal if Unity-specific bakes don't transfer; ensure normal green-channel
   convention (+Y/OpenGL) for glTF.
5. **Export `.glb`** per §8, then **optimize** per §9.
6. Validate in `npm run dev` inspect mode and check material binding by slot name.

The runtime never needs to know the asset's origin — only that it meets the rules above.

---

## 12. Handling variants for pediatric, medium, and large cuffs

The code models variants in `src/entities/cuffVariants.ts` via a `CuffSize` enum
(`PediatricSmall | Medium | Large`) and a `CuffVariantSpec` (arm-circumference range, bladder
dimensions, label text, and either a per-size model URL **or** a uniform/non-uniform scale + label
swap on the shared model).

Two supported authoring strategies:

- **Single model + parameters (preferred for load time):** ship `cuff_medium.glb`; small/large are
  derived by the documented scale factors and a label/dial swap. Lowest download, fewest files.
- **Three models:** ship `cuff_small.glb`, `cuff_medium.glb`, `cuff_large.glb` when the sizes differ
  in shape (not just scale). Each follows §2–§9.

Whichever you choose, fill in `cuffVariants.ts` (the `TODO:` markers show where model URLs / scales /
label text go). The interaction, materials, and quality systems are variant-agnostic and need no
change.
