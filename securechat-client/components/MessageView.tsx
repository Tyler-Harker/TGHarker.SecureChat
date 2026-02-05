"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Message } from "@/lib/api-client";
import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/crypto";

interface MessageViewProps {
  conversationId: string;
  onBack?: () => void;
}

export default function MessageView({ conversationId, onBack }: MessageViewProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const fetchedMessages = await apiClient.getMessages(conversationId);
      setMessages(fetchedMessages);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      // TODO: Implement actual encryption here
      // For now, we'll send unencrypted for demonstration
      const messageText = newMessage.trim();

      // Placeholder: encode as base64 (should be encrypted)
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(messageText);
      const ciphertext = uint8ArrayToBase64(messageBytes);
      const nonce = uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(12)));

      const sentMessage = await apiClient.postMessage(conversationId, {
        ciphertext,
        nonce,
        timestamp: new Date().toISOString(),
      });

      setMessages([...messages, sentMessage]);
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const decryptMessage = (message: Message): string => {
    try {
      // TODO: Implement actual decryption here
      // For now, we'll just decode from base64
      const ciphertextBytes = base64ToUint8Array(message.ciphertext);
      const decoder = new TextDecoder();
      return decoder.decode(ciphertextBytes);
    } catch (error) {
      return "[Decryption failed]";
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          {/* Back button - visible on mobile only */}
          {onBack && (
            <button
              onClick={onBack}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 md:hidden"
              title="Back to conversations"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-white">
              Conversation
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {messages.length} messages
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-900 sm:p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isOwnMessage = message.senderId === user?.sub;
              const decryptedText = decryptMessage(message);

              return (
                <div
                  key={message.messageId}
                  className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%] sm:px-4 ${
                      isOwnMessage
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-900 dark:bg-gray-800 dark:text-white"
                    }`}
                  >
                    <div className="break-words">{decryptedText}</div>
                    <div
                      className={`mt-1 text-xs ${
                        isOwnMessage
                          ? "text-blue-100"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-4">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 sm:px-4"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || isSending}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          >
            {isSending ? (
              <span className="hidden sm:inline">Sending...</span>
            ) : (
              <span className="hidden sm:inline">Send</span>
            )}
            {/* Icon for mobile */}
            <svg
              className="h-5 w-5 sm:hidden"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
