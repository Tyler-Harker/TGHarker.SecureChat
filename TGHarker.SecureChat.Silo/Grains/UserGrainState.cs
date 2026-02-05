using Orleans;
using TGHarker.SecureChat.ServiceDefaults.Cryptography.Models;

namespace TGHarker.SecureChat.Silo.Grains;

[GenerateSerializer]
public class UserGrainState
{
    [Id(0)]
    public string UserId { get; set; } = string.Empty;

    [Id(1)]
    public string Email { get; set; } = string.Empty;

    [Id(2)]
    public string DisplayName { get; set; } = string.Empty;

    [Id(3)]
    public UserIdentityKeys? IdentityKeys { get; set; }

    [Id(4)]
    public HashSet<Guid> ConversationIds { get; set; } = new();

    [Id(5)]
    public DateTime CreatedAt { get; set; }

    [Id(6)]
    public DateTime LastActiveAt { get; set; }

    [Id(7)]
    public bool IsRegistered { get; set; }

    [Id(8)]
    public HashSet<string> ContactUserIds { get; set; } = new();
}
