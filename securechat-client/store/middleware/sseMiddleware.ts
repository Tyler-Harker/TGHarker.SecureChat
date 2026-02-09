import { Middleware } from '@reduxjs/toolkit';
import { setAccessToken, clearAuth } from '../slices/authSlice';
import { addMessage, addReaction, removeReaction, addReadReceipt, removeMessages } from '../slices/messagesSlice';
import { addConversation, removeConversation, updateConversationName, incrementUnreadCount, setUnreadCounts, updateLastActivity } from '../slices/conversationsSlice';
import { addContact, addContactRequest, removeContactRequest } from '../slices/contactsSlice';
import { setSelectedConversation } from '../slices/uiSlice';

let globalEventSource: EventSource | null = null;
let conversationEventSource: EventSource | null = null;
let activeConversationId: string | null = null;

export const sseMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);

  // Handle auth token changes
  if (setAccessToken.match(action)) {
    connectGlobalSSE(store.dispatch, action.payload);
  } else if (clearAuth.match(action)) {
    disconnectGlobalSSE();
    disconnectConversationSSE();
  }

  // Handle conversation selection changes
  if (setSelectedConversation.match(action)) {
    const newConversationId = action.payload;

    if (activeConversationId !== newConversationId) {
      disconnectConversationSSE();
      activeConversationId = newConversationId;

      if (newConversationId) {
        const state = store.getState();
        const accessToken = state.auth.accessToken;
        if (accessToken) {
          connectConversationSSE(store.dispatch, newConversationId, accessToken);
        }
      }
    }
  }

  return result;
};

function connectGlobalSSE(dispatch: any, accessToken: string) {
  if (globalEventSource) {
    globalEventSource.close();
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5280';
  const sseUrl = `${apiUrl}/api/users/me/events?access_token=${accessToken}`;

  globalEventSource = new EventSource(sseUrl);

  globalEventSource.onopen = () => {
    console.log('[SSE] Global connection opened');
  };

  globalEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'new_message_indicator':
          dispatch(incrementUnreadCount({
            conversationId: data.conversationId,
          }));
          dispatch(updateLastActivity(data.conversationId));
          break;

        case 'conversation_created':
          dispatch(addConversation(data.conversation));
          break;

        case 'conversation_deleted':
          dispatch(removeConversation(data.conversationId));
          break;

        case 'contact_request':
          dispatch(addContactRequest(data.request));
          break;

        case 'contact_request_accepted':
          dispatch(addContact(data.contact));
          break;

        case 'contact_removed':
          // Handle contact removal
          break;

        default:
          console.log('[SSE] Unknown global event type:', data.type);
      }
    } catch (error) {
      console.error('[SSE] Failed to parse global event:', error);
    }
  };

  globalEventSource.onerror = () => {
    console.error('[SSE] Global connection error');
    globalEventSource?.close();
    globalEventSource = null;

    // Retry after 5 seconds
    setTimeout(() => {
      if (accessToken) {
        connectGlobalSSE(dispatch, accessToken);
      }
    }, 5000);
  };

  // Also fetch initial unseen counts
  fetch(`${apiUrl}/api/users/me/unseen-counts`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })
    .then(response => response.json())
    .then(counts => {
      dispatch(setUnreadCounts(counts));
    })
    .catch(error => {
      console.error('[SSE] Failed to fetch initial unseen counts:', error);
    });
}

function connectConversationSSE(dispatch: any, conversationId: string, accessToken: string) {
  if (conversationEventSource) {
    conversationEventSource.close();
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5280';
  const sseUrl = `${apiUrl}/api/conversations/${conversationId}/events?access_token=${accessToken}`;

  conversationEventSource = new EventSource(sseUrl);

  conversationEventSource.onopen = () => {
    console.log(`[SSE] Conversation ${conversationId} connection opened`);
  };

  conversationEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'message':
          dispatch(addMessage(data.message));
          break;

        case 'reaction_added':
          dispatch(addReaction({
            messageId: data.messageId,
            emoji: data.emoji,
            userId: data.userId,
          }));
          break;

        case 'reaction_removed':
          dispatch(removeReaction({
            messageId: data.messageId,
            emoji: data.emoji,
            userId: data.userId,
          }));
          break;

        case 'read_receipt':
          dispatch(addReadReceipt({
            messageId: data.messageId,
            userId: data.userId,
          }));
          break;

        case 'conversation_renamed':
          dispatch(updateConversationName({
            conversationId: data.conversationId,
            name: data.name,
          }));
          break;

        case 'conversation_deleted':
          dispatch(removeConversation(data.conversationId));
          dispatch(setSelectedConversation(null));
          break;

        case 'messages_expired':
          dispatch(removeMessages(data.expiredMessageIds));
          break;

        case 'contact_request':
          dispatch(addContactRequest(data.request));
          break;

        case 'contact_request_accepted':
          dispatch(addContact(data.contact));
          dispatch(removeContactRequest(data.requestId));
          break;

        case 'contact_request_declined':
          dispatch(removeContactRequest(data.requestId));
          break;

        default:
          console.log('[SSE] Unknown conversation event type:', data.type);
      }
    } catch (error) {
      console.error('[SSE] Failed to parse conversation event:', error);
    }
  };

  conversationEventSource.onerror = () => {
    console.error(`[SSE] Conversation ${conversationId} connection error`);
    conversationEventSource?.close();
    conversationEventSource = null;

    // Retry after 5 seconds
    setTimeout(() => {
      if (activeConversationId === conversationId && accessToken) {
        connectConversationSSE(dispatch, conversationId, accessToken);
      }
    }, 5000);
  };
}

function disconnectGlobalSSE() {
  if (globalEventSource) {
    globalEventSource.close();
    globalEventSource = null;
    console.log('[SSE] Global connection closed');
  }
}

function disconnectConversationSSE() {
  if (conversationEventSource) {
    conversationEventSource.close();
    conversationEventSource = null;
    console.log('[SSE] Conversation connection closed');
  }
}
