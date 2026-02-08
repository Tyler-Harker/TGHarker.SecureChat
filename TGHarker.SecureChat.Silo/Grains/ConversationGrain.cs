using Orleans;
using Orleans.Providers;
using Orleans.Runtime;
using Orleans.Streams;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.Contracts.Services;

namespace TGHarker.SecureChat.Silo.Grains;

[StorageProvider(ProviderName = "AzureBlobStorage")]
public class ConversationGrain : Grain, IConversationGrain, IRemindable
{
    private readonly IPersistentState<ConversationGrainState> _state;
    private readonly IMessageStorageService _messageStorage;
    private readonly ILogger<ConversationGrain> _logger;
    private IAsyncStream<string>? _eventStream;
    private const string RetentionReminderName = "MessageRetentionCleanup";

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

    public async Task CreateAsync(List<string> participantUserIds, string createdByUserId, RetentionPeriod retentionPolicy = RetentionPeriod.SevenDays)
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
        _state.State.RetentionPolicy = retentionPolicy;
        _state.State.IsCreated = true;

        await _state.WriteStateAsync();

        // Register reminder for periodic message retention cleanup
        await this.RegisterOrUpdateReminder(
            RetentionReminderName,
            dueTime: TimeSpan.FromHours(1),
            period: TimeSpan.FromHours(1)
        );

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

        // Broadcast conversation_created event to all participants' existing conversation streams
        var conversationDetails = new ConversationDto(
            ConversationId: conversationId,
            ParticipantUserIds: participantUserIds,
            CreatedByUserId: createdByUserId,
            CreatedAt: _state.State.CreatedAt,
            LastActivityAt: _state.State.LastActivityAt,
            MessageCount: 0,
            CurrentKeyVersion: _state.State.CurrentKeyVersion,
            RetentionPolicy: _state.State.RetentionPolicy,
            Name: null
        );

