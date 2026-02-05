using Orleans;
using TGHarker.SecureChat.Contracts.Models;

namespace TGHarker.SecureChat.Silo.Grains;

[GenerateSerializer]
public class ContactRequestGrainState
{
    [Id(0)]
    public string RequestId { get; set; } = string.Empty;

    [Id(1)]
    public string FromUserId { get; set; } = string.Empty;

    [Id(2)]
    public string ToUserId { get; set; } = string.Empty;

    [Id(3)]
    public string FromUserDisplayName { get; set; } = string.Empty;

    [Id(4)]
    public string FromUserEmail { get; set; } = string.Empty;

    [Id(5)]
    public ContactRequestStatus Status { get; set; } = ContactRequestStatus.Pending;

    [Id(6)]
    public DateTime CreatedAt { get; set; }

    [Id(7)]
    public DateTime? RespondedAt { get; set; }
}
