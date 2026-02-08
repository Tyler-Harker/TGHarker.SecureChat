/**
 * API Client for SecureChat Backend
 */

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  publicIdentityKey: string; // Base64
  createdAt: string;
}

export interface UserRegistration {
  email: string;
  displayName: string;
  publicIdentityKey: string; // Base64
  encryptedPrivateKey: string; // Base64
  salt: string; // Base64
}

export type RetentionPeriod = 24 | 72 | 168 | 720;
export type ConversationMode = "Server" | "PeerToPeer";

export const RETENTION_LABELS: Record<RetentionPeriod, string> = {
  24: "24 hours",
  72: "3 days",
  168: "7 days",
  720: "30 days",
};

export interface Conversation {
  conversationId: string;
  participantUserIds: string[];
  createdByUserId: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  currentKeyVersion: number;
  retentionPolicy: RetentionPeriod;
  name?: string | null;
  mode?: ConversationMode;
}

export interface Message {
  messageId: string;
  conversationId: string;
  senderId: string;
  ciphertext: string; // Base64
  nonce: string; // Base64
  authTag: string; // Base64
  timestamp: string;
  keyRotationVersion: number;
  parentMessageId?: string;
  attachmentId?: string;
  readBy?: string[]; // User IDs who have read this message (client-side tracking)
  replyCount?: number; // Number of replies (client-side tracking)
  reactions?: Record<string, string[]>; // emoji -> userIds (client-side tracking)
}

export interface CreateConversationRequest {
  participantUserIds: string[];
  encryptedConversationKeys: Record<string, string>; // userId -> Base64-encoded encrypted key
  retentionPolicy?: RetentionPeriod;
}

export interface PostMessageRequest {
  parentMessageId?: string;
  attachmentId?: string;
  encryptedContent: {
    ciphertext: string; // Base64
    nonce: string; // Base64
    authTag: string; // Base64
    keyVersion: number;
  };
}

export interface AttachmentMetadata {
  attachmentId: string;
  conversationId: string;
  senderUserId: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  nonce: string;
  authTag: string;
  keyVersion: number;
  uploadedAt: string;
}

export interface FetchedAttachment {
  url: string;
  contentType: string;
  fileName: string;
}

export interface Contact {
  userId: string;
  email: string;
  displayName: string;
  nickname?: string;
}

export interface ContactRequest {
  requestId: string;
  fromUserId: string;
  toUserId: string;
  fromUserDisplayName: string;
  fromUserEmail: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
}

export interface CreateInviteResponse {
  inviteId: string;
  inviteSecret: string;
  inviteSecretCode: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface ContactInviteInfo {
  inviteId: string;
  creatorUserId: string;
  creatorDisplayName: string;
  createdAt: string;
  expiresAt: string;
  isAccepted: boolean;
}

export interface AcceptInviteResult {
  success: boolean;
  error?: string;
  newContact?: Contact;
}

export interface EnsureRegisteredResponse {
  profile: UserProfile;
  isNewUser: boolean;
}

export class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5280") {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  clearAccessToken(): void {
    this.accessToken = null;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  // ===== User Endpoints =====

  async registerUser(registration: UserRegistration): Promise<UserProfile> {
    return this.fetch<UserProfile>("/api/users/register", {
      method: "POST",
      body: JSON.stringify(registration),
    });
  }

  async getMyProfile(): Promise<UserProfile> {
    return this.fetch<UserProfile>("/api/users/me");
  }

  async ensureRegistered(): Promise<EnsureRegisteredResponse> {
    return this.fetch<EnsureRegisteredResponse>("/api/users/me/ensure", {
      method: "POST",
    });
  }

  async getPublicKey(userId: string): Promise<{ publicKey: string }> {
    return this.fetch<{ publicKey: string }>(`/api/users/${userId}/publickey`);
  }

  async updateKeys(
    publicKey: string,
    encryptedPrivateKey: string,
    salt: string
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>("/api/users/me/keys", {
      method: "PUT",
      body: JSON.stringify({ publicKey, encryptedPrivateKey, salt }),
    });
  }

  async getMyConversations(): Promise<string[]> {
    return this.fetch<string[]>("/api/users/me/conversations");
  }

  async getUnseenCounts(): Promise<Record<string, number>> {
    return this.fetch<Record<string, number>>("/api/users/me/unseen-counts");
  }

  async clearUnseenCount(conversationId: string): Promise<void> {
    await this.fetch<void>(`/api/users/me/unseen-counts/${conversationId}`, {
      method: "DELETE",
    });
  }

  async searchUsers(
    query: string,
    limit: number = 20
  ): Promise<Array<{ userId: string; email: string; displayName: string }>> {
    return this.fetch<Array<{ userId: string; email: string; displayName: string }>>(
      `/api/users/search?query=${encodeURIComponent(query)}&limit=${limit}`
    );
  }

