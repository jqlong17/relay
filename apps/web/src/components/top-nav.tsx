import Link from "next/link";

type TopNavProps = {
  active: "workspace" | "sessions" | "memories" | "readme";
};

const items: Array<{ key: TopNavProps["active"]; href: string; label: string }> = [
  { key: "workspace", href: "/", label: "workspace" },
  { key: "sessions", href: "/sessions", label: "sessions" },
  { key: "memories", href: "/memories", label: "memories" },
  { key: "readme", href: "/readme", label: "readme" },
];

export function TopNav({ active }: TopNavProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">relay</span>
        <span className="brand-state">local workspace</span>
      </div>
      <nav className="topnav" aria-label="Primary">
        {items.map((item) => (
          <Link
            className={`topnav-link ${active === item.key ? "topnav-link-active" : ""}`}
            href={item.href}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
