using Microsoft.Win32;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace EKilitBoard.Services;

/// <summary>
/// Windows startup ve otomatik başlatma servisi
/// Programın Windows ile birlikte otomatik başlamasını sağlar
/// </summary>
public class StartupService
{
    private const string APP_NAME = "EKilitBoard";
    private const string APP_PATH = @"C:\Program Files\E-Kilit\EKilitBoard.exe";

    [DllImport("user32.dll")]
    private static extern bool ExitWindowsEx(uint uFlags, uint dwReason);

    private const uint EWX_REBOOT = 0x00000002;
    private const uint EWX_FORCE = 0x00000004;

    /// <summary>
    /// Programı Windows startup'a ekler
    /// </summary>
    public static void EnableStartup()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true);
            if (key != null)
            {
                // Mevcut exe path'ini al
                var currentPath = Process.GetCurrentProcess().MainModule?.FileName ?? APP_PATH;
                key.SetValue(APP_NAME, $"\"{currentPath}\"");
                System.Diagnostics.Debug.WriteLine($"Startup enabled: {currentPath}");
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Enable startup error: {ex.Message}");
        }
    }

    /// <summary>
    /// Programı Windows startup'tan kaldırır
    /// </summary>
    public static void DisableStartup()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true);
            if (key != null)
            {
                key.DeleteValue(APP_NAME, false);
                System.Diagnostics.Debug.WriteLine("Startup disabled");
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Disable startup error: {ex.Message}");
        }
    }

    /// <summary>
    /// Programın startup'da olup olmadığını kontrol eder
    /// </summary>
    public static bool IsStartupEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", false);
            if (key != null)
            {
                var value = key.GetValue(APP_NAME);
                return value != null;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Check startup error: {ex.Message}");
        }
        return false;
    }

    /// <summary>
    /// Windows Task Scheduler ile kilitli başlatma görevi oluşturur
    /// </summary>
    public static void CreateStartupTask()
    {
        try
        {
            var currentPath = Process.GetCurrentProcess().MainModule?.FileName ?? APP_PATH;
            
            // Task Scheduler komutu oluştur
            var taskCommand = $@"schtasks /create /f /tn ""{APP_NAME}"" /tr """"{currentPath}"" --kiosk"" /sc onlogon /ru ""%USERNAME%"" /rl highest";
            
            var processInfo = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c {taskCommand}",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var process = Process.Start(processInfo);
            process?.WaitForExit();

            var output = process?.StandardOutput.ReadToEnd();
            var error = process?.StandardError.ReadToEnd();

            System.Diagnostics.Debug.WriteLine($"Task creation output: {output}");
            if (!string.IsNullOrEmpty(error))
            {
                System.Diagnostics.Debug.WriteLine($"Task creation error: {error}");
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Create startup task error: {ex.Message}");
        }
    }

    /// <summary>
    /// Windows Task Scheduler görevini siler
    /// </summary>
    public static void DeleteStartupTask()
    {
        try
        {
            var taskCommand = $@"schtasks /delete /f /tn ""{APP_NAME}""";
            
            var processInfo = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c {taskCommand}",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var process = Process.Start(processInfo);
            process?.WaitForExit();

            System.Diagnostics.Debug.WriteLine("Startup task deleted");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Delete startup task error: {ex.Message}");
        }
    }

    /// <summary>
    /// Sistemi yeniden başlatır
    /// </summary>
    public static void RebootSystem()
    {
        try
        {
            System.Diagnostics.Debug.WriteLine("System reboot initiated");
            ExitWindowsEx(EWX_REBOOT | EWX_FORCE, 0);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Reboot error: {ex.Message}");
            // Alternatif yöntem
            try
            {
                Process.Start("shutdown", "/r /t 0");
            }
            catch (Exception altEx)
            {
                System.Diagnostics.Debug.WriteLine($"Alternative reboot error: {altEx.Message}");
            }
        }
    }

    /// <summary>
    /// Programın kurulu olup olmadığını kontrol eder
    /// </summary>
    public static bool IsInstalled()
    {
        try
        {
            var currentPath = Process.GetCurrentProcess().MainModule?.FileName;
            return !string.IsNullOrEmpty(currentPath) && System.IO.File.Exists(currentPath);
        }
        catch
        {
            return false;
        }
    }
}
