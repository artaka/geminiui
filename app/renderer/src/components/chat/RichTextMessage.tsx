import { memo, ReactNode } from "react";
import hljs from "highlight.js";
import { ActionIcon } from "./Glyphs";

export function renderInlineRichText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(!?\[([^\]]+)\]\(([^)]+)\)|<((?:https?:\/\/|mailto:)[^>]+)>|`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]?.startsWith("![") && match[2] && match[3]) {
      const src = match[3];
      nodes.push(<img key={`${keyPrefix}-img-${match.index}`} className="inline-image" src={src} alt={match[2]} />);
    } else if (match[2] && match[3]) {
      const href = match[3];
      nodes.push(
        <a key={`${keyPrefix}-link-${match.index}`} className="inline-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {renderInlineRichText(match[2], `${keyPrefix}-linktext-${match.index}`)}
        </a>
      );
    } else if (match[4]) {
      const href = match[4];
      nodes.push(
        <a key={`${keyPrefix}-autolink-${match.index}`} className="inline-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {href}
        </a>
      );
    } else if (match[5]) {
      nodes.push(
        <code key={`${keyPrefix}-code-${match.index}`} className="inline-code">
          {match[5]}
        </code>
      );
    } else if (match[6] || match[7]) {
      const content = match[6] ?? match[7] ?? "";
      nodes.push(
        <strong key={`${keyPrefix}-strongem-${match.index}`}>
          <em>{renderInlineRichText(content, `${keyPrefix}-strongem-${match.index}`)}</em>
        </strong>
      );
    } else if (match[8] || match[9]) {
      const content = match[8] ?? match[9] ?? "";
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{renderInlineRichText(content, `${keyPrefix}-strong-${match.index}`)}</strong>);
    } else if (match[10]) {
      nodes.push(<del key={`${keyPrefix}-del-${match.index}`}>{renderInlineRichText(match[10], `${keyPrefix}-del-${match.index}`)}</del>);
    } else if (match[11] || match[12]) {
      const content = match[11] ?? match[12] ?? "";
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{renderInlineRichText(content, `${keyPrefix}-em-${match.index}`)}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function InlineRichText(props: { text: string }) {
  return <>{renderInlineRichText(props.text, "inline")}</>;
}

export const RichTextMessage = memo(function RichTextMessage(props: { text: string }) {
  const normalized = props.text.replace(/\r\n/g, "\n");
  const segments = normalized.split(/```/g);
  const blocks: ReactNode[] = [];

  const pushTextBlock = (textBlock: string, keyPrefix: string) => {
    const lines = textBlock.split("\n");
    const localBlocks: ReactNode[] = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index].trimEnd();
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        index += 1;
        continue;
      }

      if (trimmedLine.startsWith("#")) {
        const level = Math.min(3, trimmedLine.match(/^#+/)?.[0].length ?? 1);
        const content = trimmedLine.replace(/^#+\s*/, "");
        const Tag = `h${level}` as "h1" | "h2" | "h3";
        localBlocks.push(
          <Tag key={`${keyPrefix}-heading-${index}`} className="rich-heading">
            <InlineRichText text={content} />
          </Tag>
        );
        index += 1;
        continue;
      }

      if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmedLine)) {
        localBlocks.push(<hr key={`${keyPrefix}-hr-${index}`} className="rich-divider" />);
        index += 1;
        continue;
      }

      if (/^[-*]\s+/.test(trimmedLine)) {
        const items: Array<{ text: string; checked?: boolean }> = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
          const itemText = lines[index].trim().replace(/^[-*]\s+/, "");
          const taskMatch = itemText.match(/^\[( |x|X)\]\s+(.*)$/);
          items.push(taskMatch ? { text: taskMatch[2], checked: taskMatch[1].toLowerCase() === "x" } : { text: itemText });
          index += 1;
        }
        localBlocks.push(
          <ul key={`${keyPrefix}-list-${index}`} className="rich-list">
            {items.map((item, itemIndex) => (
              <li key={`${keyPrefix}-li-${itemIndex}`}>
                {typeof item.checked === "boolean" ? <input className="task-checkbox" type="checkbox" checked={item.checked} readOnly /> : null}
                <InlineRichText text={item.text} />
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (/^\d+\.\s+/.test(trimmedLine)) {
        const items: string[] = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
          index += 1;
        }
        localBlocks.push(
          <ol key={`${keyPrefix}-olist-${index}`} className="rich-list rich-list-ordered">
            {items.map((item, itemIndex) => (
              <li key={`${keyPrefix}-oli-${itemIndex}`}>
                <InlineRichText text={item} />
              </li>
            ))}
          </ol>
        );
        continue;
      }

      if (trimmedLine.startsWith(">")) {
        const quotes: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith(">")) {
          quotes.push(lines[index].trim().replace(/^>\s?/, ""));
          index += 1;
        }
        localBlocks.push(
          <blockquote key={`${keyPrefix}-quote-${index}`} className="rich-quote">
            <InlineRichText text={quotes.join(" ")} />
          </blockquote>
        );
        continue;
      }

      if (trimmedLine.startsWith("|")) {
        const tableLines: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith("|")) {
          tableLines.push(lines[index].trim());
          index += 1;
        }

        if (tableLines.length >= 2) {
          const headerRows = tableLines[0]
            .split("|")
            .filter((_, i, arr) => i > 0 && i < arr.length - 1)
            .map((s) => s.trim());
          const separatorRow = tableLines[1];
          const isTable = /^[|\s-:]+$/.test(separatorRow);

          if (isTable) {
            const bodyRows = tableLines.slice(2).map((row) =>
              row
                .split("|")
                .filter((_, i, arr) => i > 0 && i < arr.length - 1)
                .map((s) => s.trim())
            );

            localBlocks.push(
              <div key={`${keyPrefix}-table-wrap-${index}`} className="rich-table-wrap">
                <table className="rich-table">
                  <thead>
                    <tr>
                      {headerRows.map((cell, i) => (
                        <th key={i}>
                          <InlineRichText text={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bodyRows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>
                            <InlineRichText text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            continue;
          } else {
            index -= tableLines.length;
          }
        } else {
           index -= tableLines.length;
        }
      }

      const paragraph: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trimEnd();
        const trimmed = current.trim();
        if (!trimmed || trimmed.startsWith("#") || /^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed) || trimmed.startsWith(">")) {
          break;
        }
        paragraph.push(trimmed);
        index += 1;
      }
      localBlocks.push(
        <p key={`${keyPrefix}-paragraph-${index}`} className="rich-paragraph">
          <InlineRichText text={paragraph.join(" ")} />
        </p>
      );
    }

    blocks.push(...localBlocks);
  };

  segments.forEach((segment, segmentIndex) => {
    if (segmentIndex % 2 === 1) {
      const [language, ...bodyLines] = segment.split("\n");
      const body = bodyLines.length > 0 ? bodyLines.join("\n") : language;
      const codeLanguage = bodyLines.length > 0 ? language.trim() : "";
      const normalizedLanguage = codeLanguage.toLowerCase();

      let highlightedCode = "";
      try {
        if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
          highlightedCode = hljs.highlight(body.trim(), { language: normalizedLanguage, ignoreIllegals: true }).value;
        } else {
          highlightedCode = body.trim()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }
      } catch (e) {
        highlightedCode = body.trim();
      }

      blocks.push(
        <div key={`code-${segmentIndex}`} className="rich-code-block">
          <div className="rich-code-header">
            <div className="rich-code-label">{codeLanguage || "code"}</div>
            <button className="rich-code-copy" type="button" onClick={() => void navigator.clipboard.writeText(body.trim())} title="Copy code" aria-label="Copy code">
              <ActionIcon name="copy" />
            </button>
          </div>
          <pre>
            <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
          </pre>
        </div>
      );
    } else {
      pushTextBlock(segment, `segment-${segmentIndex}`);
    }
  });

  return <div className="rich-text">{blocks}</div>;
});
