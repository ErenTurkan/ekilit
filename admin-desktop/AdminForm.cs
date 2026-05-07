using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;
using System.Diagnostics;
using System.Text.Json;

namespace EKilitAdmin;

public class AdminForm : Form
{
    private WebView2 _webView = null!;
    private string _wwwRoot;

    public AdminForm()
    {
        // Admin web build yolu
        _wwwRoot = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");

        InitializeForm();
        InitializeWebView();
    }

    private void InitializeForm()
    {
        Text = "E-Kilit Yönetim Paneli";
        Width = 1280;
        Height = 800;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(5, 8, 22);
        Icon = SystemIcons.Shield; // İleride özel icon konabilir
    }

    private async void InitializeWebView()
    {
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(5, 8, 22)
        };
        Controls.Add(_webView);

        try
        {
            ExtractWwwRootZip();
            
            string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EKilitAdmin");
            if (!Directory.Exists(userDataFolder)) Directory.CreateDirectory(userDataFolder);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await _webView.EnsureCoreWebView2Async(env);

            _webView.CoreWebView2.WebMessageReceived += OnWebMessage;

            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "app.ekilit", _wwwRoot, CoreWebView2HostResourceAccessKind.Allow);

            _webView.CoreWebView2.Navigate("http://app.ekilit/index.html");
        }
        catch (Exception ex)
        {
            if (MessageBox.Show($"WebView2 Motoru Başlatılamadı!\n\nNeden: {ex.Message}\n\nÇözüm: Bu bilgisayara 'WebView2 Runtime' yüklemeniz gerekmektedir. Şimdi indirme sayfasını açmak ister misiniz?",
                "E-Kilit Sistem Hatası", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
            {
                Process.Start(new ProcessStartInfo("https://developer.microsoft.com/en-us/microsoft-edge/webview2/") { UseShellExecute = true });
            }
        }
    }

    private void ExtractWwwRootZip()
    {
        if (Directory.Exists(_wwwRoot)) return; // Already extracted
        
        Directory.CreateDirectory(_wwwRoot);
        var assembly = System.Reflection.Assembly.GetExecutingAssembly();
        
        using var stream = assembly.GetManifestResourceStream("EKilitAdmin.wwwroot.zip");
        if (stream == null) return;
        
        var tempZipPath = Path.Combine(Path.GetTempPath(), "wwwroot.zip");
        using (var fileStream = File.Create(tempZipPath))
        {
            stream.CopyTo(fileStream);
        }
        
        System.IO.Compression.ZipFile.ExtractToDirectory(tempZipPath, _wwwRoot);
        File.Delete(tempZipPath);
    }



    private async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            string json = e.WebMessageAsJson;
            try {
                json = e.TryGetWebMessageAsString();
            } catch {}

            var msg = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
            if (msg == null) return;

            var action = msg.GetValueOrDefault("action").GetString() ?? "";
            
            switch (action)
            {
                case "scan_usb":
                    await HandleScanUsbAsync();
                    break;
                case "format_usb":
                    await HandleFormatUsbAsync(msg);
                    break;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"IPC Error: {ex.Message}");
            // Genel bir hata dönerken action ismini 'error_result' yap ki JS beklemede kalmasın
            var errResponse = new { action = "error_result", data = new { success = false, error = "IPC Error: " + ex.Message } };
            _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(errResponse));
        }
    }

    private async Task HandleScanUsbAsync()
    {
        try
        {
            var results = new List<object>();

            // Get removable drives using standard .NET DriveInfo
            var driveLetters = DriveInfo.GetDrives()
                .Where(d => d.IsReady && (d.DriveType == DriveType.Removable || (d.DriveType == DriveType.Fixed && d.Name != "C:\\")))
                .Select(d => new {
                    driveLetter = d.Name,
                    label = string.IsNullOrEmpty(d.VolumeLabel) ? d.Name : $"{d.Name} ({d.VolumeLabel})"
                })
                .ToList();

            foreach (var d in driveLetters)
            {
                results.Add(d);
            }

            var response = new { action = "scan_usb_result", data = new { success = true, drives = results } };
            _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(response));
        }
        catch (Exception ex)
        {
            var errResponse = new { action = "scan_usb_result", data = new { success = false, error = ex.Message } };
            _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(errResponse));
        }
    }

    private async Task HandleFormatUsbAsync(Dictionary<string, JsonElement> msg)
    {
        try
        {
            var driveLetter = ReadString(msg, "driveLetter");
            var schoolId = ReadRequiredInt(msg, "schoolId", "Okul bilgisi eksik. USB anahtarı oluşturulamadı.");
            var userId = ReadOptionalInt(msg, "userId");
            
            if (string.IsNullOrEmpty(driveLetter)) throw new Exception("Sürücü harfi gerekli");

            // 1. Donanım serialını bul (Zaman aşımı korumalı)
            string serial = "";
            var serialTask = Task.Run(() => GetHardwareSerialByLetter(driveLetter.TrimEnd('\\')));
            if (await Task.WhenAny(serialTask, Task.Delay(4000)) == serialTask) {
                serial = await serialTask;
            } else {
                // Zaman aşımı durumunda (WMI takılırsa) fallback kullan
                serial = "USB-TIMEOUT-" + Guid.NewGuid().ToString().Substring(0, 8).ToUpper();
            }

            if (string.IsNullOrEmpty(serial)) serial = "USB-FAILED-" + Guid.NewGuid().ToString().Substring(0, 8).ToUpper();

            // 2. Dosya Yazma (Eski .ekilit dosyasını temizle ve yenisini yaz)
            var keyPath = Path.Combine(driveLetter, ".ekilit");
            if (File.Exists(keyPath)) {
                try {
                    File.SetAttributes(keyPath, FileAttributes.Normal);
                    File.Delete(keyPath);
                } catch { }
            }

            // Payload oluştur
            string rawData = $"{serial}_{schoolId}_{userId}";
            string salt = "ekilit_high_security_salt_2024!";
            
            using var sha = System.Security.Cryptography.SHA512.Create();
            var hashBytes = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(rawData + salt));
            var expectedHash = BitConverter.ToString(hashBytes).Replace("-", "").ToLower();

            var keyData = new {
                auth = expectedHash,
                meta = new { s = schoolId, u = userId }
            };

            await File.WriteAllTextAsync(keyPath, JsonSerializer.Serialize(keyData));
            File.SetAttributes(keyPath, FileAttributes.Hidden | FileAttributes.System);

            // Hash hardware serial to return
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var hwHashBytes = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(serial));
            var hwHash = BitConverter.ToString(hwHashBytes).Replace("-", "").ToLower();

            var response = new { 
                action = "format_usb_result", 
                data = new { success = true, hardwareSerial = hwHash } 
            };
            _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(response));
        }
        catch (Exception ex)
        {
            var errResponse = new { action = "format_usb_result", data = new { success = false, error = ex.Message } };
            _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(errResponse));
        }
    }

    private static string ReadString(Dictionary<string, JsonElement> msg, string key)
    {
        if (!msg.TryGetValue(key, out var value) || value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            return string.Empty;

        return value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : value.ToString();
    }

    private static int ReadRequiredInt(Dictionary<string, JsonElement> msg, string key, string errorMessage)
    {
        if (!TryReadInt(msg, key, out var value))
            throw new Exception(errorMessage);

        return value;
    }

    private static int ReadOptionalInt(Dictionary<string, JsonElement> msg, string key)
    {
        return TryReadInt(msg, key, out var value) ? value : 0;
    }

    private static bool TryReadInt(Dictionary<string, JsonElement> msg, string key, out int value)
    {
        value = 0;

        if (!msg.TryGetValue(key, out var element) || element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            return false;

        if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out value))
            return true;

        if (element.ValueKind == JsonValueKind.String && int.TryParse(element.GetString(), out value))
            return true;

        return false;
    }

    /// <summary>
    /// Drive harfinden donanım seri numarasını alır (Win32_DiskDrive level)
    /// </summary>
    private static string GetHardwareSerialByLetter(string driveLetter)
    {
        try
        {
            string cleanLetter = driveLetter.Trim().Split('\\')[0];
            if (!cleanLetter.Contains(":")) cleanLetter += ":";

            // Win32_DiskDrive üzerinden daha kapsamlı tarama
            using (var searcher = new System.Management.ManagementObjectSearcher("SELECT DeviceID, SerialNumber FROM Win32_DiskDrive"))
            {
                foreach (System.Management.ManagementObject disk in searcher.Get())
                {
                    string diskId = disk["DeviceID"]?.ToString() ?? "";
                    if (string.IsNullOrEmpty(diskId)) continue;

                    // Bu diske bağlı partitionları bul
                    using (var partSearcher = new System.Management.ManagementObjectSearcher($"ASSOCIATORS OF {{Win32_DiskDrive.DeviceID='{diskId.Replace("\\", "\\\\")}'}} WHERE AssocClass=Win32_DiskDriveToDiskPartition"))
                    {
                        foreach (System.Management.ManagementObject partition in partSearcher.Get())
                        {
                            string partId = partition["DeviceID"]?.ToString() ?? "";
                            // Bu partition'a bağlı mantıksal sürücüleri bul
                            using (var logSearcher = new System.Management.ManagementObjectSearcher($"ASSOCIATORS OF {{Win32_DiskPartition.DeviceID='{partId}'}} WHERE AssocClass=Win32_LogicalDiskToPartition"))
                            {
                                foreach (System.Management.ManagementObject logical in logSearcher.Get())
                                {
                                    if (logical["DeviceID"]?.ToString() == cleanLetter)
                                    {
                                        string sn = disk["SerialNumber"]?.ToString()?.Trim() ?? "";
                                        if (!string.IsNullOrEmpty(sn)) return sn;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Hardware serial error: {ex.Message}");
        }

        // YEDEK PLAN: WMI hata verirse veya boş dönerse Volume bazlı benzersiz ID üret
        try
        {
            var driveInfo = new DriveInfo(driveLetter.Split('\\')[0] + "\\");
            return "VOL-" + driveInfo.VolumeLabel + "-" + driveInfo.TotalSize;
        }
        catch { }

        // SON ÇARE: Rastgele ama o oturum için sabit bir ID
        return "USB-" + Guid.NewGuid().ToString().Replace("-", "").Substring(0, 16).ToUpper();
    }
}
