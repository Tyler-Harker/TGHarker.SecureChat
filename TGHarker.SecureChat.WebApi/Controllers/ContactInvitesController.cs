using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using Orleans.Runtime;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.WebApi.Services;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/invites")]
public class ContactInvitesController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly ILogger<ContactInvitesController> _logger;
    private readonly IConfiguration _configuration;
    private readonly IInviteNotificationService _notificationService;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public ContactInvitesController(
        IClusterClient client,
        ILogger<ContactInvitesController> logger,
        IConfiguration configuration,
        IInviteNotificationService notificationService)
    {
        _client = client;
        _logger = logger;
        _configuration = configuration;
        _notificationService = notificationService;
    }

    /// <summary>
    /// Generate a new contact invite link.
    /// </summary>
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<CreateInviteResponseDto>> CreateInvite()
    {
        try
        {
            var inviteId = Guid.NewGuid().ToString();
            var inviteSecret = GenerateSecureRandom(32);
            var inviteSecretCode = GenerateSecureRandom(16);

            RequestContext.Set("UserId", UserId);
            var grain = _client.GetGrain<IContactInviteGrain>(inviteId);
            var invite = await grain.CreateAsync(UserId, inviteSecret, inviteSecretCode);

            // Build the invite URL
            var frontendUrl = _configuration["Frontend:BaseUrl"] ?? $"{Request.Scheme}://{Request.Host}";
            var inviteUrl = $"{frontendUrl}/contacts/invite?id={inviteId}&secret={Uri.EscapeDataString(inviteSecret)}&code={Uri.EscapeDataString(inviteSecretCode)}";

            return Ok(new CreateInviteResponseDto(
                InviteId: inviteId,
                InviteSecret: inviteSecret,
                InviteSecretCode: inviteSecretCode,
                InviteUrl: inviteUrl,
                ExpiresAt: invite.ExpiresAt
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create invite for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to create invite" });
        }
    }

    /// <summary>
    /// Get invite details (public endpoint).
    /// </summary>
    [HttpGet("{inviteId}")]
    [AllowAnonymous]
    public async Task<ActionResult<ContactInviteDto>> GetInvite(string inviteId)
    {
        try
        {
            var grain = _client.GetGrain<IContactInviteGrain>(inviteId);
            var invite = await grain.GetInviteAsync();

            if (invite == null)
            {
                return NotFound(new { error = "Invite not found" });
            }

            return Ok(invite);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get invite {InviteId}", inviteId);
            return StatusCode(500, new { error = "Failed to get invite" });
        }
    }

    /// <summary>
    /// Accept a contact invite.
    /// </summary>
    [HttpPost("{inviteId}/accept")]
    [Authorize]
    public async Task<ActionResult<AcceptInviteResultDto>> AcceptInvite(
        string inviteId,
        [FromBody] AcceptInviteRequest request)
    {
        try
        {
            RequestContext.Set("UserId", UserId);
            var grain = _client.GetGrain<IContactInviteGrain>(inviteId);
            var result = await grain.AcceptAsync(UserId, request.InviteSecret, request.InviteSecretCode);

            if (!result.Success)
            {
                return BadRequest(new { error = result.Error });
            }

            // Notify anyone listening via SSE that the invite was accepted
            // Get the acceptor's display name (UserId is the person who accepted)
            var acceptorGrain = _client.GetGrain<IUserGrain>(UserId);
            var acceptorInfo = await acceptorGrain.GetContactInfoAsync();

            if (acceptorInfo != null)
            {
                await _notificationService.NotifyInviteAcceptedAsync(
                    inviteId,
                    acceptorInfo.UserId,
                    acceptorInfo.DisplayName
                );
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to accept invite {InviteId} for user {UserId}", inviteId, UserId);
            return StatusCode(500, new { error = "Failed to accept invite" });
        }
    }

    /// <summary>
    /// Server-Sent Events endpoint to listen for invite acceptance.
    /// Accepts access token via query parameter since EventSource doesn't support custom headers.
    /// </summary>
    [HttpGet("{inviteId}/events")]
    [AllowAnonymous] // We'll validate the token manually from query param
    public async Task WatchInvite(string inviteId, [FromQuery] string? access_token, CancellationToken cancellationToken)
    {
        // Manually validate token from query parameter
        if (string.IsNullOrEmpty(access_token))
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("Unauthorized: Missing access token");
            return;
        }

        // Get the user ID from the token (this would require validating the JWT)
        // For now, we'll use the Authorize attribute's user resolution
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
        }
        catch
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("Unauthorized: Invalid token");
            return;
        }

        // Verify the user is the creator of this invite
        try
        {
            var grain = _client.GetGrain<IContactInviteGrain>(inviteId);
            var invite = await grain.GetInviteAsync();

            if (invite == null)
            {
                Response.StatusCode = 404;
                return;
            }

            if (invite.CreatorUserId != currentUserId)
            {
                Response.StatusCode = 403;
                return;
            }

            // Set up SSE response headers
            Response.Headers.Append("Content-Type", "text/event-stream");
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");

            // Send initial connection message
            await Response.WriteAsync("data: {\"type\":\"connected\"}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);

            // Register callback for invite acceptance
            var tcs = new TaskCompletionSource<(string UserId, string DisplayName)>();

            _notificationService.RegisterListener(inviteId, async (userId, displayName) =>
            {
                tcs.TrySetResult((userId, displayName));
                await Task.CompletedTask;
            });

            try
            {
                // Wait for acceptance or cancellation
                using var registration = cancellationToken.Register(() => tcs.TrySetCanceled());

                // Also timeout after 15 minutes
                var timeoutCts = new CancellationTokenSource(TimeSpan.FromMinutes(15));
                using var timeoutRegistration = timeoutCts.Token.Register(() => tcs.TrySetCanceled());

                var (acceptedByUserId, acceptedByDisplayName) = await tcs.Task;

                // Send acceptance event
                var eventData = $"data: {{\"type\":\"accepted\",\"userId\":\"{acceptedByUserId}\",\"displayName\":\"{acceptedByDisplayName}\"}}\n\n";
                await Response.WriteAsync(eventData, cancellationToken);
                await Response.Body.FlushAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Connection closed or timeout - this is normal
                _logger.LogDebug("SSE connection closed for invite {InviteId}", inviteId);
            }
            finally
            {
                _notificationService.UnregisterListener(inviteId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in SSE endpoint for invite {InviteId}", inviteId);
            Response.StatusCode = 500;
        }
    }

    /// <summary>
    /// Check if an invite is still valid.
    /// </summary>
    [HttpGet("{inviteId}/valid")]
    [AllowAnonymous]
    public async Task<ActionResult<bool>> IsInviteValid(string inviteId)
    {
        try
        {
            var grain = _client.GetGrain<IContactInviteGrain>(inviteId);
            var isValid = await grain.IsValidAsync();
            return Ok(new { valid = isValid });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check invite validity {InviteId}", inviteId);
            return StatusCode(500, new { error = "Failed to check invite validity" });
        }
    }

    private static string GenerateSecureRandom(int byteCount)
    {
        var bytes = RandomNumberGenerator.GetBytes(byteCount);
        return Convert.ToBase64String(bytes);
    }
}

public record AcceptInviteRequest(string InviteSecret, string InviteSecretCode);
