import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import { sseMiddleware } from './middleware/sseMiddleware';
import authReducer from './slices/authSlice';
import conversationsReducer from './slices/conversationsSlice';
import messagesReducer from './slices/messagesSlice';
import contactsReducer from './slices/contactsSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    auth: authReducer,
    conversations: conversationsReducer,
    messages: messagesReducer,
    contacts: contactsReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['sse/connect', 'sse/disconnect'],
        // Ignore these paths in the state
        ignoredPaths: ['sse.eventSource'],
      },
    })
      .concat(baseApi.middleware)
      .concat(sseMiddleware),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
