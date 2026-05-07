using Newtonsoft.Json;
using EKilitBoard.Models;

namespace EKilitBoard.Services;

/// <summary>
/// Yapılandırma yönetimi — JSON dosyasına kaydet/oku.
/// </summary>
public class ConfigService
{
    private readonly string _configPath;
    public AppConfig Config { get; private set; }

    public ConfigService()
    {
        var appData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "EKilitBoard");
        Directory.CreateDirectory(appData);
        _configPath = Path.Combine(appData, "config.json");
        Load();
    }

    public void Load()
    {
        if (File.Exists(_configPath))
        {
            try
            {
                var json = File.ReadAllText(_configPath);
                Config = JsonConvert.DeserializeObject<AppConfig>(json) ?? new AppConfig();
            }
            catch
            {
                Config = new AppConfig();
            }
        }
        else
        {
            Config = new AppConfig();
        }
    }

    public void Save()
    {
        var json = JsonConvert.SerializeObject(Config, Formatting.Indented);
        File.WriteAllText(_configPath, json);
    }

    /// <summary>
    /// Kilit durumunu kaydeder (restart sonrası korunması için)
    /// </summary>
    public void SaveLockState(bool isLocked)
    {
        Config.LastLockState = isLocked;
        Config.LastLockTime = isLocked ? DateTime.Now : null;
        Save();
        System.Diagnostics.Debug.WriteLine($"Lock state saved: {isLocked}");
    }

    /// <summary>
    /// Kaydedilmiş kilit durumunu okur
    /// </summary>
    public bool GetLastLockState()
    {
        var wasLocked = Config.LastLockState ?? true; // Varsayılan olarak kilitli
        
        // Eğer son 5 dakika içinde kilitlendiysen, durum korunsun
        if (wasLocked && Config.LastLockTime.HasValue)
        {
            var timeSinceLock = DateTime.Now - Config.LastLockTime.Value;
            if (timeSinceLock.TotalMinutes < 5)
            {
                System.Diagnostics.Debug.WriteLine("Restoring lock state from recent lock");
                return true;
            }
        }
        
        System.Diagnostics.Debug.WriteLine($"Using default lock state: {wasLocked}");
        return wasLocked;
    }

    public bool IsRegistered =>
        !string.IsNullOrWhiteSpace(Config.BoardToken) &&
        Config.BoardId.HasValue &&
        !string.IsNullOrWhiteSpace(Config.BoardCode) &&
        !string.IsNullOrWhiteSpace(Config.SchoolCode) &&
        !string.IsNullOrWhiteSpace(Config.BoardName);
}
