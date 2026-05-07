using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using System.Diagnostics;

namespace EKilitBoard.Services;

/// <summary>
/// Kilit ekranı kiosk modu — keyboard hook, tam ekran kilitleme.
/// </summary>
public class KioskService : IDisposable
{
    // Low-level keyboard hook
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;

    private IntPtr _hookId = IntPtr.Zero;
    private LowLevelKeyboardProc? _hookProc;
    private bool _isLocked = true;
    private Process? _currentProcess;
    private readonly object _lockObject = new object();

    public bool IsLocked => _isLocked;

    [DllImport("user32.dll")]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    /// <summary>
    /// Klavye kısayollarını engelleme — Alt+Tab, Alt+F4, Win tuşu, Ctrl+Esc vs.
    /// </summary>
    public void EnableKeyboardLock()
    {
        lock (_lockObject)
        {
            _isLocked = true;
            if (_hookId != IntPtr.Zero) return; // Zaten aktif

            _hookProc = HookCallback;
            using var process = System.Diagnostics.Process.GetCurrentProcess();
            using var module = process.MainModule!;
            _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _hookProc, GetModuleHandle(module.ModuleName!), 0);

            // Process protection aktif et
            EnableProcessProtection();
            
            // Registry güvenlik önlemleri
            ApplyRegistrySecurity();
        }
    }

    public void DisableKeyboardLock()
    {
        lock (_lockObject)
        {
            _isLocked = false;
            if (_hookId != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_hookId);
                _hookId = IntPtr.Zero;
            }

            // Process protection kapat
            DisableProcessProtection();
            
            // Registry ayarlarını geri al
            RestoreRegistrySettings();
        }
    }

    /// <summary>
    /// Process koruması - taskkill ve process termination engelle
    /// </summary>
    private void EnableProcessProtection()
    {
        try
        {
            _currentProcess = Process.GetCurrentProcess();
            _currentProcess.EnableRaisingEvents = true;
            _currentProcess.Exited += OnProcessExit;
            
            // Process'i korumaya al
            SetProcessSecurity();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Process protection error: {ex.Message}");
        }
    }

    private void DisableProcessProtection()
    {
        try
        {
            if (_currentProcess != null)
            {
                _currentProcess.Exited -= OnProcessExit;
                _currentProcess = null;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Process protection disable error: {ex.Message}");
        }
    }

    private void OnProcessExit(object? sender, EventArgs e)
    {
        // Process kapatılmaya çalışılıyorsa sistemi yeniden başlat
        System.Diagnostics.Process.Start("shutdown", "/r /t 0");
    }

    /// <summary>
    /// Process seviyesinde güvenlik ayarları
    /// </summary>
    private void SetProcessSecurity()
    {
        try
        {
            // Task Manager ve diğer sistem araçlarını engellemek için registry ayarları
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Policies\System", true);
            key?.SetValue("DisableTaskMgr", 1, RegistryValueKind.DWord);
            key?.SetValue("DisableCMD", 1, RegistryValueKind.DWord);
            key?.SetValue("DisableRegistryTools", 1, RegistryValueKind.DWord);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Registry security error: {ex.Message}");
        }
    }

    /// <summary>
    /// Registry güvenlik ayarları
    /// </summary>
    private void ApplyRegistrySecurity()
    {
        try
        {
            // Command Prompt engelle
            using var cmdKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", true);
            cmdKey?.SetValue("DisallowRun", 1, RegistryValueKind.DWord);

            using var disallowRunKey = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\DisallowRun");
            disallowRunKey?.SetValue("1", "cmd.exe", RegistryValueKind.String);
            disallowRunKey?.SetValue("2", "powershell.exe", RegistryValueKind.String);
            disallowRunKey?.SetValue("3", "taskmgr.exe", RegistryValueKind.String);

            // Ctrl+Alt+Delete seçeneklerini kısıtla
            using var systemKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Policies\System", true);
            systemKey?.SetValue("DisableChangePassword", 1, RegistryValueKind.DWord);
            systemKey?.SetValue("DisableLockWorkstation", 1, RegistryValueKind.DWord);
            systemKey?.SetValue("DisableTaskMgr", 1, RegistryValueKind.DWord);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Apply registry security error: {ex.Message}");
        }
    }

    public void RestoreRegistrySettings()
    {
        try
        {
            // Registry ayarlarını temizle
            Registry.CurrentUser.DeleteSubKey(@"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\DisallowRun", false);
            Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", false);
            Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Policies\System", false);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Restore registry error: {ex.Message}");
        }
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (!_isLocked)
            return CallNextHookEx(_hookId, nCode, wParam, lParam);

        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
        {
            int vkCode = Marshal.ReadInt32(lParam);

            // Windows tuşlarını engelle
            if (vkCode == 0x5B || vkCode == 0x5C) // LWin, RWin
                return (IntPtr)1;

            // Alt+Tab, Alt+F4, Alt+Esc engelle
            bool altPressed = (Control.ModifierKeys & Keys.Alt) != 0;
            if (altPressed && (vkCode == 0x09 || vkCode == 0x73 || vkCode == 0x1B)) // Tab, F4, Esc
                return (IntPtr)1;

            // Ctrl+Esc, Ctrl+Shift+Esc engelle
            bool ctrlPressed = (Control.ModifierKeys & Keys.Control) != 0;
            if (ctrlPressed && vkCode == 0x1B) // Esc
                return (IntPtr)1;

            // Ctrl+Shift+M → Master Key girişi — bunu engelleme!
            bool shiftPressed = (Control.ModifierKeys & Keys.Shift) != 0;
            if (ctrlPressed && shiftPressed && vkCode == 0x4D) // M
                return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }

        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    /// <summary>
    /// Ekran görüntüsü yakala — tüm monitörleri kapsar.
    /// </summary>
    public static byte[] CaptureScreen()
    {
        var bounds = Screen.PrimaryScreen!.Bounds;
        using var bitmap = new Bitmap(bounds.Width, bounds.Height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);

        using var ms = new MemoryStream();
        // JPEG olarak sıkıştır (kalite 60 ile ~100KB)
        var encoder = ImageCodecInfo.GetImageEncoders().First(e => e.MimeType == "image/jpeg");
        var encoderParams = new EncoderParameters(1);
        encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 60L);
        bitmap.Save(ms, encoder, encoderParams);
        return ms.ToArray();
    }

    public void Dispose()
    {
        lock (_lockObject)
        {
            DisableKeyboardLock();
            RestoreRegistrySettings();
        }
    }
}
