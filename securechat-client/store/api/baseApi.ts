import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';
import type { Conversation, Contact, ContactRequest, UserProfile } from '@/lib/api-client';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5280',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Conversation', 'Contact', 'ContactRequest', 'User', 'UnseenCount'],
  endpoints: (builder) => ({
    // Conversations
    getConversation: builder.query<Conversation, string>({
      query: (id) => `/api/conversations/${id}`,
      providesTags: (result, error, id) => [{ type: 'Conversation', id }],
    }),

    getMyConversations: builder.query<string[], void>({
      query: () => '/api/users/me/conversations',
      providesTags: ['Conversation'],
    }),

    // Contacts
    getMyContacts: builder.query<Contact[], void>({
      query: () => '/api/users/me/contacts',
      providesTags: ['Contact'],
    }),

    getPendingContactRequests: builder.query<ContactRequest[], void>({
      query: () => '/api/contacts/requests/pending',
      providesTags: ['ContactRequest'],
    }),

    // User
    getMyProfile: builder.query<UserProfile, void>({
      query: () => '/api/users/me',
      providesTags: ['User'],
    }),

    getPublicKey: builder.query<{ publicIdentityKey: string }, string>({
      query: (userId) => `/api/users/${userId}/publickey`,
    }),

    // Unseen counts
    getUnseenCounts: builder.query<Record<string, number>, void>({
      query: () => '/api/users/me/unseen-counts',
      providesTags: ['UnseenCount'],
    }),

    // Mutations
    deleteConversation: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/api/conversations/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Conversation', id },
        'Conversation',
      ],
    }),

    renameConversation: builder.mutation<void, { conversationId: string; name: string }>({
      query: ({ conversationId, name }) => ({
        url: `/api/conversations/${conversationId}/name`,
        method: 'PUT',
        body: { name },
      }),
      invalidatesTags: (result, error, { conversationId }) => [
        { type: 'Conversation', id: conversationId },
      ],
    }),

    removeContact: builder.mutation<void, string>({
      query: (userId) => ({
        url: `/api/users/me/contacts/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Contact'],
    }),

    setContactNickname: builder.mutation<void, { userId: string; nickname: string }>({
      query: ({ userId, nickname }) => ({
        url: `/api/users/me/contacts/${userId}/nickname`,
        method: 'PUT',
        body: { nickname },
      }),
      invalidatesTags: ['Contact'],
    }),

    removeContactNickname: builder.mutation<void, string>({
      query: (userId) => ({
        url: `/api/users/me/contacts/${userId}/nickname`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Contact'],
    }),

    sendContactRequest: builder.mutation<{ message: string }, string>({
      query: (userId) => ({
        url: `/api/contacts/request/${userId}`,
        method: 'POST',
      }),
    }),

    acceptContactRequest: builder.mutation<{ message: string; contact: Contact }, string>({
      query: (requestId) => ({
        url: `/api/contacts/requests/${requestId}/accept`,
        method: 'POST',
      }),
      invalidatesTags: ['ContactRequest', 'Contact'],
    }),

    declineContactRequest: builder.mutation<{ message: string }, string>({
      query: (requestId) => ({
        url: `/api/contacts/requests/${requestId}/decline`,
        method: 'POST',
      }),
      invalidatesTags: ['ContactRequest'],
    }),

    clearUnseenCount: builder.mutation<void, string>({
      query: (conversationId) => ({
        url: `/api/users/me/unseen-counts/${conversationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['UnseenCount'],
    }),
  }),
});

export const {
  useGetConversationQuery,
  useGetMyConversationsQuery,
  useGetMyContactsQuery,
  useGetPendingContactRequestsQuery,
  useGetMyProfileQuery,
  useGetPublicKeyQuery,
  useGetUnseenCountsQuery,
  useDeleteConversationMutation,
  useRenameConversationMutation,
  useRemoveContactMutation,
  useSetContactNicknameMutation,
  useRemoveContactNicknameMutation,
  useSendContactRequestMutation,
  useAcceptContactRequestMutation,
  useDeclineContactRequestMutation,
  useClearUnseenCountMutation,
} = baseApi;
