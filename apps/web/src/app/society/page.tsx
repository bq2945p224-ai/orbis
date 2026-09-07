"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Profile = {
  characterId: string;
  name: string;
  bio: string;
};

type Notification = {
  id: string;
  type: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type Org = {
  id: string;
  name: string;
  orgType: string;
  description: string;
  districtName: string | null;
};

export default function SocietyPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bio, setBio] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [dmTo, setDmTo] = useState("");
  const [dmBody, setDmBody] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("association");
  const [joinOrgId, setJoinOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [prof, notif, orgList] = await Promise.all([
      api<Profile>("/social/profile"),
      api<{ notifications: Notification[] }>("/social/notifications"),
      api<{ organizations: Org[] }>("/organizations"),
    ]);
    setProfile(prof);
    setBio(prof.bio);
    setNotifications(notif.notifications);
    setOrgs(orgList.organizations);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Society</h1>
      <p className="text-sm text-ink/70">Profile, messages, notifications, and organizations.</p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {profile && (
        <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
          <h2 className="font-display text-xl">Profile</h2>
          <p>
            <strong>{profile.name}</strong>
          </p>
          <textarea
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            rows={3}
            placeholder="Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api("/social/profile", {
                  method: "PATCH",
                  body: JSON.stringify({ bio }),
                });
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Update failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save bio
          </button>
        </section>
      )}

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Direct message</h2>
        <input
          className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
          placeholder="Recipient character ID"
          value={dmTo}
          onChange={(e) => setDmTo(e.target.value)}
        />
        <textarea
          className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
          rows={2}
          placeholder="Message"
          value={dmBody}
          onChange={(e) => setDmBody(e.target.value)}
        />
        <button
          className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
          disabled={busy || !dmTo.trim() || !dmBody.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/social/dm", {
                method: "POST",
                body: JSON.stringify({ toCharacterId: dmTo.trim(), body: dmBody.trim() }),
              });
              setDmBody("");
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Send failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Send
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">Notifications</h2>
          {notifications.some((n) => !n.readAt) && (
            <button
              className="text-xs underline text-ink/70 hover:text-ink disabled:opacity-50"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api("/social/notifications/read", {
                    method: "POST",
                    body: "{}",
                  });
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Mark read failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Mark all read
            </button>
          )}
        </div>
        <ul className="text-sm space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`border border-ink/10 px-3 py-2 ${n.readAt ? "bg-white/40 text-ink/60" : "bg-white/60"}`}
            >
              <p>{n.body}</p>
              <p className="text-xs text-ink/50">
                {n.type} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
        {!loading && notifications.length === 0 && (
          <p className="text-sm text-ink/60">No notifications.</p>
        )}
      </section>

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Create organization</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5"
            placeholder="Name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5"
            placeholder="Type"
            value={orgType}
            onChange={(e) => setOrgType(e.target.value)}
          />
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy || !orgName.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api("/organizations", {
                  method: "POST",
                  body: JSON.stringify({ name: orgName.trim(), orgType: orgType.trim() }),
                });
                setOrgName("");
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Create org failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Create
          </button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5 flex-1 min-w-[200px]"
            placeholder="Organization ID to join"
            value={joinOrgId}
            onChange={(e) => setJoinOrgId(e.target.value)}
          />
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy || !joinOrgId.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api("/organizations/join", {
                  method: "POST",
                  body: JSON.stringify({ organizationId: joinOrgId.trim() }),
                });
                setJoinOrgId("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Join failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Join
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Organizations</h2>
        <ul className="text-sm space-y-2">
          {orgs.map((org) => (
            <li key={org.id} className="border border-ink/10 bg-white/50 p-3">
              <p className="font-medium">
                {org.name} · {org.orgType}
              </p>
              {org.description && <p className="text-ink/70">{org.description}</p>}
              <p className="text-ink/60 text-xs">
                {org.districtName ?? "No district"} · ID {org.id}
              </p>
            </li>
          ))}
        </ul>
        {!loading && orgs.length === 0 && (
          <p className="text-sm text-ink/60">No organizations.</p>
        )}
      </section>
    </div>
  );
}
