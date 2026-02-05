"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";

export default function AuthCallbackPage() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    // The OIDC library automatically handles the callback
    // We just need to redirect once authentication is complete
    if (!auth.isLoading) {
      if (auth.isAuthenticated) {
        router.push("/");
      } else if (auth.error) {
        console.error("Authentication error:", auth.error);
        router.push("/?error=auth_failed");
      }
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]">
          <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
            Loading...
          </span>
        </div>
        <p className="mt-4 text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}
