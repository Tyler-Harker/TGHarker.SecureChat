using System.Collections.Concurrent;

namespace TGHarker.SecureChat.WebApi.Services;

/// <summary>
/// Service for managing real-time message notifications via Server-Sent Events (SSE).
/// </summary>
public interface IConversationNotificationService
{
    Task NotifyNewMessageAsync(Guid conversationId, string messageJson);
    Task NotifyConversationDeletedAsync(Guid conversationId, string eventJson);
    void RegisterListener(Guid conversationId, string userId, Func<string, Task> callback);
    void UnregisterListener(Guid conversationId, string userId);
}

public class ConversationNotificationService : IConversationNotificationService
{
    // Key: conversationId, Value: Dictionary of userId -> callback
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, Func<string, Task>>> _listeners = new();
    private readonly ILogger<ConversationNotificationService> _logger;

    public ConversationNotificationService(ILogger<ConversationNotificationService> logger)
    {
        _logger = logger;
    }

    public void RegisterListener(Guid conversationId, string userId, Func<string, Task> callback)
    {
        var conversationListeners = _listeners.GetOrAdd(conversationId, _ => new ConcurrentDictionary<string, Func<string, Task>>());
        conversationListeners[userId] = callback;

        _logger.LogInformation("Registered SSE listener for user {UserId} on conversation {ConversationId}", userId, conversationId);
    }

    public void UnregisterListener(Guid conversationId, string userId)
    {
        if (_listeners.TryGetValue(conversationId, out var conversationListeners))
        {
            conversationListeners.TryRemove(userId, out _);

            // Clean up empty conversation dictionaries
            if (conversationListeners.IsEmpty)
            {
                _listeners.TryRemove(conversationId, out _);
            }
        }

        _logger.LogInformation("Unregistered SSE listener for user {UserId} on conversation {ConversationId}", userId, conversationId);
    }

    public async Task NotifyNewMessageAsync(Guid conversationId, string messageJson)
    {
        if (_listeners.TryGetValue(conversationId, out var conversationListeners))
        {
            _logger.LogInformation("Notifying {Count} listeners for conversation {ConversationId}", conversationListeners.Count, conversationId);

            var tasks = conversationListeners.Values.Select(async callback =>
            {
                try
                {
                    await callback(messageJson);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error notifying listener for conversation {ConversationId}", conversationId);
                }
            });

            await Task.WhenAll(tasks);
        }
    }

    public async Task NotifyConversationDeletedAsync(Guid conversationId, string eventJson)
    {
        if (_listeners.TryGetValue(conversationId, out var conversationListeners))
        {
            _logger.LogInformation("Notifying {Count} listeners about deletion of conversation {ConversationId}", conversationListeners.Count, conversationId);

            var tasks = conversationListeners.Values.Select(async callback =>
            {
                try
                {
                    await callback(eventJson);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error notifying listener about conversation deletion {ConversationId}", conversationId);
                }
            });

            await Task.WhenAll(tasks);

            // Clear all listeners for this conversation since it's being deleted
            _listeners.TryRemove(conversationId, out _);
        }
    }
}
