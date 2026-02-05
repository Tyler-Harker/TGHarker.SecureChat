"use client";

import React, { useEffect } from "react";
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { apiClient } from "@/lib/api-client";

const AUTHORITY = process.env.NEXT_PUBLIC_AUTH_AUTHORITY || "https://identity.harker.dev/harker";
const CLIENT_ID = process.env.NEXT_PUBLIC_AUTH_CLIENT_ID || "securechat-web";
const REDIRECT_URI = typeof window !== "undefined"
  ? `${window.location.origin}/auth/callback`
  : "http://localhost:3000/auth/callback";

const oidcConfig = {
  authority: AUTHORITY,
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: "openid profile email",
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  post_logout_redirect_uri: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
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

// Custom hook that wraps react-oidc-context's useAuth with our interface
export function useAuth() {
  const auth = useOidcAuth();

  return {
    user: auth.user?.profile
      ? {
          sub: auth.user.profile.sub,
          email: auth.user.profile.email as string | undefined,
          name: auth.user.profile.name as string | undefined,
        }
      : null,
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    login: () => auth.signinRedirect(),
    logout: () => auth.signoutRedirect(),
  };
}
