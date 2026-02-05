using Orleans;
using Orleans.Providers;
using Orleans.Runtime;
using Orleans.Streams;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.Contracts.Services;

namespace TGHarker.SecureChat.Silo.Grains;

[StorageProvider(ProviderName = "AzureBlobStorage")]
public class ConversationGrain : Grain, IConversationGrain
{
    private readonly IPersistentState<ConversationGrainState> _state;
    private readonly IMessageStorageService _messageStorage;
    private readonly ILogger<ConversationGrain> _logger;
    private IAsyncStream<string>? _eventStream;

    public ConversationGrain(
        [PersistentState("conversation", "AzureBlobStorage")] IPersistentState<ConversationGrainState> state,
        IMessageStorageService messageStorage,
        ILogger<ConversationGrain> logger)
    {
        _state = state;
        _messageStorage = messageStorage;
        _logger = logger;
    }

    public override Task OnActivateAsync(CancellationToken cancellationToken)
    {
        // Get the stream for this conversation
        var conversationId = this.GetPrimaryKey();
        var streamProvider = this.GetStreamProvider("ConversationStreamProvider");
        _eventStream = streamProvider.GetStream<string>("ConversationEvents", conversationId);

        return base.OnActivateAsync(cancellationToken);
    }

    private string GetCallingUserId()
    {
        return RequestContext.Get("UserId") as string
            ?? throw new UnauthorizedAccessException("No user context in request");
    }

    private void ValidateParticipantAccess()
    {
        var callingUserId = GetCallingUserId();

        if (!_state.State.ParticipantUserIds.Contains(callingUserId))
        {
            _logger.LogWarning("Unauthorized access attempt: {CallingUser} tried to access conversation {ConversationId}",
                callingUserId, _state.State.ConversationId);
            throw new UnauthorizedAccessException("Not a participant in this conversation");
        }
    }

    public async Task CreateAsync(List<string> participantUserIds, string createdByUserId)
    {
        if (_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation already created");
        }

        var callingUserId = GetCallingUserId();

        // Verify the calling user is in the participant list
        if (!participantUserIds.Contains(callingUserId))
        {
            throw new UnauthorizedAccessException("Caller must be a participant in the conversation");
        }

        // Verify createdByUserId matches calling user
        if (callingUserId != createdByUserId)
        {
            throw new UnauthorizedAccessException("Caller must be the creator");
        }

        // Require at least 2 participants
        if (participantUserIds.Count < 2)
        {
            throw new InvalidOperationException("Conversation must have at least 2 participants");
        }

        var conversationId = this.GetPrimaryKey();
        _state.State.ConversationId = conversationId;
        _state.State.ParticipantUserIds = participantUserIds.ToHashSet();
        _state.State.CreatedByUserId = createdByUserId;
        _state.State.CreatedAt = DateTime.UtcNow;
        _state.State.LastActivityAt = DateTime.UtcNow;
        _state.State.CurrentKeyVersion = 1;
        _state.State.IsCreated = true;

        await _state.WriteStateAsync();

        // Add conversation to each participant's UserGrain
        foreach (var userId in participantUserIds)
        {
            var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
            await userGrain.AddConversationAsync(conversationId);
        }

        // TODO: Index conversation for search when TGHarker.Orleans.Search is configured
        // await _searchIndexer.IndexAsync("conversations", conversationId.ToString(), new Dictionary<string, object>
        // {
        //     ["participantCount"] = participantUserIds.Count,
        //     ["createdBy"] = createdByUserId,
        //     ["createdAt"] = _state.State.CreatedAt
        // });

        _logger.LogInformation("Created conversation {ConversationId} with {ParticipantCount} participants",
            conversationId, participantUserIds.Count);
    }

