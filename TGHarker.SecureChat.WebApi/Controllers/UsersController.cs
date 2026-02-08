using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using Orleans.Streams;
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
    /// Ensure the current user is registered. Auto-registers from JWT claims if not.
    /// Call this when the user first opens the authenticated section of the app.
    /// </summary>
    [HttpPost("me/ensure")]
    public async Task<ActionResult<EnsureRegisteredResponse>> EnsureRegistered()
    {
        try
        {
            var email = User.FindFirst("email")?.Value ?? User.FindFirst("sub")?.Value ?? "unknown@user";
            var displayName = User.FindFirst("name")?.Value
                ?? User.FindFirst("preferred_username")?.Value
                ?? email.Split('@')[0];

            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            var (profile, isNewUser) = await userGrain.EnsureRegisteredAsync(email, displayName);

            return Ok(new EnsureRegisteredResponse(profile, isNewUser));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to ensure user registration for {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to ensure registration" });
        }
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
        catch (InvalidOperationException)
        {
            // User not registered yet - return empty list
            return Ok(new List<Guid>());
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

    /// <summary>
    /// Get the current user's contacts with their profile info.
    /// </summary>
    [HttpGet("me/contacts")]
    public async Task<ActionResult<List<ContactDto>>> GetMyContacts()
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            var contactIds = await userGrain.GetContactIdsAsync();

            var contacts = new List<ContactDto>();
            foreach (var contactId in contactIds)
            {
                var contactGrain = _client.GetGrain<IUserGrain>(contactId);
                var contactInfo = await contactGrain.GetContactInfoAsync();
                if (contactInfo != null)
                {
                    // Get the nickname for this contact
                    var nickname = await userGrain.GetContactNicknameAsync(contactId);
                    contacts.Add(contactInfo with { Nickname = nickname });
                }
            }

            return Ok(contacts);
        }
        catch (InvalidOperationException)
        {
            // User not registered yet - return empty list
            return Ok(new List<ContactDto>());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get contacts for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to get contacts" });
        }
    }

    /// <summary>
    /// Add a user as a contact.
    /// </summary>
    [HttpPost("me/contacts/{contactUserId}")]
    public async Task<ActionResult> AddContact(string contactUserId)
    {
        try
        {
            // Verify the contact user exists
            var contactGrain = _client.GetGrain<IUserGrain>(contactUserId);
            var contactInfo = await contactGrain.GetContactInfoAsync();
            if (contactInfo == null)
            {
                return NotFound(new { error = "User not found" });
            }

            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            await userGrain.AddContactAsync(contactUserId);

            return Ok(new { message = "Contact added successfully", contact = contactInfo });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add contact {ContactUserId} for user {UserId}", contactUserId, UserId);
            return StatusCode(500, new { error = "Failed to add contact" });
        }
    }

    /// <summary>
    /// Remove a user from contacts.
    /// </summary>
    [HttpDelete("me/contacts/{contactUserId}")]
    public async Task<ActionResult> RemoveContact(string contactUserId)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            await userGrain.RemoveContactAsync(contactUserId);

            return Ok(new { message = "Contact removed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove contact {ContactUserId} for user {UserId}", contactUserId, UserId);
            return StatusCode(500, new { error = "Failed to remove contact" });
        }
    }

    /// <summary>
    /// Search within the current user's contacts.
    /// </summary>
    [HttpGet("me/contacts/search")]
    public async Task<ActionResult<List<ContactDto>>> SearchContacts([FromQuery] string query)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            var contactIds = await userGrain.GetContactIdsAsync();

            var matchingContacts = new List<ContactDto>();
            var queryLower = query.ToLowerInvariant();

            foreach (var contactId in contactIds)
            {
                var contactGrain = _client.GetGrain<IUserGrain>(contactId);
                var contactInfo = await contactGrain.GetContactInfoAsync();
                if (contactInfo != null)
                {
                    // Match against email or display name
                    if (contactInfo.Email.ToLowerInvariant().Contains(queryLower) ||
                        contactInfo.DisplayName.ToLowerInvariant().Contains(queryLower))
                    {
                        matchingContacts.Add(contactInfo);
                    }
                }
            }

            return Ok(matchingContacts);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search contacts for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to search contacts" });
        }
    }

    /// <summary>
    /// Update the current user's display name.
    /// </summary>
    [HttpPut("me/displayname")]
    public async Task<ActionResult> UpdateDisplayName([FromBody] UpdateDisplayNameDto request)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            await userGrain.UpdateDisplayNameAsync(request.DisplayName);
            return Ok(new { message = "Display name updated successfully" });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update display name for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to update display name" });
        }
    }

    /// <summary>
    /// Set or update a nickname for a contact.
    /// </summary>
    [HttpPut("me/contacts/{contactUserId}/nickname")]
    public async Task<ActionResult> SetContactNickname(string contactUserId, [FromBody] SetNicknameDto request)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            await userGrain.SetContactNicknameAsync(contactUserId, request.Nickname);
            return Ok(new { message = "Nickname updated successfully" });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set nickname for contact {ContactUserId}", contactUserId);
            return StatusCode(500, new { error = "Failed to set nickname" });
        }
    }

    /// <summary>
    /// Remove a nickname for a contact.
    /// </summary>
    [HttpDelete("me/contacts/{contactUserId}/nickname")]
    public async Task<ActionResult> RemoveContactNickname(string contactUserId)
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            await userGrain.RemoveContactNicknameAsync(contactUserId);
            return Ok(new { message = "Nickname removed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove nickname for contact {ContactUserId}", contactUserId);
            return StatusCode(500, new { error = "Failed to remove nickname" });
        }
    }

    /// <summary>
    /// Server-Sent Events endpoint for user-level events (e.g. new conversations).
    /// Accepts access token via query parameter since EventSource doesn't support custom headers.
    /// </summary>
    [HttpGet("me/events")]
    [AllowAnonymous]
    public async Task WatchUserEvents([FromQuery] string? access_token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(access_token))
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("Unauthorized: Missing access token");
            return;
        }

        string? currentUserId;
        try
        {
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

        try
        {
            Response.Headers.Append("Content-Type", "text/event-stream");
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");

            await Response.WriteAsync("data: {\"type\":\"connected\"}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);

            var streamProvider = _client.GetStreamProvider("ConversationStreamProvider");
            var streamId = StreamId.Create("UserEvents", currentUserId);
            var stream = streamProvider.GetStream<string>(streamId);

            var channel = System.Threading.Channels.Channel.CreateUnbounded<string>();
            var observer = new UserStreamObserver(channel.Writer);
            var subscriptionHandle = await stream.SubscribeAsync(observer);

            try
            {
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeoutCts.CancelAfter(TimeSpan.FromMinutes(30));

                await foreach (var eventJson in channel.Reader.ReadAllAsync(timeoutCts.Token))
                {
                    var eventData = $"data: {eventJson}\n\n";
                    await Response.WriteAsync(eventData, timeoutCts.Token);
                    await Response.Body.FlushAsync(timeoutCts.Token);
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogDebug("User SSE connection closed for user {UserId}", currentUserId);
            }
            finally
            {
                await subscriptionHandle.UnsubscribeAsync();
                channel.Writer.Complete();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in user SSE endpoint for user {UserId}", currentUserId);
            Response.StatusCode = 500;
        }
    }
}

internal class UserStreamObserver : IAsyncObserver<string>
{
    private readonly System.Threading.Channels.ChannelWriter<string> _writer;

    public UserStreamObserver(System.Threading.Channels.ChannelWriter<string> writer)
    {
        _writer = writer;
    }

    public Task OnCompletedAsync() => Task.CompletedTask;
    public Task OnErrorAsync(Exception ex) => Task.CompletedTask;

    public async Task OnNextAsync(string item, StreamSequenceToken? token = null)
    {
        await _writer.WriteAsync(item);
    }
}

public record UpdateKeysDto(byte[] PublicKey, byte[] EncryptedPrivateKey, byte[] Salt);

public record UpdateDisplayNameDto(string DisplayName);

public record SetNicknameDto(string Nickname);

public record EnsureRegisteredResponse(UserProfileDto Profile, bool IsNewUser);
