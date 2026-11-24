// Minimal stand-ins for the Unity, UdonSharp, TextMeshPro and VRChat types the upstream scripts use, so that
// Assets/LiarsDice/UdonScripts/*.cs compile unchanged with dotnet 8. Only what the vectors exercise does
// anything; the rest exists to compile. Not part of the port.

using System;
using System.Collections.Generic;

namespace UnityEngine
{
    public class Object { public string name = ""; }

    public class GameObject : Object
    {
        public bool activeSelf;
        public Transform transform;
        public GameObject() { transform = new Transform { gameObject = this }; }
        public void SetActive(bool value) { activeSelf = value; }
        public T[] GetComponentsInChildren<T>(bool includeInactive) => new T[0];
    }

    public class Component : Object
    {
        public GameObject gameObject = new GameObject();
        public Transform transform => gameObject.transform;
        public T GetComponent<T>() where T : class => null;
        public T GetComponentInChildren<T>() where T : class => null;
        public T GetComponentInParent<T>() where T : class => null;
        public T[] GetComponentsInChildren<T>() => new T[0];
        public T[] GetComponentsInChildren<T>(bool includeInactive) => new T[0];
    }

    public class Transform
    {
        public Transform parent;
        public Vector3 position;
        public GameObject gameObject;
    }

    public class Behaviour : Component { public bool enabled = true; }
    public class MonoBehaviour : Behaviour { }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new Vector3(0, 0, 0);
        public static float Distance(Vector3 a, Vector3 b) => (float)Math.Sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z));
        public static bool operator ==(Vector3 a, Vector3 b) => a.x == b.x && a.y == b.y && a.z == b.z;
        public static bool operator !=(Vector3 a, Vector3 b) => !(a == b);
        public override bool Equals(object o) => o is Vector3 v && v == this;
        public override int GetHashCode() => 0;
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => new Color(1, 1, 1, 1);
        public static Color cyan => new Color(0, 1, 1, 1);
        public static Color gray => new Color(0.5f, 0.5f, 0.5f, 1);
        // Unity's own formula, for completeness: the vectors strip colour tags, so its output is not compared.
        public static Color HSVToRGB(float H, float S, float V)
        {
            if (S == 0) return new Color(V, V, V, 1);
            if (V == 0) return new Color(0, 0, 0, 1);
            float h = H * 6; int temp = (int)Math.Floor(h); float t = h - temp;
            float v1 = V * (1 - S), v2 = V * (1 - S * t), v3 = V * (1 - S * (1 - t));
            switch (temp)
            {
                case 0: case 6: return new Color(V, v3, v1, 1);
                case 1: return new Color(v2, V, v1, 1);
                case 2: return new Color(v1, V, v3, 1);
                case 3: return new Color(v1, v2, V, 1);
                case 4: return new Color(v3, v1, V, 1);
                default: return new Color(V, v1, v2, 1);
            }
        }
    }

    public class Material
    {
        public Color? color;
        public float? frame;
        public void SetColor(string name, Color c) { color = c; }
        public void SetFloat(string name, float f) { frame = f; }
    }

    public class Renderer : Component { public Material material = new Material(); }
    public class Collider : Component { public bool enabled = true; }
    public class Animator : Component { public void SetBool(string name, bool value) { } }
    public class AudioClip : Object { }
    public class AudioSource : Component
    {
        public AudioClip clip; public float pitch = 1; public float volume = 1;
        public void Play() { }
    }

    public enum HumanBodyBones { RightIndexDistal, LeftIndexDistal, RightIndexIntermediate, LeftIndexIntermediate, RightIndexProximal, LeftIndexProximal, Chest, Spine }

    public static class Random
    {
        private static readonly System.Random rng = new System.Random(1);
        public static int Range(int min, int max) => rng.Next(min, max);
        public static float Range(float min, float max) => min + (float)rng.NextDouble() * (max - min);
    }

    public static class Debug { public static void Log(object message) { } }

    [AttributeUsage(AttributeTargets.Field)] public class SerializeField : Attribute { }
    [AttributeUsage(AttributeTargets.Field)] public class HideInInspector : Attribute { }
    [AttributeUsage(AttributeTargets.Field)] public class Header : Attribute { public Header(string text) { } }
}

namespace UnityEngine.UI
{
    public struct ColorBlock { public Color normalColor; public Color selectedColor; }
    public class Button : Component { public ColorBlock colors; }
    public class Slider : Component { public float value = 1; }
    public class Image : Component { public bool enabled = true; }
}

namespace TMPro
{
    public class TextMeshProUGUI : UnityEngine.Component { public string text = ""; public bool enabled = true; }
}

namespace UdonSharp
{
    public enum BehaviourSyncMode { Any, Continuous, Manual, None, NoVariableSync }
    [AttributeUsage(AttributeTargets.Class)] public class UdonBehaviourSyncMode : Attribute { public UdonBehaviourSyncMode(BehaviourSyncMode mode) { } }
    [AttributeUsage(AttributeTargets.Field)] public class UdonSynced : Attribute { }

    public class UdonSharpBehaviour : UnityEngine.MonoBehaviour
    {
        public virtual void OnDeserialization() { }
        public virtual void OnPlayerLeft(VRC.SDKBase.VRCPlayerApi player) { }
        public virtual void OnPlayerTriggerEnter(VRC.SDKBase.VRCPlayerApi player) { }
        public virtual void OnPlayerTriggerExit(VRC.SDKBase.VRCPlayerApi player) { }
        public void RequestSerialization() { }
        public void SendCustomNetworkEvent(VRC.Udon.Common.Interfaces.NetworkEventTarget target, string name) { }
        public void SendCustomEventDelayedFrames(string name, int frames) { }
        public void SendCustomEvent(string name) { }
    }
}

namespace VRC.Udon
{
    public class UdonBehaviour : UnityEngine.Component { public void SendCustomEvent(string name) { } }
}

namespace VRC.Udon.Common.Interfaces
{
    public enum NetworkEventTarget { All, Owner }
}

namespace VRC.SDKBase
{
    using UnityEngine;

    public class VRC_Pickup { public enum PickupHand { None, Left, Right } }

    public class VRCPlayerApi
    {
        public static readonly Dictionary<int, VRCPlayerApi> Registry = new Dictionary<int, VRCPlayerApi>();
        public int playerId;
        public string displayName;
        public enum TrackingDataType { Head, LeftHand, RightHand }
        public struct TrackingData { public Vector3 position; }
        public static VRCPlayerApi GetPlayerById(int id) => Registry.TryGetValue(id, out var p) ? p : null;
        public bool IsUserInVR() => false;
        public bool IsOwner(GameObject obj) => Networking.OwnerFlag;
        public Vector3 GetBonePosition(HumanBodyBones bone) => Vector3.zero;
        public TrackingData GetTrackingData(TrackingDataType type) => new TrackingData();
        public void PlayHapticEventInHand(VRC_Pickup.PickupHand hand, float a, float b, float c) { }
    }

    public static class Networking
    {
        public static bool OwnerFlag;
        public static VRCPlayerApi LocalPlayer;
        public static bool IsOwner(GameObject obj) => OwnerFlag;
        public static void SetOwner(VRCPlayerApi player, GameObject obj) { }
        public static VRCPlayerApi GetOwner(GameObject obj) => LocalPlayer;
    }

    public static class Utilities { public static bool IsValid(object o) => o != null; }
}
