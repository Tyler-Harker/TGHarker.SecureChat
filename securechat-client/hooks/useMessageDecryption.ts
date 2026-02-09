import { useMemo } from 'react';
import { base64ToUint8Array } from '@/lib/crypto';
import type { Message } from '@/lib/api-client';

/**
 * Hook to decrypt a message's ciphertext
 * Currently uses placeholder decryption (base64 decode)
 * TODO: Implement proper E2EE decryption
 */
export function useMessageDecryption(message: Message | null | undefined): string {
  return useMemo(() => {
    if (!message || !message.ciphertext) return '';

    try {
      // Placeholder decryption - just base64 decode
      const decoded = base64ToUint8Array(message.ciphertext);
      const decoder = new TextDecoder();
      return decoder.decode(decoded);
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      return '[Decryption failed]';
    }
  }, [message]);
}
