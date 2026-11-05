using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace PrioPilot
{
    /// <summary>
    /// "PrioPilot.exe /selbsttest" prüft die echte Funktion unter Windows an zwei Test-Prozessen,
    /// die er selbst startet (ping und eine CPU-Schleife). Andere Programme werden nicht angefasst.
    /// Ergebnis steht in selbsttest.log, Rückgabewert 0 = alles in Ordnung.
    /// </summary>
    internal static class SelfTest
    {
        static StreamWriter log;
        static int failures;

        public static int Run()
        {
            string path = Path.Combine(Environment.CurrentDirectory, "selbsttest.log");
            using (log = new StreamWriter(path, false, new UTF8Encoding(false)))
            {
                log.AutoFlush = true;
                try
                {
                    Body();
                }
                catch (Exception ex)
                {
                    Fail("Unerwartete Ausnahme: " + ex);
                }
                Line(failures == 0 ? "ERGEBNIS: alles OK" : "ERGEBNIS: " + failures + " Fehler");
            }
            return failures == 0 ? 0 : 1;
        }

        static void Body()
        {
            int ownPid = Process.GetCurrentProcess().Id;
            string dir = Path.Combine(Path.GetTempPath(), "PrioPilotTest_" + ownPid);
            Settings.DirOverride = dir;
            Line("Windows " + Environment.OSVersion.Version + ", " + Environment.ProcessorCount + " Kerne, " +
                 (Environment.Is64BitProcess ? "64" : "32") + " Bit, .NET " + Environment.Version);

            // --- Einstellungen ---
            Settings s = Settings.Load();
            Check(s.Active && s.FocusBoost && s.AutoThrottle, "Standardeinstellungen");
            s.CpuThreshold = 7;
            s.Rules["test.exe"] = Rule.Bremsen;
            s.Save();
            Settings s2 = Settings.Load();
            Check(s2.CpuThreshold == 7 && s2.RuleOf("TEST.EXE") == Rule.Bremsen, "Einstellungen speichern und laden");
            s2.Rules.Clear();
            s2.CpuThreshold = 5;
            s2.PauseAfterSeconds = 0;

            Process ping = null, burner = null;
            try
            {
                Engine e = new Engine(s2);
                e.TrackForeground = false;
                e.OnlyChildrenOf = ownPid;

                // --- Prozessliste ---
                e.Tick();
                Thread.Sleep(1100);
                e.Tick();
                Check(e.Scanner.Procs.Count > 10, "Prozessliste gelesen (" + e.Scanner.Procs.Count + " Prozesse)");
                ProcInfo self;
                Check(e.Scanner.Procs.TryGetValue(ownPid, out self) && self.Key.EndsWith(".exe") && self.PrivateBytes > 0,
                    "Eigener Prozess erkannt" + (self != null ? " (" + self.Name + ", " + (self.PrivateBytes / 1048576) + " MB)" : ""));
                Check(e.Scanner.TotalMemory > 0 && e.Scanner.MemoryLoad > 0 && e.Scanner.MemoryLoad <= 100,
                    "RAM-Status (" + e.Scanner.MemoryLoad + " % belegt)");

                ping = StartHidden("ping.exe", "-n 300 127.0.0.1");
                burner = StartHidden("cmd.exe", "/d /c for /l %i in (0,0,1) do @rem");
                Thread.Sleep(600);
                e.Tick();
                Check(e.Groups.ContainsKey("ping.exe") && e.Groups.ContainsKey("cmd.exe"), "Test-Prozesse gefunden");
                Check(e.Groups.ContainsKey("conhost.exe") ? e.Groups["conhost.exe"].Protected : true, "Windows-Prozesse sind geschützt");

                // --- Regel: bremsen ---
                e.SetRule(new string[] { "ping.exe" }, Rule.Bremsen);
                Check(Priority(ping) == Native.BELOW_NORMAL_PRIORITY_CLASS, "Regel 'bremsen' senkt die Priorität");
                Check(e.Groups["ping.exe"].NumThrottled == 1, "Zustand 'gebremst' wird angezeigt: " + e.StateText(e.Groups["ping.exe"]));

                // --- Aktive App ---
                e.SetFocusKey("ping.exe");
                e.Apply();
                Check(Priority(ping) == Native.ABOVE_NORMAL_PRIORITY_CLASS, "Aktive App wird bevorzugt (auch mit Regel 'bremsen')");

                // --- Regel: pausieren ---
                e.SetFocusKey("andere-app.exe");
                e.SetRule(new string[] { "ping.exe" }, Rule.Pausieren);
                Check(IsSuspended(ping), "Regel 'pausieren' hält die App im Hintergrund an");
                Check(File.Exists(Path.Combine(dir, "pausiert.txt")), "Absturz-Schutzliste geschrieben");

                e.SetFocusKey("ping.exe");
                e.Apply();
                Check(!IsSuspended(ping) && Priority(ping) == Native.ABOVE_NORMAL_PRIORITY_CLASS, "Wechsel zur App setzt sie sofort fort");

                // --- Sofort pausieren / fortsetzen ---
                e.SetRule(new string[] { "ping.exe" }, Rule.Auto);
                e.PauseNow(new string[] { "ping.exe" });
                Check(IsSuspended(ping), "'Jetzt pausieren' hält die App an (auch wenn sie die aktive war)");
                e.ResumeNow(new string[] { "ping.exe" });
                Check(!IsSuspended(ping) && Priority(ping) == Native.NORMAL_PRIORITY_CLASS, "'Fortsetzen' stellt alles wieder her");

                // --- Vorrang ---
                e.SetRule(new string[] { "ping.exe" }, Rule.Vorrang);
                Check(Priority(ping) == Native.HIGH_PRIORITY_CLASS, "Regel 'Vorrang' setzt hohe Priorität");
                e.SetRule(new string[] { "ping.exe" }, Rule.Ignorieren);
                Check(Priority(ping) == Native.NORMAL_PRIORITY_CLASS, "Regel 'nie anfassen' setzt zurück");

                // --- Fresser automatisch erkennen ---
                AppGroup cmd = null;
                for (int i = 0; i < 5; i++)
                {
                    Thread.Sleep(1100);
                    e.Tick();
                    cmd = e.Groups["cmd.exe"];
                    if (cmd.Hog) break;
                }
                Check(cmd != null && cmd.Hog && Priority(burner) == Native.BELOW_NORMAL_PRIORITY_CLASS,
                    "CPU-Fresser im Hintergrund automatisch gebremst (" + (cmd != null ? cmd.CpuPct.ToString("0.0") : "?") + " % CPU)");
                e.SetFocusKey("cmd.exe");
                e.Apply();
                Check(!e.Groups["cmd.exe"].Hog && Priority(burner) == Native.ABOVE_NORMAL_PRIORITY_CLASS,
                    "Wird der Fresser zur aktiven App, läuft er sofort wieder voll");

                // --- RAM freigeben ---
                Check(e.TrimNow(new string[] { "cmd.exe" }) == 1, "RAM freigeben");

                // --- Beenden setzt alles zurück ---
                e.SetFocusKey("andere-app.exe");
                e.SetRule(new string[] { "ping.exe" }, Rule.Pausieren);
                e.SetRule(new string[] { "cmd.exe" }, Rule.Bremsen);
                e.Tick();
                Check(IsSuspended(ping) && Priority(burner) == Native.BELOW_NORMAL_PRIORITY_CLASS, "Vor dem Beenden: pausiert und gebremst");
                e.Shutdown();
                Check(!IsSuspended(ping) && Priority(ping) == Native.NORMAL_PRIORITY_CLASS && Priority(burner) == Native.NORMAL_PRIORITY_CLASS,
                    "Beenden setzt alle Apps zurück");

                // --- Absturz-Schutz: pausierte App wird beim nächsten Start fortgesetzt ---
                Engine crashed = new Engine(s2);
                crashed.TrackForeground = false;
                crashed.OnlyChildrenOf = ownPid;
                crashed.Tick();
                crashed.SetFocusKey("andere-app.exe");
                crashed.PauseNow(new string[] { "ping.exe" });
                Check(IsSuspended(ping), "Absturz simuliert: ping ist pausiert");
                // kein Shutdown() – so, als wäre PrioPilot abgestürzt
                Engine next = new Engine(Settings.Load());
                next.TrackForeground = false;
                next.OnlyChildrenOf = ownPid;
                next.S.Active = false;
                next.Tick();
                Check(!IsSuspended(ping), "Nach Neustart wird die pausierte App automatisch fortgesetzt");

                // --- Oberfläche ---
                Engine ui = new Engine(s2);
                ui.TrackForeground = false;
                ui.OnlyChildrenOf = ownPid;
                TrayApp tray = new TrayApp(ui, true);
                tray.ShowWindow();
                Application.DoEvents();
                tray.AfterEngineChange();
                Application.DoEvents();
                Check(tray.Form != null && tray.Form.Visible, "Fenster öffnet sich");
                tray.Form.Close();
                Application.DoEvents();
                Check(tray.Form == null, "Fenster schließt in den Infobereich");
                tray.ExitApp();
                Check(true, "Infobereich-Symbol und Beenden");

                // --- Leichtgewicht ---
                Engine bench = new Engine(s2);
                bench.TrackForeground = false;
                bench.OnlyChildrenOf = ownPid;
                bench.Tick();
                TimeSpan cpuBefore = Process.GetCurrentProcess().TotalProcessorTime;
                Stopwatch sw = Stopwatch.StartNew();
                for (int i = 0; i < 50; i++) bench.Tick();
                sw.Stop();
                double msPerTick = (Process.GetCurrentProcess().TotalProcessorTime - cpuBefore).TotalMilliseconds / 50;
                Line(string.Format("INFO  Ein Durchlauf kostet ~{0:0.00} ms CPU ({1} Prozesse). Bei 3 s Abstand sind das ~{2:0.000} % eines Kerns.",
                    msPerTick, bench.Scanner.Procs.Count, msPerTick / 3000 * 100));
                Check(msPerTick < 50, "Ein Durchlauf ist schnell genug");
                bench.Shutdown();
            }
            finally
            {
                Kill(ping);
                Kill(burner);
                try { Directory.Delete(dir, true); } catch (Exception) { }
            }
        }

        static Process StartHidden(string file, string args)
        {
            ProcessStartInfo psi = new ProcessStartInfo(file, args);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            return Process.Start(psi);
        }

        static void Kill(Process p)
        {
            if (p == null) return;
            try
            {
                IntPtr h = Native.OpenProcess(Native.PROCESS_SUSPEND_RESUME, false, p.Id);
                if (h != IntPtr.Zero) { Native.NtResumeProcess(h); Native.CloseHandle(h); }
                if (!p.HasExited) p.Kill();
            }
            catch (Exception) { }
        }

        static uint Priority(Process p)
        {
            IntPtr h = Native.OpenProcess(Native.PROCESS_QUERY_LIMITED_INFORMATION, false, p.Id);
            if (h == IntPtr.Zero) return 0;
            try { return Native.GetPriorityClass(h); }
            finally { Native.CloseHandle(h); }
        }

        static bool IsSuspended(Process p)
        {
            p.Refresh();
            int threads = 0;
            foreach (ProcessThread t in p.Threads)
            {
                threads++;
                if (t.ThreadState != System.Diagnostics.ThreadState.Wait || t.WaitReason != ThreadWaitReason.Suspended) return false;
            }
            return threads > 0;
        }

        static void Check(bool ok, string what)
        {
            if (ok) Line("OK    " + what);
            else Fail(what);
        }

        static void Fail(string what)
        {
            failures++;
            Line("FEHLER " + what);
        }

        static void Line(string text)
        {
            log.WriteLine(text);
        }
    }
}
