"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type ContactInviteInfo, type Contact } from "@/lib/api-client";
import SplashScreen from "@/components/SplashScreen";
import AuthGuard from "@/components/AuthGuard";

type InviteState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "ready"; invite: ContactInviteInfo }
  | { status: "accepting" }
  | { status: "success"; contact: Contact }
  | { status: "error"; message: string };

function InviteAcceptContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<InviteState>({ status: "loading" });

  const inviteId = searchParams.get("id");
  const inviteSecret = searchParams.get("secret");
  const inviteSecretCode = searchParams.get("code");

  useEffect(() => {
    if (!inviteId || !inviteSecret || !inviteSecretCode) {
      setState({ status: "invalid", message: "Invalid invite link" });
      return;
    }

    if (state.status !== "loading") {
      return;
    }

    const loadInvite = async () => {
      try {
        const invite = await apiClient.getInvite(inviteId);

        if (new Date(invite.expiresAt) < new Date()) {
          setState({ status: "invalid", message: "This invite has expired" });
          return;
        }

        if (invite.isAccepted) {
          setState({ status: "invalid", message: "This invite has already been used" });
          return;
        }

        if (user?.sub === invite.creatorUserId) {
          setState({ status: "invalid", message: "You cannot accept your own invite" });
        } else {
          setState({ status: "ready", invite });
        }
      } catch {
        setState({ status: "invalid", message: "Invite not found" });
      }
    };

    loadInvite();
  }, [inviteId, inviteSecret, inviteSecretCode, user?.sub, state.status]);

  const handleAccept = async () => {
    if (!inviteId || !inviteSecret || !inviteSecretCode) return;

    setState({ status: "accepting" });

    try {
      const result = await apiClient.acceptInvite(inviteId, inviteSecret, inviteSecretCode);

      if (result.success && result.newContact) {
        setState({ status: "success", contact: result.newContact });
      } else {
        setState({ status: "error", message: result.error || "Failed to accept invite" });
      }
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to accept invite",
      });
    }
  };

  const handleGoToContacts = () => {
    router.push("/contacts");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dc-chat-bg p-4">
      <div className="w-full max-w-md rounded-lg border border-dc-divider bg-dc-modal-bg p-8 shadow-lg">

        {state.status === "invalid" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dc-danger/20">
              <svg className="h-8 w-8 text-dc-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-white">Invalid Invite</h1>
            <p className="mb-6 text-dc-text-secondary">{state.message}</p>
            <button
              onClick={handleGoToContacts}
              className="rounded bg-dc-brand px-6 py-3 font-semibold text-white hover:bg-dc-brand-hover"
            >
              Go to Home
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dc-brand/20">
              <svg className="h-8 w-8 text-dc-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-white">Add Contact</h1>
            <p className="mb-6 text-dc-text-secondary">
              <span className="font-semibold text-dc-text-primary">{state.invite.creatorDisplayName}</span> wants to add
              you as a contact. Accept to become mutual contacts.
            </p>
            <button
              onClick={handleAccept}
              className="w-full rounded bg-dc-brand px-6 py-3 font-semibold text-white hover:bg-dc-brand-hover"
            >
              Accept Invitation
            </button>
          </div>
        )}

        {state.status === "accepting" && (
          <div className="flex flex-col items-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-solid border-dc-brand border-r-transparent"></div>
            <p className="text-dc-text-secondary">Adding contact...</p>
          </div>
        )}

        {state.status === "success" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dc-success/20">
              <svg className="h-8 w-8 text-dc-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-white">Contact Added!</h1>
            <p className="mb-6 text-dc-text-secondary">
              You and <span className="font-semibold text-dc-text-primary">{state.contact.displayName}</span> are now
              contacts.
            </p>
            <button
              onClick={handleGoToContacts}
              className="w-full rounded bg-dc-brand px-6 py-3 font-semibold text-white hover:bg-dc-brand-hover"
            >
              Go to Contacts
            </button>
          </div>
        )}

        {state.status === "error" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dc-danger/20">
              <svg className="h-8 w-8 text-dc-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-white">Something went wrong</h1>
            <p className="mb-6 text-dc-text-secondary">{state.message}</p>
            <button
              onClick={handleGoToContacts}
              className="rounded bg-dc-brand px-6 py-3 font-semibold text-white hover:bg-dc-brand-hover"
            >
              Go to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <AuthGuard>
        <InviteAcceptContent />
      </AuthGuard>
    </Suspense>
  );
}