  // ===== Contact Endpoints =====

  async getMyContacts(): Promise<Contact[]> {
    return this.fetch<Contact[]>("/api/users/me/contacts");
  }

  async removeContact(contactUserId: string): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/users/me/contacts/${encodeURIComponent(contactUserId)}`,
      { method: "DELETE" }
    );
  }

  async searchContacts(query: string): Promise<Contact[]> {
    return this.fetch<Contact[]>(
      `/api/users/me/contacts/search?query=${encodeURIComponent(query)}`
    );
  }

  async updateDisplayName(displayName: string): Promise<{ message: string }> {
    return this.fetch<{ message: string }>("/api/users/me/displayname", {
      method: "PUT",
      body: JSON.stringify({ displayName }),
    });
  }

  async setContactNickname(
    contactUserId: string,
    nickname: string
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/users/me/contacts/${encodeURIComponent(contactUserId)}/nickname`,
      {
        method: "PUT",
        body: JSON.stringify({ nickname }),
      }
    );
  }

  async removeContactNickname(contactUserId: string): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/users/me/contacts/${encodeURIComponent(contactUserId)}/nickname`,
      {
        method: "DELETE",
      }
    );
  }

  // ===== Contact Request Endpoints =====

  async sendContactRequest(userId: string): Promise<{ requestId: string; message: string }> {
    return this.fetch<{ requestId: string; message: string }>(
      `/api/contacts/request/${encodeURIComponent(userId)}`,
      { method: "POST" }
    );
  }

  async getPendingContactRequests(): Promise<ContactRequest[]> {
    return this.fetch<ContactRequest[]>("/api/contacts/requests/pending");
  }

  async acceptContactRequest(requestId: string): Promise<{ message: string; contact: Contact }> {
    return this.fetch<{ message: string; contact: Contact }>(
      `/api/contacts/requests/${encodeURIComponent(requestId)}/accept`,
      { method: "POST" }
    );
  }

  async declineContactRequest(requestId: string): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/contacts/requests/${encodeURIComponent(requestId)}/decline`,
      { method: "POST" }
    );
  }

  // ===== Contact Invite Endpoints =====

  async createInvite(): Promise<CreateInviteResponse> {
    return this.fetch<CreateInviteResponse>("/api/invites", {
      method: "POST",
    });
  }

  async getInvite(inviteId: string): Promise<ContactInviteInfo> {
    return this.fetch<ContactInviteInfo>(`/api/invites/${inviteId}`);
  }

  async acceptInvite(
    inviteId: string,
    inviteSecret: string,
    inviteSecretCode: string
  ): Promise<AcceptInviteResult> {
    return this.fetch<AcceptInviteResult>(`/api/invites/${inviteId}/accept`, {
      method: "POST",
      body: JSON.stringify({ inviteSecret, inviteSecretCode }),
    });
  }

  async isInviteValid(inviteId: string): Promise<boolean> {
    const result = await this.fetch<{ valid: boolean }>(
      `/api/invites/${inviteId}/valid`
    );
    return result.valid;
  }

  // ===== Conversation Endpoints =====

  async createConversation(
    request: CreateConversationRequest
  ): Promise<Conversation> {
    return this.fetch<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return this.fetch<Conversation>(`/api/conversations/${conversationId}`);
  }

  async renameConversation(
    conversationId: string,
    name: string | null
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/conversations/${conversationId}/name`,
      {
        method: "PUT",
        body: JSON.stringify({ name }),
      }
    );
  }

  async deleteConversation(conversationId: string): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(`/api/conversations/${conversationId}`, {
      method: "DELETE",
    });
  }

  async setConversationMode(
    conversationId: string,
    mode: ConversationMode
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/conversations/${conversationId}/mode`,
      {
        method: "PUT",
        body: JSON.stringify({ mode: mode === "PeerToPeer" ? 1 : 0 }),
      }
    );
  }

  async relaySignal(
    conversationId: string,
    signalData: string
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/conversations/${conversationId}/signal`,
      {
        method: "POST",
        body: JSON.stringify({ signalData }),
      }
    );
  }

  async announcePresence(
    conversationId: string
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/conversations/${conversationId}/presence`,
      { method: "POST" }
    );
  }

  async addParticipant(
    conversationId: string,
    userId: string
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/conversations/${conversationId}/participants`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      }
    );
  }

  async removeParticipant(
    conversationId: string,
    userId: string
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/conversations/${conversationId}/participants/${userId}`,
      {
        method: "DELETE",
      }
    );
  }

  async postMessage(
    conversationId: string,
    message: PostMessageRequest
  ): Promise<Message> {
    return this.fetch<Message>(
      `/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify(message),
      }
    );
  }

  async getMessages(
    conversationId: string,
    skip: number = 0,
    take: number = 50
  ): Promise<Message[]> {
    return this.fetch<Message[]>(
      `/api/conversations/${conversationId}/messages?skip=${skip}&take=${take}`
    );
  }

  async getMessageReplies(
    conversationId: string,
    parentMessageId: string,
    skip: number = 0,
    take: number = 50
  ): Promise<Message[]> {
    return this.fetch<Message[]>(
      `/api/conversations/${conversationId}/messages/${parentMessageId}/replies?skip=${skip}&take=${take}`
    );
  }

  async markMessageAsRead(
    conversationId: string,
    messageId: string
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>(
      `/api/conversations/${conversationId}/messages/${messageId}/read`,
      {
        method: "POST",
      }
    );
  }

  async getMessageReadReceipts(
    conversationId: string,
    messageId: string
  ): Promise<string[]> {
    return this.fetch<string[]>(
      `/api/conversations/${conversationId}/messages/${messageId}/read`
    );
  }

  // ===== Reaction Endpoints =====

  async toggleReaction(
    conversationId: string,
    messageId: string,
    emoji: string
  ): Promise<{ added: boolean; emoji: string; messageId: string }> {
    return this.fetch<{ added: boolean; emoji: string; messageId: string }>(
      `/api/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: "POST" }
    );
  }

  async getMessageReactions(
    conversationId: string,
    messageId: string
  ): Promise<Record<string, string[]>> {
    return this.fetch<Record<string, string[]>>(
      `/api/conversations/${conversationId}/messages/${messageId}/reactions`
    );
  }

  // ===== Push Notification Endpoints =====

  async getVapidPublicKey(): Promise<{ publicKey: string }> {
    return this.fetch<{ publicKey: string }>("/api/push/vapid-public-key");
  }

  async subscribePush(
    subscription: PushSubscription,
    deviceLabel?: string
  ): Promise<{ message: string }> {
    // toJSON() provides keys already in base64url format, which the WebPush C# library expects
    const json = subscription.toJSON();
    if (!json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("Push subscription missing required keys");
    }

    return this.fetch<{ message: string }>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        deviceLabel,
      }),
    });
  }

  async unsubscribePush(endpoint: string): Promise<{ message: string }> {
    return this.fetch<{ message: string }>("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    });
  }

  // ===== Attachment Endpoints =====

  async uploadAttachment(
    conversationId: string,
    file: File
  ): Promise<AttachmentMetadata> {
    // Placeholder encryption: use raw bytes with random nonce/authTag
    // When real E2EE is implemented, this will encrypt the file bytes
    const arrayBuffer = await file.arrayBuffer();
    const encryptedBytes = new Uint8Array(arrayBuffer);

    // Generate placeholder nonce and authTag (same pattern as text messages)
    const nonce = new Uint8Array(12);
    crypto.getRandomValues(nonce);
    const authTag = new Uint8Array(16);
    crypto.getRandomValues(authTag);

    const nonceB64 = btoa(String.fromCharCode(...nonce));
    const authTagB64 = btoa(String.fromCharCode(...authTag));

    const formData = new FormData();
    formData.append("file", new Blob([encryptedBytes]), file.name);
    formData.append("nonce", nonceB64);
    formData.append("authTag", authTagB64);
    formData.append("keyVersion", "1");
    formData.append("fileName", file.name);
    formData.append("contentType", file.type);

    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }
    // Do NOT set Content-Type — browser sets multipart boundary automatically

    const response = await fetch(
      `${this.baseUrl}/api/conversations/${conversationId}/attachments`,
      { method: "POST", headers, body: formData }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    return response.json();
  }

  async fetchAttachment(
    conversationId: string,
    attachmentId: string
  ): Promise<FetchedAttachment> {
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(
      `${this.baseUrl}/api/conversations/${conversationId}/attachments/${attachmentId}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch attachment: ${response.status}`);
    }

    // Read encryption metadata from headers
    const originalContentType =
      response.headers.get("X-Original-Content-Type") || "image/jpeg";
    const originalFileName =
      response.headers.get("X-Original-FileName") || "attachment";

    // Placeholder decryption: use bytes directly
    // When real E2EE is implemented, this will decrypt the bytes
    const encryptedBlob = await response.blob();
    const decryptedBlob = new Blob([encryptedBlob], { type: originalContentType });
    const url = URL.createObjectURL(decryptedBlob);

    return { url, contentType: originalContentType, fileName: originalFileName };
  }
}

// Export a singleton instance
export const apiClient = new ApiClient();
