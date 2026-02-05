using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Orleans;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.WebApi.Controllers;

[ApiController]
[Route("api/push")]
[Authorize]
public class PushNotificationsController : ControllerBase
{
    private readonly IClusterClient _client;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PushNotificationsController> _logger;

    private string UserId => User.FindFirst("sub")?.Value
        ?? throw new UnauthorizedAccessException("No user ID in token");

    public PushNotificationsController(
        IClusterClient client,
        IConfiguration configuration,
        ILogger<PushNotificationsController> logger)
    {
        _client = client;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpGet("vapid-public-key")]
    [AllowAnonymous]
    public ActionResult GetVapidPublicKey()
    {
        var publicKey = _configuration["Vapid:PublicKey"];
        if (string.IsNullOrEmpty(publicKey))
        {
            return StatusCode(503, new { error = "Push notifications not configured" });
        }
        return Ok(new { publicKey });
    }

    [HttpPost("subscribe")]
    public async Task<ActionResult> Subscribe([FromBody] PushSubscribeRequest request)
    {
        var subscription = new PushSubscriptionDto(
            Endpoint: request.Endpoint,
            P256dhKey: request.Keys.P256dh,
            AuthKey: request.Keys.Auth,
            CreatedAt: DateTime.UtcNow,
            DeviceLabel: request.DeviceLabel
        );

        var pushGrain = _client.GetGrain<IPushNotificationGrain>(UserId);
        await pushGrain.RegisterSubscriptionAsync(subscription);

        _logger.LogInformation("Push subscription registered for user {UserId}", UserId);
        return Ok(new { message = "Push subscription registered" });
    }

    [HttpPost("unsubscribe")]
    public async Task<ActionResult> Unsubscribe([FromBody] PushUnsubscribeRequest request)
    {
        var pushGrain = _client.GetGrain<IPushNotificationGrain>(UserId);
        await pushGrain.UnregisterSubscriptionAsync(request.Endpoint);

        _logger.LogInformation("Push subscription removed for user {UserId}", UserId);
        return Ok(new { message = "Push subscription removed" });
    }
}

public record PushSubscribeRequest(string Endpoint, PushSubscriptionKeys Keys, string? DeviceLabel);
public record PushSubscriptionKeys(string P256dh, string Auth);
public record PushUnsubscribeRequest(string Endpoint);
