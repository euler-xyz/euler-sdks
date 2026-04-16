import { useMemo, useState, type MouseEvent } from "react";

type RawEntityDialogProps = {
  label?: string;
  title: string;
  entity: unknown;
};

function stringifyEntity(entity: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    entity,
    (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (typeof value !== "object" || value === null) return value;
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      return value;
    },
    2
  );
}

export function RawEntityDialog({
  label = "Raw JSON",
  title,
  entity,
}: RawEntityDialogProps) {
  const [open, setOpen] = useState(false);
  const json = useMemo(() => stringifyEntity(entity), [entity]);

  const openModal = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  const closeModal = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="raw-json-trigger" onClick={openModal}>
        {label}
      </button>
      {open && (
        <div className="error-tooltip-backdrop" onClick={closeModal}>
          <div
            className="error-tooltip-dialog raw-json-dialog"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="error-tooltip-header">
              <strong>{title}</strong>
              <button
                type="button"
                className="error-tooltip-close"
                onClick={closeModal}
              >
                Close
              </button>
            </div>
            <pre className="raw-json-body">{json}</pre>
          </div>
        </div>
      )}
    </>
  );
}
