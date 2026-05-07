using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Management;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using EKilitBoard.Models;

namespace EKilitBoard.Services;

/// <summary>
/// API ile iletişim: kayıt, heartbeat, USB doğrulama, lisans kontrolü, ekran görüntüsü.
/// </summary>
public class ApiService
{
    private readonly HttpClient _http;
    private readonly ConfigService _config;

    public ApiService(ConfigService config)
    {
        _config = config;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
    }

    private void SetAuthHeader()
    {
        var token = _config.Config.BoardToken;
        if (!string.IsNullOrEmpty(token))
            _http.DefaultRequestHeaders.Authorization = null; // clear first
        if (!string.IsNullOrEmpty(token))
        {
            _http.DefaultRequestHeaders.Remove("X-Board-Token");
            _http.DefaultRequestHeaders.Add("X-Board-Token", token);
        }
    }

    private string Url(string path) => $"{_config.Config.ApiUrl}{path}";

    // ========== KAYIT ==========
    public async Task<(bool Success, string? Error, JObject? Data)> RegisterBoard(string schoolCode, string boardName)
    {
        try
        {
            var hwId = await GetHardwareId();
            _config.Config.HardwareId = hwId;

            var body = new
            {
                school_code = schoolCode,
                hardware_id = hwId,
                name = boardName,
                os_info = $"{Environment.OSVersion} {(Environment.Is64BitOperatingSystem ? "x64" : "x86")}",
                app_version = "2.0.0"
            };

            var resp = await _http.PostAsync(Url("/boards/register"),
                new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));

            var json = JObject.Parse(await resp.Content.ReadAsStringAsync());

            if (!resp.IsSuccessStatusCode)
                return (false, json["error"]?.ToString() ?? "Kayıt başarısız", null);

            // Token ve board bilgilerini kaydet
            _config.Config.BoardToken = json["token"]?.ToString();
            _config.Config.SchoolCode = schoolCode;
            _config.Config.BoardName = boardName;
            _config.Config.BoardId = json["board"]?["id"]?.Value<int>();
            _config.Config.BoardCode = json["board"]?["board_code"]?.ToString();
            _config.Save();

            return (true, null, json);
        }
        catch (Exception ex)
        {
            return (false, $"Bağlantı hatası: {ex.Message}", null);
        }
    }

    // ========== HEARTBEAT ==========
    public async Task SendHeartbeat(string status = "locked")
    {
        try
        {
            SetAuthHeader();
            var boardId = _config.Config.BoardId;
            if (boardId == null) return;

            // Online statusunu ayrı gönder - admin panelinde doğru görünmesi için
            var body = new { 
                status = status, // locked/unlocked
                is_online = true,
                app_version = "2.0.0" 
            };
            await _http.PostAsync(Url($"/boards/{boardId}/heartbeat"),
                new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));
        }
        catch { /* sessiz */ }
    }

    // ========== USB İLE KİLİT AÇMA ==========
    public async Task<(bool Success, string? UserName, string? Error)> UnlockWithUsb(string hashedSerial)
    {
        try
        {
            SetAuthHeader();
            var boardId = _config.Config.BoardId;
            var body = new { board_id = boardId, key_serial = hashedSerial };

            var resp = await _http.PostAsync(Url("/unlock/usb"),
                new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));

            var json = JObject.Parse(await resp.Content.ReadAsStringAsync());

            if (resp.IsSuccessStatusCode)
                return (true, json["user"]?["full_name"]?.ToString() ?? "USB Kullanıcı", null);

            return (false, null, json["error"]?.ToString() ?? "Geçersiz USB");
        }
        catch
        {
            return (false, null, "API bağlantısı yok");
        }
    }

    // ========== MASTER KEY ==========
    public async Task<(bool Success, string? Error)> UnlockWithMasterKey(string masterKey)
    {
        try
        {
            SetAuthHeader();
            var boardId = _config.Config.BoardId;
            var body = new { board_id = boardId, master_key = masterKey };

            var resp = await _http.PostAsync(Url("/unlock/masterkey"),
                new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));

            return (resp.IsSuccessStatusCode, resp.IsSuccessStatusCode ? null : "Geçersiz master key");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // ========== BOARD LOCK ==========
    public async Task LockBoard()
    {
        try
        {
            SetAuthHeader();
            var boardId = _config.Config.BoardId;
            if (boardId == null) return;

            var body = new { board_id = boardId };
            await _http.PostAsync(Url("/unlock/lock"),
                new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));
        }
        catch { /* sessiz */ }
    }

    // ========== USB CACHE SYNC ==========
    public async Task SyncUsbKeysCache()
    {
        try
        {
            SetAuthHeader();
            var resp = await _http.GetAsync(Url("/usb-keys/board-cache"));
            if (!resp.IsSuccessStatusCode) return;

            var json = JObject.Parse(await resp.Content.ReadAsStringAsync());
            var keys = json["usb_keys"]?.ToObject<JArray>();
            if (keys == null) return;

            _config.Config.CachedUsbKeys = keys.Select(k => new CachedUsbKey
            {
                Id = k["id"]?.Value<int>() ?? 0,
                KeySerial = k["key_serial"]?.ToString() ?? "",
                UserName = k["user"]?["full_name"]?.ToString() ?? "Bilinmeyen",
                Label = k["label"]?.ToString() ?? ""
            }).ToList();
            _config.Config.UsbKeysSyncedAt = DateTime.Now;
            _config.Save();
            
            System.Diagnostics.Debug.WriteLine($"USB cache synced: {_config.Config.CachedUsbKeys.Count} keys loaded");
        }
        catch (Exception ex) 
        { 
            System.Diagnostics.Debug.WriteLine($"USB cache sync error: {ex.Message}");
        }
    }

    // ========== LİSANS KONTROLÜ ==========
    public async Task<LicenseInfo> CheckLicense()
    {
        try
        {
            SetAuthHeader();
            var resp = await _http.GetAsync(Url("/licenses/check"));
            if (!resp.IsSuccessStatusCode)
                return new LicenseInfo { Valid = false };

            var json = JObject.Parse(await resp.Content.ReadAsStringAsync());
            return new LicenseInfo
            {
                Valid = json["valid"]?.Value<bool>() ?? false,
                Type = json["license"]?["type"]?.ToString(),
                RemainingDays = json["license"]?["remaining_days"]?.Value<int>()
            };
        }
        catch
        {
            return new LicenseInfo { Valid = true }; // Offline → grace
        }
    }

    // ========== SCREENSHOT YÜKLE ==========
    public async Task UploadScreenshot(byte[] imageData)
    {
        try
        {
            SetAuthHeader();
            var boardId = _config.Config.BoardId;
            if (boardId == null) return;

            using var content = new MultipartFormDataContent();
            var imageContent = new ByteArrayContent(imageData);
            imageContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            content.Add(imageContent, "screenshot", $"board_{boardId}_{DateTime.Now:yyyyMMddHHmmss}.jpg");
            content.Add(new StringContent(boardId.ToString()!), "board_id");

            await _http.PostAsync(Url($"/boards/{boardId}/screenshot"), content);
        }
        catch { /* sessiz */ }
    }

    // ========== DOSYA YÖNETİMİ ==========
    public async Task CheckPendingFiles(Action<int>? onDownloaded = null)
    {
        try
        {
            SetAuthHeader();
            var boardId = _config.Config.BoardId;
            if (boardId == null) return;

            var resp = await _http.GetAsync(Url($"/files/board/{boardId}/pending"));
            if (!resp.IsSuccessStatusCode) return;

            var json = JObject.Parse(await resp.Content.ReadAsStringAsync());
            var files = json["files"]?.ToObject<JArray>();
            if (files == null || files.Count == 0) return;

            string targetDir = @"C:\EKilit-Dosyalar";
            if (!System.IO.Directory.Exists(targetDir))
                System.IO.Directory.CreateDirectory(targetDir);

            foreach (var f in files)
            {
                int fileId = f["id"]?.Value<int>() ?? 0;
                string originalName = f["original_name"]?.ToString() ?? "BilinmeyenDosya";
                
                // Avoid re-downloading if exists with same name and roughly same logic locally
                string filePath = Path.Combine(targetDir, originalName);
                if (File.Exists(filePath)) 
                {
                    onDownloaded?.Invoke(fileId);
                    continue;
                }

                var fileResp = await _http.GetAsync(Url($"/files/{fileId}/download"));
                if (fileResp.IsSuccessStatusCode)
                {
                    using var fs = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None);
                    await fileResp.Content.CopyToAsync(fs);
                    onDownloaded?.Invoke(fileId);
                }
            }
        }
        catch { /* sessiz */ }
    }

    // ========== DUYURULAR ==========
    public async Task<string?> GetAnnouncements()
    {
        try
        {
            SetAuthHeader();
            var resp = await _http.GetAsync(Url("/announcements/active"));
            if (resp.IsSuccessStatusCode)
            {
                return await resp.Content.ReadAsStringAsync(); // JSON string
            }
            return null;
        }
        catch { return null; }
    }

    // ========== DİNAMİK QR TOKEN ==========
    public async Task<(string? QrToken, string? BoardCode, DateTime? ExpiresAt)> RequestQrToken()
    {
        try
        {
            SetAuthHeader();
            var boardId = _config.Config.BoardId;
            if (boardId == null) return (null, null, null);

            var resp = await _http.PostAsync(Url($"/boards/{boardId}/qr-token"),
                new StringContent("{}", Encoding.UTF8, "application/json"));

            if (!resp.IsSuccessStatusCode) return (null, null, null);

            var json = JObject.Parse(await resp.Content.ReadAsStringAsync());
            var qrToken = json["qr_token"]?.ToString();
            var boardCode = json["board_code"]?.ToString();
            var expiresAtStr = json["expires_at"]?.ToString();
            DateTime? expiresAt = null;
            if (!string.IsNullOrEmpty(expiresAtStr))
                expiresAt = DateTime.Parse(expiresAtStr);

            return (qrToken, boardCode, expiresAt);
        }
        catch
        {
            return (null, null, null);
        }
    }

    // ========== DONANIM KİMLİĞİ ==========
    private async Task<string> GetHardwareId()
    {
        return await Task.Run(() =>
        {
            try
            {
                var parts = new List<string>();

                using (var s = new ManagementObjectSearcher("SELECT SerialNumber, UUID FROM Win32_ComputerSystemProduct"))
                    foreach (var o in s.Get())
                    {
                        parts.Add(o["SerialNumber"]?.ToString() ?? "");
                        parts.Add(o["UUID"]?.ToString() ?? "");
                    }

                using (var s = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor"))
                    foreach (var o in s.Get())
                        parts.Add(o["Name"]?.ToString() ?? "");

                parts.Add(Environment.MachineName);

                var raw = string.Join("-", parts);
                using var sha = SHA256.Create();
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                return BitConverter.ToString(hash).Replace("-", "").ToLower()[..32];
            }
            catch
            {
                using var sha = SHA256.Create();
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(Environment.MachineName + Environment.UserName));
                return BitConverter.ToString(hash).Replace("-", "").ToLower()[..32];
            }
        });
    }
}
