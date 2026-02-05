using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;
using NSec.Cryptography;
using TGHarker.SecureChat.ServiceDefaults.Cryptography.Models;

namespace TGHarker.SecureChat.ServiceDefaults.Cryptography;

public class EndToEndEncryptionService : IEndToEndEncryptionService
{
    private static readonly KeyAgreementAlgorithm X25519 = KeyAgreementAlgorithm.X25519;
    private static readonly AeadAlgorithm AesGcm = AeadAlgorithm.Aes256Gcm;
    private static readonly KeyDerivationAlgorithm HkdfSha256 = KeyDerivationAlgorithm.HkdfSha256;

    public async Task<(byte[] publicKey, byte[] encryptedPrivateKey, byte[] salt)> GenerateIdentityKeyPairAsync(byte[] kek)
    {
        return await Task.Run(() =>
        {
            // Generate X25519 key pair
            using var key = Key.Create(X25519, new KeyCreationParameters { ExportPolicy = KeyExportPolicies.AllowPlaintextExport });

            // Export public and private keys
            var publicKey = key.PublicKey.Export(KeyBlobFormat.RawPublicKey);
            var privateKey = key.Export(KeyBlobFormat.RawPrivateKey);

            // Generate salt for private key encryption
            var salt = GenerateSalt();

            // Encrypt private key with KEK using AES-256-GCM
            var nonce = new byte[12]; // AES-GCM nonce size
            RandomNumberGenerator.Fill(nonce);

            using var kekKey = Key.Import(AesGcm, kek, KeyBlobFormat.RawSymmetricKey);
            var encryptedPrivateKey = AesGcm.Encrypt(kekKey, nonce, null, privateKey);

            // Combine nonce + ciphertext for storage
            var result = new byte[nonce.Length + encryptedPrivateKey.Length];
            Buffer.BlockCopy(nonce, 0, result, 0, nonce.Length);
            Buffer.BlockCopy(encryptedPrivateKey, 0, result, nonce.Length, encryptedPrivateKey.Length);

            return (publicKey, result, salt);
        });
    }

    public async Task<byte[]> DeriveConversationKeyAsync(byte[] myPrivateKey, byte[] theirPublicKey, string conversationId)
    {
        return await Task.Run(() =>
        {
            // Import keys
            using var privateKey = Key.Import(X25519, myPrivateKey, KeyBlobFormat.RawPrivateKey, new KeyCreationParameters { ExportPolicy = KeyExportPolicies.AllowPlaintextExport });
            var theirPublicKeyObj = PublicKey.Import(X25519, theirPublicKey, KeyBlobFormat.RawPublicKey);

            // Perform ECDH to get shared secret
            using var sharedSecret = X25519.Agree(privateKey, theirPublicKeyObj);

            if (sharedSecret == null)
                throw new CryptographicException("Failed to derive shared secret");

            // Use HKDF to derive conversation key from shared secret
            var info = Encoding.UTF8.GetBytes($"conversation:{conversationId}");

            // Derive a 256-bit key using HKDF-SHA256
            using var conversationKey = HkdfSha256.DeriveKey(sharedSecret, null, info, AesGcm);

            // Export the key to byte array
            return conversationKey.Export(KeyBlobFormat.RawSymmetricKey);
        });
    }

    public async Task<EncryptedMessage> EncryptMessageAsync(string plaintext, byte[] conversationKey)
    {
        return await Task.Run(() =>
        {
            var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
            var nonce = new byte[12]; // AES-GCM nonce
            RandomNumberGenerator.Fill(nonce);

            using var key = Key.Import(AesGcm, conversationKey, KeyBlobFormat.RawSymmetricKey);
            var ciphertext = AesGcm.Encrypt(key, nonce, null, plaintextBytes);

            // NSec includes the auth tag in the ciphertext
            // Split it out for our EncryptedMessage model
            var authTagLength = AesGcm.TagSize;
            var actualCiphertext = new byte[ciphertext.Length - authTagLength];
            var authTag = new byte[authTagLength];

            Buffer.BlockCopy(ciphertext, 0, actualCiphertext, 0, actualCiphertext.Length);
            Buffer.BlockCopy(ciphertext, actualCiphertext.Length, authTag, 0, authTagLength);

            return new EncryptedMessage
            {
                Ciphertext = actualCiphertext,
                Nonce = nonce,
                AuthTag = authTag,
                KeyVersion = 1 // Default to version 1
            };
        });
    }

    public async Task<string> DecryptMessageAsync(EncryptedMessage encrypted, byte[] conversationKey)
    {
        return await Task.Run(() =>
        {
            // Recombine ciphertext and auth tag for NSec
            var combinedCiphertext = new byte[encrypted.Ciphertext.Length + encrypted.AuthTag.Length];
            Buffer.BlockCopy(encrypted.Ciphertext, 0, combinedCiphertext, 0, encrypted.Ciphertext.Length);
            Buffer.BlockCopy(encrypted.AuthTag, 0, combinedCiphertext, encrypted.Ciphertext.Length, encrypted.AuthTag.Length);

            using var key = Key.Import(AesGcm, conversationKey, KeyBlobFormat.RawSymmetricKey);
            var plaintextBytes = AesGcm.Decrypt(key, encrypted.Nonce, null, combinedCiphertext);

            if (plaintextBytes == null)
                throw new CryptographicException("Decryption failed - authentication tag verification failed");

            return Encoding.UTF8.GetString(plaintextBytes);
        });
    }

    public byte[] DeriveKEKFromPassword(string password, byte[] salt)
    {
        using var argon2 = new Konscious.Security.Cryptography.Argon2id(Encoding.UTF8.GetBytes(password))
        {
            Salt = salt,
            DegreeOfParallelism = 4,
            Iterations = 3,
            MemorySize = 65536 // 64 MB
        };

        return argon2.GetBytes(32); // 256-bit key
    }

    public byte[] GenerateSalt()
    {
        var salt = new byte[16]; // 128-bit salt
        RandomNumberGenerator.Fill(salt);
        return salt;
    }

    public async Task<byte[]> DecryptPrivateKeyAsync(byte[] encryptedPrivateKey, byte[] kek, byte[] nonce)
    {
        return await Task.Run(() =>
        {
            // Extract nonce and ciphertext
            var nonceFromData = new byte[12];
            var ciphertext = new byte[encryptedPrivateKey.Length - 12];

            Buffer.BlockCopy(encryptedPrivateKey, 0, nonceFromData, 0, 12);
            Buffer.BlockCopy(encryptedPrivateKey, 12, ciphertext, 0, ciphertext.Length);

            using var kekKey = Key.Import(AesGcm, kek, KeyBlobFormat.RawSymmetricKey);
            var privateKey = AesGcm.Decrypt(kekKey, nonceFromData, null, ciphertext);

            if (privateKey == null)
                throw new CryptographicException("Failed to decrypt private key");

            return privateKey;
        });
    }
}
