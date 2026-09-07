"use client";

import { useState } from "react";
import { api } from "@/lib/api";

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

type GrantResult = {
  ok: true;
  username: string;
  characterName: string;
  amountCents: number;
  balanceCents: number;
};

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [username, setUsername] = useState("");
  const [amountOrbs, setAmountOrbs] = useState("1000");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GrantResult | null>(null);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl">Admin</h1>
      <p className="text-sm text-ink/70">
        Grant money to a player by unique account username. Requires{" "}
        <code className="text-xs">ADMIN_SECRET</code> from the server environment.
      </p>

      <form
        className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setResult(null);
          try {
            const amount = Number(amountOrbs);
            if (!Number.isFinite(amount) || amount <= 0) {
              throw new Error("Enter a positive amount in ORB");
            }
            const amountCents = Math.round(amount * 100);
            const res = await api<GrantResult>("/admin/grant-money", {
              method: "POST",
              body: JSON.stringify({
                username: username.trim(),
                amountCents,
                note: note.trim() || undefined,
                adminSecret,
              }),
            });
            setResult(res);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Grant failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block space-y-1">
          <span className="text-ink/70">Admin secret</span>
          <input
            type="password"
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-ink/70">Username</span>
          <input
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="unique account username"
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-ink/70">Amount (ORB)</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            value={amountOrbs}
            onChange={(e) => setAmountOrbs(e.target.value)}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-ink/70">Note (optional)</span>
          <input
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="border border-ink/20 px-3 py-1.5 hover:bg-ink/5 disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Granting…" : "Grant money"}
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && (
        <div className="border border-ink/10 bg-white/60 p-4 text-sm space-y-1">
          <p>
            Granted {money(result.amountCents)} to <strong>{result.username}</strong> (
            {result.characterName})
          </p>
          <p className="text-ink/60">New balance: {money(result.balanceCents)}</p>
        </div>
      )}
    </div>
  );
}
