import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { ActionIcon } from "./chat/Glyphs";

function ChatIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" width="16" height="16">
      <path d="M17 5H3v10h4l3 3 3-3h4V5z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function SearchView() {
  const searchQuery = useAppStore((state) => state.searchQuery);
  const searchResults = useAppStore((state) => state.searchResults);
  const search = useAppStore((state) => state.search);
  const openChat = useAppStore((state) => state.openChat);
  const setScreen = useAppStore((state) => state.setScreen);
  const loading = useAppStore((state) => state.loading);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleResultClick = (chatId: string) => {
    void openChat(chatId);
    setScreen("chat");
  };

  return (
    <div className="search-view">
      <div className="search-container">
        <div className="search-input-wrap">
          <div className="search-input-icon">
            <ActionIcon name="search" />
          </div>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search chats and messages..."
            value={searchQuery}
            onChange={(e) => void search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setScreen("chat");
              }
            }}
          />
          {loading && <div className="search-loading-spinner" />}
        </div>

        <div className="search-results-list">
          {searchResults.length > 0 ? (
            searchResults.map((result, index) => (
              <button
                key={`${result.chat.id}-${index}`}
                className="search-result-item"
                onClick={() => handleResultClick(result.chat.id)}
              >
                <div className="search-result-icon">
                  <ChatIcon />
                </div>
                <div className="search-result-content">
                  <div className="search-result-title">{result.chat.title}</div>
                  {result.message && (
                    <div className="search-result-preview">
                      {result.message.content.slice(0, 150)}
                      {result.message.content.length > 150 ? "..." : ""}
                    </div>
                  )}
                  <div className="search-result-meta">
                    {new Date(result.chat.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))
          ) : searchQuery ? (
            <div className="search-empty-state">
              {!loading && <p>No results found for "{searchQuery}"</p>}
            </div>
          ) : (
            <div className="search-placeholder-state">
              <p>Type to search across all your chats and messages.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
