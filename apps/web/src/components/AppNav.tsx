"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/character", label: "Character" },
  { href: "/identity", label: "Identity" },
  { href: "/skills", label: "Skills" },
  { href: "/jobs", label: "Jobs" },
  { href: "/travel", label: "Travel" },
  { href: "/property", label: "Property" },
  { href: "/assets", label: "Assets" },
  { href: "/companies", label: "Companies" },
  { href: "/market", label: "Market" },
  { href: "/politics", label: "Politics" },
  { href: "/health", label: "Health" },
  { href: "/society", label: "Society" },
  { href: "/world", label: "World" },
  { href: "/admin", label: "Admin" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Register" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-ink/10 bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
        <Link href="/" className="font-display text-2xl tracking-tight text-steel">
          Orbis
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm font-medium text-ink/70">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "text-ink" : "hover:text-ink"}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
