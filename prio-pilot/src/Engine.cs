using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Principal;
using System.Text;

namespace PrioPilot
{
    /// <summary>Alle Prozesse mit demselben Programmnamen (z. B. alle chrome.exe) als eine App.</summary>
    internal sealed class AppGroup
    {
        public string Key;
        public string Name;
        public bool Protected;

        public int Count;
        public double CpuPct;
        public double IoRate;
        public long PrivateBytes;
        public int Stamp;

        public int HotScans;         // wie oft hintereinander über der Schwelle
        public bool Hog;             // als "Fresser" erkannt (bleibt, bis die App wieder aktiv ist)
        public bool ManualPause;     // vom Benutzer angehalten
        public long BackgroundSince; // ms-Zeitstempel: seit wann nicht mehr aktiv
        public long LastTrim;        // ms-Zeitstempel: letztes Freigeben von RAM

        // Zustand für die Anzeige
        public int NumSuspended, NumThrottled, NumHigh, NumBoosted, NumNoAccess;

        public AppGroup(string key, string name)
        {
            Key = key;
            Name = name;
        }
    }

    internal enum Target { Untouched, Focus, High, Throttled, Paused }

    /// <summary>
    /// Das Herz von PrioPilot: entscheidet pro Prozess, ob er bevorzugt, gebremst oder angehalten wird,
    /// und setzt das um. Läuft komplett im UI-Thread, alle paar Sekunden ein kurzer Durchlauf.
    /// Eingegriffen wird nur bei Zustandswechseln – im Ruhezustand kostet ein Durchlauf ~1 Systemaufruf.
    /// </summary>
    internal sealed class Engine
    {
        public readonly Settings S;
        public readonly ProcessScanner Scanner = new ProcessScanner();
        public readonly Dictionary<string, AppGroup> Groups = new Dictionary<string, AppGroup>();
        public readonly bool IsAdmin;
        public readonly int OwnPid;
        public string FocusKey;            // die App, mit der der Benutzer gerade arbeitet
        public int ThrottledApps, PausedApps, PausedProcs;
        public bool TrackForeground = true; // Selbsttest schaltet das ab
        public int OnlyChildrenOf;          // Selbsttest: nur eigene Kindprozesse anfassen

        readonly uint ownSession;
        readonly List<string> tmpKeys = new List<string>();
        int groupStamp;
        bool recovered, pausedDirty, shutDown;
        bool ecoSupported = true, memPrioSupported = true, ghostSupported = true;
        long lastRamRelief;

        /// <summary>Teile von Windows, die nie angefasst werden – sonst ruckelt Maus, Ton, Taskleiste oder Anmeldung.</summary>
        static readonly HashSet<string> ProtectedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "leerlauf", "system", "registry", "memory compression", "secure system",
            "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe", "lsaiso.exe",
            "svchost.exe", "dwm.exe", "explorer.exe", "sihost.exe", "fontdrvhost.exe", "ctfmon.exe", "audiodg.exe",
            "conhost.exe", "dllhost.exe", "runtimebroker.exe", "taskhostw.exe", "taskmgr.exe", "userinit.exe",
            "logonui.exe", "lockapp.exe", "shellexperiencehost.exe", "startmenuexperiencehost.exe",
            "shellhost.exe", "searchhost.exe", "searchapp.exe", "searchui.exe", "textinputhost.exe",
            "applicationframehost.exe", "widgets.exe", "widgetservice.exe", "smartscreen.exe",
            "securityhealthsystray.exe", "securityhealthservice.exe", "msmpeng.exe", "nissrv.exe",
            "wudfhost.exe", "dashost.exe", "spoolsv.exe", "systemsettings.exe", "systemsettingsbroker.exe",
            "magnify.exe", "narrator.exe", "osk.exe", "tabtip.exe", "inputapp.exe", "useroobebroker.exe",
            "consent.exe", "werfault.exe", "wermgr.exe"
        };

