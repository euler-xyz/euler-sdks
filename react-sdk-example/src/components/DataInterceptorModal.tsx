import { useEffect, useState } from "react";
import {
  stopInterceptingAllQueries,
  stopInterceptingCurrentQuery,
  submitActiveInterception,
  throwActiveInterceptionError,
  useActiveInterception,
} from "../queries/dataInterceptorStore.ts";

export function DataInterceptorModal() {
  const active = useActiveInterception();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(active?.initialText ?? "");
    setError(null);
  }, [active?.id, active?.initialText]);

  if (!active) return null;

  return (
    <div className="interceptor-overlay" role="dialog" aria-modal="true">
      <div className="interceptor-modal">
        <h2>Data Interceptor</h2>
        <div className="interceptor-query">Query: {active.queryName}</div>
        <textarea
          className="interceptor-textarea"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(null);
          }}
        />
        {error ? <div className="interceptor-error">{error}</div> : null}
        <div className="interceptor-actions">
          <button
            className="wallet-button"
            onClick={() => {
              const result = submitActiveInterception(text);
              if (!result.ok) setError(result.error);
            }}
          >
            Send
          </button>
          <button className="wallet-button" onClick={throwActiveInterceptionError}>
            Throw error
          </button>
          <button className="wallet-button" onClick={stopInterceptingCurrentQuery}>
            Stop intercepting this query
          </button>
          <button className="wallet-button" onClick={stopInterceptingAllQueries}>
            Stop intercepting all queries
          </button>
        </div>
      </div>
    </div>
  );
}
