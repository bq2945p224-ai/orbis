"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          username: fd.get("username"),
          password: fd.get("password"),
          firstName: fd.get("firstName"),
          lastName: fd.get("lastName"),
        }),
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-3xl">Register</h1>
      <p className="text-sm text-ink/70">
        Choose a unique username for your account. Your character&apos;s first and last name do not
        need to be unique — many people can share a name.
      </p>
      <form onSubmit={onSubmit} className="space-y-4 border border-ink/10 bg-white/60 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            First name
            <input
              name="firstName"
              required
              minLength={1}
              maxLength={48}
              className="mt-1 w-full border border-ink/20 bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Last name
            <input
              name="lastName"
              required
              minLength={1}
              maxLength={48}
              className="mt-1 w-full border border-ink/20 bg-white px-3 py-2"
            />
          </label>
        </div>
        <label className="block text-sm">
          Username
          <input
            name="username"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_]+"
            className="mt-1 w-full border border-ink/20 bg-white px-3 py-2"
            placeholder="unique_handle"
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full border border-ink/20 bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={10}
            className="mt-1 w-full border border-ink/20 bg-white px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          disabled={pending}
          className="w-full bg-steel px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-ink/70">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Login
        </Link>
      </p>
    </div>
  );
}
