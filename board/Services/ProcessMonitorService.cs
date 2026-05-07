using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace EKilitBoard.Services;

/// <summary>
/// Process monitoring service - taskkill, cmd, powershell engelleme
/// </summary>
public class ProcessMonitorService : IDisposable
{
    private readonly System.Windows.Forms.Timer _monitorTimer;
    private bool _isRunning = false;

    public ProcessMonitorService()
    {
        _monitorTimer = new System.Windows.Forms.Timer();
        _monitorTimer.Tick += MonitorProcesses;
    }

    public void Start()
    {
        if (_isRunning) return;
        _isRunning = true;
        
        // Her 500ms'de bir process'leri kontrol et
        _monitorTimer.Interval = 500;
        _monitorTimer.Start();
        
        // Başlangıçta mevcut tehlikeli process'leri sonlandır
        KillDangerousProcesses();
    }

    public void Stop()
    {
        _isRunning = false;
        _monitorTimer.Stop();
    }

    private void MonitorProcesses(object? sender, EventArgs e)
    {
        if (!_isRunning) return;

        try
        {
            var dangerousProcesses = new[] { 
                "taskmgr", "cmd", "powershell", "regedit", 
                "gpedit", "services.msc", "compmgmt.msc",
                "taskkill", "wmic", "net"
            };

            foreach (var proc in Process.GetProcesses())
            {
                try
                {
                    var processName = proc.ProcessName.ToLower();
                    
                    if (dangerousProcesses.Any(dangerous => processName.Contains(dangerous)))
                    {
                        // Kendi process'imizi değil, diğerlerini sonlandır
                        if (proc.Id != Process.GetCurrentProcess().Id)
                        {
                            proc.Kill();
                            System.Diagnostics.Debug.WriteLine($"Dangerous process killed: {processName}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Process monitoring error: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Process monitor error: {ex.Message}");
        }
    }

    private void KillDangerousProcesses()
    {
        try
        {
            var dangerousProcesses = new[] { "taskmgr", "cmd", "powershell", "regedit" };
            
            foreach (var procName in dangerousProcesses)
            {
                var processes = Process.GetProcessesByName(procName);
                foreach (var proc in processes)
                {
                    if (proc.Id != Process.GetCurrentProcess().Id)
                    {
                        proc.Kill();
                        System.Diagnostics.Debug.WriteLine($"Initial dangerous process killed: {procName}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Kill dangerous processes error: {ex.Message}");
        }
    }

    public void Dispose()
    {
        Stop();
        _monitorTimer?.Dispose();
    }
}
