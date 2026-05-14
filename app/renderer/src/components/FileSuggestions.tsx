interface FileSuggestionsProps {
  files: string[];
  selectedIndex: number;
  onSelect: (file: string) => void;
  query: string;
}

export function FileSuggestions({ files, selectedIndex, onSelect }: FileSuggestionsProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="command-suggestions file-suggestions">
      <div className="command-suggestions-header">
        <span>Files</span>
        <span className="command-suggestions-hint">Use ↑↓ to navigate, Tab to complete</span>
      </div>
      <div className="command-suggestions-list">
        {files.map((file, index) => {
          const parts = file.split("/");
          const fileName = parts.pop() || "";
          
          return (
            <button
              key={file}
              className={`command-suggestion-item file-suggestion-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => onSelect(file)}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
              title={file}
            >
              <div className="command-suggestion-main">
                <span className="command-suggestion-name">{fileName}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
