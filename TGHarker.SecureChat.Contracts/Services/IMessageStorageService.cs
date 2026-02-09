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
    /// [DEPRECATED] This method is no longer used for attachment deletion.
    /// Attachments are now deleted via AttachmentGrain.DeleteAsync() to maintain
    /// consistency with the Orleans grain approach.
    /// Kept for interface compatibility.
    /// </summary>
    [Obsolete("Use AttachmentGrain.DeleteAsync() instead", false)]
    Task DeleteAttachmentsAsync(Guid conversationId, List<Guid> attachmentIds);
}
