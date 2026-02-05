using Orleans;

namespace TGHarker.SecureChat.Contracts.Models;

[GenerateSerializer]
public record MessageDto(
    Guid MessageId,
    Guid ConversationId,
    string SenderUserId,
    Guid? ParentMessageId,
    EncryptedMessageDto EncryptedContent,
    DateTime CreatedAt,
    List<Guid> ReplyIds
);

[GenerateSerializer]
public record EncryptedMessageDto(
    byte[] Ciphertext,
    byte[] Nonce,
    byte[] AuthTag,
    int KeyVersion
);

[GenerateSerializer]
public record PostMessageDto(
    Guid? ParentMessageId,
    EncryptedMessageDto EncryptedContent
);
