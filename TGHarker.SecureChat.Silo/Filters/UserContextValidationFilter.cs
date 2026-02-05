using Orleans;
using Orleans.Runtime;

namespace TGHarker.SecureChat.Silo.Filters;

/// <summary>
/// Incoming grain call filter that validates user context is present.
/// Runs on the Silo side for all incoming grain calls.
/// </summary>
public class UserContextValidationFilter : IIncomingGrainCallFilter
{
    private readonly ILogger<UserContextValidationFilter> _logger;

    // Methods that can be called without authentication
    private static readonly HashSet<string> AllowedAnonymousMethods = new()
    {
        "RegisterAsync",
        "GetPublicIdentityKeyAsync",
        "GetInviteAsync",       // Allow viewing invite details without auth
        "IsValidAsync",         // Allow checking invite validity without auth
        "GetContactInfoAsync"   // Allow getting basic contact info for display
    };

    public UserContextValidationFilter(ILogger<UserContextValidationFilter> logger)
    {
        _logger = logger;
    }

    public async Task Invoke(IIncomingGrainCallContext context)
    {
        var methodName = context.InterfaceMethod.Name;
        var interfaceType = context.InterfaceMethod.DeclaringType;

        // Skip validation for Orleans system grains (internal infrastructure)
        if (interfaceType?.Namespace?.StartsWith("Orleans") == true)
        {
            await context.Invoke();
            return;
        }

        var userId = RequestContext.Get("UserId") as string;

        // Allow anonymous access to registration and public key lookup
        if (AllowedAnonymousMethods.Contains(methodName))
        {
            await context.Invoke();
            return;
        }

        // All other methods require user context
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("Grain call to {GrainType}.{MethodName} rejected: No user context",
                context.Grain.GetType().Name, methodName);
            throw new UnauthorizedAccessException($"User context required for {methodName}");
        }

        _logger.LogDebug("Grain call to {GrainType}.{MethodName} by user {UserId}",
            context.Grain.GetType().Name, methodName, userId);

        await context.Invoke();
    }
}
