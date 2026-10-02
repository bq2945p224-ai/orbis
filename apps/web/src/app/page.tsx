"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Me = {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
};

type Character = {
  id: string;
  name: string;
  status: string;
  locationDistrictId: string | null;
  balanceCents?: number;
  location?: { districtName: string; cityName: string } | null;
  employment?: { title: string; employerName: string } | null;
  travel?: { arrivesAt: string } | null;
} | null;

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

const consequential = [
  { href: "/jobs", label: "Jobs", blurb: "Choose work; payroll and skill XP follow." },
  { href: "/skills", label: "Skills", blurb: "Study gates jobs and multiplies company output." },
  { href: "/travel", label: "Travel", blurb: "Move; location unlocks jobs, land, and citizenship." },
  { href: "/property", label: "Property", blurb: "Buy land; tax and resource yield are real." },
  { href: "/companies", label: "Companies", blurb: "Hire, produce, pay wages, withdraw goods." },
  { href: "/market", label: "Market", blurb: "Trade inventory; loans accrue and collect." },
  { href: "/health", label: "Health", blurb: "Eat, drink, treat — hunger and disease can kill." },
  { href: "/politics", label: "Politics", blurb: "Citizens vote; office-holders set tax law." },
  { href: "/identity", label: "Identity", blurb: "National ID unlocks franchise in that country." },
  { href: "/map", label: "Map", blurb: "Claim cells and see the world you act in." },
];

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [character, setCharacter] = useState<Character>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const account = await api<Me>("/auth/me");
        if (cancelled) return;
        setMe(account);
        const ch = await api<Character>("/character/me");
        if (!cancelled) setCharacter(ch);
      } catch {
        if (!cancelled) setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-steel/70">Player-controlled world</p>
        <h1 className="font-display text-5xl text-ink md:text-6xl">Orbis</h1>
        <p className="max-w-2xl text-lg text-ink/75">
          You control one person. Every decision on the primary play surfaces changes money,
          location, skills, ownership, health, or law — not flavor menus. One game day lasts four
          real hours.
        </p>
        <p className="max-w-2xl text-sm text-ink/55">
          Bulletin and some asset categories are honest read-only or thin; they are labeled that
          way. Treaties, military, and wars are not player-driven yet.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="border border-ink/10 bg-white/50 p-5">
          <h2 className="font-display text-xl">Account</h2>
          {me ? (
            <div className="mt-3 space-y-1 text-sm">
              <p>
                Signed in as <strong>{me.username}</strong>
              </p>
              <p className="text-ink/60">{me.email}</p>
              <button
                className="mt-3 border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5"
                onClick={async () => {
                  await api("/auth/logout", { method: "POST", body: "{}" });
                  setMe(null);
                  setCharacter(null);
                }}
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-ink/70">Not signed in.</p>
              <div className="flex gap-3">
                <Link className="underline" href="/login">
                  Login
                </Link>
                <Link className="underline" href="/register">
                  Register
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="border border-ink/10 bg-white/50 p-5">
          <h2 className="font-display text-xl">Your person</h2>
          {!me && <p className="mt-3 text-sm text-ink/70">Sign in to see your character.</p>}
          {me && !character && (
            <p className="mt-3 text-sm text-ink/70">
              No living character on this account. Characters are created at{" "}
              <Link className="underline" href="/register">
                signup
              </Link>
              .
            </p>
          )}
          {character && (
            <div className="mt-3 space-y-1 text-sm">
              <p>
                <strong>{character.name}</strong> ({character.status})
              </p>
              <p className="text-ink/60">
                {character.location
                  ? `${character.location.districtName}, ${character.location.cityName}`
                  : "Location unknown"}
              </p>
              <p>Balance: {money(character.balanceCents ?? 0)}</p>
              {character.employment && (
                <p className="text-ink/70">
                  {character.employment.title} @ {character.employment.employerName}
                </p>
              )}
              {!character.employment && (
                <p className="text-ink/70">
                  Unemployed — pick a job on{" "}
                  <Link className="underline" href="/jobs">
                    Jobs
                  </Link>
                  .
                </p>
              )}
              {character.travel && <p className="text-steel">Traveling…</p>}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Where your choices bite</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {consequential.map((item) => (
            <li key={item.href} className="border border-ink/10 bg-white/40 px-4 py-3 text-sm">
              <Link className="font-medium underline" href={item.href}>
                {item.label}
              </Link>
              <p className="mt-1 text-ink/65">{item.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
