"use client";

import { useState, useEffect } from "react";
import type { Conversation, Contact } from "@/lib/api-client";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const contactsData = await apiClient.getMyContacts();
        setContacts(contactsData);
      } catch (error) {
        console.error("Failed to load contacts:", error);
      }
    };

    loadContacts();
  }, []);

  const getDisplayName = (userId: string): string => {
    if (userId === user?.sub) return "You";
    const contact = contacts.find((c) => c.userId === userId);
    if (contact) return contact.nickname || contact.displayName;
    return "Unknown User";
  };

  const getConversationTitle = (conversation: Conversation): string => {
    const otherParticipants = conversation.participantUserIds.filter(
      (id) => id !== user?.sub
    );

    if (otherParticipants.length === 0) {
      return "You";
    } else if (otherParticipants.length === 1) {
      return getDisplayName(otherParticipants[0]);
    } else {
      const names = otherParticipants.slice(0, 2).map(getDisplayName);
      const remaining = otherParticipants.length - 2;
      if (remaining > 0) {
        return `${names.join(", ")} +${remaining}`;
      }
      return names.join(", ");
    }
  };

  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        No conversations yet. Start a new one!
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {conversations.map((conversation) => (
        <button
          key={conversation.conversationId}
          onClick={() => onSelect(conversation.conversationId)}
          className={`w-full p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
            selectedId === conversation.conversationId
              ? "bg-blue-50 dark:bg-blue-900/20"
              : ""
          }`}
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="font-semibold text-gray-900 dark:text-white">
              {getConversationTitle(conversation)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(conversation.lastActivityAt).toLocaleDateString()}
            </div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {conversation.messageCount} messages
            {conversation.participantUserIds.length > 2 && (
              <span className="ml-1">
                • {conversation.participantUserIds.length} participants
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
