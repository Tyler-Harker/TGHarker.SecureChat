/**
 * IndexedDB-backed queue for undelivered P2P messages.
 * Messages are enqueued when a peer is offline and drained when they reconnect.
 */

import type { P2PMessage } from "./p2p-manager";

export interface QueuedMessage {
  id: string;
  conversationId: string;
  recipientId: string;
  message: P2PMessage;
  queuedAt: string;
}

const DB_NAME = "SecureChatP2PQueue";
const DB_VERSION = 1;
const STORE_NAME = "pendingMessages";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ["conversationId", "recipientId", "id"],
        });
        store.createIndex("byRecipient", ["conversationId", "recipientId"]);
        store.createIndex("byConversation", "conversationId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class P2PMessageQueue {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb();
    }
    return this.dbPromise;
  }

  async enqueue(
    conversationId: string,
    recipientId: string,
    message: P2PMessage
  ): Promise<void> {
    const db = await this.getDb();
    const item: QueuedMessage = {
      id: message.id,
      conversationId,
      recipientId,
      message,
      queuedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async dequeue(messageId: string, recipientId: string): Promise<void> {
    const db = await this.getDb();
    // We need to find and delete the matching entry
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve();
          return;
        }
        const value = cursor.value as QueuedMessage;
        if (value.id === messageId && value.recipientId === recipientId) {
          cursor.delete();
          resolve();
          return;
        }
        cursor.continue();
      };

      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async getForRecipient(
    conversationId: string,
    recipientId: string
  ): Promise<QueuedMessage[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("byRecipient");
      const request = index.getAll([conversationId, recipientId]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(conversationId: string): Promise<QueuedMessage[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("byConversation");
      const request = index.getAll(conversationId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(conversationId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("byConversation");
      const cursorReq = index.openCursor(conversationId);

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve();
          return;
        }
        cursor.delete();
        cursor.continue();
      };

      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }
}
