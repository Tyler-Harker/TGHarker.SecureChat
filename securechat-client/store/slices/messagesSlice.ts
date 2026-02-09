import { createSlice, createAsyncThunk, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';
import { apiClient, type Message } from '@/lib/api-client';
import type { RootState } from '../index';

// Entity adapter for normalized message storage
const messagesAdapter = createEntityAdapter<Message, string>({
  selectId: (message) => message.messageId,
  sortComparer: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
});

interface ConversationMessagesState {
  ids: string[];
  hasMore: boolean;
  isLoading: boolean;
  skip: number;
}

interface ThreadState {
  ids: string[];
  isLoading: boolean;
}

interface MessagesState extends ReturnType<typeof messagesAdapter.getInitialState> {
  conversationMessages: Record<string, ConversationMessagesState>;
  threads: Record<string, ThreadState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: MessagesState = messagesAdapter.getInitialState({
  conversationMessages: {},
  threads: {},
  status: 'idle',
  error: null,
});

// Async thunks
export const fetchMessages = createAsyncThunk(
  'messages/fetchMessages',
  async ({ conversationId, skip, take }: { conversationId: string; skip: number; take: number }) => {
    const messages = await apiClient.getMessages(conversationId, skip, take);
    return { conversationId, messages, skip, take };
  }
);

export const sendMessage = createAsyncThunk(
  'messages/sendMessage',
  async ({ conversationId, text, image }: { conversationId: string; text: string; image: File | null }) => {
    let attachmentId: string | undefined;

    if (image) {
      const attachment = await apiClient.uploadAttachment(conversationId, image);
      attachmentId = attachment.attachmentId;
    }

    // Encrypt message (placeholder - using simple base64 for now)
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(text);
    const ciphertext = btoa(String.fromCharCode(...messageBytes));
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
    const authTag = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

    const message = await apiClient.postMessage(conversationId, {
      attachmentId,
      encryptedContent: { ciphertext, nonce, authTag, keyVersion: 1 },
    });

    return { conversationId, message };
  }
);

export const fetchThreadReplies = createAsyncThunk(
  'messages/fetchThreadReplies',
  async ({ conversationId, parentMessageId }: { conversationId: string; parentMessageId: string }) => {
    const replies = await apiClient.getMessageReplies(conversationId, parentMessageId);
    return { parentMessageId, replies };
  }
);

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    // SSE event handlers
    addMessage: (state, action: PayloadAction<Message>) => {
      const message = action.payload;
      messagesAdapter.addOne(state, message);

      // Add to conversation messages list or thread
      if (!message.parentMessageId) {
        const conversationMessages = state.conversationMessages[message.conversationId];
        if (conversationMessages) {
          conversationMessages.ids.push(message.messageId);
        } else {
          state.conversationMessages[message.conversationId] = {
            ids: [message.messageId],
            hasMore: false,
            isLoading: false,
            skip: 1,
          };
        }
      } else {
        // Add to thread
        const thread = state.threads[message.parentMessageId];
        if (thread) {
          thread.ids.push(message.messageId);
        } else {
          state.threads[message.parentMessageId] = {
            ids: [message.messageId],
            isLoading: false,
          };
        }
      }
    },

    addReaction: (state, action: PayloadAction<{ messageId: string; emoji: string; userId: string }>) => {
      const { messageId, emoji, userId } = action.payload;
      const message = state.entities[messageId];
      if (message) {
        if (!message.reactions) {
          message.reactions = {};
        }
        if (!message.reactions[emoji]) {
          message.reactions[emoji] = [];
        }
        if (!message.reactions[emoji].includes(userId)) {
          message.reactions[emoji].push(userId);
        }
      }
    },

    removeReaction: (state, action: PayloadAction<{ messageId: string; emoji: string; userId: string }>) => {
      const { messageId, emoji, userId } = action.payload;
      const message = state.entities[messageId];
      if (message && message.reactions?.[emoji]) {
        message.reactions[emoji] = message.reactions[emoji].filter((id) => id !== userId);
        if (message.reactions[emoji].length === 0) {
          delete message.reactions[emoji];
        }
      }
    },

    addReadReceipt: (state, action: PayloadAction<{ messageId: string; userId: string }>) => {
      const { messageId, userId } = action.payload;
      const message = state.entities[messageId];
      if (message) {
        if (!message.readBy) {
          message.readBy = [];
        }
        if (!message.readBy.includes(userId)) {
          message.readBy.push(userId);
        }
      }
    },

    removeMessages: (state, action: PayloadAction<string[]>) => {
      messagesAdapter.removeMany(state, action.payload);
      // Also remove from conversation lists and threads
      Object.keys(state.conversationMessages).forEach((conversationId) => {
        state.conversationMessages[conversationId].ids = state.conversationMessages[conversationId].ids.filter(
          (id) => !action.payload.includes(id)
        );
      });
      Object.keys(state.threads).forEach((parentId) => {
        state.threads[parentId].ids = state.threads[parentId].ids.filter(
          (id) => !action.payload.includes(id)
        );
      });
    },

    updateReplyCount: (state, action: PayloadAction<{ messageId: string; count: number }>) => {
      const { messageId, count } = action.payload;
      const message = state.entities[messageId];
      if (message) {
        message.replyCount = count;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchMessages
      .addCase(fetchMessages.pending, (state, action) => {
        const { conversationId } = action.meta.arg;
        if (!state.conversationMessages[conversationId]) {
          state.conversationMessages[conversationId] = {
            ids: [],
            hasMore: true,
            isLoading: true,
            skip: 0,
          };
        } else {
          state.conversationMessages[conversationId].isLoading = true;
        }
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { conversationId, messages, skip, take } = action.payload;

        messagesAdapter.upsertMany(state, messages);

        if (!state.conversationMessages[conversationId]) {
          state.conversationMessages[conversationId] = {
            ids: [],
            hasMore: true,
            isLoading: false,
            skip: 0,
          };
        }

        const conversationMessages = state.conversationMessages[conversationId];

        // Add new message IDs (filter out thread replies)
        const newMessageIds = messages
          .filter((m) => !m.parentMessageId)
          .map((m) => m.messageId);

        if (skip === 0) {
          // Initial load: replace IDs
          conversationMessages.ids = newMessageIds;
        } else {
          // Pagination: prepend older messages
          conversationMessages.ids = [...newMessageIds, ...conversationMessages.ids];
        }

        conversationMessages.hasMore = messages.length >= take;
        conversationMessages.skip = skip + messages.length;
        conversationMessages.isLoading = false;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        const { conversationId } = action.meta.arg;
        if (state.conversationMessages[conversationId]) {
          state.conversationMessages[conversationId].isLoading = false;
        }
        state.error = action.error.message || 'Failed to fetch messages';
      })
      // sendMessage
      .addCase(sendMessage.fulfilled, (state, action) => {
        const { message, conversationId } = action.payload;
        messagesAdapter.addOne(state, message);

        if (!state.conversationMessages[conversationId]) {
          state.conversationMessages[conversationId] = {
            ids: [],
            hasMore: false,
            isLoading: false,
            skip: 0,
          };
        }

        state.conversationMessages[conversationId].ids.push(message.messageId);
      })
      // fetchThreadReplies
      .addCase(fetchThreadReplies.pending, (state, action) => {
        const { parentMessageId } = action.meta.arg;
        if (!state.threads[parentMessageId]) {
          state.threads[parentMessageId] = {
            ids: [],
            isLoading: true,
          };
        } else {
          state.threads[parentMessageId].isLoading = true;
        }
      })
      .addCase(fetchThreadReplies.fulfilled, (state, action) => {
        const { parentMessageId, replies } = action.payload;

        messagesAdapter.upsertMany(state, replies);

        if (!state.threads[parentMessageId]) {
          state.threads[parentMessageId] = {
            ids: [],
            isLoading: false,
          };
        }

        state.threads[parentMessageId].ids = replies.map((r) => r.messageId);
        state.threads[parentMessageId].isLoading = false;
      })
      .addCase(fetchThreadReplies.rejected, (state, action) => {
        const { parentMessageId } = action.meta.arg;
        if (state.threads[parentMessageId]) {
          state.threads[parentMessageId].isLoading = false;
        }
      });
  },
});

export const {
  addMessage,
  addReaction,
  removeReaction,
  addReadReceipt,
  removeMessages,
  updateReplyCount,
} = messagesSlice.actions;

export default messagesSlice.reducer;

// Selectors
export const messagesSelectors = messagesAdapter.getSelectors((state: RootState) => state.messages);

export const selectConversationMessages = (state: RootState, conversationId: string) => {
  const conversationData = state.messages.conversationMessages[conversationId];
  if (!conversationData) return [];
  return conversationData.ids.map((id: string) => state.messages.entities[id]).filter(Boolean) as Message[];
};

export const selectConversationPagination = (state: RootState, conversationId: string) => {
  const conversationData = state.messages.conversationMessages[conversationId];
  if (!conversationData) {
    return { messages: [], hasMore: true, isLoading: false, skip: 0 };
  }
  return {
    messages: conversationData.ids.map((id: string) => state.messages.entities[id]).filter(Boolean) as Message[],
    hasMore: conversationData.hasMore,
    isLoading: conversationData.isLoading,
    skip: conversationData.skip,
  };
};

export const selectThreadReplies = (state: RootState, parentMessageId: string) => {
  const threadData = state.messages.threads[parentMessageId];
  if (!threadData) return [];
  return threadData.ids.map((id: string) => state.messages.entities[id]).filter(Boolean) as Message[];
};
