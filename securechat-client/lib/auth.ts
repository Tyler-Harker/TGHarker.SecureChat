/**
 * OAuth2 PKCE Authentication Flow
 */

const AUTHORITY = process.env.NEXT_PUBLIC_AUTH_AUTHORITY || "https://identity.harker.dev/tenant/harker";
const CLIENT_ID = process.env.NEXT_PUBLIC_AUTH_CLIENT_ID || "securechat-web";
const REDIRECT_URI = typeof window !== "undefined"
  ? `${window.location.origin}/auth/callback`
  : "http://localhost:3000/auth/callback";

interface PKCEState {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

/**
 * Generate a random string for code verifier
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate PKCE code challenge from code verifier
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", data);

  // Base64 URL encode
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Initialize OAuth2 PKCE flow
 */
export async function initiateLogin(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store PKCE state in sessionStorage
  const pkceState: PKCEState = {
    codeVerifier,
    codeChallenge,
    state,
  };
  sessionStorage.setItem("pkce_state", JSON.stringify(pkceState));

  // Build authorization URL
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${AUTHORITY}/authorize?${params.toString()}`;

  // Redirect to authorization endpoint
  window.location.href = authUrl;
}

/**
 * Handle OAuth2 callback and exchange code for token
 */
export async function handleCallback(
  code: string,
  state: string
): Promise<{ accessToken: string; idToken: string }> {
  // Retrieve PKCE state from sessionStorage
  const pkceStateJson = sessionStorage.getItem("pkce_state");
  if (!pkceStateJson) {
    throw new Error("No PKCE state found in session");
  }

  const pkceState: PKCEState = JSON.parse(pkceStateJson);

  // Verify state parameter
  if (state !== pkceState.state) {
    throw new Error("State mismatch - possible CSRF attack");
  }

  // Exchange authorization code for tokens
  const tokenResponse = await fetch(`${AUTHORITY}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pkceState.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens = await tokenResponse.json();

  // Clear PKCE state
  sessionStorage.removeItem("pkce_state");

  // Store tokens in localStorage (or secure cookie in production)
  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("id_token", tokens.id_token);
  if (tokens.refresh_token) {
    localStorage.setItem("refresh_token", tokens.refresh_token);
  }

  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
  };
}

/**
 * Get stored access token
 */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

/**
 * Get user info from ID token
 */
export function getUserInfo(): { sub: string; email?: string; name?: string } | null {
  if (typeof window === "undefined") return null;

  const idToken = localStorage.getItem("id_token");
  if (!idToken) return null;

  try {
    // Decode JWT (base64 URL decode middle part)
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );

    return {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.preferred_username,
    };
  } catch (error) {
    console.error("Failed to decode ID token:", error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

/**
 * Logout and clear stored tokens
 */
export function logout(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem("access_token");
  localStorage.removeItem("id_token");
  localStorage.removeItem("refresh_token");

  // Optionally redirect to IDP logout
  const logoutUrl = `${AUTHORITY}/oauth2/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
  window.location.href = logoutUrl;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;

  try {
    const tokenResponse = await fetch(`${AUTHORITY}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Token refresh failed");
    }

    const tokens = await tokenResponse.json();

    localStorage.setItem("access_token", tokens.access_token);
    if (tokens.refresh_token) {
      localStorage.setItem("refresh_token", tokens.refresh_token);
    }

    return tokens.access_token;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    logout();
    return null;
  }
}
