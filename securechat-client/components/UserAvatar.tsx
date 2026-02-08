"use client";

const AVATAR_COLORS = [
  "#f44336",
  "#e91e63",
  "#9c27b0",
  "#673ab7",
  "#3f51b5",
  "#5865f2",
  "#2196f3",
  "#00bcd4",
  "#009688",
  "#4caf50",
  "#8bc34a",
  "#ff9800",
  "#ff5722",
  "#795548",
  "#607d8b",
];

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getAvatarColor(userId: string): string {
  return AVATAR_COLORS[hashUserId(userId) % AVATAR_COLORS.length];
}

interface UserAvatarProps {
  userId: string;
  displayName: string;
  size?: "sm" | "md" | "lg";
}

export default function UserAvatar({
  userId,
  displayName,
  size = "md",
}: UserAvatarProps) {
  const bgColor = getAvatarColor(userId);
  const initials = displayName
    .split(" ")
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sizeClasses = {
    sm: "h-6 w-6 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizeClasses[size]}`}
      style={{ backgroundColor: bgColor }}
      title={displayName}
    >
      {initials || "?"}
    </div>
  );
}
