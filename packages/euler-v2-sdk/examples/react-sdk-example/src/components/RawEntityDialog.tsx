import { useMemo, useState, type MouseEvent } from "react";

type RawEntityDialogProps = {
  label?: string;
  title: string;
  entity: unknown;
};

function getGetterNames(value: object): string[] {
  const names = new Set<string>();
  let prototype = Object.getPrototypeOf(value);

  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (descriptor?.get) names.add(name);
    }
    prototype = Object.getPrototypeOf(prototype);
  }

  return Array.from(names).sort();
}

function toPrintableEntity(entity: unknown, stack: WeakSet<object>): unknown {
  if (typeof entity === "bigint") return entity.toString();
  if (entity === undefined) return null;
  if (typeof entity !== "object" || entity === null) return entity;
  if (stack.has(entity)) return "[Circular]";

  stack.add(entity);

  if (Array.isArray(entity)) {
    const result = entity.map((item) => toPrintableEntity(item, stack));
    stack.delete(entity);
    return result;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entity)) {
    result[key] = toPrintableEntity(value, stack);
  }

  for (const name of getGetterNames(entity)) {
    if (Object.prototype.hasOwnProperty.call(result, name)) continue;
    try {
      result[name] = toPrintableEntity(
        (entity as Record<string, unknown>)[name],
        stack
      );
    } catch (error) {
      result[name] = `[Getter threw: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  stack.delete(entity);
  return result;
}

function stringifyEntity(entity: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(toPrintableEntity(entity, seen), null, 2);
}

export function RawEntityDialog({
  label = "Raw JSON",
  title,
  entity,
}: RawEntityDialogProps) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  const json = useMemo(() => stringifyEntity(entity), [entity]);

  const openModal = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    setCopyState("idle");
  };

  const closeModal = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  const copyJson = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(json);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
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
              <div className="raw-json-actions">
                <button
                  type="button"
                  className="raw-json-copy"
                  onClick={copyJson}
                >
                  {copyState === "copied"
                    ? "Copied"
                    : copyState === "failed"
                      ? "Failed"
                      : "Copy"}
                </button>
                <button
                  type="button"
                  className="error-tooltip-close"
                  onClick={closeModal}
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="raw-json-body">{json}</pre>
          </div>
        </div>
      )}
    </>
  );
}
