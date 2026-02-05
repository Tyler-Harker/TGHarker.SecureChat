using Orleans;

namespace TGHarker.SecureChat.Silo.Grains;

[GenerateSerializer]
public class ConversationGrainState
{
    [Id(0)]
    public Guid ConversationId { get; set; }

    [Id(1)]
    public HashSet<string> ParticipantUserIds { get; set; } = new();

    [Id(2)]
    public string CreatedByUserId { get; set; } = string.Empty;

    [Id(3)]
    public DateTime CreatedAt { get; set; }

    [Id(4)]
    public DateTime LastActivityAt { get; set; }

    /// <summary>
    /// Encrypted conversation keys per participant per key version.
    /// Structure: [userId][keyVersion] = encryptedKey
    /// </summary>
    [Id(5)]
    public Dictionary<string, Dictionary<int, byte[]>> EncryptedKeys { get; set; } = new();

    [Id(6)]
    public int CurrentKeyVersion { get; set; } = 1;

    [Id(7)]
    public int MessageCount { get; set; }

    /// <summary>
    /// Ordered list of message IDs for pagination.
    /// Stores all message IDs in chronological order.
    /// </summary>
    [Id(8)]
    public List<Guid> MessageIds { get; set; } = new();

    /// <summary>
    /// Maps parent message IDs to their reply message IDs.
    /// Used for explicit loading of message threads.
    /// </summary>
    [Id(9)]
    public Dictionary<Guid, List<Guid>> MessageReplies { get; set; } = new();

    [Id(10)]
    public bool IsCreated { get; set; }
}
