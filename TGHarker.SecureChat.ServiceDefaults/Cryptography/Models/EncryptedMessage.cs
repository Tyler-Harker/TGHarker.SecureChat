using Orleans;

namespace TGHarker.SecureChat.ServiceDefaults.Cryptography.Models;

[GenerateSerializer]
public class EncryptedMessage
{
    [Id(0)]
    public byte[] Ciphertext { get; set; } = Array.Empty<byte>();

    [Id(1)]
    public byte[] Nonce { get; set; } = Array.Empty<byte>(); // 12 bytes for AES-GCM

    [Id(2)]
    public byte[] AuthTag { get; set; } = Array.Empty<byte>(); // 16 bytes authentication tag

    [Id(3)]
    public int KeyVersion { get; set; } // For key rotation tracking
}
