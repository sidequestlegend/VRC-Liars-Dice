// The liars-dice kit: "Liars Dice Table.prefab" (akalink/VRC-Liars-Dice, MIT) made into a kit the snippet script loads.
// Upstream assembles a table with its editor menu (editor/GenerateDiceTable.cs: instantiate the table prefab, optionally a
// logger); this builder does the same from the imported prefab, without the logger, and makes what VRChat did into what
// the app has. What changes against upstream, and why, is in altspace/PORT.md (sections 5 to 7 and 10).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using PortKit;
using TMPro;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace LiarsDice
{
    public sealed class LiarsDiceKitBuilder : KitBuilder
    {
        public const string UpstreamRoot = "Assets/Upstream/Assets/LiarsDice";
        public const string UpstreamPrefab = UpstreamRoot + "/Liars Dice Table.prefab";
        const string Art = UpstreamRoot + "/Art Assets";
        const string UpstreamController = Art + "/Animations/UIEffect.controller";
        const string KitDir = "Assets/Kit";
        const string MaterialFolder = KitDir + "/Materials";
        const string AnimationFolder = KitDir + "/Animations";
        const string FontPath = KitDir + "/Fonts/ArchivoBlack-Regular.ttf";
        const string FontAssetPath = KitDir + "/Fonts/ArchivoBlack SDF.asset";
        const string AtlasPath = KitDir + "/Art/dice_atlas.png";
        const string WildPath = KitDir + "/Art/wild.png";
        const string ShaderPath = KitDir + "/Shaders/DiceFlipbook.shader";
        /// <summary>The table top is at the upstream root; its legs reach 0.847 m below. The kit root is the floor point.</summary>
        const float TableHeight = 0.845f;

        static readonly string[] Stations = { "p1", "p2", "p3", "p4" };
        static readonly string[] Faces = { "one", "two", "three", "four", "five", "six" };

        /// <summary>Upstream files that must not reach the kit (licence: section 1 of PORT.md and THIRD-PARTY-NOTICES.md).</summary>
        public static readonly string[] Forbidden =
        {
            "Heavitas", "teeth.png", "/boo.wav", "/yay.wav", "/chime.wav", "/click-01.wav", "click w-pitch amp.wav", "all dice.png",
            "all dice normals.png", "dice flipbook.shader", "TMP_SDF-Mobile-Billboard", "Materials/die.mat", "Materials/sphere.mat",
        };

        public override string Slug => "liars-dice";
        public override string Title => "Liar's Dice";
        public override string Summary => "Liar's dice for two to four players at a round table. A port of VRC Liars Dice.";
        public override string Description =>
            "Liar's dice (perudo) for two to four players, with anyone else watching: take a station, roll five dice that only you can see, " +
            "bid on how many of a face are on the table, or call the last bid a lie. Ones are wild until someone bids on ones. Every player's " +
            "roll is a fair draw that nobody can see or change before the challenge. A port of VRC Liars Dice by akalink " +
            "(https://github.com/akalink/VRC-Liars-Dice, MIT); the credits button on the menu panel lists every licence.";
        public override string SnippetPosition => "0 0 0";
        public override IReadOnlyList<(string name, string value)> SnippetSettings => new[]
        {
            ("room", ""), ("ones-wild", "true"), ("sound", "true"), ("volume", "1"), ("ui-range", "3.5"),
            ("commit-timeout", "15"), ("reveal-timeout", "15"), ("rejoin-grace", "20"), ("min-players", "2"), ("debug", "false"),
        };

        GameObject set;
        TMP_FontAsset font;

        protected override void Compose(KitStage stage)
        {
            var upstream = AssetDatabase.LoadAssetAtPath<GameObject>(UpstreamPrefab) ?? throw new Exception($"no upstream prefab at {UpstreamPrefab}: run the importer");
            set = stage.Copy(upstream, null, "LiarsDiceTable");
            set.transform.localPosition = new Vector3(0f, TableHeight, 0f);
            set.transform.localRotation = Quaternion.identity;
            Transform F(string path) => set.transform.Find(path) ?? throw new Exception($"the upstream prefab has no '{path}'");

            // VRChat's layers (17 menu, 18 stations, 2 fingertips) mean nothing here: Default, then UI for what is clicked.
            foreach (var t in set.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = 0;

            // ---- what is not ported: the fingertip trackers (F55-F57) ----
            Object.DestroyImmediate(F("Position Tracker").gameObject);

            // ---- colliders: VRChat's trigger volumes would swallow clicks; the selectors become the click targets ----
            Object.DestroyImmediate(F("HandTrackerToggle").GetComponent<MeshCollider>());
            Object.DestroyImmediate(F("Menu Options").GetComponent<BoxCollider>());
            foreach (var p in Stations)
            {
                Object.DestroyImmediate(F("master script/" + p).GetComponent<SphereCollider>());
                Object.DestroyImmediate(F("master script/" + p + "/Canvas").GetComponent<BoxCollider>());
            }
            foreach (var trigger in set.GetComponentsInChildren<BoxCollider>(true)) trigger.isTrigger = false;

            // ---- uGUI: clicks arrive through colliders; the volume slider keeps uGUI (a nested canvas with its own raycaster,
            //      read from above), and the buttons' calls to VRChat's UdonBehaviour go ----
            foreach (var raycaster in set.GetComponentsInChildren<UnityEngine.UI.GraphicRaycaster>(true)) Object.DestroyImmediate(raycaster);
            foreach (var scaler in set.GetComponentsInChildren<UnityEngine.UI.CanvasScaler>(true)) Object.DestroyImmediate(scaler);
            foreach (var button in set.GetComponentsInChildren<UnityEngine.UI.Button>(true))
            {
                for (int i = button.onClick.GetPersistentEventCount() - 1; i >= 0; i--) UnityEditor.Events.UnityEventTools.RemovePersistentListener(button.onClick, i);
                button.transition = UnityEngine.UI.Selectable.Transition.None;              // the page colours the buttons (uiColor)
            }
            var slider = F("Menu Options/Volume/Slider").GetComponent<UnityEngine.UI.Slider>();
            for (int i = slider.onValueChanged.GetPersistentEventCount() - 1; i >= 0; i--) UnityEditor.Events.UnityEventTools.RemovePersistentListener(slider.onValueChanged, i);
            slider.gameObject.AddComponent<Canvas>();
            slider.gameObject.AddComponent<UnityEngine.UI.GraphicRaycaster>();
            // built-in UI sprites (Background, UISprite, Checkmark) are not the kit's: plain images instead
            foreach (var image in set.GetComponentsInChildren<UnityEngine.UI.Image>(true))
                if (image.sprite != null && !AssetDatabase.GetAssetPath(image.sprite).StartsWith("Assets/", StringComparison.Ordinal)) { image.sprite = null; image.type = UnityEngine.UI.Image.Type.Simple; }

            // ---- art: materials (URP), the wild icon, textures for Quest ----
            Textures();
            var (tableMaterial, diceMaterial) = Materials();
            foreach (var r in F("table").GetComponentsInChildren<MeshRenderer>(true)) { r.sharedMaterial = tableMaterial; r.gameObject.isStatic = false; }
            var wild = AssetDatabase.LoadAssetAtPath<Sprite>(WildPath) ?? throw new Exception("the wild icon is not a sprite");

            // ---- sounds: the five of unstated origin are replaced (THIRD-PARTY-NOTICES.md); the speakers become 3D ----
            AudioClip Clip(string path) => AssetDatabase.LoadAssetAtPath<AudioClip>(path) ?? throw new Exception($"no clip at {path}");
            var masterStandIn = F("master script").GetComponent<akaUdon.LiarsDiceMaster>();
            masterStandIn.TruthContestSfx = Clip(KitDir + "/Audio/jingles_SAX02.ogg");
            masterStandIn.LiarContestSfx = Clip(KitDir + "/Audio/jingles_SAX01.ogg");
            foreach (var source in set.GetComponentsInChildren<AudioSource>(true))
            {
                source.playOnAwake = false;
                source.spatialBlend = 1f;
                source.rolloffMode = AudioRolloffMode.Linear;
                source.minDistance = 0.3f;
                source.maxDistance = source.gameObject.name == "AudioSource" && source.transform.parent == set.transform ? 8f : 5f;
            }
            var controller = PushController(F("master script/p1"));

            // ---- the table: master, display, speaker, menu ----
            var master = F("master script").gameObject;
            stage.Object(master, key: "master");
            var billboard = F("billboard display").gameObject;
            Key(stage, billboard, "billboard");
            Key(stage, F("billboard display/Text (TMP)").gameObject, "display");
            Key(stage, F("billboard display/Text rules").gameObject, "rules");
            Billboard(billboard);
            Key(stage, F("AudioSource").gameObject, "speaker");
            stage.Object(F("HandTrackerToggle").gameObject, key: "proximity");
            var menu = F("Menu Options").gameObject;
            Key(stage, menu, "menu");
            Key(stage, F("Menu Options/1s wild/button/Image").gameObject, "onesWildCheck");
            Key(stage, F("Menu Options/mute sound/button/Image").gameObject, "soundCheck");
            Key(stage, slider.gameObject, "volumeSlider");
            foreach (var (path, key, method) in new[]
            {
                ("Menu Options/1s wild/button", "onesWildButton", "_OnesWild"),
                ("Menu Options/mute sound/button", "soundButton", "_ToggleAudio"),
                ("Menu Options/Leave game/button", "leaveGameButton", "_LeaveGame"),
            })
            {
                var go = F(path).gameObject;
                ClickCollider(go);
                stage.Object(go, key: key, click: true);
                stage.Event(go, "click", masterStandIn, method);
            }
            stage.Event(slider.gameObject, "uiSlider", masterStandIn, "_SetVolume");

            // ---- the stations ----
            var handles = new JArray();
            var diceMesh = new JArray();
            var canvases = new JArray { stage.ObjectValue(billboard), stage.ObjectValue(menu) };
            foreach (var p in Stations)
            {
                var root = F("master script/" + p);
                var handle = root.GetComponent<akaUdon.PlayerHandle>();
                handle.localSelectionSfx = Clip(KitDir + "/Audio/click_001.ogg");
                handle.altSelectionSfx = Clip(KitDir + "/Audio/select_002.ogg");
                handle.turnNotificationSfx = Clip(KitDir + "/Audio/confirmation_001.ogg");
                root.GetComponent<Animator>().runtimeAnimatorController = controller;
                Key(stage, root.gameObject, p);
                for (int k = 0; k < 5; k++)
                {
                    var die = root.Find($"dice ({k})").gameObject;
                    var r = die.GetComponent<MeshRenderer>();
                    r.sharedMaterial = diceMaterial;
                    r.shadowCastingMode = ShadowCastingMode.Off;
                    die.isStatic = false;
                    Key(stage, die, $"{p}_die{k}");
                    diceMesh.Add(stage.ComponentValue(die, "Renderer"));
                }
                Transform S(string path) => root.Find("Canvas/" + path) ?? throw new Exception($"{p} has no 'Canvas/{path}'");
                Key(stage, root.Find("Canvas").gameObject, p + "_canvas");
                canvases.Add(stage.ObjectValue(root.Find("Canvas").gameObject));
                var named = new (string path, string key)[]
                {
                    ("name display", "name"), ("Pre-Game", "preGame"), ("Pre-Game/Join", "join"), ("Pre-Game/leave", "leave"), ("Pre-Game/Start", "start"),
                    ("InGame", "inGame"), ("InGame/Num Selection/one/Image wild", "wild"), ("InGame/+&-/+", "plus"), ("InGame/+&-/-", "minus"),
                    ("InGame/+&-/result", "number"), ("InGame/Submit", "submit"), ("InGame/Call it", "callIt"), ("Continue", "continue"), ("Rules", "rules"),
                    ("AudioSource", "speaker"),
                };
                foreach (var (path, key) in named) Key(stage, S(path).gameObject, $"{p}_{key}");
                foreach (var face in Faces) Key(stage, S("InGame/Num Selection/" + face).gameObject, $"{p}_{face}");
                var wildImage = S("InGame/Num Selection/one/Image wild").GetComponent<UnityEngine.UI.Image>();
                wildImage.sprite = wild;
                wildImage.type = UnityEngine.UI.Image.Type.Simple;

                // the 15 selectors: click targets, each a FingerTrigger of this station
                var selectors = new (string path, string key)[]
                {
                    ("Pre-Game/Join", "join"), ("Pre-Game/leave", "leave"), ("Pre-Game/Start", "start"), ("Continue", "continue"), ("Rules", "rules"),
                    ("InGame/Submit", "submit"), ("InGame/Call it", "callIt"), ("InGame/+&-/+", "plus"), ("InGame/+&-/-", "minus"),
                }.Concat(Faces.Select(f => ("InGame/Num Selection/" + f, f))).ToArray();
                foreach (var (path, key) in selectors)
                {
                    var selector = S(path + "/selector");
                    stage.Object(selector.gameObject, key: $"{p}_{key}_sel", click: true);
                    stage.Behaviour(selector.GetComponent<akaUdon.FingerTrigger>(), extra: new JObject
                    {
                        ["behavior"] = stage.BehaviourValue(handle),
                        ["anim"] = stage.ComponentValue(root.gameObject, "Animator"),
                    });
                }
                handles.Add(stage.BehaviourValue(handle));
                stage.Behaviour(handle, extra: new JObject
                {
                    ["numButtons"] = new JArray(Faces.Select(f => (JToken)stage.ObjectValue(S("InGame/Num Selection/" + f).gameObject))),
                    ["otherButtons"] = new JArray(new[] { "InGame/+&-/+", "InGame/+&-/-", "InGame/Submit", "InGame/Call it" }.Select(x => (JToken)stage.ObjectValue(S(x).gameObject))),
                    ["speaker"] = stage.ComponentValue(S("AudioSource").gameObject, "AudioSource"),
                    ["diceMaster"] = stage.BehaviourValue(masterStandIn),
                });
            }
            stage.Behaviour(masterStandIn, extra: new JObject { ["playerHandles"] = handles, ["diceMesh"] = diceMesh, ["slider"] = stage.ObjectValue(slider.gameObject) });
            stage.Behaviour(F("HandTrackerToggle").GetComponent<akaUdon.ProximityEnable>(), extra: new JObject { ["canvases"] = canvases });
            stage.BehavioursFromStandIns();

            // ---- credits: a small button on the menu panel opens the notices ----
            Credits(stage, menu.transform);

            // ---- the font: Archivo Black (SIL OFL) for every text, Liberation Sans behind it for other letters ----
            font = Font();
        }

        protected override void Finishing(KitStage stage)
        {
            foreach (var text in set.GetComponentsInChildren<TMP_Text>(true))
            {
                text.font = font;
                text.fontSharedMaterial = font.material;
                text.richText = true;
            }
        }

        static void Key(KitStage stage, GameObject go, string key)
        {
            stage.Object(go, key: key);
            stage.Ref(go);
        }

        /// <summary>A box collider on a uGUI element's rectangle, so a click lands on it (layer 5 is set by the kit).</summary>
        static void ClickCollider(GameObject go)
        {
            var rect = go.GetComponent<RectTransform>();
            var box = go.GetComponent<BoxCollider>();
            if (box == null) box = go.AddComponent<BoxCollider>();
            box.center = rect.rect.center;
            box.size = new Vector3(rect.rect.width, rect.rect.height, Mathf.Min(rect.rect.width, rect.rect.height) * 0.2f);
        }

        /// <summary>The centre display turns about Y to face each viewer (upstream did it in a billboard text shader, F59).</summary>
        static void Billboard(GameObject go)
        {
            var type = GraphTypes.Find("BS.BSBillboard");
            var billboard = go.GetComponent(type) ?? go.AddComponent(type);
            var so = new SerializedObject(billboard);
            so.FindProperty("smoothing").floatValue = 0f;
            so.FindProperty("enableXAxis").boolValue = false;
            so.FindProperty("enableYAxis").boolValue = true;
            so.FindProperty("enableZAxis").boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        // ------------------------------------------------------------------ art

        static void Textures()
        {
            // the models' own material remaps point at upstream's die.mat (and through it the old atlas): the kit sets its
            // own materials, so the models import none
            foreach (var model in new[] { $"{Art}/Models/dice.fbx", $"{Art}/Models/table.fbx" })
            {
                var importer = AssetImporter.GetAtPath(model) as ModelImporter ?? throw new Exception($"no model at {model}");
                if (importer.materialImportMode == ModelImporterMaterialImportMode.None && importer.GetExternalObjectMap().Count == 0) continue;
                foreach (var remap in importer.GetExternalObjectMap().Keys.ToList()) importer.RemoveRemap(remap);
                importer.materialImportMode = ModelImporterMaterialImportMode.None;
                importer.SaveAndReimport();
            }
            Texture($"{Art}/Textures/table_DefaultMaterial_AlbedoTransparency.png", 1024, 512, false);
            Texture($"{Art}/Textures/table_DefaultMaterial_Normal.png", 1024, 512, true);
            Texture($"{Art}/Textures/table_DefaultMaterial_MetallicSmoothness.png", 256, 256, false);
            Texture(AtlasPath, 1024, 512, false);
            foreach (var n in new[] { "01", "02", "03", "04", "05", "06" }) Texture($"{Art}/Textures/{n}.png", 128, 128, false, sprite: true);
            Texture($"{Art}/Textures/button.png", 256, 128, false, sprite: true);
            Texture(WildPath, 128, 128, false, sprite: true);
            foreach (var clip in AssetDatabase.FindAssets("t:AudioClip", new[] { KitDir + "/Audio", Art + "/sounds" }).Select(AssetDatabase.GUIDToAssetPath))
            {
                var importer = (AudioImporter)AssetImporter.GetAtPath(clip);
                if (importer.forceToMono) continue;
                importer.forceToMono = true;
                importer.SaveAndReimport();
            }
        }

        static void Texture(string path, int windows, int android, bool normal, bool sprite = false)
        {
            var importer = AssetImporter.GetAtPath(path) as TextureImporter ?? throw new Exception($"no texture at {path}");
            bool changed = false;
            if (sprite && importer.textureType != TextureImporterType.Sprite) { importer.textureType = TextureImporterType.Sprite; importer.spriteImportMode = SpriteImportMode.Single; changed = true; }
            if (normal && importer.textureType != TextureImporterType.NormalMap) { importer.textureType = TextureImporterType.NormalMap; changed = true; }
            if (importer.maxTextureSize != windows) { importer.maxTextureSize = windows; changed = true; }
            var a = importer.GetPlatformTextureSettings("Android");
            if (!a.overridden || a.maxTextureSize != android || a.format != TextureImporterFormat.ASTC_6x6)
            {
                a.overridden = true;
                a.maxTextureSize = android;
                a.format = TextureImporterFormat.ASTC_6x6;
                importer.SetPlatformTextureSettings(a);
                changed = true;
            }
            if (changed) importer.SaveAndReimport();
        }

        static (Material table, Material dice) Materials()
        {
            Directory.CreateDirectory(MaterialFolder);
            var lit = Shader.Find("Universal Render Pipeline/Lit") ?? throw new Exception("URP Lit shader not found");
            var table = Save(new Material(lit) { name = "Table" });
            table.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>($"{Art}/Textures/table_DefaultMaterial_AlbedoTransparency.png"));
            table.SetColor("_BaseColor", Color.white);
            table.SetTexture("_BumpMap", AssetDatabase.LoadAssetAtPath<Texture2D>($"{Art}/Textures/table_DefaultMaterial_Normal.png"));
            table.SetTexture("_MetallicGlossMap", AssetDatabase.LoadAssetAtPath<Texture2D>($"{Art}/Textures/table_DefaultMaterial_MetallicSmoothness.png"));
            table.SetFloat("_Smoothness", 1f);
            table.SetFloat("_WorkflowMode", 1f);
            BaseShaderGUI.SetMaterialKeywords(table, UnityEditor.Rendering.Universal.ShaderGUI.LitGUI.SetMaterialKeywords);
            table.enableInstancing = false;
            EditorUtility.SetDirty(table);

            var flipbook = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath) ?? throw new Exception($"no shader at {ShaderPath}");
            var dice = Save(new Material(flipbook) { name = "Die" });
            dice.SetTexture("_MainTex", AssetDatabase.LoadAssetAtPath<Texture2D>(AtlasPath));
            dice.SetColor("_Color", Color.white);
            dice.SetFloat("_frame", 8f);
            dice.enableInstancing = false;
            EditorUtility.SetDirty(dice);
            AssetDatabase.SaveAssets();
            return (table, dice);
        }

        static Material Save(Material m)
        {
            string path = $"{MaterialFolder}/{m.name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing == null) { AssetDatabase.CreateAsset(m, path); return m; }
            existing.shader = m.shader;
            existing.CopyPropertiesFromMaterial(m);
            return existing;
        }

        /// <summary>
        /// Upstream's UIEffect controller with its 15 clips copied and corrected: each clip sets the pressed button's whole
        /// local position to (0, -7, 0.95) although the buttons sit in different places (PORT.md section 5, "Animators"), so a
        /// press would jump the button to the panel's centre. The copies keep each button's own x and y and push it in by z.
        /// </summary>
        static RuntimeAnimatorController PushController(Transform station)
        {
            Directory.CreateDirectory(AnimationFolder);
            string path = AnimationFolder + "/UIEffect.controller";
            AssetDatabase.DeleteAsset(path);
            if (!AssetDatabase.CopyAsset(UpstreamController, path)) throw new Exception("could not copy the UIEffect controller");
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
            foreach (var layer in controller.layers)
                foreach (var child in layer.stateMachine.states)
                {
                    if (!(child.state.motion is AnimationClip clip)) continue;
                    string clipPath = $"{AnimationFolder}/{clip.name}.anim";
                    AssetDatabase.DeleteAsset(clipPath);
                    var copy = Object.Instantiate(clip);
                    copy.name = clip.name;
                    foreach (var binding in AnimationUtility.GetCurveBindings(copy))
                    {
                        if (binding.path.EndsWith("/selector", StringComparison.Ordinal)) continue;
                        if (binding.propertyName != "m_LocalPosition.x" && binding.propertyName != "m_LocalPosition.y") continue;
                        var target = station.Find(binding.path) ?? throw new Exception($"clip {clip.name}: no '{binding.path}' under the station");
                        float value = binding.propertyName.EndsWith("x", StringComparison.Ordinal) ? target.localPosition.x : target.localPosition.y;
                        AnimationUtility.SetEditorCurve(copy, binding, AnimationCurve.Constant(0f, 0f, value));
                    }
                    AssetDatabase.CreateAsset(copy, clipPath);
                    child.state.motion = copy;
                }
            EditorUtility.SetDirty(controller);
            AssetDatabase.SaveAssets();
            return controller;
        }

        static TMP_FontAsset Font()
        {
            var source = AssetDatabase.LoadAssetAtPath<Font>(FontPath) ?? throw new Exception($"no font at {FontPath}");
            var characters = new StringBuilder();
            for (int c = 32; c < 127; c++) characters.Append((char)c);
            for (int c = 160; c < 256; c++) characters.Append((char)c);
            characters.Append("’‘“”–—…");
            var asset = KitText.StaticFontAsset(source, characters.ToString(), FontAssetPath, 72, 1024);
            var fallback = KitText.DefaultFont();
            if (fallback != null)
            {
                asset.fallbackFontAssetTable = new List<TMP_FontAsset> { fallback };
                EditorUtility.SetDirty(asset);
                AssetDatabase.SaveAssets();
            }
            return asset;
        }

        // ------------------------------------------------------------------ credits

        void Credits(KitStage stage, Transform canvas)
        {
            var open = stage.Create("CreditsButton", canvas);
            var openRect = open.AddComponent<RectTransform>();
            openRect.anchoredPosition3D = new Vector3(13f, -13f, 0f);
            openRect.sizeDelta = new Vector2(60f, 22f);
            open.transform.localScale = Vector3.one * 0.1f;
            open.AddComponent<UnityEngine.UI.Image>().color = new Color(0.85f, 0.85f, 0.85f);
            var openLabel = stage.Create("Text", open.transform);
            var openText = openLabel.AddComponent<TextMeshProUGUI>();
            openText.rectTransform.sizeDelta = new Vector2(60f, 22f);
            openText.fontSize = 13;
            openText.color = new Color(0.2f, 0.2f, 0.2f);
            openText.alignment = TextAlignmentOptions.Center;
            openText.text = "Credits";
            ClickCollider(open);

            var panel = stage.Create("CreditsPanel", canvas);
            var panelRect = panel.AddComponent<RectTransform>();
            panelRect.anchoredPosition3D = new Vector3(0f, 0f, -0.5f);
            panelRect.sizeDelta = new Vector2(560f, 330f);
            panel.transform.localScale = Vector3.one * 0.1f;
            panel.AddComponent<UnityEngine.UI.Image>().color = new Color(0.06f, 0.06f, 0.08f, 0.97f);
            var body = stage.Create("Text", panel.transform);
            var bodyText = body.AddComponent<TextMeshProUGUI>();
            bodyText.rectTransform.sizeDelta = new Vector2(530f, 310f);
            bodyText.fontSize = 11;
            bodyText.color = Color.white;
            bodyText.alignment = TextAlignmentOptions.TopLeft;
            bodyText.textWrappingMode = TextWrappingModes.Normal;
            bodyText.text = CreditsText;
            ClickCollider(panel);
            panel.SetActive(false);

            var token = stage.Behaviour(open, "CreditsPanel", new JObject { ["panel"] = stage.ObjectValue(panel) });
            stage.Object(open, key: "creditsButton", click: true);
            stage.Object(panel, key: "creditsPanel");
            stage.Ref(panel);
            stage.Event(panel, "click", token, "Toggle");
        }

        const string CreditsText =
            "<b>Liar's Dice</b>: a port of <b>VRC Liars Dice</b> by akalink (Garrett McPherson), MIT licence. Source: github.com/akalink/VRC-Liars-Dice. " +
            "Port source: github.com/sidequestlegend/VRC-Liars-Dice (branch altspace). The script also holds the portkit runtime (MIT).\n" +
            "Models, prefab and textures: VRC Liars Dice (MIT). Changed for Altspace: converted to URP, the dice shader remade, the dice " +
            "atlas's lettering redrawn, point-and-click buttons.\n" +
            "Sounds: \"dice_06.wav\" by dermotte, freesound.org/s/220744, licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0), made mono. " +
            "\"Dice Rolling on Table\" by Flem0527 (freesound 629982) and \"Audience Clapping.wav\" by Zeraora (freesound 429422), CC0. " +
            "Clicks, chime and jingles: Interface Sounds and Music Jingles by Kenney (kenney.nl), CC0.\n" +
            "Fonts: Archivo Black by Omnibus-Type, and Liberation Sans, both SIL Open Font License 1.1.\n" +
            "Not affiliated with VRChat. Click to close.";

        // ------------------------------------------------------------------ licence check

        /// <summary>
        /// Rung 2 addition: the saved kit prefab must not depend on any upstream file whose licence does not allow it to ship
        /// (the Heavitas font, the old atlas, the five sounds and the icon of unstated origin). Logs/liarsdice_licences.txt.
        /// </summary>
        [MenuItem("PortKit/Liars Dice/Check Licences")]
        public static void CheckLicences()
        {
            var report = new StringBuilder();
            var builder = new LiarsDiceKitBuilder();
            var deps = AssetDatabase.GetDependencies(builder.PrefabPath, true).OrderBy(d => d, StringComparer.Ordinal).ToList();
            var bad = deps.Where(d => d.StartsWith("Assets/Upstream/", StringComparison.Ordinal) && Forbidden.Any(f => d.IndexOf(f, StringComparison.OrdinalIgnoreCase) >= 0)).ToList();
            foreach (var d in deps) report.AppendLine("   " + d);
            report.AppendLine(bad.Count == 0 ? $"PASS {deps.Count} dependencies of {builder.PrefabPath}, none of them a file that must not ship"
                                             : $"FAIL {bad.Count} dependencies must not ship: {string.Join(", ", bad)}");
            report.AppendLine(bad.Count == 0 ? "DONE" : "FAILED");
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/liarsdice_licences.txt", report.ToString());
        }
    }
}
