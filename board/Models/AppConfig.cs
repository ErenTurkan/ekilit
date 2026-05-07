namespace EKilitBoard.Models;

public class AppConfig
{
    public string ApiUrl { get; set; } = "http://localhost:3000";
    public string? BoardToken { get; set; }
    public string? SchoolCode { get; set; }
    public string? BoardName { get; set; }
    public int? BoardId { get; set; }
    public string? BoardCode { get; set; }
    public string? HardwareId { get; set; }
    public List<CachedUsbKey> CachedUsbKeys { get; set; } = new();
    public DateTime? UsbKeysSyncedAt { get; set; }
    public List<OfflineUnlockLog> OfflineUnlockLogs { get; set; } = new();
    
    // Restart sonrası kilit durumunu korumak için
    public bool? LastLockState { get; set; } = true; // Varsayılan olarak kilitli
    public DateTime? LastLockTime { get; set; }
}

public class CachedUsbKey
{
    public int Id { get; set; }
    public string KeySerial { get; set; } = "";
    public string UserName { get; set; } = "Bilinmeyen";
    public string Label { get; set; } = "";
}

public class OfflineUnlockLog
{
    public string Method { get; set; } = "usb";
    public string KeySerial { get; set; } = "";
    public string UserName { get; set; } = "";
    public DateTime Timestamp { get; set; }
    public bool Synced { get; set; }
}

public class LicenseInfo
{
    public bool Valid { get; set; }
    public string? Type { get; set; }
    public int? RemainingDays { get; set; }
}
