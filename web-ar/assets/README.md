# Assets

Drop two files here (both optional — the app runs with placeholders if absent):

## `model.glb` — the 3D blood-pressure device
- Format: **GLB** (binary glTF). See `../../docs/3d-model-pipeline.md` for how to
  produce one that is genuinely "identical" to the device.
- Budget for glasses: **≤ ~100k triangles**, textures **≤ 2048²**, compressed
  with **Draco** or **meshopt**. Glasses are mobile-class GPUs — keep it lean.
- Orientation: model should sit with its base on the local **XZ plane**, +Y up,
  centred on the origin, in **real-world metres** (a desk meter is ~0.12 m wide).

## `marker.png` — only for the phone image-tracking fallback
- **Do not use the hands/photo as the marker.** Hands, skin, and a soft
  background give too few stable features and tracking will flicker.
- Use a **designed** target: high contrast, lots of unique non-repeating detail,
  asymmetric, matte print (no gloss/glare). Minimum ~300×300 px in the image,
  printed at a known physical width.
- Set that printed width (in metres) as `MARKER_WIDTH_METRES` in
  `../image-tracking-phone.js`.
- Reminder: this path is **Chrome-on-Android only** and does **not** run on
  Android XR glasses.
