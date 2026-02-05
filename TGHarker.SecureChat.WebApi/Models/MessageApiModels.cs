namespace TGHarker.SecureChat.WebApi.Models;

/// <summary>
/// API response model for messages that matches the frontend interface.
/// Frontend expects flat structure with base64-encoded fields.
/// </summary>
public record MessageApiResponse
{
    public string MessageId { get; init; } = string.Empty;
    public string ConversationId { get; init; } = string.Empty;
    public string SenderId { get; init; } = string.Empty;
    public string Ciphertext { get; init; } = string.Empty; // Base64
    public string Nonce { get; init; } = string.Empty; // Base64
    public string AuthTag { get; init; } = string.Empty; // Base64
    public string Timestamp { get; init; } = string.Empty;
    public int KeyRotationVersion { get; init; }
    public string? ParentMessageId { get; init; }
    public string? AttachmentId { get; init; }
    public Dictionary<string, List<string>>? Reactions { get; init; }
}
