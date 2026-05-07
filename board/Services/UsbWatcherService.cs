using System.Security.Cryptography;
using System.Text;
using System.Management;
using Newtonsoft.Json;
using EKilitBoard.Models;

namespace EKilitBoard.Services;

/// <summary>
/// USB flash disk izleme servisi — WMI ile donanım seri numarası okur,
/// .ekilit gizli dosya doğrulaması yapar.
/// </summary>
public class UsbWatcherService : IDisposable
{
    private System.Windows.Forms.Timer? _pollTimer;
    private readonly HashSet<string> _knownDrives = new();
    private bool _isFirstScan = true;

    public event Action<UsbDriveInfo>? UsbInserted;
    public event Action<string>? UsbRemoved;

    public void StartWatching(int intervalMs = 2000)
    {
        // İlk taramada zaten bağlı olan sürücüleri kaydet (alarm verme)
        ScanDrives(silent: true);
        _isFirstScan = false;

        _pollTimer = new System.Windows.Forms.Timer { Interval = intervalMs };
        _pollTimer.Tick += (_, _) => ScanDrives(silent: false);
        _pollTimer.Start();
    }

    private void ScanDrives(bool silent)
    {
        try
        {
            var drives = GetRemovableDrives();
            var currentIds = new HashSet<string>(drives.Select(d => d.SerialNumber));

            if (!silent)
            {
                // Yeni takılan USB'ler
                foreach (var drive in drives)
                {
                    if (!_knownDrives.Contains(drive.SerialNumber))
                    {
                        UsbInserted?.Invoke(drive);
                    }
                }

                // Çıkartılan USB'ler
                foreach (var oldId in _knownDrives)
                {
                    if (!currentIds.Contains(oldId))
                    {
                        UsbRemoved?.Invoke(oldId);
                    }
                }
            }

            _knownDrives.Clear();
            foreach (var id in currentIds) _knownDrives.Add(id);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"USB Scan error: {ex.Message}");
        }
    }

    /// <summary>
    /// WMI ile takılı USB bellekleri bulur. Drive harf + donanım seri numarası döner.
    /// Donanım seviyesi seri numarası kullanılır (format sonrası değişmez).
    /// </summary>
    public static List<UsbDriveInfo> GetRemovableDrives()
    {
        var results = new List<UsbDriveInfo>();

        try
        {
            var driveLetters = DriveInfo.GetDrives()
                .Where(d => d.IsReady && (d.DriveType == DriveType.Removable || (d.DriveType == DriveType.Fixed && d.Name != "C:\\")))
                .Select(d => d.Name)
                .ToList();

            foreach (var d in driveLetters)
            {
                string serial = GetHardwareSerialByLetter(d.TrimEnd('\\'));
                
                results.Add(new UsbDriveInfo
                {
                    SerialNumber = string.IsNullOrEmpty(serial) ? d : serial,
                    DriveLetter = d
                });
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"WMI error: {ex.Message}");
        }

        return results;
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

            using (var searcher = new ManagementObjectSearcher("SELECT DeviceID, SerialNumber FROM Win32_DiskDrive"))
            {
                foreach (ManagementObject disk in searcher.Get())
                {
                    string diskId = disk["DeviceID"]?.ToString() ?? "";
                    if (string.IsNullOrEmpty(diskId)) continue;

                    using (var partSearcher = new ManagementObjectSearcher($"ASSOCIATORS OF {{Win32_DiskDrive.DeviceID='{diskId.Replace("\\", "\\\\")}'}} WHERE AssocClass=Win32_DiskDriveToDiskPartition"))
                    {
                        foreach (ManagementObject partition in partSearcher.Get())
                        {
                            string partId = partition["DeviceID"]?.ToString() ?? "";
                            using (var logSearcher = new ManagementObjectSearcher($"ASSOCIATORS OF {{Win32_DiskPartition.DeviceID='{partId}'}} WHERE AssocClass=Win32_LogicalDiskToPartition"))
                            {
                                foreach (ManagementObject logical in logSearcher.Get())
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

        // Fallback to Volume Serial if WMI fails
        try
        {
            var driveInfo = new DriveInfo(driveLetter.Split('\\')[0] + "\\");
            return "VOL-" + driveInfo.VolumeLabel + "-" + driveInfo.TotalSize;
        }
        catch { }

        return "";
    }

    /// <summary>
    /// USB üzerindeki .ekilit dosyasını okuyup HWID doğrulaması yapar.
    /// Kopyalanmış USB'leri red eder.
    /// </summary>
    public static UsbValidationResult ValidateUsbKey(UsbDriveInfo drive)
    {
        var result = new UsbValidationResult { SerialHash = HashSerial(drive.SerialNumber) };

        try
        {
            var keyPath = Path.Combine(drive.DriveLetter, ".ekilit");
            if (!File.Exists(keyPath))
            {
                // Gizli dosya yok — eski usb veya kopyalanmış
                result.HasPayload = false;
                return result;
            }

            var content = File.ReadAllText(keyPath, Encoding.UTF8);
            var keyData = JsonConvert.DeserializeObject<EkilitKeyFile>(content);
            if (keyData == null)
            {
                result.HasPayload = false;
                return result;
            }

            // HWID doğrulaması — salt ile sha512
            int schoolId = keyData.Meta?.S ?? 1;
            int userId = keyData.Meta?.U ?? 1;
            string rawData = $"{drive.SerialNumber}_{schoolId}_{userId}";
            string salt = "ekilit_high_security_salt_2024!";

            using var sha = SHA512.Create();
            var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(rawData + salt));
            var expectedHash = BitConverter.ToString(hash).Replace("-", "").ToLower();

            result.HasPayload = true;
            result.IsValidPayload = keyData.Auth == expectedHash;
            result.UserId = userId;
        }
        catch
        {
            result.HasPayload = false;
        }

        return result;
    }

    public static string HashSerial(string serial)
    {
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(serial));
        return BitConverter.ToString(hash).Replace("-", "").ToLower();
    }

    public void Dispose()
    {
        _pollTimer?.Stop();
        _pollTimer?.Dispose();
    }
}

public class UsbDriveInfo
{
    public string SerialNumber { get; set; } = "";
    public string DriveLetter { get; set; } = "";
}

public class UsbValidationResult
{
    public string SerialHash { get; set; } = "";
    public bool HasPayload { get; set; }
    public bool IsValidPayload { get; set; }
    public int? UserId { get; set; }
}

public class EkilitKeyFile
{
    [JsonProperty("auth")] public string? Auth { get; set; }
    [JsonProperty("meta")] public EkilitKeyMeta? Meta { get; set; }
}

public class EkilitKeyMeta
{
    [JsonProperty("s")] public int? S { get; set; }
    [JsonProperty("u")] public int? U { get; set; }
}
