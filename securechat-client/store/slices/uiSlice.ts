import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type SidebarTab = 'conversations' | 'contacts' | 'settings';

interface UiState {
  selectedConversationId: string | null;
  activeThread: string | null; // messageId of thread parent
  activeTab: SidebarTab;
  showDeleteConversationModal: boolean;
  showEmojiPicker: boolean;
  reactionPickerMessageId: string | null;
  showImageFullscreen: boolean;
  fullscreenImageUrl: string | null;
  showCameraCapture: boolean;
  isRenaming: boolean;
  renameValue: string;
}

const initialState: UiState = {
  selectedConversationId: null,
  activeThread: null,
  activeTab: 'conversations',
  showDeleteConversationModal: false,
  showEmojiPicker: false,
  reactionPickerMessageId: null,
  showImageFullscreen: false,
  fullscreenImageUrl: null,
  showCameraCapture: false,
  isRenaming: false,
  renameValue: '',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Conversation selection
    setSelectedConversation: (state, action: PayloadAction<string | null>) => {
      state.selectedConversationId = action.payload;
      // Clear thread when changing conversations
      if (action.payload !== state.selectedConversationId) {
        state.activeThread = null;
      }
    },

    // Thread management
    setActiveThread: (state, action: PayloadAction<string | null>) => {
      state.activeThread = action.payload;
    },

    openThread: (state, action: PayloadAction<string>) => {
      state.activeThread = action.payload;
    },

    closeThread: (state) => {
      state.activeThread = null;
    },

    // Tab navigation
    setActiveTab: (state, action: PayloadAction<SidebarTab>) => {
      state.activeTab = action.payload;
    },

    // Modal states
    showDeleteModal: (state) => {
      state.showDeleteConversationModal = true;
    },

    hideDeleteModal: (state) => {
      state.showDeleteConversationModal = false;
    },

    toggleEmojiPicker: (state) => {
      state.showEmojiPicker = !state.showEmojiPicker;
    },

    setReactionPickerMessage: (state, action: PayloadAction<string | null>) => {
      state.reactionPickerMessageId = action.payload;
    },

    showImageFullscreen: (state, action: PayloadAction<string>) => {
      state.showImageFullscreen = true;
      state.fullscreenImageUrl = action.payload;
    },

    hideImageFullscreen: (state) => {
      state.showImageFullscreen = false;
      state.fullscreenImageUrl = null;
    },

    showCamera: (state) => {
      state.showCameraCapture = true;
    },

    hideCamera: (state) => {
      state.showCameraCapture = false;
    },

    // Rename state
    startRenaming: (state, action: PayloadAction<string>) => {
      state.isRenaming = true;
      state.renameValue = action.payload;
    },

    cancelRenaming: (state) => {
      state.isRenaming = false;
      state.renameValue = '';
    },

    updateRenameValue: (state, action: PayloadAction<string>) => {
      state.renameValue = action.payload;
    },

    finishRenaming: (state) => {
      state.isRenaming = false;
      state.renameValue = '';
    },
  },
});

export const {
  setSelectedConversation,
  setActiveThread,
  openThread,
  closeThread,
  setActiveTab,
  showDeleteModal,
  hideDeleteModal,
  toggleEmojiPicker,
  setReactionPickerMessage,
  showImageFullscreen,
  hideImageFullscreen,
  showCamera,
  hideCamera,
  startRenaming,
  cancelRenaming,
  updateRenameValue,
  finishRenaming,
} = uiSlice.actions;

export default uiSlice.reducer;
