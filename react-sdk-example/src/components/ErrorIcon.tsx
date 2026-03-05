import { useState, type MouseEvent } from "react";

type ErrorIconProps = {
  details?: string;
  position?: "leading" | "trailing";
};

export function ErrorIcon({ details, position = "trailing" }: ErrorIconProps) {
  const [open, setOpen] = useState(false);
  const tooltip = details?.trim() || "Failed to fetch vault";

  const openTooltip = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  const closeTooltip = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`error-icon ${position === "leading" ? "leading" : "trailing"}`}
        title="Show diagnostics"
        aria-label="Show diagnostics"
        onClick={openTooltip}
      >
        ⚠
      </button>
      {open && (
        <div className="error-tooltip-backdrop" onClick={closeTooltip}>
          <div
            className="error-tooltip-dialog"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="error-tooltip-header">
              <strong>Diagnostics</strong>
              <button type="button" className="error-tooltip-close" onClick={closeTooltip}>
                Close
              </button>
            </div>
            <pre className="error-tooltip-body">{tooltip}</pre>
          </div>
        </div>
      )}
    </>
  );
}
