using System.Text.Json;
using Azure.Storage.Blobs;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.Contracts.Services;

namespace TGHarker.SecureChat.Silo.Services;

public class MessageStorageService : IMessageStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly ILogger<MessageStorageService> _logger;
    private const string MessagesContainerName = "messages";

    public MessageStorageService(BlobServiceClient blobServiceClient, ILogger<MessageStorageService> logger)
    {
        _blobServiceClient = blobServiceClient;
        _logger = logger;
    }

    public async Task<Guid> StoreMessageAsync(Guid conversationId, string senderUserId, Guid? parentMessageId, EncryptedMessageDto encryptedContent, Guid? attachmentId = null)
    {
        try
        {
            var messageId = Guid.NewGuid();
            var containerClient = _blobServiceClient.GetBlobContainerClient(MessagesContainerName);
            await containerClient.CreateIfNotExistsAsync();

            // Store message as: messages/{conversationId}/{messageId}.json
            var blobName = $"{conversationId}/{messageId}.json";
            var blobClient = containerClient.GetBlobClient(blobName);

            var message = new MessageDto(
                MessageId: messageId,
                ConversationId: conversationId,
                SenderUserId: senderUserId,
                ParentMessageId: parentMessageId,
                EncryptedContent: encryptedContent,
                CreatedAt: DateTime.UtcNow,
                ReplyIds: new List<Guid>(),
                AttachmentId: attachmentId
            );

            var json = JsonSerializer.Serialize(message);
            await using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));
            await blobClient.UploadAsync(stream, overwrite: false);

            _logger.LogInformation("Stored message {MessageId} for conversation {ConversationId}", messageId, conversationId);
            return messageId;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to store message for conversation {ConversationId}", conversationId);
            throw;
        }
    }

    public async Task<MessageDto?> GetMessageAsync(Guid messageId)
    {
        try
        {
            var containerClient = _blobServiceClient.GetBlobContainerClient(MessagesContainerName);

            // We need to search across conversation folders - this is expensive
            // Better approach: maintain message ID -> conversation ID mapping in grain state
            // For now, this is a placeholder that requires the conversation ID
            throw new NotImplementedException("GetMessageAsync requires conversation ID. Use GetMessagesAsync with a list of IDs instead.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get message {MessageId}", messageId);
            throw;
        }
    }

    public async Task<List<MessageDto>> GetMessagesAsync(List<Guid> messageIds)
    {
        // This method requires conversation context from the caller
        // Messages should be retrieved through ConversationGrain which knows the conversation ID
        throw new NotImplementedException("Use GetMessagesByConversationAsync with conversation ID instead");
    }

    public async Task<List<MessageDto>> GetMessagesByConversationAsync(Guid conversationId, List<Guid> messageIds)
    {
        try
        {
            var containerClient = _blobServiceClient.GetBlobContainerClient(MessagesContainerName);
            var messages = new List<MessageDto>();

            foreach (var messageId in messageIds)
            {
                var blobName = $"{conversationId}/{messageId}.json";
                var blobClient = containerClient.GetBlobClient(blobName);

                if (await blobClient.ExistsAsync())
                {
                    var download = await blobClient.DownloadContentAsync();
                    var json = download.Value.Content.ToString();
                    var message = JsonSerializer.Deserialize<MessageDto>(json);
                    if (message != null)
                    {
                        messages.Add(message);
                    }
                }
            }

            return messages;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get messages for conversation {ConversationId}", conversationId);
            throw;
        }
    }

    public async Task AddReplyToMessageAsync(Guid parentMessageId, Guid replyMessageId)
    {
        // This requires knowing the conversation ID to locate the blob
        // The ConversationGrain should handle this by maintaining reply lists in its state
        // Or we need to store a message ID -> conversation ID index
        _logger.LogInformation("AddReplyToMessageAsync called - reply tracking should be handled in ConversationGrain state");
        await Task.CompletedTask;
    }
}
