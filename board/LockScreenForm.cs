using System.Diagnostics;
using System.Reflection;
using System.Text;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using EKilitBoard.Models;
using EKilitBoard.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EKilitBoard;

public partial class LockScreenForm : Form
{
    // ===== Servisler =====
    private readonly ConfigService _config;
    private readonly ApiService _api;
    private readonly UsbWatcherService _usbWatcher;
    private readonly KioskService _kiosk;
    private readonly BoardSocketService _socketService;
    private readonly ProcessMonitorService _processMonitor;

    // ===== UI =====
    private WebView2? _webView;
    private bool _isLocked = true;
    private bool _isDev = false;
    private bool _webViewReady = false;

    // ===== Zamanlayıcılar =====
    private System.Windows.Forms.Timer? _heartbeatTimer;
    private System.Windows.Forms.Timer? _screenshotTimer;
    private System.Windows.Forms.Timer? _qrRefreshTimer;
    private System.Windows.Forms.Timer? _autoLockTimer;

    // ===== Log =====
    private static readonly string LogPath = @"C:\ekilit_debug.txt";
    private static void Log(string m)
    {
        try { File.AppendAllText(LogPath, $"[{DateTime.Now:HH:mm:ss.fff}] {m}\r\n"); } catch { }
    }

    // ========== CONSTRUCTOR ==========
    public LockScreenForm()
    {
        try
        {
            Log("=== E-Kilit Başlatılıyor ===");
            _config = new ConfigService();
            _api = new ApiService(_config);
            _usbWatcher = new UsbWatcherService();
            _kiosk = new KioskService();
            _socketService = new BoardSocketService(_config.Config.ApiUrl);
            _processMonitor = new ProcessMonitorService();

            SetupForm();
            _isLocked = _config.GetLastLockState();
            Load += async (_, _) => await InitWebView();
        }
        catch (Exception ex)
        {
            Log($"Constructor HATA: {ex.Message}");
            MessageBox.Show($"Başlatma hatası: {ex.Message}", "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ========== FORM AYARLARI ==========
    private void SetupForm()
    {
        Text = "E-Kilit";
        WindowState = FormWindowState.Maximized;
        FormBorderStyle = FormBorderStyle.None;
        BackColor = Color.FromArgb(5, 8, 22);
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = false;
        TopMost = !_isDev;

        FormClosing += (_, e) => { if (_isLocked && !_isDev) e.Cancel = true; };
        KeyPreview = true;
        KeyDown += OnKeyDown;
    }

    // ========== WEBVIEW2 BAŞLATMA ==========
    private async Task InitWebView()
    {
        Log("InitWebView başladı");

        // 1. HTML dosyalarını temp dizine çıkar
        string tempDir = Path.Combine(Path.GetTempPath(), "EKilitBoard", "html");
        Directory.CreateDirectory(tempDir);

        ExtractResource("EKilitBoard.Resources.lock-screen.html", Path.Combine(tempDir, "index.html"));
        ExtractResource("EKilitBoard.Resources.qrcode.min.js", Path.Combine(tempDir, "qrcode.min.js"));
        Log($"HTML dosyaları çıkarıldı: {tempDir}");

        // 2. WebView2 kontrolü oluştur
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(5, 8, 22)
        };
        Controls.Add(_webView);

        try
        {
            // 3. WebView2 Environment — data dizini ayrı, GPU kapalı
            string dataDir = Path.Combine(Path.GetTempPath(), "EKilitBoard", "wv2data");
            Directory.CreateDirectory(dataDir);

            var opts = new CoreWebView2EnvironmentOptions(
                "--disable-gpu --disable-gpu-compositing");
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir, opts);
            Log("CreateAsync başarılı");

            // 4. WebView2'yi başlat
            await _webView.EnsureCoreWebView2Async(env);
            Log("EnsureCoreWebView2Async başarılı");

            // WebView2 ayarları (Sağ tık ve yakınlaştırmayı kapat)
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.IsSwipeNavigationEnabled = false;

            // 5. Event'leri bağla
            _webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
            _webView.CoreWebView2.WebMessageReceived += OnWebMessage;

            // 6. HTML dosyasına navigate et
            string htmlPath = Path.Combine(tempDir, "index.html");
            string fileUrl = "file:///" + htmlPath.Replace('\\', '/');
            Log($"Navigating to: {fileUrl}");
            _webView.CoreWebView2.Navigate(fileUrl);

            _webView.Visible = true;
            _webView.BringToFront();
            Log("Navigate çağrıldı");
        }
        catch (Exception ex)
        {
            Log($"WebView2 HATA: {ex.Message}");
            MessageBox.Show(
                $"WebView2 başlatılamadı!\n\n{ex.Message}\n\nLog: C:\\ekilit_debug.txt",
                "Kritik Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ExtractResource(string resourceName, string targetPath)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            Log($"Resource bulunamadı: {resourceName}");
            Log($"Mevcut resources: {string.Join(", ", assembly.GetManifestResourceNames())}");
            return;
        }
        using var fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write);
        stream.CopyTo(fs);
    }

    // ========== NAVIGATION TAMAMLANDI ==========
    private bool _navHandled = false;
    private async void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (_navHandled) return;
        _navHandled = true;
        _webViewReady = true;
        Log($"NavigationCompleted — Success: {e.IsSuccess}");

        if (!e.IsSuccess)
        {
            Log($"Navigation hatası: {e.WebErrorStatus}");
            return;
        }

        await OnBoardReady();
    }

