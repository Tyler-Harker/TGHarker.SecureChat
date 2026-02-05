"use client";

import type { Conversation } from "@/lib/api-client";

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
              {conversation.participantUserIds.length} participants
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(conversation.lastActivityAt).toLocaleDateString()}
            </div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {conversation.messageCount} messages
          </div>
          {conversation.participantUserIds.length > 0 && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {conversation.participantUserIds.slice(0, 2).join(", ")}
              {conversation.participantUserIds.length > 2 &&
                ` +${conversation.participantUserIds.length - 2} more`}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
