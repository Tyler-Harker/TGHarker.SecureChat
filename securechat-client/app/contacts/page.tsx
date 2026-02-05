"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Contact, type Conversation } from "@/lib/api-client";
import ContactsPanel from "@/components/ContactsPanel";
import SplashScreen from "@/components/SplashScreen";
import AuthGuard from "@/components/AuthGuard";

function ContactsContent() {
  const router = useRouter();
  const { user, logout, accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  useEffect(() => {
    if (accessToken) {
      apiClient.setAccessToken(accessToken);
      loadConversations();
    }
  }, [accessToken]);

  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true);
      const conversationIds = await apiClient.getMyConversations();

      // Load details for each conversation
      const conversationDetails = await Promise.all(
        conversationIds.map((id) => apiClient.getConversation(id))
      );

      setConversations(conversationDetails);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const handleStartConversationWithContact = useCallback(
    async (contact: Contact) => {
      if (!user?.sub) return;

      // Check if a conversation already exists with this contact
      const existingConversation = conversations.find(
        (conv) =>
          conv.participantUserIds.length === 2 &&
          conv.participantUserIds.includes(contact.userId) &&
          conv.participantUserIds.includes(user.sub)
      );

      if (existingConversation) {
        // Navigate to the existing conversation
        router.push(`/chats?conversation=${existingConversation.conversationId}`);
        return;
      }

      // Create a new conversation with this contact
      try {
        const participantUserIds = [user.sub, contact.userId];

        // Generate placeholder encrypted keys
        const encryptedConversationKeys: Record<string, string> = {};
        for (const participantId of participantUserIds) {
          const key = new Uint8Array(32);
          crypto.getRandomValues(key);
          encryptedConversationKeys[participantId] = btoa(
            String.fromCharCode(...key)
          );
        }

        const conversation = await apiClient.createConversation({
          participantUserIds,
          encryptedConversationKeys,
        });

        // Navigate to the new conversation
        router.push(`/chats?conversation=${conversation.conversationId}`);
      } catch (error) {
        console.error("Failed to create conversation:", error);
        alert("Failed to start conversation. Please try again.");
      }
    },
    [user?.sub, conversations, router]
  );

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <div className="hidden w-80 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:flex">
        {/* Desktop Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Contacts
            </h1>
            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
              {user?.email || user?.name}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={() => router.push("/chats")}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Chats"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Settings"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
            <button
              onClick={logout}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Logout"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Contacts Panel */}
        <ContactsPanel
          onStartConversation={handleStartConversationWithContact}
          showHeader={false}
        />
      </div>

      {/* Desktop Main Content - Empty state */}
      <div className="hidden flex-1 flex-col md:flex">
        <div className="flex flex-1 items-center justify-center">
          <div className="px-4 text-center">
            <svg
              className="mx-auto mb-4 h-16 w-16 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
              Your Contacts
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Select a contact to start a conversation
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex flex-1 flex-col md:hidden">
        {/* Mobile Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Contacts
          </h1>
        </div>

        {/* Mobile Contacts Panel */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
          <ContactsPanel
            onStartConversation={handleStartConversationWithContact}
            showHeader={false}
          />
        </div>

        {/* Mobile Bottom Navigation Bar */}
        <div className="safe-area-bottom border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex">
            <button
              onClick={() => router.push("/chats")}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-gray-500 dark:text-gray-400"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span className="text-xs font-medium">Chats</span>
            </button>
            <button className="flex flex-1 flex-col items-center gap-1 py-3 text-blue-600 dark:text-blue-400">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span className="text-xs font-medium">Contacts</span>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-gray-500 dark:text-gray-400"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-xs font-medium">Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  return (
    <AuthGuard>
      <ContactsContent />
    </AuthGuard>
  );
}
