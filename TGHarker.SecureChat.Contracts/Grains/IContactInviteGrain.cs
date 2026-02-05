using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Grains;

/// <summary>
/// Grain for managing contact invite links.
/// Key = inviteId (GUID string).
/// This grain is in-memory only and expires after 1 hour.
/// </summary>
public interface IContactInviteGrain : IGrainWithStringKey
{
    /// <summary>
    /// Initialize the invite with creator info and secrets.
    /// </summary>
    Task<ContactInviteDto> CreateAsync(string creatorUserId, string inviteSecret, string inviteSecretCode);

    /// <summary>
    /// Get invite details (without secrets).
    /// </summary>
    Task<ContactInviteDto?> GetInviteAsync();

    /// <summary>
    /// Accept the invite, adding both users as contacts.
    /// </summary>
    Task<AcceptInviteResultDto> AcceptAsync(string acceptingUserId, string inviteSecret, string inviteSecretCode);

    /// <summary>
    /// Check if the invite is still valid (not expired, not used).
    /// </summary>
    Task<bool> IsValidAsync();
}
