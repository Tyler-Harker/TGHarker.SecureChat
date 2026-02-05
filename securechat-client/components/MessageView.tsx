"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Message, type Conversation, type Contact, type ContactRequest } from "@/lib/api-client";
import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/crypto";

interface MessageViewProps {
  conversationId: string;
  onBack?: () => void;
  onDelete?: (conversationId: string) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onUnreadActivity?: () => void;
}

export default function MessageView({ conversationId, onBack, onDelete, onConversationCreated, onUnreadActivity }: MessageViewProps) {
  const { user, accessToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeThread, setActiveThread] = useState<Message | null>(null); // Currently open thread
  const [threadReplies, setThreadReplies] = useState<Message[]>([]);
  const [threadMessage, setThreadMessage] = useState("");
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [contactRequests, setContactRequests] = useState<Map<string, ContactRequest>>(new Map());
  const [sentContactRequests, setSentContactRequests] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const markedAsReadRef = useRef<Set<string>>(new Set()); // Track which messages we've already marked as read
  const activeThreadRef = useRef<Message | null>(null); // Ref to track active thread for SSE handler

  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (activeThread) {
      scrollThreadToBottom();
    }
  }, [threadReplies, activeThread]);

  // Set up SSE connection to listen for new messages
  useEffect(() => {
    if (!conversationId || !accessToken) return;

    // Prevent duplicate connections (React StrictMode issue)
    if (eventSourceRef.current) {
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5280";
    const sseUrl = `${apiUrl}/api/conversations/${conversationId}/events`;

    // Create EventSource with authorization via query parameter
    const eventSource = new EventSource(`${sseUrl}?access_token=${accessToken}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened for conversation", conversationId);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
          const newMsg = data.message as Message;

          // If it's a reply to the currently open thread, add it to thread replies
          if (newMsg.parentMessageId && activeThreadRef.current?.messageId === newMsg.parentMessageId) {
            setThreadReplies((prev) => {
              const exists = prev.some((m) => m.messageId === newMsg.messageId);
              if (exists) return prev;
              return [...prev, newMsg];
            });
          }

          // Add message if it doesn't already exist (prevent duplicates from optimistic updates)
          setMessages((prev) => {
            const exists = prev.some((m) => m.messageId === newMsg.messageId);
            if (exists) {
              return prev;
            }
            return [...prev, newMsg];
          });

          // Notify parent about new incoming message from another user
          if (newMsg.senderId !== user?.sub && onUnreadActivity) {
            onUnreadActivity();
          }
        } else if (data.type === "new_message_indicator") {
          // A message was sent in a different conversation — notify parent for badge
          if (onUnreadActivity) {
            onUnreadActivity();
          }
        } else if (data.type === "conversation_deleted") {
          // A conversation was deleted — may or may not be the one we're viewing
          const deletedId = data.conversationId as string;
          console.log("Conversation deleted:", deletedId);
          if (onDelete) {
            onDelete(deletedId);
          }
          // If the deleted conversation is the one we're viewing, navigate away
          if (deletedId === conversationId && onBack && !onDelete) {
            onBack();
          }
        } else if (data.type === "conversation_created") {
          const newConversation = data.conversation as Conversation;
          if (onConversationCreated) {
            onConversationCreated(newConversation);
          }
        } else if (data.type === "read_receipt") {
          // Update read receipts for the message
          setMessages((prev) =>
            prev.map((m) => {
              if (m.messageId === data.messageId) {
                const readBy = m.readBy || [];
                if (!readBy.includes(data.userId)) {
                  return { ...m, readBy: [...readBy, data.userId] };
                }
              }
              return m;
            })
          );
        } else if (data.type === "contact_request") {
          // Received a contact request
          const request = data.request as ContactRequest;
          setContactRequests((prev) => new Map(prev).set(request.fromUserId, request));
        } else if (data.type === "contact_request_accepted") {
          // Contact request was accepted
          const contact = data.contact as Contact;
          setContacts((prev) => [...prev, contact]);
          setSentContactRequests((prev) => {
            const newSet = new Set(prev);
            newSet.delete(contact.userId);
            return newSet;
          });
        } else if (data.type === "contact_request_declined") {
          // Contact request was declined
          const userId = data.userId as string;
          setSentContactRequests((prev) => {
            const newSet = new Set(prev);
            newSet.delete(userId);
            return newSet;
          });
        }
      } catch (err) {
        console.error("Failed to parse SSE event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      eventSource.close();
    };

    return () => {
      console.log("Closing SSE connection for conversation", conversationId);
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [conversationId, accessToken, user?.sub]);

  // Set up Intersection Observer to mark messages as read when they scroll into view
  useEffect(() => {
    if (!user?.sub || messages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute("data-message-id");
            const senderId = entry.target.getAttribute("data-sender-id");

            // Don't mark our own messages as read, and don't mark the same message twice
            if (messageId && senderId && senderId !== user.sub && !markedAsReadRef.current.has(messageId)) {
              // Mark as read
              markedAsReadRef.current.add(messageId);
              apiClient.markMessageAsRead(conversationId, messageId).catch((err) => {
                console.error("Failed to mark message as read:", err);
                // Remove from set if the API call failed so we can retry
                markedAsReadRef.current.delete(messageId);
              });

              // Stop observing this message
              observer.unobserve(entry.target);
            }
          }
        });
      },
      {
        threshold: 0.5, // Message must be at least 50% visible
      }
    );

    // Observe all message elements
    messageElementsRef.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [messages, conversationId, user?.sub]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const [fetchedMessages, conversationData, contactsData] = await Promise.all([
        apiClient.getMessages(conversationId),
        apiClient.getConversation(conversationId),
        apiClient.getMyContacts(),
      ]);
      setMessages(fetchedMessages);
      setConversation(conversationData);
      setContacts(contactsData);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getDisplayName = (userId: string): string => {
    if (userId === user?.sub) {
      return "You";
    }
    const contact = contacts.find((c) => c.userId === userId);
    if (contact) {
      return contact.nickname || contact.displayName;
    }
    return "Unknown User";
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollThreadToBottom = () => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const openThread = async (message: Message) => {
    setActiveThread(message);
    activeThreadRef.current = message;
    setIsLoadingThread(true);
    try {
      const replies = await apiClient.getMessageReplies(conversationId, message.messageId);
      setThreadReplies(replies);
    } catch (error) {
      console.error("Failed to load thread replies:", error);
    } finally {
      setIsLoadingThread(false);
    }
  };

  const closeThread = () => {
    setActiveThread(null);
    activeThreadRef.current = null;
    setThreadReplies([]);
    setThreadMessage("");
  };

  const handleDeleteConversation = async () => {
    setIsDeleting(true);
    try {
      await apiClient.deleteConversation(conversationId);
      if (onDelete) {
        onDelete(conversationId);
      } else if (onBack) {
        onBack();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      alert("Failed to delete conversation");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
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
      const authTag = uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(16)));

      const sentMessage = await apiClient.postMessage(conversationId, {
        encryptedContent: {
          ciphertext,
          nonce,
          authTag,
          keyVersion: 1,
        },
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

  const handleSendThreadMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadMessage.trim() || !activeThread || isSending) return;

    setIsSending(true);
    try {
      const messageText = threadMessage.trim();

      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(messageText);
      const ciphertext = uint8ArrayToBase64(messageBytes);
      const nonce = uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(12)));
      const authTag = uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(16)));

      const sentMessage = await apiClient.postMessage(conversationId, {
        parentMessageId: activeThread.messageId,
        encryptedContent: {
          ciphertext,
          nonce,
          authTag,
          keyVersion: 1,
        },
      });

      setThreadReplies([...threadReplies, sentMessage]);
      setThreadMessage("");
      scrollThreadToBottom();
    } catch (error) {
      console.error("Failed to send thread reply:", error);
      alert("Failed to send thread reply");
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

  const handleSendContactRequest = async (userId: string) => {
    try {
      await apiClient.sendContactRequest(userId);
      setSentContactRequests((prev) => new Set(prev).add(userId));
    } catch (error) {
      console.error("Failed to send contact request:", error);
      alert("Failed to send contact request. Please try again.");
    }
  };

  const handleAcceptContactRequest = async (request: ContactRequest) => {
    try {
      const result = await apiClient.acceptContactRequest(request.requestId);
      setContacts((prev) => [...prev, result.contact]);
      setContactRequests((prev) => {
        const newMap = new Map(prev);
        newMap.delete(request.fromUserId);
        return newMap;
      });
    } catch (error) {
      console.error("Failed to accept contact request:", error);
      alert("Failed to accept contact request. Please try again.");
    }
  };

  const handleDeclineContactRequest = async (request: ContactRequest) => {
    try {
      await apiClient.declineContactRequest(request.requestId);
      setContactRequests((prev) => {
        const newMap = new Map(prev);
        newMap.delete(request.fromUserId);
        return newMap;
      });
    } catch (error) {
      console.error("Failed to decline contact request:", error);
      alert("Failed to decline contact request. Please try again.");
    }
  };

  const getUnknownParticipants = (): string[] => {
    if (!conversation) return [];
    return conversation.participantUserIds.filter(
      (id) =>
        id !== user?.sub &&
        !contacts.some((c) => c.userId === id) &&
        !sentContactRequests.has(id) &&
        !contactRequests.has(id)
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Main Chat Area */}
      <div className={`flex h-full flex-1 flex-col ${activeThread ? "hidden md:flex" : "flex"}`}>
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
                {conversation ? (() => {
                  const otherParticipants = conversation.participantUserIds.filter(
                    (id) => id !== user?.sub
                  );

                  if (otherParticipants.length === 0) {
                    return "You";
                  } else if (otherParticipants.length === 1) {
                    return getDisplayName(otherParticipants[0]);
                  } else {
                    const names = otherParticipants.slice(0, 2).map(getDisplayName);
                    const remaining = otherParticipants.length - 2;
                    if (remaining > 0) {
                      return `${names.join(", ")} +${remaining}`;
                    }
                    return names.join(", ");
                  }
                })() : "Conversation"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {messages.filter((m) => !m.parentMessageId).length} messages
                {conversation && conversation.participantUserIds.length > 2 && (
                  <span className="ml-1">
                    • {conversation.participantUserIds.length} participants
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              title="Delete conversation"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Contact Request Banners */}
        {(() => {
          const unknownParticipants = getUnknownParticipants();
          const incomingRequests = Array.from(contactRequests.values());

          return (
            <>
              {/* Show banner for unknown participants */}
              {unknownParticipants.length > 0 && (
                <div className="border-b border-gray-200 bg-yellow-50 p-3 dark:border-gray-700 dark:bg-yellow-900/20">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Chatting with unknown user{unknownParticipants.length > 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300">
                        Request contact info to see their profile
                      </p>
                    </div>
                    <button
                      onClick={() => unknownParticipants.forEach(handleSendContactRequest)}
                      className="rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-yellow-700"
                    >
                      Request Contact Info
                    </button>
                  </div>
                </div>
              )}

              {/* Show banner for incoming contact requests */}
              {incomingRequests.map((request) => (
                <div key={request.requestId} className="border-b border-gray-200 bg-blue-50 p-3 dark:border-gray-700 dark:bg-blue-900/20">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        {request.fromUserDisplayName} wants to share contact info
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {request.fromUserEmail}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptContactRequest(request)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineContactRequest(request)}
                        className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/30"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Show banner for sent requests pending response */}
              {Array.from(sentContactRequests).map((userId) => (
                <div key={userId} className="border-b border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                      Contact request sent to {getDisplayName(userId)}. Waiting for response...
                    </p>
                  </div>
                </div>
              ))}
            </>
          );
        })()}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-900 sm:p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-4">
            {messages
              .filter((m) => !m.parentMessageId) // Only show top-level messages
              .map((message) => {
                const isOwnMessage = message.senderId === user?.sub;
                const decryptedText = decryptMessage(message);
                const readCount = message.readBy?.length || 0;
                const replyCount = messages.filter((m) => m.parentMessageId === message.messageId).length;

                return (
                  <div
                    key={message.messageId}
                    ref={(el) => {
                      if (el) messageElementsRef.current.set(message.messageId, el);
                      else messageElementsRef.current.delete(message.messageId);
                    }}
                    data-message-id={message.messageId}
                    data-sender-id={message.senderId}
                    className={`flex flex-col ${isOwnMessage ? "items-end" : "items-start"}`}
                  >
                    {!isOwnMessage && (
                      <span className="mb-1 px-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                        {getDisplayName(message.senderId)}
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%] sm:px-4 ${
                        isOwnMessage
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-900 dark:bg-gray-800 dark:text-white"
                      }`}
                    >
                      <div className="break-words">{decryptedText}</div>

                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span
                          className={
                            isOwnMessage
                              ? "text-blue-100"
                              : "text-gray-500 dark:text-gray-400"
                          }
                        >
                          {new Date(message.timestamp).toLocaleTimeString()}
                          {isOwnMessage && readCount > 0 && (
                            <span className="ml-2">· Read by {readCount}</span>
                          )}
                        </span>

                        <button
                          onClick={() => openThread(message)}
                          className={`hover:underline ${
                            isOwnMessage
                              ? "text-blue-100"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                          title="Reply in thread"
                        >
                          Reply
                        </button>
                      </div>

                      {/* Thread indicator */}
                      {replyCount > 0 && (
                        <button
                          onClick={() => openThread(message)}
                          className={`mt-2 flex items-center gap-1 text-xs font-semibold hover:underline ${
                            isOwnMessage
                              ? "text-blue-100"
                              : "text-blue-600 dark:text-blue-400"
                          }`}
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          {replyCount} {replyCount === 1 ? "reply" : "replies"}
                        </button>
                      )}
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

      {/* Thread Panel */}
      {activeThread && (
        <div className={`flex w-full flex-col border-l border-gray-200 dark:border-gray-700 md:w-96 ${activeThread ? "flex" : "hidden"}`}>
          {/* Thread Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Thread</h3>
            <button
              onClick={closeThread}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Close thread"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Thread Messages */}
          <div className="flex-1 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-900 sm:p-4">
            {isLoadingThread ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Original Message */}
                <div className="rounded-lg border-2 border-blue-200 bg-white p-3 dark:border-blue-800 dark:bg-gray-800">
                  <div className="mb-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Original Message · {getDisplayName(activeThread.senderId)}
                  </div>
                  <div className="break-words text-gray-900 dark:text-white">
                    {decryptMessage(activeThread)}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(activeThread.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {/* Thread Replies */}
                {threadReplies.map((reply) => {
                  const isOwnReply = reply.senderId === user?.sub;
                  const replyText = decryptMessage(reply);

                  return (
                    <div
                      key={reply.messageId}
                      className={`flex flex-col ${isOwnReply ? "items-end" : "items-start"}`}
                    >
                      {!isOwnReply && (
                        <span className="mb-1 px-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                          {getDisplayName(reply.senderId)}
                        </span>
                      )}
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 ${
                          isOwnReply
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-900 dark:bg-gray-800 dark:text-white"
                        }`}
                      >
                        <div className="break-words">{replyText}</div>
                        <div
                          className={`mt-1 text-xs ${
                            isOwnReply
                              ? "text-blue-100"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {new Date(reply.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          {/* Thread Input */}
          <div className="border-t border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-4">
            <form onSubmit={handleSendThreadMessage} className="flex gap-2">
              <input
                type="text"
                value={threadMessage}
                onChange={(e) => setThreadMessage(e.target.value)}
                placeholder="Reply in thread..."
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={!threadMessage.trim() || isSending}
                className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Delete Conversation?
            </h3>
            <p className="mb-6 text-gray-600 dark:text-gray-300">
              This will permanently delete this conversation and all its messages for all participants. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConversation}
                disabled={isDeleting}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
