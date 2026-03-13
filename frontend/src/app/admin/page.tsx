"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { usersApi, healthApi, ingestApi } from "@/lib/api";
import type { User, DetailedHealth } from "@/lib/types";
import { PageSpinner } from "@/components/LoadingSpinner";
import { cn, formatDate } from "@/lib/utils";
import {
  UserCircleIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";

// ─── Health status badge ──────────────────────────────────────────────────────

function StatusDot({ status }: { status: "healthy" | "degraded" | "unhealthy" | undefined }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "inline-flex h-2.5 w-2.5 rounded-full",
        status === "healthy" && "bg-green-400",
        status === "degraded" && "bg-yellow-400",
        status === "unhealthy" && "bg-red-400"
      )}
      aria-label={status}
    />
  );
}

function HealthCard({ health }: { health: DetailedHealth | null }) {
  if (!health) return null;

  const services = Object.entries(health.services) as [
    string,
    { status: "healthy" | "degraded" | "unhealthy"; latency_ms: number | null; detail: string | null }
  ][];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">System Health</h2>
        <StatusDot status={health.overall} />
        <span
          className={cn(
            "text-xs font-medium capitalize",
            health.overall === "healthy" && "text-green-400",
            health.overall === "degraded" && "text-yellow-400",
            health.overall === "unhealthy" && "text-red-400"
          )}
        >
          {health.overall}
        </span>
      </div>

      <div className="space-y-1.5">
        {services.map(([name, svc]) => (
          <div key={name} className="flex items-center gap-2">
            <StatusDot status={svc.status} />
            <span className="w-20 flex-shrink-0 text-xs capitalize text-muted-foreground">
              {name}
            </span>
            <span
              className={cn(
                "text-xs capitalize",
                svc.status === "healthy" && "text-green-400",
                svc.status === "degraded" && "text-yellow-400",
                svc.status === "unhealthy" && "text-red-400"
              )}
            >
              {svc.status}
            </span>
            {svc.latency_ms != null && (
              <span className="ml-auto text-xs text-muted-foreground">
                {svc.latency_ms}ms
              </span>
            )}
            {svc.detail && (
              <span className="ml-2 truncate text-xs text-muted-foreground">
                {svc.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  currentUserId,
  onRoleChange,
}: {
  user: User;
  currentUserId: string | undefined;
  onRoleChange: (userId: number, role: "admin" | "user") => void;
}) {
  const isSelf = user.clerk_id === currentUserId;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <UserCircleIcon className="h-8 w-8 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {user.display_name ?? user.email.split("@")[0]}
              {isSelf && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  You
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-xs text-muted-foreground">
        {formatDate(user.created_at)}
      </td>
      <td className="py-3">
        <select
          value={user.role}
          onChange={(e) =>
            onRoleChange(user.id, e.target.value as "admin" | "user")
          }
          disabled={isSelf}
          className="rounded-lg border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus:border-primary focus:outline-none"
          aria-label={`Role for ${user.email}`}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </td>
    </tr>
  );
}

// ─── Invite form ──────────────────────────────────────────────────────────────

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const { getToken } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg(null);
    try {
      const token = await getToken();
      await usersApi.invite({ email }, token);
      setMsg({ type: "ok", text: `Invite sent to ${email}` });
      setEmail("");
      onInvited();
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : "Failed to send invite";
      setMsg({ type: "err", text });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Invite User</h2>
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <EnvelopeIcon
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
            className="w-full rounded-xl border border-border bg-muted py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={sending || !email}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {sending ? "…" : "Invite"}
        </button>
      </form>
      {msg && (
        <p
          className={cn(
            "mt-2 text-xs",
            msg.type === "ok" ? "text-green-400" : "text-red-400"
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { getToken, userId } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [health, setHealth] = useState<DetailedHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    try {
      const token = await getToken();
      setUsers(await usersApi.list(token));
    } catch {
      // 403 if not admin — user shouldn't see this page
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHealth() {
    setHealthLoading(true);
    try {
      setHealth(await healthApi.detailed());
    } catch {
      // ignore
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadHealth();
  }, [loadUsers]);

  async function handleRoleChange(userId: number, role: "admin" | "user") {
    try {
      const token = await getToken();
      const updated = await usersApi.updateRole(userId, { role }, token);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch {
      // ignore
    }
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="px-safe mx-auto max-w-3xl px-4 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheckIcon className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground">Admin</h1>
      </div>

      <div className="space-y-6 pb-8">
        {/* Health */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              System Health
            </h2>
            <button
              onClick={loadHealth}
              disabled={healthLoading}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              aria-label="Refresh health"
            >
              <ArrowPathIcon
                className={cn("h-3.5 w-3.5", healthLoading && "animate-spin")}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
          <HealthCard health={health} />
        </div>

        {/* Invite */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Users
          </h2>
          <InviteForm onInvited={loadUsers} />
        </div>

        {/* User table */}
        {users.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-auto py-2 pl-4 pr-4 text-left text-xs font-semibold text-muted-foreground">
                    User
                  </th>
                  <th className="w-28 py-2 pr-4 text-left text-xs font-semibold text-muted-foreground">
                    Joined
                  </th>
                  <th className="w-24 py-2 pr-4 text-left text-xs font-semibold text-muted-foreground">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    currentUserId={userId ?? undefined}
                    onRoleChange={handleRoleChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
