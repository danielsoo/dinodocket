<p align="center">
  <img src="public/logo.png" alt="DinoDocket logo" width="180" />
</p>

<h1 align="center">DinoDocket</h1>

<p align="center"><b>Plans that fit your real week.</b><br/>
An AI planner that checks whether your week actually fits, plans <i>how</i> to do things, and never changes your calendar without your approval.<br/>
Behind it, a team of AI agents keeps making the scheduler better.</p>

<p align="center">
  <a href="https://dinodocket.vercel.app">Live demo</a> ·
  Built at <b>c0mpiled-15, Penn State (Oct 11, 2026)</b> ·
  Track 1 (Challenge A: Self-Improving Agent Team) · Best Use of MongoDB
</p>

---

## The problem

Google Calendar shows when you're free. It doesn't tell you whether everything you owe this week actually **fits** in that free time. The essay, the problem set, and the midterm prep live in your head, not on the calendar, so the overload shows up on Wednesday night instead of Sunday.

## What DinoDocket does

### Planner (`/`)
- **Does my week fit?** Classes, shifts and meetings are locked. Dino places study work in the gaps, respects your daily limit and breaks, and says plainly when something can't fit: *"Needs 30h, but only 25.5h of awake time is free before Wed 10:00 AM."*
- **Chat to change things.** "Lab report due Wednesday, about 4 hours." "I'm busy Tue 6 to 9pm." "Put THON committee in a THON group." The AI turns each message into one structured action; the server validates it; the engine re-plans; **you approve or reject**.
- **Plans how, not just when.** "I want to practice making croissants" becomes a step-by-step plan spread across the week. Click any block to see that session's steps with YouTube and web search links (search links, so they always resolve to real results).
- **Dino noticed.** Proactive catches before they bite: a meeting with **no link or location** (with a drafted message asking for it), **double-booked** commitments (with a reschedule draft), important work finishing hours before its deadline, big tasks with no steps, days over your limit.
- **Lock what you can't miss.** Say "I never miss church" or "this class is mandatory" and Dino locks it 🔒: locked events are top priority and nothing is ever planned over them. Unlocked events are avoided too, but when essential work can't fit anywhere else Dino may use that time and tells you which event gave it up. When something looks important (a class, a shift, a service) but isn't locked, Dino asks "Should I lock it?".
- **Edit like a normal calendar.** Click an empty slot to add an event, click any block to edit time, link, location, group or color.
- **Where your week goes.** Custom groups (School, Work, THON, anything) and a whole-week bar showing each group's share of your awake time and what's left free.
- **Personalized from sign-up.** Onboarding answers (wake and sleep, focus hours, session length, daily limit, work style, goals) set the engine's profile and are passed to Dino.
- **Accounts, synced to MongoDB Atlas.** Sign up and your plan and preferences follow you to any device. Without an account, each browser gets a private plan id and "Open on another device" copies a link to the same plan.

### Agent Lab (`/lab`): the self-improving agent team
1. **Baseline:** earliest-deadline-first greedy (first free slot, 1h chunks, no daily limit, no breaks).
2. **Each round, 4 agents** on Luminal (`deepseek-ai/DeepSeek-V4.1-Flash`) read the top strategies, their score breakdowns, the **worst-scoring weeks**, and last round's attempts, then each propose a new strategy:
   - *Deadline Guardian*: completion and deadline buffer
   - *Wellbeing Advocate*: livable days, breaks, focus hours
   - *Explorer*: structurally different moves
   - *Refiner*: targeted fixes to the current best
3. **Evaluation:** every proposal runs through the real scheduling engine on **30 synthetic student weeks**.
4. **Held-out test:** the final strategy is scored on **15 weeks the agents never saw**.
5. **"Just me" mode:** every training and test week takes on *your* sign-up rhythm, and the agents are told your habits, so they tune the planner to you. "Use best strategy in Planner" applies it.
6. Every run is stored in **MongoDB Atlas** and listed under *Past runs*.

