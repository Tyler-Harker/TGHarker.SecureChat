using Orleans;

namespace TGHarker.SecureChat.Contracts.Models;

/// <summary>
/// Represents a Web Push subscription from a browser.
/// Matches the PushSubscription JS API shape.
/// </summary>
[GenerateSerializer]
public record PushSubscriptionDto(
    [property: Id(0)] string Endpoint,
    [property: Id(1)] string P256dhKey,
    [property: Id(2)] string AuthKey,
    [property: Id(3)] DateTime CreatedAt,
    [property: Id(4)] string? DeviceLabel
);

/// <summary>
/// Payload for a push notification message sent via Web Push Protocol.
/// </summary>
[GenerateSerializer]
public record PushNotificationPayload(
    [property: Id(0)] string Type,
    [property: Id(1)] string Title,
    [property: Id(2)] string Body,
    [property: Id(3)] string? Url,
    [property: Id(4)] string? ConversationId,
    [property: Id(5)] string? SenderUserId,
    [property: Id(6)] string? Tag
);
