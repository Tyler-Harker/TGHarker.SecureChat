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
        "GetPublicIdentityKeyAsync"
    };

    public UserContextValidationFilter(ILogger<UserContextValidationFilter> logger)
    {
        _logger = logger;
    }

    public async Task Invoke(IIncomingGrainCallContext context)
    {
        var userId = RequestContext.Get("UserId") as string;
        var methodName = context.InterfaceMethod.Name;

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
