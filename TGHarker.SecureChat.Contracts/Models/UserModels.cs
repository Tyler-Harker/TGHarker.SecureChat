using Orleans;

namespace TGHarker.SecureChat.Contracts.Models;

[GenerateSerializer]
public record UserProfileDto(
    string UserId,
    string Email,
    string DisplayName,
    byte[] PublicIdentityKey,
    DateTime CreatedAt
);

[GenerateSerializer]
public record UserRegistrationDto(
    string Email,
    string DisplayName,
    byte[] PublicIdentityKey,
    byte[] EncryptedPrivateKey,
    byte[] Salt
);

[GenerateSerializer]
public record UserSearchResult(
    string UserId,
    string Email,
    string DisplayName
);

[GenerateSerializer]
public record ContactDto(
    string UserId,
    string Email,
    string DisplayName,
    string? Nickname = null
);

[GenerateSerializer]
public record ContactRequestDto(
    string RequestId,
    string FromUserId,
    string ToUserId,
    string FromUserDisplayName,
    string FromUserEmail,
    ContactRequestStatus Status,
    DateTime CreatedAt
);

[GenerateSerializer]
public enum ContactRequestStatus
{
    Pending,
    Accepted,
    Declined
}
