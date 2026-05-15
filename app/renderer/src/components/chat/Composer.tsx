import { ChangeEvent, ClipboardEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatSession, PendingAttachment } from "@shared/types";
import { useAppStore } from "../../store";
import { CHAT_COMMANDS, ChatCommand } from "../../commands";
import { CustomDropdown, DropdownOption } from "../CustomDropdown";
import { CommandSuggestions } from "../CommandSuggestions";
import { FileSuggestions } from "../FileSuggestions";
import { ActionIcon } from "./Glyphs";
import { AttachmentPreviewList } from "./AttachmentPreviewList";
import { fileToPendingAttachment } from "./ChatUtils";

type AccessPreset = "default-permissions" | "auto-review" | "full-access";

function getAccessPreset(session: ChatSession): AccessPreset {
  if (!session.sandbox && session.approvalMode === "yolo") {
    return "full-access";
  }
  if (session.sandbox && session.approvalMode === "auto_edit") {
    return "auto-review";
  }
  return "default-permissions";
}

function getAccessConfig(preset: AccessPreset): Pick<ChatSession, "approvalMode" | "sandbox"> {
  switch (preset) {
    case "full-access":
      return { approvalMode: "yolo", sandbox: false };
    case "auto-review":
      return { approvalMode: "auto_edit", sandbox: true };
    default:
      return { approvalMode: "default", sandbox: false };
  }
}

const ACCESS_PRESET_OPTIONS: DropdownOption[] = [
  { value: "default-permissions", label: "Default permissions" },
  { value: "auto-review", label: "Auto-review" },
  { value: "full-access", label: "Full access" }
];

interface ComposerProps {
  activeChat: { session: ChatSession };
  workspacePath: string;
  usageMetrics: {
    requestCount: number;
    totalUsedTokens: number;
    estimatedTokens: number;
    contextLimit: number;
    contextRatio: number;
  };
}

