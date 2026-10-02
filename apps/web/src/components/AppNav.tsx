"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Primary play loop — every link here maps to decisions with real sim impact. */
const primaryLinks = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/character", label: "Character" },
  { href: "/skills", label: "Skills" },
  { href: "/jobs", label: "Jobs" },
  { href: "/travel", label: "Travel" },
  { href: "/property", label: "Property" },
  { href: "/companies", label: "Companies" },
  { href: "/market", label: "Market" },
  { href: "/health", label: "Health" },
  { href: "/politics", label: "Politics" },
  { href: "/identity", label: "Identity" },
];

/** Secondary surfaces — real but narrower, or honest read-only. */
const secondaryLinks = [
  { href: "/assets", label: "Assets" },
  { href: "/society", label: "Society" },
  { href: "/world", label: "Bulletin" },
  { href: "/admin", label: "Admin" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Register" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-ink/10 bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="font-display text-2xl tracking-tight text-steel">
            Orbis
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm font-medium text-ink/70">
            {primaryLinks.map((link) => {
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
        <nav className="flex flex-wrap gap-3 text-xs text-ink/50">
          {secondaryLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "text-ink/80" : "hover:text-ink/70"}
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
