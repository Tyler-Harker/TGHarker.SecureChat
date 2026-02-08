using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/conversations/{conversationId}/attachments")]
[Authorize]
public class AttachmentsController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly ILogger<AttachmentsController> _logger;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public AttachmentsController(
        IClusterClient client,
        ILogger<AttachmentsController> logger)
    {
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

            // Read file data into byte array
            byte[] fileData;
            using (var memoryStream = new MemoryStream())
            {
                await file.CopyToAsync(memoryStream);
                fileData = memoryStream.ToArray();
            }

            // Store in AttachmentGrain
            var attachmentId = Guid.NewGuid();
            var attachmentGrain = _client.GetGrain<IAttachmentGrain>(attachmentId, conversationId.ToString());
            var attachment = await attachmentGrain.StoreAsync(
                conversationId, UserId, fileName, contentType,
                nonce, authTag, keyVersion, fileData);

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

            // Get from AttachmentGrain
            var attachmentGrain = _client.GetGrain<IAttachmentGrain>(attachmentId, conversationId.ToString());
            var result = await attachmentGrain.GetAsync();
            if (result == null)
                return NotFound(new { error = "Attachment not found" });

            var (data, metadata) = result.Value;

            Response.Headers.Append("X-Encryption-Nonce", metadata.Nonce);
            Response.Headers.Append("X-Encryption-AuthTag", metadata.AuthTag);
            Response.Headers.Append("X-Encryption-KeyVersion", metadata.KeyVersion.ToString());
            Response.Headers.Append("X-Original-Content-Type", metadata.ContentType);
            Response.Headers.Append("X-Original-FileName", metadata.FileName);

            return File(data, "application/octet-stream");
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
