using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace PrioPilot
{
    /// <summary>
    /// Läuft unsichtbar im Infobereich. Das Fenster wird nur bei Bedarf erzeugt und beim Schließen
    /// komplett freigegeben, damit PrioPilot im Hintergrund fast nichts belegt.
    /// </summary>
    internal sealed class TrayApp : ApplicationContext
    {
        readonly Engine engine;
        readonly NotifyIcon tray;
        readonly ContextMenuStrip menu;
        readonly ToolStripMenuItem miActive;
        readonly Timer scanTimer = new Timer();
        readonly Timer focusTimer = new Timer();
        readonly Timer pollTimer = new Timer();
        readonly Icon iconOn, iconOff;
        public readonly Icon AppIcon;
        readonly Native.WinEventProc hookProc;
        readonly MessageWindow messages;
        IntPtr hook;
        MainForm form;
        bool balloonShown, exiting;
        string lastTip;

        public TrayApp(Engine engine, bool startHidden)
        {
            this.engine = engine;
            iconOn = Icons.Create(true);
            iconOff = Icons.Create(false);
            try { AppIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch (Exception) { AppIcon = null; }
            if (AppIcon == null) AppIcon = iconOn;

            menu = new ContextMenuStrip();
            ToolStripMenuItem miOpen = new ToolStripMenuItem("Öffnen", null, delegate { ShowWindow(); });
            miOpen.Font = new Font(miOpen.Font, FontStyle.Bold);
            menu.Items.Add(miOpen);
            miActive = new ToolStripMenuItem("Aktiv", null, delegate { SetActive(!engine.S.Active); });
            menu.Items.Add(miActive);
            menu.Items.Add(new ToolStripMenuItem("Alles fortsetzen und zurücksetzen", null, delegate { ResetAll(); }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Beenden", null, delegate { ExitApp(); }));
            menu.Opening += delegate { miActive.Checked = engine.S.Active; };

            tray = new NotifyIcon();
            tray.ContextMenuStrip = menu;
            tray.Icon = engine.S.Active ? iconOn : iconOff;
            tray.Text = "PrioPilot";
            tray.MouseClick += delegate(object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) ShowWindow(); };
            tray.Visible = true;

            scanTimer.Tick += delegate { OnScan(); };
            focusTimer.Interval = 120;   // mehrere schnelle Wechsel (Alt+Tab) zusammenfassen
            focusTimer.Tick += delegate { focusTimer.Stop(); OnFocusMaybeChanged(); };
            pollTimer.Interval = 500;    // nur aktiv, solange etwas pausiert ist
            pollTimer.Tick += delegate { OnFocusMaybeChanged(); };

            hookProc = OnWinEvent; // Referenz halten, sonst räumt der GC den Rückruf weg
            messages = new MessageWindow(this);

            engine.Tick();
            UpdateTimers();
            UpdateTray();
            if (startHidden) TrimSelf();
            else ShowWindow();
        }

        public MainForm Form
        {
            get { return form; }
        }

        // ------------------------------------------------------------------ Ereignisse

        void OnScan()
        {
            engine.Tick();
            AfterEngineChange();
        }

        void OnWinEvent(IntPtr h, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
        {
            if (!engine.S.Active) return;
            focusTimer.Stop();
            focusTimer.Start();
        }

        void OnFocusMaybeChanged()
        {
            if (!engine.S.Active) return;
            if (engine.UpdateFocusFromForeground())
            {
                engine.Apply();
                AfterEngineChange();
            }
        }

        /// <summary>Nach jeder Änderung: Fenster, Symbol und Zeitgeber auf Stand bringen.</summary>
        public void AfterEngineChange()
        {
            if (exiting) return;
            if (form != null) form.RefreshView();
            UpdateTray();
            pollTimer.Enabled = engine.S.Active && engine.PausedProcs > 0;
        }

        void UpdateTimers()
        {
            bool active = engine.S.Active;
            if (active && hook == IntPtr.Zero)
            {
                hook = Native.SetWinEventHook(Native.EVENT_SYSTEM_FOREGROUND, Native.EVENT_SYSTEM_FOREGROUND, IntPtr.Zero,
                    hookProc, 0, 0, Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS);
            }
            else if (!active && hook != IntPtr.Zero)
            {
                Native.UnhookWinEvent(hook);
                hook = IntPtr.Zero;
            }
            scanTimer.Interval = form != null ? 2000 : Math.Max(1, engine.S.IntervalSeconds) * 1000;
            scanTimer.Enabled = active || form != null; // inaktiv und ohne Fenster: komplett still
            pollTimer.Enabled = active && engine.PausedProcs > 0;
        }

        void UpdateTray()
        {
            Icon icon = engine.S.Active ? iconOn : iconOff;
            if (tray.Icon != icon) tray.Icon = icon;

            string tip;
            if (!engine.S.Active) tip = "PrioPilot – ausgeschaltet";
            else
            {
                tip = "PrioPilot – aktiv";
                if (engine.FocusKey != null) tip += "\nAktiv: " + engine.FocusKey;
                if (engine.ThrottledApps > 0 || engine.PausedApps > 0)
                    tip += "\n" + engine.ThrottledApps + " gebremst, " + engine.PausedApps + " pausiert";
            }
            if (tip.Length > 63) tip = tip.Substring(0, 63);
            if (tip != lastTip)
            {
                tray.Text = tip;
                lastTip = tip;
            }
        }

        // ------------------------------------------------------------------ Befehle

        public void ShowWindow()
        {
            if (exiting) return;
            if (form == null)
            {
                form = new MainForm(engine, this);
                form.FormClosed += OnFormClosed;
                form.Show();
            }
            else
            {
                if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Normal;
                form.Show();
            }
            form.Activate();
            UpdateTimers();
        }

        void OnFormClosed(object sender, FormClosedEventArgs e)
        {
            form = null;
            if (exiting) return;
            UpdateTimers();
            if (!balloonShown)
            {
                balloonShown = true;
                tray.ShowBalloonTip(4000, "PrioPilot läuft weiter",
                    "PrioPilot arbeitet im Infobereich weiter. Klick auf das Symbol öffnet das Fenster, Rechtsklick zeigt das Menü.",
                    ToolTipIcon.Info);
            }
            TrimSelf();
        }

        public void SetActive(bool on)
        {
            engine.SetActive(on);
            UpdateTimers();
            AfterEngineChange();
            if (form != null) form.SyncOptions();
        }

        public void ResetAll()
        {
            engine.ResetAll();
            AfterEngineChange();
        }

        public void RestartAsAdmin()
        {
            ProcessStartInfo psi = new ProcessStartInfo(Application.ExecutablePath, "/nachfolger");
            psi.UseShellExecute = true;
            psi.Verb = "runas";
            try
            {
                Process.Start(psi);
            }
            catch (Win32Exception)
            {
                return; // Benutzer hat die Nachfrage abgelehnt
            }
            ExitApp();
        }

        public void ExitApp()
        {
            if (exiting) return;
            exiting = true;
            scanTimer.Stop();
            focusTimer.Stop();
            pollTimer.Stop();
            if (hook != IntPtr.Zero)
            {
                Native.UnhookWinEvent(hook);
                hook = IntPtr.Zero;
            }
            engine.Shutdown();
            if (form != null) form.Close();
            tray.Visible = false;
            tray.Dispose();
            messages.DestroyHandle();
            ExitThread();
        }

        /// <summary>Gibt eigenen, gerade ungenutzten Arbeitsspeicher an Windows zurück.</summary>
        static void TrimSelf()
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            Native.SetProcessWorkingSetSize(Native.GetCurrentProcess(), new IntPtr(-1), new IntPtr(-1));
        }

        /// <summary>Empfängt "Fenster zeigen" von einer zweiten PrioPilot-Instanz.</summary>
        sealed class MessageWindow : NativeWindow
        {
            public static readonly int ShowMessage = Native.RegisterWindowMessage("PrioPilot.FensterZeigen");
            readonly TrayApp app;

            public MessageWindow(TrayApp app)
            {
                this.app = app;
                CreateParams cp = new CreateParams();
                cp.Caption = "PrioPilot.Nachrichten";
                CreateHandle(cp);
                try { Native.ChangeWindowMessageFilterEx(Handle, ShowMessage, 1, IntPtr.Zero); }
                catch (EntryPointNotFoundException) { }
            }

            protected override void WndProc(ref Message m)
            {
                if (m.Msg == ShowMessage && ShowMessage != 0)
                {
                    app.ShowWindow();
                    return;
                }
                base.WndProc(ref m);
            }
        }

        public static void SignalOtherInstance()
        {
            Native.AllowSetForegroundWindow(-1);
            Native.PostMessage(Native.HWND_BROADCAST, MessageWindow.ShowMessage, IntPtr.Zero, IntPtr.Zero);
        }
    }

    /// <summary>Zeichnet das Symbol zur Laufzeit – keine Bilddateien nötig.</summary>
    internal static class Icons
    {
        public static Icon Create(bool active)
        {
            int size = Math.Max(16, SystemInformation.SmallIconSize.Width);
            using (Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    Color bg = active ? Color.FromArgb(0, 140, 105) : Color.FromArgb(120, 120, 120);
                    using (SolidBrush b = new SolidBrush(bg))
                        g.FillEllipse(b, 0.5f, 0.5f, size - 1.5f, size - 1.5f);
                    float s = size;
                    // Pfeil nach oben = "Vorrang"
                    PointF[] arrow =
                    {
                        new PointF(s * 0.50f, s * 0.17f),
                        new PointF(s * 0.80f, s * 0.50f),
                        new PointF(s * 0.20f, s * 0.50f)
                    };
                    g.FillPolygon(Brushes.White, arrow);
                    g.FillRectangle(Brushes.White, s * 0.39f, s * 0.48f, s * 0.22f, s * 0.33f);
                }
                IntPtr h = bmp.GetHicon();
                try
                {
                    using (Icon tmp = Icon.FromHandle(h))
                        return (Icon)tmp.Clone();
                }
                finally
                {
                    Native.DestroyIcon(h);
                }
            }
        }
    }
}
