# Image-tracking marker assets

This folder holds the real-world **marker images** used by WebXR image tracking
(`src/ar/imageTracking.ts`). Per **CLAUDE.md §4.1**, image tracking is a first-class, **ungated**
feature.

## Status: placeholder

No real marker image bytes are shipped here yet. `ImageTracker` registers a placeholder descriptor
(`PLACEHOLDER_MARKER`, id `room-marker-01`, 0.2 m) so the module compiles and runs; with no image
bytes the per-frame tick is a harmless no-op.

## TODO(asset)

The real marker image(s) already exist in the **Room environment assets**. Supply the bytes to the
tracker before AR entry, e.g.:

```ts
const img = await createImageBitmap(await (await fetch('/assets/tracking/room-marker-01.png')).blob());
imageTracker.setMarkerImage('room-marker-01', img);
```

Marker image guidance (from the PlayCanvas / WebXR image-tracking spec):

- Resolution **≥ 300×300**; higher does **not** improve tracking.
- Prefer rich, non-repeating geometric features; avoid repeating patterns.
- Colour is irrelevant (grayscale is fine).
- Set `widthMeters` to the **printed real-world width** for best pose quality.

## On-device verification (PENDING)

Android XR's web docs do not currently list image/marker tracking among supported modules, so
behaviour **must be confirmed on-device** during QA (CLAUDE.md §4.1). This is a verification
reminder, not a capability gate.
