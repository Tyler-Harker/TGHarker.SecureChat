"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api-client";
import SplashScreen from "@/components/SplashScreen";

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/");
      return;
    }

    // Pre-fill with name from auth provider if available
    if (user?.name) {
      setDisplayName(user.name);
    } else if (user?.email) {
      // Use email username as default
      setDisplayName(user.email.split("@")[0]);
    }
  }, [isAuthenticated, isAuthLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim()) {
      setError("Please enter a display name");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await apiClient.updateDisplayName(displayName.trim());

      // Check if there's a return URL stored
      const returnUrl = sessionStorage.getItem("onboarding_return_url") ||
                       sessionStorage.getItem("invite_return_url");

      if (returnUrl) {
        sessionStorage.removeItem("onboarding_return_url");
        sessionStorage.removeItem("invite_return_url");
        router.push(returnUrl);
      } else {
        // Redirect to main chat interface
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save display name");
      setIsSaving(false);
    }
  };

  if (isAuthLoading) {
    return <SplashScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 p-4 dark:from-blue-900 dark:to-gray-900">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-800">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg
                className="h-8 w-8 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
              Welcome to SecureChat!
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Let's set up your profile to get started
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="displayName"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Display Name
              </label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400"
                placeholder="Enter your display name"
                autoFocus
                disabled={isSaving}
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                This is how other users will see you in conversations
              </p>
            </div>

            {user?.email && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email
                </label>
                <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  {user.email}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving || !displayName.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-800"
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                  Setting up...
                </span>
              ) : (
                "Continue"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
            You can change your display name anytime in settings
          </div>
        </div>
      </div>
    </div>
  );
}
