"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type PeriodPrices = {
  day: number;
  week: number;
  month: number;
  year: number;
};

type Catalog = {
  available: Array<{
    key: string;
    name: string;
    description: string;
    category?: string;
    xpToLevel1: number;
    buffs: {
      self_study: { xpPerHour: number };
      tutoring: { xpPerHour: number } & PeriodPrices;
      university: { xpPerHour: number } & PeriodPrices;
    };
  }>;
  categories?: string[];
};

type SkillsState = {
  study: {
    focusSkillKey: string | null;
    buffMode: string;
    buffPeriod: string | null;
    nextBillingAt: string | null;
    xpPerHour: number;
    rates: { self_study: number; tutoring: number; university: number };
    subscriptionPrices: {
      tutoring: PeriodPrices;
      university: PeriodPrices;
    } | null;
  };
  skills: Array<{
    key: string;
    name: string;
    level: number;
    experience: number;
    xpToNext: number;
    progressPct: number;
    isFocus: boolean;
  }>;
};

type PayMode = "tutoring" | "university";
type Period = "day" | "week" | "month" | "year";

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "day", label: "Per day" },
  { id: "week", label: "Per week" },
  { id: "month", label: "Per month" },
  { id: "year", label: "Per year" },
];

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

function periodLabel(period: string | null) {
  if (!period) return "";
  if (period === "day") return "daily";
  if (period === "week") return "weekly";
  if (period === "month") return "monthly";
  if (period === "year") return "yearly";
  return period;
}

export default function SkillsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [state, setState] = useState<SkillsState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [payPanel, setPayPanel] = useState<PayMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [c, s] = await Promise.all([
      api<Catalog>("/skills/catalog"),
      api<SkillsState>("/skills"),
    ]);
    setCatalog(c);
    setState(s);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function focus(skillKey: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/skills/focus", {
        method: "POST",
        body: JSON.stringify({ skillKey }),
      });
      setSelected(skillKey);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not focus skill");
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(mode: PayMode, period: Period) {
    setBusy(true);
    setError(null);
    try {
      await api("/skills/buff", {
        method: "POST",
        body: JSON.stringify({ mode, period }),
      });
      setPayPanel(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setBusy(false);
    }
  }

  const prices = state?.study.subscriptionPrices;
  const panelPrices = payPanel && prices ? prices[payPanel] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Skills</h1>
      <p className="text-sm text-ink/70">
        Focus one skill to study continuously in game time (1 game day = 4 real hours). Higher
        levels matter: farm companies harvest more with skilled farmers, and employers hire for
        skill gates. Choose tutoring or university, then how you want to pay — first period is
        charged up front and renews until you cancel or run out of money.
      </p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {state?.study && (
        <section className="border border-ink/10 bg-white/60 p-5 text-sm space-y-3">
          <h2 className="font-display text-xl">Studying now</h2>
          <p>
            Focus:{" "}
            <strong>{state.study.focusSkillKey ?? "none — choose a skill below"}</strong>
          </p>
          <p>
            Rate: {state.study.xpPerHour} XP/hour ({state.study.buffMode}
            {state.study.buffPeriod ? `, ${periodLabel(state.study.buffPeriod)}` : ""})
          </p>
          {state.study.nextBillingAt && (
            <p className="text-ink/60">
              Next charge: {new Date(state.study.nextBillingAt).toLocaleString()}
            </p>
          )}
          <p className="text-ink/60 text-xs">
            Base {state.study.rates.self_study}/h · Tutoring {state.study.rates.tutoring}/h ·
            University {state.study.rates.university}/h
          </p>

          {state.study.focusSkillKey && prices && !payPanel && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy}
                onClick={() => setPayPanel("tutoring")}
              >
                Tutoring
              </button>
              <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy}
                onClick={() => setPayPanel("university")}
              >
                University
              </button>
              {state.study.buffMode !== "self_study" && (
                <button
                  className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("/skills/buff/clear", { method: "POST", body: "{}" });
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Cancel failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancel subscription
                </button>
              )}
            </div>
          )}

          {payPanel && panelPrices && (
            <div className="border border-ink/10 bg-white/80 p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg capitalize">
                  How do you want to pay for {payPanel}?
                </h3>
                <button
                  type="button"
                  className="text-xs underline text-ink/60"
                  onClick={() => setPayPanel(null)}
                >
                  Back
                </button>
              </div>
              <p className="text-xs text-ink/60">
                {payPanel === "tutoring" ? "35" : "100"} XP/hour while subscribed. Charged now for
                the first period, then auto-renewed.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PERIODS.map(({ id, label }) => (
                  <button
                    key={id}
                    className="border border-ink/20 px-3 py-2 text-left text-xs hover:bg-ink/5 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => subscribe(payPanel, id)}
                  >
                    <span className="font-medium block">{label}</span>
                    <span className="text-ink/50">{money(panelPrices[id])}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Link href="/character" className="inline-block underline">
            Character
          </Link>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Your skills</h2>
        {state?.skills.length === 0 && (
          <p className="text-sm text-ink/60">None yet — unlock one from Discover.</p>
        )}
        <ul className="space-y-2">
          {state?.skills.map((skill) => (
            <li key={skill.key} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
              <p className="font-medium">
                {skill.name} · L{skill.level}
                {skill.isFocus ? " · studying" : ""}
              </p>
              <p className="text-ink/60">
                {skill.experience} / {skill.xpToNext} XP ({skill.progressPct}%)
              </p>
              {!skill.isFocus && (
                <button
                  className="border border-ink/20 px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => focus(skill.key)}
                >
                  Study this
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Discover</h2>
        <p className="text-sm text-ink/60">
          Focusing a new skill unlocks it and starts background XP at the self-study rate.{" "}
          {catalog?.available.length ?? 0} skills available across{" "}
          {catalog?.categories?.length ?? "many"} categories.
        </p>
        {(catalog?.categories ?? ["general"]).map((category) => {
          const skills = (catalog?.available ?? []).filter(
            (s) => (s.category ?? "general") === category,
          );
          if (skills.length === 0) return null;
          return (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-medium capitalize text-ink/80">{category}</h3>
              <ul className="space-y-2">
                {skills.map((skill) => {
                  const open = selected === skill.key;
                  return (
                    <li key={skill.key} className="border border-ink/10 bg-white/50 p-4 text-sm">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelected(open ? null : skill.key)}
                      >
                        <p className="font-medium">{skill.name}</p>
                        <p className="text-ink/60">{skill.description}</p>
                        <p className="text-xs text-ink/50 mt-1">
                          {skill.xpToLevel1} XP to level 1 — {open ? "hide" : "details"}
                        </p>
                      </button>
                      {open && (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs text-ink/60">
                            Self-study {skill.buffs.self_study.xpPerHour} XP/h free · Tutoring{" "}
                            {skill.buffs.tutoring.xpPerHour} XP/h · University{" "}
                            {skill.buffs.university.xpPerHour} XP/h
                          </p>
                          <button
                            className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => focus(skill.key)}
                          >
                            Unlock &amp; study
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
