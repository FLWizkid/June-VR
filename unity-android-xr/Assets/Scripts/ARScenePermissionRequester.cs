using UnityEngine;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

/// <summary>
/// Plane detection on the Android XR runtime requires a scene-understanding
/// permission to be granted at runtime before plane data flows. Put this on a
/// bootstrap object in the AR scene so it requests the permission on start.
///
/// Use COARSE for "place on a surface" demos; FINE for precise geometry.
/// You must also declare the permission in the Android manifest (see SETUP.md).
/// </summary>
public class ARScenePermissionRequester : MonoBehaviour
{
    public enum Fidelity { Coarse, Fine }

    [SerializeField] private Fidelity fidelity = Fidelity.Coarse;

    private const string CoarsePermission = "android.permission.SCENE_UNDERSTANDING_COARSE";
    private const string FinePermission = "android.permission.SCENE_UNDERSTANDING_FINE";

    private void Start()
    {
#if UNITY_ANDROID && !UNITY_EDITOR
        var permission = fidelity == Fidelity.Fine ? FinePermission : CoarsePermission;
        if (!Permission.HasUserAuthorizedPermission(permission))
            Permission.RequestUserPermission(permission);
#endif
    }
}
