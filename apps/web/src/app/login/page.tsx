"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Login gate removed for preview — auto-enter guest session. */
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api("/auth/me");
        if (!cancelled) router.replace("/");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start preview session");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-3xl">Login paused</h1>
      <p className="text-sm text-ink/70">
        Auth is off for this preview. Opening a guest session so you can browse and play without an
        account…
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-sm">
        <Link className="underline" href="/">
          Go home
        </Link>
      </p>
    </div>
  );
}
