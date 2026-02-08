"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api-client";
import SplashScreen from "@/components/SplashScreen";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type Platform = "ios" | "chromium" | "other";

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-step state
  const [step, setStep] = useState(1);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installOutcome, setInstallOutcome] = useState<"accepted" | "dismissed" | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamically compute steps based on standalone detection
  const showPwaStep = !isStandalone;
  const totalSteps = showPwaStep ? 2 : 1;

  // Auth redirect + pre-fill display name
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/");
      return;
    }

    if (user?.name) {
      setDisplayName(user.name);
    } else if (user?.email) {
      setDisplayName(user.email.split("@")[0]);
    }
  }, [isAuthenticated, isAuthLoading, user, router]);

  // PWA standalone detection + platform detection + beforeinstallprompt capture
  useEffect(() => {
    const isIOSStandalone =
      "standalone" in window.navigator &&
      (window.navigator as unknown as { standalone: boolean }).standalone;
    const isDisplayStandalone = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;

    if (isIOSStandalone || isDisplayStandalone) {
      setIsStandalone(true);
      return;
    }

    // Platform detection
    const ua = navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      setPlatform("ios");
    } else if ("BeforeInstallPromptEvent" in window || /Chrome|Chromium|Edg/.test(ua)) {
      setPlatform("chromium");
    } else {
      setPlatform("other");
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const finishOnboarding = () => {
    const returnUrl =
      sessionStorage.getItem("onboarding_return_url") ||
      sessionStorage.getItem("invite_return_url");

    if (returnUrl) {
      sessionStorage.removeItem("onboarding_return_url");
      sessionStorage.removeItem("invite_return_url");
      router.push(returnUrl);
    } else {
      router.push("/");
    }
  };

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

      if (step < totalSteps) {
        setStep(step + 1);
        setIsSaving(false);
      } else {
        finishOnboarding();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save display name"
      );
      setIsSaving(false);
    }
  };

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    setInstallOutcome(choiceResult.outcome);
    setDeferredPrompt(null);

    redirectTimerRef.current = setTimeout(() => {
      finishOnboarding();
    }, 1500);
  };

  if (isAuthLoading) {
    return <SplashScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dc-chat-bg p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-dc-divider bg-dc-sidebar p-8">
          {/* Step indicator */}
          {totalSteps > 1 && (
            <div className="mb-6 flex items-center justify-center gap-2">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i + 1 === step ? "bg-dc-brand" : "bg-dc-divider"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Step 1: Display Name */}
          {step === 1 && (
            <>
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dc-brand/15">
                  <svg
                    className="h-8 w-8 text-dc-brand"
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
                <h1 className="mb-2 text-2xl font-bold text-white">
                  Welcome to SecureChat!
                </h1>
                <p className="text-dc-text-secondary">
                  Let&apos;s set up your profile to get started
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="rounded border border-dc-danger/30 bg-dc-danger/10 p-4 text-sm text-dc-danger">
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="displayName"
                    className="mb-2 block text-sm font-medium text-dc-text-secondary"
                  >
                    Display Name
                  </label>
                  <input
                    type="text"
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded border border-dc-input-border bg-dc-chat-input px-4 py-3 text-sm text-dc-text-primary focus:border-dc-brand focus:outline-none focus:ring-1 focus:ring-dc-brand"
                    placeholder="Enter your display name"
                    autoFocus
                    disabled={isSaving}
                  />
                  <p className="mt-2 text-xs text-dc-text-muted">
                    This is how other users will see you in conversations
                  </p>
                </div>

                {user?.email && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-dc-text-secondary">
                      Email
                    </label>
                    <input
                      type="text"
                      value={user.email}
                      disabled
                      className="w-full rounded border border-dc-input-border bg-dc-chat-input px-4 py-3 text-sm text-dc-text-muted"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSaving || !displayName.trim()}
                  className="w-full rounded bg-dc-brand px-4 py-3 font-semibold text-white transition-colors hover:bg-dc-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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

              <div className="mt-6 text-center text-xs text-dc-text-muted">
                You can change your display name anytime in settings
              </div>
            </>
          )}

          {/* Step 2: PWA Install */}
          {step === 2 && (
            <>
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dc-brand/15">
                  <svg
                    className="h-8 w-8 text-dc-brand"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </div>
                <h1 className="mb-2 text-2xl font-bold text-white">
                  Install SecureChat
                </h1>
                <p className="text-dc-text-secondary">
                  Get the best experience by adding SecureChat to your home
                  screen
                </p>
              </div>

              <div className="space-y-4">
                {/* Chromium with install prompt available */}
                {platform === "chromium" && deferredPrompt && !installOutcome && (
                  <>
                    <p className="text-center text-sm text-dc-text-secondary">
                      Install SecureChat for quick access and push
                      notifications.
                    </p>
                    <button
                      onClick={handleInstallPwa}
                      className="w-full rounded bg-dc-brand px-4 py-3 font-semibold text-white transition-colors hover:bg-dc-brand-hover"
                    >
                      Install App
                    </button>
                  </>
                )}

                {/* Chromium without install prompt (already installed or criteria not met) */}
                {platform === "chromium" && !deferredPrompt && !installOutcome && (
                  <p className="text-center text-sm text-dc-text-secondary">
                    Look for the install icon{" "}
                    <span className="inline-block align-middle">
                      <svg className="inline h-4 w-4 text-dc-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </span>{" "}
                    in your browser&apos;s address bar to install SecureChat.
                  </p>
                )}

                {/* Install accepted */}
                {installOutcome === "accepted" && (
                  <div className="rounded border border-dc-success/30 bg-dc-success/10 p-4 text-center text-sm text-dc-success">
                    SecureChat has been installed! Redirecting...
                  </div>
                )}

                {/* Install dismissed */}
                {installOutcome === "dismissed" && (
                  <div className="text-center text-sm text-dc-text-muted">
                    No worries! You can install it later from your browser menu.
                    Redirecting...
                  </div>
                )}

                {/* iOS instructions */}
                {platform === "ios" && (
                  <div className="space-y-3">
                    <p className="text-center text-sm text-dc-text-secondary">
                      To install SecureChat on your device:
                    </p>
                    <ol className="space-y-3 text-sm text-dc-text-secondary">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dc-brand/15 text-xs font-bold text-dc-brand">
                          1
                        </span>
                        <span>
                          Tap the{" "}
                          <strong className="text-white">Share</strong>{" "}
                          button{" "}
                          <svg className="inline h-4 w-4 text-dc-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>{" "}
                          in Safari&apos;s toolbar
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dc-brand/15 text-xs font-bold text-dc-brand">
                          2
                        </span>
                        <span>
                          Scroll down and tap{" "}
                          <strong className="text-white">
                            Add to Home Screen
                          </strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dc-brand/15 text-xs font-bold text-dc-brand">
                          3
                        </span>
                        <span>
                          Tap <strong className="text-white">Add</strong> to
                          confirm
                        </span>
                      </li>
                    </ol>
                  </div>
                )}

                {/* Other browsers */}
                {platform === "other" && (
                  <p className="text-center text-sm text-dc-text-secondary">
                    For the best experience, open SecureChat in Chrome or Safari
                    and install it as an app from the browser menu.
                  </p>
                )}

                {/* Skip button (hidden during auto-redirect after install choice) */}
                {!installOutcome && (
                  <button
                    onClick={finishOnboarding}
                    className="w-full rounded border border-dc-divider bg-transparent px-4 py-3 text-sm font-medium text-dc-text-secondary transition-colors hover:bg-dc-hover-sidebar hover:text-white"
                  >
                    Maybe Later
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
