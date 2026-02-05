namespace TGHarker.SecureChat.Contracts.Models;

/// <summary>
/// Information about a contact invite (without secrets).
/// </summary>
[GenerateSerializer]
public record ContactInviteDto(
    [property: Id(0)] string InviteId,
    [property: Id(1)] string CreatorUserId,
    [property: Id(2)] string CreatorDisplayName,
    [property: Id(3)] DateTime CreatedAt,
    [property: Id(4)] DateTime ExpiresAt,
    [property: Id(5)] bool IsAccepted
);

/// <summary>
/// Result of accepting an invite.
/// </summary>
[GenerateSerializer]
public record AcceptInviteResultDto(
    [property: Id(0)] bool Success,
    [property: Id(1)] string? Error,
    [property: Id(2)] ContactDto? NewContact
);

/// <summary>
/// Response when creating a new invite.
/// </summary>
[GenerateSerializer]
public record CreateInviteResponseDto(
    [property: Id(0)] string InviteId,
    [property: Id(1)] string InviteSecret,
    [property: Id(2)] string InviteSecretCode,
    [property: Id(3)] string InviteUrl,
    [property: Id(4)] DateTime ExpiresAt
);
