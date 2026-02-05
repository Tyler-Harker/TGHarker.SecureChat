"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Conversation } from "@/lib/api-client";
import ConversationList from "@/components/ConversationList";
import MessageView from "@/components/MessageView";
import SplashScreen from "@/components/SplashScreen";
import AuthGuard from "@/components/AuthGuard";

function ChatsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout, accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (accessToken) {
      apiClient.setAccessToken(accessToken);
      loadConversations();
    }
  }, [accessToken]);

  // Handle conversation query param
  useEffect(() => {
    const conversationId = searchParams.get("conversation");
    if (conversationId && !isLoading) {
      setSelectedConversationId(conversationId);
    } else if (!conversationId && !isLoading) {
      setSelectedConversationId(null);
    }
  }, [searchParams, isLoading]);

  const loadConversations = async () => {
    try {
      const conversationIds = await apiClient.getMyConversations();

      // Load details for each conversation
      const conversationDetails = await Promise.all(
        conversationIds.map((id) => apiClient.getConversation(id))
      );

      setConversations(conversationDetails);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    router.push("/conversations/new");
  };

  const handleSelectConversation = (conversationId: string) => {
    router.push(`/chats?conversation=${conversationId}`, { scroll: false });
  };

  const handleBack = () => {
    router.push("/chats", { scroll: false });
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <div className="hidden w-80 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:flex">
        {/* Desktop Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Chats</h1>
            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
              {user?.email || user?.name}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={() => router.push("/contacts")}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Contacts"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Settings"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* New Conversation Button */}
        <div className="p-4">
          <button
            onClick={handleNewConversation}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            + New Conversation
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
          />
        </div>
      </div>

      {/* Desktop Main Content */}
      <div className="hidden flex-1 flex-col md:flex">
        {selectedConversationId ? (
          <MessageView conversationId={selectedConversationId} onBack={handleBack} />
        ) : (
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
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                Select a conversation
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                Choose a conversation from the list or start a new one
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Layout */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedConversationId ? (
            <MessageView conversationId={selectedConversationId} onBack={handleBack} />
          ) : (
            <>
              {/* Mobile Header */}
              <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Chats</h1>
                <button
                  onClick={handleNewConversation}
                  className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700"
                  title="New conversation"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Mobile Conversations List */}
              <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                />
              </div>
            </>
          )}
        </div>

        {/* Mobile Bottom Navigation Bar */}
        {!selectedConversationId && (
          <div className="safe-area-bottom border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex">
              <button
                className="flex flex-1 flex-col items-center gap-1 py-3 text-blue-600 dark:text-blue-400"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span className="text-xs font-medium">Chats</span>
              </button>
              <button
                onClick={() => router.push("/contacts")}
                className="flex flex-1 flex-col items-center gap-1 py-3 text-gray-500 dark:text-gray-400"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        )}
      </div>
    </div>
  );
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <AuthGuard>
        <ChatsContent />
      </AuthGuard>
    </Suspense>
  );
}
