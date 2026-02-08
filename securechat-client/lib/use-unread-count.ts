"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api-client";

export function useUnreadCount() {
  const { accessToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch persisted unseen counts on mount
  useEffect(() => {
    if (!accessToken) return;

    apiClient.getUnseenCounts().then((counts) => {
      const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
      if (total > 0) {
        setUnreadCount(total);
      }
    }).catch(() => {
      // ignore fetch errors — SSE will still work for real-time updates
    });
  }, [accessToken]);

  // SSE for real-time updates
  useEffect(() => {
    if (!accessToken) return;

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
          if (data.type === "new_message_indicator") {
            setUnreadCount((prev) => prev + 1);
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
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [accessToken]);

  return unreadCount;
}
