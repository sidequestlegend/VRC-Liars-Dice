// Golden vectors from the upstream C#: LiarsDiceMaster and PlayerHandle are compiled unchanged (Harness.csproj)
// and their private rule methods are called through reflection on states chosen here. Output: one JSON file that
// test/golden.test.ts compares with the TypeScript port.
//
//   V1 ReturnNextUser (M:294-310), ReturnLastPlayer (M:389-401): every seat pattern, start seat, postContestTurn
//   V2 CalcSumShowDice (M:403-435): the count, each die's frame and tint, the Continue stations
//   V3 PlayerHandle._Submit acceptance (P:491-517) and HighLightButton colours (P:371-414)
//   V4 _PlayerContests on the owner (M:330-387): state after, and the display text without colour tags
//   V5 UpdateText (M:697-753): the display text without colour tags

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using akaUdon;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;

static class Program
{
    const BindingFlags All = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
    static readonly System.Random rng = new System.Random(20261124);

    static void Set(object o, string field, object value) => o.GetType().GetField(field, All)!.SetValue(o, value);
    static T Get<T>(object o, string field) => (T)o.GetType().GetField(field, All)!.GetValue(o);
    static object Call(object o, string method, params object[] args)
    {
        var m = o.GetType().GetMethods(All).First(x => x.Name == method && x.GetParameters().Length == args.Length);
        try { return m.Invoke(o, args); }
        catch (TargetInvocationException e) { throw e.InnerException!; }
    }

    static string Plain(string text) => Regex.Replace(Regex.Replace(text, "</?color[^>]*>", ""), "</?s>", "");

    static string ColorName(Color c)
    {
        if (c.r == 0 && c.g == 1 && c.b == 1) return "cyan";
        if (c.r == 1 && c.g == 1 && c.b == 1) return "white";
        if (c.r == 0.5f && c.g == 0.5f && c.b == 0.5f) return "gray";
        return $"{c.r},{c.g},{c.b}";
    }

    // ---- JSON, by hand (no packages) ----
    static string J(object v)
    {
        switch (v)
        {
            case null: return "null";
            case bool b: return b ? "true" : "false";
            case int i: return i.ToString();
            case float f: return f.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
            case string s: return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n") + "\"";
            case IDictionary<string, object> d: return "{" + string.Join(",", d.Select(kv => J(kv.Key) + ":" + J(kv.Value))) + "}";
            case System.Collections.IEnumerable e: return "[" + string.Join(",", e.Cast<object>().Select(J)) + "]";
            default: throw new Exception("no JSON for " + v.GetType());
        }
    }

    static Dictionary<string, object> O(params (string, object)[] kv) => kv.ToDictionary(x => x.Item1, x => x.Item2);

    // ---- a table built from the upstream classes ----
    static LiarsDiceMaster NewMaster(out PlayerHandle[] handles, out Renderer[] dice, out TextMeshProUGUI display)
    {
        var m = new LiarsDiceMaster();
        handles = new PlayerHandle[4];
        for (int i = 0; i < 4; i++)
        {
            var h = new PlayerHandle();
            foreach (var f in new[] { "joinUi", "leaveUi", "startUi", "continueUi", "preGameUi", "inGameUi", "wildIconUi" }) Set(h, f, new GameObject());
            Set(h, "numButtons", Enumerable.Range(0, 6).Select(_ => new Button()).ToArray());
            Set(h, "otherButtons", Enumerable.Range(0, 4).Select(_ => new Button()).ToArray());
            Set(h, "numberDisplay", new TextMeshProUGUI());
            Set(h, "playerNameDisplay", new TextMeshProUGUI());
            Set(h, "diceMaster", m);
            Set(h, "stationNum", i);
            handles[i] = h;
        }
        dice = Enumerable.Range(0, 20).Select(_ => new Renderer()).ToArray();
        display = new TextMeshProUGUI();
        Set(m, "playerHandles", handles);
        Set(m, "diceMesh", dice);
        Set(m, "displayText", display);
        Set(m, "rulesText", new TextMeshProUGUI());
        Set(m, "onesWildStateVisual", new GameObject());
        return m;
    }

    static int[] Pattern(int bits, int set, int unset) => Enumerable.Range(0, 4).Select(i => ((bits >> i) & 1) == 1 ? set : unset).ToArray();

