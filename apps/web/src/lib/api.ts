/** Same-origin via Next rewrite → Orbis API (keeps session cookies simple). */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const obj = data as { message?: string | string[]; error?: string } | null;
    const message =
      (typeof obj?.message === "string" && obj.message) ||
      (Array.isArray(obj?.message) ? obj.message.join(", ") : null) ||
      obj?.error ||
      res.statusText;
    throw new Error(typeof message === "string" ? message : "Request failed");
  }
  return data as T;
}
