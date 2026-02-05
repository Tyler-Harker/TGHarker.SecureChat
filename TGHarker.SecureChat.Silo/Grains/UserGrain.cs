using Orleans;
using Orleans.Providers;
using Orleans.Runtime;
using TGHarker.SecureChat.Contracts.Grains;
using TGHarker.SecureChat.Contracts.Models;
using TGHarker.SecureChat.ServiceDefaults.Cryptography.Models;

namespace TGHarker.SecureChat.Silo.Grains;

[StorageProvider(ProviderName = "AzureBlobStorage")]
public class UserGrain : Grain, IUserGrain
{
    private readonly IPersistentState<UserGrainState> _state;
    private readonly ILogger<UserGrain> _logger;

    public UserGrain(
        [PersistentState("user", "AzureBlobStorage")] IPersistentState<UserGrainState> state,
        ILogger<UserGrain> logger)
    {
        _state = state;
        _logger = logger;
    }

    private string GetCallingUserId()
    {
        return RequestContext.Get("UserId") as string
            ?? throw new UnauthorizedAccessException("No user context in request");
    }

    private void ValidateAccess()
    {
        var callingUserId = GetCallingUserId();
        var thisUserId = this.GetPrimaryKeyString();

        if (callingUserId != thisUserId)
        {
            _logger.LogWarning("Unauthorized access attempt: {CallingUser} tried to access {TargetUser}",
                callingUserId, thisUserId);
            throw new UnauthorizedAccessException($"Cannot access user grain for {thisUserId}");
        }
    }

    public async Task RegisterAsync(UserRegistrationDto registration)
    {
        if (_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is already registered");
        }

        var userId = this.GetPrimaryKeyString();
        _state.State.UserId = userId;
        _state.State.Email = registration.Email;
        _state.State.DisplayName = registration.DisplayName;
        _state.State.IdentityKeys = new UserIdentityKeys
        {
            PublicIdentityKey = registration.PublicIdentityKey,
            EncryptedPrivateIdentityKey = registration.EncryptedPrivateKey,
            Salt = registration.Salt,
            CreatedAt = DateTime.UtcNow
        };
        _state.State.CreatedAt = DateTime.UtcNow;
        _state.State.LastActiveAt = DateTime.UtcNow;
        _state.State.IsRegistered = true;

        await _state.WriteStateAsync();

        // TODO: Index user for search when TGHarker.Orleans.Search is configured
        // await _searchIndexer.IndexAsync("users", userId, new Dictionary<string, object>
        // {
        //     ["email"] = registration.Email.ToLowerInvariant(),
        //     ["displayName"] = registration.DisplayName.ToLowerInvariant(),
        //     ["displayNameOriginal"] = registration.DisplayName
        // });

        _logger.LogInformation("User {UserId} registered successfully", userId);
    }

    public async Task<UserProfileDto> GetProfileAsync()
    {
        ValidateAccess();

        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        return new UserProfileDto(
            UserId: _state.State.UserId,
            Email: _state.State.Email,
            DisplayName: _state.State.DisplayName,
            PublicIdentityKey: _state.State.IdentityKeys?.PublicIdentityKey ?? Array.Empty<byte>(),
            CreatedAt: _state.State.CreatedAt
        );
    }

    public async Task UpdatePublicKeyAsync(byte[] publicKey, byte[] encryptedPrivateKey, byte[] salt)
    {
        ValidateAccess();

        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        _state.State.IdentityKeys = new UserIdentityKeys
        {
            PublicIdentityKey = publicKey,
            EncryptedPrivateIdentityKey = encryptedPrivateKey,
            Salt = salt,
            CreatedAt = DateTime.UtcNow
        };

        await _state.WriteStateAsync();
        _logger.LogInformation("Updated identity keys for user {UserId}", _state.State.UserId);
    }

    public async Task<List<Guid>> GetConversationIdsAsync()
    {
        ValidateAccess();

        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        return _state.State.ConversationIds.ToList();
    }

