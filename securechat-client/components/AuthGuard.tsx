"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api-client";
import SplashScreen from "./SplashScreen";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: isAuthLoading, accessToken, login } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Wait for auth to load
    if (isAuthLoading) {
      return;
    }

    // Trigger login flow if not authenticated, preserving the current URL
    if (!isAuthenticated) {
      const queryString = searchParams.toString();
      const fullUrl = queryString ? `${pathname}?${queryString}` : pathname;
      login(fullUrl);
      return;
    }

    // Ensure user is registered once authenticated
    if (accessToken && !isInitialized) {
      const initializeUser = async () => {
        try {
          apiClient.setAccessToken(accessToken);
          const result = await apiClient.ensureRegistered();

          // If this is a new user, redirect to onboarding
          // Store the current URL with query params to return after onboarding
          if (result.isNewUser) {
            if (pathname !== "/onboarding") {
              const queryString = searchParams.toString();
              const fullUrl = queryString ? `${pathname}?${queryString}` : pathname;
              sessionStorage.setItem("onboarding_return_url", fullUrl);
              router.push("/onboarding");
            }
            return;
          }

          setIsInitialized(true);
        } catch (error) {
          console.error("Failed to ensure user registration:", error);
          setIsInitialized(true); // Still proceed even if ensure fails
        }
      };

      initializeUser();
    }
  }, [isAuthLoading, isAuthenticated, accessToken, isInitialized, router, pathname, searchParams]);

  // Show splash screen while loading
  if (isAuthLoading || !isInitialized) {
    return <SplashScreen />;
  }

  return <>{children}</>;
}
