using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

/// <summary>
/// Markerless placement for Android XR (Samsung Galaxy XR / Google glasses) and phones.
///
/// Aim at a detected surface -> a reticle tracks the surface -> trigger the
/// "place" action (pinch / select on glasses, tap on phone) to drop the model
/// and anchor it so it stays locked as the user walks around.
///
/// Requires (on the same GameObject as XR Origin or a manager object):
///   - ARRaycastManager   (hit testing against planes)
///   - ARAnchorManager    (spatial anchors)
///   - ARPlaneManager     (plane detection; add separately on the XR Origin)
///
/// Targets AR Foundation 6.0 APIs (TryAddAnchorAsync). See SETUP.md.
/// </summary>
[RequireComponent(typeof(ARRaycastManager))]
[RequireComponent(typeof(ARAnchorManager))]
public class ARPlacementController : MonoBehaviour
{
    [Header("Content")]
    [Tooltip("The blood-pressure device prefab (your imported GLB, made into a prefab).")]
    [SerializeField] private GameObject modelPrefab;

    [Tooltip("Optional reticle shown on the targeted surface.")]
    [SerializeField] private GameObject reticlePrefab;

    [Header("Input")]
    [Tooltip("Input action that triggers placement: bind to Android XR pinch/select and to touch tap.")]
    [SerializeField] private InputActionReference placeAction;

    [Header("Placement")]
    [Tooltip("Lift the model off the surface by this many metres (avoid z-fighting).")]
    [SerializeField] private float yOffset = 0f;

    [Tooltip("Uniform scale applied to the placed model.")]
    [SerializeField] private float modelScale = 1f;

    private ARRaycastManager _raycastManager;
    private ARAnchorManager _anchorManager;
    private GameObject _reticle;
    private GameObject _placedInstance;
    private bool _hasHit;
    private static readonly List<ARRaycastHit> Hits = new();

    private void Awake()
    {
        _raycastManager = GetComponent<ARRaycastManager>();
        _anchorManager = GetComponent<ARAnchorManager>();

        if (reticlePrefab != null)
        {
            _reticle = Instantiate(reticlePrefab);
            _reticle.SetActive(false);
        }
    }

    private void OnEnable()
    {
        if (placeAction != null)
        {
            placeAction.action.performed += OnPlace;
            placeAction.action.Enable();
        }
    }

    private void OnDisable()
    {
        if (placeAction != null)
            placeAction.action.performed -= OnPlace;
    }

    private void Update()
    {
        // Cast from the centre of the view (gaze/forward). Works on glasses and phones.
        var screenCentre = new Vector2(Screen.width * 0.5f, Screen.height * 0.5f);
        _hasHit = _raycastManager.Raycast(screenCentre, Hits, TrackableType.PlaneWithinPolygon);

        if (_reticle == null) return;

        if (_hasHit)
        {
            var pose = Hits[0].pose;
            _reticle.SetActive(true);
            _reticle.transform.SetPositionAndRotation(pose.position, pose.rotation);
        }
        else
        {
            _reticle.SetActive(false);
        }
    }

    private async void OnPlace(InputAction.CallbackContext _)
    {
        if (!_hasHit || modelPrefab == null) return;

        var pose = Hits[0].pose;

        // Anchor the placement so it stays put as the user moves. If anchors are
        // unavailable on the device, fall back to a static world placement.
        ARAnchor anchor = null;
        try
        {
            var result = await _anchorManager.TryAddAnchorAsync(pose);
            if (result.status.IsSuccess())
                anchor = result.value;
        }
        catch (System.Exception e)
        {
            Debug.LogWarning($"Anchor creation unavailable, placing without anchor: {e.Message}");
        }

        if (_placedInstance == null)
            _placedInstance = Instantiate(modelPrefab);

        _placedInstance.transform.localScale = Vector3.one * modelScale;

        if (anchor != null)
        {
            _placedInstance.transform.SetParent(anchor.transform, false);
            _placedInstance.transform.localPosition = new Vector3(0f, yOffset, 0f);
            _placedInstance.transform.localRotation = Quaternion.identity;
        }
        else
        {
            _placedInstance.transform.SetParent(null);
            _placedInstance.transform.SetPositionAndRotation(
                pose.position + Vector3.up * yOffset, pose.rotation);
        }
    }
}
