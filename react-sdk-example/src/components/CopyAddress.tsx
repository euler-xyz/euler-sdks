import { useState } from "react";
import { shortenAddress } from "../utils/format.ts";

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className="copy-address">
      {shortenAddress(address)}
      <button
        className="copy-btn"
        onClick={handleCopy}
        title={copied ? "Copied!" : address}
      >
        {copied ? "\u2713" : "\u2398"}
      </button>
    </span>
  );
}