    // ========== BOARD HAZIR ==========
    private async Task OnBoardReady()
    {
        Log("OnBoardReady başladı");

        // Kiosk modunu aktive et
        if (!_isDev)
        {
            _kiosk.EnableKeyboardLock();
            StartupService.EnableStartup();
            StartupService.CreateStartupTask();
        }

        // Kayıtlı mı kontrol et
        if (!_config.IsRegistered)
        {
            Log("Tahta kayıtlı değil — setup gösteriliyor");
            await SendToWeb("showSetup", null);
            return;
        }

        Log("Tahta kayıtlı — servisler başlatılıyor");
        await StartAllServices();
    }

    private async Task StartAllServices()
    {
        // Board info göster
        await SendBoardInfo();

        // QR Token al ve göster
        await RefreshQrCode();

        // USB izleme başlat
        _usbWatcher.UsbInserted += OnUsbInserted;
        _usbWatcher.UsbRemoved += OnUsbRemoved;
        _usbWatcher.StartWatching();
        Log("USB izleme başladı");

        // Heartbeat timer (60sn)
        _heartbeatTimer = new System.Windows.Forms.Timer { Interval = 60000 };
        _heartbeatTimer.Tick += async (_, _) => await _api.SendHeartbeat(_isLocked ? "locked" : "unlocked");
        _heartbeatTimer.Start();
        _ = _api.SendHeartbeat("locked");

        // Screenshot timer (5dk)
        _screenshotTimer = new System.Windows.Forms.Timer { Interval = 300000 };
        _screenshotTimer.Tick += async (_, _) => await TakeAndUploadScreenshot();
        _screenshotTimer.Start();

        // QR refresh timer (35dk)
        _qrRefreshTimer = new System.Windows.Forms.Timer { Interval = 35 * 60 * 1000 };
        _qrRefreshTimer.Tick += async (_, _) => await RefreshQrCode();
        _qrRefreshTimer.Start();

        // USB cache sync
        _ = _api.SyncUsbKeysCache();

        // Lisans kontrolü
        _ = CheckLicense();

        // Dosya indirme kontrolü
        _ = _api.CheckPendingFiles(async id => await _socketService.EmitFileReceivedAsync(id));

        // Duyuruları çek
        _ = FetchAnnouncements();

        // WebSocket bağlan
        _ = ConnectSocket();

        Log("Tüm servisler başlatıldı");
    }

