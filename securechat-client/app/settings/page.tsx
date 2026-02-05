"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { apiClient, type UserProfile } from "@/lib/api-client";
import SplashScreen from "@/components/SplashScreen";
import AuthGuard from "@/components/AuthGuard";

function SettingsContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userProfile = await apiClient.getMyProfile();
      setProfile(userProfile);
      setDisplayName(userProfile.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError("Display name cannot be empty");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiClient.updateDisplayName(displayName);
      setSuccessMessage("Display name updated successfully");
      // Reload profile to get updated data
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update display name");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    router.push("/chats");
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header - Desktop */}
      <header className="hidden border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:block">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-4">
          <button
            onClick={handleBack}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title="Back"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
        </div>
      </header>

      {/* Header - Mobile */}
      <header className="flex border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:hidden">
        <div className="flex w-full items-center gap-4 px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-6 shadow-lg dark:bg-gray-800">
            <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-white">Profile Settings</h2>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mb-4 rounded-lg bg-green-50 p-4 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {successMessage}
              </div>
            )}

            {profile && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="text"
                    value={profile.email}
                    disabled
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Email cannot be changed
                  </p>
                </div>

                <div>
                  <label htmlFor="displayName" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Display Name
                  </label>
                  <input
                    type="text"
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    placeholder="Enter your display name"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    This is how other users will see you
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    User ID
                  </label>
                  <input
                    type="text"
                    value={profile.userId}
                    disabled
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 font-mono text-xs text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleSave}
                    disabled={isSaving || displayName === profile.displayName}
                    className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <div className="safe-area-bottom border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:hidden">
        <div className="flex">
          <button
            onClick={() => router.push("/chats")}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-gray-500 dark:text-gray-400"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="text-xs font-medium">Chats</span>
          </button>
          <button
            onClick={() => router.push("/contacts")}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-gray-500 dark:text-gray-400"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span className="text-xs font-medium">Contacts</span>
          </button>
          <button className="flex flex-1 flex-col items-center gap-1 py-3 text-blue-600 dark:text-blue-400">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-xs font-medium">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <AuthGuard>
        <SettingsContent />
      </AuthGuard>
    </Suspense>
  );
}
