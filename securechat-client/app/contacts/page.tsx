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
import { useUserEvents } from "@/contexts/UserEventsContext";

type TabView = "chats" | "contacts";

function ContactsContent() {
  const router = useRouter();
  const { user, logout, accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>("contacts");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showInviteGenerator, setShowInviteGenerator] = useState(false);
  const { totalUnreadCount: unreadCount } = useUserEvents();

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

    const participantUserIds = [user.sub, ...contacts.map((c) => c.userId)];

    const existingConversation = conversations.find((conv) => {
      if (conv.participantUserIds.length !== participantUserIds.length) return false;
      return participantUserIds.every((id) => conv.participantUserIds.includes(id));
    });

    if (existingConversation) {
      router.push(`/chats?conversation=${existingConversation.conversationId}`);
      return;
    }

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
    <div className="flex h-screen flex-col bg-dc-chat-bg">
      {/* Desktop Top Navigation */}
      <div className="hidden border-b border-dc-header-border bg-dc-sidebar md:block">
        <div className="flex items-center justify-between px-6">
          <div className="flex gap-1">
            <button
              onClick={() => {
                setActiveTab("chats");
                router.push("/chats");
              }}
              className={`relative px-4 py-3 font-medium transition-colors ${
                activeTab === "chats"
                  ? "border-b-2 border-dc-brand text-white"
                  : "text-dc-text-muted hover:text-dc-text-primary"
              }`}
            >
              Chats
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-dc-danger px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("contacts")}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === "contacts"
                  ? "border-b-2 border-dc-brand text-white"
                  : "text-dc-text-muted hover:text-dc-text-primary"
              }`}
            >
              Contacts
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-dc-text-secondary">
              {user?.email || user?.name}
            </span>
            <button
              onClick={() => router.push("/settings")}
              className="rounded p-2 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-text-primary"
              title="Settings"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="rounded p-2 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-text-primary"
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
      <div className="hidden min-h-0 flex-1 md:flex">
        {/* Sidebar */}
        <div className="flex w-60 flex-col border-r border-dc-divider bg-dc-sidebar">
          {activeTab === "chats" ? (
            <>
              <div className="p-2">
                <button
                  onClick={() => setShowContactPicker(true)}
                  className="w-full rounded bg-dc-chat-input px-2 py-1.5 text-left text-sm text-dc-text-muted transition-colors hover:bg-dc-input-border"
                >
                  Find or start a conversation
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
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
        <div className="flex min-h-0 flex-1 flex-col">
          {showInviteGenerator ? (
            <InviteGenerator onClose={() => setShowInviteGenerator(false)} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto mb-4 h-16 w-16 text-dc-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {activeTab === "chats" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  )}
                </svg>
                <h2 className="mb-2 text-xl font-semibold text-dc-text-primary">
                  {activeTab === "chats" ? "Select a conversation" : "Your Contacts"}
                </h2>
                <p className="text-dc-text-muted">
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
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {showInviteGenerator ? (
          <>
            <div className="flex items-center justify-between border-b border-dc-header-border bg-dc-sidebar p-4">
              <button
                onClick={() => setShowInviteGenerator(false)}
                className="rounded p-2 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-white"
                title="Back"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold text-white">Invite a Contact</h1>
              <div className="w-9"></div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <InviteGenerator onClose={() => setShowInviteGenerator(false)} />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-dc-header-border bg-dc-sidebar p-4">
              <h1 className="text-xl font-bold text-white">Contacts</h1>
            </div>

            <div className="flex-1 overflow-y-auto bg-dc-sidebar">
              <ContactsPanel
                onStartConversation={handleStartConversation}
                onGenerateInvite={() => setShowInviteGenerator(true)}
                showHeader={false}
              />
            </div>
          </>
        )}

        {/* Mobile Bottom Navigation */}
        <div className="safe-area-bottom border-t border-dc-header-border bg-dc-sidebar">
          <div className="flex">
            <button
              onClick={() => router.push("/chats")}
              className="relative flex flex-1 flex-col items-center gap-1 py-3 text-dc-text-muted"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs font-medium">Chats</span>
              {unreadCount > 0 && (
                <span className="absolute right-1/4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-dc-danger px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            <button className="flex flex-1 flex-col items-center gap-1 py-3 text-dc-brand">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-xs font-medium">Contacts</span>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-dc-text-muted"
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
