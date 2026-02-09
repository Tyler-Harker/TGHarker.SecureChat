"use client";

import type { Conversation } from "@/lib/api-client";
import { useAppSelector } from "@/store/hooks";
import { selectContactDisplayName } from "@/store/slices/contactsSlice";
import UserAvatar from "./UserAvatar";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  unreadCounts?: Record<string, number>;
}

// Component for individual conversation item
function ConversationItem({
  conversation,
  isSelected,
  unread,
  onSelect,
}: {
  conversation: Conversation;
  isSelected: boolean;
  unread: number;
  onSelect: (id: string) => void;
}) {
  const currentUserId = useAppSelector((state) => state.auth.user?.sub);

  // Get other participants
  const otherParticipants = conversation.participantUserIds.filter(
    (id) => id !== currentUserId
  );

  // Subscribe to display names for all participants (this will re-render when contacts change)
  const participant1Name = useAppSelector((state) =>
    otherParticipants[0] ? selectContactDisplayName(state, otherParticipants[0]) : ''
  );
  const participant2Name = useAppSelector((state) =>
    otherParticipants[1] ? selectContactDisplayName(state, otherParticipants[1]) : ''
  );

  // Calculate conversation title
  const title = conversation.name
    ? conversation.name
    : otherParticipants.length === 0
      ? "You"
      : otherParticipants.length === 1
        ? participant1Name
        : otherParticipants.length === 2
          ? `${participant1Name}, ${participant2Name}`
          : `${participant1Name}, ${participant2Name} +${otherParticipants.length - 2}`;

  const isDm = conversation.participantUserIds.length <= 2;
  const dmParticipantId = isDm ? otherParticipants[0] || null : null;

  return (
    <button
      onClick={() => onSelect(conversation.conversationId)}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors ${
        isSelected
          ? "bg-dc-selected-sidebar"
          : "hover:bg-dc-hover-sidebar"
      }`}
    >
      {isDm && dmParticipantId ? (
        <UserAvatar
          userId={dmParticipantId}
          displayName={participant1Name}
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
        {conversation.mode === "PeerToPeer" && (
          <span className="ml-1.5 inline-block rounded bg-dc-brand/20 px-1 py-0.5 align-middle text-[9px] font-bold leading-none text-dc-brand">
            P2P
          </span>
        )}
      </span>
      {unread > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-dc-brand px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  unreadCounts = {},
}: ConversationListProps) {
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

        return (
          <ConversationItem
            key={conversation.conversationId}
            conversation={conversation}
            isSelected={isSelected}
            unread={unread}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
