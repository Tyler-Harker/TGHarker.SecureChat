using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.Contracts.Services;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/conversations/{conversationId}/attachments")]
[Authorize]
public class AttachmentsController : ControllerBase
{
    private readonly IAttachmentStorageService _attachmentStorage;
    private readonly IClusterClient _client;
    private readonly ILogger<AttachmentsController> _logger;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public AttachmentsController(
        IAttachmentStorageService attachmentStorage,
        IClusterClient client,
        ILogger<AttachmentsController> logger)
    {
        _attachmentStorage = attachmentStorage;
        _client = client;
        _logger = logger;
    }

    /// <summary>
    /// Upload an encrypted image attachment.
    /// Accepts multipart form: file (encrypted bytes), nonce, authTag, keyVersion, fileName, contentType.
    /// </summary>
    [HttpPost]
    [RequestSizeLimit(11 * 1024 * 1024)] // 11 MB to account for multipart overhead
    public async Task<ActionResult<AttachmentDto>> UploadAttachment(
        Guid conversationId,
        IFormFile file,
        [FromForm] string nonce,
        [FromForm] string authTag,
        [FromForm] int keyVersion,
        [FromForm] string fileName,
        [FromForm] string contentType)
    {
        try
        {
            // Verify participant access
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var isParticipant = await conversationGrain.IsParticipantAsync(UserId);
            if (!isParticipant)
                return Forbid();

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file provided" });

            using var stream = file.OpenReadStream();
            var attachment = await _attachmentStorage.StoreAttachmentAsync(
                conversationId, UserId, fileName, contentType,
                nonce, authTag, keyVersion, stream);

            return Ok(attachment);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload attachment for conversation {ConversationId}", conversationId);
            return StatusCode(500, new { error = "Failed to upload attachment" });
        }
    }

    /// <summary>
    /// Download an encrypted attachment.
    /// Returns encrypted bytes as application/octet-stream with encryption metadata in headers.
    /// </summary>
    [HttpGet("{attachmentId}")]
    public async Task<IActionResult> DownloadAttachment(Guid conversationId, Guid attachmentId)
    {
        try
        {
            // Verify participant access
            var conversationGrain = _client.GetGrain<IConversationGrain>(conversationId);
            var isParticipant = await conversationGrain.IsParticipantAsync(UserId);
            if (!isParticipant)
                return Forbid();

            var result = await _attachmentStorage.GetAttachmentAsync(conversationId, attachmentId);
            if (result == null)
                return NotFound(new { error = "Attachment not found" });

            var (content, metadata) = result.Value;

            Response.Headers.Append("X-Encryption-Nonce", metadata.Nonce);
            Response.Headers.Append("X-Encryption-AuthTag", metadata.AuthTag);
            Response.Headers.Append("X-Encryption-KeyVersion", metadata.KeyVersion.ToString());
            Response.Headers.Append("X-Original-Content-Type", metadata.ContentType);
            Response.Headers.Append("X-Original-FileName", metadata.FileName);

            return File(content, "application/octet-stream");
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download attachment {AttachmentId} from conversation {ConversationId}",
                attachmentId, conversationId);
            return StatusCode(500, new { error = "Failed to download attachment" });
        }
    }
}
