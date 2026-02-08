"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api-client";

type EventCallback = (data: Record<string, unknown>) => void;

interface UserEventsContextType {
  unreadCounts: Record<string, number>;
  totalUnreadCount: number;
  clearUnreadCount: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  subscribe: (callback: EventCallback) => () => void;
}

const UserEventsContext = createContext<UserEventsContextType | null>(null);

export function UserEventsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const activeConversationRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const subscribersRef = useRef<Set<EventCallback>>(new Set());
  const fetchRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUnseenCounts = useCallback((token: string, retryCount = 0) => {
    apiClient.setAccessToken(token);
    apiClient.getUnseenCounts().then((counts) => {
      // Merge backend counts with local state, keeping the higher value
      // so SSE-derived increments (which arrive before the backend persists)
      // are never overwritten with stale data.
      setUnreadCounts((prev) => {
        const merged = { ...prev };
        for (const [key, value] of Object.entries(counts)) {
          if (value > 0) {
            merged[key] = Math.max(merged[key] || 0, value);
          }
        }
        return merged;
      });
    }).catch((err) => {
      console.error("Failed to fetch unseen counts:", err);
      // Retry up to 3 times with backoff (handles token-not-yet-valid races)
      if (retryCount < 3) {
        fetchRetryRef.current = setTimeout(
          () => fetchUnseenCounts(token, retryCount + 1),
          1000 * (retryCount + 1)
        );
      }
    });
  }, []);

  // SSE connection + unseen counts fetch.
  // Only run when fully authenticated (not just when accessToken is non-null,
  // since OIDC may provide an expired token from localStorage before renewal).
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    // Fetch persisted counts immediately
    fetchUnseenCounts(accessToken);

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    const MAX_RETRY_DELAY = 30000;

    const connect = () => {
      if (cancelled) return;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5280";
      const sseUrl = `${apiUrl}/api/users/me/events?access_token=${accessToken}`;
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        retryDelay = 1000;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle unread counts internally
          if (data.type === "new_message_indicator") {
            const convId = data.conversationId as string;
            if (convId !== activeConversationRef.current) {
              setUnreadCounts((prev) => ({
                ...prev,
                [convId]: (prev[convId] || 0) + 1,
              }));
            }
          }

          // Dispatch to all subscribers (for conversation list updates, etc.)
          for (const cb of subscribersRef.current) {
            try {
              cb(data);
            } catch {
              // ignore subscriber errors
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        if (cancelled) return;

        retryTimeout = setTimeout(() => {
          retryTimeout = null;
          if (!cancelled) connect();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (fetchRetryRef.current) clearTimeout(fetchRetryRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isAuthenticated, accessToken, fetchUnseenCounts]);

  const clearUnreadCount = useCallback((conversationId: string) => {
    setUnreadCounts((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    apiClient.clearUnseenCount(conversationId).catch(() => {});
  }, []);

  const setActiveConversation = useCallback((conversationId: string | null) => {
    activeConversationRef.current = conversationId;
  }, []);

  const subscribe = useCallback((callback: EventCallback): (() => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const totalUnreadCount = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

  return (
    <UserEventsContext.Provider
      value={{
        unreadCounts,
        totalUnreadCount,
        clearUnreadCount,
        setActiveConversation,
        subscribe,
      }}
    >
      {children}
    </UserEventsContext.Provider>
  );
}

export function useUserEvents(): UserEventsContextType {
  const ctx = useContext(UserEventsContext);
  if (!ctx) {
    throw new Error("useUserEvents must be used within a UserEventsProvider");
  }
  return ctx;
}