    // ========== QR KOD ==========
    private async Task RefreshQrCode()
    {
        try
        {
            var (qrToken, boardCode, expiresAt) = await _api.RequestQrToken();
            if (qrToken != null && boardCode != null)
            {
                string qrData = $"EKILIT|{boardCode}|{qrToken}";
                await SendToWeb("qr", new { qrData });
                Log($"QR güncellendi: {boardCode}");
            }
        }
        catch (Exception ex) { Log($"QR hata: {ex.Message}"); }
    }

    // ========== BOARD BİLGİSİ ==========
    private async Task SendBoardInfo()
    {
        var info = new
        {
            name = _config.Config.BoardName ?? "E-Kilit Tahta",
            code = _config.Config.BoardCode ?? "",
            school = _config.Config.SchoolCode ?? ""
        };
        await SendToWeb("boardInfo", new { info });
    }

    // ========== USB İZLEME ==========
    private async void OnUsbInserted(UsbDriveInfo drive)
    {
        Log($"USB takıldı: {drive.DriveLetter} — SN: {drive.SerialNumber}");
        if (!_isLocked) return;

        string hashedSerial = UsbWatcherService.HashSerial(drive.SerialNumber);

        // 1. Online doğrulama
        try
        {
            var (success, userName, error) = await _api.UnlockWithUsb(hashedSerial);
            if (success)
            {
                await PerformUnlock("usb", userName);
                return;
            }
            Log($"Online USB red: {error}");
        }
        catch { Log("Online USB doğrulama başarısız, cache deneniyor"); }

        // 2. Offline cache kontrolü
        var cached = _config.Config.CachedUsbKeys.FirstOrDefault(k => k.KeySerial == hashedSerial);
        if (cached != null)
        {
            Log($"Cache'den USB doğrulandı: {cached.UserName}");
            await PerformUnlock("usb", cached.UserName);
            _config.Config.OfflineUnlockLogs.Add(new OfflineUnlockLog
            {
                Method = "usb", KeySerial = hashedSerial,
                UserName = cached.UserName, Timestamp = DateTime.Now
            });
            _config.Save();
            return;
        }

        // 3. .ekilit dosyası kontrolü
        var validation = UsbWatcherService.ValidateUsbKey(drive);
        if (validation.HasPayload && validation.IsValidPayload)
        {
            await PerformUnlock("usb", "USB Kullanıcı");
            return;
        }

        Log("USB doğrulanamadı");
    }

    private void OnUsbRemoved(string serialNumber)
    {
        Log($"USB çıkarıldı: {serialNumber}");
    }

    // ========== KİLİT AÇ / KİLİTLE ==========
    private async Task PerformUnlock(string method, string? userName)
    {
        Log($"KİLİT AÇILIYOR — method: {method}, user: {userName}");
        _isLocked = false;
        _config.SaveLockState(false);

        if (!_isDev) _kiosk.DisableKeyboardLock();

        // UI'a bildir
        await SendToWeb("unlock", new { method, user = userName ?? "Bilinmeyen" });

        // API'ya bildir
        _ = _api.SendHeartbeat("unlocked");

        // 40 dakika sonra otomatik kilitle
        _autoLockTimer?.Stop();
        _autoLockTimer = new System.Windows.Forms.Timer { Interval = 40 * 60 * 1000 };
        _autoLockTimer.Tick += async (_, _) =>
        {
            _autoLockTimer?.Stop();
            await PerformLock(true);
        };
        _autoLockTimer.Start();

        // 5 saniye sonra kilit animasyonunu gizle
        var hideTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        hideTimer.Tick += async (_, _) =>
        {
            hideTimer.Stop();
            hideTimer.Dispose();
            await SendToWeb("hideUnlock", null);
            if (!_isDev) this.Hide();
        };
        hideTimer.Start();
    }

