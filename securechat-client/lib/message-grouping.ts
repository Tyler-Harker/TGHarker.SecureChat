import type { Message } from "./api-client";

const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface GroupedMessage extends Message {
  isGroupStart: boolean;
}

export function groupMessages(messages: Message[]): GroupedMessage[] {
  return messages.map((msg, index) => {
    if (index === 0) {
      return { ...msg, isGroupStart: true };
    }

    const prev = messages[index - 1];
    const timeDiff =
      new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime();
    const sameSender = msg.senderId === prev.senderId;
    const withinThreshold = timeDiff < GROUP_THRESHOLD_MS;

    return {
      ...msg,
      isGroupStart: !sameSender || !withinThreshold,
    };
  });
}

export function formatMessageTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString()} ${time}`;
}
