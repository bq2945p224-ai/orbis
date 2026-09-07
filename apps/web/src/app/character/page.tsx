"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Character = {
  id: string;
  name: string;
  status: string;
  locationDistrictId: string | null;
  balanceCents?: number;
  currency?: string;
  location?: {
    districtName: string;
    cityName: string;
    countryName?: string;
    countryCode?: string;
  } | null;
  employment?: { title: string; employerName: string; salaryCentsPerDay: number } | null;
  travel?: { toDistrictId: string; arrivesAt: string; status: string } | null;
};

type IdentityBrief = {
  passport: { passportNumber: string } | null;
  nationalIds: Array<{ nationality: string; countryCode: string }>;
};

type Wallet = {
  balanceCents: number;
  currency: string;
  recent: Array<{
    id: string;
    amountCents: number;
    reason: string;
    direction: "credit" | "debit";
    createdAt: string;
  }>;
};

type Skills = {
  study: {
    focusSkillKey: string | null;
    buffMode: string;
    xpPerHour: number;
  };
  skills: Array<{
    key: string;
    name: string;
    description: string;
    level: number;
    experience: number;
    xpToNext: number;
    progressPct: number;
    isFocus: boolean;
  }>;
};

type HealthSummary = {
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  thirst: number;
  maxThirst: number;
  energy: number;
  maxEnergy: number;
  supplies: { food: number; water: number };
  environment: { biome: string; note: string };
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function CharacterPage() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [skills, setSkills] = useState<Skills | null>(null);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [identity, setIdentity] = useState<IdentityBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const ch = await api<Character | null>("/character/me");
    setCharacter(ch);
    if (!ch) {
      setWallet(null);
      setSkills(null);
      setHealth(null);
      setIdentity(null);
      return;
    }
    const [w, s, h, id] = await Promise.all([
      api<Wallet>("/economy/wallet"),
      api<Skills>("/skills"),
      api<HealthSummary>("/healthcare/me"),
      api<IdentityBrief>("/identity/me"),
    ]);
    setWallet(w);
    setSkills(s);
    setHealth(h);
    setIdentity(id);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Character</h1>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!loading && character && (
        <>
          <div className="border border-ink/10 bg-white/60 p-5 text-sm space-y-2">
            <p>
              <strong>{character.name}</strong>
            </p>
            <p>Status: {character.status}</p>
            <p>
              Location:{" "}
              {character.location
                ? `${character.location.districtName}, ${character.location.cityName}${
                    character.location.countryName ? ` · ${character.location.countryName}` : ""
                  }`
                : character.locationDistrictId ?? "unknown"}
            </p>
            {identity?.passport && (
              <p>
                Passport: {identity.passport.passportNumber}
                {identity.nationalIds.length > 0
                  ? ` · Nationality: ${identity.nationalIds
                      .map((n) => n.countryCode)
                      .join(", ")}`
                  : " · no national ID yet"}{" "}
                —{" "}
                <Link href="/identity" className="underline">
                  documents
                </Link>
              </p>
            )}
            <p>Balance: {money(wallet?.balanceCents ?? character.balanceCents ?? 0)}</p>
            {health && (
              <div className="pt-2 space-y-1 border-t border-ink/10">
                <p>
                  Stats: HP {health.hp}/{health.maxHp} · Hunger {Math.round(health.hunger)} ·
                  Thirst {Math.round(health.thirst)} · Energy {Math.round(health.energy)}
                </p>
                <p className="text-ink/60">
                  Rations {health.supplies.food} · Water {health.supplies.water} ·{" "}
                  {health.environment.biome}
                </p>
                <Link href="/health" className="inline-block underline">
                  Manage health & supplies
                </Link>
              </div>
            )}
            {character.employment ? (
              <p>
                Job: {character.employment.title} at {character.employment.employerName} (
                {money(character.employment.salaryCentsPerDay)}/day)
              </p>
            ) : (
              <p>
                Job: unemployed — <Link className="underline" href="/jobs">browse jobs</Link>
              </p>
            )}
            {character.travel && (
              <p className="text-steel">
                In transit — arrives {new Date(character.travel.arrivesAt).toLocaleString()}
              </p>
            )}
            <div className="flex gap-4 pt-1">
              <Link href="/map" className="underline">
                Map
              </Link>
              <Link href="/travel" className="underline">
                Travel
              </Link>
              <Link href="/jobs" className="underline">
                Jobs
              </Link>
              <Link href="/skills" className="underline">
                Skills
              </Link>
              <Link href="/identity" className="underline">
                Identity
              </Link>
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl">Skills</h2>
              <Link href="/skills" className="text-sm underline">
                Study / buffs
              </Link>
            </div>
            <p className="text-sm text-ink/60">
              Only unlocked skills appear here. XP accrues in game time while you focus a skill
              (1 game day = 4 real hours); tutoring and university are ongoing subscriptions that
              raise the XP rate.
            </p>
            {skills?.study.focusSkillKey && (
              <p className="text-sm text-steel border border-ink/10 bg-white/50 px-3 py-2">
                Studying {skills.study.focusSkillKey} · {skills.study.xpPerHour} XP/h (
                {skills.study.buffMode})
              </p>
            )}
            {skills && skills.skills.length === 0 && (
              <p className="text-sm text-ink/60">
                No skills unlocked yet.{" "}
                <Link href="/skills" className="underline">
                  Choose something to study
                </Link>
                .
              </p>
            )}
            <ul className="space-y-2">
              {skills?.skills.map((skill) => (
                <li
                  key={skill.key}
                  className="border border-ink/10 bg-white/50 px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    {skill.name} · L{skill.level}
                    {skill.isFocus ? " · focus" : ""}
                  </p>
                  <p className="text-ink/60">{skill.description}</p>
                  <p className="text-ink/50 text-xs mt-1">
                    {skill.experience}/{skill.xpToNext} XP ({skill.progressPct}%)
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {wallet && wallet.recent.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl">Recent ledger</h2>
              <ul className="space-y-1 text-sm">
                {wallet.recent.map((row) => (
                  <li key={row.id} className="flex justify-between border-b border-ink/5 py-1">
                    <span>
                      {row.reason} ({row.direction})
                    </span>
                    <span>
                      {row.direction === "credit" ? "+" : "−"}
                      {money(row.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {!loading && !character && !error && (
        <div className="border border-ink/10 bg-white/60 p-5 text-sm space-y-2">
          <p>No character is linked to this account.</p>
          <p className="text-ink/70">
            Characters are created only when you register.{" "}
            <Link href="/register" className="underline">
              Create a new account
            </Link>{" "}
            with a first and last name.
          </p>
        </div>
      )}
    </div>
  );
}
