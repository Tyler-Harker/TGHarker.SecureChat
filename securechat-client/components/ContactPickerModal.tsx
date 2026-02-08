"use client";

import { useState, useEffect } from "react";
import { apiClient, type Contact, type Conversation } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import UserAvatar from "./UserAvatar";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg border border-dc-divider bg-dc-modal-bg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dc-divider p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Start a Conversation
            </h2>
            {selectedContacts.size > 0 && (
              <p className="text-sm text-dc-text-muted">
                {selectedContacts.size} selected
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-2 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-text-primary"
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
            className="w-full rounded border border-dc-input-border bg-dc-chat-input px-3 py-2 text-sm text-dc-text-primary placeholder-dc-text-muted focus:border-dc-brand focus:outline-none focus:ring-1 focus:ring-dc-brand"
            autoFocus
          />
        </div>

        {/* Contact List */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-dc-brand border-r-transparent"></div>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-dc-text-muted">
              {searchQuery ? "No contacts found" : "No contacts yet"}
            </div>
          ) : (
            <div className="space-y-0.5 px-2 py-1">
              {filteredContacts.map((contact) => {
                const displayName = contact.nickname || contact.displayName;
                const isSelected = selectedContacts.has(contact.userId);

                return (
                  <button
                    key={contact.userId}
                    onClick={() => toggleContactSelection(contact.userId)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-dc-selected-sidebar"
                        : "hover:bg-dc-hover-sidebar"
                    }`}
                  >
                    <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-dc-input-border bg-dc-chat-input accent-dc-brand"
                      />
                    </div>
                    <UserAvatar
                      userId={contact.userId}
                      displayName={displayName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-dc-text-primary">
                        {displayName}
                      </p>
                      <p className="truncate text-xs text-dc-text-secondary">
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
        <div className="border-t border-dc-divider p-4">
          <div className="flex gap-2">
            <button
              onClick={handleCreateConversation}
              disabled={selectedContacts.size === 0}
              className="flex-1 rounded bg-dc-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-dc-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Conversation
            </button>
            <button
              onClick={() => window.location.href = "/contacts"}
              className="rounded bg-dc-hover-sidebar px-4 py-2 text-sm font-medium text-dc-text-primary transition-colors hover:bg-dc-selected-sidebar"
            >
              Manage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
