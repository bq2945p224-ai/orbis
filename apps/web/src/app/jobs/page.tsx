"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type JobRow = {
  id: string;
  title: string;
  description: string;
  requiredSkillKey: string | null;
  requiredSkillLevel: number;
  salaryCentsPerDay: number;
  employerName: string;
  districtName: string;
  cityName: string;
  eligible: boolean;
  skillOk: boolean;
  locationOk: boolean;
  yourSkillLevel: number;
  isWorldGovernment?: boolean;
};

type Mine = {
  current: {
    id: string;
    title: string;
    salaryCentsPerDay: number;
    employerName: string;
    districtName: string;
    startedAt: string;
  } | null;
  history: Array<{
    id: string;
    title: string;
    employerName: string;
    endedAt: string | null;
    endReason: string | null;
  }>;
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [open, employment] = await Promise.all([
      api<{ jobs: JobRow[] }>("/jobs"),
      api<Mine>("/jobs/mine"),
    ]);
    setJobs(open.jobs);
    setMine(employment);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Jobs</h1>
      <p className="text-sm text-ink/70">
        New players start employed by the World Government (Settler). Working a job grants passive
        XP toward that job&apos;s skill. Employers gate roles by skill level — and player-owned
        companies (e.g. farms) harvest more when their workforce is highly skilled, so high levels
        get hired first. Salaries accrue in game time (1 game day = 4 real hours).
      </p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {mine?.current && (
        <section className="border border-ink/10 bg-white/60 p-5 space-y-2 text-sm">
          <h2 className="font-display text-xl">Current employment</h2>
          <p>
            <strong>{mine.current.title}</strong> at {mine.current.employerName}
          </p>
          <p>
            {mine.current.districtName} · {money(mine.current.salaryCentsPerDay)}/day
          </p>
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api("/jobs/resign", { method: "POST", body: "{}" });
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Resign failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Resign
          </button>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Open postings</h2>
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {job.title} · {job.employerName}
                  {job.isWorldGovernment ? " (default)" : ""}
                </p>
                <p>{money(job.salaryCentsPerDay)}/day</p>
              </div>
              <p className="text-ink/70">{job.description}</p>
              <p className="text-ink/60">
                {job.districtName}, {job.cityName}
                {job.requiredSkillKey
                  ? ` · needs ${job.requiredSkillKey} L${job.requiredSkillLevel} (you: L${job.yourSkillLevel})`
                  : " · no skill requirement"}
              </p>
              {!job.locationOk && (
                <p className="text-xs text-steel">
                  Travel to this district first.{" "}
                  <Link className="underline" href="/travel">
                    Travel
                  </Link>
                </p>
              )}
              <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy || !job.eligible || Boolean(mine?.current)}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/jobs/apply", {
                      method: "POST",
                      body: JSON.stringify({ jobPostingId: job.id }),
                    });
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Apply failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
        {!loading && jobs.length === 0 && (
          <p className="text-sm text-ink/60">No open jobs. Seed the world if this is empty.</p>
        )}
      </section>

      {mine && mine.history.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-xl">History</h2>
          <ul className="text-sm space-y-1">
            {mine.history.map((row) => (
              <li key={row.id}>
                {row.title} at {row.employerName} — {row.endReason ?? "ended"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
