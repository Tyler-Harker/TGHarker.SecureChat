"use client";

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient, type Message, type Conversation, type Contact, type ContactRequest, type FetchedAttachment, type ConversationMode, RETENTION_LABELS } from "@/lib/api-client";
import { P2PManager, type PeerConnectionState, type P2PMessage, type P2PManagerEvent } from "@/lib/p2p-manager";
import { P2PMessageQueue } from "@/lib/p2p-message-queue";
import { base64ToUint8Array, uint8ArrayToBase64 } from "@/lib/crypto";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import UserAvatar, { getAvatarColor } from "./UserAvatar";
import CameraCapture from "./CameraCapture";
import { groupMessages, formatMessageTimestamp } from "@/lib/message-grouping";

interface MessageInputFormProps {
  onSend: (text: string, image: File | null) => Promise<void>;
  conversationTitle: string;
  isDm: boolean;
}

interface MessageInputFormHandle {
  focus: () => void;
}

const MessageInputForm = forwardRef<MessageInputFormHandle, MessageInputFormProps>(
  function MessageInputForm({ onSend, conversationTitle, isDm }, ref) {
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [pendingImage, setPendingImage] = useState<File | null>(null);
    const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    const cancelImageSelection = () => {
      if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
      setPendingImage(null);
      setPendingImagePreview(null);
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("Only image files are supported.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("Image must be under 10 MB.");
        return;
      }
      setPendingImage(file);
      setPendingImagePreview(URL.createObjectURL(file));
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if ((!newMessage.trim() && !pendingImage) || isSending) return;
      const text = newMessage.trim();
      const image = pendingImage;
      setNewMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      cancelImageSelection();
      setIsSending(true);
      try {
        await onSend(text, image);
      } finally {
        setIsSending(false);
      }
      textareaRef.current?.focus();
    };

    return (
      <>
        <div className="shrink-0 px-4 pb-6 pt-0">
          {pendingImagePreview && (
            <div className="mb-2 flex items-start gap-2 rounded-t-lg bg-dc-chat-input p-3">
              <div className="relative">
                <img
                  src={pendingImagePreview}
                  alt="Selected"
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <button
                  onClick={cancelImageSelection}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-dc-danger p-0.5 text-white hover:brightness-110"
                  title="Remove image"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          <div className={`rounded-lg bg-dc-chat-input px-4 ${pendingImagePreview ? "rounded-t-none" : ""}`}>
            <form onSubmit={handleSubmit} className="flex items-end gap-2 py-2">
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
                className="mb-0.5 flex-shrink-0 rounded-md p-1.5 text-dc-text-muted transition-colors hover:text-dc-text-primary disabled:opacity-30"
                title="Attach image"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={isSending}
                className="mb-0.5 flex-shrink-0 rounded-md p-1.5 text-dc-text-muted transition-colors hover:text-dc-text-primary disabled:opacity-30"
                title="Take photo"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder={pendingImage ? "Add a caption..." : `Message ${isDm ? "@" : "#"}${conversationTitle}`}
                rows={1}
                className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-dc-text-primary placeholder-dc-text-muted focus:outline-none"
                style={{ maxHeight: "96px" }}
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={(!newMessage.trim() && !pendingImage) || isSending}
                className="mb-0.5 flex-shrink-0 rounded-md p-1.5 text-dc-text-muted transition-colors hover:text-dc-text-primary disabled:opacity-30"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        </div>
        {showCamera && (
          <CameraCapture
            onCapture={(file) => {
              setPendingImage(file);
              setPendingImagePreview(URL.createObjectURL(file));
              setShowCamera(false);
            }}
            onClose={() => setShowCamera(false)}
          />
        )}
      </>
    );
  }
);

interface MessageViewProps {
  conversationId: string;
  onBack?: () => void;
  onDelete?: (conversationId: string) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onUnreadActivity?: () => void;
  onRename?: (conversationId: string, name: string | null) => void;
  onMessageSent?: (conversationId: string) => void;
}

export default function MessageView({ conversationId, onBack, onDelete, onConversationCreated, onUnreadActivity, onRename, onMessageSent }: MessageViewProps) {
  const { user, accessToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
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
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [peerStates, setPeerStates] = useState<Map<string, PeerConnectionState>>(new Map());
  const [p2pConnectionError, setP2pConnectionError] = useState<string | null>(null);
  const [userOptedIntoP2P, setUserOptedIntoP2P] = useState(false);
  const [showP2PJoinModal, setShowP2PJoinModal] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const p2pManagerRef = useRef<P2PManager | null>(null);
  const p2pQueueRef = useRef<P2PMessageQueue>(new P2PMessageQueue());
  const messageInputRef = useRef<MessageInputFormHandle>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const threadTextareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentCacheRef = useRef<Map<string, FetchedAttachment>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const markedAsReadRef = useRef<Set<string>>(new Set());
  const activeThreadRef = useRef<Message | null>(null);
  const PAGE_SIZE = 50;

  const isP2PMode = conversation?.mode === "PeerToPeer";

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    isInitialLoadRef.current = true;
    setHasMoreMessages(true);
    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    if (isInitialLoadRef.current && !isLoading) {
      // Use setTimeout to ensure DOM has been painted with new messages
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 0);
      isInitialLoadRef.current = false;
    }
    if (!isLoading && !activeThread) {
      messageInputRef.current?.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    if (activeThread) {
      scrollThreadToBottom();
    }
  }, [threadReplies, activeThread]);

  const handleSseEvent = useCallback((data: Record<string, unknown>) => {
    if (data.type === "message") {
      const newMsg = data.message as Message;

      if (newMsg.parentMessageId && activeThreadRef.current?.messageId === newMsg.parentMessageId) {
        setThreadReplies((prev) => {
          const exists = prev.some((m) => m.messageId === newMsg.messageId);
          if (exists) return prev;
          return [...prev, newMsg];
        });
        // Scroll thread after React commits the new state
        setTimeout(() => scrollThreadToBottom(), 0);
      }

      setMessages((prev) => {
        const exists = prev.some((m) => m.messageId === newMsg.messageId);
        if (exists) {
          return prev;
        }
        return [...prev, newMsg];
      });
      // Scroll main chat after React commits the new state
      setTimeout(() => scrollToBottom(), 0);

      if (newMsg.senderId !== user?.sub && onUnreadActivity) {
        onUnreadActivity();
      }
    } else if (data.type === "new_message_indicator") {
      if (onUnreadActivity) {
        onUnreadActivity();
      }
    } else if (data.type === "conversation_deleted") {
      const deletedId = data.conversationId as string;
      if (onDelete) {
        onDelete(deletedId);
      }
      if (deletedId === conversationId && onBack && !onDelete) {
        onBack();
      }
    } else if (data.type === "conversation_created") {
      const newConversation = data.conversation as Conversation;
      if (onConversationCreated) {
        onConversationCreated(newConversation);
      }
    } else if (data.type === "read_receipt") {
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
      // Scroll down so "Read by" text isn't cut off
      setTimeout(() => scrollToBottom(), 0);
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
      const request = data.request as ContactRequest;
      setContactRequests((prev) => new Map(prev).set(request.fromUserId, request));
    } else if (data.type === "contact_request_accepted") {
      const contact = data.contact as Contact;
      setContacts((prev) => [...prev, contact]);
      setSentContactRequests((prev) => {
        const newSet = new Set(prev);
        newSet.delete(contact.userId);
        return newSet;
      });
    } else if (data.type === "contact_request_declined") {
      const userId = data.userId as string;
      setSentContactRequests((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    } else if (data.type === "conversation_renamed") {
      const convId = data.conversationId as string;
      const newName = (data.name as string) || null;
      if (convId === conversationId) {
        setConversation((prev) => prev ? { ...prev, name: newName } : prev);
      }
    } else if (data.type === "messages_expired") {
      const expiredIds = new Set(data.expiredMessageIds as string[]);
      setMessages((prev) => prev.filter((m) => !expiredIds.has(m.messageId)));
      setThreadReplies((prev) => prev.filter((m) => !expiredIds.has(m.messageId)));
      if (activeThreadRef.current && expiredIds.has(activeThreadRef.current.messageId)) {
        setActiveThread(null);
        activeThreadRef.current = null;
        setThreadReplies([]);
        setThreadMessage("");
      }
    } else if (data.type === "webrtc_signal") {
      if (data.senderId !== user?.sub && p2pManagerRef.current) {
        p2pManagerRef.current.handleSignal(
          data.senderId as string,
          data.signal as string
        );
      }
    } else if (data.type === "conversation_mode_changed") {
      const mode = data.mode as ConversationMode;
      setConversation((prev) => prev ? { ...prev, mode } : prev);

      // If switching to P2P mode and user hasn't opted in yet, show join modal
      if (mode === "PeerToPeer" && !userOptedIntoP2P) {
        setShowP2PJoinModal(true);
      }

      // If switching back to Server mode, reset P2P state
      if (mode === "Server") {
        setUserOptedIntoP2P(false);
        setShowP2PJoinModal(false);
      }
    }
  }, [conversationId, user?.sub, onUnreadActivity, onDelete, onBack, onConversationCreated]);

  const refetchData = useCallback(async () => {
    try {
      // Fetch conversation first to check mode
      const [conversationData, contactsData] = await Promise.all([
        apiClient.getConversation(conversationId),
        apiClient.getMyContacts(),
      ]);

      setConversation(conversationData);
      setContacts(contactsData);

      // Only fetch messages if not in P2P mode
      if (conversationData.mode === "PeerToPeer") {
        setMessages([]);
        setHasMoreMessages(false);
      } else {
        const fetchedMessages = await apiClient.getMessages(conversationId, 0, PAGE_SIZE);
        setMessages(fetchedMessages);
        setHasMoreMessages(fetchedMessages.length >= PAGE_SIZE);
      }

      // Thread replies only available in Server mode
      if (activeThreadRef.current && conversationData.mode !== "PeerToPeer") {
        const replies = await apiClient.getMessageReplies(conversationId, activeThreadRef.current.messageId);
        setThreadReplies(replies);
      }
    } catch (error) {
      console.error("Failed to refetch data after reconnect:", error);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !accessToken) return;

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    const MAX_RETRY_DELAY = 30000;

    const connect = () => {
      if (cancelled) return;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5280";
      const sseUrl = `${apiUrl}/api/conversations/${conversationId}/events`;

      const eventSource = new EventSource(`${sseUrl}?access_token=${accessToken}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        retryDelay = 1000;
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
        eventSource.close();
        eventSourceRef.current = null;

        if (cancelled) return;

        retryTimeout = setTimeout(() => {
          retryTimeout = null;
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
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [conversationId, accessToken, handleSseEvent, refetchData]);

  // P2P Manager lifecycle
  useEffect(() => {
    if (!isP2PMode || !user?.sub || !conversation || !userOptedIntoP2P) {
      // Clean up if we leave P2P mode or user hasn't opted in
      if (p2pManagerRef.current) {
        p2pManagerRef.current.destroy();
        p2pManagerRef.current = null;
      }
      setPeerStates(new Map());
      setP2pConnectionError(null);
      return;
    }

    const otherParticipants = conversation.participantUserIds.filter(
      (id) => id !== user.sub
    );

    const manager = new P2PManager(conversationId, user.sub, otherParticipants);
    p2pManagerRef.current = manager;

    const unsubscribe = manager.on(async (event: P2PManagerEvent) => {
      if (event.type === "connection_state_changed") {
        setPeerStates(manager.getAllPeerStates());

        // Check if any peer failed
        const states = manager.getAllPeerStates();
        const anyFailed = Array.from(states.values()).some((s) => s === "failed");
        setP2pConnectionError(
          anyFailed ? "Direct connection to one or more peers failed." : null
        );

        // Drain queue when peer connects
        if (event.data.state === "connected") {
          const queue = p2pQueueRef.current;
          const pending = await queue.getForRecipient(conversationId, event.peerId);
          for (const qm of pending) {
            manager.sendToPeer(event.peerId, qm.message);
          }
        }
      } else if (event.type === "message_received") {
        if (event.data.messageType === "ack") {
          // Dequeue acked message
          const queue = p2pQueueRef.current;
          await queue.dequeue(
            event.data.originalMessageId as string,
            event.peerId
          );
        } else if (event.data.messageType === "message") {
          // Received a P2P message
          const msg: Message = {
            messageId: event.data.messageId as string,
            conversationId,
            senderId: event.data.senderId as string,
            ciphertext: btoa(event.data.text as string || ""),
            nonce: "",
            authTag: "",
            timestamp: event.data.timestamp as string,
            keyRotationVersion: 1,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.messageId === msg.messageId)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => scrollToBottom(), 0);
        }
      } else if (event.type === "read_receipt") {
        const msgId = event.data.messageId as string;
        const readerId = event.peerId;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.messageId === msgId) {
              const readBy = m.readBy || [];
              if (!readBy.includes(readerId)) {
                return { ...m, readBy: [...readBy, readerId] };
              }
            }
            return m;
          })
        );
      } else if (event.type === "reaction") {
        const msgId = event.data.messageId as string;
        const emoji = event.data.emoji as string;
        const added = event.data.added as boolean;
        const reacterId = event.peerId;

        const updateReaction = (msgs: Message[]) =>
          msgs.map((m) => {
            if (m.messageId !== msgId) return m;
            const reactions = { ...(m.reactions || {}) };
            const users = reactions[emoji] || [];
            if (added && !users.includes(reacterId)) {
              reactions[emoji] = [...users, reacterId];
            } else if (!added) {
              const filtered = users.filter((id) => id !== reacterId);
              if (filtered.length === 0) delete reactions[emoji];
              else reactions[emoji] = filtered;
            }
            return { ...m, reactions };
          });

        setMessages(updateReaction);
        setThreadReplies(updateReaction);
        setActiveThread((prev) => (prev ? updateReaction([prev])[0] : null));
      }
    });

    manager.initialize().catch((err) => {
      console.error("Failed to initialize P2P manager:", err);
      setP2pConnectionError("Failed to initialize peer connections.");
    });

    return () => {
      unsubscribe();
      manager.destroy();
      p2pManagerRef.current = null;
    };
  }, [isP2PMode, conversationId, user?.sub, conversation?.participantUserIds?.join(","), scrollToBottom, userOptedIntoP2P]);

  useEffect(() => {
    if (!user?.sub || messages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute("data-message-id");
            const senderId = entry.target.getAttribute("data-sender-id");

            if (messageId && senderId && senderId !== user.sub && !markedAsReadRef.current.has(messageId)) {
              markedAsReadRef.current.add(messageId);

              if (isP2PMode && userOptedIntoP2P && p2pManagerRef.current) {
                // Send read receipt over DataChannel
                p2pManagerRef.current.sendMessage({
                  type: "read_receipt",
                  id: crypto.randomUUID(),
                  senderId: user.sub,
                  conversationId,
                  timestamp: new Date().toISOString(),
                  payload: { messageId },
                });
              } else {
                apiClient.markMessageAsRead(conversationId, messageId).catch((err) => {
                  console.error("Failed to mark message as read:", err);
                  markedAsReadRef.current.delete(messageId);
                });
              }

              observer.unobserve(entry.target);
            }
          }
        });
      },
      {
        threshold: 0.5,
      }
    );

    messageElementsRef.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [messages, conversationId, user?.sub, isP2PMode, userOptedIntoP2P]);

  // Auto-focus input when typing anywhere in the chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if any modal is open
      if (showDeleteConfirm || showP2PJoinModal || showParticipantsList || isRenaming) {
        return;
      }

      // Don't interfere if already typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      // Don't interfere with browser shortcuts (Ctrl/Cmd/Alt + key)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Don't interfere with special keys
      const specialKeys = [
        "Escape",
        "Tab",
        "Enter",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
      ];
      if (specialKeys.includes(e.key)) {
        return;
      }

      // If it's a printable character, focus the input
      if (e.key.length === 1) {
        messageInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showDeleteConfirm, showP2PJoinModal, showParticipantsList, isRenaming]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const [conversationData, contactsData] = await Promise.all([
        apiClient.getConversation(conversationId),
        apiClient.getMyContacts(),
      ]);
      setConversation(conversationData);
      setContacts(contactsData);

      if (conversationData.mode === "PeerToPeer") {
        // P2P mode: no server-stored messages to fetch
        setMessages([]);
        setHasMoreMessages(false);
      } else {
        const fetchedMessages = await apiClient.getMessages(conversationId, 0, PAGE_SIZE);
        setMessages(fetchedMessages);
        setHasMoreMessages(fetchedMessages.length >= PAGE_SIZE);
      }
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

  const getConversationTitle = (): string => {
    if (!conversation) return "Conversation";
    if (conversation.name) return conversation.name;
    const otherParticipants = conversation.participantUserIds.filter(
      (id) => id !== user?.sub
    );
    if (otherParticipants.length === 0) return "You";
    if (otherParticipants.length === 1) return getDisplayName(otherParticipants[0]);
    const names = otherParticipants.slice(0, 2).map(getDisplayName);
    const remaining = otherParticipants.length - 2;
    if (remaining > 0) return `${names.join(", ")} +${remaining}`;
    return names.join(", ");
  };

  const isDm = conversation && conversation.participantUserIds.length <= 2;

  const scrollThreadToBottom = useCallback(() => {
    const el = threadEndRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

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
    requestAnimationFrame(() => messageInputRef.current?.focus());
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

  const renamePendingRef = useRef(false);

  const handleStartRename = () => {
    setRenameValue(conversation?.name || "");
    setIsRenaming(true);
    renamePendingRef.current = false;
    requestAnimationFrame(() => renameInputRef.current?.focus());
  };

  const handleRenameSubmit = async () => {
    if (renamePendingRef.current) return;
    renamePendingRef.current = true;
    const newName = renameValue.trim() || null;
    setIsRenaming(false);

    if (conversation) {
      setConversation({ ...conversation, name: newName });
    }
    if (onRename) {
      onRename(conversationId, newName);
    }

    try {
      await apiClient.renameConversation(conversationId, newName);
    } catch (error) {
      console.error("Failed to rename conversation:", error);
    }
  };

  const handleRenameCancel = () => {
    renamePendingRef.current = true;
    setIsRenaming(false);
  };

  const handleSendMessage = useCallback(async (text: string, image: File | null) => {
    if (isP2PMode && userOptedIntoP2P && p2pManagerRef.current) {
      // P2P mode: send via DataChannel
      const messageId = crypto.randomUUID();
      const p2pMsg: P2PMessage = {
        type: "message",
        id: messageId,
        senderId: user!.sub,
        conversationId,
        timestamp: new Date().toISOString(),
        payload: { text: text || "" },
      };

      p2pManagerRef.current.sendMessage(p2pMsg);

      // Add to local messages immediately (optimistic)
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(text || "");
      const ciphertext = uint8ArrayToBase64(messageBytes);

      const localMsg: Message = {
        messageId,
        conversationId,
        senderId: user!.sub,
        ciphertext,
        nonce: "",
        authTag: "",
        timestamp: p2pMsg.timestamp,
        keyRotationVersion: 1,
      };
      setMessages((prev) => [...prev, localMsg]);
      setTimeout(() => scrollToBottom(), 0);

      // Queue for offline peers
      const queue = p2pQueueRef.current;
      const otherParticipants = conversation!.participantUserIds.filter(
        (id) => id !== user!.sub
      );
      for (const peerId of otherParticipants) {
        if (p2pManagerRef.current.getPeerState(peerId) !== "connected") {
          await queue.enqueue(conversationId, peerId, p2pMsg);
        }
      }

      onMessageSent?.(conversationId);

      // Auto-focus the input after sending
      setTimeout(() => messageInputRef.current?.focus(), 0);
    } else {
      // Server mode: existing logic
      let attachmentId: string | undefined;

      if (image) {
        const attachment = await apiClient.uploadAttachment(conversationId, image);
        attachmentId = attachment.attachmentId;
      }

      const messageText = text || (attachmentId ? "" : "");
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

      setMessages((prev) => [...prev, sentMessage]);
      setTimeout(() => scrollToBottom(), 0);
      onMessageSent?.(conversationId);

      // Auto-focus the input after sending
      setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  }, [conversationId, scrollToBottom, onMessageSent, isP2PMode, userOptedIntoP2P, user?.sub, conversation?.participantUserIds]);

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
      setTimeout(() => scrollThreadToBottom(), 0);
      onMessageSent?.(conversationId);
    } catch (error) {
      console.error("Failed to send thread reply:", error);
      alert("Failed to send thread reply");
    } finally {
      setIsSending(false);
    }
  };

  const decryptMessage = (message: Message): string => {
    try {
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
    messageInputRef.current?.focus();

    if (isP2PMode && userOptedIntoP2P && p2pManagerRef.current) {
      // Determine if adding or removing
      const msg = messages.find((m) => m.messageId === messageId);
      const currentUsers = msg?.reactions?.[emoji] || [];
      const added = !currentUsers.includes(userId!);

      p2pManagerRef.current.sendMessage({
        type: "reaction",
        id: crypto.randomUUID(),
        senderId: userId!,
        conversationId,
        timestamp: new Date().toISOString(),
        payload: { messageId, emoji, added },
      });
    } else {
      try {
        await apiClient.toggleReaction(conversationId, messageId, emoji);
      } catch (error) {
        console.error("Failed to toggle reaction:", error);
      }
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

  // Shared reaction pills renderer
  const renderReactions = (msg: Message) => {
    if (!msg.reactions || Object.keys(msg.reactions).length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {Object.entries(msg.reactions).map(([emoji, userIds]) => (
          <button
            key={emoji}
            onClick={() => handleToggleReaction(msg.messageId, emoji)}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors ${
              userIds.includes(user?.sub || "")
                ? "border-dc-reaction-border bg-dc-reaction-active text-dc-text-primary"
                : "border-dc-divider bg-dc-reaction-bg text-dc-text-secondary hover:border-dc-text-muted"
            }`}
            title={userIds.map(getDisplayName).join(", ")}
          >
            <span>{emoji}</span>
            <span>{userIds.length}</span>
          </button>
        ))}
      </div>
    );
  };

  // Shared hover action toolbar
  const renderHoverToolbar = (msg: Message, showThread: boolean = true) => (
    <div className="absolute -top-3 right-4 z-10 hidden items-center gap-0.5 rounded border border-dc-divider bg-dc-sidebar px-0.5 py-0.5 shadow-lg group-hover:flex">
      <button
        onClick={() => setReactionPickerMessageId(
          reactionPickerMessageId === msg.messageId ? null : msg.messageId
        )}
        className="rounded p-1 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-text-primary"
        title="Add Reaction"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {showThread && (
        <button
          onClick={() => openThread(msg)}
          className="rounded p-1 text-dc-text-muted transition-colors hover:bg-dc-hover-sidebar hover:text-dc-text-primary"
          title="Reply in Thread"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </button>
      )}
    </div>
  );

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
        <div className="my-1 flex h-32 w-48 items-center justify-center rounded-lg bg-dc-hover-sidebar">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-dc-brand border-r-transparent"></div>
        </div>
      );
    }

    if (!attachment) return null;

    return (
      <>
        <img
          src={attachment.url}
          alt={attachment.fileName}
          className="my-1 max-h-72 max-w-md cursor-pointer rounded-lg object-contain"
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
      <div className="flex flex-1 items-center justify-center bg-dc-chat-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-dc-brand border-r-transparent"></div>
      </div>
    );
  }

  // Prepare grouped messages
  const topLevelMessages = messages.filter((m) => !m.parentMessageId);
  const grouped = groupMessages(topLevelMessages);

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Main Chat Area */}
      <div className={`flex min-h-0 flex-1 flex-col ${activeThread ? "hidden md:flex" : "flex"}`}>
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-dc-header-border bg-dc-header px-4 py-3 shadow-sm">
          {/* Back button - mobile only */}
          {onBack && (
            <button
              onClick={onBack}
              className="rounded p-1 text-dc-text-secondary transition-colors hover:bg-dc-hover-sidebar hover:text-white md:hidden"
              title="Back to conversations"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") handleRenameCancel();
                }}
                onBlur={handleRenameSubmit}
                maxLength={100}
                placeholder="Conversation name (leave empty to clear)"
                className="w-full rounded bg-dc-chat-input border border-dc-input-border px-2 py-0.5 text-base font-semibold text-white outline-none focus:ring-1 focus:ring-dc-brand"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-dc-text-muted text-lg">{isDm ? "@" : "#"}</span>
                <h2 className="truncate text-base font-semibold text-white">
                  {getConversationTitle()}
                </h2>
                <button
                  onClick={handleStartRename}
                  className="flex-shrink-0 rounded p-1 text-dc-text-muted transition-colors hover:text-dc-text-secondary"
                  title="Rename conversation"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
            <p className="text-xs text-dc-text-muted">
              {topLevelMessages.length} messages
              {conversation && conversation.participantUserIds.length > 2 && (
                <span className="ml-1">
                  &middot; {conversation.participantUserIds.length} participants
                </span>
              )}
              {conversation?.retentionPolicy && (
                <span className="ml-1">
                  &middot; {RETENTION_LABELS[conversation.retentionPolicy]} retention
                </span>
              )}
            </p>
          </div>
          {/* P2P Mode Toggle */}
          <button
            onClick={async () => {
              const newMode: ConversationMode = isP2PMode ? "Server" : "PeerToPeer";
              if (newMode === "PeerToPeer" && conversation && conversation.participantUserIds.length > 8) {
                alert("P2P mode supports up to 8 participants.");
                return;
              }
              try {
                await apiClient.setConversationMode(conversationId, newMode);
                setConversation((prev) => prev ? { ...prev, mode: newMode } : prev);

                // If switching to P2P, automatically opt in the initiator
                if (newMode === "PeerToPeer") {
                  setUserOptedIntoP2P(true);
                } else {
                  // If switching back to Server mode, reset P2P state
                  setUserOptedIntoP2P(false);
                }
              } catch (err) {
                console.error("Failed to set mode:", err);
              }
            }}
            className={`rounded p-1.5 transition-colors ${isP2PMode ? "text-dc-brand hover:text-dc-brand-hover" : "text-dc-text-muted hover:text-dc-text-primary"}`}
            title={isP2PMode ? "Switch to server mode" : "Switch to P2P mode"}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>
          {/* P2P Presence Indicators */}
          {isP2PMode && conversation && (
            <div className="flex items-center gap-1">
              {conversation.participantUserIds
                .filter((id) => id !== user?.sub)
                .map((id) => {
                  const state = peerStates.get(id) || "disconnected";
                  const color =
                    state === "connected"
                      ? "bg-green-500"
                      : state === "connecting"
                        ? "bg-yellow-500"
                        : state === "failed"
                          ? "bg-red-500"
                          : "bg-gray-500";
                  return (
                    <span
                      key={id}
                      className={`h-2.5 w-2.5 rounded-full ${color}`}
                      title={`${getDisplayName(id)}: ${state}`}
                    />
                  );
                })}
            </div>
          )}
          {/* P2P Participants List Button */}
          {isP2PMode && (
            <button
              onClick={() => setShowParticipantsList(true)}
              className="rounded p-1.5 text-dc-text-muted transition-colors hover:text-dc-text-primary"
              title="View participants"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded p-1.5 text-dc-text-muted transition-colors hover:text-dc-danger"
            title="Delete conversation"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* P2P Connection Error Banner */}
        {isP2PMode && p2pConnectionError && (
          <div className="shrink-0 border-b border-dc-divider bg-dc-banner-warning-bg p-3">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 flex-shrink-0 text-dc-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="flex-1 text-sm text-dc-text-primary">{p2pConnectionError}</p>
              <button
                onClick={async () => {
                  try {
                    await apiClient.setConversationMode(conversationId, "Server");
                    setConversation((prev) => prev ? { ...prev, mode: "Server" } : prev);
                  } catch (err) {
                    console.error("Failed to switch mode:", err);
                  }
                }}
                className="rounded bg-dc-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-dc-brand-hover"
              >
                Switch to Server Mode
              </button>
            </div>
          </div>
        )}

        {/* P2P Mode Indicator */}
        {isP2PMode && !p2pConnectionError && (
          <div className="shrink-0 border-b border-dc-divider bg-dc-brand/10 px-4 py-1.5">
            {userOptedIntoP2P ? (
              <p className="text-xs text-dc-brand">
                ✓ P2P mode active — messages are exchanged directly between peers
              </p>
            ) : (
              <p className="text-xs text-yellow-600">
                ⚠ Conversation is in P2P mode, but you're using server mode.
                <button
                  onClick={() => setShowP2PJoinModal(true)}
                  className="ml-1 underline hover:text-yellow-700"
                >
                  Join P2P mode
                </button>
              </p>
            )}
          </div>
        )}

        {/* Contact Request Banners */}
        {(() => {
          const unknownParticipants = getUnknownParticipants();
          const incomingRequests = Array.from(contactRequests.values());

          return (
            <>
              {unknownParticipants.length > 0 && (
                <div className="shrink-0 border-b border-dc-divider bg-dc-banner-warning-bg p-3">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-dc-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-dc-text-primary">
                        Chatting with unknown user{unknownParticipants.length > 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-dc-text-secondary">
                        Request contact info to see their profile
                      </p>
                    </div>
                    <button
                      onClick={() => unknownParticipants.forEach(handleSendContactRequest)}
                      className="rounded bg-dc-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-dc-brand-hover"
                    >
                      Request Contact Info
                    </button>
                  </div>
                </div>
              )}

              {incomingRequests.map((request) => (
                <div key={request.requestId} className="shrink-0 border-b border-dc-divider bg-dc-banner-info-bg p-3">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-dc-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-dc-text-primary">
                        {request.fromUserDisplayName} wants to share contact info
                      </p>
                      <p className="text-xs text-dc-text-secondary">
                        {request.fromUserEmail}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptContactRequest(request)}
                        className="rounded bg-dc-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-dc-brand-hover"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineContactRequest(request)}
                        className="rounded border border-dc-text-muted px-3 py-1.5 text-sm font-medium text-dc-text-secondary transition-colors hover:border-dc-text-primary hover:text-white"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {Array.from(sentContactRequests).map((userId) => (
                <div key={userId} className="shrink-0 border-b border-dc-divider bg-dc-hover-message p-3">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-dc-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="flex-1 text-sm text-dc-text-secondary">
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
          className="flex-1 overflow-y-auto bg-dc-chat-bg"
        >
          {grouped.length === 0 ? (
            <div className="flex h-full items-center justify-center text-dc-text-muted">
              No messages yet. Start the conversation!
            </div>
          ) : (
            <div className="pb-6">
              {isLoadingMore && (
                <div className="flex justify-center py-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-dc-brand border-r-transparent"></div>
                </div>
              )}
              {grouped.map((message) => {
                const isOwnMessage = message.senderId === user?.sub;
                const decryptedText = decryptMessage(message);
                const readCount = message.readBy?.length || 0;
                const replyCount = messages.filter((m) => m.parentMessageId === message.messageId).length;

                if (message.isGroupStart) {
                  return (
                    <div
                      key={message.messageId}
                      ref={(el) => {
                        if (el) messageElementsRef.current.set(message.messageId, el);
                        else messageElementsRef.current.delete(message.messageId);
                      }}
                      data-message-id={message.messageId}
                      data-sender-id={message.senderId}
                      className="group relative mt-4 flex items-start gap-4 px-4 py-0.5 hover:bg-dc-hover-message"
                    >
                      <UserAvatar
                        userId={message.senderId}
                        displayName={getDisplayName(message.senderId)}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span
                            className="text-sm font-medium"
                            style={{ color: getAvatarColor(message.senderId) }}
                          >
                            {getDisplayName(message.senderId)}
                          </span>
                          <span className="text-[11px] text-dc-text-muted">
                            {formatMessageTimestamp(message.timestamp)}
                          </span>
                        </div>
                        {message.attachmentId && <AttachmentImage message={message} />}
                        {decryptedText && (
                          <div className="mt-0.5 whitespace-pre-wrap break-words text-dc-text-primary">
                            {decryptedText}
                          </div>
                        )}
                        {isOwnMessage && readCount > 0 && (
                          <span className="mt-0.5 inline-block text-xs text-dc-text-muted">
                            Read by {readCount}
                          </span>
                        )}
                        {replyCount > 0 && (
                          <button
                            onClick={() => openThread(message)}
                            className="mt-1 flex items-center gap-1 text-xs font-medium text-dc-brand hover:underline"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                            {replyCount} {replyCount === 1 ? "reply" : "replies"}
                          </button>
                        )}
                        {renderReactions(message)}
                      </div>
                      {renderHoverToolbar(message)}
                      {reactionPickerMessageId === message.messageId && (
                        <div className="absolute left-16 top-8 z-20">
                          <EmojiPicker
                            onEmojiClick={(emojiData: EmojiClickData) =>
                              handleToggleReaction(message.messageId, emojiData.emoji)
                            }
                            width={300}
                            height={350}
                            theme={Theme.DARK}
                          />
                        </div>
                      )}
                    </div>
                  );
                }

                // Continuation message (compact, no avatar)
                return (
                  <div
                    key={message.messageId}
                    ref={(el) => {
                      if (el) messageElementsRef.current.set(message.messageId, el);
                      else messageElementsRef.current.delete(message.messageId);
                    }}
                    data-message-id={message.messageId}
                    data-sender-id={message.senderId}
                    className="group relative flex items-start gap-4 px-4 py-0.5 hover:bg-dc-hover-message"
                  >
                    <div className="w-10 flex-shrink-0 pt-0.5 text-center">
                      <span className="hidden whitespace-nowrap text-[11px] leading-none text-dc-text-muted group-hover:inline">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {message.attachmentId && <AttachmentImage message={message} />}
                      {decryptedText && (
                        <div className="whitespace-pre-wrap break-words text-dc-text-primary">
                          {decryptedText}
                        </div>
                      )}
                      {isOwnMessage && readCount > 0 && (
                        <span className="mt-0.5 inline-block text-xs text-dc-text-muted">
                          Read by {readCount}
                        </span>
                      )}
                      {replyCount > 0 && (
                        <button
                          onClick={() => openThread(message)}
                          className="mt-1 flex items-center gap-1 text-xs font-medium text-dc-brand hover:underline"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          {replyCount} {replyCount === 1 ? "reply" : "replies"}
                        </button>
                      )}
                      {renderReactions(message)}
                    </div>
                    {renderHoverToolbar(message)}
                    {reactionPickerMessageId === message.messageId && (
                      <div className="absolute left-16 top-8 z-20">
                        <EmojiPicker
                          onEmojiClick={(emojiData: EmojiClickData) =>
                            handleToggleReaction(message.messageId, emojiData.emoji)
                          }
                          width={300}
                          height={350}
                          theme={Theme.DARK}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <MessageInputForm
          ref={messageInputRef}
          onSend={handleSendMessage}
          conversationTitle={getConversationTitle()}
          isDm={!!isDm}
        />
      </div>

      {/* Thread Panel */}
      {activeThread && (
        <div className={`flex min-h-0 w-full flex-col border-l border-dc-header-border md:w-96 ${activeThread ? "flex" : "hidden"}`}>
          {/* Thread Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-dc-header-border bg-dc-header px-4 py-3">
            <h3 className="font-semibold text-white">Thread</h3>
            <button
              onClick={closeThread}
              className="rounded p-1 text-dc-text-muted transition-colors hover:text-white"
              title="Close thread"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Thread Messages */}
          <div className="flex-1 overflow-y-auto bg-dc-chat-bg p-3">
            {isLoadingThread ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-solid border-dc-brand border-r-transparent"></div>
              </div>
            ) : (
              <div>
                {/* Original Message */}
                <div className="group relative mb-4">
                  <div className="rounded-r border-l-2 border-dc-brand bg-dc-hover-message px-3 py-2">
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-dc-brand">Original Message</span>
                      <span className="text-xs text-dc-text-muted">&middot;</span>
                      <span
                        className="text-xs font-medium"
                        style={{ color: getAvatarColor(activeThread.senderId) }}
                      >
                        {getDisplayName(activeThread.senderId)}
                      </span>
                    </div>
                    {activeThread.attachmentId && <AttachmentImage message={activeThread} />}
                    <div className="whitespace-pre-wrap break-words text-dc-text-primary">
                      {decryptMessage(activeThread)}
                    </div>
                    <div className="mt-1 text-xs text-dc-text-muted">
                      {formatMessageTimestamp(activeThread.timestamp)}
                    </div>
                  </div>
                  {renderReactions(activeThread)}
                  {renderHoverToolbar(activeThread, false)}
                  {reactionPickerMessageId === activeThread.messageId && (
                    <div className="absolute left-0 top-full z-20">
                      <EmojiPicker
                        onEmojiClick={(emojiData: EmojiClickData) =>
                          handleToggleReaction(activeThread.messageId, emojiData.emoji)
                        }
                        width={280}
                        height={320}
                        theme={Theme.DARK}
                      />
                    </div>
                  )}
                </div>

                {/* Thread Replies */}
                {(() => {
                  const groupedReplies = groupMessages(threadReplies);
                  return groupedReplies.map((reply) => {
                    const replyText = decryptMessage(reply);

                    if (reply.isGroupStart) {
                      return (
                        <div
                          key={reply.messageId}
                          className="group relative mt-4 flex items-start gap-3 px-1 py-0.5 hover:bg-dc-hover-message rounded"
                        >
                          <UserAvatar
                            userId={reply.senderId}
                            displayName={getDisplayName(reply.senderId)}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span
                                className="text-xs font-medium"
                                style={{ color: getAvatarColor(reply.senderId) }}
                              >
                                {getDisplayName(reply.senderId)}
                              </span>
                              <span className="text-[11px] text-dc-text-muted">
                                {formatMessageTimestamp(reply.timestamp)}
                              </span>
                            </div>
                            {reply.attachmentId && <AttachmentImage message={reply} />}
                            {replyText && (
                              <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-dc-text-primary">
                                {replyText}
                              </div>
                            )}
                            {renderReactions(reply)}
                          </div>
                          {renderHoverToolbar(reply, false)}
                          {reactionPickerMessageId === reply.messageId && (
                            <div className="absolute left-8 top-full z-20">
                              <EmojiPicker
                                onEmojiClick={(emojiData: EmojiClickData) =>
                                  handleToggleReaction(reply.messageId, emojiData.emoji)
                                }
                                width={280}
                                height={320}
                                theme={Theme.DARK}
                              />
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={reply.messageId}
                        className="group relative flex items-start gap-3 px-1 py-0.5 hover:bg-dc-hover-message rounded"
                      >
                        <div className="w-6 flex-shrink-0 pt-0.5 text-center">
                          <span className="hidden text-[10px] text-dc-text-muted group-hover:inline">
                            {new Date(reply.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          {reply.attachmentId && <AttachmentImage message={reply} />}
                          {replyText && (
                            <div className="whitespace-pre-wrap break-words text-sm text-dc-text-primary">
                              {replyText}
                            </div>
                          )}
                          {renderReactions(reply)}
                        </div>
                        {renderHoverToolbar(reply, false)}
                        {reactionPickerMessageId === reply.messageId && (
                          <div className="absolute left-8 top-full z-20">
                            <EmojiPicker
                              onEmojiClick={(emojiData: EmojiClickData) =>
                                handleToggleReaction(reply.messageId, emojiData.emoji)
                              }
                              width={280}
                              height={320}
                              theme={Theme.DARK}
                            />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          {/* Thread Input */}
          <div className="shrink-0 px-3 pb-4 pt-0">
            <div className="rounded-lg bg-dc-chat-input px-3">
              <form onSubmit={handleSendThreadMessage} className="flex items-end gap-2 py-2">
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
                  className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-dc-text-primary placeholder-dc-text-muted focus:outline-none"
                  style={{ maxHeight: "96px" }}
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={!threadMessage.trim() || isSending}
                  className="mb-0.5 flex-shrink-0 rounded-md p-1.5 text-dc-text-muted transition-colors hover:text-dc-text-primary disabled:opacity-30"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Click-away overlay for emoji picker */}
      {reactionPickerMessageId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setReactionPickerMessageId(null);
            messageInputRef.current?.focus();
          }}
        />
      )}

      {/* P2P Join Modal */}
      {showP2PJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-dc-modal-bg p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Join Peer-to-Peer Mode?
            </h3>
            <p className="mb-4 text-dc-text-secondary">
              This conversation has been switched to P2P mode. Messages will be exchanged directly between peers via WebRTC.
            </p>
            <ul className="mb-6 space-y-2 text-sm text-dc-text-secondary">
              <li>✓ End-to-end encrypted direct connections</li>
              <li>✓ No server storage of messages</li>
              <li>⚠ Both peers must be online to exchange messages</li>
              <li>⚠ P2P history is not persisted on the server</li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowP2PJoinModal(false);
                }}
                className="flex-1 rounded bg-dc-modal-input px-4 py-2.5 font-medium text-dc-text-primary transition-colors hover:bg-dc-modal-input-hover"
              >
                Stay in Server Mode
              </button>
              <button
                onClick={() => {
                  setUserOptedIntoP2P(true);
                  setShowP2PJoinModal(false);
                }}
                className="flex-1 rounded bg-dc-brand px-4 py-2.5 font-medium text-white transition-colors hover:bg-dc-brand-hover"
              >
                Join P2P Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Participants List Modal */}
      {showParticipantsList && isP2PMode && conversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-dc-modal-bg p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-white">
              P2P Participants
            </h3>
            <div className="mb-6 space-y-3">
              {conversation.participantUserIds.map((id) => {
                const isMe = id === user?.sub;
                const state = isMe ? "connected" : (peerStates.get(id) || "disconnected");
                const displayName = getDisplayName(id);

                let statusText = "";
                let statusColor = "";
                let statusIcon = "";

                if (isMe) {
                  statusText = userOptedIntoP2P ? "You (Active in P2P)" : "You (Server Mode)";
                  statusColor = userOptedIntoP2P ? "text-green-500" : "text-gray-400";
                  statusIcon = "●";
                } else if (!userOptedIntoP2P) {
                  statusText = "Unknown (You're in Server Mode)";
                  statusColor = "text-gray-400";
                  statusIcon = "○";
                } else {
                  switch (state) {
                    case "connected":
                      statusText = "Active in P2P";
                      statusColor = "text-green-500";
                      statusIcon = "●";
                      break;
                    case "connecting":
                      statusText = "Connecting...";
                      statusColor = "text-yellow-500";
                      statusIcon = "◐";
                      break;
                    case "failed":
                      statusText = "Connection Failed";
                      statusColor = "text-red-500";
                      statusIcon = "✕";
                      break;
                    default:
                      statusText = "Disconnected";
                      statusColor = "text-gray-400";
                      statusIcon = "○";
                  }
                }

                return (
                  <div key={id} className="flex items-center justify-between rounded-lg bg-dc-modal-input p-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar userId={id} displayName={displayName} size="sm" />
                      <div>
                        <p className="font-medium text-dc-text-primary">{displayName}</p>
                        <p className={`text-sm ${statusColor}`}>
                          <span className="mr-1">{statusIcon}</span>
                          {statusText}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {userOptedIntoP2P && (
              <button
                onClick={async () => {
                  setUserOptedIntoP2P(false);
                  setShowParticipantsList(false);
                }}
                className="mb-3 w-full rounded bg-dc-modal-input px-4 py-2.5 font-medium text-dc-text-primary transition-colors hover:bg-dc-modal-input-hover"
              >
                Leave P2P Mode
              </button>
            )}
            {!userOptedIntoP2P && (
              <button
                onClick={() => {
                  setUserOptedIntoP2P(true);
                  setShowParticipantsList(false);
                }}
                className="mb-3 w-full rounded bg-dc-brand px-4 py-2.5 font-medium text-white transition-colors hover:bg-dc-brand-hover"
              >
                Join P2P Mode
              </button>
            )}
            <button
              onClick={() => setShowParticipantsList(false)}
              className="w-full rounded bg-dc-modal-input px-4 py-2.5 font-medium text-dc-text-primary transition-colors hover:bg-dc-modal-input-hover"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-dc-modal-bg p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Delete Conversation?
            </h3>
            <p className="mb-6 text-dc-text-secondary">
              This will permanently delete this conversation and all its messages for all participants. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 rounded px-4 py-2 font-medium text-dc-text-primary transition-colors bg-dc-hover-sidebar hover:bg-dc-selected-sidebar disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConversation}
                disabled={isDeleting}
                className="flex-1 rounded bg-dc-danger px-4 py-2 font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
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
