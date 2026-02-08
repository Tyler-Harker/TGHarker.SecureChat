using Orleans.Runtime;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Silo.Grains;

public class AttachmentGrain : Grain, IAttachmentGrain
{
    private readonly IPersistentState<AttachmentGrainState> _state;
    private readonly ILogger<AttachmentGrain> _logger;
    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/gif", "image/webp"
    };

    public AttachmentGrain(
        [PersistentState("attachmentState", "attachments")] IPersistentState<AttachmentGrainState> state,
        ILogger<AttachmentGrain> logger)
    {
        _state = state;
        _logger = logger;
    }

    public async Task<AttachmentDto> StoreAsync(
        Guid conversationId,
        string senderUserId,
        string fileName,
        string contentType,
        string nonce,
        string authTag,
        int keyVersion,
        byte[] encryptedData)
    {
        if (!AllowedContentTypes.Contains(contentType))
            throw new ArgumentException($"Content type '{contentType}' is not allowed. Only images are supported.");

        if (encryptedData.Length > MaxFileSizeBytes)
            throw new ArgumentException($"File size exceeds the maximum of {MaxFileSizeBytes / (1024 * 1024)} MB.");

        var attachmentId = this.GetPrimaryKey(out _);

        _state.State.AttachmentId = attachmentId;
        _state.State.ConversationId = conversationId;
        _state.State.SenderUserId = senderUserId;
        _state.State.FileName = fileName;
        _state.State.ContentType = contentType;
        _state.State.FileSizeBytes = encryptedData.Length;
        _state.State.Nonce = nonce;
        _state.State.AuthTag = authTag;
        _state.State.KeyVersion = keyVersion;
        _state.State.UploadedAt = DateTime.UtcNow;
        _state.State.Data = encryptedData;
        _state.State.IsStored = true;

        await _state.WriteStateAsync();

        _logger.LogInformation("Stored attachment {AttachmentId} ({Size} bytes) for conversation {ConversationId}",
            attachmentId, encryptedData.Length, conversationId);

        return new AttachmentDto(
            AttachmentId: attachmentId,
            ConversationId: conversationId,
            SenderUserId: senderUserId,
            FileName: fileName,
            ContentType: contentType,
            FileSizeBytes: encryptedData.Length,
            Nonce: nonce,
            AuthTag: authTag,
            KeyVersion: keyVersion,
            UploadedAt: _state.State.UploadedAt
        );
    }

    public Task<(byte[] Data, AttachmentDto Metadata)?> GetAsync()
    {
        if (!_state.State.IsStored)
            return Task.FromResult<(byte[], AttachmentDto)?>(null);

        var dto = new AttachmentDto(
            AttachmentId: _state.State.AttachmentId,
            ConversationId: _state.State.ConversationId,
            SenderUserId: _state.State.SenderUserId,
            FileName: _state.State.FileName,
            ContentType: _state.State.ContentType,
            FileSizeBytes: _state.State.FileSizeBytes,
            Nonce: _state.State.Nonce,
            AuthTag: _state.State.AuthTag,
            KeyVersion: _state.State.KeyVersion,
            UploadedAt: _state.State.UploadedAt
        );

        return Task.FromResult<(byte[], AttachmentDto)?>(((_state.State.Data, dto)));
    }

    public Task<bool> ExistsAsync()
    {
        return Task.FromResult(_state.State.IsStored);
    }
}
