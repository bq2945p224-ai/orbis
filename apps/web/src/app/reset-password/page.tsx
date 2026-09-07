"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

function ResetInner() {
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const token = params.get("token");
    if (!token) {
      setError("Missing token");
      return;
    }
    try {
      await api("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password: fd.get("password") }),
      });
      setMessage("Password updated. You can log in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-3xl">Choose new password</h1>
      <form onSubmit={onSubmit} className="space-y-4 border border-ink/10 bg-white/60 p-5">
        <label className="block text-sm">
          New password
          <input
            name="password"
            type="password"
            required
            minLength={10}
            className="mt-1 w-full border border-ink/20 bg-white px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {message && <p className="text-sm text-steel">{message}</p>}
        <button className="w-full bg-steel px-3 py-2 text-sm font-medium text-white">
          Update password
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
