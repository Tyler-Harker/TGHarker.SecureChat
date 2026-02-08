"use client";

import React, { useEffect, useMemo, useCallback } from "react";
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth, AuthProviderProps } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { apiClient } from "@/lib/api-client";

const AUTHORITY = process.env.NEXT_PUBLIC_AUTH_AUTHORITY || "https://identity.harker.dev/harker";
const CLIENT_ID = process.env.NEXT_PUBLIC_AUTH_CLIENT_ID || "securechat-web";

function getOidcConfig(): AuthProviderProps {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return {
    authority: AUTHORITY,
    client_id: CLIENT_ID,
    redirect_uri: `${origin}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
    automaticSilentRenew: true,
    userStore: typeof window !== "undefined" ? new WebStorageStateStore({ store: window.localStorage }) : undefined,
    post_logout_redirect_uri: origin,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const oidcConfig = useMemo(() => getOidcConfig(), []);

  return (
    <OidcAuthProvider {...oidcConfig}>
      <AuthSyncWrapper>{children}</AuthSyncWrapper>
    </OidcAuthProvider>
  );
}

// Wrapper component to sync OIDC auth state with API client
function AuthSyncWrapper({ children }: { children: React.ReactNode }) {
  const auth = useOidcAuth();

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.access_token) {
      apiClient.setAccessToken(auth.user.access_token);
    } else {
      apiClient.clearAccessToken();
    }
  }, [auth.isAuthenticated, auth.user?.access_token]);

  return <>{children}</>;
}

// Re-export UserEventsProvider so layout can nest it inside AuthProvider
export { UserEventsProvider } from "@/contexts/UserEventsContext";

const RETURN_URL_KEY = "auth_return_url";

export function storeReturnUrl(url: string) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(RETURN_URL_KEY, url);
  }
}

export function getAndClearReturnUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = sessionStorage.getItem(RETURN_URL_KEY);
  sessionStorage.removeItem(RETURN_URL_KEY);
  return url;
}

// Custom hook that wraps react-oidc-context's useAuth with our interface
export function useAuth() {
  const auth = useOidcAuth();

  const login = useCallback((returnTo?: string) => {
    if (returnTo) {
      storeReturnUrl(returnTo);
    }
    auth.signinRedirect();
  }, [auth]);

  const logout = useCallback(() => {
    auth.signoutRedirect();
  }, [auth]);

  return {
    user: auth.user?.profile
      ? {
          sub: auth.user.profile.sub,
          email: auth.user.profile.email as string | undefined,
          name: auth.user.profile.name as string | undefined,
        }
      : null,
    accessToken: auth.user?.access_token ?? null,
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    login,
    logout,
  };
}