**Example run (LLM agents, 4 rounds):** held-out score **69.9 → 77.1 (+10.3%)**, 100% valid schedules, best strategy proposed by the LLM *Refiner*. Its reasoning, verbatim from the run log:

> Targeting the completion losses on overloaded weeks (seeds 9/10/26), I sharpen deadline-driven ordering (higher urgency and slack, more negative size) and slightly raise the pass-1 daily cap to fit more required work, while increasing adjacency penalty to preserve breaks.

## Scoring (0 to 100 per student week)

Hard constraints (no overlaps with commitments, inside awake hours, before deadlines, no over-scheduling) are checked by an **independent validator**. Any violation scores **0**.

```
score = 50·completion + completion · (15·focusFit + 15·livable + 10·breaks + 10·buffer)
```

| Component | Meaning |
|---|---|
| completion | importance-weighted share of required work that got scheduled |
| focusFit | share of work inside the student's focus hours |
| livable | how well daily work stays under the student's own daily limit |
| breaks | share of sessions with breathing room before and after |
| buffer | share of essential/high work finished ≥ 24h before the deadline |

**We caught reward hacking.** In an early run the agents raised "livable" and "breaks" to 100% by simply **not scheduling homework** (completion fell from 95% to 63%). Multiplying quality by completion removed the exploit, so gains now come from smarter placement, not from dropping work.

## Architecture

```
chat message ─▶ LLM interpreter ─▶ one structured action ─▶ server validation ─┐
                                                                               ▼
strategy (tuned in Agent Lab) ──────────────────────────────▶ scheduling engine ─▶ validator ─▶ proposal ─▶ you approve
                                                                               │
                                                                     MongoDB Atlas (plans, runs)
```

- `src/lib/engine/`: pure TypeScript. Seeded week generator, greedy constructive scheduler driven by a strategy "genome", independent validator, scorer.
- `src/lib/agents.ts`: agent personas, prompts, per-agent evaluation. One serverless request per agent so each gets its own time budget.
- `src/lib/llm.ts`: OpenAI-compatible client with retry and backoff for a shared, busy endpoint; tolerant JSON extraction for reasoning models.
- `src/lib/interpret.ts`: natural language → validated action (with a rule-based fallback so the demo never stalls).
- `src/lib/notice.ts`, `src/lib/groups.ts`, `src/lib/steps.ts`: Dino noticed, groups and stats, step plans.
- `src/lib/persona.ts`, `src/lib/onboarding.ts`: sign-up answers → engine profile, chat context, and personalized Agent Lab weeks.
- `src/app/api/plan`, `src/app/api/lab/runs`: MongoDB Atlas persistence.

**Honest by design:** when the shared inference API is overloaded, an agent falls back to a local mutation of the current best. The Lab labels every fallback (hollow dots, "(fallback)" rows, an LLM success counter) instead of hiding it.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: LUMINAL_API_KEY, MONGODB_URI
npm run dev                  # http://localhost:3000
npm run check                # engine sanity check: validity + headroom
```

Without `LUMINAL_API_KEY` the Lab uses clearly labeled mock agents and the chat uses a rule-based parser. Without `MONGODB_URI` everything is stored in the browser.

## Deploy (Vercel)

1. Import the repo in Vercel (Next.js, no settings needed).
2. Env vars: `LUMINAL_API_KEY` (base URL `https://flash.luminal.cloud/v1` and model `deepseek-ai/DeepSeek-V4.1-Flash` are defaults; override with `LUMINAL_BASE_URL` / `LUMINAL_MODEL`), and `MONGODB_URI` (Atlas; allow `0.0.0.0/0` in Network Access since Vercel IPs change).
3. Deploy.

**Accounts.** Email and password sign-up and login, stored in MongoDB Atlas: passwords are kept only as salted scrypt hashes, sessions are HMAC-signed httpOnly cookies (30 days). Each account has its own plan and its own sign-up answers, so every user (or judge) gets a planner and an AI tuned to them, on any device. Set `AUTH_SECRET` to a long random string in production; without it a secret is derived from the database URI. Google sign-in is not implemented yet.
