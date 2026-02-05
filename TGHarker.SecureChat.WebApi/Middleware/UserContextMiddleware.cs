using System.Security.Claims;
using Orleans.Runtime;

namespace TGHarker.SecureChat.WebApi.Middleware;

/// <summary>
/// Middleware that extracts user context from JWT claims and sets Orleans RequestContext.
/// Must run after authentication middleware.
/// </summary>
public class UserContextMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<UserContextMiddleware> _logger;

    public UserContextMiddleware(RequestDelegate next, ILogger<UserContextMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            // Extract user ID from "sub" claim (standard OAuth2/OIDC claim)
            var userId = context.User.FindFirst("sub")?.Value
                ?? context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            var email = context.User.FindFirst("email")?.Value
                ?? context.User.FindFirst(ClaimTypes.Email)?.Value;

            if (!string.IsNullOrEmpty(userId))
            {
                RequestContext.Set("UserId", userId);
                _logger.LogDebug("Set user context for {UserId}", userId);

                if (!string.IsNullOrEmpty(email))
                {
                    RequestContext.Set("Email", email);
                }
            }
            else
            {
                _logger.LogWarning("Authenticated user has no 'sub' or NameIdentifier claim");
            }
        }

        await _next(context);
    }
}
