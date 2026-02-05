using Orleans;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Silo.Grains;

[GenerateSerializer]
public class PushNotificationGrainState
{
    [Id(0)]
    public List<PushSubscriptionDto> Subscriptions { get; set; } = new();
}
