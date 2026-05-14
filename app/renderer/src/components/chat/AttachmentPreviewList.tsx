import { MessageAttachment, PendingAttachment } from "@shared/types";
import { FileGlyph, RemoveGlyph } from "./Glyphs";
import { formatFileSize, getAttachmentPreviewSrc, isImageAttachment } from "./ChatUtils";

export function AttachmentPreviewList(props: {
  attachments: Array<MessageAttachment | PendingAttachment>;
  onRemove?: (attachmentId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`attachment-preview-list ${props.compact ? "compact" : ""}`.trim()}>
      {props.attachments.map((attachment) => {
        const image = isImageAttachment(attachment);
        const previewSrc = getAttachmentPreviewSrc(attachment);
        return (
          <div key={attachment.id} className={`attachment-chip ${image ? "image" : "file"}`}>
            {image && previewSrc ? (
              <img className="attachment-chip-image" src={previewSrc} alt={attachment.name} />
            ) : (
              <div className="attachment-chip-icon">
                <FileGlyph />
              </div>
            )}
            <div className="attachment-chip-meta">
              <div className="attachment-chip-name" title={attachment.name}>{attachment.name}</div>
              <div className="attachment-chip-size">{formatFileSize(attachment.size)}</div>
            </div>
            {props.onRemove ? (
              <button
                type="button"
                className="attachment-chip-remove"
                onClick={() => props.onRemove?.(attachment.id)}
                title="Remove attachment"
                aria-label={`Remove ${attachment.name}`}
              >
                <RemoveGlyph />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
