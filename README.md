# 🦕 DinoDocket

Your personal chief of staff for the semester. An AI scheduler for overcommitted college students, plus a team of AI agents that keeps making the scheduler better.

Built at **c0mpiled-15 (Penn State, Oct 11 2026)**. Track 1, Challenge A: *Build a Self-Improving Agent Team* (Luminal).

## What it does

**Planner (`/`)**
- Weekly calendar with locked commitments (classes, shifts, clubs) and flexible work sessions.
- Tell the assistant what changed ("I have a CMPSC 311 lab report due Wednesday, about 4 hours", "I'm busy Tue 6pm-9pm").
- The AI never edits the calendar. It returns one structured action, the server validates it, the engine builds a plan, and you **approve or reject** the proposal.
- When the week does not fit, it says so honestly: "Needs 30h, but only 25.5h of awake time is free before Wed 10:00 AM."

**Agent Lab (`/lab`)**: the self-improving agent team
1. **Baseline:** earliest-deadline-first greedy (first free slot, 1h chunks, no daily limit, no breaks).
2. **Each round,** 4 agents run in parallel on Luminal (DeepSeek / GLM flash):
   - *Deadline Guardian* protects completion and deadline buffer
   - *Wellbeing Advocate* targets livable days, breaks, focus hours
   - *Explorer* makes structurally different moves
   - *Refiner* makes small fixes to the current best
   
   Each agent sees the top strategies, their score breakdowns, the worst-scoring student weeks, and last round's attempts, then proposes a new strategy (JSON).
3. **Evaluation:** every proposal is run through the real scheduling engine on **30 synthetic student weeks** and scored.
4. **Fresh test:** the final best strategy is scored on **15 held-out weeks** the agents never saw.

## Scoring (0 to 100 per student week)

Hard constraints (no overlaps, locked events untouched, inside awake hours, before deadlines, no over-scheduling) are checked by an independent validator. Any violation scores **0**.

```
score = 50·completion + completion · (15·focusFit + 15·livable + 10·breaks + 10·buffer)
```

| Component | Meaning |
|---|---|
| completion | importance-weighted share of required work that got scheduled |
| focusFit | share of work inside the student's preferred focus hours |
| livable | how well daily work stays under the student's own daily limit |
| breaks | share of sessions with breathing room before and after |
| buffer | share of essential/high work finished ≥ 24h before the deadline |

**Why quality is multiplied by completion:** in an early run, the agents discovered they could raise "livable" and "breaks" to 100% by simply not scheduling work (completion fell from 95% to 63%). That is reward hacking. Scaling quality by completion removes the exploit, so improvements now come from smarter placement, not from dropping homework.

## Architecture

```
Chat message ──▶ LLM interpreter ──▶ structured action ──▶ server validation
                                                              │
Strategy (tuned by Agent Lab) ──────────────────────▶ scheduling engine ──▶ validator ──▶ proposal ──▶ user approves
```

- `src/lib/engine/` pure TypeScript: instance generator (seeded), greedy constructive scheduler controlled by a strategy "genome", independent validator, scorer.
- `src/lib/agents.ts` agent personas, prompts, parallel proposal + evaluation.
- `src/lib/interpret.ts` natural language → validated action (LLM, with a rule-based fallback).
- `src/app/api/*` route handlers. The client orchestrates rounds so each serverless call stays short.
- Optional MongoDB Atlas stores every lab run (`/api/lab/runs`).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in Luminal keys (optional)
npm run dev                  # http://localhost:3000
npm run check                # engine sanity check: validity + headroom
```

Without `LUMINAL_API_KEY` the lab uses **mock agents** (random mutation, clearly labeled in the UI) and the chat uses a rule-based parser, so the demo always works.

## Deploy on Vercel

1. Push this repo to GitHub and import it in Vercel (framework: Next.js, no settings needed).
2. Add env vars: `LUMINAL_API_KEY`, `LUMINAL_BASE_URL`, `LUMINAL_MODEL`, optionally `MONGODB_URI`.
3. Deploy.
