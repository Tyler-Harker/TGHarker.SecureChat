"use client";

import { useState } from "react";
import { usePushNotifications } from "@/lib/use-push-notifications";

export default function NotificationWarning() {
  const { permissionState, isSubscribed, isLoading, subscribe } =
    usePushNotifications();
  const [showModal, setShowModal] = useState(false);

  // Don't show warning if notifications are working or unsupported
  if (isSubscribed || permissionState === "unsupported") {
    return null;
  }

  const isDenied = permissionState === "denied";

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="relative rounded p-2 text-dc-warning transition-colors hover:bg-dc-hover-sidebar"
        title="Notifications not enabled"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-dc-warning">
          <span className="text-[8px] font-bold text-black">!</span>
        </span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-dc-modal-bg p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dc-warning/15">
                <svg
                  className="h-5 w-5 text-dc-warning"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.999L13.732 4.001c-.77-1.333-2.694-1.333-3.464 0L3.34 16.001C2.57 17.335 3.532 19 5.072 19z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">
                Notifications Disabled
              </h3>
            </div>

            <p className="mb-6 text-sm text-dc-text-secondary">
              {isDenied
                ? "You have blocked notifications for SecureChat. To receive message alerts, please enable notifications in your browser settings and reload the page."
                : "You don\u2019t have notifications enabled. Without them, you may miss new messages and contact requests when you\u2019re not actively using the app."}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded px-4 py-2 font-medium text-dc-text-primary transition-colors bg-dc-hover-sidebar hover:bg-dc-selected-sidebar"
              >
                Dismiss
              </button>
              {!isDenied && (
                <button
                  onClick={async () => {
                    await subscribe();
                    setShowModal(false);
                  }}
                  disabled={isLoading}
                  className="flex-1 rounded bg-dc-brand px-4 py-2 font-medium text-white transition-colors hover:bg-dc-brand-hover disabled:opacity-50"
                >
                  {isLoading ? "Enabling..." : "Enable Notifications"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
