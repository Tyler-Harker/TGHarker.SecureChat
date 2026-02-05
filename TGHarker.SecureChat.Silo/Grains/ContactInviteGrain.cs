using Orleans;
using Orleans.Runtime;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Silo.Grains;

/// <summary>
/// In-memory grain for managing contact invite links.
/// No persistent storage - invites expire after 1 hour.
/// </summary>
public class ContactInviteGrain : Grain, IContactInviteGrain
{
    private readonly ILogger<ContactInviteGrain> _logger;
    private readonly IGrainFactory _grainFactory;

    // In-memory state (not persisted)
    private string? _creatorUserId;
    private string? _creatorDisplayName;
    private string? _inviteSecret;
    private string? _inviteSecretCode;
    private DateTime _createdAt;
    private DateTime _expiresAt;
    private bool _isAccepted;
    private bool _isInitialized;

    private static readonly TimeSpan InviteLifespan = TimeSpan.FromHours(1);

    public ContactInviteGrain(
        ILogger<ContactInviteGrain> logger,
        IGrainFactory grainFactory)
    {
        _logger = logger;
        _grainFactory = grainFactory;
    }

    public override Task OnActivateAsync(CancellationToken cancellationToken)
    {
        // Schedule auto-deactivation after 1 hour
        this.RegisterGrainTimer(
            static async (state, _) =>
            {
                state.DeactivateOnIdle();
                await Task.CompletedTask;
            },
            this,
            new GrainTimerCreationOptions
            {
                DueTime = InviteLifespan,
                Period = Timeout.InfiniteTimeSpan, // Don't repeat
                Interleave = true
            }
        );

        return base.OnActivateAsync(cancellationToken);
    }

    public async Task<ContactInviteDto> CreateAsync(string creatorUserId, string inviteSecret, string inviteSecretCode)
    {
        if (_isInitialized)
        {
            throw new InvalidOperationException("Invite already created");
        }

        // Get creator display name
        var creatorGrain = _grainFactory.GetGrain<IUserGrain>(creatorUserId);
        var creatorInfo = await creatorGrain.GetContactInfoAsync();

        _creatorUserId = creatorUserId;
        _creatorDisplayName = creatorInfo?.DisplayName ?? "Unknown User";
        _inviteSecret = inviteSecret;
        _inviteSecretCode = inviteSecretCode;
        _createdAt = DateTime.UtcNow;
        _expiresAt = _createdAt.Add(InviteLifespan);
        _isAccepted = false;
        _isInitialized = true;

        var inviteId = this.GetPrimaryKeyString();
        _logger.LogInformation("Contact invite {InviteId} created by user {UserId}", inviteId, creatorUserId);

        return new ContactInviteDto(
            InviteId: inviteId,
            CreatorUserId: _creatorUserId,
            CreatorDisplayName: _creatorDisplayName,
            CreatedAt: _createdAt,
            ExpiresAt: _expiresAt,
            IsAccepted: _isAccepted
        );
    }

    public Task<ContactInviteDto?> GetInviteAsync()
    {
        if (!_isInitialized)
        {
            return Task.FromResult<ContactInviteDto?>(null);
        }

        return Task.FromResult<ContactInviteDto?>(new ContactInviteDto(
            InviteId: this.GetPrimaryKeyString(),
            CreatorUserId: _creatorUserId!,
            CreatorDisplayName: _creatorDisplayName!,
            CreatedAt: _createdAt,
            ExpiresAt: _expiresAt,
            IsAccepted: _isAccepted
        ));
    }

    public async Task<AcceptInviteResultDto> AcceptAsync(string acceptingUserId, string inviteSecret, string inviteSecretCode)
    {
        var inviteId = this.GetPrimaryKeyString();

        // Check if initialized
        if (!_isInitialized)
        {
            _logger.LogWarning("Attempt to accept non-existent invite {InviteId}", inviteId);
            return new AcceptInviteResultDto(false, "Invite not found", null);
        }

        // Check if expired
        if (DateTime.UtcNow > _expiresAt)
        {
            _logger.LogWarning("Attempt to accept expired invite {InviteId}", inviteId);
            return new AcceptInviteResultDto(false, "Invite has expired", null);
        }

        // Check if already accepted
        if (_isAccepted)
        {
            _logger.LogWarning("Attempt to accept already-used invite {InviteId}", inviteId);
            return new AcceptInviteResultDto(false, "Invite has already been used", null);
        }

        // Validate secrets
        if (inviteSecret != _inviteSecret || inviteSecretCode != _inviteSecretCode)
        {
            _logger.LogWarning("Invalid secrets for invite {InviteId}", inviteId);
            return new AcceptInviteResultDto(false, "Invalid invite link", null);
        }

        // Check that accepter is not the creator
        if (acceptingUserId == _creatorUserId)
        {
            _logger.LogWarning("User {UserId} tried to accept their own invite {InviteId}", acceptingUserId, inviteId);
            return new AcceptInviteResultDto(false, "Cannot accept your own invite", null);
        }

        try
        {
            // Add both users as contacts of each other
            var creatorGrain = _grainFactory.GetGrain<IUserGrain>(_creatorUserId!);
            var accepterGrain = _grainFactory.GetGrain<IUserGrain>(acceptingUserId);

            // Set context for the grain calls
            // Note: These calls bypass normal access validation since we're adding contacts mutually
            RequestContext.Set("UserId", _creatorUserId!);
            await creatorGrain.AddContactAsync(acceptingUserId);

            RequestContext.Set("UserId", acceptingUserId);
            await accepterGrain.AddContactAsync(_creatorUserId!);

            // Get the accepter's info to return
            var accepterInfo = await accepterGrain.GetContactInfoAsync();

            // Mark as accepted
            _isAccepted = true;

            _logger.LogInformation("Invite {InviteId} accepted: {Creator} and {Accepter} are now contacts",
                inviteId, _creatorUserId, acceptingUserId);

            // Return the creator as the new contact for the accepter
            var creatorContact = await creatorGrain.GetContactInfoAsync();
            return new AcceptInviteResultDto(true, null, creatorContact);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error accepting invite {InviteId}", inviteId);
            return new AcceptInviteResultDto(false, "Failed to add contacts", null);
        }
    }

    public Task<bool> IsValidAsync()
    {
        if (!_isInitialized)
        {
            return Task.FromResult(false);
        }

        if (_isAccepted)
        {
            return Task.FromResult(false);
        }

        if (DateTime.UtcNow > _expiresAt)
        {
            return Task.FromResult(false);
        }

        return Task.FromResult(true);
    }
}
