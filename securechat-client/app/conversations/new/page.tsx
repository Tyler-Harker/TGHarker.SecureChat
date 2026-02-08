"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Contact, type RetentionPeriod } from "@/lib/api-client";
import UserAvatar from "@/components/UserAvatar";

export default function NewConversationPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading, accessToken, login } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPeriod>(168);

  const loadContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedContacts = await apiClient.getMyContacts();
      setContacts(fetchedContacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && accessToken) {
      apiClient.setAccessToken(accessToken);
      loadContacts();
    }
  }, [isAuthLoading, accessToken, loadContacts]);

  const toggleContact = (contactId: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const generatePlaceholderKey = (): string => {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    return btoa(String.fromCharCode(...key));
  };

  const handleCreateConversation = async () => {
    if (selectedContacts.size === 0 || !user?.sub) return;

    setIsCreating(true);
    setError(null);

    try {
      const participantUserIds = [user.sub, ...Array.from(selectedContacts)];

      const encryptedConversationKeys: Record<string, string> = {};
      for (const participantId of participantUserIds) {
        encryptedConversationKeys[participantId] = generatePlaceholderKey();
      }

      const conversation = await apiClient.createConversation({
        participantUserIds,
        encryptedConversationKeys,
        retentionPolicy,
      });

      // Navigate back to chats with the new conversation selected
      router.push(`/chats?conversation=${conversation.conversationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
      setIsCreating(false);
    }
  };

  const handleBack = () => {
    router.push("/chats");
  };

  const filteredContacts = searchQuery
    ? contacts.filter(
        (c) =>
          c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : contacts;

  // Show loading while auth is initializing
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dc-chat-bg">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-dc-brand border-r-transparent"></div>
      </div>
    );
  }

  // Require authentication
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dc-chat-bg p-4">
        <div className="w-full max-w-md rounded-xl bg-dc-modal-bg p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dc-brand/20">
              <svg
                className="h-8 w-8 text-dc-brand"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-white">
              Sign In Required
            </h1>
            <p className="mb-6 text-dc-text-secondary">
              Please sign in to create a new conversation.
            </p>
            <button
              onClick={() => login()}
              className="w-full rounded-lg bg-dc-brand px-6 py-3 font-semibold text-white hover:bg-dc-brand-hover"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-dc-chat-bg">
      {/* Header */}
      <header className="border-b border-dc-header-border bg-dc-header shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
          <button
            onClick={handleBack}
            className="rounded p-2 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-white"
            title="Back"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-white">New Conversation</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl">
          {/* Search */}
          <div className="border-b border-dc-divider p-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full rounded border border-dc-input-border bg-dc-chat-input px-3 py-2.5 text-sm text-dc-text-primary placeholder-dc-text-muted focus:border-dc-brand focus:outline-none focus:ring-1 focus:ring-dc-brand"
            />
          </div>

          {/* Selected count */}
          {selectedContacts.size > 0 && (
            <div className="border-b border-dc-divider bg-dc-banner-info-bg px-4 py-3">
              <p className="text-sm font-medium text-dc-text-primary">
                {selectedContacts.size} contact{selectedContacts.size !== 1 ? "s" : ""} selected
              </p>
            </div>
          )}

          {/* Message Retention */}
          <div className="border-b border-dc-divider p-4">
            <label className="mb-2 block text-sm font-medium text-dc-text-secondary">
              Message Retention
            </label>
            <select
              value={retentionPolicy}
              onChange={(e) => setRetentionPolicy(Number(e.target.value) as RetentionPeriod)}
              className="w-full rounded border border-dc-input-border bg-dc-chat-input px-3 py-2 text-sm text-dc-text-primary focus:border-dc-brand focus:outline-none focus:ring-1 focus:ring-dc-brand"
            >
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days (default)</option>
              <option value={720}>30 days</option>
            </select>
            <p className="mt-1 text-xs text-dc-text-muted">
              Messages will be automatically deleted after this period
            </p>
          </div>

          {/* Contact List */}
          <div>
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-dc-brand border-r-transparent"></div>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-12 text-center">
                <svg
                  className="mx-auto mb-4 h-12 w-12 text-dc-text-muted"
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
                <p className="text-lg font-medium text-dc-text-primary">
                  {searchQuery ? "No contacts found" : "No contacts yet"}
                </p>
                <p className="mt-1 text-dc-text-muted">
                  {searchQuery
                    ? "Try a different search term"
                    : "Add contacts first to start a conversation"}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => router.push("/contacts")}
                    className="mt-4 rounded bg-dc-brand px-4 py-2 text-sm font-medium text-white hover:bg-dc-brand-hover"
                  >
                    Go to Contacts
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 px-2 py-1">
                {filteredContacts.map((contact) => {
                  const isSelected = selectedContacts.has(contact.userId);
                  return (
                    <label
                      key={contact.userId}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                        isSelected ? "bg-dc-selected-sidebar" : "hover:bg-dc-hover-sidebar"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleContact(contact.userId)}
                        className="h-4 w-4 rounded border-dc-input-border bg-dc-chat-input text-dc-brand accent-dc-brand focus:ring-dc-brand"
                      />
                      <UserAvatar
                        userId={contact.userId}
                        displayName={contact.nickname || contact.displayName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-dc-text-primary">
                          {contact.nickname || contact.displayName}
                          {contact.nickname && (
                            <span className="ml-2 text-xs text-dc-text-muted">
                              ({contact.displayName})
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-dc-text-secondary">
                          {contact.email}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="border-t border-dc-divider bg-dc-banner-warning-bg px-4 py-3">
              <p className="text-sm text-dc-danger">{error}</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dc-header-border bg-dc-header p-4">
        <div className="mx-auto flex max-w-2xl gap-3">
          <button
            onClick={handleBack}
            className="flex-1 rounded bg-dc-hover-sidebar px-4 py-2.5 text-sm font-medium text-dc-text-primary transition-colors hover:bg-dc-selected-sidebar"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateConversation}
            disabled={selectedContacts.size === 0 || isCreating}
            className="flex-1 rounded bg-dc-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-dc-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create Conversation"}
          </button>
        </div>
      </footer>
    </div>
  );
}
