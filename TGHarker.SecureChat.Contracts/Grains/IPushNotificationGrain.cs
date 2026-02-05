using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Grains;

/// <summary>
/// Grain managing push notification subscriptions and sending for a single user.
/// Key: User ID (string) — same key as IUserGrain.
/// </summary>
public interface IPushNotificationGrain : IGrainWithStringKey
{
    Task RegisterSubscriptionAsync(PushSubscriptionDto subscription);
    Task UnregisterSubscriptionAsync(string endpoint);
    Task<List<PushSubscriptionDto>> GetSubscriptionsAsync();
    Task SendNotificationAsync(PushNotificationPayload payload);
    Task MarkConnectionActiveAsync();
    Task MarkConnectionInactiveAsync();
}
