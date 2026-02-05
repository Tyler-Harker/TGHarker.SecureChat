using System.Collections.Concurrent;

namespace TGHarker.SecureChat.WebApi.Services;

/// <summary>
/// Service for managing real-time invite acceptance notifications via Server-Sent Events (SSE).
/// </summary>
public interface IInviteNotificationService
{
    Task NotifyInviteAcceptedAsync(string inviteId, string acceptedByUserId, string acceptedByDisplayName);
    void RegisterListener(string inviteId, Func<string, string, Task> callback);
    void UnregisterListener(string inviteId);
}

public class InviteNotificationService : IInviteNotificationService
{
    private readonly ConcurrentDictionary<string, List<Func<string, string, Task>>> _listeners = new();
    private readonly ILogger<InviteNotificationService> _logger;

    public InviteNotificationService(ILogger<InviteNotificationService> logger)
    {
        _logger = logger;
    }

    public void RegisterListener(string inviteId, Func<string, string, Task> callback)
    {
        _listeners.AddOrUpdate(
            inviteId,
            _ => new List<Func<string, string, Task>> { callback },
            (_, existing) =>
            {
                existing.Add(callback);
                return existing;
            }
        );

        _logger.LogInformation("Registered SSE listener for invite {InviteId}", inviteId);
    }

    public void UnregisterListener(string inviteId)
    {
        _listeners.TryRemove(inviteId, out _);
        _logger.LogInformation("Unregistered SSE listener for invite {InviteId}", inviteId);
    }

    public async Task NotifyInviteAcceptedAsync(string inviteId, string acceptedByUserId, string acceptedByDisplayName)
    {
        if (_listeners.TryGetValue(inviteId, out var callbacks))
        {
            _logger.LogInformation("Notifying {Count} listeners for invite {InviteId}", callbacks.Count, inviteId);

            foreach (var callback in callbacks)
            {
                try
                {
                    await callback(acceptedByUserId, acceptedByDisplayName);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error notifying listener for invite {InviteId}", inviteId);
                }
            }

            // Remove listeners after notification since invite can only be accepted once
            _listeners.TryRemove(inviteId, out _);
        }
    }
}
