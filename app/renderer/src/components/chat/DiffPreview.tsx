import { memo, useMemo } from "react";
import { FileChangeEntry } from "@shared/types";
import { buildRenderableDiffLines, inferCodeLanguageFromPath } from "./ChatUtils";

export const DiffPreview = memo(function DiffPreview(props: { file: FileChangeEntry }) {
  const language = useMemo(() => inferCodeLanguageFromPath(props.file.path), [props.file.path]);
  const lines = useMemo(() => buildRenderableDiffLines(props.file.diffPreview || "(No preview available)", language), [props.file.diffPreview, language]);

  return (
    <pre className="change-file-diff">
      <code className="hljs diff-code">
        {lines.map((line) =>
          line.type === "gap" ? (
            <div key={line.key} className="diff-gap">
              <span className="diff-line-number">...</span>
              <span className="diff-line-number">...</span>
              <span className="diff-gap-text">Skipped {line.hiddenCount} unchanged lines</span>
            </div>
          ) : (
            <div key={line.key} className={`diff-line ${line.tone}`}>
              <span className="diff-line-number">{line.oldLine ?? ""}</span>
              <span className="diff-line-number">{line.newLine ?? ""}</span>
              <span className={`diff-prefix ${line.tone}`}>{line.prefix}</span>
              <span className="diff-line-code" dangerouslySetInnerHTML={{ __html: line.html || "&nbsp;" }} />
            </div>
          )
        )}
      </code>
    </pre>
  );
});
