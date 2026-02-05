using Orleans;
using Orleans.Providers;
using Orleans.Runtime;
using Orleans.Streams;
using System.Text.Json;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Silo.Grains;

[StorageProvider(ProviderName = "AzureBlobStorage")]
public class ContactRequestGrain : Grain, IContactRequestGrain
{
    private readonly IPersistentState<ContactRequestGrainState> _state;
    private readonly ILogger<ContactRequestGrain> _logger;

    public ContactRequestGrain(
        [PersistentState("contactRequest", "AzureBlobStorage")] IPersistentState<ContactRequestGrainState> state,
        ILogger<ContactRequestGrain> logger)
    {
        _state = state;
        _logger = logger;
    }

    private string GetCallingUserId()
    {
        return RequestContext.Get("UserId") as string
            ?? throw new UnauthorizedAccessException("No user context in request");
    }

    public async Task CreateRequestAsync(string fromUserId, string toUserId, string fromUserDisplayName, string fromUserEmail)
    {
        if (_state.State.RequestId != string.Empty)
        {
            throw new InvalidOperationException("Contact request already exists");
        }

        var callingUserId = GetCallingUserId();
        if (callingUserId != fromUserId)
        {
            throw new UnauthorizedAccessException("Caller must be the sender");
        }

        var requestId = this.GetPrimaryKeyString();
        _state.State.RequestId = requestId;
        _state.State.FromUserId = fromUserId;
        _state.State.ToUserId = toUserId;
        _state.State.FromUserDisplayName = fromUserDisplayName;
        _state.State.FromUserEmail = fromUserEmail;
        _state.State.Status = ContactRequestStatus.Pending;
        _state.State.CreatedAt = DateTime.UtcNow;

        await _state.WriteStateAsync();

        // Add request to both users' states
        var fromUserGrain = GrainFactory.GetGrain<IUserGrain>(fromUserId);
        var toUserGrain = GrainFactory.GetGrain<IUserGrain>(toUserId);

        await fromUserGrain.AddSentContactRequestAsync(requestId, toUserId);
        await toUserGrain.AddReceivedContactRequestAsync(requestId, fromUserId);

        // Publish SSE event to recipient via their conversations
        await PublishContactRequestEvent(toUserId, new ContactRequestDto(
            RequestId: requestId,
            FromUserId: fromUserId,
            ToUserId: toUserId,
            FromUserDisplayName: fromUserDisplayName,
            FromUserEmail: fromUserEmail,
            Status: ContactRequestStatus.Pending,
            CreatedAt: _state.State.CreatedAt
        ));

        _logger.LogInformation("Contact request {RequestId} created from {FromUser} to {ToUser}",
            requestId, fromUserId, toUserId);
    }

    public Task<ContactRequestDto?> GetRequestAsync()
    {
        if (_state.State.RequestId == string.Empty)
        {
            return Task.FromResult<ContactRequestDto?>(null);
        }

        var dto = new ContactRequestDto(
            RequestId: _state.State.RequestId,
            FromUserId: _state.State.FromUserId,
            ToUserId: _state.State.ToUserId,
            FromUserDisplayName: _state.State.FromUserDisplayName,
            FromUserEmail: _state.State.FromUserEmail,
            Status: _state.State.Status,
            CreatedAt: _state.State.CreatedAt
        );

        return Task.FromResult<ContactRequestDto?>(dto);
    }

    public async Task AcceptRequestAsync()
    {
        if (_state.State.RequestId == string.Empty)
        {
            throw new InvalidOperationException("Contact request does not exist");
        }

        var callingUserId = GetCallingUserId();
        if (callingUserId != _state.State.ToUserId)
        {
            throw new UnauthorizedAccessException("Only the recipient can accept the request");
        }

        if (_state.State.Status != ContactRequestStatus.Pending)
        {
            throw new InvalidOperationException("Request is no longer pending");
        }

        _state.State.Status = ContactRequestStatus.Accepted;
        _state.State.RespondedAt = DateTime.UtcNow;
        await _state.WriteStateAsync();

        // Add both users to each other's contacts
        var fromUserGrain = GrainFactory.GetGrain<IUserGrain>(_state.State.FromUserId);
        var toUserGrain = GrainFactory.GetGrain<IUserGrain>(_state.State.ToUserId);

        await fromUserGrain.AddContactAsync(_state.State.ToUserId);
        await toUserGrain.AddContactAsync(_state.State.FromUserId);

        // Remove from pending requests
        await fromUserGrain.RemoveContactRequestAsync(_state.State.RequestId);
        await toUserGrain.RemoveContactRequestAsync(_state.State.RequestId);

        // Get contact info for both users
        var toUserContact = await toUserGrain.GetContactInfoAsync();
        var fromUserContact = await fromUserGrain.GetContactInfoAsync();

        // Notify sender that request was accepted
        if (fromUserContact != null)
        {
            await PublishContactRequestAcceptedEvent(_state.State.FromUserId, toUserContact);
        }

        // Notify recipient (implicit - they already have the contact info)
        if (toUserContact != null)
        {
            await PublishContactRequestAcceptedEvent(_state.State.ToUserId, fromUserContact);
        }

        _logger.LogInformation("Contact request {RequestId} accepted", _state.State.RequestId);
    }