    public Task<ConversationDto> GetDetailsAsync()
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        return Task.FromResult(new ConversationDto(
            ConversationId: _state.State.ConversationId,
            ParticipantUserIds: _state.State.ParticipantUserIds.ToList(),
            CreatedByUserId: _state.State.CreatedByUserId,
            CreatedAt: _state.State.CreatedAt,
            LastActivityAt: _state.State.LastActivityAt,
            MessageCount: _state.State.MessageCount,
            CurrentKeyVersion: _state.State.CurrentKeyVersion
        ));
    }

    public async Task AddParticipantAsync(string userId)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        if (_state.State.ParticipantUserIds.Add(userId))
        {
            await _state.WriteStateAsync();

            // Add conversation to new participant's UserGrain
            var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
            await userGrain.AddConversationAsync(_state.State.ConversationId);

            _logger.LogInformation("Added participant {UserId} to conversation {ConversationId}",
                userId, _state.State.ConversationId);
        }
    }

    public async Task RemoveParticipantAsync(string userId)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        var callingUserId = GetCallingUserId();

        // Can only remove yourself or (if you're the creator) remove others
        if (callingUserId != userId && callingUserId != _state.State.CreatedByUserId)
        {
            throw new UnauthorizedAccessException("Can only remove yourself or (if creator) remove others");
        }

        if (_state.State.ParticipantUserIds.Remove(userId))
        {
            // Remove encrypted keys for this user
            _state.State.EncryptedKeys.Remove(userId);

            await _state.WriteStateAsync();

            // Remove conversation from participant's UserGrain
            var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
            await userGrain.RemoveConversationAsync(_state.State.ConversationId);

            _logger.LogInformation("Removed participant {UserId} from conversation {ConversationId}",
                userId, _state.State.ConversationId);
        }
    }

    public async Task StoreEncryptedConversationKeyAsync(string userId, byte[] encryptedKey, int keyVersion)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        // Verify the userId is a participant
        if (!_state.State.ParticipantUserIds.Contains(userId))
        {
            throw new InvalidOperationException($"User {userId} is not a participant");
        }

        if (!_state.State.EncryptedKeys.ContainsKey(userId))
        {
            _state.State.EncryptedKeys[userId] = new Dictionary<int, byte[]>();
        }

        _state.State.EncryptedKeys[userId][keyVersion] = encryptedKey;
        await _state.WriteStateAsync();

        _logger.LogInformation("Stored encrypted conversation key for user {UserId}, version {KeyVersion}",
            userId, keyVersion);
    }

    public Task<byte[]> GetEncryptedConversationKeyAsync(string userId, int keyVersion)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        var callingUserId = GetCallingUserId();

        // Can only get your own encrypted key
        if (callingUserId != userId)
        {
            throw new UnauthorizedAccessException("Can only retrieve your own encrypted conversation key");
        }

        if (!_state.State.EncryptedKeys.TryGetValue(userId, out var userKeys))
        {
            throw new InvalidOperationException($"No encrypted keys found for user {userId}");
        }

        if (!userKeys.TryGetValue(keyVersion, out var encryptedKey))
        {
            throw new InvalidOperationException($"No encrypted key found for version {keyVersion}");
        }

        return Task.FromResult(encryptedKey);
    }

    public async Task<MessageDto> PostMessageAsync(string senderUserId, PostMessageDto message)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        var callingUserId = GetCallingUserId();

        // Verify sender matches calling user
        if (callingUserId != senderUserId)
        {
            throw new UnauthorizedAccessException("Cannot send message as another user");
        }

        // Store encrypted message in blob storage
        var messageId = await _messageStorage.StoreMessageAsync(
            _state.State.ConversationId,
            senderUserId,
            message.ParentMessageId,
            message.EncryptedContent
        );

        // Update conversation state
        _state.State.MessageIds.Add(messageId);
        _state.State.MessageCount++;
        _state.State.LastActivityAt = DateTime.UtcNow;

        // Track reply relationship
        if (message.ParentMessageId.HasValue)
        {
            if (!_state.State.MessageReplies.ContainsKey(message.ParentMessageId.Value))
            {
                _state.State.MessageReplies[message.ParentMessageId.Value] = new List<Guid>();
            }
            _state.State.MessageReplies[message.ParentMessageId.Value].Add(messageId);
        }

        // Check if key rotation is needed (every 1000 messages)
        if (_state.State.MessageCount % 1000 == 0)
        {
            _state.State.CurrentKeyVersion++;
            _logger.LogInformation("Key rotation triggered for conversation {ConversationId}, new version {KeyVersion}",
                _state.State.ConversationId, _state.State.CurrentKeyVersion);
        }

        await _state.WriteStateAsync();

        _logger.LogInformation("Posted message {MessageId} to conversation {ConversationId}",
            messageId, _state.State.ConversationId);

        // Return the full message DTO
        var messageDto = new MessageDto(
            messageId,
            _state.State.ConversationId,
            senderUserId,
            message.ParentMessageId,
            message.EncryptedContent,
            DateTime.UtcNow,
            new List<Guid>() // New message has no replies yet
        );

        // Publish message event to stream
        if (_eventStream != null)
        {
            var eventJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "message",
                message = new
                {
                    messageId = messageDto.MessageId.ToString(),
                    conversationId = messageDto.ConversationId.ToString(),
                    senderId = messageDto.SenderUserId,
                    ciphertext = Convert.ToBase64String(messageDto.EncryptedContent.Ciphertext),
                    nonce = Convert.ToBase64String(messageDto.EncryptedContent.Nonce),
                    authTag = Convert.ToBase64String(messageDto.EncryptedContent.AuthTag),
                    timestamp = messageDto.CreatedAt.ToString("o"),
                    keyRotationVersion = messageDto.EncryptedContent.KeyVersion,
                    parentMessageId = messageDto.ParentMessageId?.ToString()
                }
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });

            await _eventStream.OnNextAsync(eventJson);
        }

        // Send push notifications to all participants except the sender
        foreach (var participantId in _state.State.ParticipantUserIds)
        {
            if (participantId == senderUserId) continue;

            try
            {
                var pushGrain = GrainFactory.GetGrain<IPushNotificationGrain>(participantId);
                pushGrain.SendNotificationAsync(new PushNotificationPayload(
                    Type: "new_message",
                    Title: "New Message",
                    Body: "You received a new message",
                    Url: $"/chats?conversation={_state.State.ConversationId}",
                    ConversationId: _state.State.ConversationId.ToString(),
                    SenderUserId: senderUserId,
                    Tag: $"conversation-{_state.State.ConversationId}"
                )).Ignore();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send push notification to user {UserId}", participantId);
            }
        }

        return messageDto;
    }

    public async Task<List<MessageDto>> GetMessagesAsync(int skip, int take)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        // Get paginated message IDs
        var messageIds = _state.State.MessageIds
            .Skip(skip)
            .Take(take)
            .ToList();

        // Retrieve messages from blob storage
        return await _messageStorage.GetMessagesByConversationAsync(_state.State.ConversationId, messageIds);
    }

    public async Task<List<MessageDto>> GetMessageRepliesAsync(Guid parentMessageId, int skip, int take)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        // Get reply IDs for the parent message
        if (!_state.State.MessageReplies.TryGetValue(parentMessageId, out var replyIds))
        {
            return new List<MessageDto>();
        }

        // Paginate replies
        var paginatedReplyIds = replyIds
            .Skip(skip)
            .Take(take)
            .ToList();

        // Retrieve replies from blob storage
        return await _messageStorage.GetMessagesByConversationAsync(_state.State.ConversationId, paginatedReplyIds);
    }

    public Task<bool> IsParticipantAsync(string userId)
    {
        if (!_state.State.IsCreated)
        {
            return Task.FromResult(false);
        }

        return Task.FromResult(_state.State.ParticipantUserIds.Contains(userId));
    }

    public Task<int> GetCurrentKeyVersionAsync()
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        return Task.FromResult(_state.State.CurrentKeyVersion);
    }

    public async Task MarkMessageAsReadAsync(Guid messageId, string userId)
    {
        ValidateParticipantAccess();

        var callingUserId = GetCallingUserId();
        if (callingUserId != userId)
        {
            throw new UnauthorizedAccessException("Can only mark messages as read for yourself");
        }

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        // Initialize the set if it doesn't exist
        if (!_state.State.MessageReadReceipts.ContainsKey(messageId))
        {
            _state.State.MessageReadReceipts[messageId] = new HashSet<string>();
        }

        // Add the user to the read receipts
        var wasAdded = _state.State.MessageReadReceipts[messageId].Add(userId);

        // Only persist if something changed
        if (wasAdded)
        {
            await _state.WriteStateAsync();

            // Publish read receipt event to stream
            if (_eventStream != null)
            {
                var eventJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    type = "read_receipt",
                    messageId = messageId.ToString(),
                    userId
                }, new System.Text.Json.JsonSerializerOptions
                {
                    PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
                });

                await _eventStream.OnNextAsync(eventJson);
            }
        }
    }

    public Task<List<string>> GetMessageReadReceiptsAsync(Guid messageId)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        if (_state.State.MessageReadReceipts.TryGetValue(messageId, out var readers))
        {
            return Task.FromResult(readers.ToList());
        }

        return Task.FromResult(new List<string>());
    }

    public async Task DeleteConversationAsync()
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        // Get all participants before clearing state
        var participants = _state.State.ParticipantUserIds.ToList();
        var conversationId = this.GetPrimaryKey();

        // Publish deletion event to stream before clearing state
        if (_eventStream != null)
        {
            var eventJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "conversation_deleted",
                conversationId = conversationId.ToString()
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });

            await _eventStream.OnNextAsync(eventJson);
        }

        // Clear the conversation state
        await _state.ClearStateAsync();

        // Remove this conversation from each participant's conversation list
        foreach (var userId in participants)
        {
            var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
            await userGrain.RemoveConversationAsync(conversationId);
        }

        // Deactivate the grain
        DeactivateOnIdle();
    }
}
