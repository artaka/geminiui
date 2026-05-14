import { memo, useState } from "react";
import { FileChangeSet } from "@shared/types";
import { ActionIcon } from "./Glyphs";
import { DiffPreview } from "./DiffPreview";

export function summarizeChangedFiles(changeSet: FileChangeSet): string {
  if (changeSet.fileCount === 1) {
    return "Changed 1 file";
  }
  return `Changed ${changeSet.fileCount} files`;
}

export const ChangeSetPanel = memo(function ChangeSetPanel(props: {
  changeSet: FileChangeSet;
  onOpenPath: (filePath: string) => void;
  onRequestRevert: (changeSetId: string, relativePath?: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleFile = (relativePath: string) => {
    setExpanded((current) => ({ ...current, [relativePath]: !current[relativePath] }));
  };

  return (
    <section className="change-set-card">
      <div className="change-set-header">
        <div className="change-set-summary">
          <span>{summarizeChangedFiles(props.changeSet)}</span>
          <span className="diff-stats additions">+{props.changeSet.totalAdditions}</span>
          <span className="diff-stats deletions">-{props.changeSet.totalDeletions}</span>
        </div>
        <div className="change-set-actions">
          <button
            className="change-set-action"
            onClick={() => props.onRequestRevert(props.changeSet.id)}
            disabled={props.changeSet.status === "reverted"}
            title="Revert all files from this agent run"
          >
            <ActionIcon name="undo" />
            <span>Revert</span>
          </button>
        </div>
      </div>

      <div className="change-set-files">
        {props.changeSet.files.map((file) => {
          const isExpanded = expanded[file.relativePath] ?? false;
          return (
            <div key={file.relativePath} className={`change-file-row ${file.state === "reverted" ? "reverted" : ""}`}>
              <button className="change-file-summary" onClick={() => toggleFile(file.relativePath)} aria-expanded={isExpanded}>
                <span className="change-file-path">{file.relativePath}</span>
                <span className={`change-file-kind ${file.kind}`}>{file.kind}</span>
                <span className="diff-stats additions">+{file.additions}</span>
                <span className="diff-stats deletions">-{file.deletions}</span>
                <span className={`chevron-icon ${isExpanded ? "expanded" : ""}`}>
                  <ActionIcon name="chevron" />
                </span>
              </button>

              {isExpanded ? (
                <div className="change-file-details">
                  <div className="change-file-toolbar">
                    <button className="icon-link-button" onClick={() => props.onOpenPath(file.path)} title="Open file" aria-label="Open file">
                      <ActionIcon name="open" />
                    </button>
                    <button
                      className="icon-link-button"
                      onClick={() => props.onRequestRevert(props.changeSet.id, file.relativePath)}
                      disabled={file.state === "reverted"}
                      title={file.state === "reverted" ? "Already reverted" : "Revert this file"}
                      aria-label="Revert this file"
                    >
                      <ActionIcon name="undo" />
                    </button>
                  </div>
                  <DiffPreview file={file} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
});
