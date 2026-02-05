"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "./api-client";

type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export function usePushNotifications() {
  const [permissionState, setPermissionState] =
    useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const vapidKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermissionState("unsupported");
      return;
    }

    setPermissionState(Notification.permission as PushPermissionState);

    // Manually register the service worker (following Next.js PWA guide)
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        registrationRef.current = registration;
        return registration.pushManager.getSubscription();
      })
      .then((subscription) => {
        setIsSubscribed(subscription !== null);
      })
      .catch((err) => {
        console.error("Service worker registration failed:", err);
      });

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
        subscribe();
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  const getVapidKey = useCallback(async (): Promise<string> => {
    if (vapidKeyRef.current) return vapidKeyRef.current;

    const envKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (envKey) {
      vapidKeyRef.current = envKey;
      return envKey;
    }

    const { publicKey } = await apiClient.getVapidPublicKey();
    vapidKeyRef.current = publicKey;
    return publicKey;
  }, []);

  const subscribe = useCallback(async () => {
    if (permissionState === "unsupported") return;

    setIsLoading(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PushPermissionState);

      if (permission !== "granted") return;

      const vapidKey = await getVapidKey();
      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      const userAgent = navigator.userAgent;
      const deviceLabel = /Mobile/.test(userAgent) ? "Mobile" : "Desktop";
      await apiClient.subscribePush(subscription, deviceLabel);

      setIsSubscribed(true);
    } catch (err) {
      console.error("Failed to subscribe to push notifications:", err);
      setError("Failed to enable push notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [permissionState, getVapidKey]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await apiClient.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (err) {
      console.error("Failed to unsubscribe from push notifications:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    permissionState,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
