using Orleans;

namespace TGHarker.SecureChat.Contracts.Models;

[GenerateSerializer]
public record ConversationDto(
    Guid ConversationId,
    List<string> ParticipantUserIds,
    string CreatedByUserId,
    DateTime CreatedAt,
    DateTime LastActivityAt,
    int MessageCount,
    int CurrentKeyVersion
);

[GenerateSerializer]
public record CreateConversationDto(
    List<string> ParticipantUserIds,
    Dictionary<string, byte[]> EncryptedConversationKeys // UserId -> encrypted key for key version 1
);

[GenerateSerializer]
public record ConversationSummaryDto(
    Guid ConversationId,
    List<string> ParticipantUserIds,
    DateTime LastActivityAt,
    int MessageCount
);
