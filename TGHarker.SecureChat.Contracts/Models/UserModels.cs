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
    string DisplayName
);
