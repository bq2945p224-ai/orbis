"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("Verifying…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setMessage("Missing verification token.");
      return;
    }
    api("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        setMessage("Email verified. You can create a character.");
        setTimeout(() => router.push("/character"), 1200);
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "Verification failed");
      });
  }, [params, router]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-3xl">Verify email</h1>
      <p className="text-sm text-ink/80">{message}</p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
