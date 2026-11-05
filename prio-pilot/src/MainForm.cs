using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace PrioPilot
{
    /// <summary>Übersicht aller Apps mit Knöpfen für Regeln und Sofort-Aktionen.</summary>
    internal sealed class MainForm : Form
    {
        static readonly Color GreenBack = Color.FromArgb(222, 244, 226);
        static readonly Color BlueBack = Color.FromArgb(220, 233, 252);
        static readonly Color OrangeBack = Color.FromArgb(255, 236, 214);
        static readonly Color GrayBack = Color.FromArgb(232, 232, 232);

        readonly Engine engine;
        readonly TrayApp app;
        readonly ListView list;
        readonly Label status;
        readonly CheckBox cbActive, cbFocus, cbThrottle, cbRam, cbAutostart;
        readonly NumericUpDown numCpu, numRam;
        readonly ToolTip tips = new ToolTip();
        readonly List<Control> needSelection = new List<Control>();
        readonly List<Control> needActive = new List<Control>();
        readonly Dictionary<string, ListViewItem> items = new Dictionary<string, ListViewItem>();
        readonly List<string> tmpKeys = new List<string>();
        readonly ItemComparer comparer = new ItemComparer();
        readonly float scale = 1f;
        bool syncing;

        public MainForm(Engine engine, TrayApp app)
        {
            this.engine = engine;
            this.app = app;

            // Größen werden selbst an die Bildschirmskalierung angepasst (Px), Schrift skaliert Windows.
            SuspendLayout();
            AutoScaleMode = AutoScaleMode.None;
            Font = SystemFonts.MessageBoxFont;
            Text = "PrioPilot – Vorrang für das, was du gerade machst";
            using (Graphics g = CreateGraphics()) scale = Math.Max(1f, g.DpiX / 96f);
            ClientSize = new Size(Px(900), Px(580));
            MinimumSize = new Size(Px(660), Px(420));
            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;
            if (app != null) Icon = app.AppIcon;
            tips.AutoPopDelay = 15000;

            // ---- Liste ----
            list = new DoubleBufferedListView();
            list.Dock = DockStyle.Fill;
            list.View = View.Details;
            list.FullRowSelect = true;
            list.HideSelection = false;
            list.MultiSelect = true;
            list.Columns.Add("App", Px(200));
            list.Columns.Add("Prozesse", Px(70), HorizontalAlignment.Right);
            list.Columns.Add("CPU %", Px(70), HorizontalAlignment.Right);
            list.Columns.Add("RAM (MB)", Px(85), HorizontalAlignment.Right);
            list.Columns.Add("Datenträger (MB/s)", Px(120), HorizontalAlignment.Right);
            list.Columns.Add("Regel", Px(170));
            list.Columns.Add("Zustand", Px(220));
            list.ListViewItemSorter = comparer;
            list.ColumnClick += OnColumnClick;
            list.SelectedIndexChanged += delegate { UpdateEnabled(); };
            list.ContextMenuStrip = BuildListMenu();
            Controls.Add(list);

            // ---- Hinweis ----
            Label hint = new Label();
            hint.Dock = DockStyle.Top;
            hint.AutoSize = false;
            hint.Height = Px(24);
            hint.Padding = new Padding(Px(8), 0, Px(8), 0);
            hint.TextAlign = ContentAlignment.MiddleLeft;
            hint.ForeColor = SystemColors.GrayText;
            hint.Text = "App(s) auswählen und unten eine Regel wählen (Rechtsklick geht auch).  Grün = aktive App · Blau = Vorrang · Orange = gebremst · Grau = pausiert";
            Controls.Add(hint);

            // ---- Optionen ----
            FlowLayoutPanel opts = new FlowLayoutPanel();
            opts.Dock = DockStyle.Top;
            opts.AutoSize = true;
            opts.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            opts.Padding = new Padding(Px(6), Px(6), Px(6), 0);
            cbActive = AddCheck(opts, "PrioPilot aktiv",
                "Aus = PrioPilot greift nirgends ein und setzt sofort alles zurück.");
            cbActive.Font = new Font(Font, FontStyle.Bold);
            cbFocus = AddCheck(opts, "Aktive App bevorzugen",
                "Die App im Vordergrund (und was sie gestartet hat) bekommt mehr Rechenzeit.");
            cbThrottle = AddCheck(opts, "Hintergrund-Fresser bremsen ab",
                "Apps im Hintergrund, die mehrere Sekunden lang viel CPU oder Datenträger brauchen, werden gebremst:\n" +
                "niedrigere Priorität, Windows-Effizienzmodus, niedrige Datenträger- und Speicherpriorität.\n" +
                "Sobald du die App wieder benutzt, läuft sie sofort wieder normal.");
            numCpu = AddNumber(opts, 1, 100, "% CPU", cbThrottle.Text);
            cbRam = AddCheck(opts, "RAM freigeben ab",
                "Wenn der Arbeitsspeicher knapp wird, geben die größten Hintergrund-Apps ungenutzten Speicher an Windows zurück.\n" +
                "Die aktive App bekommt dadurch Platz. Die Hintergrund-App lädt bei Bedarf einfach nach.");
            numRam = AddNumber(opts, 30, 99, "% belegt", cbRam.Text);
            cbAutostart = AddCheck(opts, "Mit Windows starten",
                "Startet PrioPilot unsichtbar im Infobereich, wenn du dich anmeldest.");
            Controls.Add(opts);

            // ---- Knöpfe ----
            FlowLayoutPanel bar = new FlowLayoutPanel();
            bar.Dock = DockStyle.Bottom;
            bar.AutoSize = true;
            bar.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            bar.Padding = new Padding(Px(6), Px(4), Px(6), Px(2));
            AddLabel(bar, "Regel:");
            needSelection.Add(AddButton(bar, "Immer Vorrang",
                "Die App bekommt immer hohe Priorität und wird nie gebremst (z. B. Spiel, Videoschnitt, Musikprogramm).",
                delegate { DoRule(Rule.Vorrang); }));
            needSelection.Add(AddButton(bar, "Im Hintergrund bremsen",
                "Sobald du nicht mit der App arbeitest, wird sie gebremst. Benutzt du sie, läuft sie normal.",
                delegate { DoRule(Rule.Bremsen); }));
            needSelection.Add(AddButton(bar, "Im Hintergrund pausieren",
                "Ist die App minimiert oder nur im Infobereich, wird sie nach " + engine.S.PauseAfterSeconds +
                " Sekunden angehalten (0 % CPU).\nKlick auf die App in der Taskleiste setzt sie sofort fort.\n" +
                "Nicht für Apps, die im Hintergrund etwas tun sollen (Musik, Downloads, Chat-Benachrichtigungen).",
                delegate { DoRule(Rule.Pausieren); }));
            needSelection.Add(AddButton(bar, "Nie anfassen",
                "PrioPilot lässt die App komplett in Ruhe (z. B. wenn Musik im Hintergrund ruckelt).",
                delegate { DoRule(Rule.Ignorieren); }));
            needSelection.Add(AddButton(bar, "Automatisch",
                "Regel entfernen – PrioPilot entscheidet selbst.",
                delegate { DoRule(Rule.Auto); }));
            AddLabel(bar, "   Sofort:");
            Button bPause = AddButton(bar, "Pausieren",
                "Minimiert die App und hält sie an, bis du sie in der Taskleiste anklickst oder hier \"Fortsetzen\" drückst.",
                delegate { DoPause(); });
            needSelection.Add(bPause);
            needActive.Add(bPause);
            needSelection.Add(AddButton(bar, "Fortsetzen", "Hebt eine Pause sofort auf.", delegate { DoResume(); }));
            needSelection.Add(AddButton(bar, "RAM freigeben",
                "Gibt ungenutzten Arbeitsspeicher der App an Windows zurück.", delegate { DoTrim(); }));
            needActive.Add(AddButton(bar, "Alles zurücksetzen",
                "Alle Pausen aufheben, alle Prioritäten zurück auf normal. Deine Regeln bleiben erhalten.",
                delegate { if (app != null) app.ResetAll(); else { engine.ResetAll(); RefreshView(); } }));
            if (!engine.IsAdmin)
            {
                AddButton(bar, "Als Admin neu starten",
                    "Nur nötig für Apps, die selbst als Administrator laufen (Zustand \"Kein Zugriff\").",
                    delegate { if (app != null) app.RestartAsAdmin(); });
            }
            AddButton(bar, "Beenden", "PrioPilot beenden. Alles wird vorher zurückgesetzt.",
                delegate { if (app != null) app.ExitApp(); else Close(); });

            // ---- Statuszeile ----
            status = new Label();
            status.Dock = DockStyle.Bottom;
            status.AutoSize = false;
            status.Height = Px(26);
            status.AutoEllipsis = true;
            status.TextAlign = ContentAlignment.MiddleLeft;
            status.Padding = new Padding(Px(8), 0, Px(8), 0);
            status.BackColor = SystemColors.Control;
            Controls.Add(bar);
            Controls.Add(status);

            ResumeLayout(false);
            PerformLayout();

            SyncOptions();
            RefreshView();
        }

        int Px(int px)
        {
            return (int)Math.Round(px * scale);
        }

        // ------------------------------------------------------------------ Aufbau

        CheckBox AddCheck(FlowLayoutPanel panel, string text, string tip)
        {
            CheckBox cb = new CheckBox();
            cb.Text = text;
            cb.AutoSize = true;
            cb.Anchor = AnchorStyles.Left;
            cb.Margin = new Padding(Px(3), Px(4), Px(2), Px(4));
            cb.CheckedChanged += OnOptionChanged;
            tips.SetToolTip(cb, tip);
            panel.Controls.Add(cb);
            return cb;
        }

        NumericUpDown AddNumber(FlowLayoutPanel panel, int min, int max, string unit, string tipFrom)
        {
            NumericUpDown n = new NumericUpDown();
            n.Minimum = min;
            n.Maximum = max;
            n.Width = Px(52);
            n.Anchor = AnchorStyles.Left;
            n.Margin = new Padding(0, Px(2), Px(2), Px(2));
            n.ValueChanged += OnOptionChanged;
            panel.Controls.Add(n);
            Label l = new Label();
            l.Text = unit;
            l.AutoSize = true;
            l.Anchor = AnchorStyles.Left;
            l.Margin = new Padding(0, Px(4), Px(14), Px(4));
            panel.Controls.Add(l);
            return n;
        }

        void AddLabel(FlowLayoutPanel panel, string text)
        {
            Label l = new Label();
            l.Text = text;
            l.AutoSize = true;
            l.Anchor = AnchorStyles.Left;
            l.Margin = new Padding(Px(2), Px(6), Px(2), Px(4));
            panel.Controls.Add(l);
        }

        Button AddButton(FlowLayoutPanel panel, string text, string tip, EventHandler click)
        {
            Button b = new Button();
            b.Text = text;
            b.AutoSize = true;
            b.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            b.Padding = new Padding(Px(4), Px(1), Px(4), Px(1));
            b.Margin = new Padding(Px(2));
            b.UseVisualStyleBackColor = true;
            b.Click += click;
            tips.SetToolTip(b, tip);
            panel.Controls.Add(b);
            return b;
        }

        ContextMenuStrip BuildListMenu()
        {
            ContextMenuStrip m = new ContextMenuStrip();
            m.Items.Add("Immer Vorrang", null, delegate { DoRule(Rule.Vorrang); });
            m.Items.Add("Im Hintergrund bremsen", null, delegate { DoRule(Rule.Bremsen); });
            m.Items.Add("Im Hintergrund pausieren", null, delegate { DoRule(Rule.Pausieren); });
            m.Items.Add("Nie anfassen", null, delegate { DoRule(Rule.Ignorieren); });
            m.Items.Add("Automatisch (Regel entfernen)", null, delegate { DoRule(Rule.Auto); });
            m.Items.Add(new ToolStripSeparator());
            ToolStripItem pause = m.Items.Add("Jetzt pausieren", null, delegate { DoPause(); });
            m.Items.Add("Fortsetzen", null, delegate { DoResume(); });
            m.Items.Add("RAM freigeben", null, delegate { DoTrim(); });
            m.Opening += delegate(object s, System.ComponentModel.CancelEventArgs e)
            {
                bool any = SelectedKeys().Count > 0;
                foreach (ToolStripItem it in m.Items) it.Enabled = any;
                pause.Enabled = any && engine.S.Active;
                if (!any) e.Cancel = true;
            };
            return m;
        }

        // ------------------------------------------------------------------ Optionen

        public void SyncOptions()
        {
            syncing = true;
            cbActive.Checked = engine.S.Active;
            cbFocus.Checked = engine.S.FocusBoost;
            cbThrottle.Checked = engine.S.AutoThrottle;
            numCpu.Value = Math.Max(numCpu.Minimum, Math.Min(numCpu.Maximum, engine.S.CpuThreshold));
            cbRam.Checked = engine.S.AutoRam;
            numRam.Value = Math.Max(numRam.Minimum, Math.Min(numRam.Maximum, engine.S.RamThreshold));
            cbAutostart.Checked = Settings.AutostartEnabled;
            syncing = false;
            UpdateEnabled();
        }

        void OnOptionChanged(object sender, EventArgs e)
        {
            if (syncing) return;
            if (sender == cbAutostart)
            {
                if (!Settings.SetAutostart(cbAutostart.Checked))
                {
                    syncing = true;
                    cbAutostart.Checked = Settings.AutostartEnabled;
                    syncing = false;
                }
                return;
            }
            if (sender == cbActive)
            {
                if (app != null) app.SetActive(cbActive.Checked);
                else engine.SetActive(cbActive.Checked);
                UpdateEnabled();
                RefreshView();
                return;
            }
            engine.S.FocusBoost = cbFocus.Checked;
            engine.S.AutoThrottle = cbThrottle.Checked;
            engine.S.CpuThreshold = (int)numCpu.Value;
            engine.S.AutoRam = cbRam.Checked;
            engine.S.RamThreshold = (int)numRam.Value;
            engine.S.Save();
            engine.OnSettingsChanged();
            UpdateEnabled();
            AfterAction();
        }

        void UpdateEnabled()
        {
            bool active = engine.S.Active;
            bool sel = SelectedKeys().Count > 0;
            cbFocus.Enabled = cbThrottle.Enabled = cbRam.Enabled = active;
            numCpu.Enabled = active && cbThrottle.Checked;
            numRam.Enabled = active && cbRam.Checked;
            foreach (Control c in needSelection) c.Enabled = sel;
            foreach (Control c in needActive) c.Enabled = active && (sel || !needSelection.Contains(c));
        }

        // ------------------------------------------------------------------ Aktionen

        List<string> SelectedKeys()
        {
            List<string> keys = new List<string>();
            foreach (ListViewItem it in list.SelectedItems)
            {
                AppGroup g = (AppGroup)it.Tag;
                if (!g.Protected) keys.Add(g.Key);
            }
            return keys;
        }

        void DoRule(Rule r)
        {
            List<string> keys = SelectedKeys();
            if (keys.Count == 0) return;
            engine.SetRule(keys, r);
            AfterAction();
        }

        void DoPause()
        {
            List<string> keys = SelectedKeys();
            if (keys.Count == 0 || !engine.S.Active) return;
            engine.PauseNow(keys);
            AfterAction();
        }

        void DoResume()
        {
            List<string> keys = SelectedKeys();
            if (keys.Count == 0) return;
            engine.ResumeNow(keys);
            AfterAction();
        }

        void DoTrim()
        {
            List<string> keys = SelectedKeys();
            if (keys.Count == 0) return;
            long before = 0;
            foreach (string k in keys)
            {
                AppGroup g;
                if (engine.Groups.TryGetValue(k, out g)) before += g.PrivateBytes;
            }
            engine.TrimNow(keys);
            status.Text = "RAM freigegeben für " + string.Join(", ", keys.ToArray()) +
                          " (vorher " + (before / 1048576).ToString("N0") + " MB). Die Anzeige aktualisiert sich gleich.";
        }

        void AfterAction()
        {
            if (app != null) app.AfterEngineChange();
            else RefreshView();
        }

        // ------------------------------------------------------------------ Anzeige

        public void RefreshView()
        {
            if (IsDisposed) return;
            bool hovering = list.ClientRectangle.Contains(list.PointToClient(Cursor.Position));
            bool added = false;

            list.BeginUpdate();
            try
            {
                foreach (AppGroup g in engine.Groups.Values)
                {
                    ListViewItem it;
                    if (!items.TryGetValue(g.Key, out it))
                    {
                        it = new ListViewItem(new string[] { g.Name, "", "", "", "", "", "" });
                        it.Tag = g; // vor dem Einfügen setzen: die Liste sortiert schon beim Hinzufügen
                        UpdateItem(it, g);
                        items.Add(g.Key, it);
                        list.Items.Add(it);
                        added = true;
                    }
                    else
                    {
                        it.Tag = g;
                        UpdateItem(it, g);
                    }
                }

                tmpKeys.Clear();
                foreach (KeyValuePair<string, ListViewItem> kv in items)
                {
                    AppGroup g;
                    if (!engine.Groups.TryGetValue(kv.Key, out g) || g != kv.Value.Tag) tmpKeys.Add(kv.Key);
                }
                foreach (string k in tmpKeys)
                {
                    list.Items.Remove(items[k]);
                    items.Remove(k);
                }

                // Nicht umsortieren, während die Maus über der Liste ist – sonst springt die Zeile beim Klicken weg.
                if (!hovering || added) list.Sort();
            }
            finally
            {
                list.EndUpdate();
            }

            status.Text = BuildStatus();
            UpdateEnabled();
        }

        void UpdateItem(ListViewItem it, AppGroup g)
        {
            Rule rule = engine.RuleOf(g.Key);
            SetText(it, 1, g.Count.ToString());
            SetText(it, 2, g.CpuPct < 0.05 ? "0" : g.CpuPct.ToString("0.0"));
            SetText(it, 3, (g.PrivateBytes / 1048576.0).ToString("N0"));
            SetText(it, 4, g.IoRate < 0.05 * 1048576 ? "0" : (g.IoRate / 1048576.0).ToString("0.0"));
            SetText(it, 5, g.Protected ? "Geschützt (Windows)" : Settings.RuleLabel(rule));
            string state = engine.StateText(g);
            SetText(it, 6, state);

            Color back = SystemColors.Window, fore = SystemColors.WindowText;
            if (g.Protected) fore = SystemColors.GrayText;
            else if (g.NumSuspended > 0) { back = GrayBack; fore = SystemColors.GrayText; }
            else if (g.NumThrottled > 0) back = OrangeBack;
            else if (g.NumHigh > 0) back = BlueBack;
            else if (state.StartsWith("Aktive App") || g.NumBoosted > 0) back = GreenBack;
            if (it.BackColor != back) it.BackColor = back;
            if (it.ForeColor != fore) it.ForeColor = fore;
        }

        static void SetText(ListViewItem it, int col, string text)
        {
            if (it.SubItems[col].Text != text) it.SubItems[col].Text = text;
        }

        string BuildStatus()
        {
            ProcessScanner sc = engine.Scanner;
            double usedGb = (sc.TotalMemory - sc.AvailableMemory) / 1073741824.0;
            double totalGb = sc.TotalMemory / 1073741824.0;
            string own = "";
            ProcInfo self;
            if (engine.Scanner.Procs.TryGetValue(engine.OwnPid, out self))
                own = string.Format("   ·   PrioPilot selbst: {0:0.0} % CPU, {1:N1} MB", self.CpuPct, self.PrivateBytes / 1048576.0);
            string focus = engine.S.Active ? (engine.FocusKey ?? "–") : "PrioPilot ist aus";
            return string.Format("Aktive App: {0}   ·   CPU gesamt: {1:0} %   ·   RAM: {2} % ({3:0.0} von {4:0.0} GB)   ·   {5} gebremst, {6} pausiert{7}",
                focus, sc.TotalCpuPct, sc.MemoryLoad, usedGb, totalGb, engine.ThrottledApps, engine.PausedApps, own);
        }

        void OnColumnClick(object sender, ColumnClickEventArgs e)
        {
            if (comparer.Column == e.Column) comparer.Descending = !comparer.Descending;
            else
            {
                comparer.Column = e.Column;
                comparer.Descending = e.Column >= 1 && e.Column <= 4; // Zahlen: größte zuerst
            }
            list.Sort();
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.Escape)
            {
                Close();
                return true;
            }
            if (keyData == (Keys.Control | Keys.A))
            {
                list.BeginUpdate();
                foreach (ListViewItem it in list.Items) it.Selected = true;
                list.EndUpdate();
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) tips.Dispose();
            base.Dispose(disposing);
        }

        // ------------------------------------------------------------------ Hilfsklassen

        sealed class ItemComparer : IComparer
        {
            public int Column = 2;
            public bool Descending = true;

            public int Compare(object x, object y)
            {
                ListViewItem ix = (ListViewItem)x, iy = (ListViewItem)y;
                AppGroup a = ix.Tag as AppGroup, b = iy.Tag as AppGroup;
                if (a == null || b == null) return (a == null ? 0 : 1) - (b == null ? 0 : 1);
                int c;
                switch (Column)
                {
                    case 1: c = a.Count.CompareTo(b.Count); break;
                    case 2: c = a.CpuPct.CompareTo(b.CpuPct); break;
                    case 3: c = a.PrivateBytes.CompareTo(b.PrivateBytes); break;
                    case 4: c = a.IoRate.CompareTo(b.IoRate); break;
                    case 5:
                    case 6: c = string.Compare(ix.SubItems[Column].Text, iy.SubItems[Column].Text, StringComparison.CurrentCultureIgnoreCase); break;
                    default: c = string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase); break;
                }
                if (c == 0) return string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
                return Descending ? -c : c;
            }
        }

        sealed class DoubleBufferedListView : ListView
        {
            public DoubleBufferedListView()
            {
                DoubleBuffered = true;
            }
        }
    }
}
