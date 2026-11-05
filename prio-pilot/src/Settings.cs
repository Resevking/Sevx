using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PrioPilot
{
    /// <summary>Was mit einer App passieren soll.</summary>
    internal enum Rule
    {
        Auto = 0,     // PrioPilot entscheidet selbst
        Vorrang,      // immer hohe Priorität, wird nie gebremst
        Bremsen,      // im Hintergrund immer gebremst
        Pausieren,    // im Hintergrund (minimiert) nach einer Weile angehalten
        Ignorieren    // wird nie angefasst
    }

    /// <summary>Einstellungen, gespeichert als einfache Textdatei in %APPDATA%\PrioPilot.</summary>
    internal sealed class Settings
    {
        public static string DirOverride; // nur für den Selbsttest

        public bool Active = true;
        public bool FocusBoost = true;
        public bool AutoThrottle = true;
        public int CpuThreshold = 10;          // % der gesamten CPU
        public int IoThresholdMB = 30;         // MB/s Datenträger-/E-A-Last
        public bool AutoRam = true;
        public int RamThreshold = 85;          // % belegter Arbeitsspeicher
        public bool EcoMode = true;            // Windows-Effizienzmodus (EcoQoS) für gebremste Apps
        public bool TrimWhenPaused = true;
        public bool TrimWhenThrottled = false;
        public int PauseAfterSeconds = 60;
        public int IntervalSeconds = 3;
        public readonly Dictionary<string, Rule> Rules = new Dictionary<string, Rule>(StringComparer.OrdinalIgnoreCase);

        public static string Dir
        {
            get
            {
                if (DirOverride != null) return DirOverride;
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PrioPilot");
            }
        }

        public static string FilePath
        {
            get { return Path.Combine(Dir, "einstellungen.ini"); }
        }

        public Rule RuleOf(string key)
        {
            Rule r;
            return Rules.TryGetValue(key, out r) ? r : Rule.Auto;
        }

        public static Settings Load()
        {
            Settings s = new Settings();
            try
            {
                if (!File.Exists(FilePath)) return s;
                string section = "";
                foreach (string raw in File.ReadAllLines(FilePath, Encoding.UTF8))
                {
                    string line = raw.Trim();
                    if (line.Length == 0 || line[0] == ';' || line[0] == '#') continue;
                    if (line[0] == '[' && line.EndsWith("]"))
                    {
                        section = line.Substring(1, line.Length - 2).Trim().ToLowerInvariant();
                        continue;
                    }
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string key = line.Substring(0, eq).Trim();
                    string val = line.Substring(eq + 1);
                    int comment = val.IndexOf(';');
                    if (comment >= 0) val = val.Substring(0, comment);
                    val = val.Trim();
                    if (section == "regeln")
                    {
                        Rule r;
                        if (TryParseRule(val, out r) && r != Rule.Auto) s.Rules[key.ToLowerInvariant()] = r;
                    }
                    else
                    {
                        s.Set(key.ToLowerInvariant(), val);
                    }
                }
            }
            catch (Exception)
            {
                // Kaputte Datei? Dann mit Standardwerten weiterarbeiten.
            }
            return s;
        }

        void Set(string key, string val)
        {
            switch (key)
            {
                case "aktiv": Active = Bool(val, Active); break;
                case "aktiveappbevorzugen": FocusBoost = Bool(val, FocusBoost); break;
                case "hintergrundbremsen": AutoThrottle = Bool(val, AutoThrottle); break;
                case "cpuschwelleprozent": CpuThreshold = Int(val, CpuThreshold, 1, 100); break;
                case "easchwellemb": IoThresholdMB = Int(val, IoThresholdMB, 0, 100000); break;
                case "ramfreigeben": AutoRam = Bool(val, AutoRam); break;
                case "ramschwelleprozent": RamThreshold = Int(val, RamThreshold, 30, 99); break;
                case "ecomodus": EcoMode = Bool(val, EcoMode); break;
                case "ramfreigebenbeimpausieren": TrimWhenPaused = Bool(val, TrimWhenPaused); break;
                case "ramfreigebenbeimbremsen": TrimWhenThrottled = Bool(val, TrimWhenThrottled); break;
                case "pausierennachsekunden": PauseAfterSeconds = Int(val, PauseAfterSeconds, 0, 86400); break;
                case "intervallsekunden": IntervalSeconds = Int(val, IntervalSeconds, 1, 60); break;
            }
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Dir);
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("; PrioPilot – Einstellungen (kann auch von Hand bearbeitet werden, 1 = an, 0 = aus)");
                sb.AppendLine("[Allgemein]");
                sb.AppendLine("Aktiv=" + B(Active));
                sb.AppendLine("AktiveAppBevorzugen=" + B(FocusBoost));
                sb.AppendLine("HintergrundBremsen=" + B(AutoThrottle));
                sb.AppendLine("CpuSchwelleProzent=" + CpuThreshold.ToString(CultureInfo.InvariantCulture));
                sb.AppendLine("EaSchwelleMB=" + IoThresholdMB.ToString(CultureInfo.InvariantCulture) + "   ; MB/s Datenträgerlast, 0 = aus");
                sb.AppendLine("RamFreigeben=" + B(AutoRam));
                sb.AppendLine("RamSchwelleProzent=" + RamThreshold.ToString(CultureInfo.InvariantCulture));
                sb.AppendLine("EcoModus=" + B(EcoMode) + "   ; Windows-Effizienzmodus für gebremste Apps");
                sb.AppendLine("RamFreigebenBeimPausieren=" + B(TrimWhenPaused));
                sb.AppendLine("RamFreigebenBeimBremsen=" + B(TrimWhenThrottled));
                sb.AppendLine("PausierenNachSekunden=" + PauseAfterSeconds.ToString(CultureInfo.InvariantCulture));
                sb.AppendLine("IntervallSekunden=" + IntervalSeconds.ToString(CultureInfo.InvariantCulture));
                sb.AppendLine();
                sb.AppendLine("; Regeln pro App: vorrang | bremsen | pausieren | ignorieren");
                sb.AppendLine("[Regeln]");
                List<string> keys = new List<string>(Rules.Keys);
                keys.Sort(StringComparer.OrdinalIgnoreCase);
                foreach (string k in keys) sb.AppendLine(k + "=" + RuleToIni(Rules[k]));
                File.WriteAllText(FilePath, sb.ToString(), new UTF8Encoding(false));
            }
            catch (Exception)
            {
                // Speichern ist nicht kritisch – beim nächsten Mal klappt es vielleicht.
            }
        }

        public static string RuleToIni(Rule r)
        {
            switch (r)
            {
                case Rule.Vorrang: return "vorrang";
                case Rule.Bremsen: return "bremsen";
                case Rule.Pausieren: return "pausieren";
                case Rule.Ignorieren: return "ignorieren";
                default: return "auto";
            }
        }

        public static bool TryParseRule(string s, out Rule r)
        {
            switch ((s ?? "").Trim().ToLowerInvariant())
            {
                case "vorrang": r = Rule.Vorrang; return true;
                case "bremsen": r = Rule.Bremsen; return true;
                case "pausieren": r = Rule.Pausieren; return true;
                case "ignorieren": r = Rule.Ignorieren; return true;
                case "auto": case "automatisch": r = Rule.Auto; return true;
            }
            r = Rule.Auto;
            return false;
        }

        public static string RuleLabel(Rule r)
        {
            switch (r)
            {
                case Rule.Vorrang: return "Immer Vorrang";
                case Rule.Bremsen: return "Im Hintergrund bremsen";
                case Rule.Pausieren: return "Im Hintergrund pausieren";
                case Rule.Ignorieren: return "Nie anfassen";
                default: return "Automatisch";
            }
        }

        // ---- Autostart (HKCU\...\Run, keine Admin-Rechte nötig) ----

        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string RunName = "PrioPilot";

        static string AutostartCommand
        {
            get { return "\"" + Application.ExecutablePath + "\" /tray"; }
        }

        public static bool AutostartEnabled
        {
            get
            {
                try
                {
                    using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                        return k != null && k.GetValue(RunName) != null;
                }
                catch (Exception) { return false; }
            }
        }

        public static bool SetAutostart(bool on)
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
                {
                    if (on) k.SetValue(RunName, AutostartCommand);
                    else k.DeleteValue(RunName, false);
                }
                return true;
            }
            catch (Exception) { return false; }
        }

        /// <summary>Falls die EXE verschoben wurde, den Autostart-Eintrag auf den neuen Ort zeigen lassen.</summary>
        public static void RepairAutostartPath()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    if (k == null) return;
                    string cur = k.GetValue(RunName) as string;
                    if (cur != null && !string.Equals(cur, AutostartCommand, StringComparison.OrdinalIgnoreCase))
                        k.SetValue(RunName, AutostartCommand);
                }
            }
            catch (Exception) { }
        }

        static string B(bool b) { return b ? "1" : "0"; }

        static bool Bool(string s, bool def)
        {
            s = s.Trim().ToLowerInvariant();
            if (s == "1" || s == "ja" || s == "an" || s == "true") return true;
            if (s == "0" || s == "nein" || s == "aus" || s == "false") return false;
            return def;
        }

        static int Int(string s, int def, int min, int max)
        {
            int v;
            if (!int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out v)) return def;
            return Math.Max(min, Math.Min(max, v));
        }
    }
}
