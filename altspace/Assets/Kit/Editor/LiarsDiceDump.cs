using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace LiarsDice
{
    /// <summary>Writes the imported upstream prefab's hierarchy to Logs/liarsdice_dump.txt (what the kit builder works from).</summary>
    public static class LiarsDiceDump
    {
        public const string Prefab = "Assets/Upstream/Assets/LiarsDice/Liars Dice Table.prefab";

        [MenuItem("PortKit/Liars Dice/Dump Upstream Prefab")]
        public static void Dump()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Prefab);
            var text = new StringBuilder();
            if (prefab == null) text.AppendLine("no prefab at " + Prefab);
            else Walk(prefab.transform, 0, text);
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/liarsdice_dump.txt", text.ToString());
        }

        static void Walk(Transform t, int depth, StringBuilder text)
        {
            string pad = new string(' ', depth * 2 + 4);
            var comps = t.GetComponents<Component>().Select(c => c == null ? "MISSING" : c.GetType().Name).Where(n => n != "Transform");
            string rect = t is RectTransform r ? $" rect={r.rect.width:0.###}x{r.rect.height:0.###} piv={r.pivot} anch={r.anchoredPosition3D:F2}" : "";
            text.AppendLine($"{new string(' ', depth * 2)}{t.name} [{(t.gameObject.activeSelf ? "on" : "off")} L{t.gameObject.layer}] p={t.localPosition:F3} r={t.localEulerAngles:F1} s={t.localScale:F3}{rect} :: {string.Join(", ", comps)}");
            foreach (var c in t.GetComponents<Component>())
            {
                if (c is TMPro.TMP_Text tmp) text.AppendLine($"{pad}tmp '{tmp.text.Replace("\n", "\\n")}' size {tmp.fontSize} font {(tmp.font ? tmp.font.name : "null")} align {tmp.alignment} color {tmp.color} auto {tmp.enableAutoSizing}");
                if (c is UnityEngine.UI.Text ui) text.AppendLine($"{pad}text '{ui.text.Replace("\n", "\\n")}' size {ui.fontSize}");
                if (c is UnityEngine.UI.Image im) text.AppendLine($"{pad}image sprite {(im.sprite ? im.sprite.name : "null")} color {im.color} type {im.type}");
                if (c is UnityEngine.UI.Button b) text.AppendLine($"{pad}button transition {b.transition} calls {b.onClick.GetPersistentEventCount()}");
                if (c is MeshFilter mf && mf.sharedMesh) text.AppendLine($"{pad}mesh {mf.sharedMesh.name} bounds {mf.sharedMesh.bounds}");
                if (c is Renderer re) text.AppendLine($"{pad}materials {string.Join(", ", re.sharedMaterials.Select(m => m ? m.name + "(" + m.shader.name + ")" : "null"))}");
                if (c is BoxCollider bc) text.AppendLine($"{pad}box {bc.center:F3} {bc.size:F3} trigger {bc.isTrigger}");
                if (c is Canvas cv) text.AppendLine($"{pad}canvas mode {cv.renderMode}");
                if (c is AudioSource au) text.AppendLine($"{pad}audio clip {(au.clip ? au.clip.name : "null")} spatial {au.spatialBlend} min {au.minDistance} max {au.maxDistance} rolloff {au.rolloffMode} vol {au.volume}");
                if (c is Animator an) text.AppendLine($"{pad}animator {(an.runtimeAnimatorController ? an.runtimeAnimatorController.name : "null")}");
                if (c is MonoBehaviour mb && mb != null && mb.GetType().Namespace == "akaUdon")
                {
                    var so = new SerializedObject(mb);
                    var p = so.GetIterator();
                    bool enter = true;
                    while (p.NextVisible(enter))
                    {
                        enter = false;
                        if (p.name == "m_Script") continue;
                        string v = p.propertyType == SerializedPropertyType.ObjectReference ? (p.objectReferenceValue ? p.objectReferenceValue.name + "<" + p.objectReferenceValue.GetType().Name + ">" : "null")
                            : p.isArray && p.propertyType == SerializedPropertyType.Generic ? $"[{p.arraySize}]" : p.propertyType == SerializedPropertyType.String ? p.stringValue
                            : p.propertyType == SerializedPropertyType.Boolean ? p.boolValue.ToString() : p.propertyType.ToString();
                        text.AppendLine($"{pad}. {p.name} = {v}");
                    }
                }
            }
            foreach (Transform child in t) Walk(child, depth + 1, text);
        }
    }
}
