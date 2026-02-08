"use client";

import { usePushNotifications } from "@/lib/use-push-notifications";

export default function NotificationSettings() {
  const { permissionState, isSubscribed, isLoading, error, subscribe, unsubscribe } =
    usePushNotifications();

  if (permissionState === "unsupported") {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return (
      <div className="rounded border border-dc-divider bg-dc-chat-input p-4 text-sm text-dc-text-muted">
        {isIOS
          ? "Push notifications require installing SecureChat to your home screen. Tap the share button, then \"Add to Home Screen\"."
          : "Push notifications are not supported in this browser."}
      </div>
    );
  }

  if (permissionState === "denied") {
    return (
      <div className="rounded border border-dc-danger/30 bg-dc-danger/10 p-4 text-sm text-dc-danger">
        Notification permission has been denied. Please enable notifications in
        your browser settings to receive push notifications.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-dc-text-primary">
            Push Notifications
          </h3>
          <p className="text-sm text-dc-text-muted">
            {isSubscribed
              ? "You will receive notifications for new messages and contact requests."
              : "Enable to receive notifications when you have new messages."}
          </p>
        </div>
        <button
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={isLoading}
          className={`rounded px-4 py-2 text-sm font-semibold transition-colors ${
            isSubscribed
              ? "bg-dc-hover-sidebar text-dc-text-primary hover:bg-dc-selected-sidebar"
              : "bg-dc-brand text-white hover:bg-dc-brand-hover"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isLoading ? "..." : isSubscribed ? "Disable" : "Enable"}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded border border-dc-warning/30 bg-dc-banner-warning-bg p-3 text-sm text-dc-warning">
          {error}
        </div>
      )}
    </div>
  );
}
