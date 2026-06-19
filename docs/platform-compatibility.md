# Platform compatibility & sources (verified June 2026)

The central question was whether PlayCanvas + WebXR **image tracking** is the most
efficient/accurate/compatible way to anchor a 3D model on **Samsung/Google
glasses**. It isn't — here's the evidence.

## 1. Android XR's browser does not support WebXR image tracking
Google's official "Develop for the web on Android XR" page lists the supported
WebXR modules:

> Device API · AR Module · Gamepads Module · Hit Test Module · Hand Input ·
> Anchors · Depth Sensing · Light Estimation

Image tracking / marker tracking / augmented images is **not** in that list, and
**Hand Input is the default interaction**. So an image-tracking experience cannot
run in the Android XR browser as-is — regardless of engine (PlayCanvas, Three,
Babylon). The supported primitives for placing content are **Hit Test + Anchors**.
- Source: <https://developer.android.com/develop/xr/web>

## 2. WebXR image tracking is still experimental even on phones
The WebXR Image Tracking API is **draft** status and, in 2026, is available only
in **Chrome for Android (≥ 89)** behind the **`chrome://flags#webxr-incubations`**
flag. It is not a stable cross-browser feature.
- Sources: MDN WebXR Device API — <https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API>;
  WebXR 2026 browser-support guide — <https://www.testmuai.com/learning-hub/webxr-compatible-browsers/>;
  Needle Engine image-tracking docs — <https://engine.needle.tools/docs/how-to-guides/xr/image-tracking.html>

## 3. The attached photo is a weak tracking marker
Even where image tracking is available, reliable targets need many unique,
high-contrast, non-repeating features. The attached image is dominated by hands,
skin tones, and a soft out-of-focus background — low feature density → flicker
and drift. A designed marker (or markerless placement) is required.

## 4. WebXR is genuinely viable on Android XR — just not for image tracking
Chrome and Samsung Internet support WebXR on the Samsung Galaxy XR / Android XR,
and WebXR adoption is growing. So PlayCanvas/WebXR is a fine **engine** choice for
glasses — provided you anchor with **Hit Test + Anchors**, not image tracking.
- Sources: Samsung Galaxy XR — <https://en.wikipedia.org/wiki/Samsung_Galaxy_XR>;
  Android XR — <https://en.wikipedia.org/wiki/Android_XR>;
  WebXR 2026 adoption — <https://vr.org/articles/webxr-adoption-surge-2026-browsers-vs-apps>

## 5. If you need image tracking specifically → go native (Unity / Jetpack XR)
For robust image tracking, the mature path is **Unity AR Foundation**
(`ARTrackedImageManager`, backed by **ARCore Augmented Images** on Android) or the
**Jetpack XR SDK**. Android XR supports Unity, Unreal, ARCore, and native tooling.
Note: Augmented Images is well-proven on **ARCore phones**; confirm tracked-image
support for your specific **glasses** SKU/runtime before committing, since the
headset/glasses tracking model differs from phone ARCore.
- Sources: AR Foundation tracked image manager —
  <https://docs.unity3d.com/Packages/com.unity.xr.arfoundation@4.1/manual/tracked-image-manager.html>;
  ARCore Augmented Images for AR Foundation —
  <https://developers.google.com/ar/develop/unity-arf/augmented-images/guide>;
  AR Foundation + ARCore Extensions features —
  <https://developers.google.com/ar/develop/unity-arf/features>

---

## Decision matrix

| Target | Anchor primitive | Best stack | Notes |
|---|---|---|---|
| **Samsung/Google glasses & headset (Android XR)** | Hit Test + Anchors (markerless) | PlayCanvas/WebXR **or** Unity/Jetpack XR | Image tracking unsupported in-browser; markerless is the native model. |
| **Android phone, photo must be the anchor** | WebXR image tracking | PlayCanvas/WebXR (flag on) | Experimental, Chrome-Android only; use a designed marker. |
| **Production, robust image tracking** | ARCore Augmented Images | Unity AR Foundation / native | Confirm glasses support for tracked images. |
| **iOS reach** | SLAM/CV image targets | 8th Wall / Zappar | Pure WebXR image tracking isn't on iOS Safari. |

> Caveat on freshness: platform support changes quickly. Items in §1, §2, §4 were
> checked against the sources above in June 2026; re-verify against the live
> Android XR docs before a production commitment.
