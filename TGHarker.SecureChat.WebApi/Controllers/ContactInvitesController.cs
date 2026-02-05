using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using Orleans.Runtime;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/invites")]
public class ContactInvitesController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly ILogger<ContactInvitesController> _logger;
    private readonly IConfiguration _configuration;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public ContactInvitesController(
        IClusterClient client,
        ILogger<ContactInvitesController> logger,
        IConfiguration configuration)
    {
        _client = client;
        _logger = logger;
        _configuration = configuration;
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

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to accept invite {InviteId} for user {UserId}", inviteId, UserId);
            return StatusCode(500, new { error = "Failed to accept invite" });
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
