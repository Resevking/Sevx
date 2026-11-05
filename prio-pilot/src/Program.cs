using System;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("PrioPilot")]
[assembly: AssemblyDescription("Gibt der App, mit der du arbeitest, Vorrang und bremst unnötige Hintergrund-Apps.")]
[assembly: AssemblyProduct("PrioPilot")]
[assembly: AssemblyCopyright("Frei verwendbar")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace PrioPilot
{
    internal static class Program
    {
        static Engine engine;

        [STAThread]
        static int Main(string[] args)
        {
            bool startHidden = false, successor = false, selfTest = false;
            foreach (string a in args)
            {
                string arg = a.Trim().ToLowerInvariant();
                if (arg == "/tray") startHidden = true;
                else if (arg == "/nachfolger") successor = true;
                else if (arg == "/selbsttest") selfTest = true;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (selfTest)
            {
                // Fehler sollen den Test scheitern lassen, nicht ein Dialogfenster öffnen.
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
                return SelfTest.Run();
            }

            // Nur eine Instanz. Eine zweite holt nur das Fenster der ersten nach vorn.
            Mutex mutex = null;
            bool owned = false;
            try
            {
                mutex = new Mutex(false, @"Local\PrioPilot.Einzelinstanz");
                try
                {
                    // Beim Neustart als Admin wartet die neue Instanz, bis die alte beendet ist.
                    owned = mutex.WaitOne(successor ? 15000 : 0, false);
                }
                catch (AbandonedMutexException)
                {
                    owned = true;
                }
            }
            catch (UnauthorizedAccessException)
            {
                owned = false; // läuft bereits als Admin
            }
            if (!owned)
            {
                TrayApp.SignalOtherInstance();
                return 0;
            }

            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { Crash(e.Exception); };
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
            {
                SafeShutdown();
            };

            try
            {
                Settings.RepairAutostartPath();
                engine = new Engine(Settings.Load());
                Application.Run(new TrayApp(engine, startHidden));
            }
            finally
            {
                SafeShutdown();
                try { mutex.ReleaseMutex(); } catch (Exception) { }
            }
            return 0;
        }

        /// <summary>Was auch passiert: angehaltene Apps fortsetzen und Prioritäten zurücksetzen.</summary>
        static void SafeShutdown()
        {
            try
            {
                if (engine != null) engine.Shutdown();
            }
            catch (Exception) { }
        }

        static void Crash(Exception ex)
        {
            SafeShutdown();
            MessageBox.Show("PrioPilot hat einen Fehler und wird beendet. Alle Apps wurden zurückgesetzt.\n\n" + ex.Message,
                "PrioPilot", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Environment.Exit(1);
        }
    }
}