        var streamProvider = this.GetStreamProvider("ConversationStreamProvider");
        var eventJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            type = "conversation_created",
            conversation = conversationDetails
        }, new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
        });

        foreach (var userId in participantUserIds)
        {
            try
            {
                // Publish to user-level stream (received even without a conversation open)
                var userStream = streamProvider.GetStream<string>(StreamId.Create("UserEvents", userId));
                await userStream.OnNextAsync(eventJson);

                // Also publish to existing conversation streams for in-conversation SSE listeners
                var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
                var userConversationIds = await userGrain.GetConversationIdsAsync();

                foreach (var userConvId in userConversationIds)
                {
                    if (userConvId == conversationId) continue;

                    var stream = streamProvider.GetStream<string>(StreamId.Create("ConversationEvents", userConvId));
                    await stream.OnNextAsync(eventJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to publish conversation_created event to user {UserId}", userId);
            }
        }
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
            CurrentKeyVersion: _state.State.CurrentKeyVersion,
            RetentionPolicy: _state.State.RetentionPolicy,
            Name: _state.State.Name
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
            message.EncryptedContent,
            message.AttachmentId
        );

        // Update conversation state
        var now = DateTime.UtcNow;
        _state.State.MessageIds.Add(messageId);
        _state.State.MessageTimestamps[messageId] = now;
        _state.State.MessageCount++;
        _state.State.LastActivityAt = now;

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
            new List<Guid>(), // New message has no replies yet
            message.AttachmentId
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
                    parentMessageId = messageDto.ParentMessageId?.ToString(),
                    attachmentId = messageDto.AttachmentId?.ToString()
                }
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });

            await _eventStream.OnNextAsync(eventJson);
        }

        // Broadcast lightweight new_message_indicator to other conversation streams
        // so participants watching a different conversation see the unread badge
        var indicatorJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            type = "new_message_indicator",
            conversationId = _state.State.ConversationId.ToString()
        }, new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
        });

        var indicatorStreamProvider = this.GetStreamProvider("ConversationStreamProvider");
        foreach (var participantId in _state.State.ParticipantUserIds)
        {
            try
            {
                // Publish to user-level stream so sidebar message count updates for all participants
                var userStream = indicatorStreamProvider.GetStream<string>(StreamId.Create("UserEvents", participantId));
                await userStream.OnNextAsync(indicatorJson);

                // Also publish to existing conversation streams for in-conversation listeners
                var userGrain = GrainFactory.GetGrain<IUserGrain>(participantId);
                var userConvIds = await userGrain.GetConversationIdsAsync();

                foreach (var convId in userConvIds)
                {
                    if (convId == _state.State.ConversationId) continue;
                    var stream = indicatorStreamProvider.GetStream<string>(StreamId.Create("ConversationEvents", convId));
                    await stream.OnNextAsync(indicatorJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to broadcast new_message_indicator to user {UserId}", participantId);
            }
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

        // Paginate from the end (newest first): skip=0 returns most recent messages
        // Messages are returned in chronological order within the batch
        var total = _state.State.MessageIds.Count;
        var startIndex = Math.Max(0, total - skip - take);
        var count = Math.Min(take, total - skip);
        if (count <= 0)
        {
            return new List<MessageDto>();
        }

        var messageIds = _state.State.MessageIds
            .Skip(startIndex)
            .Take(count)
            .ToList();

        // Retrieve messages from blob storage
        var messages = await _messageStorage.GetMessagesByConversationAsync(_state.State.ConversationId, messageIds);
        return AttachReactions(messages);
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
        var messages = await _messageStorage.GetMessagesByConversationAsync(_state.State.ConversationId, paginatedReplyIds);
        return AttachReactions(messages);
    }

    private List<MessageDto> AttachReactions(List<MessageDto> messages)
    {
        return messages.Select(m =>
        {
            if (_state.State.MessageReactions.TryGetValue(m.MessageId, out var reactions) && reactions.Count > 0)
            {
                var converted = reactions.ToDictionary(
                    kvp => kvp.Key,
                    kvp => kvp.Value.ToList()
                );
                return m with { Reactions = converted };
            }
            return m;
        }).ToList();
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

    public async Task<bool> ToggleReactionAsync(Guid messageId, string userId, string emoji)
    {
        ValidateParticipantAccess();

        var callingUserId = GetCallingUserId();
        if (callingUserId != userId)
        {
            throw new UnauthorizedAccessException("Can only toggle reactions for yourself");
        }

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        if (!_state.State.MessageReactions.ContainsKey(messageId))
        {
            _state.State.MessageReactions[messageId] = new Dictionary<string, HashSet<string>>();
        }

        if (!_state.State.MessageReactions[messageId].ContainsKey(emoji))
        {
            _state.State.MessageReactions[messageId][emoji] = new HashSet<string>();
        }

        bool wasAdded;
        if (_state.State.MessageReactions[messageId][emoji].Contains(userId))
        {
            _state.State.MessageReactions[messageId][emoji].Remove(userId);
            wasAdded = false;

            if (_state.State.MessageReactions[messageId][emoji].Count == 0)
                _state.State.MessageReactions[messageId].Remove(emoji);
            if (_state.State.MessageReactions[messageId].Count == 0)
                _state.State.MessageReactions.Remove(messageId);
        }
        else
        {
            _state.State.MessageReactions[messageId][emoji].Add(userId);
            wasAdded = true;
        }

        await _state.WriteStateAsync();

        if (_eventStream != null)
        {
            var eventJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = wasAdded ? "reaction_added" : "reaction_removed",
                messageId = messageId.ToString(),
                userId,
                emoji
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });

            await _eventStream.OnNextAsync(eventJson);
        }

        return wasAdded;
    }

    public Task<Dictionary<string, List<string>>> GetMessageReactionsAsync(Guid messageId)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        if (_state.State.MessageReactions.TryGetValue(messageId, out var reactions))
        {
            return Task.FromResult(reactions.ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value.ToList()));
        }

        return Task.FromResult(new Dictionary<string, List<string>>());
    }

    public async Task ReceiveReminder(string reminderName, TickStatus status)
    {
        if (reminderName != RetentionReminderName) return;
        if (!_state.State.IsCreated) return;

        var retentionHours = (int)_state.State.RetentionPolicy;
        var cutoff = DateTime.UtcNow.AddHours(-retentionHours);

        var expiredIds = new List<Guid>();

        // MessageIds is chronological — scan from oldest and stop at first non-expired
        foreach (var messageId in _state.State.MessageIds)
        {
            if (_state.State.MessageTimestamps.TryGetValue(messageId, out var createdAt))
            {
                if (createdAt < cutoff)
                {
                    expiredIds.Add(messageId);
                }
                else
                {
                    break;
                }
            }
            else
            {
                // Pre-migration messages without timestamps are skipped
                continue;
            }
        }

        if (expiredIds.Count == 0) return;

        _logger.LogInformation(
            "Retention cleanup: removing {Count} expired messages from conversation {ConversationId}",
            expiredIds.Count, _state.State.ConversationId);

        // Delete message blobs from storage
        await _messageStorage.DeleteMessagesAsync(_state.State.ConversationId, expiredIds);

        // Clean up all grain state references
        var expiredSet = expiredIds.ToHashSet();
        _state.State.MessageIds.RemoveAll(id => expiredSet.Contains(id));
        foreach (var id in expiredIds)
        {
            _state.State.MessageTimestamps.Remove(id);
            _state.State.MessageReadReceipts.Remove(id);
            _state.State.MessageReactions.Remove(id);
            _state.State.MessageReplies.Remove(id);

            // Remove from parent reply lists
            foreach (var replyList in _state.State.MessageReplies.Values)
            {
                replyList.Remove(id);
            }
        }

        _state.State.MessageCount = _state.State.MessageIds.Count;
        await _state.WriteStateAsync();

        // Notify connected clients so they can remove expired messages from the UI
        if (_eventStream != null)
        {
            var eventJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "messages_expired",
                conversationId = _state.State.ConversationId.ToString(),
                expiredMessageIds = expiredIds.Select(id => id.ToString()).ToList(),
                count = expiredIds.Count
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });

            await _eventStream.OnNextAsync(eventJson);
        }
    }

    public async Task RenameAsync(string? name)
    {
        ValidateParticipantAccess();

        if (!_state.State.IsCreated)
        {
            throw new InvalidOperationException("Conversation not created");
        }

        var trimmedName = string.IsNullOrWhiteSpace(name) ? null : name.Trim();

        if (trimmedName != null && trimmedName.Length > 100)
        {
            throw new InvalidOperationException("Conversation name must be 100 characters or less");
        }

        _state.State.Name = trimmedName;
        await _state.WriteStateAsync();

        var callingUserId = GetCallingUserId();

        _logger.LogInformation("Conversation {ConversationId} renamed by {UserId}",
            _state.State.ConversationId, callingUserId);

        var eventJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            type = "conversation_renamed",
            conversationId = _state.State.ConversationId.ToString(),
            name = trimmedName,
            renamedByUserId = callingUserId
        }, new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
        });

        // Publish to per-conversation stream
        if (_eventStream != null)
        {
            await _eventStream.OnNextAsync(eventJson);
        }

        // Publish to user-level streams so sidebar updates for all participants
        var streamProvider = this.GetStreamProvider("ConversationStreamProvider");
        foreach (var participantId in _state.State.ParticipantUserIds)
        {
            try
            {
                var userStream = streamProvider.GetStream<string>(StreamId.Create("UserEvents", participantId));
                await userStream.OnNextAsync(eventJson);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to publish conversation_renamed event to user {UserId}", participantId);
            }
        }
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

        var eventJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            type = "conversation_deleted",
            conversationId = conversationId.ToString()
        }, new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
        });

        // Broadcast deletion event to ALL conversation streams for each participant
        // so they receive it regardless of which conversation they're currently watching
        var streamProvider = this.GetStreamProvider("ConversationStreamProvider");
        foreach (var userId in participants)
        {
            try
            {
                var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
                var userConversationIds = await userGrain.GetConversationIdsAsync();

                foreach (var userConvId in userConversationIds)
                {
                    var stream = streamProvider.GetStream<string>("ConversationEvents", userConvId);
                    await stream.OnNextAsync(eventJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to publish conversation_deleted event to user {UserId}", userId);
            }
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
