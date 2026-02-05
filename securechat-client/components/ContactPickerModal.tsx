"use client";

import { useState, useEffect } from "react";
import { apiClient, type Contact, type Conversation } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";

interface ContactPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectContacts: (contacts: Contact[]) => void;
}

export default function ContactPickerModal({ isOpen, onClose, onSelectContacts }: ContactPickerModalProps) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadContactsAndConversations();
      setSearchQuery("");
      setSelectedContacts(new Set());
    }
  }, [isOpen]);

  const loadContactsAndConversations = async () => {
    setIsLoading(true);
    try {
      const [contactsData, conversationIds] = await Promise.all([
        apiClient.getMyContacts(),
        apiClient.getMyConversations(),
      ]);

      const conversationDetails = await Promise.all(
        conversationIds.map((id) => apiClient.getConversation(id))
      );

      setContacts(contactsData);
      setConversations(conversationDetails);
    } catch (error) {
      console.error("Failed to load contacts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    const displayName = contact.nickname || contact.displayName;
    return (
      displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const toggleContactSelection = (contactUserId: string) => {
    const newSelection = new Set(selectedContacts);
    if (newSelection.has(contactUserId)) {
      newSelection.delete(contactUserId);
    } else {
      newSelection.add(contactUserId);
    }
    setSelectedContacts(newSelection);
  };

  const handleCreateConversation = () => {
    const selectedContactObjects = contacts.filter((c) =>
      selectedContacts.has(c.userId)
    );
    onSelectContacts(selectedContactObjects);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Start a Conversation
            </h2>
            {selectedContacts.size > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedContacts.size} selected
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            autoFocus
          />
        </div>

        {/* Contact List */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {searchQuery ? "No contacts found" : "No contacts yet"}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredContacts.map((contact) => {
                const displayName = contact.nickname || contact.displayName;
                const isSelected = selectedContacts.has(contact.userId);

                return (
                  <button
                    key={contact.userId}
                    onClick={() => toggleContactSelection(contact.userId)}
                    className={`flex w-full items-center gap-3 p-4 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>

                    {/* Avatar */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <span className="text-sm font-semibold">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Contact Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900 dark:text-white">
                        {displayName}
                      </p>
                      <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                        {contact.email}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={handleCreateConversation}
              disabled={selectedContacts.size === 0}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Conversation
            </button>
            <button
              onClick={() => window.location.href = "/contacts"}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Manage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
