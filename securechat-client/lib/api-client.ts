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

export interface Conversation {
  conversationId: string;
  participantUserIds: string[];
  createdByUserId: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  currentKeyVersion: number;
}

export interface Message {
  messageId: string;
  conversationId: string;
  senderId: string;
  ciphertext: string; // Base64
  nonce: string; // Base64
  timestamp: string;
  keyRotationVersion: number;
  parentMessageId?: string;
}

export interface CreateConversationRequest {
  participantUserIds: string[];
  conversationKeyEncrypted: string; // Base64
  conversationNonceEncrypted: string; // Base64
}

export interface PostMessageRequest {
  ciphertext: string; // Base64
  nonce: string; // Base64
  timestamp: string;
  parentMessageId?: string;
}

export class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000") {
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
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
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

  async searchUsers(
    query: string,
    limit: number = 20
  ): Promise<Array<{ userId: string; email: string; displayName: string }>> {
    return this.fetch<Array<{ userId: string; email: string; displayName: string }>>(
      `/api/users/search?query=${encodeURIComponent(query)}&limit=${limit}`
    );
  }

  // ===== Conversation Endpoints =====

  async createConversation(
    request: CreateConversationRequest
  ): Promise<{ conversationId: string; createdAt: string }> {
    return this.fetch<{ conversationId: string; createdAt: string }>(
      "/api/conversations",
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return this.fetch<Conversation>(`/api/conversations/${conversationId}`);
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
}

// Export a singleton instance
export const apiClient = new ApiClient();
