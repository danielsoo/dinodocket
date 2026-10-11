"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearLocalPlan, demoLogin, demoLogout, useDemoUser } from "@/lib/auth";

// Header account area. The server session (httpOnly cookie) is the source of truth;
// the local copy just lets the header render instantly.
export default function AuthNav() {
  const user = useDemoUser();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled === false) return; // no database: demo mode
        if (d.user) demoLogin(d.user.email, d.user.name);
        else demoLogout();
      })
      .catch(() => {});
  }, []);

  if (user === undefined) return <div className="ml-auto h-8 w-24 md:ml-4" aria-hidden />;

  if (!user) {
    return (
      <div className="ml-auto flex items-center gap-1.5 md:ml-4">
        <Link href="/login" className="hidden whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white sm:inline-block">
          Log in
        </Link>
        <Link href="/signup" className="hidden whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-deep hover:bg-cyan sm:inline-block">
          Sign up
        </Link>
        {/* phones: one compact button */}
        <Link href="/login" className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-bold text-deep sm:hidden">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-2 md:ml-4">
      <Link href="/onboarding" title="Edit your planning preferences" className="flex items-center gap-2 rounded-full pr-1 hover:bg-white/10">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-claw font-display text-sm font-bold text-deep" aria-hidden>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:inline">{user.name}</span>
      </Link>
      <button
        onClick={async () => {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {}
          clearLocalPlan();
          demoLogout();
          router.push("/login");
        }}
        className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
      >
        Log out
      </button>
    </div>
  );
}
