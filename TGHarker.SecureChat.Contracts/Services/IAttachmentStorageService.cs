using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Contracts.Services;

public interface IAttachmentStorageService
{
    Task<AttachmentDto> StoreAttachmentAsync(
        Guid conversationId,
        string senderUserId,
        string fileName,
        string contentType,
        string nonce,
        string authTag,
        int keyVersion,
        Stream encryptedStream);

    Task<(Stream Content, AttachmentDto Metadata)?> GetAttachmentAsync(
        Guid conversationId,
        Guid attachmentId);
}
