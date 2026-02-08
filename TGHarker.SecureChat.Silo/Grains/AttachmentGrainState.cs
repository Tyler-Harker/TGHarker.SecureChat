using Orleans;

namespace TGHarker.SecureChat.Silo.Grains;

[GenerateSerializer]
public class AttachmentGrainState
{
    [Id(0)]
    public Guid AttachmentId { get; set; }

    [Id(1)]
    public Guid ConversationId { get; set; }

    [Id(2)]
    public string SenderUserId { get; set; } = string.Empty;

    [Id(3)]
    public string FileName { get; set; } = string.Empty;

    [Id(4)]
    public string ContentType { get; set; } = string.Empty;

    [Id(5)]
    public long FileSizeBytes { get; set; }

    [Id(6)]
    public string Nonce { get; set; } = string.Empty;

    [Id(7)]
    public string AuthTag { get; set; } = string.Empty;

    [Id(8)]
    public int KeyVersion { get; set; }

    [Id(9)]
    public DateTime UploadedAt { get; set; }

    /// <summary>
    /// The encrypted binary data of the attachment.
    /// </summary>
    [Id(10)]
    public byte[] Data { get; set; } = Array.Empty<byte>();

    [Id(11)]
    public bool IsStored { get; set; }
}
