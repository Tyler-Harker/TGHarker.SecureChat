using Orleans;

namespace TGHarker.SecureChat.Contracts.Models;

[GenerateSerializer]
public record AttachmentDto(
    [property: Id(0)] Guid AttachmentId,
    [property: Id(1)] Guid ConversationId,
    [property: Id(2)] string SenderUserId,
    [property: Id(3)] string FileName,
    [property: Id(4)] string ContentType,
    [property: Id(5)] long FileSizeBytes,
    [property: Id(6)] string Nonce,
    [property: Id(7)] string AuthTag,
    [property: Id(8)] int KeyVersion,
    [property: Id(9)] DateTime UploadedAt
);
