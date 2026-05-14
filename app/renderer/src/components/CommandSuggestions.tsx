import { CHAT_COMMANDS, ChatCommand } from "../commands";

interface CommandSuggestionsProps {
  query: string;
  onSelect: (command: ChatCommand) => void;
  selectedIndex: number;
}

export function CommandSuggestions({ query, onSelect, selectedIndex }: CommandSuggestionsProps) {
  const filtered = CHAT_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().startsWith(query.toLowerCase())
  );

  if (filtered.length === 0) {
    return null;
  }

  return (
    <div className="command-suggestions">
      <div className="command-suggestions-header">
        <span>Commands</span>
        <span className="command-suggestions-hint">Use ↑↓ to navigate, Tab to complete</span>
      </div>
      <div className="command-suggestions-list">
        {filtered.map((cmd, index) => (
          <button
            key={cmd.command}
            className={`command-suggestion-item ${index === selectedIndex ? "selected" : ""}`}
            onClick={() => onSelect(cmd)}
            type="button"
          >
            <div className="command-suggestion-main">
              <span className="command-suggestion-name">{cmd.command}</span>
              <span className="command-suggestion-syntax">{cmd.syntax}</span>
            </div>
            <div className="command-suggestion-description">{cmd.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
