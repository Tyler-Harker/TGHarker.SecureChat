"use client";

import { usePushNotifications } from "@/lib/use-push-notifications";

export default function NotificationSettings() {
  const { permissionState, isSubscribed, isLoading, error, subscribe, unsubscribe } =
    usePushNotifications();

  if (permissionState === "unsupported") {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return (
      <div className="rounded-lg bg-gray-50 p-4 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        {isIOS
          ? "Push notifications require installing SecureChat to your home screen. Tap the share button, then \"Add to Home Screen\"."
          : "Push notifications are not supported in this browser."}
      </div>
    );
  }

  if (permissionState === "denied") {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/30 dark:text-red-400">
        Notification permission has been denied. Please enable notifications in
        your browser settings to receive push notifications.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">
            Push Notifications
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isSubscribed
              ? "You will receive notifications for new messages and contact requests."
              : "Enable to receive notifications when you have new messages."}
          </p>
        </div>
        <button
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={isLoading}
          className={`rounded-lg px-4 py-2 font-semibold transition-colors ${
            isSubscribed
              ? "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isLoading ? "..." : isSubscribed ? "Disable" : "Enable"}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          {error}
        </div>
      )}
    </div>
  );
}