    public async Task DeclineRequestAsync()
    {
        if (_state.State.RequestId == string.Empty)
        {
            throw new InvalidOperationException("Contact request does not exist");
        }

        var callingUserId = GetCallingUserId();
        if (callingUserId != _state.State.ToUserId)
        {
            throw new UnauthorizedAccessException("Only the recipient can decline the request");
        }

        if (_state.State.Status != ContactRequestStatus.Pending)
        {
            throw new InvalidOperationException("Request is no longer pending");
        }

        _state.State.Status = ContactRequestStatus.Declined;
        _state.State.RespondedAt = DateTime.UtcNow;
        await _state.WriteStateAsync();

        // Remove from pending requests
        var fromUserGrain = GrainFactory.GetGrain<IUserGrain>(_state.State.FromUserId);
        var toUserGrain = GrainFactory.GetGrain<IUserGrain>(_state.State.ToUserId);

        await fromUserGrain.RemoveContactRequestAsync(_state.State.RequestId);
        await toUserGrain.RemoveContactRequestAsync(_state.State.RequestId);

        // Notify sender that request was declined
        await PublishContactRequestDeclinedEvent(_state.State.FromUserId, _state.State.ToUserId);

        _logger.LogInformation("Contact request {RequestId} declined", _state.State.RequestId);
    }

    public Task<bool> IsPendingAsync()
    {
        return Task.FromResult(_state.State.Status == ContactRequestStatus.Pending);
    }

    private async Task PublishContactRequestEvent(string userId, ContactRequestDto request)
    {
        try
        {
            // Get all conversations for the user
            var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
            var conversationIds = await userGrain.GetConversationIdsAsync();

            // Publish to all their conversation streams
            var streamProvider = this.GetStreamProvider("ConversationStreamProvider");
            foreach (var conversationId in conversationIds)
            {
                var stream = streamProvider.GetStream<string>("ConversationEvents", conversationId);
                var eventData = JsonSerializer.Serialize(new
                {
                    type = "contact_request",
                    request
                });
                await stream.OnNextAsync(eventData);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish contact request event");
        }
    }

    private async Task PublishContactRequestAcceptedEvent(string userId, ContactDto contact)
    {
        try
        {
            var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
            var conversationIds = await userGrain.GetConversationIdsAsync();

            var streamProvider = this.GetStreamProvider("ConversationStreamProvider");
            foreach (var conversationId in conversationIds)
            {
                var stream = streamProvider.GetStream<string>("ConversationEvents", conversationId);
                var eventData = JsonSerializer.Serialize(new
                {
                    type = "contact_request_accepted",
                    contact
                });
                await stream.OnNextAsync(eventData);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish contact request accepted event");
        }
    }

    private async Task PublishContactRequestDeclinedEvent(string userId, string declinedByUserId)
    {
        try
        {
            var userGrain = GrainFactory.GetGrain<IUserGrain>(userId);
            var conversationIds = await userGrain.GetConversationIdsAsync();

            var streamProvider = this.GetStreamProvider("ConversationStreamProvider");
            foreach (var conversationId in conversationIds)
            {
                var stream = streamProvider.GetStream<string>("ConversationEvents", conversationId);
                var eventData = JsonSerializer.Serialize(new
                {
                    type = "contact_request_declined",
                    userId = declinedByUserId
                });
                await stream.OnNextAsync(eventData);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish contact request declined event");
        }
    }
}
