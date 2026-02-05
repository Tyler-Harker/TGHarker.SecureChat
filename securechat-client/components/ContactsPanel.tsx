"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient, type Contact } from "@/lib/api-client";

interface ContactsPanelProps {
  onClose?: () => void;
  onStartConversation?: (contact: Contact) => void;
  showHeader?: boolean;
}

export default function ContactsPanel({ onClose, onStartConversation, showHeader = true }: ContactsPanelProps) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [newContactId, setNewContactId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      const fetchedContacts = await apiClient.getMyContacts();
      setContacts(fetchedContacts);
    } catch (err) {
      console.error("Failed to load contacts:", err);
      setError("Failed to load contacts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactId.trim() || isAdding) return;

    setIsAdding(true);
    setError(null);

    try {
      const result = await apiClient.addContact(newContactId.trim());
      setContacts([...contacts, result.contact]);
      setNewContactId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveContact = async (contactUserId: string) => {
    try {
      await apiClient.removeContact(contactUserId);
      setContacts(contacts.filter((c) => c.userId !== contactUserId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove contact");
    }
  };

  const filteredContacts = searchQuery
    ? contacts.filter(
        (c) =>
          c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : contacts;

  return (
    <div className="flex h-full flex-col">
      {/* Header - only shown on desktop sidebar */}
      {showHeader && onClose && (
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Contacts
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Invite Button */}
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <button
          onClick={() => router.push("/contacts/invite/new")}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          Generate Invite Link
        </button>
      </div>

      {/* Add Contact Form */}
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <form onSubmit={handleAddContact} className="flex gap-2">
          <input
            type="text"
            value={newContactId}
            onChange={(e) => setNewContactId(e.target.value)}
            placeholder="Enter user ID to add..."
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            disabled={isAdding}
          />
          <button
            type="submit"
            disabled={!newContactId.trim() || isAdding}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAdding ? "Adding..." : "Add"}
          </button>
        </form>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {/* Search */}
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {searchQuery ? "No contacts match your search" : "No contacts yet. Add someone above!"}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredContacts.map((contact) => (
              <div
                key={contact.userId}
                className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-gray-900 dark:text-white">
                    {contact.displayName}
                  </div>
                  <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {contact.email}
                  </div>
                </div>
                <div className="ml-4 flex flex-shrink-0 gap-2">
                  {onStartConversation && (
                    <button
                      onClick={() => onStartConversation(contact)}
                      className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      title="Start conversation"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveContact(contact.userId)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    title="Remove contact"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
