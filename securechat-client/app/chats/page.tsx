"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUserEvents } from "@/contexts/UserEventsContext";
import { apiClient, type Conversation, type Contact } from "@/lib/api-client";
import ConversationList from "@/components/ConversationList";
import ContactsPanel from "@/components/ContactsPanel";
import MessageView from "@/components/MessageView";
import SplashScreen from "@/components/SplashScreen";
import AuthGuard from "@/components/AuthGuard";
import ContactPickerModal from "@/components/ContactPickerModal";
import InviteGenerator from "@/components/InviteGenerator";

type TabView = "chats" | "contacts";

function ChatsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout, accessToken } = useAuth();
  const { unreadCounts, totalUnreadCount, clearUnreadCount, setActiveConversation, subscribe } = useUserEvents();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>("chats");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showInviteGenerator, setShowInviteGenerator] = useState(false);
  const activeTabRef = useRef<TabView>("chats");

  useEffect(() => {
    if (accessToken) {
      apiClient.setAccessToken(accessToken);
      loadConversations();
    }
  }, [accessToken]);

  // Subscribe to user-level SSE events for conversation list management
  useEffect(() => {
    const unsubscribe = subscribe((data) => {
      if (data.type === "conversation_created") {
        const newConversation = data.conversation as Conversation;
        setConversations((prev) => {
          if (prev.some((c) => c.conversationId === newConversation.conversationId)) return prev;
          return [newConversation, ...prev];
        });
      } else if (data.type === "new_message_indicator") {
        const convId = data.conversationId as string;
        // Update messageCount and lastActivityAt, move conversation to top
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.conversationId === convId);
          if (idx === -1) return prev;
          const updated = {
            ...prev[idx],
            messageCount: prev[idx].messageCount + 1,
            lastActivityAt: new Date().toISOString(),
          };
          const next = [...prev];
          next.splice(idx, 1);
          return [updated, ...next];
        });
      } else if (data.type === "conversation_renamed") {
        const convId = data.conversationId as string;
        const newName = (data.name as string) || null;
        setConversations((prev) =>
          prev.map((c) =>
            c.conversationId === convId ? { ...c, name: newName } : c
          )
        );
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Handle conversation query param
  useEffect(() => {
    const conversationId = searchParams.get("conversation");
    if (conversationId && !isLoading) {
      setSelectedConversationId(conversationId);
      setActiveConversation(conversationId);
      setActiveTab("chats");
    } else if (!conversationId && !isLoading) {
      setSelectedConversationId(null);
      setActiveConversation(null);
    }
  }, [searchParams, isLoading, setActiveConversation]);

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
    clearUnreadCount(conversationId);
    router.push(`/chats?conversation=${conversationId}`, { scroll: false });
  };

  const handleBack = () => {
    router.push("/chats", { scroll: false });
  };

  const handleDeleteConversation = (deletedConversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.conversationId !== deletedConversationId));
    // Only navigate away if the deleted conversation is the one currently selected
    if (selectedConversationId === deletedConversationId) {
      router.push("/chats", { scroll: false });
    }
  };

  const handleConversationCreated = (conversation: Conversation) => {
    setConversations((prev) => {
      // Avoid duplicates (e.g. the creator already has it from the API response)
      if (prev.some((c) => c.conversationId === conversation.conversationId)) return prev;
      return [conversation, ...prev];
    });
  };

  const handleMessageSent = (convId: string) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.conversationId === convId);
      if (idx === -1) return prev;
      const updated = {
        ...prev[idx],
        messageCount: prev[idx].messageCount + 1,
        lastActivityAt: new Date().toISOString(),
      };
      const next = [...prev];
      next.splice(idx, 1);
      return [updated, ...next];
    });
  };

  const handleRenameConversation = (convId: string, newName: string | null) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.conversationId === convId ? { ...c, name: newName } : c
      )
    );
  };

  const handleSetActiveTab = (tab: TabView) => {
    setActiveTab(tab);
    activeTabRef.current = tab;
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
              onClick={() => handleSetActiveTab("chats")}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "chats"
                  ? "border-b-2 border-dc-brand text-white"
                  : "text-dc-text-muted hover:text-dc-text-primary"
              }`}
            >
              Chats
              {totalUnreadCount > 0 && (
                <span className="absolute -right-1 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-dc-danger px-1 text-[10px] font-bold text-white">
                  {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => handleSetActiveTab("contacts")}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
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
                  onClick={() => router.push("/conversations/new")}
                  className="w-full rounded bg-dc-chat-input px-2 py-1.5 text-left text-sm text-dc-text-muted transition-colors hover:bg-dc-input-border"
                >
                  Find or start a conversation
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                  unreadCounts={unreadCounts}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
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
          {/* Keep MessageView mounted (hidden) when on contacts tab so SSE stays alive for unread badge */}
          {selectedConversationId && (
            <div className={activeTab === "chats" ? "flex min-h-0 h-full flex-col" : "hidden"}>
              <MessageView conversationId={selectedConversationId} onBack={handleBack} onDelete={handleDeleteConversation} onConversationCreated={handleConversationCreated} onRename={handleRenameConversation} onMessageSent={handleMessageSent} />
            </div>
          )}
          {(activeTab !== "chats" || !selectedConversationId) && (
            showInviteGenerator ? (
              <InviteGenerator onClose={() => setShowInviteGenerator(false)} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto mb-4 h-16 w-16 text-dc-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <h2 className="mb-2 text-xl font-semibold text-dc-text-primary">
                    {activeTab === "chats" ? "Select a conversation" : "Your Contacts"}
                  </h2>
                  <p className="text-dc-text-secondary">
                    {activeTab === "chats"
                      ? "Choose a conversation or start a new one"
                      : "Select a contact to start chatting"}
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {selectedConversationId ? (
          <MessageView conversationId={selectedConversationId} onBack={handleBack} onDelete={handleDeleteConversation} onConversationCreated={handleConversationCreated} onRename={handleRenameConversation} onMessageSent={handleMessageSent} />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-dc-header-border bg-dc-sidebar p-4">
              <h1 className="text-xl font-bold text-white">Chats</h1>
              <button
                onClick={() => router.push("/conversations/new")}
                className="rounded bg-dc-brand p-2 text-white transition-colors hover:bg-dc-brand-hover"
                title="New conversation"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-dc-sidebar">
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversationId}
                onSelect={handleSelectConversation}
                unreadCounts={unreadCounts}
              />
            </div>

            {/* Mobile Bottom Navigation */}
            <div className="safe-area-bottom border-t border-dc-header-border bg-dc-sidebar">
              <div className="flex">
                <button className="flex flex-1 flex-col items-center gap-1 py-3 text-dc-brand">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-xs font-medium">Chats</span>
                </button>
                <button
                  onClick={() => router.push("/contacts")}
                  className="flex flex-1 flex-col items-center gap-1 py-3 text-dc-text-muted"
                >
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
          </>
        )}
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

export default function ChatsPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <AuthGuard>
        <ChatsContent />
      </AuthGuard>
    </Suspense>
  );
}
