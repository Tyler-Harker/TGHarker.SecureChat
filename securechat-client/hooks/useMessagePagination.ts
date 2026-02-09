import { useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchMessages, selectConversationPagination } from '@/store/slices/messagesSlice';

/**
 * Hook for message pagination logic
 * Provides messages, loading state, and loadMore function
 */
export function useMessagePagination(conversationId: string) {
  const dispatch = useAppDispatch();
  const { messages, hasMore, isLoading, skip } = useAppSelector((state) =>
    selectConversationPagination(state, conversationId)
  );

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      dispatch(fetchMessages({ conversationId, skip, take: 25 }));
    }
  }, [conversationId, skip, hasMore, isLoading, dispatch]);

  const loadInitial = useCallback(() => {
    dispatch(fetchMessages({ conversationId, skip: 0, take: 25 }));
  }, [conversationId, dispatch]);

  return {
    messages,
    hasMore,
    isLoading,
    loadMore,
    loadInitial,
  };
}
