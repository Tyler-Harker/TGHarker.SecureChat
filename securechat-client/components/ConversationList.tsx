"use client";

import { useState, useEffect } from "react";
import type { Conversation, Contact } from "@/lib/api-client";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import UserAvatar from "./UserAvatar";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  unreadCounts?: Record<string, number>;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  unreadCounts = {},
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
    if (conversation.name) {
      return conversation.name;
    }

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

  const isDm = (conversation: Conversation): boolean => {
    return conversation.participantUserIds.length <= 2;
  };

  const getDmParticipantId = (conversation: Conversation): string | null => {
    const other = conversation.participantUserIds.find(
      (id) => id !== user?.sub
    );
    return other || null;
  };

  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-dc-text-muted">
        No conversations yet. Start a new one!
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-2 py-1">
      {conversations.map((conversation) => {
        const unread = unreadCounts[conversation.conversationId] || 0;
        const isSelected = selectedId === conversation.conversationId;
        const dm = isDm(conversation);
        const dmParticipantId = dm ? getDmParticipantId(conversation) : null;
        const title = getConversationTitle(conversation);

        return (
          <button
            key={conversation.conversationId}
            onClick={() => onSelect(conversation.conversationId)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
              isSelected
                ? "bg-dc-selected-sidebar"
                : "hover:bg-dc-hover-sidebar"
            }`}
          >
            {dm && dmParticipantId ? (
              <UserAvatar
                userId={dmParticipantId}
                displayName={getDisplayName(dmParticipantId)}
                size="sm"
              />
            ) : (
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-dc-text-muted text-sm font-medium">
                #
              </span>
            )}
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                unread > 0
                  ? "font-semibold text-white"
                  : isSelected
                    ? "text-white"
                    : "text-dc-text-secondary"
              }`}
            >
              {title}
            </span>
            {unread > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-dc-brand px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
