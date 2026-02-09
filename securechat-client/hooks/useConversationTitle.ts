import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectAllContacts } from '@/store/slices/contactsSlice';
import type { Conversation } from '@/lib/api-client';

export function useConversationTitle(conversation: Conversation | null | undefined) {
  const currentUserId = useAppSelector((state) => state.auth.user?.sub);
  const contacts = useAppSelector(selectAllContacts);

  return useMemo(() => {
    if (!conversation) return 'Conversation';
    if (conversation.name) return conversation.name;

    const otherParticipants = conversation.participantUserIds.filter(
      (id) => id !== currentUserId
    );

    if (otherParticipants.length === 0) return 'You';

    if (otherParticipants.length === 1) {
      const contact = contacts.find((c) => c.userId === otherParticipants[0]);
      return contact?.nickname || contact?.displayName || 'Unknown User';
    }

    // Format multi-participant title
    const names = otherParticipants.slice(0, 2).map((id) => {
      const contact = contacts.find((c) => c.userId === id);
      return contact?.nickname || contact?.displayName || 'Unknown';
    });

    const remaining = otherParticipants.length - 2;
    return remaining > 0 ? `${names.join(', ')} +${remaining}` : names.join(', ');
  }, [conversation, currentUserId, contacts]);
}
