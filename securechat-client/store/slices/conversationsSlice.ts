import { createSlice, createEntityAdapter, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { apiClient, type Conversation } from '@/lib/api-client';
import type { RootState } from '../index';

// Entity adapter for normalized conversation storage
const conversationsAdapter = createEntityAdapter<Conversation, string>({
  selectId: (conversation) => conversation.conversationId,
  sortComparer: (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
});

interface ConversationsState extends ReturnType<typeof conversationsAdapter.getInitialState> {
  unreadCounts: Record<string, number>;
  totalUnreadCount: number;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: ConversationsState = conversationsAdapter.getInitialState({
  unreadCounts: {},
  totalUnreadCount: 0,
  status: 'idle',
  error: null,
});

// Async thunks
export const fetchConversations = createAsyncThunk(
  'conversations/fetchConversations',
  async () => {
    const conversationIds = await apiClient.getMyConversations();
    const conversations = await Promise.all(
      conversationIds.map((id) => apiClient.getConversation(id))
    );
    return conversations;
  }
);

export const fetchUnseenCounts = createAsyncThunk(
  'conversations/fetchUnseenCounts',
  async () => {
    const counts = await apiClient.getUnseenCounts();
    return counts;
  }
);

export const deleteConversation = createAsyncThunk(
  'conversations/deleteConversation',
  async (conversationId: string) => {
    await apiClient.deleteConversation(conversationId);
    return conversationId;
  }
);

export const renameConversation = createAsyncThunk(
  'conversations/renameConversation',
  async ({ conversationId, name }: { conversationId: string; name: string }) => {
    await apiClient.renameConversation(conversationId, name);
    return { conversationId, name };
  }
);

const conversationsSlice = createSlice({
  name: 'conversations',
  initialState,
  reducers: {
    addConversation: (state, action: PayloadAction<Conversation>) => {
      conversationsAdapter.addOne(state, action.payload);
    },

    removeConversation: (state, action: PayloadAction<string>) => {
      conversationsAdapter.removeOne(state, action.payload);
      // Also remove unread count
      delete state.unreadCounts[action.payload];
      state.totalUnreadCount = Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);
    },

    updateConversationName: (state, action: PayloadAction<{ conversationId: string; name: string }>) => {
      const { conversationId, name } = action.payload;
      const conversation = state.entities[conversationId];
      if (conversation) {
        conversation.name = name;
      }
    },

    updateLastActivity: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const conversation = state.entities[conversationId];
      if (conversation) {
        conversation.lastActivityAt = new Date().toISOString();
        // Re-sort by moving to front
        state.ids = [
          conversationId,
          ...state.ids.filter((id) => id !== conversationId),
        ];
      }
    },

    incrementUnreadCount: (state, action: PayloadAction<{ conversationId: string }>) => {
      const { conversationId } = action.payload;
      const currentCount = state.unreadCounts[conversationId] || 0;
      state.unreadCounts[conversationId] = currentCount + 1;
      state.totalUnreadCount = Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);
    },

    clearUnreadCount: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      if (state.unreadCounts[conversationId]) {
        delete state.unreadCounts[conversationId];
        state.totalUnreadCount = Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);
      }
      // Also make API call to clear on backend
      apiClient.clearUnseenCount(conversationId).catch(() => {});
    },

    setUnreadCounts: (state, action: PayloadAction<Record<string, number>>) => {
      // Merge backend counts with local state, keeping the higher value
      const mergedCounts = { ...state.unreadCounts };
      for (const [key, value] of Object.entries(action.payload)) {
        if (value > 0) {
          mergedCounts[key] = Math.max(mergedCounts[key] || 0, value);
        }
      }
      state.unreadCounts = mergedCounts;
      state.totalUnreadCount = Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchConversations
      .addCase(fetchConversations.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        conversationsAdapter.setAll(state, action.payload);
        state.status = 'succeeded';
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to fetch conversations';
      })
      // fetchUnseenCounts
      .addCase(fetchUnseenCounts.fulfilled, (state, action) => {
        // Merge with existing counts, keeping higher value
        const mergedCounts = { ...state.unreadCounts };
        for (const [key, value] of Object.entries(action.payload)) {
          if (value > 0) {
            mergedCounts[key] = Math.max(mergedCounts[key] || 0, value);
          }
        }
        state.unreadCounts = mergedCounts;
        state.totalUnreadCount = Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);
      })
      // deleteConversation
      .addCase(deleteConversation.fulfilled, (state, action) => {
        conversationsAdapter.removeOne(state, action.payload);
        delete state.unreadCounts[action.payload];
        state.totalUnreadCount = Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);
      })
      // renameConversation
      .addCase(renameConversation.fulfilled, (state, action) => {
        const { conversationId, name } = action.payload;
        const conversation = state.entities[conversationId];
        if (conversation) {
          conversation.name = name;
        }
      });
  },
});

export const {
  addConversation,
  removeConversation,
  updateConversationName,
  updateLastActivity,
  incrementUnreadCount,
  clearUnreadCount,
  setUnreadCounts,
} = conversationsSlice.actions;

export default conversationsSlice.reducer;

// Selectors
export const conversationsSelectors = conversationsAdapter.getSelectors((state: RootState) => state.conversations);

export const selectAllConversations = (state: RootState) => {
  return state.conversations.ids.map((id) => state.conversations.entities[id]).filter(Boolean) as Conversation[];
};

export const selectConversation = (state: RootState, conversationId: string) => {
  return state.conversations.entities[conversationId];
};

export const selectUnreadCounts = (state: RootState) => state.conversations.unreadCounts;

export const selectTotalUnreadCount = (state: RootState) => state.conversations.totalUnreadCount;
