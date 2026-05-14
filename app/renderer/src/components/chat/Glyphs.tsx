import { ReactNode } from "react";

export function FileGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

export function RemoveGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 5l10 10" />
      <path d="M15 5L5 15" />
    </svg>
  );
}

export function ActionIcon(props: { name: "copy" | "retry" | "chevron" | "plus" | "undo" | "open" | "arrow-down" | "new" | "search" | "projects" | "tools" | "automations" | "workspace" | "settings" | "login" | "check" | "minimize" | "maximize" | "close" | "toggle" }) {
  switch (props.name) {
    case "toggle":
    case "chevron":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 5l6 5-6 5" />
        </svg>
      );
    case "new":
    case "plus":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="4.5" />
          <path d="M12 12l4 4" />
        </svg>
      );
    case "projects":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3.5" y="4" width="13" height="12" rx="2" />
          <path d="M3.5 8.5h13" />
        </svg>
      );
    case "tools":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M 16.2 8.205 C 14.947 10.071 12.816 9.789 12.798 9.81 L 5.198 17.41 C 4.428 18.18 3.114 17.828 2.832 16.776 C 2.701 16.288 2.841 15.768 3.198 15.41 L 10.798 7.81 C 10.202 7.195 9.766 5.943 9.786 5.086 C 9.779 4.603 9.993 4.548 10.198 4.11 L 11.998 5.91 L 13.798 4.11 L 11.998 2.31 C 12.398 2.11 12.898 2.01 13.398 2.01 C 15.861 2.009 18.027 5.279 16.796 7.413 C 16.796 7.413 16.805 7.417 16.805 7.417 C 16.724 7.557 16.91 7.283 16.809 7.409" />
        </svg>
      );
    case "automations":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="4" y="4" width="12" height="12" rx="6" />
          <path d="M10 7v3l2 2" />
        </svg>
      );
    case "workspace":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.884 8.375c0-.904 0-1.356.176-1.701.155-.305.403-.552.706-.706.346-.176.798-.176 1.702-.176h2.805c.395 0 .592 0 .778.044.165.04.323.105.467.193.163.1.303.24.581.519l.102.101c.279.28.419.419.582.519.145.089.302.154.467.193.185.046.382.046.778.046h2.805c.904 0 1.356 0 1.701.176.304.154.551.401.706.705.176.346.176.798.176 1.702v4.521c0 .904 0 1.356-.176 1.702a1.62 1.62 0 0 1-.706.705c-.345.176-.797.176-1.701.176H7.468c-.904 0-1.356 0-1.702-.176a1.625 1.625 0 0 1-.706-.705c-.176-.346-.176-.798-.176-1.702V8.375Z"
                transform="matrix(1.14617 0 0 1.14617 -3.953 -3.025)"
            />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <g transform="matrix(.15465 0 0 .12412 -30.225 -23.564)">
                <path
                    d="M261.538 250.025c-12.049-1.441-20.868 13.45-15.874 26.803 4.994 13.354 20.055 15.155 27.111 3.242 2.224-3.758 3.245-8.366 2.87-12.967-.749-9.029-6.648-16.171-14.107-17.078Zm37.872 18.95a55.229 55.229 0 0 1-.377 6.184l11.111 10.551c.999 1.002 1.254 2.732.603 4.091l-10.512 22.017c-.659 1.345-2.022 1.921-3.229 1.365l-11.035-5.379c-1.236-.596-2.636-.4-3.728.521a39.475 39.475 0 0 1-5.293 3.731c-1.175.692-1.989 2.046-2.168 3.611l-1.654 14.25c-.224 1.551-1.324 2.694-2.625 2.728h-21.022c-1.278-.027-2.37-1.124-2.627-2.64l-1.652-14.227c-.188-1.584-1.018-2.948-2.211-3.636a37.381 37.381 0 0 1-5.274-3.739c-1.088-.917-2.484-1.108-3.714-.51l-11.032 5.377c-1.207.556-2.569-.019-3.229-1.363l-10.511-22.016c-.653-1.359-.398-3.09.602-4.092l9.39-8.925c1.045-1.005 1.601-2.581 1.475-4.189a51.96 51.96 0 0 1-.143-3.72c0-1.24.052-2.46.143-3.674.111-1.598-.449-3.158-1.492-4.148l-9.385-8.925c-.983-1.007-1.229-2.722-.583-4.071l10.511-22.016c.659-1.346 3.033-2.836 4.241-2.28l10.023 6.293c1.236.596 2.636.401 3.728-.52a39.475 39.475 0 0 1 5.293-3.731c1.176-.691 1.989-2.045 2.168-3.612l1.654-14.248c.224-1.553 1.324-2.695 2.625-2.729h21.022c1.278.027 2.37 1.123 2.627 2.639l1.652 14.228c.188 1.584 1.019 2.948 2.212 3.635a37.282 37.282 0 0 1 5.273 3.741c1.089.916 2.485 1.108 3.714.508l11.032-5.376c1.207-.556 2.569.019 3.229 1.363l10.511 22.017c.653 1.357.399 3.089-.602 4.091l-9.39 8.925c-1.05 1.001-1.61 2.578-1.487 4.189.081 1.232.136 2.469.136 3.711Z"
                    style={{
                        fill: "none",
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                        strokeWidth: 10,
                    }}
                />
            </g>
        </svg>
      );
    case "login":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M8 5H5.5A1.5 1.5 0 004 6.5v7A1.5 1.5 0 005.5 15H8" />
          <path d="M10 6l4 4-4 4M14 10H7" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <g fill="none" fillRule="evenodd">
                <path
                    fill="currentColor"
                    strokeWidth={0.8}
                    d="M10.723 15.217v-8.42H9.067v8.42l-1.07-1.07-1.17 1.17 3.068 3.07 3.069-3.07-1.17-1.17-1.071 1.07Zm3.12-1.798h-1.465v-1.655h1.568c3.523 0 3.27-5.077.005-4.96-1.161-5.754-9.627-3.35-7.998 2.013-1.217-.967-2.95.129-2.645 1.634.311 1.529 1.996 1.313 3.504 1.313h.6v1.655c-2.238 0-3.36.199-4.594-.806-1.427-1.162-1.524-3.085-.605-4.394.756-1.076 1.94-1.342 1.94-1.342.75-5.808 8.728-6.929 11.059-1.557-.005-.01 0 .012.019.017 4.509 1.37 3.618 8.082-1.387 8.082Z"
                />
            </g>
        </svg>
      );
    case "minimize":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 10h10" />
        </svg>
      );
    case "maximize":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="5" y="5" width="10" height="10" rx="1.5" />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 6l8 8M14 6l-8 8" />
        </svg>
      );
    case "copy":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 9V6.2c0-1.12 0-1.68.218-2.108.192-.377.497-.682.874-.874C10.52 3 11.08 3 12.2 3h5.6c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C21 4.52 21 5.08 21 6.2v5.6c0 1.12 0 1.68-.218 2.108a2.002 2.002 0 0 1-.874.874C19.48 15 18.92 15 17.803 15H15M9 9H6.2c-1.12 0-1.68 0-2.108.218a1.999 1.999 0 0 0-.874.874C3 10.52 3 11.08 3 12.2v5.6c0 1.12 0 1.68.218 2.108a2 2 0 0 0 .874.874c.427.218.987.218 2.105.218h5.607c1.117 0 1.676 0 2.104-.218.376-.192.683-.498.874-.874.218-.428.218-.987.218-2.105V15M9 9h2.8c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874c.218.427.218.987.218 2.105V15"
                transform="translate(1.223 .827) scale(.76317)"
            />
        </svg>
      );
    case "retry":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <g transform="matrix(.9046 0 0 .9046 2.559 1.851)">
                <path
                    strokeWidth={0.6}
                    fill="currentColor"
                    d="M14.003 10.859c-.479 3.309-3.678 5.754-7.258 5.005-2.274-.476-4.122-2.307-4.6-4.571C1.33 7.422 4.007 4 8.022 4v2l5.02-3-5.02-3v2C3.003 2-.84 6.483.16 11.605c.608 3.119 3.136 5.633 6.266 6.239 4.745.918 8.945-2.328 9.565-6.718.085-.596-.398-1.126-1.001-1.126a.997.997 0 0 0-.986.859"
                />
            </g>
        </svg>
      );
    case "undo":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <g transform="matrix(.68255 0 0 .68255 3.123 1.584)">
                <title>{"arrow_right [#368]"}</title>
                <path
                    strokeWidth={0.6}
                    fill="currentColor"
                    fillRule="evenodd"
                    d="M10 18h5.828l-3.242-3.243L14 13.343 19.657 19 14 24.657l-1.414-1.414L15.828 20H10C4.477 20 0 15.523 0 10S4.477 0 10 0h10v2H10a8 8 0 0 0 0 16"
                />
            </g>
        </svg>
      );
    case "open":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M12 4h4v4" />
          <path d="M11 9l5-5" />
          <path d="M8 4H6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-2" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3v13" />
          <path d="M4.5 10.5L10 16l5.5-5.5" />
        </svg>
      );
    default:
      return null;
  }
}
