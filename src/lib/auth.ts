"use client";

// Demo-only auth. There is NO real authentication here:
// any email/password "logs in", and the user is just kept in localStorage.
// Swap this file out when real auth is added.

import { useSyncExternalStore } from "react";

export type DemoUser = { name: string; email: string };

const KEY = "dd_user";
const EVENT = "dd-auth";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function nameFromEmail(email: string) {
  const local = email.split("@")[0]?.trim();
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Student";
}

export function demoLogin(email: string, name?: string) {
  const cleanEmail = email.trim() || "student@psu.edu";
  const user: DemoUser = { email: cleanEmail, name: name?.trim() || nameFromEmail(cleanEmail) };
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
  return user;
}

export function demoLogout() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Returns undefined during SSR / first paint, null when logged out, the user when logged in.
export function useDemoUser(): DemoUser | null | undefined {
  const raw = useSyncExternalStore(subscribe, read, () => undefined as unknown as string | null);
  if (raw === undefined) return undefined;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoUser;
  } catch {
    return null;
  }
}
