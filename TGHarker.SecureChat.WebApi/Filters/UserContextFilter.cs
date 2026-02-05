using Orleans;
using Orleans.Runtime;

namespace TGHarker.SecureChat.WebApi.Filters;

/// <summary>
/// Outgoing grain call filter that propagates user context to Orleans grains.
/// Runs on the WebApi (client) side before making grain calls.
/// </summary>
public class UserContextFilter : IOutgoingGrainCallFilter
{
    private readonly ILogger<UserContextFilter> _logger;

    public UserContextFilter(ILogger<UserContextFilter> logger)
    {
        _logger = logger;
    }

    public async Task Invoke(IOutgoingGrainCallContext context)
    {
        // Propagate user context from current RequestContext
        var userId = RequestContext.Get("UserId");
        var email = RequestContext.Get("Email");

        if (userId != null)
        {
            RequestContext.Set("UserId", userId);
            _logger.LogDebug("Propagating user context {UserId} to grain call", userId);
        }

        if (email != null)
        {
            RequestContext.Set("Email", email);
        }

        await context.Invoke();
    }
}
