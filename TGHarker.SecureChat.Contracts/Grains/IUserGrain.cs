using Orleans;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Grains;

/// <summary>
/// Grain representing a single user in the system.
/// Key: OAuth2 subject ID (string)
/// </summary>
public interface IUserGrain : IGrainWithStringKey
{
    /// <summary>
    /// Registers a new user with their encrypted identity keys.
    /// </summary>
    Task RegisterAsync(UserRegistrationDto registration);

    /// <summary>
    /// Gets the user's profile information.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task<UserProfileDto> GetProfileAsync();

    /// <summary>
    /// Updates the user's public and encrypted private identity keys.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task UpdatePublicKeyAsync(byte[] publicKey, byte[] encryptedPrivateKey, byte[] salt);

    /// <summary>
    /// Gets the list of conversation IDs the user is participating in.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task<List<Guid>> GetConversationIdsAsync();

    /// <summary>
    /// Adds a conversation to the user's conversation list.
    /// Called by ConversationGrain when user is added to a conversation.
    /// </summary>
    Task AddConversationAsync(Guid conversationId);

    /// <summary>
    /// Removes a conversation from the user's conversation list.
    /// Called by ConversationGrain when user leaves a conversation.
    /// </summary>
    Task RemoveConversationAsync(Guid conversationId);

    /// <summary>
    /// Gets the user's public identity key for key exchange.
    /// This is publicly accessible for other users to perform ECDH.
    /// </summary>
    Task<byte[]> GetPublicIdentityKeyAsync();

    /// <summary>
    /// Updates the user's last active timestamp.
    /// </summary>
    Task UpdateLastActiveAsync();

    /// <summary>
    /// Adds a user as a contact.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task AddContactAsync(string contactUserId);

    /// <summary>
    /// Removes a user from contacts.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task RemoveContactAsync(string contactUserId);

    /// <summary>
    /// Gets the list of contact user IDs.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task<List<string>> GetContactIdsAsync();

    /// <summary>
    /// Gets basic profile info for display (publicly accessible for contacts).
    /// Returns null if user is not registered.
    /// </summary>
    Task<ContactDto?> GetContactInfoAsync();

    /// <summary>
    /// Ensures the user is registered. If not, creates a minimal registration.
    /// Returns the profile and whether this was a new registration.
    /// </summary>
    Task<(UserProfileDto Profile, bool IsNewUser)> EnsureRegisteredAsync(string email, string displayName);

    /// <summary>
    /// Checks if the user is registered.
    /// </summary>
    Task<bool> IsRegisteredAsync();

    /// <summary>
    /// Updates the user's display name.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task UpdateDisplayNameAsync(string displayName);

    /// <summary>
    /// Sets a nickname for a contact.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task SetContactNicknameAsync(string contactUserId, string nickname);

    /// <summary>
    /// Gets the nickname for a contact, or null if not set.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task<string?> GetContactNicknameAsync(string contactUserId);

    /// <summary>
    /// Removes the nickname for a contact.
    /// Requires: Caller must be the user themselves.
    /// </summary>
    Task RemoveContactNicknameAsync(string contactUserId);
}
