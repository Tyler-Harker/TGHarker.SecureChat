using Orleans;

namespace TGHarker.SecureChat.ServiceDefaults.Cryptography.Models;

[GenerateSerializer]
public class UserIdentityKeys
{
    [Id(0)]
    public byte[] PublicIdentityKey { get; set; } = Array.Empty<byte>(); // 32 bytes X25519 public key

    [Id(1)]
    public byte[] EncryptedPrivateIdentityKey { get; set; } = Array.Empty<byte>(); // Private key encrypted with KEK

    [Id(2)]
    public byte[] Salt { get; set; } = Array.Empty<byte>(); // For KEK derivation

    [Id(3)]
    public DateTime CreatedAt { get; set; }
}