    private async Task PerformLock(bool notifyApi = true)
    {
        Log("KİLİTLENİYOR");
        
        if (!_isDev) 
        {
            this.Show();
            this.BringToFront();
            this.TopMost = true;
            this.Activate();
            _kiosk.EnableKeyboardLock();
        }

        _isLocked = true;
        _config.SaveLockState(true);

        // QR'ı yenile
        await RefreshQrCode();

        // API'ya bildir
        _ = _api.SendHeartbeat("locked");
        if (notifyApi) _ = _api.LockBoard();

        _autoLockTimer?.Stop();
    }

    // ========== WEBSOCKET ==========
    private async Task ConnectSocket()
    {
        try
        {
            if (string.IsNullOrEmpty(_config.Config.BoardToken)) return;

            _socketService.UnlockRequested += async (method, user) =>
            {
                if (InvokeRequired)
                    Invoke(() => _ = PerformUnlock(method ?? "remote", user));
                else
                    await PerformUnlock(method ?? "remote", user);
            };

            _socketService.LockRequested += () =>
            {
                if (InvokeRequired)
                    Invoke(() => _ = PerformLock(false));
                else
                    _ = PerformLock(false);
            };

            _socketService.FileReadyReceived += () =>
            {
                if (InvokeRequired)
                    Invoke(() => _ = _api.CheckPendingFiles(async id => await _socketService.EmitFileReceivedAsync(id)));
                else
                    _ = _api.CheckPendingFiles(async id => await _socketService.EmitFileReceivedAsync(id));
            };

            _socketService.AnnouncementReceived += async (jsonStr) =>
            {
                if (InvokeRequired)
                    Invoke(() => _ = FetchAnnouncements());
                else
                    await FetchAnnouncements();
            };

            _socketService.ConnectionStateChanged += async (isConnected) =>
            {
                if (InvokeRequired)
                    Invoke(() => _ = SendToWeb("connectionStatus", new { online = isConnected }));
                else
                    await SendToWeb("connectionStatus", new { online = isConnected });
            };

            await _socketService.ConnectAsync(_config.Config.BoardToken);
            Log("WebSocket bağlantısı kuruldu");
        }
        catch (Exception ex) { Log($"WebSocket hata: {ex.Message}"); }
    }

    private async Task FetchAnnouncements()
    {
        try
        {
            var announcements = await _api.GetAnnouncements();
            if (!string.IsNullOrEmpty(announcements))
            {
                await SendToWeb("updateAnnouncements", new { data = announcements });
            }
        }
        catch (Exception ex) { Log($"Duyuru çekme hatası: {ex.Message}"); }
    }

    // ========== JS → C# MESAJLARI ==========
    private async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var msg = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, System.Text.Json.JsonElement>>(
                e.WebMessageAsJson);
            if (msg == null) return;

            var type = msg.ContainsKey("type") ? msg["type"].GetString() : null;
            Log($"WebMessage: {type}");

