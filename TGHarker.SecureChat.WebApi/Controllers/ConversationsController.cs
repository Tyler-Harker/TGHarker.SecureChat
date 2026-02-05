using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ConversationsController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly ILogger<ConversationsController> _logger;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public ConversationsController(
        IClusterClient client,
        ILogger<ConversationsController> logger)
    {
        _client = client;
        _logger = logger;
    }

    /// <summary>
    /// Create a new conversation with specified participants.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<ConversationDto>> CreateConversation([FromBody] CreateConversationRequest request)
    {
        try
        {
            // Verify caller is in the participant list
            if (!request.ParticipantUserIds.Contains(UserId))
            {
                return BadRequest(new { error = "You must be a participant in the conversation" });
            }

            var conversationId = Guid.NewGuid();
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);

            await conversationGrain.CreateAsync(request.ParticipantUserIds, UserId);

            // Store encrypted conversation keys for each participant
            foreach (var (userId, encryptedKey) in request.EncryptedConversationKeys)
            {
                await conversationGrain.StoreEncryptedConversationKeyAsync(userId, encryptedKey, 1);
            }

            var details = await conversationGrain.GetDetailsAsync();
            return Ok(details);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create conversation for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to create conversation" });
        }
    }

    /// <summary>
    /// Get conversation details.
    /// </summary>
    [HttpGet("{conversationId}")]
    public async Task<ActionResult<ConversationDto>> GetConversation(Guid conversationId)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var details = await conversationGrain.GetDetailsAsync();
            return Ok(details);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get conversation {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to get conversation" });
        }
    }

    /// <summary>
    /// Get encrypted conversation key for the current user.
    /// </summary>
    [HttpGet("{conversationId}/keys/{keyVersion}")]
    public async Task<ActionResult<byte[]>> GetConversationKey(Guid conversationId, int keyVersion)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var encryptedKey = await conversationGrain.GetEncryptedConversationKeyAsync(UserId, keyVersion);
            return Ok(new { encryptedKey });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get conversation key for {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to get conversation key" });
        }
    }

    /// <summary>
    /// Store encrypted conversation key for a user (used for key rotation).
    /// </summary>
    [HttpPost("{conversationId}/keys")]
    public async Task<ActionResult> StoreConversationKey(Guid conversationId, [FromBody] StoreKeyRequest request)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            await conversationGrain.StoreEncryptedConversationKeyAsync(request.UserId, request.EncryptedKey, request.KeyVersion);
            return Ok(new { message = "Key stored successfully" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to store conversation key");
            return StatusCode(500, new { error = "Failed to store key" });
        }
    }

    /// <summary>
    /// Post a message to the conversation.
    /// </summary>
    [HttpPost("{conversationId}/messages")]
    public async Task<ActionResult<Guid>> PostMessage(Guid conversationId, [FromBody] PostMessageDto message)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var messageId = await conversationGrain.PostMessageAsync(UserId, message);
            return Ok(new { messageId });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to post message to conversation {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to post message" });
        }
    }

    /// <summary>
    /// Get messages from the conversation with pagination.
    /// </summary>
    [HttpGet("{conversationId}/messages")]
    public async Task<ActionResult<List<MessageDto>>> GetMessages(
        Guid conversationId,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50)
    {
        try
        {
            if (take > 100) take = 100; // Limit max page size

            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var messages = await conversationGrain.GetMessagesAsync(skip, take);
            return Ok(messages);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get messages from conversation {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to get messages" });
        }
    }

    /// <summary>
    /// Get replies to a specific message (explicit loading for threading).
    /// </summary>
    [HttpGet("{conversationId}/messages/{parentMessageId}/replies")]
    public async Task<ActionResult<List<MessageDto>>> GetMessageReplies(
        Guid conversationId,
        Guid parentMessageId,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50)
    {
        try
        {
            if (take > 100) take = 100;

            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var replies = await conversationGrain.GetMessageRepliesAsync(parentMessageId, skip, take);
            return Ok(replies);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get replies for message {MessageId}", parentMessageId);
            return StatusCode(500, new { error = "Failed to get replies" });
        }
    }

    /// <summary>
    /// Add a participant to the conversation.
    /// </summary>
    [HttpPost("{conversationId}/participants")]
    public async Task<ActionResult> AddParticipant(Guid conversationId, [FromBody] AddParticipantRequest request)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            await conversationGrain.AddParticipantAsync(request.UserId);
            return Ok(new { message = "Participant added successfully" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add participant to conversation {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to add participant" });
        }
    }

    /// <summary>
    /// Remove a participant from the conversation.
    /// </summary>
    [HttpDelete("{conversationId}/participants/{userId}")]
    public async Task<ActionResult> RemoveParticipant(Guid conversationId, string userId)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            await conversationGrain.RemoveParticipantAsync(userId);
            return Ok(new { message = "Participant removed successfully" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove participant from conversation {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to remove participant" });
        }
    }
}

public record CreateConversationRequest(
    List<string> ParticipantUserIds,
    Dictionary<string, byte[]> EncryptedConversationKeys
);

public record StoreKeyRequest(string UserId, byte[] EncryptedKey, int KeyVersion);
public record AddParticipantRequest(string UserId);
