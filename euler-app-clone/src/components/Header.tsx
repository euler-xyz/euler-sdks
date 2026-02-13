import { NavLink, Link } from "react-router-dom";
import { useSDK } from "../context/SdkContext.tsx";

const NAV_ITEMS = [
  { to: "/lend", label: "Lend" },
  { to: "/borrow", label: "Borrow" },
  { to: "/earn", label: "Earn" },
  { to: "/portfolio", label: "Portfolio" },
];

export function Header() {
  const { chainId, setChainId, chainNames } = useSDK();

  return (
    <header className="header">
      <Link to="/lend" className="header-logo">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="16" fill="#23C09B" />
          <path
            d="M10 10h12v3H13.5v2.5H20v3h-6.5V21H22v3H10V10z"
            fill="#08131F"
          />
        </svg>
        Euler
      </Link>

      <nav className="header-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <select
        className="chain-selector"
        value={chainId}
        onChange={(e) => setChainId(Number(e.target.value))}
      >
        {Object.entries(chainNames).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </header>
  );
}
