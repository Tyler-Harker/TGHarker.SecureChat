using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.Contracts.Services;

namespace TGHarker.SecureChat.WebApi.Services;

public class AttachmentStorageService : IAttachmentStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly ILogger<AttachmentStorageService> _logger;
    private const string ContainerName = "attachments";
    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/gif", "image/webp"
    };

    public AttachmentStorageService(BlobServiceClient blobServiceClient, ILogger<AttachmentStorageService> logger)
    {
        _blobServiceClient = blobServiceClient;
        _logger = logger;
    }

    public async Task<AttachmentDto> StoreAttachmentAsync(
        Guid conversationId, string senderUserId, string fileName,
        string contentType, string nonce, string authTag, int keyVersion,
        Stream encryptedStream)
    {
        if (!AllowedContentTypes.Contains(contentType))
            throw new ArgumentException($"Content type '{contentType}' is not allowed. Only images are supported.");

        if (encryptedStream.Length > MaxFileSizeBytes)
            throw new ArgumentException($"File size exceeds the maximum of {MaxFileSizeBytes / (1024 * 1024)} MB.");

        var attachmentId = Guid.NewGuid();
        var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
        await containerClient.CreateIfNotExistsAsync();

        var blobName = $"{conversationId}/{attachmentId}.bin";
        var blobClient = containerClient.GetBlobClient(blobName);

        var metadata = new Dictionary<string, string>
        {
            ["fileName"] = fileName,
            ["contentType"] = contentType,
            ["senderUserId"] = senderUserId,
            ["nonce"] = nonce,
            ["authTag"] = authTag,
            ["keyVersion"] = keyVersion.ToString(),
            ["uploadedAt"] = DateTime.UtcNow.ToString("o")
        };

        await blobClient.UploadAsync(encryptedStream, new BlobUploadOptions
        {
            Metadata = metadata
        });

        _logger.LogInformation("Stored attachment {AttachmentId} for conversation {ConversationId}",
            attachmentId, conversationId);

        return new AttachmentDto(
            AttachmentId: attachmentId,
            ConversationId: conversationId,
            SenderUserId: senderUserId,
            FileName: fileName,
            ContentType: contentType,
            FileSizeBytes: encryptedStream.Length,
            Nonce: nonce,
            AuthTag: authTag,
            KeyVersion: keyVersion,
            UploadedAt: DateTime.UtcNow
        );
    }

    public async Task<(Stream Content, AttachmentDto Metadata)?> GetAttachmentAsync(
        Guid conversationId, Guid attachmentId)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
        var blobName = $"{conversationId}/{attachmentId}.bin";
        var blobClient = containerClient.GetBlobClient(blobName);

        if (!await blobClient.ExistsAsync())
            return null;

        var properties = await blobClient.GetPropertiesAsync();
        var metadata = properties.Value.Metadata;

        var dto = new AttachmentDto(
            AttachmentId: attachmentId,
            ConversationId: conversationId,
            SenderUserId: metadata.TryGetValue("senderUserId", out var sender) ? sender : "",
            FileName: metadata.TryGetValue("fileName", out var fn) ? fn : "attachment",
            ContentType: metadata.TryGetValue("contentType", out var ct) ? ct : "application/octet-stream",
            FileSizeBytes: properties.Value.ContentLength,
            Nonce: metadata.TryGetValue("nonce", out var n) ? n : "",
            AuthTag: metadata.TryGetValue("authTag", out var at) ? at : "",
            KeyVersion: metadata.TryGetValue("keyVersion", out var kvStr) && int.TryParse(kvStr, out var kv) ? kv : 1,
            UploadedAt: metadata.TryGetValue("uploadedAt", out var dtStr) && DateTime.TryParse(dtStr, out var dt) ? dt : DateTime.UtcNow
        );

        var download = await blobClient.DownloadStreamingAsync();
        return (download.Value.Content, dto);
    }
}
