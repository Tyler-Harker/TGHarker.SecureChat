using Orleans;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Grains;

/// <summary>
/// Grain representing a contact request between two users.
/// Key: RequestId (Guid as string)
/// </summary>
public interface IContactRequestGrain : IGrainWithStringKey
{
    /// <summary>
    /// Creates a new contact request.
    /// </summary>
    Task CreateRequestAsync(string fromUserId, string toUserId, string fromUserDisplayName, string fromUserEmail);

    /// <summary>
    /// Gets the contact request details.
    /// </summary>
    Task<ContactRequestDto?> GetRequestAsync();

    /// <summary>
    /// Accepts the contact request.
    /// Requires: Caller must be the recipient (toUserId).
    /// </summary>
    Task AcceptRequestAsync();

    /// <summary>
    /// Declines the contact request.
    /// Requires: Caller must be the recipient (toUserId).
    /// </summary>
    Task DeclineRequestAsync();

    /// <summary>
    /// Checks if the request is still pending.
    /// </summary>
    Task<bool> IsPendingAsync();
}
