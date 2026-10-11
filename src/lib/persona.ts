import type { Instance, Profile } from "./engine/types";
import { sanitizeInstance } from "./plan";
import { DAY_NAMES } from "./engine/types";

/** What we learned at sign-up, in a form that is safe to send to the server and to the LLM. */
export interface Persona {
  profile: Profile;
  role?: string;
  year?: string;
  peak?: string;
  workStyle?: string;
  commitments?: string[];
  goals?: string[];
}

const ALLOWED = {
  role: ["undergrad", "grad", "working-student", "professional"],
  year: ["freshman", "sophomore", "junior", "senior", "masters", "phd", "na"],
  peak: ["morning", "afternoon", "evening", "night"],
  workStyle: ["last-minute", "mix", "early"],
};
const pick = (x: unknown, allowed: string[]) => (typeof x === "string" && allowed.includes(x) ? x : undefined);
const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 40)).slice(0, 8) : undefined);

export function sanitizePersona(raw: unknown): Persona | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.profile || typeof r.profile !== "object") return null;
  return {
    profile: sanitizeInstance({ profile: r.profile }).profile,
    role: pick(r.role, ALLOWED.role),
    year: pick(r.year, ALLOWED.year),
    peak: pick(r.peak, ALLOWED.peak),
    workStyle: pick(r.workStyle, ALLOWED.workStyle),
    commitments: list(r.commitments),
    goals: list(r.goals),
  };
}

export const personaKey = (p: Persona | null) => (p ? JSON.stringify(p.profile) + (p.workStyle ?? "") : "everyone");

const t = (m: number) => (m >= 1440 ? "midnight" : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);

/** Plain-language description for prompts. */
export function personaText(p: Persona | null) {
  if (!p) return "";
  const pr = p.profile;
  const parts = [
    p.role && `role: ${p.role}${p.year && p.year !== "na" ? ` (${p.year})` : ""}`,
    `awake ${t(pr.wake)} to ${t(pr.sleep)}`,
    `best focus ${t(pr.focusStart)} to ${t(pr.focusEnd)}`,
    `prefers ${pr.sessionLen}-minute sessions`,
    `wants at most ${(pr.maxFocusPerDay / 60).toFixed(1)}h of focused work per day`,
    p.workStyle && `usually works ${p.workStyle === "last-minute" ? "right before deadlines (needs to be started earlier)" : p.workStyle === "early" ? "well ahead of deadlines" : "with a mix of timing"}`,
    p.commitments?.length && `other commitments: ${p.commitments.join(", ")}`,
    p.goals?.length && `goals: ${p.goals.join(", ")}`,
  ].filter(Boolean);
  return parts.join("; ");
}

/** Give every synthetic week this person's daily rhythm, so the agents optimize for them specifically. */
export function personalize(instances: Instance[], p: Persona | null): Instance[] {
  if (!p) return instances;
  return instances.map((inst) => ({ ...inst, id: `${inst.id}-me`, profile: { ...p.profile } }));
}

export const dayList = DAY_NAMES;
