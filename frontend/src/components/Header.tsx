import { LogOut, Mail } from "lucide-react";
import type { User } from "../types/user";

interface HeaderProps {
  user: User;
  onLogout: () => void;
}

export default function Header({
  user,
  onLogout,
}: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
            <Mail className="h-5 w-5 text-slate-950" />
          </div>

          <div>
            <h1 className="text-lg font-bold text-white">
              ReachInbox
            </h1>

            <p className="text-xs text-slate-500">
              Email Scheduler
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-10 w-10 rounded-full border border-slate-700 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 font-semibold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-white">
              {user.name}
            </p>

            <p className="text-xs text-slate-400">
              {user.email}
            </p>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}