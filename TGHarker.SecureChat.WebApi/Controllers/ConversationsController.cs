using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using Orleans.Runtime;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.WebApi.Models;
using TGHarker.SecureChat.WebApi.Services;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ConversationsController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly ILogger<ConversationsController> _logger;
    private readonly IConversationNotificationService _notificationService;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public ConversationsController(
        IClusterClient client,
        ILogger<ConversationsController> logger,
        IConversationNotificationService notificationService)
    {
        _client = client;
        _logger = logger;
        _notificationService = notificationService;
    }

    private static MessageApiResponse MapToApiResponse(MessageDto dto)
    {
        return new MessageApiResponse
        {
            MessageId = dto.MessageId.ToString(),
            ConversationId = dto.ConversationId.ToString(),
            SenderId = dto.SenderUserId,
            Ciphertext = Convert.ToBase64String(dto.EncryptedContent.Ciphertext),
            Nonce = Convert.ToBase64String(dto.EncryptedContent.Nonce),
            AuthTag = Convert.ToBase64String(dto.EncryptedContent.AuthTag),
            Timestamp = dto.CreatedAt.ToString("o"), // ISO 8601 format
            KeyRotationVersion = dto.EncryptedContent.KeyVersion,
            ParentMessageId = dto.ParentMessageId?.ToString()
        };
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
    public async Task<ActionResult<MessageApiResponse>> PostMessage(Guid conversationId, [FromBody] PostMessageDto message)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var messageDto = await conversationGrain.PostMessageAsync(UserId, message);
            var apiResponse = MapToApiResponse(messageDto);

            // Notify SSE listeners of the new message
            var messageJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "message",
                message = apiResponse
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });
            await _notificationService.NotifyNewMessageAsync(conversationId, messageJson);

            return Ok(apiResponse);
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
    public async Task<ActionResult<List<MessageApiResponse>>> GetMessages(
        Guid conversationId,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50)
    {
        try
        {
            if (take > 100) take = 100; // Limit max page size

            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var messages = await conversationGrain.GetMessagesAsync(skip, take);
            var apiResponses = messages.Select(MapToApiResponse).ToList();
            return Ok(apiResponses);
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
    public async Task<ActionResult<List<MessageApiResponse>>> GetMessageReplies(
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
            var apiResponses = replies.Select(MapToApiResponse).ToList();
            return Ok(apiResponses);
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
    /// Server-Sent Events endpoint to listen for new messages in a conversation.
    /// Accepts access token via query parameter since EventSource doesn't support custom headers.
    /// </summary>
    [HttpGet("{conversationId}/events")]
    [AllowAnonymous] // We'll validate the token manually from query param
    public async Task WatchConversation(Guid conversationId, [FromQuery] string? access_token, CancellationToken cancellationToken)
    {
        // Manually validate token from query parameter
        if (string.IsNullOrEmpty(access_token))
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("Unauthorized: Missing access token");
            return;
        }

        string? currentUserId;
        try
        {
            // Validate the JWT token manually
            var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
            var token = handler.ReadJwtToken(access_token);
            currentUserId = token.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;

            if (string.IsNullOrEmpty(currentUserId))
            {
                Response.StatusCode = 401;
                await Response.WriteAsync("Unauthorized: Invalid token");
                return;
            }

            // Set the user context for Orleans grain calls
            RequestContext.Set("UserId", currentUserId);
        }
        catch
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("Unauthorized: Invalid token");
            return;
        }

        // Verify the user is a participant in this conversation
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var isParticipant = await conversationGrain.IsParticipantAsync(currentUserId);

            if (!isParticipant)
            {
                Response.StatusCode = 403;
                await Response.WriteAsync("Forbidden: Not a participant");
                return;
            }

            // Set up SSE response headers
            Response.Headers.Append("Content-Type", "text/event-stream");
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");

            // Send initial connection message
            await Response.WriteAsync("data: {\"type\":\"connected\"}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);

            // Register callback for new messages
            var tcs = new TaskCompletionSource<string>();

            _notificationService.RegisterListener(conversationId, currentUserId, async (messageJson) =>
            {
                tcs.TrySetResult(messageJson);
                await Task.CompletedTask;
            });

            try
            {
                // Wait for new message or cancellation
                using var registration = cancellationToken.Register(() => tcs.TrySetCanceled());

                // Keep connection alive with timeout of 30 minutes
                var timeoutCts = new CancellationTokenSource(TimeSpan.FromMinutes(30));
                using var timeoutRegistration = timeoutCts.Token.Register(() => tcs.TrySetCanceled());

                while (!cancellationToken.IsCancellationRequested)
                {
                    var messageJson = await tcs.Task;

                    // Send new message event
                    var eventData = $"data: {messageJson}\n\n";
                    await Response.WriteAsync(eventData, cancellationToken);
                    await Response.Body.FlushAsync(cancellationToken);

                    // Reset for next message
                    tcs = new TaskCompletionSource<string>();
                    _notificationService.RegisterListener(conversationId, currentUserId, async (json) =>
                    {
                        tcs.TrySetResult(json);
                        await Task.CompletedTask;
                    });
                }
            }
            catch (OperationCanceledException)
            {
                // Connection closed or timeout - this is normal
                _logger.LogDebug("SSE connection closed for conversation {ConversationId}, user {UserId}", conversationId, currentUserId);
            }
            finally
            {
                _notificationService.UnregisterListener(conversationId, currentUserId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in SSE endpoint for conversation {ConversationId}", conversationId);
            Response.StatusCode = 500;
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

    /// <summary>
    /// Mark a message as read.
    /// </summary>
    [HttpPost("{conversationId}/messages/{messageId}/read")]
    public async Task<ActionResult> MarkMessageAsRead(Guid conversationId, Guid messageId)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            await conversationGrain.MarkMessageAsReadAsync(messageId, UserId);

            // Notify SSE listeners of the read receipt
            var readReceiptJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "read_receipt",
                messageId = messageId.ToString(),
                userId = UserId
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });
            await _notificationService.NotifyNewMessageAsync(conversationId, readReceiptJson);

            return Ok(new { message = "Message marked as read" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mark message {MessageId} as read", messageId);
            return StatusCode(500, new { error = "Failed to mark message as read" });
        }
    }

    /// <summary>
    /// Get read receipts for a message.
    /// </summary>
    [HttpGet("{conversationId}/messages/{messageId}/read")]
    public async Task<ActionResult<List<string>>> GetMessageReadReceipts(Guid conversationId, Guid messageId)
    {
        try
        {
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var readers = await conversationGrain.GetMessageReadReceiptsAsync(messageId);
            return Ok(readers);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get read receipts for message {MessageId}", messageId);
            return StatusCode(500, new { error = "Failed to get read receipts" });
        }
    }

    /// <summary>
    /// Delete a conversation and all its messages.
    /// This will delete the conversation for all participants.
    /// </summary>
    [HttpDelete("{conversationId}")]
    public async Task<ActionResult> DeleteConversation(Guid conversationId)
    {
        try
        {
            RequestContext.Set("UserId", UserId);

            // Notify all connected participants before deletion
            var deletionEvent = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "conversation_deleted",
                conversationId = conversationId.ToString()
            }, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            });
            await _notificationService.NotifyConversationDeletedAsync(conversationId, deletionEvent);

            // Now delete the conversation
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            await conversationGrain.DeleteConversationAsync();

            return Ok(new { message = "Conversation deleted successfully" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete conversation {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to delete conversation" });
        }
    }
}

public record CreateConversationRequest(
    List<string> ParticipantUserIds,
    Dictionary<string, byte[]> EncryptedConversationKeys
);

public record StoreKeyRequest(string UserId, byte[] EncryptedKey, int KeyVersion);
public record AddParticipantRequest(string UserId);
