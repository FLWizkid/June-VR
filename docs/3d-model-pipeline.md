# Producing an "identical" 3D model (GLB)

Your goal is a model that looks like the real blood-pressure meter **and** is a
true 3D object (not a flat photo). A single snapshot can't fully deliver both —
the back of the object isn't in the photo — so pick the path that matches how
"identical" it has to be.

> Reality check on "identical, 3D from the photo": single-image AI reconstruction
> gives a convincing **front** and a **guessed back/underside**. For a clinical
> demo that's often fine; for a true-to-spec replica it is not. If "identical"
> means the exact product, use photogrammetry (many photos) or CAD.

## Option 1 — Single-image AI (fastest, ~minutes)
Upload one clean, well-lit, background-removed photo of the device and export GLB.
Current strong open models/Spaces on Hugging Face (verify the exact repo id /
that the Space is up before relying on it — these move fast):

- **TRELLIS** (Microsoft) — `microsoft/TRELLIS`; demo Space `JeffreyXiang/TRELLIS`.
- **Hunyuan3D 2.x** (Tencent) — `tencent/Hunyuan3D-2`; demo Space `tencent/Hunyuan3D-2`.
- **Stable Fast 3D** (Stability) — `stabilityai/stable-fast-3d`.
- **TripoSG** — `VAST-AI/TripoSG`.

Tips: remove the hands/background first (use a matting/segmentation step), feed a
single object on a plain background, and prefer a 3/4 view so the model infers
geometry better than a dead-on shot.

## Option 2 — Photogrammetry / multi-view (accurate, ~hour)
Take 30–60 overlapping photos all around the real device and reconstruct:
- **RealityCapture**, **Meshroom** (free), **Polycam**, or **Apple Object Capture**.
- Produces accurate geometry + real texture, then export/convert to GLB.
- This is the route if you have the physical device and want true fidelity.

## Option 3 — CAD / hand-modelled (most accurate, slowest)
Model in Blender/Fusion to exact dimensions. Best when you need precise scale,
clean topology, or moving parts (e.g. an animated gauge needle).

## Make it runtime-ready (all options)
1. **Convert to GLB** if needed: `gltf-transform` or Blender export.
2. **Decimate** to ≤ ~100k triangles for glasses.
3. **Bake/limit textures** to ≤ 2048².
4. **Compress**: `gltf-transform optimize in.glb out.glb` (Draco + texture
   compression). Example:
   ```bash
   npm i -g @gltf-transform/cli
   gltf-transform optimize input.glb assets/model.glb --texture-compress webp
   ```
5. **Scale to metres** so it appears life-size in AR (a desk unit ≈ 0.12 m wide).
6. Drop the result at `web-ar/assets/model.glb`.

## Why GLB
GLB is the recommended import/runtime format for PlayCanvas and is natively
handled by Android XR's web and native stacks — one asset works across phone,
headset, and glasses targets.
