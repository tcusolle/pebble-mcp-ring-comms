# Pebble Ring → Central Dashboard: Build Plan

## Overview
A voice-capture pipeline: a smart ring sends transcribed voice notes to an MCP
tool on a Cloudflare Worker, which classifies, stores and answers each one. This
document records the design, the milestones and the lessons learned.

## Goal
One place that answers: what's possible (available voice commands), what's
been said/recorded, what's to do, what's been done — sourced entirely from
things the ring brought into scope. Not a general inbox/calendar/email
tracker.

## Explicitly out of scope
- **Health logging** — out of scope; handled by a separate system.
- Full inbox/calendar visibility — only threads/events the ring itself
  created get tracked.

## Architecture
One router (Claude API call inside the Worker) classifies each transcription
and dispatches to a route. Every capture lands in D1 regardless of route.
The dashboard is a page the same Worker serves, reading from D1. A nightly
Cloudflare Cron Trigger builds a digest.

```
Ring → Pebble app → MCP tool call → Worker
                                       ├─ writes to D1 (always)
                                       ├─ router (Claude API) → route handler
                                       └─ dashboard serves D1 state at GET /
```

## Design principle: the ring is a feedback loop, not just a mic
The MCP tool's `content` text is what shows up in the Pebble Index feed as
the immediate response to speaking. It should always confirm the *actual*
outcome, not a generic string — e.g. "Filed as idea → ideas backlog", "Saved as curiosity, researching tonight", "Drafted reply to
a contact, pending your approval" — so glancing at the ring's own feed tells
you what happened, without needing the dashboard. Milestone 1's
`log_voice_note` will still be generic (no router yet), but the return-text
shape should be treated as a first-class output the moment routing exists
in Milestone 2, not bolted on after.

## Milestones

### Milestone 1
- D1 database `pebble-captures` — schema: captures table
  (id, timestamp, raw_text, status, route, result).
- `log_voice_note` writes every capture to D1 instead of just `console.log`.
- Dashboard route (`GET /`) rendering captures from D1 — this is the "what's
  been said/recorded" view, live within seconds of speaking.
- Auth: **Cloudflare Access** (Zero Trust) in front of the Worker route —
  email one-time-code login, no password to manage. Requires one manual
  step in the Cloudflare dashboard (picking a Zero Trust team domain) that
  I'll walk through since it can't be done via CLI/API alone.

### Milestone 2
- Router: Claude API call classifies each capture (idea / curiosity /
  comms / to-do / uncategorized).
- Tier 1 dashboard actions (instant, server-side): "Research this",
  "Expand into spike", "Draft a reply" — button click → Claude API call →
  result written back to D1 → visible on refresh. Needs an Anthropic API
  key stored as a Worker secret.
- Dashboard grows: "what's possible" (live command list), "what's to do"
  (open items), "what's been done" (resolved items).
- Idea route: append to the right project's IDEAS.md / triage file
  (Tier 2 — queued, needs a Claude Code runner picking up tasks from D1;
  another project may already have useful patterns here).
- Curiosity route: nightly research + morning digest email.
- Every route returns specific outcome text as the tool response (see
  "Design principle" above) — Tier 2/3 routes that can't resolve instantly
  return an honest in-progress confirmation (e.g. "Queued: will file this
  under [project] shortly") rather than a fake completed one.

### Milestone 3
- Comms route: Gmail + a dedicated "Ring" Calendar, scoped tightly —
  Gmail actions limited to threads the Worker itself created (dedicated
  label), Calendar events go to a separate secondary calendar only.
  Requires a Google Cloud OAuth client + refresh token as a Worker secret
  (one-time ~15 min setup).
- Tier 3 actions: drafts require explicit "Approve & send" click — nothing
  outbound fires without it.
- Reply tracking: Worker watches only threads it opened, surfaces
  "waiting on reply" / "replied ✓" on the dashboard.

## Implementation notes
**Implemented:** D1 schema and capture logging, the password-protected dashboard
(login page and signed session cookie), the Claude router (classifies each
capture into idea, curiosity, comms, todo or uncategorized and drafts a specific
confirmation), on-demand expansion of ideas and curiosities, and a nightly
digest on a Cloudflare Cron Trigger. If the router fails, the tool call still
succeeds with a generic but honest confirmation.

**MCP server `instructions`:** the server tells the client to relay the tool's
confirmation text verbatim, so the client does not layer its own commentary on
top of the real outcome.

**Lessons learned**
- `created_at` is stored via SQLite's `datetime('now')` (space-separated) while
  JavaScript's `.toISOString()` is T-separated. Comparing the two as strings
  silently returns wrong results, so all date-range queries normalize with
  `unixepoch()`.
- The curiosity prompt occasionally returned a markdown header despite a
  "no markdown" instruction. The fix is an explicit anti-markdown clause plus a
  defensive strip of any leading header line.
- A scheduled Cron Trigger cannot be manually fired against a remote Worker from
  the CLI, so the scheduled path is the least tested part.

**Known gaps and decisions**
- The digest is dashboard-only. Emailing it would add a new credential
  dependency, so it was deferred.
- Filing ideas into project files needs a mechanism, since a Worker cannot reach
  local files (for example a GitHub token).
- Milestone 3 (comms and calendar) needs a Google OAuth client before work can
  start.
