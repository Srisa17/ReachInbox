"use client";

import { AppUser } from "@/lib/types";
import { signOut } from "next-auth/react";
import { api } from "@/lib/api";

export function Header({ user, onComposeClick }: { user: AppUser; onComposeClick: () => void }) {
  async function handleLogout() {
    await api.logout();
    await signOut({ callbackUrl: "/" });
  }

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-ink-700">
      <div>
        <p className="text-sm text-slate-400">ReachInbox</p>
        <h1 className="text-lg font-semibold">Scheduler</h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onComposeClick}
          className="rounded-md bg-amber-400 text-ink-950 font-medium px-4 py-2 text-sm hover:bg-amber-500 transition-colors"
        >
          Compose new email
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-ink-700">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-ink-700 flex items-center justify-center text-sm">
              {user.name.charAt(0)}
            </div>
          )}
          <div className="text-sm leading-tight">
            <p className="text-paper">{user.name}</p>
            <p className="text-slate-400">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-paper ml-2">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
