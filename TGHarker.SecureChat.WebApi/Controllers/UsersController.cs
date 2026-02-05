using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly ILogger<UsersController> _logger;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public UsersController(
        IClusterClient client,
        ILogger<UsersController> logger)
    {
        _client = client;
        _logger = logger;
    }

    /// <summary>
    /// Register a new user with encrypted identity keys.
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<UserProfileDto>> Register([FromBody] UserRegistrationDto registration)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            await userGrain.RegisterAsync(registration);

            var profile = await userGrain.GetProfileAsync();
            return Ok(profile);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to register user {UserId}", UserId);
            return StatusCode(500, new { error = "Registration failed" });
        }
    }

    /// <summary>
    /// Get the current user's profile.
    /// </summary>
    [HttpGet("me")]
    public async Task<ActionResult<UserProfileDto>> GetMyProfile()
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            var profile = await userGrain.GetProfileAsync();
            return Ok(profile);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get profile for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to get profile" });
        }
    }

    /// <summary>
    /// Get a user's public identity key for key exchange.
    /// </summary>
    [HttpGet("{userId}/publickey")]
    public async Task<ActionResult<byte[]>> GetPublicKey(string userId)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(userId);
            var publicKey = await userGrain.GetPublicIdentityKeyAsync();
            return Ok(new { publicKey });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get public key for user {UserId}", userId);
            return StatusCode(500, new { error = "Failed to get public key" });
        }
    }

    /// <summary>
    /// Search for users by email or display name.
    /// TODO: Requires TGHarker.Orleans.Search configuration
    /// </summary>
    [HttpGet("search")]
    public Task<ActionResult<List<UserSearchResult>>> Search([FromQuery] string query, [FromQuery] int limit = 20)
    {
        _logger.LogWarning("Search endpoint called but TGHarker.Orleans.Search is not configured");
        return Task.FromResult<ActionResult<List<UserSearchResult>>>(
            StatusCode(501, new { error = "Search functionality not yet implemented. Requires TGHarker.Orleans.Search configuration." })
        );
    }

    /// <summary>
    /// Get the current user's conversation IDs.
    /// </summary>
    [HttpGet("me/conversations")]
    public async Task<ActionResult<List<Guid>>> GetMyConversations()
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            var conversationIds = await userGrain.GetConversationIdsAsync();
            return Ok(conversationIds);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get conversations for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to get conversations" });
        }
    }

    /// <summary>
    /// Update the user's identity keys.
    /// </summary>
    [HttpPut("me/keys")]
    public async Task<ActionResult> UpdateKeys([FromBody] UpdateKeysDto request)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            await userGrain.UpdatePublicKeyAsync(request.PublicKey, request.EncryptedPrivateKey, request.Salt);
            return Ok(new { message = "Keys updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update keys for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to update keys" });
        }
    }
}

public record UpdateKeysDto(byte[] PublicKey, byte[] EncryptedPrivateKey, byte[] Salt);
