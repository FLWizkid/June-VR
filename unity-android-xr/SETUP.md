# Unity Android XR — setup, build & deploy

Ordered checklist to turn this scaffold into a running app on Samsung Galaxy XR /
Android XR. Target: **Unity 6 (6000.0 LTS)**. Roughly 20 minutes.

> Versions in `Packages/manifest.json` target Unity 6. If the Package Manager
> reports a version isn't found, open **Window ▸ Package Manager**, select the
> package, and let it resolve to the recommended version — exact patch numbers
> move over time.

## 1. Prerequisites
- **Unity Hub** + **Unity 6 (6000.0 LTS)** with **Android Build Support**
  (incl. Android SDK, NDK, OpenJDK).
- A **Samsung Galaxy XR / Android XR** device in developer mode, **or** the
  **Android XR Emulator** (Android Studio ▸ Device Manager ▸ XR).

## 2. Open the project
- In Unity Hub ▸ **Add** ▸ select this `unity-android-xr/` folder ▸ open with Unity 6.
- Let the Package Manager resolve `manifest.json` (AR Foundation + Android XR OpenXR).

## 3. Add the remaining packages (Window ▸ Package Manager ▸ + ▸ Add by name)
- `com.unity.render-pipelines.universal` — URP, for realistic PBR + post‑processing.
- `com.unity.cloud.gltfast` — import your GLB model directly.
- (Optional) `com.unity.xr.interaction.toolkit` — if you want ready‑made hand/ray interactors.

## 4. XR plug‑in & features
- **Edit ▸ Project Settings ▸ XR Plug‑in Management** ▸ install ▸ **Android** tab ▸ enable **OpenXR**.
- **XR Plug‑in Management ▸ OpenXR** (Android):
  - Enable the **Android XR** feature group.
  - Enable the AR features you use: **Session, Plane detection, Anchors, Raycast/Hit test, Camera (for light estimation)**.
  - Add **interaction profiles**: Android XR **Hand** (pinch/select) and **Eye Gaze** (optional).
- **Project Settings ▸ Player ▸ Other Settings**:
  - **Scripting Backend**: IL2CPP, **Target Architectures**: ARM64.
  - **Active Input Handling**: *Input System Package* (or *Both*).
  - Set **Minimum API Level** per the current Android XR requirement.

## 5. Render pipeline (reality)
- Create a **URP Asset** (Assets ▸ Create ▸ Rendering ▸ URP Asset) + renderer.
- **Project Settings ▸ Graphics** ▸ set it as the default; also set it in **Quality**.
- For fidelity without tanking framerate on glasses: enable **HDR**, **soft shadows**,
  and a light **post‑process** volume (Tonemapping = ACES, subtle Bloom). Avoid heavy
  SSAO/SSR. Prefer **baked lighting** for static scenery + **light estimation** (below).

## 6. Build the AR scene
1. New scene. Delete the default Main Camera.
2. **GameObject ▸ XR ▸ XR Origin (AR)** — adds XR Origin + AR Camera.
3. On the XR Origin (or AR Session Origin) add: **AR Plane Manager**, **AR Raycast Manager**,
   **AR Anchor Manager**, **AR Camera Manager** (the AR Camera usually has the camera manager).
4. **GameObject ▸ XR ▸ AR Session**.
5. Create an empty **`Managers`** object and add **`ARPlacementController`**
   (it requires Raycast + Anchor managers — put it on the same object that has them,
   e.g. the XR Origin, or wire references accordingly).
6. Add a **Directional Light** ▸ attach **`ARLightEstimationController`** ▸ assign the
   **AR Camera Manager**.
7. Add **`ARScenePermissionRequester`** to any bootstrap object (set Coarse for demos).

## 7. Permissions (planes need this)
Plane detection requires a runtime permission. `ARScenePermissionRequester` requests
it; also declare it so the OS allows it. Add a custom manifest at
`Assets/Plugins/Android/AndroidManifest.xml` (merged at build) including:
```xml
<uses-permission android:name="android.permission.SCENE_UNDERSTANDING_COARSE" />
<!-- or .SCENE_UNDERSTANDING_FINE for precise geometry -->
```

## 8. Import & wire the model
1. Drop your optimized **`model.glb`** into `Assets/` (glTFast imports it).
2. Drag it into the scene, set real‑world scale (a desk unit ≈ **0.12 m** wide),
   verify PBR materials, then drag it back into `Assets/` to make a **prefab**.
3. Select `ARPlacementController` ▸ assign **Model Prefab**, an optional **Reticle Prefab**
   (a thin disc), and a **Place Action**.

## 9. Input ("place" action)
- Create an **Input Action** (or use one from XR Interaction Toolkit) and bind it to:
  - Android XR **pinch / select** (glasses/headset), and
  - **touchscreen tap / `<Mouse>/leftButton`** (phone & Editor testing).
- Assign it to `ARPlacementController ▸ Place Action`.

## 10. Build & run
- **File ▸ Build Settings ▸ Android** ▸ add the open scene ▸ **Switch Platform**.
- Connect the Galaxy XR device (or start the Android XR emulator) ▸ **Build And Run**.

## 11. Test
- Look at a real surface → the reticle tracks it → **pinch/tap** to place the device →
  walk around: it should stay anchored in place.

---

### Sources
- Develop with Unity for Android XR — <https://developer.android.com/develop/xr/unity>
- Unity OpenXR: Android XR (package, install, features) —
  <https://docs.unity3d.com/Packages/com.unity.xr.androidxr-openxr@1.2/manual/index.html>
- Android XR plane detection (permission requirement) —
  <https://docs.unity3d.com/Packages/com.unity.xr.androidxr-openxr@1.1/manual/features/plane-detection.html>
- Select your Android XR development tools (Unity vs Jetpack XR vs Unreal vs WebXR) —
  <https://developer.android.com/develop/xr/tools-technologies>
- Android XR updates for Unity, Unreal, Godot —
  <https://developer.android.com/blog/posts/android-xr-updates-for-unity-unreal-and-godot>
- AR Foundation plane detection platform support —
  <https://docs.unity3d.com/Packages/com.unity.xr.arfoundation@6.0/manual/features/plane-detection/platform-support.html>