    public async Task AddConversationAsync(Guid conversationId)
    {
        // This can be called by ConversationGrain, so we don't validate access the same way
        // Instead, we trust that ConversationGrain has already validated the user is a participant

        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        if (_state.State.ConversationIds.Add(conversationId))
        {
            await _state.WriteStateAsync();
            _logger.LogInformation("Added conversation {ConversationId} to user {UserId}",
                conversationId, _state.State.UserId);
        }
    }

    public async Task RemoveConversationAsync(Guid conversationId)
    {
        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        if (_state.State.ConversationIds.Remove(conversationId))
        {
            await _state.WriteStateAsync();
            _logger.LogInformation("Removed conversation {ConversationId} from user {UserId}",
                conversationId, _state.State.UserId);
        }
    }

    public Task<byte[]> GetPublicIdentityKeyAsync()
    {
        // Public key is publicly accessible for ECDH key exchange
        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        return Task.FromResult(_state.State.IdentityKeys?.PublicIdentityKey ?? Array.Empty<byte>());
    }

    public async Task UpdateLastActiveAsync()
    {
        ValidateAccess();

        _state.State.LastActiveAt = DateTime.UtcNow;
        await _state.WriteStateAsync();
    }

    public async Task AddContactAsync(string contactUserId)
    {
        ValidateAccess();

        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        if (contactUserId == this.GetPrimaryKeyString())
        {
            throw new InvalidOperationException("Cannot add yourself as a contact");
        }

        if (_state.State.ContactUserIds.Add(contactUserId))
        {
            await _state.WriteStateAsync();
            _logger.LogInformation("User {UserId} added contact {ContactUserId}",
                _state.State.UserId, contactUserId);
        }
    }

    public async Task RemoveContactAsync(string contactUserId)
    {
        ValidateAccess();

        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        if (_state.State.ContactUserIds.Remove(contactUserId))
        {
            await _state.WriteStateAsync();
            _logger.LogInformation("User {UserId} removed contact {ContactUserId}",
                _state.State.UserId, contactUserId);
        }
    }

    public Task<List<string>> GetContactIdsAsync()
    {
        ValidateAccess();

        if (!_state.State.IsRegistered)
        {
            throw new InvalidOperationException("User is not registered");
        }

        return Task.FromResult(_state.State.ContactUserIds.ToList());
    }

    public Task<ContactDto?> GetContactInfoAsync()
    {
        // Publicly accessible - returns basic info for display in contact lists
        if (!_state.State.IsRegistered)
        {
            return Task.FromResult<ContactDto?>(null);
        }

        return Task.FromResult<ContactDto?>(new ContactDto(
            UserId: _state.State.UserId,
            Email: _state.State.Email,
            DisplayName: _state.State.DisplayName
        ));
    }

    public async Task<(UserProfileDto Profile, bool IsNewUser)> EnsureRegisteredAsync(string email, string displayName)
    {
        ValidateAccess();

        var isNewUser = false;

        if (!_state.State.IsRegistered)
        {
            var userId = this.GetPrimaryKeyString();
            _state.State.UserId = userId;
            _state.State.Email = email;
            _state.State.DisplayName = displayName;
            _state.State.IdentityKeys = null; // No crypto keys yet - can be set up later
            _state.State.CreatedAt = DateTime.UtcNow;
            _state.State.LastActiveAt = DateTime.UtcNow;
            _state.State.IsRegistered = true;

            await _state.WriteStateAsync();
            _logger.LogInformation("User {UserId} auto-registered via EnsureRegistered", userId);
            isNewUser = true;
        }
        else
        {
            // Update last active timestamp
            _state.State.LastActiveAt = DateTime.UtcNow;
            await _state.WriteStateAsync();
        }

        var profile = new UserProfileDto(
            UserId: _state.State.UserId,
            Email: _state.State.Email,
            DisplayName: _state.State.DisplayName,
            PublicIdentityKey: _state.State.IdentityKeys?.PublicIdentityKey ?? Array.Empty<byte>(),
            CreatedAt: _state.State.CreatedAt
        );

        return (profile, isNewUser);
    }

    public Task<bool> IsRegisteredAsync()
    {
        return Task.FromResult(_state.State.IsRegistered);
    }
}
