"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Message, type Conversation, type Contact, type ContactRequest, type FetchedAttachment } from "@/lib/api-client";
import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/crypto";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";

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
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const threadTextareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentCacheRef = useRef<Map<string, FetchedAttachment>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const markedAsReadRef = useRef<Set<string>>(new Set()); // Track which messages we've already marked as read
  const activeThreadRef = useRef<Message | null>(null); // Ref to track active thread for SSE handler
  const PAGE_SIZE = 50;

  useEffect(() => {
    isInitialLoadRef.current = true;
    setHasMoreMessages(true);
    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    if (isInitialLoadRef.current) {
      // On initial load, scroll instantly to bottom
      messagesEndRef.current?.scrollIntoView();
      isInitialLoadRef.current = false;
    }
    // Focus the message input when conversation finishes loading
    if (!isLoading && !activeThread) {
      messageTextareaRef.current?.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    if (activeThread) {
      scrollThreadToBottom();
    }
  }, [threadReplies, activeThread]);

  // Handle incoming SSE event data
  const handleSseEvent = useCallback((data: Record<string, unknown>) => {
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
        // Scroll to bottom for new messages
        requestAnimationFrame(() => scrollToBottom());
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
            if (!readBy.includes(data.userId as string)) {
              return { ...m, readBy: [...readBy, data.userId as string] };
            }
          }
          return m;
        })
      );
    } else if (data.type === "reaction_added") {
      const addReaction = (msgs: Message[]) =>
        msgs.map((m) => {
          if (m.messageId === data.messageId) {
            const reactions = { ...(m.reactions || {}) };
            const users = reactions[data.emoji as string] || [];
            if (!users.includes(data.userId as string)) {
              reactions[data.emoji as string] = [...users, data.userId as string];
            }
            return { ...m, reactions };
          }
          return m;
        });
      setMessages(addReaction);
      setThreadReplies(addReaction);
      setActiveThread((prev) => (prev ? addReaction([prev])[0] : null));
    } else if (data.type === "reaction_removed") {
      const removeReaction = (msgs: Message[]) =>
        msgs.map((m) => {
          if (m.messageId === data.messageId) {
            const reactions = { ...(m.reactions || {}) };
            const users = (reactions[data.emoji as string] || []).filter(
              (id: string) => id !== data.userId
            );
            if (users.length === 0) {
              delete reactions[data.emoji as string];
            } else {
              reactions[data.emoji as string] = users;
            }
            return { ...m, reactions };
          }
          return m;
        });
      setMessages(removeReaction);
      setThreadReplies(removeReaction);
      setActiveThread((prev) => (prev ? removeReaction([prev])[0] : null));
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
  }, [conversationId, user?.sub, onUnreadActivity, onDelete, onBack, onConversationCreated]);

  // Refetch messages and conversation data (used on SSE reconnect to fill gaps)
  const refetchData = useCallback(async () => {
    try {
      const [fetchedMessages, conversationData, contactsData] = await Promise.all([
        apiClient.getMessages(conversationId, 0, PAGE_SIZE),
        apiClient.getConversation(conversationId),
        apiClient.getMyContacts(),
      ]);
      setMessages(fetchedMessages);
      setConversation(conversationData);
      setContacts(contactsData);
      setHasMoreMessages(fetchedMessages.length >= PAGE_SIZE);

      // If a thread is open, refetch its replies too
      if (activeThreadRef.current) {
        const replies = await apiClient.getMessageReplies(conversationId, activeThreadRef.current.messageId);
        setThreadReplies(replies);
      }
    } catch (error) {
      console.error("Failed to refetch data after reconnect:", error);
    }
  }, [conversationId]);

  // Set up SSE connection with auto-reconnect
  useEffect(() => {
    if (!conversationId || !accessToken) return;

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000; // Start at 1s, exponential backoff up to 30s
    const MAX_RETRY_DELAY = 30000;

    const connect = () => {
      if (cancelled) return;

      // Clean up any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5280";
      const sseUrl = `${apiUrl}/api/conversations/${conversationId}/events`;

      const eventSource = new EventSource(`${sseUrl}?access_token=${accessToken}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("SSE connection opened for conversation", conversationId);
        retryDelay = 1000; // Reset backoff on successful connection
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleSseEvent(data);
        } catch (err) {
          console.error("Failed to parse SSE event:", err);
        }
      };

      eventSource.onerror = () => {
        console.error("SSE connection error for conversation", conversationId);
        eventSource.close();
        eventSourceRef.current = null;

        if (cancelled) return;

        console.log(`SSE reconnecting in ${retryDelay / 1000}s...`);
        retryTimeout = setTimeout(() => {
          retryTimeout = null;
          // Refetch data to fill any gaps from downtime, then reconnect
          refetchData().finally(() => {
            if (!cancelled) connect();
          });
        }, retryDelay);

        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (eventSourceRef.current) {
        console.log("Closing SSE connection for conversation", conversationId);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [conversationId, accessToken, handleSseEvent, refetchData]);

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
        apiClient.getMessages(conversationId, 0, PAGE_SIZE),
        apiClient.getConversation(conversationId),
        apiClient.getMyContacts(),
      ]);
      setMessages(fetchedMessages);
      setConversation(conversationData);
      setContacts(contactsData);
      setHasMoreMessages(fetchedMessages.length >= PAGE_SIZE);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOlderMessages = async () => {
    if (isLoadingMore || !hasMoreMessages) return;
    setIsLoadingMore(true);

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;

    try {
      const currentCount = messages.length;
      const olderMessages = await apiClient.getMessages(conversationId, currentCount, PAGE_SIZE);
      if (olderMessages.length < PAGE_SIZE) {
        setHasMoreMessages(false);
      }
      if (olderMessages.length > 0) {
        setMessages((prev) => [...olderMessages, ...prev]);
        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - previousScrollHeight;
          }
        });
      }
    } catch (error) {
      console.error("Failed to load older messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    // Load more when scrolled near the top
    if (container.scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
      loadOlderMessages();
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
    requestAnimationFrame(() => messageTextareaRef.current?.focus());
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith("image/")) {
      alert("Only image files are supported.");
      return;
    }

    // Validate size (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be under 10 MB.");
      return;
    }

    setPendingImage(file);
    setPendingImagePreview(URL.createObjectURL(file));

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const cancelImageSelection = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingImage) || isSending) return;

    setIsSending(true);
    try {
      let attachmentId: string | undefined;

      // Upload image first if present
      if (pendingImage) {
        setIsUploading(true);
        try {
          const attachment = await apiClient.uploadAttachment(conversationId, pendingImage);
          attachmentId = attachment.attachmentId;
        } finally {
          setIsUploading(false);
        }
        cancelImageSelection();
      }

      // Placeholder encryption: encode as base64 (should be encrypted)
      const messageText = newMessage.trim() || (attachmentId ? "" : "");
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(messageText);
      const ciphertext = uint8ArrayToBase64(messageBytes);
      const nonce = uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(12)));
      const authTag = uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(16)));

      const sentMessage = await apiClient.postMessage(conversationId, {
        attachmentId,
        encryptedContent: {
          ciphertext,
          nonce,
          authTag,
          keyVersion: 1,
        },
      });

      setMessages([...messages, sentMessage]);
      setNewMessage("");
      if (messageTextareaRef.current) {
        messageTextareaRef.current.style.height = "auto";
        messageTextareaRef.current.focus();
      }
      requestAnimationFrame(() => scrollToBottom());
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
      if (threadTextareaRef.current) threadTextareaRef.current.style.height = "auto";
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

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    const userId = user?.sub;
    if (!userId) return;

    const updateReactions = (msgs: Message[]) =>
      msgs.map((m) => {
        if (m.messageId !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(userId)) {
          const filtered = users.filter((id) => id !== userId);
          if (filtered.length === 0) delete reactions[emoji];
          else reactions[emoji] = filtered;
        } else {
          reactions[emoji] = [...users, userId];
        }
        return { ...m, reactions };
      });

    setMessages(updateReactions);
    setThreadReplies(updateReactions);
    setActiveThread((prev) => (prev ? updateReactions([prev])[0] : null));
    setReactionPickerMessageId(null);
    messageTextareaRef.current?.focus();

    try {
      await apiClient.toggleReaction(conversationId, messageId, emoji);
    } catch (error) {
      console.error("Failed to toggle reaction:", error);
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

  const AttachmentImage = ({ message }: { message: Message }) => {
    const [attachment, setAttachment] = useState<FetchedAttachment | null>(null);
    const [loading, setLoading] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);

    useEffect(() => {
      if (!message.attachmentId) return;

      const cached = attachmentCacheRef.current.get(message.attachmentId);
      if (cached) {
        setAttachment(cached);
        setLoading(false);
        return;
      }

      apiClient
        .fetchAttachment(conversationId, message.attachmentId)
        .then((result) => {
          attachmentCacheRef.current.set(message.attachmentId!, result);
          setAttachment(result);
        })
        .catch((err) => console.error("Failed to fetch attachment:", err))
        .finally(() => setLoading(false));
    }, [message.attachmentId]);

    if (!message.attachmentId) return null;

    if (loading) {
      return (
        <div className="my-1 flex h-32 w-48 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-blue-600 border-r-transparent"></div>
        </div>
      );
    }

    if (!attachment) return null;

    return (
      <>
        <img
          src={attachment.url}
          alt={attachment.fileName}
          className="my-1 max-h-64 cursor-pointer rounded-lg object-contain"
          onClick={() => setFullscreen(true)}
        />
        {fullscreen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setFullscreen(false)}
          >
            <img
              src={attachment.url}
              alt={attachment.fileName}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
          </div>
        )}
      </>
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
      <div className={`flex min-h-0 flex-1 flex-col ${activeThread ? "hidden md:flex" : "flex"}`}>
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
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-900 sm:p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-4">
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-blue-600 border-r-transparent"></div>
              </div>
            )}
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
                    <div className="group max-w-[85%] sm:max-w-[70%]">
                      <div
                        className={`relative rounded-lg px-3 py-2 sm:px-4 ${
                          isOwnMessage
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-900 dark:bg-gray-800 dark:text-white"
                        }`}
                      >
                        {message.attachmentId && <AttachmentImage message={message} />}
                        {decryptedText && <div className="whitespace-pre-wrap break-words">{decryptedText}</div>}

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

                        {/* Hover emoji button */}
                        <button
                          onClick={() => setReactionPickerMessageId(
                            reactionPickerMessageId === message.messageId ? null : message.messageId
                          )}
                          className="absolute -bottom-3 right-2 z-10 rounded-full border border-gray-200 bg-white p-1 opacity-0 shadow-sm transition-opacity hover:bg-gray-100 group-hover:opacity-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                          title="React"
                        >
                          <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </div>
                      {/* Reaction pills - below bubble, overlapping with z-index */}
                      {message.reactions && Object.keys(message.reactions).length > 0 && (
                        <div className={`relative z-10 -mt-1 flex flex-wrap gap-1 px-1 ${isOwnMessage ? "justify-start" : "justify-end"}`}>
                          {Object.entries(message.reactions).map(([emoji, userIds]) => (
                            <button
                              key={emoji}
                              onClick={() => handleToggleReaction(message.messageId, emoji)}
                              className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${
                                userIds.includes(user?.sub || "")
                                  ? "border-blue-400 bg-blue-100 dark:border-blue-500 dark:bg-blue-900/40"
                                  : "border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700"
                              }`}
                              title={userIds.map(getDisplayName).join(", ")}
                            >
                              <span>{emoji}</span>
                              <span className="text-gray-700 dark:text-gray-300">{userIds.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Emoji picker */}
                      {reactionPickerMessageId === message.messageId && (
                        <div className="relative">
                          <div className="absolute z-20" style={isOwnMessage ? { right: 0 } : { left: 0 }}>
                            <EmojiPicker
                              onEmojiClick={(emojiData: EmojiClickData) =>
                                handleToggleReaction(message.messageId, emojiData.emoji)
                              }
                              width={300}
                              height={350}
                            />
                          </div>
                        </div>
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
          {/* Image preview */}
          {pendingImagePreview && (
            <div className="mb-2 flex items-start gap-2">
              <div className="relative">
                <img
                  src={pendingImagePreview}
                  alt="Selected"
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <button
                  onClick={cancelImageSelection}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-800 p-0.5 text-white hover:bg-gray-700"
                  title="Remove image"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {isUploading && (
                <span className="text-sm text-gray-500 dark:text-gray-400">Uploading...</span>
              )}
            </div>
          )}
          <form onSubmit={handleSendMessage} className="flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              className="mb-0.5 flex-shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Attach image"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <textarea
              ref={messageTextareaRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder={pendingImage ? "Add a caption..." : "Type a message..."}
              rows={1}
              className="min-w-0 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 sm:px-4"
              style={{ maxHeight: "96px" }}
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={(!newMessage.trim() && !pendingImage) || isSending}
              className="mb-0.5 flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
            >
              {isSending ? (
                <span className="hidden sm:inline">{isUploading ? "Uploading..." : "Sending..."}</span>
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
        <div className={`flex min-h-0 w-full flex-col border-l border-gray-200 dark:border-gray-700 md:w-96 ${activeThread ? "flex" : "hidden"}`}>
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
                <div className="group">
                  <div className="relative rounded-lg border-2 border-blue-200 bg-white p-3 dark:border-blue-800 dark:bg-gray-800">
                    <div className="mb-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Original Message · {getDisplayName(activeThread.senderId)}
                    </div>
                    {activeThread.attachmentId && <AttachmentImage message={activeThread} />}
                    <div className="whitespace-pre-wrap break-words text-gray-900 dark:text-white">
                      {decryptMessage(activeThread)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(activeThread.timestamp).toLocaleTimeString()}
                    </div>
                    {/* Hover emoji button */}
                    <button
                      onClick={() => setReactionPickerMessageId(
                        reactionPickerMessageId === activeThread.messageId ? null : activeThread.messageId
                      )}
                      className="absolute -bottom-3 right-2 z-10 rounded-full border border-gray-200 bg-white p-1 opacity-0 shadow-sm transition-opacity hover:bg-gray-100 group-hover:opacity-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                      title="React"
                    >
                      <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>
                  {/* Reaction pills - below bubble, overlapping with z-index */}
                  {activeThread.reactions && Object.keys(activeThread.reactions).length > 0 && (
                    <div className="relative z-10 -mt-1 flex flex-wrap gap-1 px-1">
                      {Object.entries(activeThread.reactions).map(([emoji, userIds]) => (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(activeThread.messageId, emoji)}
                          className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${
                            userIds.includes(user?.sub || "")
                              ? "border-blue-400 bg-blue-100 dark:border-blue-500 dark:bg-blue-900/40"
                              : "border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700"
                          }`}
                          title={userIds.map(getDisplayName).join(", ")}
                        >
                          <span>{emoji}</span>
                          <span className="text-gray-700 dark:text-gray-300">{userIds.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Emoji picker */}
                  {reactionPickerMessageId === activeThread.messageId && (
                    <div className="relative">
                      <div className="absolute left-0 z-20">
                        <EmojiPicker
                          onEmojiClick={(emojiData: EmojiClickData) =>
                            handleToggleReaction(activeThread.messageId, emojiData.emoji)
                          }
                          width={280}
                          height={320}
                        />
                      </div>
                    </div>
                  )}
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
                      <div className="group max-w-[85%]">
                        <div
                          className={`relative rounded-lg px-3 py-2 ${
                            isOwnReply
                              ? "bg-blue-600 text-white"
                              : "bg-white text-gray-900 dark:bg-gray-800 dark:text-white"
                          }`}
                        >
                          {reply.attachmentId && <AttachmentImage message={reply} />}
                          {replyText && <div className="whitespace-pre-wrap break-words">{replyText}</div>}
                          <div
                            className={`mt-1 text-xs ${
                              isOwnReply
                                ? "text-blue-100"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {new Date(reply.timestamp).toLocaleTimeString()}
                          </div>
                          {/* Hover emoji button */}
                          <button
                            onClick={() => setReactionPickerMessageId(
                              reactionPickerMessageId === reply.messageId ? null : reply.messageId
                            )}
                            className="absolute -bottom-3 right-2 z-10 rounded-full border border-gray-200 bg-white p-1 opacity-0 shadow-sm transition-opacity hover:bg-gray-100 group-hover:opacity-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                            title="React"
                          >
                            <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                        {/* Reaction pills - below bubble, overlapping with z-index */}
                        {reply.reactions && Object.keys(reply.reactions).length > 0 && (
                          <div className={`relative z-10 -mt-1 flex flex-wrap gap-1 px-1 ${isOwnReply ? "justify-start" : "justify-end"}`}>
                            {Object.entries(reply.reactions).map(([emoji, userIds]) => (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(reply.messageId, emoji)}
                                className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${
                                  userIds.includes(user?.sub || "")
                                    ? "border-blue-400 bg-blue-100 dark:border-blue-500 dark:bg-blue-900/40"
                                    : "border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700"
                                }`}
                                title={userIds.map(getDisplayName).join(", ")}
                              >
                                <span>{emoji}</span>
                                <span className="text-gray-700 dark:text-gray-300">{userIds.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Emoji picker */}
                        {reactionPickerMessageId === reply.messageId && (
                          <div className="relative">
                            <div className="absolute z-20" style={isOwnReply ? { right: 0 } : { left: 0 }}>
                              <EmojiPicker
                                onEmojiClick={(emojiData: EmojiClickData) =>
                                  handleToggleReaction(reply.messageId, emojiData.emoji)
                                }
                                width={280}
                                height={320}
                              />
                            </div>
                          </div>
                        )}
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
            <form onSubmit={handleSendThreadMessage} className="flex items-end gap-2">
              <textarea
                ref={threadTextareaRef}
                value={threadMessage}
                onChange={(e) => {
                  setThreadMessage(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendThreadMessage(e);
                  }
                }}
                placeholder="Reply in thread..."
                rows={1}
                className="min-w-0 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                style={{ maxHeight: "96px" }}
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={!threadMessage.trim() || isSending}
                className="mb-0.5 flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Click-away overlay for emoji picker */}
      {reactionPickerMessageId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setReactionPickerMessageId(null);
            messageTextareaRef.current?.focus();
          }}
        />
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
