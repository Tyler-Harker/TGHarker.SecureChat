using System.Net;
using System.Text.Json;
using Orleans.Runtime;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;
using WebPush;

namespace TGHarker.SecureChat.Silo.Grains;

public class PushNotificationGrain : Grain, IPushNotificationGrain
{
    private readonly IPersistentState<PushNotificationGrainState> _state;
    private readonly WebPushClient _pushClient;
    private readonly ILogger<PushNotificationGrain> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public PushNotificationGrain(
        [PersistentState("pushNotification", "AzureBlobStorage")]
        IPersistentState<PushNotificationGrainState> state,
        WebPushClient pushClient,
        ILogger<PushNotificationGrain> logger)
    {
        _state = state;
        _pushClient = pushClient;
        _logger = logger;
    }

    public async Task RegisterSubscriptionAsync(PushSubscriptionDto subscription)
    {
        _state.State.Subscriptions.RemoveAll(s => s.Endpoint == subscription.Endpoint);
        _state.State.Subscriptions.Add(subscription);
        await _state.WriteStateAsync();

        _logger.LogInformation(
            "Registered push subscription for user {UserId}, total: {Count}",
            this.GetPrimaryKeyString(), _state.State.Subscriptions.Count);
    }

    public async Task UnregisterSubscriptionAsync(string endpoint)
    {
        var removed = _state.State.Subscriptions.RemoveAll(s => s.Endpoint == endpoint);
        if (removed > 0)
        {
            await _state.WriteStateAsync();
            _logger.LogInformation(
                "Unregistered push subscription for user {UserId}",
                this.GetPrimaryKeyString());
        }
    }

    public Task<List<PushSubscriptionDto>> GetSubscriptionsAsync()
    {
        return Task.FromResult(_state.State.Subscriptions.ToList());
    }

    public async Task SendNotificationAsync(PushNotificationPayload payload)
    {
        if (_state.State.Subscriptions.Count == 0) return;

        var payloadJson = JsonSerializer.Serialize(payload, JsonOptions);
        var expiredEndpoints = new List<string>();

        foreach (var sub in _state.State.Subscriptions)
        {
            try
            {
                var pushSubscription = new PushSubscription(sub.Endpoint, sub.P256dhKey, sub.AuthKey);
                await _pushClient.SendNotificationAsync(pushSubscription, payloadJson);
            }
            catch (WebPushException ex) when (ex.StatusCode == HttpStatusCode.Gone
                                            || ex.StatusCode == HttpStatusCode.NotFound)
            {
                expiredEndpoints.Add(sub.Endpoint);
                _logger.LogInformation(
                    "Push subscription expired for user {UserId}: {Endpoint}",
                    this.GetPrimaryKeyString(), sub.Endpoint);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to send push to user {UserId}, endpoint {Endpoint}",
                    this.GetPrimaryKeyString(), sub.Endpoint);
            }
        }

        if (expiredEndpoints.Count > 0)
        {
            _state.State.Subscriptions.RemoveAll(s => expiredEndpoints.Contains(s.Endpoint));
            await _state.WriteStateAsync();
        }
    }
}
