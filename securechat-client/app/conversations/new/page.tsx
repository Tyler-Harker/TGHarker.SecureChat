"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Contact } from "@/lib/api-client";

export default function NewConversationPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading, accessToken, login } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
      });

      // Navigate back to home with the new conversation selected
      router.push(`/?conversation=${conversation.conversationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
      setIsCreating(false);
    }
  };

  const handleBack = () => {
    router.push("/");
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
      <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
      </div>
    );
  }

  // Require authentication
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4 dark:bg-gray-900">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg
                className="h-8 w-8 text-blue-600 dark:text-blue-400"
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
            <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
              Sign In Required
            </h1>
            <p className="mb-6 text-gray-600 dark:text-gray-300">
              Please sign in to create a new conversation.
            </p>
            <button
              onClick={login}
              className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-4">
          <button
            onClick={handleBack}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title="Back"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Conversation</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-2xl">
          {/* Search */}
          <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
          </div>

          {/* Selected count */}
          {selectedContacts.size > 0 && (
            <div className="border-b border-gray-200 bg-blue-50 px-4 py-3 dark:border-gray-700 dark:bg-blue-900/20">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {selectedContacts.size} contact{selectedContacts.size !== 1 ? "s" : ""} selected
              </p>
            </div>
          )}

          {/* Contact List */}
          <div className="bg-white dark:bg-gray-800">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-12 text-center">
                <svg
                  className="mx-auto mb-4 h-12 w-12 text-gray-400"
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
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  {searchQuery ? "No contacts found" : "No contacts yet"}
                </p>
                <p className="mt-1 text-gray-500 dark:text-gray-400">
                  {searchQuery
                    ? "Try a different search term"
                    : "Add contacts first to start a conversation"}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => router.push("/")}
                    className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Go to Contacts
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredContacts.map((contact) => (
                  <label
                    key={contact.userId}
                    className="flex cursor-pointer items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.userId)}
                      onChange={() => toggleContact(contact.userId)}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-semibold text-white">
                      {contact.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-medium text-gray-900 dark:text-white">
                        {contact.displayName}
                      </div>
                      <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                        {contact.email}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="border-t border-gray-200 bg-red-50 px-4 py-3 dark:border-gray-700 dark:bg-red-900/20">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-2xl gap-3">
          <button
            onClick={handleBack}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateConversation}
            disabled={selectedContacts.size === 0 || isCreating}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create Conversation"}
          </button>
        </div>
      </footer>
    </div>
  );
}
