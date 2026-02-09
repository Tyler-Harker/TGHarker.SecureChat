using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Grains;

public interface IAttachmentGrain : IGrainWithGuidCompoundKey
{
    /// <summary>
    /// Store an encrypted attachment with metadata.
    /// </summary>
    Task<AttachmentDto> StoreAsync(
        Guid conversationId,
        string senderUserId,
        string fileName,
        string contentType,
        string nonce,
        string authTag,
        int keyVersion,
        byte[] encryptedData);

    /// <summary>
    /// Retrieve attachment data and metadata.
    /// Returns null if not found.
    /// </summary>
    Task<(byte[] Data, AttachmentDto Metadata)?> GetAsync();

    /// <summary>
    /// Check if this attachment exists.
    /// </summary>
    Task<bool> ExistsAsync();

    /// <summary>
    /// Delete this attachment and its data.
    /// Used during retention cleanup.
    /// </summary>
    Task DeleteAsync();
}
