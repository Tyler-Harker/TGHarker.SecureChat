"use client";

import { Provider as ReduxProvider } from 'react-redux';
import { store } from '@/store';
import { AuthProvider, UserEventsProvider } from "@/contexts/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <AuthProvider>
        <UserEventsProvider>{children}</UserEventsProvider>
      </AuthProvider>
    </ReduxProvider>
  );
}
