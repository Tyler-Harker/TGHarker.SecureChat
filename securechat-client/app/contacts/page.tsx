"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Conversation, type Contact } from "@/lib/api-client";
import ConversationList from "@/components/ConversationList";
import ContactsPanel from "@/components/ContactsPanel";
import SplashScreen from "@/components/SplashScreen";
import AuthGuard from "@/components/AuthGuard";
import ContactPickerModal from "@/components/ContactPickerModal";
import InviteGenerator from "@/components/InviteGenerator";

type TabView = "chats" | "contacts";

function ContactsContent() {
  const router = useRouter();
  const { user, logout, accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>("contacts");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showInviteGenerator, setShowInviteGenerator] = useState(false);

  useEffect(() => {
    if (accessToken) {
      apiClient.setAccessToken(accessToken);
      loadConversations();
    }
  }, [accessToken]);

  const loadConversations = async () => {
    try {
      const conversationIds = await apiClient.getMyConversations();
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

  const handleStartConversation = async (contacts: Contact[]) => {
    if (!user?.sub || contacts.length === 0) return;

    // Build participant list including current user
    const participantUserIds = [user.sub, ...contacts.map((c) => c.userId)];

    // Check if exact conversation exists with these participants
    const existingConversation = conversations.find((conv) => {
      if (conv.participantUserIds.length !== participantUserIds.length) return false;
      return participantUserIds.every((id) => conv.participantUserIds.includes(id));
    });

    if (existingConversation) {
      router.push(`/chats?conversation=${existingConversation.conversationId}`);
      return;
    }

    // Create new conversation
    try {
      const encryptedConversationKeys: Record<string, string> = {};

      for (const participantId of participantUserIds) {
        const key = new Uint8Array(32);
        crypto.getRandomValues(key);
        encryptedConversationKeys[participantId] = btoa(String.fromCharCode(...key));
      }

      const conversation = await apiClient.createConversation({
        participantUserIds,
        encryptedConversationKeys,
      });

      router.push(`/chats?conversation=${conversation.conversationId}`);
    } catch (error) {
      console.error("Failed to create conversation:", error);
      alert("Failed to start conversation. Please try again.");
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    router.push(`/chats?conversation=${conversationId}`, { scroll: false });
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100 dark:bg-gray-900">
      {/* Desktop Top Navigation */}
      <div className="hidden border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:block">
        <div className="flex items-center justify-between px-6">
          <div className="flex gap-1">
            <button
              onClick={() => {
                setActiveTab("chats");
                router.push("/chats");
              }}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === "chats"
                  ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Chats
            </button>
            <button
              onClick={() => setActiveTab("contacts")}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === "contacts"
                  ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Contacts
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {user?.email || user?.name}
            </span>
            <button
              onClick={() => router.push("/settings")}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              title="Settings"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              title="Logout"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Content */}
      <div className="hidden flex-1 md:flex">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {activeTab === "chats" ? (
            <>
              <div className="border-b border-gray-200 p-4 dark:border-gray-700">
                <button
                  onClick={() => setShowContactPicker(true)}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  + New Conversation
                </button>
              </div>
              <div className="overflow-y-auto" style={{ height: "calc(100vh - 130px)" }}>
                <ConversationList
                  conversations={conversations}
                  selectedId={null}
                  onSelect={handleSelectConversation}
                />
              </div>
            </>
          ) : (
            <div className="h-full overflow-y-auto">
              <ContactsPanel
                onStartConversation={handleStartConversation}
                onGenerateInvite={() => setShowInviteGenerator(true)}
                showHeader={true}
              />
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col">
          {showInviteGenerator ? (
            <InviteGenerator onClose={() => setShowInviteGenerator(false)} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto mb-4 h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {activeTab === "chats" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  )}
                </svg>
                <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                  {activeTab === "chats" ? "Select a conversation" : "Your Contacts"}
                </h2>
                <p className="text-gray-500 dark:text-gray-400">
                  {activeTab === "chats"
                    ? "Choose a conversation or start a new one"
                    : "Select a contact to start chatting"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex flex-1 flex-col md:hidden">
        {showInviteGenerator ? (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={() => setShowInviteGenerator(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                title="Back"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Invite a Contact</h1>
              <div className="w-10"></div>
            </div>
            <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
              <InviteGenerator onClose={() => setShowInviteGenerator(false)} />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Contacts</h1>
            </div>

            <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
              <ContactsPanel
                onStartConversation={handleStartConversation}
                onGenerateInvite={() => setShowInviteGenerator(true)}
                showHeader={false}
              />
            </div>
          </>
        )}

        {/* Mobile Bottom Navigation */}
        <div className="safe-area-bottom border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex">
            <button
              onClick={() => router.push("/chats")}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-gray-500 dark:text-gray-400"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs font-medium">Chats</span>
            </button>
            <button className="flex flex-1 flex-col items-center gap-1 py-3 text-blue-600 dark:text-blue-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-xs font-medium">Contacts</span>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-gray-500 dark:text-gray-400"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs font-medium">Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contact Picker Modal */}
      <ContactPickerModal
        isOpen={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelectContacts={handleStartConversation}
      />
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <AuthGuard>
        <ContactsContent />
      </AuthGuard>
    </Suspense>
  );
}
