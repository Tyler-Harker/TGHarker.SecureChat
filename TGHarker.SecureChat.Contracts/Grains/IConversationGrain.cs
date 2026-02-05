using Orleans;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Grains;

/// <summary>
/// Grain representing a conversation between 2 or more users.
/// Key: Conversation ID (Guid)
/// </summary>
public interface IConversationGrain : IGrainWithGuidKey
{
    /// <summary>
    /// Creates a new conversation with the specified participants.
    /// Requires: Caller must be in the participant list.
    /// </summary>
    Task CreateAsync(List<string> participantUserIds, string createdByUserId);

    /// <summary>
    /// Gets conversation details.
    /// Requires: Caller must be a participant.
    /// </summary>
    Task<ConversationDto> GetDetailsAsync();

    /// <summary>
    /// Adds a new participant to the conversation.
    /// Requires: Caller must be a participant.
    /// </summary>
    Task AddParticipantAsync(string userId);

    /// <summary>
    /// Removes a participant from the conversation.
    /// Requires: Caller must be the participant themselves or the conversation creator.
    /// </summary>
    Task RemoveParticipantAsync(string userId);

    /// <summary>
    /// Stores an encrypted conversation key for a specific user and key version.
    /// Each participant stores their own encrypted version of the conversation key.
    /// </summary>
    Task StoreEncryptedConversationKeyAsync(string userId, byte[] encryptedKey, int keyVersion);

    /// <summary>
    /// Retrieves the encrypted conversation key for a specific user and key version.
    /// Requires: Caller must be the user requesting their own key.
    /// </summary>
    Task<byte[]> GetEncryptedConversationKeyAsync(string userId, int keyVersion);

    /// <summary>
    /// Posts a new encrypted message to the conversation.
    /// Requires: Caller must be a participant and must match senderUserId.
    /// </summary>
    Task<Guid> PostMessageAsync(string senderUserId, PostMessageDto message);

    /// <summary>
    /// Gets messages from the conversation with pagination.
    /// Requires: Caller must be a participant.
    /// </summary>
    Task<List<MessageDto>> GetMessagesAsync(int skip, int take);

    /// <summary>
    /// Gets replies to a specific message (explicit loading).
    /// Requires: Caller must be a participant.
    /// </summary>
    Task<List<MessageDto>> GetMessageRepliesAsync(Guid parentMessageId, int skip, int take);

    /// <summary>
    /// Checks if a user is a participant in this conversation.
    /// Used for authorization checks.
    /// </summary>
    Task<bool> IsParticipantAsync(string userId);

    /// <summary>
    /// Gets the current key version for the conversation.
    /// Used to determine if key rotation is needed.
    /// </summary>
    Task<int> GetCurrentKeyVersionAsync();
}
