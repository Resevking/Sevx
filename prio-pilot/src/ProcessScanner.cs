using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace PrioPilot
{
    /// <summary>Ein laufender Prozess und was PrioPilot an ihm verändert hat.</summary>
    internal sealed class ProcInfo
    {
        public int Pid;
        public int ParentPid;
        public long CreateTime;
        public string Name;          // z. B. "chrome.exe"
        public string Key;           // klein geschrieben, für Regeln und Gruppen
        public uint SessionId;
        public long CpuTime;         // 100-ns-Einheiten (User + Kernel)
        public long IoBytes;         // gelesen + geschrieben, gesamt
        public long PrivateBytes;    // privater Arbeitsspeicher (wie im Task-Manager)
        public double CpuPct;        // Anteil an der gesamten CPU, 0..100
        public double IoRate;        // Bytes pro Sekunde
        public int Seen;

        // Von PrioPilot gesetzter Zustand (zum sauberen Zurücksetzen)
        public uint OrigPriority;    // Priorität vor dem ersten Eingriff
        public uint SetPriority;     // von uns gesetzte Priorität, 0 = unverändert
        public bool Throttled;       // Effizienzmodus + niedrige E/A- und Speicherpriorität
        public bool Suspended;       // angehalten
        public bool NoAccess;        // Windows verweigert den Zugriff (z. B. Admin-Prozess)
        public bool Boosted;         // zuletzt als "aktive App" behandelt

        public bool IsModified
        {
            get { return SetPriority != 0 || Throttled || Suspended; }
        }
    }

    /// <summary>
    /// Liest alle Prozesse mit EINEM Systemaufruf (NtQuerySystemInformation), wie der Task-Manager.
    /// Es werden keine Handles geöffnet und der Puffer wird wiederverwendet – das hält PrioPilot leicht.
    /// </summary>
    internal sealed unsafe class ProcessScanner : IDisposable
    {
        public readonly Dictionary<int, ProcInfo> Procs = new Dictionary<int, ProcInfo>();
        public bool RatesUpdated;   // true, wenn CPU/E-A-Werte in diesem Durchlauf neu berechnet wurden
        public double TotalCpuPct;
        public uint MemoryLoad;
        public ulong TotalMemory;
        public ulong AvailableMemory;

        IntPtr buffer;
        int bufferSize = 512 * 1024;
        int scanId;
        long lastTimestamp;
        long lastIdle, lastKernel, lastUser;
        readonly int cpuCount = Math.Max(1, Environment.ProcessorCount);
        readonly List<int> dead = new List<int>();

        public bool Scan()
        {
            int needed;
            while (true)
            {
                if (buffer == IntPtr.Zero) buffer = Marshal.AllocHGlobal(bufferSize);
                int status = Native.NtQuerySystemInformation(Native.SystemProcessInformation, buffer, bufferSize, out needed);
                if (status == Native.STATUS_INFO_LENGTH_MISMATCH)
                {
                    Marshal.FreeHGlobal(buffer);
                    buffer = IntPtr.Zero;
                    bufferSize = Math.Max(bufferSize * 2, needed + 64 * 1024);
                    if (bufferSize > 64 * 1024 * 1024) return false;
                    continue;
                }
                if (status < 0) return false;
                break;
            }

            long now = Stopwatch.GetTimestamp();
            double elapsed100ns = lastTimestamp == 0 ? 0 : (now - lastTimestamp) * 1e7 / Stopwatch.Frequency;
            // Kurze Abstände (z. B. direkt nach einem App-Wechsel) liefern unruhige Werte – dann nur die Liste auffrischen.
            RatesUpdated = elapsed100ns >= 1e7;
            if (RatesUpdated || lastTimestamp == 0) lastTimestamp = now;
            scanId++;

            byte* p = (byte*)buffer;
            while (true)
            {
                SYSTEM_PROCESS_INFORMATION* spi = (SYSTEM_PROCESS_INFORMATION*)p;
                int pid = (int)spi->UniqueProcessId.ToInt64();
                long cpu = spi->UserTime + spi->KernelTime;
                long io = spi->ReadTransferCount + spi->WriteTransferCount;

                ProcInfo pi;
                if (!Procs.TryGetValue(pid, out pi) || pi.CreateTime != spi->CreateTime)
                {
                    pi = new ProcInfo();
                    pi.Pid = pid;
                    pi.CreateTime = spi->CreateTime;
                    if (spi->ImageNameBuffer != IntPtr.Zero && spi->ImageNameLength > 0)
                        pi.Name = new string((char*)spi->ImageNameBuffer, 0, spi->ImageNameLength / 2);
                    else
                        pi.Name = pid == 0 ? "Leerlauf" : "System";
                    pi.Key = pi.Name.ToLowerInvariant();
                    pi.CpuTime = cpu;
                    pi.IoBytes = io;
                    Procs[pid] = pi;
                }
                else if (RatesUpdated)
                {
                    pi.CpuPct = Math.Max(0, (cpu - pi.CpuTime) * 100.0 / (elapsed100ns * cpuCount));
                    pi.IoRate = Math.Max(0, (io - pi.IoBytes) * 1e7 / elapsed100ns);
                    pi.CpuTime = cpu;
                    pi.IoBytes = io;
                }

                pi.ParentPid = (int)spi->InheritedFromUniqueProcessId.ToInt64();
                pi.SessionId = spi->SessionId;
                pi.PrivateBytes = spi->WorkingSetPrivateSize;
                pi.Seen = scanId;

                if (spi->NextEntryOffset == 0) break;
                p += spi->NextEntryOffset;
            }

            dead.Clear();
            foreach (KeyValuePair<int, ProcInfo> kv in Procs)
                if (kv.Value.Seen != scanId) dead.Add(kv.Key);
            for (int i = 0; i < dead.Count; i++) Procs.Remove(dead[i]);

            UpdateSystemTotals();
            return true;
        }

        void UpdateSystemTotals()
        {
            long idle, kernel, user;
            if (Native.GetSystemTimes(out idle, out kernel, out user))
            {
                long dIdle = idle - lastIdle, dKernel = kernel - lastKernel, dUser = user - lastUser;
                long total = dKernel + dUser; // Kernel-Zeit enthält die Leerlaufzeit
                if (lastKernel != 0 && total > 0)
                    TotalCpuPct = Math.Max(0, Math.Min(100, (total - dIdle) * 100.0 / total));
                lastIdle = idle; lastKernel = kernel; lastUser = user;
            }

            MEMORYSTATUSEX m = new MEMORYSTATUSEX();
            m.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
            if (Native.GlobalMemoryStatusEx(ref m))
            {
                MemoryLoad = m.dwMemoryLoad;
                TotalMemory = m.ullTotalPhys;
                AvailableMemory = m.ullAvailPhys;
            }
        }

        public void Dispose()
        {
            if (buffer != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(buffer);
                buffer = IntPtr.Zero;
            }
        }
    }
}
