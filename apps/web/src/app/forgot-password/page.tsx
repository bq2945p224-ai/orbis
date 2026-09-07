"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email") }),
      });
      setMessage("If that email exists, a reset link was sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-3xl">Reset password</h1>
      <form onSubmit={onSubmit} className="space-y-4 border border-ink/10 bg-white/60 p-5">
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full border border-ink/20 bg-white px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {message && <p className="text-sm text-steel">{message}</p>}
        <button className="w-full bg-steel px-3 py-2 text-sm font-medium text-white">
          Send reset link
        </button>
      </form>
    </div>
  );
}
