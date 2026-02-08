using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Services;

/// <summary>
/// Service for storing and retrieving encrypted messages from Azure Blob Storage.
/// Messages are stored as individual blobs: messages/{conversationId}/{messageId}.json
/// </summary>
public interface IMessageStorageService
{
    /// <summary>
    /// Stores an encrypted message in blob storage.
    /// </summary>
    Task<Guid> StoreMessageAsync(Guid conversationId, string senderUserId, Guid? parentMessageId, EncryptedMessageDto encryptedContent, Guid? attachmentId = null);

    /// <summary>
    /// Retrieves multiple messages by their IDs for a specific conversation.
    /// </summary>
    Task<List<MessageDto>> GetMessagesByConversationAsync(Guid conversationId, List<Guid> messageIds);

    /// <summary>
    /// Deletes multiple message blobs from storage.
    /// Continues deleting remaining messages if individual deletions fail.
    /// </summary>
    Task DeleteMessagesAsync(Guid conversationId, List<Guid> messageIds);

    /// <summary>
    /// Deletes multiple attachment blobs from storage.
    /// Used during retention cleanup to remove attachments associated with expired messages.
    /// </summary>
    Task DeleteAttachmentsAsync(Guid conversationId, List<Guid> attachmentIds);
}
