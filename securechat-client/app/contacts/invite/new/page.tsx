"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { apiClient, type CreateInviteResponse } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import SplashScreen from "@/components/SplashScreen";

function GenerateInviteContent() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [invite, setInvite] = useState<CreateInviteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [acceptedByName, setAcceptedByName] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const generateInvite = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCopied(false);

    try {
      const newInvite = await apiClient.createInvite();
      setInvite(newInvite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invite");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Generate invite on mount
  useEffect(() => {
    generateInvite();
  }, [generateInvite]);

  // Set up SSE connection to listen for invite acceptance
  useEffect(() => {
    if (!invite || !accessToken) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5280";
    const sseUrl = `${apiUrl}/api/invites/${invite.inviteId}/events`;

    // Create EventSource with authorization header (using query param as EventSource doesn't support headers)
    // Note: For production, consider using a more secure method
    const eventSource = new EventSource(`${sseUrl}?access_token=${accessToken}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened for invite", invite.inviteId);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "accepted") {
          console.log("Invite accepted by", data.displayName);
          setAcceptedByName(data.displayName);

          // Navigate to contacts after a brief delay to show the success message
          setTimeout(() => {
            router.push("/contacts");
          }, 2000);
        }
      } catch (err) {
        console.error("Failed to parse SSE event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      eventSource.close();
    };

    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
    };
  }, [invite, accessToken, router]);

  // Timer countdown effect
  useEffect(() => {
    if (!invite) return;

    const updateTimeLeft = () => {
      const now = new Date();
      const expires = new Date(invite.expiresAt);
      const diff = expires.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft("Expired");
        setInvite(null);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [invite]);

  const handleCopyUrl = async () => {
    if (!invite) return;

    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = invite.inviteUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBack = () => {
    router.push("/contacts");
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Invite a Contact</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {isLoading ? (
            <div className="flex flex-col items-center rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-300">Generating invite...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-white p-8 text-center shadow-lg dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <svg
                  className="h-8 w-8 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="mb-4 text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={generateInvite}
                className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : invite ? (
            <div className="flex flex-col items-center rounded-xl bg-white p-6 shadow-lg dark:bg-gray-800">
              {acceptedByName ? (
                /* Success State */
                <div className="flex flex-col items-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <svg
                      className="h-8 w-8 text-green-600 dark:text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                    Invite Accepted!
                  </h2>
                  <p className="text-center text-gray-600 dark:text-gray-300">
                    <span className="font-semibold">{acceptedByName}</span> is now your contact.
                  </p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Redirecting to contacts...
                  </p>
                </div>
              ) : (
                <>
                  {/* QR Code */}
                  <div className="mb-4 rounded-lg bg-white p-4">
                    <QRCodeSVG
                      value={invite.inviteUrl}
                      size={200}
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  {/* Timer */}
                  <div className="mb-4 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Expires in</p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">{timeLeft}</p>
                  </div>

                  {/* Instructions */}
                  <p className="mb-4 text-center text-sm text-gray-600 dark:text-gray-300">
                    Scan this QR code with another device, or share the link below.
                  </p>
                </>
              )}

              {!acceptedByName && (
                <>
                  {/* Copy URL Button */}
                  <button
                    onClick={handleCopyUrl}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold transition-colors ${
                      copied
                        ? "bg-green-600 text-white"
                        : "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                    }`}
                  >
                    {copied ? (
                      <>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy Invite Link
                      </>
                    )}
                  </button>

                  {/* Regenerate Button */}
                  <button
                    onClick={generateInvite}
                    className="mt-3 text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Generate New Link
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handleBack}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Done
          </button>
        </div>
      </footer>
    </div>
  );
}

export default function GenerateInvitePage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <AuthGuard>
        <GenerateInviteContent />
      </AuthGuard>
    </Suspense>
  );
}