export function Composer({ activeChat, workspacePath, usageMetrics }: ComposerProps) {
  const cliStatus = useAppStore((state) => state.cliStatus);
  const activeRunChatId = useAppStore((state) => state.activeRunChatId);
  const settings = useAppStore((state) => state.settings);
  const models = useAppStore((state) => state.models);
  const updateChat = useAppStore((state) => state.updateChat);
  const sendPrompt = useAppStore((state) => state.sendPrompt);
  const stopPrompt = useAppStore((state) => state.stopPrompt);
  const suggestFiles = useAppStore((state) => state.suggestFiles);
  const openChat = useAppStore((state) => state.openChat);

  const [prompt, setPrompt] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [commandQuery, setCommandQuery] = useState<string | null>(null);
  const [commandIndex, setCommandIndex] = useState(0);
  const [fileQuery, setFileQuery] = useState<string | null>(null);
  const [fileIndex, setFileIndex] = useState(0);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});

  const isGlobalBusy = cliStatus === "starting" || cliStatus === "streaming" || cliStatus === "busy";
  const isBusy = isGlobalBusy && (!activeRunChatId || activeRunChatId === activeChat.session.id);
  const isBlockedByOtherChat = isGlobalBusy && Boolean(activeRunChatId && activeRunChatId !== activeChat.session.id);

  useEffect(() => {
    setPrompt("");
    setPendingAttachments([]);
    setIsDragActive(false);
    setCommandQuery(null);
    setFileQuery(null);
    setMentionMap({});
  }, [activeChat.session.id]);

  const filteredCommands = useMemo(() => {
    if (commandQuery === null) return [];
    return CHAT_COMMANDS.filter((cmd) =>
      cmd.command.toLowerCase().startsWith(commandQuery.toLowerCase())
    );
  }, [commandQuery]);

  const handleSelectCommand = useCallback((cmd: ChatCommand) => {
    if (commandQuery === null) return;
    setPrompt((current) => {
      const before = current.slice(0, current.lastIndexOf(commandQuery));
      return before + cmd.command + (cmd.args ? " " : "");
    });
    setCommandQuery(null);
    setCommandIndex(0);
  }, [commandQuery]);

  const handleSelectFile = useCallback((file: string) => {
    if (fileQuery === null) return;
    const parts = file.split("/");
    const fileName = parts.pop() || file;
    const mentionKey = "@" + fileName;
    
    setMentionMap(prev => ({ ...prev, [mentionKey]: file }));
    
    setPrompt((current) => {
      const textarea = textareaRef.current;
      const cursorPos = textarea?.selectionStart || current.length;
      const beforeTrigger = current.slice(0, cursorPos - fileQuery.length);
      const afterTrigger = current.slice(cursorPos);
      return beforeTrigger + mentionKey + " " + afterTrigger;
    });
    setFileQuery(null);
    setFileIndex(0);
    setFileSuggestions([]);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [fileQuery]);

  const handlePromptChange = async (value: string) => {
    setPrompt(value);
    
    const textarea = textareaRef.current;
    const cursorPos = textarea?.selectionStart || value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    
    const cmdMatch = textBeforeCursor.match(/(?:^|\n)\/(\w*)$/);
    if (cmdMatch) {
      setCommandQuery("/" + cmdMatch[1]);
      setCommandIndex(0);
      setFileQuery(null);
      return;
    } else {
      setCommandQuery(null);
    }

    const fileMatch = textBeforeCursor.match(/@(\w*)$/);
    if (fileMatch) {
      const query = fileMatch[1];
      const trigger = fileMatch[0];
      setFileQuery(trigger);
      setFileIndex(0);
      try {
        const suggestions = await suggestFiles(query);
        setFileSuggestions(suggestions);
      } catch (err) {
        console.error("[Composer] Failed to get file suggestions:", err);
      }
    } else {
      setFileQuery(null);
      setFileSuggestions([]);
    }
  };

  const renderHighlightedPrompt = () => {
    if (!prompt) return null;

    const mentionKeys = Object.keys(mentionMap);
    const commandKeys = CHAT_COMMANDS.map((command) => command.command);
    const highlightKeys = [...mentionKeys, ...commandKeys].sort((left, right) => right.length - left.length);
    if (highlightKeys.length === 0) return prompt;

    const escapedKeys = highlightKeys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(${escapedKeys})`, "g");

    const parts = prompt.split(regex);
    return parts.map((part, i) => {
      if (mentionMap[part]) {
        return (
          <span key={i} className="mention-highlight" title={mentionMap[part]}>
            {part}
          </span>
        );
      }
      if (commandKeys.includes(part)) {
        return (
          <span key={i} className="command-highlight">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const handleScroll = () => {
    if (textareaRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (commandQuery !== null && filteredCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCommandIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCommandIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        handleSelectCommand(filteredCommands[commandIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCommandQuery(null);
        return;
      }
    }

    if (fileQuery !== null && fileSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFileIndex((i) => (i + 1) % fileSuggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFileIndex((i) => (i - 1 + fileSuggestions.length) % fileSuggestions.length);
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        handleSelectFile(fileSuggestions[fileIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setFileQuery(null);
        setFileSuggestions([]);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const appendPendingFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const nextAttachments = await Promise.all(
      files
        .filter((file) => file.size > 0)
        .map((file) => fileToPendingAttachment(file))
    );

    setPendingAttachments((current) => {
      const dedupe = new Set(current.map((attachment) => `${attachment.name}:${attachment.size}:${attachment.dataBase64.slice(0, 32)}`));
      const merged = [...current];
      for (const attachment of nextAttachments) {
        const key = `${attachment.name}:${attachment.size}:${attachment.dataBase64.slice(0, 32)}`;
        if (!dedupe.has(key)) {
          dedupe.add(key);
          merged.push(attachment);
        }
      }
      return merged;
    });
  }, []);

  const handleSend = () => {
    const value = prompt.trim();
    if ((!value && pendingAttachments.length === 0) || isGlobalBusy) {
      return;
    }
    void sendPrompt(value, pendingAttachments);
    setPrompt("");
    setPendingAttachments([]);
    setIsDragActive(false);
  };

  const removePendingAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    void appendPendingFiles(files);
    event.target.value = "";
  }, [appendPendingFiles]);

  const handleTextareaPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length > 0) {
      event.preventDefault();
      void appendPendingFiles(files);
    }
  }, [appendPendingFiles]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setIsDragActive(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    void appendPendingFiles(files);
  }, [appendPendingFiles]);

  const currentModel = activeChat.session.model ?? settings?.preferredModel ?? "auto";
  const currentAccessPreset = getAccessPreset(activeChat.session);

  return (
    <div className="composer-wrap">
      {commandQuery !== null ? (
        <CommandSuggestions
          query={commandQuery}
          selectedIndex={commandIndex}
          onSelect={handleSelectCommand}
        />
      ) : null}
      {fileQuery !== null ? (
        <FileSuggestions
          files={fileSuggestions}
          selectedIndex={fileIndex}
          onSelect={handleSelectFile}
          query={fileQuery.startsWith("@") ? fileQuery.slice(1) : fileQuery}
        />
      ) : null}
      <div className={`composer ${isDragActive ? "drag-active" : ""}`.trim()} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <input ref={fileInputRef} className="composer-file-input" type="file" multiple onChange={handleFileInputChange} />
        {pendingAttachments.length > 0 ? <AttachmentPreviewList attachments={pendingAttachments} onRemove={removePendingAttachment} /> : null}
        <div className="composer-textarea-container">
          <div ref={mirrorRef} className="composer-mirror">
            {renderHighlightedPrompt()}
          </div>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => handlePromptChange(event.target.value)}
            onPaste={handleTextareaPaste}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder="Describe the task for Gemini CLI or drop files and images..."
            rows={2}
          />
        </div>
        <div className="composer-footer">
          <div className="composer-left-controls">
            <button className="composer-plus-button" title="Attach file" aria-label="Attach file" onClick={() => fileInputRef.current?.click()}>
              <ActionIcon name="plus" />
            </button>
            <CustomDropdown
              className="composer-mode-dropdown"
              options={ACCESS_PRESET_OPTIONS}
              value={currentAccessPreset}
              onChange={(value) => void updateChat(activeChat.session.id, getAccessConfig(value as AccessPreset))}
              ariaLabel="Agent mode"
              placement="top"
            />
          </div>

          <div className="composer-right-controls">
            <div className="composer-indicators">
              <div
                className="metric-pill metric-pill-quota"
                title={`Usage\nRequests in this chat: ${usageMetrics.requestCount}\nRecorded Gemini CLI token usage: ${usageMetrics.totalUsedTokens.toLocaleString()} tokens`}
              >
                <span className="metric-dot" style={{ ["--metric-fill" as string]: "100%" }} />
                <span>{usageMetrics.requestCount === 0 ? "Usage" : `Usage ${usageMetrics.requestCount}`}</span>
              </div>
              <div
                className="metric-pill metric-pill-context"
                title={`Context window\nEstimated used context: ${usageMetrics.estimatedTokens.toLocaleString()} / ${usageMetrics.contextLimit.toLocaleString()} tokens\nApproximate usage: ${Math.round(usageMetrics.contextRatio * 100)}%`}
              >
                <span className="metric-dot subtle" style={{ ["--metric-fill" as string]: `${usageMetrics.contextRatio * 100}%` }} />
                <span>Context</span>
              </div>
            </div>

            <CustomDropdown
              className="composer-model-dropdown"
              options={models.map((model) => ({ value: model.id, label: model.label }))}
              value={currentModel}
              onChange={(value) => void updateChat(activeChat.session.id, { model: value })}
              ariaLabel="Preferred model"
              placement="top"
            />

            {isBusy ? (
              <button className="send-button stop composer-stop-button" onClick={() => void stopPrompt()}>
                Stop
              </button>
            ) : (
              <button
                className="send-button composer-send-button"
                onClick={handleSend}
                disabled={(!prompt.trim() && pendingAttachments.length === 0) || isBlockedByOtherChat}
                title={
                  isBlockedByOtherChat
                    ? "An agent is already running in another chat."
                    : (!prompt.trim() && pendingAttachments.length === 0)
                      ? undefined
                      : "Send"
                }
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-meta">
        <span>{workspacePath}</span>
        <span>
          Gemini CLI: {cliStatus}
          {activeChat.session.cliSessionId ? ` | session ${activeChat.session.cliSessionId}` : ""}
        </span>
        <button className="link-button" onClick={() => void openChat(activeChat.session.id)}>
          Refresh chat
        </button>
      </div>
    </div>
  );
}
