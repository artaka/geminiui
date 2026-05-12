import { useEffect, useMemo, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  placement?: "top" | "bottom";
}

function DropdownChevron(props: { expanded: boolean }) {
  return (
    <span className={`custom-dropdown-chevron ${props.expanded ? "expanded" : ""}`}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M7 5l6 5-6 5" />
      </svg>
    </span>
  );
}

export function CustomDropdown(props: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selected = useMemo(() => props.options.find((option) => option.value === props.value) ?? props.options[0], [props.options, props.value]);

  return (
    <div ref={rootRef} className={`custom-dropdown ${props.className ?? ""}`.trim()}>
      <button type="button" className="custom-dropdown-button" onClick={() => setOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="custom-dropdown-label">{selected?.label ?? ""}</span>
        <DropdownChevron expanded={open} />
      </button>
      {open ? (
        <div className={`custom-dropdown-menu ${props.placement === "top" ? "top" : "bottom"}`} role="listbox" aria-label={props.ariaLabel}>
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={props.value === option.value}
              className={`custom-dropdown-option ${props.value === option.value ? "selected" : ""}`}
              onClick={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