    static void Main(string[] args)
    {
        string outPath = args.Length > 0 ? args[0] : Path.Combine("..", "vectors.json");
        for (int id = 0; id < 100; id++) VRCPlayerApi.Registry[id] = new VRCPlayerApi { playerId = id, displayName = "P" + id };
        Networking.LocalPlayer = VRCPlayerApi.Registry[99];
        var doc = new Dictionary<string, object> {
            ["source"] = "akalink/VRC-Liars-Dice fd8c862ea1f3520c1b17cefe14b29474aee74028, Assets/LiarsDice/UdonScripts, compiled with dotnet 8 against golden/harness/Stubs.cs",
        };

        // ---- V1 ----
        var next = new List<object>();
        var last = new List<object>();
        int skippedNext = 0, skippedLast = 0;
        {
            var m = NewMaster(out _, out _, out _);
            for (int seated = 0; seated < 16; seated++)
            for (int hasDice = 0; hasDice < 16; hasDice++)
            for (int start = -1; start < 4; start++)
            foreach (bool post in new[] { false, true })
            {
                var cp = Pattern(seated, 7, -1).Select((v, i) => v == -1 ? -1 : 10 + i).ToArray();
                var rem = Pattern(hasDice, 3, 0);
                bool loops = !post && start >= 0 && rem[start] > 0 && !Enumerable.Range(0, 4).Any(i => cp[i] != -1 && rem[i] >= 1);
                if (loops) { skippedNext++; continue; } // upstream never returns
                Set(m, "currentPlayers", cp.ToArray()); Set(m, "remaining", rem.ToArray()); Set(m, "postContestTurn", post);
                object result;
                try { result = (int)Call(m, "ReturnNextUser", start); }
                catch (IndexOutOfRangeException) { result = "throws"; }
                next.Add(O(("currentPlayers", cp), ("remaining", rem), ("next", start), ("postContestTurn", post), ("result", result)));
            }
            for (int seated = 0; seated < 16; seated++)
            for (int start = 0; start < 4; start++)
            {
                var cp = Pattern(seated, 7, -1).Select((v, i) => v == -1 ? -1 : 10 + i).ToArray();
                if (seated == 0) { skippedLast++; continue; } // upstream never returns
                Set(m, "currentPlayers", cp.ToArray());
                last.Add(O(("currentPlayers", cp), ("lastPlayer", start), ("result", (int)Call(m, "ReturnLastPlayer", start))));
            }
        }
        doc["nextUser"] = next; doc["lastPlayer"] = last;
        doc["skipped"] = O(("nextUser", skippedNext), ("lastPlayer", skippedLast));

        // ---- V2 ----
        var sums = new List<object>();
        for (int n = 0; n < 3000; n++)
        {
            var m = NewMaster(out var handles, out var dice, out _);
            var cp = Enumerable.Range(0, 4).Select(i => rng.Next(3) == 0 ? -1 : 10 + i).ToArray();
            var rem = Enumerable.Range(0, 4).Select(_ => rng.Next(0, 6)).ToArray();
            var dv = Enumerable.Range(0, 20).Select(_ => rng.Next(0, 6)).ToArray();
            int die = rng.Next(-1, 6); bool wild = rng.Next(2) == 0; bool invalid = rng.Next(2) == 0;
            Set(m, "currentPlayers", cp.ToArray()); Set(m, "remaining", rem.ToArray()); Set(m, "dieValues", dv.ToArray());
            Set(m, "currentDie", die); Set(m, "onesWild", wild); Set(m, "onesInvalid", invalid);
            int sum = (int)Call(m, "CalcSumShowDice");
            sums.Add(O(("currentPlayers", cp), ("remaining", rem), ("dieValues", dv), ("currentDie", die), ("onesWild", wild), ("onesInvalid", invalid),
                ("sum", sum),
                ("frames", dice.Select(d => d.material.frame.HasValue ? (object)(int)d.material.frame.Value : null).ToArray()),
                ("tints", dice.Select(d => d.material.color.HasValue ? (object)ColorName(d.material.color.Value) : null).ToArray()),
                ("continueSeats", handles.Select(h => (object)Get<GameObject>(h, "continueUi").activeSelf).ToArray())));
        }
        doc["calcSum"] = sums;

        // ---- V3 ----
        var bids = new List<object>();
        {
            Networking.OwnerFlag = false; // _ReceiveBid then does nothing
            var m = NewMaster(out var handles, out _, out _);
            var h = handles[0];
            var me = VRCPlayerApi.Registry[99];
            for (int n = 0; n < 10000; n++)
            {
                int min = rng.Next(1, 21), max = rng.Next(1, 21), multi = rng.Next(1, 21);
                int dieNumber = rng.Next(-1, 7), prev = rng.Next(-1, 6), first = rng.Next(-1, 6), num = rng.Next(-1, 7);
                Set(h, "owner", me); Set(h, "localPlayer", me); Set(h, "yourTurn", true); Set(h, "interactDelay", true); Set(h, "task", 0);
                Set(h, "min", min); Set(h, "max", max); Set(h, "multiNum", multi); Set(h, "dieNumber", dieNumber); Set(h, "prevDieNumber", prev); Set(h, "firstTurnFlag", first);
                Call(h, "HighLightButton", num);
                var faces = Get<Button[]>(h, "numButtons").Select(b => (object)ColorName(b.colors.normalColor)).ToArray();
                var others = Get<Button[]>(h, "otherButtons").Select(b => (object)ColorName(b.colors.normalColor)).ToArray();
                Call(h, "_Submit");
                bool accepted = Get<int>(h, "task") == 3;
                bids.Add(O(("min", min), ("max", max), ("multiNum", multi), ("dieNumber", dieNumber), ("prevDieNumber", prev), ("firstTurnFlag", first), ("num", num),
                    ("faces", faces), ("others", others), ("accepted", accepted)));
            }
        }
        doc["bids"] = bids;

        // ---- V4 ----
        var contests = new List<object>();
        Networking.OwnerFlag = true;
        for (int n = 0; n < 3000; n++)
        {
            var m = NewMaster(out _, out _, out var display);
            int[] cp;
            do { cp = Enumerable.Range(0, 4).Select(i => rng.Next(3) == 0 ? -1 : 10 + i).ToArray(); } while (cp.Count(x => x != -1) < 2);
            var rem = Enumerable.Range(0, 4).Select(i => cp[i] == -1 ? rng.Next(0, 6) : rng.Next(1, 6)).ToArray();
            var seats = Enumerable.Range(0, 4).Where(i => cp[i] != -1).ToArray();
            int playing = seats[rng.Next(seats.Length)];
            int inPlay = Enumerable.Range(0, 4).Where(i => cp[i] != -1).Sum(i => rem[i]);
            int die = rng.Next(0, 6), multi = rng.Next(1, inPlay + 1);
            bool wild = rng.Next(2) == 0; bool invalid = wild && (die == 0 || rng.Next(3) == 0);
            var dv = Enumerable.Range(0, 20).Select(_ => rng.Next(0, 6)).ToArray();
            int post = rng.Next(-1, 4);
            Set(m, "currentPlayers", cp.ToArray()); Set(m, "remaining", rem.ToArray()); Set(m, "dieValues", dv.ToArray());
            Set(m, "numJoinedPlayers", seats.Length); Set(m, "playingPlayer", playing); Set(m, "currentMulti", multi); Set(m, "currentDie", die);
            Set(m, "onesWild", wild); Set(m, "onesInvalid", invalid); Set(m, "postContestTurn", false); Set(m, "postContestTurnPlayer", post);
            Call(m, "_PlayerContests");
            contests.Add(O(
                ("in", O(("currentPlayers", cp), ("remaining", rem), ("dieValues", dv), ("numJoinedPlayers", seats.Length), ("playingPlayer", playing),
                    ("currentMulti", multi), ("currentDie", die), ("onesWild", wild), ("onesInvalid", invalid), ("postContestTurnPlayer", post))),
                ("out", O(("currentPlayers", Get<int[]>(m, "currentPlayers")), ("remaining", Get<int[]>(m, "remaining")), ("numJoinedPlayers", Get<int>(m, "numJoinedPlayers")),
                    ("playingPlayer", Get<int>(m, "playingPlayer")), ("postContestTurnPlayer", Get<int>(m, "postContestTurnPlayer")), ("postContestTurn", Get<bool>(m, "postContestTurn")),
                    ("currentMulti", Get<int>(m, "currentMulti")), ("currentDie", Get<int>(m, "currentDie")))),
                ("text", Plain(display.text))));
        }
        doc["contests"] = contests;

        // ---- V5 ----
        var texts = new List<object>();
        for (int n = 0; n < 3000; n++)
        {
            var m = NewMaster(out _, out _, out var display);
            var cp = Enumerable.Range(0, 4).Select(i => rng.Next(3) == 0 ? -1 : 10 + i).ToArray();
            bool started = rng.Next(3) != 0;
            var seats = Enumerable.Range(0, 4).Where(i => cp[i] != -1).ToArray();
            int playing = seats.Length > 0 && rng.Next(6) != 0 ? seats[rng.Next(seats.Length)] : -1;
            int die = rng.Next(-1, 6), multi = rng.Next(1, 21);
            bool wild = rng.Next(2) == 0, invalid = rng.Next(2) == 0;
            int winner = rng.Next(2) == 0 ? -1 : rng.Next(10, 14);
            Set(m, "currentPlayers", cp.ToArray()); Set(m, "gameStarted", started); Set(m, "playingPlayer", playing); Set(m, "currentDie", die);
            Set(m, "currentMulti", multi); Set(m, "onesWild", wild); Set(m, "onesInvalid", invalid); Set(m, "lastWinner", winner);
            Call(m, "UpdateText", "Liar's Dice");
            texts.Add(O(("currentPlayers", cp), ("gameStarted", started), ("playingPlayer", playing), ("currentDie", die), ("currentMulti", multi),
                ("onesWild", wild), ("onesInvalid", invalid), ("lastWinner", winner), ("text", Plain(display.text))));
        }
        doc["texts"] = texts;

        File.WriteAllText(outPath, J(doc) + "\n", new UTF8Encoding(false));
        Console.WriteLine($"wrote {outPath}: nextUser {next.Count} (skipped {skippedNext}), lastPlayer {last.Count} (skipped {skippedLast}), calcSum {sums.Count}, bids {bids.Count}, contests {contests.Count}, texts {texts.Count}");
    }
}
