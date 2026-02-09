import { createSlice, createEntityAdapter, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { apiClient, type Contact, type ContactRequest } from '@/lib/api-client';
import type { RootState } from '../index';

// Entity adapters
const contactsAdapter = createEntityAdapter<Contact, string>({
  selectId: (contact) => contact.userId,
  sortComparer: (a, b) => (a.nickname || a.displayName).localeCompare(b.nickname || b.displayName),
});

const contactRequestsAdapter = createEntityAdapter<ContactRequest, string>({
  selectId: (request) => request.requestId,
  sortComparer: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
});

interface ContactsState {
  contacts: ReturnType<typeof contactsAdapter.getInitialState>;
  contactRequests: ReturnType<typeof contactRequestsAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: ContactsState = {
  contacts: contactsAdapter.getInitialState(),
  contactRequests: contactRequestsAdapter.getInitialState(),
  status: 'idle',
  error: null,
};

// Async thunks
export const fetchContacts = createAsyncThunk(
  'contacts/fetchContacts',
  async () => {
    const contacts = await apiClient.getMyContacts();
    return contacts;
  }
);

export const fetchContactRequests = createAsyncThunk(
  'contacts/fetchContactRequests',
  async () => {
    const requests = await apiClient.getPendingContactRequests();
    return requests;
  }
);

export const sendContactRequest = createAsyncThunk(
  'contacts/sendContactRequest',
  async (userId: string) => {
    const response = await apiClient.sendContactRequest(userId);
    return response;
  }
);

export const acceptContactRequest = createAsyncThunk(
  'contacts/acceptContactRequest',
  async (requestId: string) => {
    const response = await apiClient.acceptContactRequest(requestId);
    return { requestId, contact: response.contact };
  }
);

export const declineContactRequest = createAsyncThunk(
  'contacts/declineContactRequest',
  async (requestId: string) => {
    await apiClient.declineContactRequest(requestId);
    return requestId;
  }
);

export const removeContact = createAsyncThunk(
  'contacts/removeContact',
  async (userId: string) => {
    await apiClient.removeContact(userId);
    return userId;
  }
);

export const updateContactNickname = createAsyncThunk(
  'contacts/updateNickname',
  async ({ userId, nickname }: { userId: string; nickname: string }) => {
    await apiClient.setContactNickname(userId, nickname);
    return { userId, nickname };
  }
);

export const deleteContactNickname = createAsyncThunk(
  'contacts/deleteNickname',
  async (userId: string) => {
    await apiClient.removeContactNickname(userId);
    return userId;
  }
);

const contactsSlice = createSlice({
  name: 'contacts',
  initialState,
  reducers: {
    addContact: (state, action: PayloadAction<Contact>) => {
      contactsAdapter.addOne(state.contacts, action.payload);
    },

    addContactRequest: (state, action: PayloadAction<ContactRequest>) => {
      contactRequestsAdapter.addOne(state.contactRequests, action.payload);
    },

    removeContactRequest: (state, action: PayloadAction<string>) => {
      contactRequestsAdapter.removeOne(state.contactRequests, action.payload);
    },

    updateNickname: (state, action: PayloadAction<{ userId: string; nickname: string }>) => {
      const { userId, nickname } = action.payload;
      const contact = state.contacts.entities[userId];
      if (contact) {
        contact.nickname = nickname;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchContacts
      .addCase(fetchContacts.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        contactsAdapter.setAll(state.contacts, action.payload);
        state.status = 'succeeded';
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to fetch contacts';
      })
      // fetchContactRequests
      .addCase(fetchContactRequests.fulfilled, (state, action) => {
        contactRequestsAdapter.setAll(state.contactRequests, action.payload);
      })
      // sendContactRequest
      .addCase(sendContactRequest.fulfilled, (state, action) => {
        // Request sent successfully - no immediate state update needed
        // The request will appear in the other user's pending requests
      })
      // acceptContactRequest
      .addCase(acceptContactRequest.fulfilled, (state, action) => {
        const { requestId, contact } = action.payload;
        contactRequestsAdapter.removeOne(state.contactRequests, requestId);
        contactsAdapter.addOne(state.contacts, contact);
      })
      // declineContactRequest
      .addCase(declineContactRequest.fulfilled, (state, action) => {
        contactRequestsAdapter.removeOne(state.contactRequests, action.payload);
      })
      // removeContact
      .addCase(removeContact.fulfilled, (state, action) => {
        contactsAdapter.removeOne(state.contacts, action.payload);
      })
      // updateContactNickname
      .addCase(updateContactNickname.fulfilled, (state, action) => {
        const { userId, nickname } = action.payload;
        const contact = state.contacts.entities[userId];
        if (contact) {
          contact.nickname = nickname;
        }
      })
      // deleteContactNickname
      .addCase(deleteContactNickname.fulfilled, (state, action) => {
        const userId = action.payload;
        const contact = state.contacts.entities[userId];
        if (contact) {
          contact.nickname = undefined;
        }
      });
  },
});

export const {
  addContact,
  addContactRequest,
  removeContactRequest,
  updateNickname,
} = contactsSlice.actions;

export default contactsSlice.reducer;

// Selectors
export const contactsSelectors = contactsAdapter.getSelectors((state: RootState) => state.contacts.contacts);

export const selectAllContacts = (state: RootState) => {
  return state.contacts.contacts.ids
    .map((id) => state.contacts.contacts.entities[id])
    .filter(Boolean) as Contact[];
};

export const selectContact = (state: RootState, userId: string) => {
  return state.contacts.contacts.entities[userId];
};

export const selectAllContactRequests = (state: RootState) => {
  return state.contacts.contactRequests.ids
    .map((id) => state.contacts.contactRequests.entities[id])
    .filter(Boolean) as ContactRequest[];
};

export const selectContactDisplayName = (state: RootState, userId: string) => {
  const currentUserId = state.auth.user?.sub;
  if (userId === currentUserId) return 'You';

  const contact = state.contacts.contacts.entities[userId];
  return contact?.nickname || contact?.displayName || 'Unknown User';
};
