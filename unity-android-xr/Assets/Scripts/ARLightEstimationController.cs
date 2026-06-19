using UnityEngine;
using UnityEngine.XR.ARFoundation;

/// <summary>
/// Drives a scene directional light from AR light estimation so the virtual
/// blood-pressure device is lit like the real room — the cheapest big win for
/// "reality". Every value is guarded by HasValue, so on devices/runtimes that
/// don't provide an estimate (e.g. some passthrough modes) the light simply
/// keeps its authored values.
///
/// Attach to a Directional Light. Assign the scene's ARCameraManager.
/// </summary>
[RequireComponent(typeof(Light))]
public class ARLightEstimationController : MonoBehaviour
{
    [SerializeField] private ARCameraManager cameraManager;

    private Light _light;

    private void Awake() => _light = GetComponent<Light>();

    private void OnEnable()
    {
        if (cameraManager != null)
            cameraManager.frameReceived += OnFrameReceived;
    }

    private void OnDisable()
    {
        if (cameraManager != null)
            cameraManager.frameReceived -= OnFrameReceived;
    }

    private void OnFrameReceived(ARCameraFrameEventArgs args)
    {
        var le = args.lightEstimation;

        if (le.averageBrightness.HasValue)
            _light.intensity = le.averageBrightness.Value;

        if (le.colorCorrection.HasValue)
            _light.color = le.colorCorrection.Value;

        if (le.mainLightDirection.HasValue)
            _light.transform.rotation = Quaternion.LookRotation(le.mainLightDirection.Value);

        if (le.mainLightColor.HasValue)
            _light.color = le.mainLightColor.Value;

        if (le.mainLightIntensityLumens.HasValue)
            _light.intensity = le.averageBrightness ?? _light.intensity;

        if (le.ambientSphericalHarmonics.HasValue)
            RenderSettings.ambientProbe = le.ambientSphericalHarmonics.Value;
    }
}
