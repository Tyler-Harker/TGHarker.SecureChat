"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient, type Contact } from "@/lib/api-client";
import { useUserEvents } from "@/contexts/UserEventsContext";
import UserAvatar from "./UserAvatar";

interface ContactsPanelProps {
  onClose?: () => void;
  onStartConversation?: (contacts: Contact[]) => void;
  onGenerateInvite?: () => void;
  showHeader?: boolean;
}

export default function ContactsPanel({ onClose, onStartConversation, onGenerateInvite, showHeader = true }: ContactsPanelProps) {
  const router = useRouter();
  const { subscribe } = useUserEvents();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameValue, setNicknameValue] = useState("");
  const [confirmRemoveContact, setConfirmRemoveContact] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  // Listen for real-time contact removal events
  useEffect(() => {
    return subscribe((data) => {
      if (data.type === "contact_removed") {
        const removedBy = data.removedByUserId as string;
        const removedContact = data.removedContactUserId as string;
        setContacts((prev) =>
          prev.filter((c) => c.userId !== removedBy && c.userId !== removedContact)
        );
      }
    });
  }, [subscribe]);

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

  const handleRemoveContact = async (contactUserId: string) => {
    setIsRemoving(true);
    try {
      await apiClient.removeContact(contactUserId);
      setContacts(contacts.filter((c) => c.userId !== contactUserId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove contact");
    } finally {
      setIsRemoving(false);
      setConfirmRemoveContact(null);
    }
  };

  const handleStartEditingNickname = (contact: Contact) => {
    setEditingNickname(contact.userId);
    setNicknameValue(contact.nickname || "");
  };

  const handleSaveNickname = async (contactUserId: string) => {
    if (nicknameValue.trim()) {
      try {
        await apiClient.setContactNickname(contactUserId, nicknameValue.trim());
        setContacts(
          contacts.map((c) =>
            c.userId === contactUserId ? { ...c, nickname: nicknameValue.trim() } : c
          )
        );
        setEditingNickname(null);
        setNicknameValue("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set nickname");
      }
    } else {
      handleRemoveNickname(contactUserId);
    }
  };

  const handleRemoveNickname = async (contactUserId: string) => {
    try {
      await apiClient.removeContactNickname(contactUserId);
      setContacts(
        contacts.map((c) =>
          c.userId === contactUserId ? { ...c, nickname: undefined } : c
        )
      );
      setEditingNickname(null);
      setNicknameValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove nickname");
    }
  };

  const handleCancelEditingNickname = () => {
    setEditingNickname(null);
    setNicknameValue("");
  };

  const filteredContacts = searchQuery
    ? contacts.filter(
        (c) =>
          c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.nickname && c.nickname.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : contacts;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {showHeader && onClose && (
        <div className="flex items-center justify-between border-b border-dc-divider p-4">
          <h2 className="text-lg font-semibold text-white">
            Contacts
          </h2>
          <button
            onClick={onClose}
            className="rounded p-2 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-white"
            title="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Invite Button */}
      <div className="border-b border-dc-divider p-4">
        <button
          onClick={() => {
            if (onGenerateInvite) {
              onGenerateInvite();
            } else {
              router.push("/contacts/invite/new");
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded bg-dc-brand px-4 py-3 font-medium text-white transition-colors hover:bg-dc-brand-hover"
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

      {error && (
        <div className="border-b border-dc-divider px-4 py-2">
          <p className="text-sm text-dc-danger">{error}</p>
        </div>
      )}

      {/* Search */}
      <div className="border-b border-dc-divider p-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts..."
          className="w-full rounded border border-dc-input-border bg-dc-chat-input px-3 py-2 text-sm text-dc-text-primary placeholder-dc-text-muted focus:border-dc-brand focus:outline-none focus:ring-1 focus:ring-dc-brand"
        />
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-dc-brand border-r-transparent"></div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-8 text-center text-dc-text-muted">
            {searchQuery ? "No contacts match your search" : "No contacts yet. Add someone above!"}
          </div>
        ) : (
          <div className="space-y-0.5 px-2 py-1">
            {filteredContacts.map((contact) => (
              <div
                key={contact.userId}
                className="flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-dc-hover-sidebar"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <UserAvatar
                    userId={contact.userId}
                    displayName={contact.nickname || contact.displayName}
                    size="sm"
                  />
                  {editingNickname === contact.userId ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={nicknameValue}
                        onChange={(e) => setNicknameValue(e.target.value)}
                        placeholder="Enter nickname..."
                        className="min-w-0 flex-1 rounded border border-dc-input-border bg-dc-chat-input px-2 py-1 text-sm text-dc-text-primary focus:border-dc-brand focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveNickname(contact.userId);
                          } else if (e.key === "Escape") {
                            handleCancelEditingNickname();
                          }
                        }}
                      />
                      <button
                        onClick={() => handleSaveNickname(contact.userId)}
                        className="rounded p-1 text-dc-success transition-colors hover:bg-dc-hover-sidebar"
                        title="Save"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancelEditingNickname}
                        className="rounded p-1 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-text-primary"
                        title="Cancel"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-dc-text-primary">
                          {contact.nickname || contact.displayName}
                        </span>
                        {contact.nickname && (
                          <span className="truncate text-xs text-dc-text-muted">
                            ({contact.displayName})
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-dc-text-secondary">
                        {contact.email}
                      </div>
                    </div>
                  )}
                </div>
                <div className="ml-2 flex flex-shrink-0 gap-1">
                  {editingNickname !== contact.userId && (
                    <>
                      <button
                        onClick={() => handleStartEditingNickname(contact)}
                        className="rounded p-1.5 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-text-primary"
                        title="Edit nickname"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      {onStartConversation && (
                        <button
                          onClick={() => onStartConversation([contact])}
                          className="rounded p-1.5 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-brand"
                          title="Start conversation"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        onClick={() => setConfirmRemoveContact(contact.userId)}
                        className="rounded p-1.5 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-danger"
                        title="Remove contact"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove Contact Confirmation Dialog */}
      {confirmRemoveContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-dc-modal-bg p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Remove Contact?
            </h3>
            <p className="mb-6 text-dc-text-secondary">
              This will remove this contact for everyone. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemoveContact(null)}
                disabled={isRemoving}
                className="flex-1 rounded px-4 py-2 font-medium text-dc-text-primary transition-colors bg-dc-hover-sidebar hover:bg-dc-selected-sidebar disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveContact(confirmRemoveContact)}
                disabled={isRemoving}
                className="flex-1 rounded bg-dc-danger px-4 py-2 font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
              >
                {isRemoving ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