            switch (type)
            {
                case "register":
                    var schoolCode = msg.ContainsKey("schoolCode") ? msg["schoolCode"].GetString() : null;
                    var boardName = msg.ContainsKey("boardName") ? msg["boardName"].GetString() : null;

                    if (string.IsNullOrEmpty(schoolCode) || string.IsNullOrEmpty(boardName))
                    {
                        await SendToWeb("setupError", new { error = "Lütfen tüm alanları doldurun" });
                        return;
                    }

                    var (ok, err, _) = await _api.RegisterBoard(schoolCode, boardName);
                    if (ok)
                    {
                        Log($"Kayıt başarılı: {schoolCode}/{boardName}");
                        await SendToWeb("hideSetup", null);
                        await StartAllServices();
                    }
                    else
                    {
                        await SendToWeb("setupError", new { error = err ?? "Kayıt hatası" });
                    }
                    break;
            }
        }
        catch (Exception ex)
        {
            Log($"WebMessage hata: {ex.Message}");
            await SendToWeb("setupError", new { error = $"Hata: {ex.Message}" });
        }
    }

    // ========== C# → JS MESAJLARI ==========
    private Task SendToWeb(string type, object? payload)
    {
        if (!_webViewReady || _webView?.CoreWebView2 == null) return Task.CompletedTask;
        try
        {
            var data = new Dictionary<string, object?> { ["type"] = type };
            if (payload != null)
            {
                var props = payload.GetType().GetProperties();
                foreach (var p in props)
                    data[p.Name] = p.GetValue(payload);
            }
            string json = JsonConvert.SerializeObject(data);
            Log($"SendToWeb: {type}");
            _webView.CoreWebView2.PostWebMessageAsJson(json);
        }
        catch (Exception ex) { Log($"SendToWeb hata: {ex.Message}"); }
        return Task.CompletedTask;
    }

    // ========== SCREENSHOT ==========
    private async Task TakeAndUploadScreenshot()
    {
        try
        {
            var imageData = KioskService.CaptureScreen();
            await _api.UploadScreenshot(imageData);
        }
        catch { }
    }

    // ========== LİSANS ==========
    private async Task CheckLicense()
    {
        try
        {
            var license = await _api.CheckLicense();
            if (!license.Valid)
                Log($"Lisans geçersiz!");
        }
        catch { }
    }

    // ========== KLAVYE ==========
    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        // Ctrl+Alt+Shift+F12 → Acil çıkış
        if (e.Control && e.Alt && e.Shift && e.KeyCode == Keys.F12)
        {
            Log("ACİL ÇIKIŞ");
            _isLocked = false;
            if (!_isDev) _kiosk.DisableKeyboardLock();
            Application.Exit();
            return;
        }

        // Ctrl+Shift+M → Master key
        if (e.Control && e.Shift && e.KeyCode == Keys.M && _isLocked)
        {
            ShowMasterKeyDialog();
        }
    }

    // ========== MASTER KEY ==========
    private void ShowMasterKeyDialog()
    {
        var dialog = new Form
        {
            Text = "Master Key",
            Size = new Size(350, 180),
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            BackColor = Color.FromArgb(30, 30, 50),
            ForeColor = Color.White,
            TopMost = true
        };

        var label = new Label { Text = "Master Key:", Location = new Point(20, 20), AutoSize = true };
        var textBox = new TextBox
        {
            Location = new Point(20, 45), Size = new Size(290, 30),
            PasswordChar = '*', BackColor = Color.FromArgb(50, 50, 70), ForeColor = Color.White
        };
        var button = new Button
        {
            Text = "Kilidi Aç", Location = new Point(20, 85), Size = new Size(290, 40),
            BackColor = Color.FromArgb(108, 99, 255), ForeColor = Color.White, FlatStyle = FlatStyle.Flat
        };

        button.Click += async (_, _) =>
        {
            var key = textBox.Text.Trim();
            if (string.IsNullOrEmpty(key)) return;

            var (success, error) = await _api.UnlockWithMasterKey(key);
            if (success)
            {
                dialog.Close();
                await PerformUnlock("masterkey", "Master Key");
            }
            else
            {
                MessageBox.Show(error ?? "Geçersiz master key", "Hata", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        };

        dialog.Controls.AddRange(new Control[] { label, textBox, button });
        dialog.ShowDialog(this);
    }

    // ========== KAYIT SONRASI SERVİSLER ==========
    private async Task InitializeBoardAfterRegisterAsync()
    {
        await SendBoardInfo();
        await StartAllServices();
    }

    // ========== DISPOSE ==========
    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _heartbeatTimer?.Dispose();
            _screenshotTimer?.Dispose();
            _qrRefreshTimer?.Dispose();
            _autoLockTimer?.Dispose();
            _usbWatcher?.Dispose();
            _kiosk?.Dispose();
            _socketService?.Dispose();
            _webView?.Dispose();
        }
        base.Dispose(disposing);
    }
}
