using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/contacts")]
[Authorize]
public class ContactRequestsController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly ILogger<ContactRequestsController> _logger;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public ContactRequestsController(
        IClusterClient client,
        ILogger<ContactRequestsController> logger)
    {
        _client = client;
        _logger = logger;
    }

    /// <summary>
    /// Send a contact request to another user.
    /// </summary>
    [HttpPost("request/{userId}")]
    public async Task<ActionResult<object>> SendContactRequest(string userId)
    {
        try
        {
            if (UserId == userId)
            {
                return BadRequest(new { error = "Cannot send contact request to yourself" });
            }

            // Check if already a contact
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            var contactIds = await userGrain.GetContactIdsAsync();
            if (contactIds.Contains(userId))
            {
                return BadRequest(new { error = "User is already a contact" });
            }

            // Get sender info
            var senderContact = await userGrain.GetContactInfoAsync();
            if (senderContact == null)
            {
                return BadRequest(new { error = "Sender profile not found" });
            }

            // Create request
            var requestId = Guid.NewGuid().ToString();
            var requestGrain = _client.GetGrain<IContactRequestGrain>(requestId);

            await requestGrain.CreateRequestAsync(
                UserId,
                userId,
                senderContact.DisplayName,
                senderContact.Email
            );

            return Ok(new { requestId, message = "Contact request sent" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send contact request from {FromUser} to {ToUser}",
                UserId, userId);
            return StatusCode(500, new { error = "Failed to send contact request" });
        }
    }

    /// <summary>
    /// Get all pending contact requests received by the current user.
    /// </summary>
    [HttpGet("requests/pending")]
    public async Task<ActionResult<List<ContactRequestDto>>> GetPendingRequests()
    {
        try
        {
            var userGrain = _client.GetGrain<IUserGrain>(UserId);
            var requestIds = await userGrain.GetReceivedContactRequestIdsAsync();

            var requests = new List<ContactRequestDto>();
            foreach (var requestId in requestIds)
            {
                var requestGrain = _client.GetGrain<IContactRequestGrain>(requestId);
                var request = await requestGrain.GetRequestAsync();
                if (request != null && request.Status == ContactRequestStatus.Pending)
                {
                    requests.Add(request);
                }
            }

            return Ok(requests);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get pending contact requests for user {UserId}", UserId);
            return StatusCode(500, new { error = "Failed to get pending requests" });
        }
    }

    /// <summary>
    /// Accept a contact request.
    /// </summary>
    [HttpPost("requests/{requestId}/accept")]
    public async Task<ActionResult<object>> AcceptContactRequest(string requestId)
    {
        try
        {
            var requestGrain = _client.GetGrain<IContactRequestGrain>(requestId);
            var request = await requestGrain.GetRequestAsync();

            if (request == null)
            {
                return NotFound(new { error = "Contact request not found" });
            }

            if (request.ToUserId != UserId)
            {
                return Unauthorized(new { error = "Not authorized to accept this request" });
            }

            await requestGrain.AcceptRequestAsync();

            // Get the new contact info
            var fromUserGrain = _client.GetGrain<IUserGrain>(request.FromUserId);
            var contact = await fromUserGrain.GetContactInfoAsync();

            return Ok(new { message = "Contact request accepted", contact });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to accept contact request {RequestId}", requestId);
            return StatusCode(500, new { error = "Failed to accept contact request" });
        }
    }

    /// <summary>
    /// Decline a contact request.
    /// </summary>
    [HttpPost("requests/{requestId}/decline")]
    public async Task<ActionResult<object>> DeclineContactRequest(string requestId)
    {
        try
        {
            var requestGrain = _client.GetGrain<IContactRequestGrain>(requestId);
            var request = await requestGrain.GetRequestAsync();

            if (request == null)
            {
                return NotFound(new { error = "Contact request not found" });
            }

            if (request.ToUserId != UserId)
            {
                return Unauthorized(new { error = "Not authorized to decline this request" });
            }

            await requestGrain.DeclineRequestAsync();

            return Ok(new { message = "Contact request declined" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decline contact request {RequestId}", requestId);
            return StatusCode(500, new { error = "Failed to decline contact request" });
        }
    }
}
