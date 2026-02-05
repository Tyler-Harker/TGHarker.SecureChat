using TGHarker.SecureChat.ServiceDefaults.Cryptography.Models;

namespace TGHarker.SecureChat.ServiceDefaults.Cryptography;

public interface IEndToEndEncryptionService
{
    /// <summary>
    /// Generates a new X25519 identity key pair for a user.
    /// The private key is encrypted with the provided KEK before being returned.
    /// </summary>
    /// <param name="kek">Key Encryption Key derived from user's encryption password</param>
    /// <returns>Tuple of (publicKey, encryptedPrivateKey, salt)</returns>
    Task<(byte[] publicKey, byte[] encryptedPrivateKey, byte[] salt)> GenerateIdentityKeyPairAsync(byte[] kek);

    /// <summary>
    /// Derives a shared conversation key using ECDH with another user's public key.
    /// Uses HKDF to derive the final AES-256 key from the shared secret.
    /// </summary>
    /// <param name="myPrivateKey">This user's decrypted X25519 private key</param>
    /// <param name="theirPublicKey">Other user's X25519 public key</param>
    /// <param name="conversationId">Conversation ID as additional context for HKDF</param>
    /// <returns>32-byte AES-256 conversation key</returns>
    Task<byte[]> DeriveConversationKeyAsync(byte[] myPrivateKey, byte[] theirPublicKey, string conversationId);

    /// <summary>
    /// Encrypts a plaintext message using AES-256-GCM.
    /// </summary>
    /// <param name="plaintext">Message to encrypt</param>
    /// <param name="conversationKey">Shared conversation key</param>
    /// <returns>Encrypted message with ciphertext, nonce, and authentication tag</returns>
    Task<EncryptedMessage> EncryptMessageAsync(string plaintext, byte[] conversationKey);

    /// <summary>
    /// Decrypts an encrypted message using AES-256-GCM.
    /// Verifies the authentication tag to ensure integrity.
    /// </summary>
    /// <param name="encrypted">Encrypted message</param>
    /// <param name="conversationKey">Shared conversation key</param>
    /// <returns>Decrypted plaintext message</returns>
    /// <exception cref="System.Security.Cryptography.CryptographicException">If authentication fails</exception>
    Task<string> DecryptMessageAsync(EncryptedMessage encrypted, byte[] conversationKey);

    /// <summary>
    /// Derives a Key Encryption Key (KEK) from a password using Argon2id.
    /// This KEK is used to encrypt the user's private identity key.
    /// </summary>
    /// <param name="password">User's encryption password</param>
    /// <param name="salt">Salt for key derivation (should be generated randomly and stored)</param>
    /// <returns>32-byte KEK</returns>
    byte[] DeriveKEKFromPassword(string password, byte[] salt);

    /// <summary>
    /// Generates a cryptographically secure random salt for Argon2id key derivation.
    /// </summary>
    /// <returns>16-byte random salt</returns>
    byte[] GenerateSalt();

    /// <summary>
    /// Decrypts a user's private identity key using their KEK.
    /// </summary>
    /// <param name="encryptedPrivateKey">Encrypted private key</param>
    /// <param name="kek">Key Encryption Key</param>
    /// <param name="nonce">Nonce used during encryption</param>
    /// <returns>Decrypted private key</returns>
    Task<byte[]> DecryptPrivateKeyAsync(byte[] encryptedPrivateKey, byte[] kek, byte[] nonce);
}
