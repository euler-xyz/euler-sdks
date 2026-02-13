import { useState } from "react";
import { useTokenMap } from "../queries/useTokenQueries.ts";

interface TokenIconProps {
  address?: string;
  symbol?: string;
  size?: number;
}

export function TokenIcon({ address, symbol = "?", size = 24 }: TokenIconProps) {
  const tokenMap = useTokenMap();
  const [imgError, setImgError] = useState(false);

  const token = address ? tokenMap.get(address.toLowerCase()) : undefined;
  const logoURI = token?.logoURI;

  if (logoURI && !imgError) {
    return (
      <span className="token-icon" style={{ width: size, height: size }}>
        <img
          src={logoURI}
          alt={symbol}
          onError={() => setImgError(true)}
        />
      </span>
    );
  }

  return (
    <span
      className="token-icon-fallback"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {symbol.charAt(0).toUpperCase()}
    </span>
  );
}