        public Engine(Settings settings)
        {
            S = settings;
            OwnPid = Process.GetCurrentProcess().Id;
            Native.ProcessIdToSessionId(OwnPid, out ownSession);
            try
            {
                IsAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch (Exception) { IsAdmin = false; }
        }

        public static long NowMs()
        {
            return (long)(Stopwatch.GetTimestamp() * (1000.0 / Stopwatch.Frequency));
        }

        public Rule RuleOf(string key)
        {
            return S.RuleOf(key);
        }

        public static bool IsProtectedName(string key)
        {
            return ProtectedNames.Contains(key);
        }

        bool IsUserProcess(ProcInfo pi)
        {
            return pi.Pid > 4 && pi.SessionId == ownSession;
        }

        // ------------------------------------------------------------------ Ablauf

        /// <summary>Regelmäßiger Durchlauf: Prozesse lesen, Fresser erkennen, Regeln anwenden.</summary>
        public void Tick()
        {
            if (shutDown) return;
            Refresh();
            if (!recovered)
            {
                recovered = true;
                RecoverPausedAfterCrash();
            }
            if (S.Active)
            {
                if (TrackForeground) UpdateFocusFromForeground();
                Apply();
            }
            else
            {
                Tally();
            }
        }

        void Refresh()
        {
            if (!Scanner.Scan()) return;
            BuildGroups();
            if (Scanner.RatesUpdated) DetectHogs();
        }

        void BuildGroups()
        {
            groupStamp++;
            long now = NowMs();
            foreach (ProcInfo pi in Scanner.Procs.Values)
            {
                if (!IsUserProcess(pi)) continue;
                AppGroup g;
                if (!Groups.TryGetValue(pi.Key, out g))
                {
                    g = new AppGroup(pi.Key, pi.Name);
                    g.BackgroundSince = now;
                    g.Protected = IsProtectedName(pi.Key);
                    Groups.Add(pi.Key, g);
                }
                if (pi.Pid == OwnPid) g.Protected = true;
                if (g.Stamp != groupStamp)
                {
                    g.Stamp = groupStamp;
                    g.Count = 0;
                    g.CpuPct = 0;
                    g.IoRate = 0;
                    g.PrivateBytes = 0;
                }
                g.Count++;
                g.CpuPct += pi.CpuPct;
                g.IoRate += pi.IoRate;
                g.PrivateBytes += pi.PrivateBytes;
            }

            tmpKeys.Clear();
            foreach (AppGroup g in Groups.Values)
                if (g.Stamp != groupStamp) tmpKeys.Add(g.Key);
            for (int i = 0; i < tmpKeys.Count; i++) Groups.Remove(tmpKeys[i]);
        }

        void DetectHogs()
        {
            double ioLimit = S.IoThresholdMB > 0 ? S.IoThresholdMB * 1048576.0 : double.MaxValue;
            foreach (AppGroup g in Groups.Values)
            {
                if (g.Protected || g.Key == FocusKey || RuleOf(g.Key) != Rule.Auto)
                {
                    g.HotScans = 0;
                    continue;
                }
                bool hot = g.CpuPct >= S.CpuThreshold || g.IoRate >= ioLimit;
                if (hot)
                {
                    g.HotScans++;
                    if (g.HotScans >= 2) g.Hog = true; // zweimal hintereinander = kein kurzer Ausreißer
                }
                else
                {
                    g.HotScans = 0;
                }
            }
        }

        // ------------------------------------------------------------------ Aktive App

        /// <summary>Liest das Vordergrundfenster. Gibt true zurück, wenn sich die aktive App geändert hat.</summary>
        public bool UpdateFocusFromForeground()
        {
            if (!TrackForeground) return false;
            IntPtr hwnd = Native.GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return false;

            // Hängende (z. B. pausierte) Fenster ersetzt Windows durch ein "Geister"-Fenster.
            if (ghostSupported && ClassNameIs(hwnd, "Ghost"))
            {
                try
                {
                    IntPtr real = Native.HungWindowFromGhostWindow(hwnd);
                    if (real != IntPtr.Zero) hwnd = real;
                }
                catch (EntryPointNotFoundException) { ghostSupported = false; }
            }

            int pid;
            Native.GetWindowThreadProcessId(hwnd, out pid);
            if (pid == 0 || pid == OwnPid) return false;

            ProcInfo pi;
            if (!Scanner.Procs.TryGetValue(pid, out pi))
            {
                Refresh();
                if (!Scanner.Procs.TryGetValue(pid, out pi)) return false;
            }

            if (pi.Key == "applicationframehost.exe")
            {
                // Store-Apps: das eigentliche Programm steckt in einem Kindfenster.
                int child = FindForeignChildPid(hwnd, pid);
                if (child == 0 || !Scanner.Procs.TryGetValue(child, out pi)) return false;
            }

            // Taskleiste, Desktop, Startmenü usw. sind keine "App" – dann bleibt die letzte App aktiv.
            if (!IsUserProcess(pi) || IsProtectedName(pi.Key)) return false;
            return SetFocusKey(pi.Key);
        }

        public bool SetFocusKey(string key)
        {
            if (key == FocusKey) return false;
            AppGroup g;
            if (FocusKey != null && Groups.TryGetValue(FocusKey, out g)) g.BackgroundSince = NowMs();
            FocusKey = key;
            if (key != null && Groups.TryGetValue(key, out g))
            {
                g.ManualPause = false;
                g.Hog = false;
                g.HotScans = 0;
            }
            return true;
        }

        static bool ClassNameIs(IntPtr hwnd, string name)
        {
            StringBuilder sb = new StringBuilder(32);
            Native.GetClassName(hwnd, sb, sb.Capacity);
            return sb.ToString() == name;
        }

        static int FindForeignChildPid(IntPtr hwnd, int hostPid)
        {
            int found = 0;
            Native.EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr lp)
            {
                int cpid;
                Native.GetWindowThreadProcessId(child, out cpid);
                if (cpid != 0 && cpid != hostPid)
                {
                    found = cpid;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        /// <summary>Gehört der Prozess zur aktiven App (z. B. ein Compiler, den das Terminal gestartet hat)?</summary>
        bool IsDescendantOfFocus(ProcInfo pi)
        {
            if (FocusKey == null) return false;
            ProcInfo cur = pi;
            for (int depth = 0; depth < 16; depth++)
            {
                ProcInfo parent;
                if (cur.ParentPid <= 4 || !Scanner.Procs.TryGetValue(cur.ParentPid, out parent)) return false;
                if (parent.CreateTime > cur.CreateTime) return false; // PID wurde neu vergeben
                if (parent.Key == FocusKey) return true;
                cur = parent;
            }
            return false;
        }

        // ------------------------------------------------------------------ Entscheiden und umsetzen

        public void Apply()
        {
            if (shutDown || !S.Active) return;
            long now = NowMs();
            HashSet<int> visiblePids = null;

            foreach (ProcInfo pi in Scanner.Procs.Values)
            {
                if (!IsUserProcess(pi) || pi.Pid == OwnPid) continue;
                if (OnlyChildrenOf != 0 && pi.ParentPid != OnlyChildrenOf) continue;
                AppGroup g;
                if (!Groups.TryGetValue(pi.Key, out g)) continue;

                Target t = Decide(pi, g, now, ref visiblePids);
                bool trim = (t == Target.Paused && !pi.Suspended && S.TrimWhenPaused)
                         || (t == Target.Throttled && !pi.Throttled && S.TrimWhenThrottled);
                ApplyTarget(pi, t, trim);
            }

            RelieveMemoryPressure(now);
            if (pausedDirty) SavePausedList();
            Tally();
        }

        Target Decide(ProcInfo pi, AppGroup g, long now, ref HashSet<int> visiblePids)
        {
            if (g.Protected) return Target.Untouched;
            if (g.ManualPause) return Target.Paused; // ausdrücklicher Wunsch geht vor

            Rule rule = RuleOf(g.Key);
            if (rule == Rule.Ignorieren) return Target.Untouched;
            if (rule == Rule.Vorrang) return Target.High;

            bool focus = g.Key == FocusKey || IsDescendantOfFocus(pi);
            if (focus) return S.FocusBoost ? Target.Focus : Target.Untouched;

            if (rule == Rule.Pausieren)
            {
                if (pi.Suspended) return Target.Paused;
                if (now - g.BackgroundSince >= S.PauseAfterSeconds * 1000L)
                {
                    // Nur pausieren, wenn kein Fenster der App sichtbar ist (minimiert oder im Infobereich).
                    // So kann man nie auf ein eingefrorenes Fenster klicken.
                    if (visiblePids == null) visiblePids = CollectVisibleWindowPids();
                    if (!GroupHasVisibleWindow(g.Key, visiblePids)) return Target.Paused;
                }
                return Target.Throttled;
            }
            if (rule == Rule.Bremsen) return Target.Throttled;
            if (S.AutoThrottle && g.Hog) return Target.Throttled;
            return Target.Untouched;
        }

        static int Rank(uint cls)
        {
            switch (cls)
            {
                case Native.IDLE_PRIORITY_CLASS: return 1;
                case Native.BELOW_NORMAL_PRIORITY_CLASS: return 2;
                case Native.ABOVE_NORMAL_PRIORITY_CLASS: return 4;
                case Native.HIGH_PRIORITY_CLASS: return 5;
                case Native.REALTIME_PRIORITY_CLASS: return 6;
                default: return 3;
            }
        }

        static uint DesiredPriority(Target t, uint orig)
        {
            switch (t)
            {
                case Target.Focus:
                    return Rank(orig) >= Rank(Native.ABOVE_NORMAL_PRIORITY_CLASS) ? orig : Native.ABOVE_NORMAL_PRIORITY_CLASS;
                case Target.High:
                    return Rank(orig) >= Rank(Native.HIGH_PRIORITY_CLASS) ? orig : Native.HIGH_PRIORITY_CLASS;
                case Target.Throttled:
                case Target.Paused:
                    return Rank(orig) <= Rank(Native.BELOW_NORMAL_PRIORITY_CLASS) ? orig : Native.BELOW_NORMAL_PRIORITY_CLASS;
                default:
                    return orig;
            }
        }

        /// <summary>Bringt einen Prozess in den gewünschten Zustand. Tut nichts, wenn er schon passt.</summary>
        bool ApplyTarget(ProcInfo pi, Target t, bool trim)
        {
            bool wantThrottle = t == Target.Throttled || t == Target.Paused;
            bool wantSuspend = t == Target.Paused;
            pi.Boosted = t == Target.Focus;
            if (pi.NoAccess && t != Target.Untouched) return false;

            bool prioChange = t == Target.Untouched
                ? pi.SetPriority != 0
                : pi.SetPriority == 0 || pi.SetPriority != DesiredPriority(t, pi.OrigPriority);
            bool throttleChange = pi.Throttled != wantThrottle;
            bool suspendChange = pi.Suspended != wantSuspend;
            if (!prioChange && !throttleChange && !suspendChange && !trim) return true;

            uint access = Native.PROCESS_QUERY_LIMITED_INFORMATION;
            if (prioChange || throttleChange) access |= Native.PROCESS_SET_INFORMATION;
            if (suspendChange) access |= Native.PROCESS_SUSPEND_RESUME;
            if (trim) access |= Native.PROCESS_SET_QUOTA;

            IntPtr h = Native.OpenProcess(access, false, pi.Pid);
            if (h == IntPtr.Zero)
            {
                pi.NoAccess = true;
                if (t == Target.Untouched)
                {
                    // Zurücksetzen nicht möglich (Prozess beendet oder gesperrt) – nicht endlos neu versuchen.
                    pi.SetPriority = 0;
                    pi.Throttled = false;
                    if (pi.Suspended) { pi.Suspended = false; pausedDirty = true; }
                }
                return false;
            }
            try
            {
                if (suspendChange && !wantSuspend)
                {
                    Native.NtResumeProcess(h);
                    pi.Suspended = false;
                    pausedDirty = true;
                }

                if (prioChange)
                {
                    if (t == Target.Untouched)
                    {
                        Native.SetPriorityClass(h, pi.OrigPriority);
                        pi.SetPriority = 0;
                    }
                    else
                    {
                        if (pi.SetPriority == 0)
                        {
                            uint cur = Native.GetPriorityClass(h);
                            pi.OrigPriority = cur != 0 ? cur : Native.NORMAL_PRIORITY_CLASS;
                        }
                        uint want = DesiredPriority(t, pi.OrigPriority);
                        if (Native.SetPriorityClass(h, want)) pi.SetPriority = want;
                        else if (pi.SetPriority == 0) pi.NoAccess = true;
                    }
                }

                if (throttleChange)
                {
                    SetThrottle(h, wantThrottle);
                    pi.Throttled = wantThrottle;
                }

                if (suspendChange && wantSuspend)
                {
                    if (Native.NtSuspendProcess(h) >= 0)
                    {
                        pi.Suspended = true;
                        pausedDirty = true;
                    }
                    else
                    {
                        pi.NoAccess = true;
                    }
                }

                if (trim) Native.EmptyWorkingSet(h);
            }
            finally
            {
                Native.CloseHandle(h);
            }
            return true;
        }

        /// <summary>Bremsen = Effizienzmodus (EcoQoS) + niedrige Datenträger- und Speicherpriorität.</summary>
        void SetThrottle(IntPtr h, bool on)
        {
            if (ecoSupported && (S.EcoMode || !on))
            {
                try
                {
                    PROCESS_POWER_THROTTLING_STATE st = new PROCESS_POWER_THROTTLING_STATE();
                    st.Version = 1;
                    st.ControlMask = on ? Native.PROCESS_POWER_THROTTLING_EXECUTION_SPEED : 0;
                    st.StateMask = on ? Native.PROCESS_POWER_THROTTLING_EXECUTION_SPEED : 0;
                    Native.SetProcessInformation(h, Native.ProcessPowerThrottling, ref st, 12);
                }
                catch (EntryPointNotFoundException) { ecoSupported = false; }
            }

            int io = on ? 1 : 2; // 1 = niedrig, 2 = normal
            Native.NtSetInformationProcess(h, Native.ProcessIoPriority, ref io, 4);

            if (memPrioSupported)
            {
                try
                {
                    uint mem = on ? 2u : 5u; // 2 = niedrig (wird zuerst ausgelagert), 5 = normal
                    Native.SetProcessInformation(h, Native.ProcessMemoryPriority, ref mem, 4);
                }
                catch (EntryPointNotFoundException) { memPrioSupported = false; }
            }
        }

        // ------------------------------------------------------------------ Arbeitsspeicher

        void RelieveMemoryPressure(long now)
        {
            if (!S.AutoRam || Scanner.MemoryLoad < S.RamThreshold) return;
            if (now - lastRamRelief < 10000) return;
            lastRamRelief = now;

            // Die drei größten Hintergrund-Apps geben ungenutzten Speicher an Windows zurück.
            List<AppGroup> candidates = new List<AppGroup>();
            foreach (AppGroup g in Groups.Values)
            {
                if (g.Protected || g.Key == FocusKey) continue;
                Rule r = RuleOf(g.Key);
                if (r == Rule.Vorrang || r == Rule.Ignorieren) continue;
                if (g.PrivateBytes < 150L * 1024 * 1024) continue;
                if (g.LastTrim != 0 && now - g.LastTrim < 5 * 60 * 1000) continue;
                candidates.Add(g);
            }
            candidates.Sort(delegate(AppGroup a, AppGroup b) { return b.PrivateBytes.CompareTo(a.PrivateBytes); });
            for (int i = 0; i < candidates.Count && i < 3; i++)
            {
                TrimGroup(candidates[i], true);
                candidates[i].LastTrim = now;
            }
        }

        int TrimGroup(AppGroup g, bool skipFocusRelated)
        {
            int done = 0;
            foreach (ProcInfo pi in Scanner.Procs.Values)
            {
                if (pi.Key != g.Key || !IsUserProcess(pi) || pi.Pid == OwnPid) continue;
                if (OnlyChildrenOf != 0 && pi.ParentPid != OnlyChildrenOf) continue;
                if (skipFocusRelated && IsDescendantOfFocus(pi)) continue;
                IntPtr h = Native.OpenProcess(Native.PROCESS_SET_QUOTA | Native.PROCESS_QUERY_LIMITED_INFORMATION, false, pi.Pid);
                if (h == IntPtr.Zero) continue;
                if (Native.EmptyWorkingSet(h)) done++;
                Native.CloseHandle(h);
            }
            return done;
        }

        // ------------------------------------------------------------------ Fenster

        static HashSet<int> CollectVisibleWindowPids()
        {
            HashSet<int> pids = new HashSet<int>();
            Native.EnumWindows(delegate(IntPtr hwnd, IntPtr lp)
            {
                if (Native.IsWindowVisible(hwnd) && !Native.IsIconic(hwnd))
                {
                    int pid;
                    Native.GetWindowThreadProcessId(hwnd, out pid);
                    if (pid != 0 && pids.Add(pid))
                    {
                        // Store-Apps zeichnen in ein Fenster von ApplicationFrameHost.
                        Native.EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr lp2)
                        {
                            int cpid;
                            Native.GetWindowThreadProcessId(child, out cpid);
                            if (cpid != 0) pids.Add(cpid);
                            return true;
                        }, IntPtr.Zero);
                    }
                }
                return true;
            }, IntPtr.Zero);
            return pids;
        }

        bool GroupHasVisibleWindow(string key, HashSet<int> visiblePids)
        {
            foreach (int pid in visiblePids)
            {
                ProcInfo pi;
                if (Scanner.Procs.TryGetValue(pid, out pi) && pi.Key == key) return true;
            }
            return false;
        }

        // ------------------------------------------------------------------ Aktionen aus der Oberfläche

        public void SetRule(IEnumerable<string> keys, Rule rule)
        {
            foreach (string k in keys)
            {
                if (IsProtectedName(k)) continue;
                if (rule == Rule.Auto) S.Rules.Remove(k);
                else S.Rules[k] = rule;
                AppGroup g;
                if (Groups.TryGetValue(k, out g))
                {
                    g.Hog = false;
                    g.HotScans = 0;
                }
            }
            S.Save();
            Apply();
        }

        public void PauseNow(IEnumerable<string> keys)
        {
            if (!S.Active) return;
            foreach (string k in keys)
            {
                AppGroup g;
                if (!Groups.TryGetValue(k, out g) || g.Protected) continue;
                g.ManualPause = true;
                // Erst minimieren: Sonst holt Windows das Fenster nach vorn, sobald PrioPilot geschlossen wird,
                // und man klickt auf ein eingefrorenes Fenster. Ein Klick in der Taskleiste setzt die App fort.
                MinimizeWindowsOf(k);
                // Damit ein erneuter Klick auf die App als Wechsel erkannt wird und sie fortsetzt.
                if (FocusKey == k) FocusKey = null;
            }
            Apply();
        }

        void MinimizeWindowsOf(string key)
        {
            Native.EnumWindows(delegate(IntPtr hwnd, IntPtr lp)
            {
                if (!Native.IsWindowVisible(hwnd) || Native.IsIconic(hwnd)) return true;
                if (Native.GetWindow(hwnd, Native.GW_OWNER) != IntPtr.Zero) return true; // Dialoge folgen ihrem Hauptfenster
                int pid;
                Native.GetWindowThreadProcessId(hwnd, out pid);
                ProcInfo pi;
                if (pid != OwnPid && Scanner.Procs.TryGetValue(pid, out pi) && pi.Key == key)
                    Native.ShowWindow(hwnd, Native.SW_FORCEMINIMIZE);
                return true;
            }, IntPtr.Zero);
        }

        public void ResumeNow(IEnumerable<string> keys)
        {
            long now = NowMs();
            foreach (string k in keys)
            {
                AppGroup g;
                if (!Groups.TryGetValue(k, out g)) continue;
                g.ManualPause = false;
                g.BackgroundSince = now; // Regel "pausieren" wartet wieder von vorn
                foreach (ProcInfo pi in Scanner.Procs.Values)
                    if (pi.Key == k && pi.Suspended) ApplyTarget(pi, Target.Untouched, false);
            }
            Apply();
            if (pausedDirty) SavePausedList();
            Tally();
        }

        public int TrimNow(IEnumerable<string> keys)
        {
            int done = 0;
            long now = NowMs();
            foreach (string k in keys)
            {
                AppGroup g;
                if (!Groups.TryGetValue(k, out g) || g.Protected) continue;
                done += TrimGroup(g, false);
                g.LastTrim = now;
            }
            return done;
        }

        /// <summary>Alles fortsetzen, alle Prioritäten zurück, erkannte Fresser vergessen.</summary>
        public void ResetAll()
        {
            long now = NowMs();
            foreach (AppGroup g in Groups.Values)
            {
                g.ManualPause = false;
                g.Hog = false;
                g.HotScans = 0;
                g.BackgroundSince = now;
            }
            RestoreAll();
            Apply();
        }

        public void SetActive(bool on)
        {
            S.Active = on;
            S.Save();
            if (on)
            {
                if (TrackForeground) UpdateFocusFromForeground();
                Apply();
            }
            else
            {
                RestoreAll();
            }
        }

        public void OnSettingsChanged()
        {
            if (!S.AutoThrottle)
                foreach (AppGroup g in Groups.Values) { g.Hog = false; g.HotScans = 0; }
            Apply();
        }

        public void RestoreAll()
        {
            foreach (ProcInfo pi in Scanner.Procs.Values)
            {
                pi.Boosted = false;
                if (pi.IsModified) ApplyTarget(pi, Target.Untouched, false);
            }
            if (pausedDirty) SavePausedList();
            Tally();
        }

        /// <summary>Beim Beenden: alles so hinterlassen, wie es vorher war.</summary>
        public void Shutdown()
        {
            if (shutDown) return;
            try
            {
                RestoreAll();
                SavePausedList();
            }
            finally
            {
                shutDown = true;
                Scanner.Dispose();
            }
        }

        // ------------------------------------------------------------------ Anzeige

        public void Tally()
        {
            foreach (AppGroup g in Groups.Values)
                g.NumSuspended = g.NumThrottled = g.NumHigh = g.NumBoosted = g.NumNoAccess = 0;
            PausedProcs = 0;
            foreach (ProcInfo pi in Scanner.Procs.Values)
            {
                AppGroup g;
                if (!Groups.TryGetValue(pi.Key, out g)) continue;
                if (pi.Suspended) { g.NumSuspended++; PausedProcs++; }
                else if (pi.Throttled) g.NumThrottled++;
                else if (pi.SetPriority == Native.HIGH_PRIORITY_CLASS && RuleOf(g.Key) == Rule.Vorrang) g.NumHigh++;
                else if (pi.Boosted && !pi.NoAccess) g.NumBoosted++;
                if (pi.NoAccess) g.NumNoAccess++;
            }
            ThrottledApps = PausedApps = 0;
            foreach (AppGroup g in Groups.Values)
            {
                if (g.NumSuspended > 0) PausedApps++;
                else if (g.NumThrottled > 0) ThrottledApps++;
            }
        }

        public string StateText(AppGroup g)
        {
            if (g.Protected) return "";
            if (g.NumSuspended > 0) return g.ManualPause ? "Pausiert (von dir)" : "Pausiert";
            if (g.NumThrottled > 0) return g.Hog && RuleOf(g.Key) == Rule.Auto ? "Gebremst (hat viel verbraucht)" : "Gebremst";
            if (g.NumHigh > 0) return "Vorrang";
            if (g.NumNoAccess > 0 && g.NumNoAccess >= g.Count) return "Kein Zugriff – als Admin starten";
            if (g.Key == FocusKey && S.Active) return S.FocusBoost ? "Aktive App – bevorzugt" : "Aktive App";
            if (g.NumBoosted > 0) return "Bevorzugt (gehört zur aktiven App)";
            if (g.NumNoAccess > 0) return "Kein Zugriff – als Admin starten";
            return "";
        }

        // ------------------------------------------------------------------ Absturz-Schutz

        static string PausedFile
        {
            get { return Path.Combine(Settings.Dir, "pausiert.txt"); }
        }

        /// <summary>Merkt sich angehaltene Prozesse, damit sie nach einem Absturz beim nächsten Start fortgesetzt werden.</summary>
        void SavePausedList()
        {
            pausedDirty = false;
            try
            {
                StringBuilder sb = new StringBuilder();
                foreach (ProcInfo pi in Scanner.Procs.Values)
                    if (pi.Suspended) sb.Append(pi.Pid).Append(' ').Append(pi.CreateTime).AppendLine();
                if (sb.Length == 0)
                {
                    if (File.Exists(PausedFile)) File.Delete(PausedFile);
                }
                else
                {
                    Directory.CreateDirectory(Settings.Dir);
                    File.WriteAllText(PausedFile, sb.ToString());
                }
            }
            catch (Exception) { }
        }

        void RecoverPausedAfterCrash()
        {
            try
            {
                if (!File.Exists(PausedFile)) return;
                foreach (string line in File.ReadAllLines(PausedFile))
                {
                    string[] parts = line.Split(' ');
                    int pid;
                    long created;
                    if (parts.Length < 2 || !int.TryParse(parts[0], out pid) || !long.TryParse(parts[1], out created)) continue;
                    ProcInfo pi;
                    if (!Scanner.Procs.TryGetValue(pid, out pi) || pi.CreateTime != created || !IsUserProcess(pi)) continue;
                    IntPtr h = Native.OpenProcess(Native.PROCESS_SUSPEND_RESUME, false, pid);
                    if (h == IntPtr.Zero) continue;
                    Native.NtResumeProcess(h);
                    Native.CloseHandle(h);
                }
                File.Delete(PausedFile);
            }
            catch (Exception) { }
        }
    }
}
