using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SocketIOClient;
using Newtonsoft.Json.Linq;

namespace EKilitBoard.Services;

/// <summary>
/// Board socket listener — QR/remote unlock, lock events.
/// </summary>
public class BoardSocketService : IDisposable
{
    private SocketIO? _socket;
    private readonly string _apiUrl;

    public event Action<string?, string?>? UnlockRequested;
    public event Action? LockRequested;
    public event Action? FileReadyReceived;
    public event Action<string>? AnnouncementReceived;
    public event Action<bool>? ConnectionStateChanged;

    public BoardSocketService(string apiUrl)
    {
        _apiUrl = apiUrl;
    }

    public async Task ConnectAsync(string boardToken)
    {
        if (_socket != null) return;

        try
        {
            var options = new SocketIOOptions
            {
                Auth = new Dictionary<string, string>
                {
                    { "token", boardToken },
                    { "type", "board" }
                },
                Reconnection = true
            };

            _socket = new SocketIO(new Uri(_apiUrl), options);

            _socket.On("board:unlock", (response) =>
            {
                string? method = null;
                string? user = null;
                try 
                { 
                    var doc = response.GetValue<System.Text.Json.JsonElement>(0); 
                    if (doc.TryGetProperty("method", out var mProp)) method = mProp.GetString();
                    if (doc.TryGetProperty("user", out var uProp)) user = uProp.GetString();
                } 
                catch { }
                System.Diagnostics.Debug.WriteLine($"Unlock received: method={method}, user={user}");
                UnlockRequested?.Invoke(method, user);
                return Task.CompletedTask;
            });

            _socket.On("board:lock", (_) =>
            {
                System.Diagnostics.Debug.WriteLine("Lock received");
                LockRequested?.Invoke();
                return Task.CompletedTask;
            });

            _socket.On("board:file-ready", (_) =>
            {
                System.Diagnostics.Debug.WriteLine("File ready received");
                FileReadyReceived?.Invoke();
                return Task.CompletedTask;
            });

            _socket.On("board:announcement", (response) =>
            {
                try
                {
                    // Her ihtimale karşı data'yı string olarak arayüze geçireceğiz (JSON string)
                    var jsonStr = response.GetValue<JToken>(0).ToString();
                    System.Diagnostics.Debug.WriteLine("Announcement received");
                    AnnouncementReceived?.Invoke(jsonStr);
                }
                catch { }
                return Task.CompletedTask;
            });

            _socket.OnConnected += (sender, e) =>
            {
                System.Diagnostics.Debug.WriteLine($"WebSocket connected successfully to {_apiUrl}");
                ConnectionStateChanged?.Invoke(true);
            };

            _socket.OnDisconnected += (sender, e) =>
            {
                System.Diagnostics.Debug.WriteLine($"WebSocket disconnected: {e}");
                ConnectionStateChanged?.Invoke(false);
            };

            _socket.OnError += (sender, e) =>
            {
                System.Diagnostics.Debug.WriteLine($"WebSocket error: {e}");
                ConnectionStateChanged?.Invoke(false);
            };

            await _socket.ConnectAsync();
            System.Diagnostics.Debug.WriteLine($"WebSocket connection established");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"WebSocket connection failed: {ex.Message}");
            ConnectionStateChanged?.Invoke(false);
            throw;
        }
    }

    public async Task EmitFileReceivedAsync(int fileId)
    {
        if (_socket != null && _socket.Connected)
        {
            await _socket.EmitAsync("board:file-received", new object[] { new { file_id = fileId } });
            System.Diagnostics.Debug.WriteLine($"File received emitted for file_id: {fileId}");
        }
    }

    public void Dispose()
    {
        if (_socket != null)
        {
            _ = _socket.DisconnectAsync();
            _socket.Dispose();
            _socket = null;
        }
    }
}
