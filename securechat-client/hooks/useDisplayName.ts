import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectContactDisplayName } from '@/store/slices/contactsSlice';

/**
 * Hook to get the display name for a user ID
 * Automatically handles "You" for current user and contact nickname/displayName
 */
export function useDisplayName(userId: string | null | undefined): string {
  const displayName = useAppSelector((state) =>
    userId ? selectContactDisplayName(state, userId) : 'Unknown User'
  );

  return useMemo(() => displayName, [displayName]);
}
