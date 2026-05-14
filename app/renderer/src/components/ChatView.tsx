import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CliActivity, FileChangeSet } from "@shared/types";
import { useAppStore } from "../store";
import { ActionIcon } from "./chat/Glyphs";
import { UserBubble, AssistantResponse } from "./chat/MessageBubbles";
import { Composer } from "./chat/Composer";

export function ChatView() {
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const activeChat = useAppStore((state) => state.activeChat);
  const cliStatus = useAppStore((state) => state.cliStatus);
  const activeRunChatId = useAppStore((state) => state.activeRunChatId);
  const environment = useAppStore((state) => state.environment);
  const sendPrompt = useAppStore((state) => state.sendPrompt);
  const revertChangeSet = useAppStore((state) => state.revertChangeSet);
  const openPath = useAppStore((state) => state.openPath);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const createChat = useAppStore((state) => state.createChat);

  const [tick, setTick] = useState(Date.now());
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const [revertTarget, setRevertTarget] = useState<{ changeSetId: string; relativePath?: string } | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const isGlobalBusy = cliStatus === "starting" || cliStatus === "streaming" || cliStatus === "busy";
  const isBusy = isGlobalBusy && (!activeRunChatId || activeRunChatId === activeChat?.session.id);

  useEffect(() => {
    if (!isBusy) {
      return;
    }

    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isBusy]);

  const chatMessages = activeChat?.messages ?? [];
  const chatActivities = activeChat?.activities ?? [];
  const chatChangeSets = activeChat?.changeSets ?? [];

  const groupedActivities = useMemo(() => {
    const map = new Map<string, CliActivity[]>();
    for (const activity of chatActivities) {
      if (!activity.messageId) continue;
      if (!map.has(activity.messageId)) {
        map.set(activity.messageId, []);
      }
      map.get(activity.messageId)!.push(activity);
    }
    return map;
  }, [chatActivities]);

  const changeSetMap = useMemo(() => {
    const map = new Map<string, FileChangeSet>();
    for (const changeSet of chatChangeSets) {
      map.set(changeSet.id, changeSet);
    }
    return map;
  }, [chatChangeSets]);

  const lastUserPrompt = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === "user") return chatMessages[i].content;
    }
    return undefined;
  }, [chatMessages]);

  const lastMessageId = chatMessages[chatMessages.length - 1]?.id;
  const lastMessageContent = chatMessages[chatMessages.length - 1]?.content;

  const updateScrollState = useCallback(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsScrolledToBottom(distanceToBottom < 80);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior });
    setIsScrolledToBottom(true);
  }, []);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }
    container.addEventListener("scroll", updateScrollState, { passive: true });
    updateScrollState();
    return () => container.removeEventListener("scroll", updateScrollState);
  }, [updateScrollState, activeChat?.session.id]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [activeChat?.session.id, scrollToBottom]);

  useEffect(() => {
    if (!isScrolledToBottom) {
      return;
    }
    scrollToBottom("auto");
  }, [lastMessageId, lastMessageContent, isScrolledToBottom, scrollToBottom]);

  if (!activeWorkspace) {
    return (
      <div className="empty-chat-state">
        <div className="empty-state-card">
          <div className="eyebrow">Workspace</div>
          <div className="hero-title">Choose a workspace to start working in GeminiUI.</div>
          <p className="empty-state-copy">The app keeps chats attached to a selected folder, so pick a project first and then start the conversation.</p>
          <button className="cta-button" onClick={() => void addWorkspace()}>
            Add workspace
          </button>
        </div>
      </div>
    );
  }

  if (!activeChat) {
    return (
      <div className="empty-chat-state">
        <div className="empty-state-card">
          <div className="eyebrow">New chat</div>
          <div className="hero-title">What should Gemini help you with in {activeWorkspace.name}?</div>
          <p className="empty-state-copy">Create a chat to keep prompts, logs, and CLI activity together for this workspace.</p>
          <button className="cta-button" onClick={() => void createChat()}>
            Start a new chat
          </button>
        </div>
      </div>
    );
  }

  const { session } = activeChat;
  const totalChars = chatMessages.reduce((sum, message) => sum + message.content.length, 0);
  const estimatedTokens = Math.max(1, Math.round(totalChars / 4));
  const contextLimit = 128000;
  const contextRatio = Math.min(1, estimatedTokens / contextLimit);
  const usageMetrics = {
    requestCount: session.usage.requestCount,
    totalUsedTokens: session.usage.totalTokens,
    estimatedTokens,
    contextLimit,
    contextRatio
  };

  return (
    <div className="chat-view">
      <div ref={messageListRef} className={`message-list ${chatMessages.length === 0 ? "message-list-empty" : ""}`.trim()}>
        {environment?.dependencies.some((dependency) => dependency.id === "ripgrep" && !dependency.installed) ? (
          <div className="warning-banner">Ripgrep is missing. Gemini CLI still works, but workspace search falls back to a slower tool.</div>
        ) : null}

        {chatMessages.length === 0 ? (
          <div className="empty-inline-state">
            <div className="eyebrow">Ready</div>
            <div className="hero-title">What should Gemini help you with in {activeWorkspace.name}?</div>
          </div>
        ) : null}

        {chatMessages.map((message, index) => {
          if (message.role === "user") {
            return <UserBubble key={message.id} message={message} />;
          }

          const isLatest = index === chatMessages.length - 1;
          const activities = groupedActivities.get(message.id) ?? [];

          return (
            <AssistantResponse
              key={message.id}
              message={message}
              activities={activities}
              changeSet={message.changeSetId ? changeSetMap.get(message.changeSetId) : undefined}
              isLatest={isLatest}
              isBusy={isLatest && isBusy}
              tick={tick}
              onRegenerate={sendPrompt}
              lastUserPrompt={lastUserPrompt}
              onOpenPath={(filePath) => void openPath(filePath)}
              onRequestRevert={(changeSetId, relativePath) => setRevertTarget({ changeSetId, relativePath })}
            />
          );
        })}
      </div>

      {!isScrolledToBottom ? (
        <button className="scroll-to-bottom-button" type="button" onClick={() => scrollToBottom()} title="Scroll to bottom" aria-label="Scroll to bottom">
          <ActionIcon name="arrow-down" />
        </button>
      ) : null}

      <Composer activeChat={activeChat} workspacePath={activeWorkspace.path} usageMetrics={usageMetrics} />

      {revertTarget ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRevertTarget(null)}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="revert-change-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="revert-change-title">Revert agent changes?</h3>
            <p className="muted-text">
              This will restore the selected file set to the exact snapshot captured before the agent edited it. The action is blocked if the file was changed afterwards.
            </p>
            <div className="confirm-modal-actions">
              <button className="ghost-button" onClick={() => setRevertTarget(null)}>
                Cancel
              </button>
              <button
                className="nav-button danger-button"
                onClick={() => {
                  const target = revertTarget;
                  setRevertTarget(null);
                  void revertChangeSet(target.changeSetId, target.relativePath).catch((error) => {
                    setRevertError(error instanceof Error ? error.message : String(error));
                  });
                }}
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revertError ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRevertError(null)}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="revert-error-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="revert-error-title">Rollback failed</h3>
            <p className="muted-text">{revertError}</p>
            <div className="confirm-modal-actions">
              <button className="nav-button" onClick={() => setRevertError(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
