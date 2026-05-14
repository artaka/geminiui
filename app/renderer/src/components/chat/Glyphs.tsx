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

export function ActionIcon(props: { name: "copy" | "retry" | "chevron" | "plus" | "undo" | "open" | "arrow-down" }) {
  switch (props.name) {
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
    case "chevron":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 5l6 5-6 5" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
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
