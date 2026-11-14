# Pebble Ring Voice Capture

A Cloudflare Worker that turns voice notes from a smart ring into a personal
dashboard. The ring's companion app sends each transcription to this Worker as
an MCP tool call. The Worker classifies it with Claude, stores it, answers back
with a specific confirmation, and builds a nightly digest.

## How it works
```
Ring -> Pebble app -> MCP tool call (log_voice_note) -> Worker
                                                         |- classifies with Claude (Haiku) -> route + confirmation
                                                         |- writes every capture to D1
                                                         |- GET /  password-protected dashboard over D1
                                                         |- nightly Cron Trigger -> digest
```
- **MCP server:** `src/index.ts` exposes `log_voice_note` using the Agents SDK
  (`McpAgent`). The server `instructions` tell the client to speak the tool's
  result back verbatim, so the ring's own feed shows the real outcome.
- **Router:** `src/router.ts` asks Claude to pick a route (`idea`, `curiosity`,
  `comms`, `todo`, `uncategorized`) via a forced tool call, and to write a
  one-sentence confirmation. If classification fails, the capture is still saved
  as `uncategorized`, so a model error never breaks the feedback loop.
- **On-demand expansion:** the dashboard can expand an idea or curiosity into a
  short write-up (`expandCapture`).
- **Digest:** `src/digest.ts` summarizes captures since the last digest on a
  daily cron.
- **Dashboard:** `src/pages.ts` and `src/auth.ts`. A single shared password gives
  an HMAC-signed, HttpOnly session cookie, compared in constant time.
- **Storage:** D1 (`pebble-mcp/schema.sql`): `captures` and `digests`.

## Status
The core pipeline is implemented. The `comms` and `todo` routes are
classified and recorded but not yet acted on. `PLAN.md` has the roadmap.

## Setup
```bash
cd pebble-mcp
npm install
npx wrangler d1 create pebble-captures      # then put the id in wrangler.jsonc
npx wrangler d1 execute pebble-captures --remote --file=schema.sql
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
npm run cf-typegen                           # generates worker-configuration.d.ts
npm run deploy
```
`./test_mcp.sh` is a curl smoke test for the `/mcp` endpoint.

## Security notes
- **`/mcp` is unauthenticated by design**, because the ring app calls it
  directly. Anyone who learns the Worker URL can submit notes and cause Claude API
  calls. If you deploy this, keep the URL private and add a shared secret in
  the path or a header first.
- The dashboard uses one shared password, which is fine for a personal tool.
- Voice notes are sent to the Anthropic API for classification.

## History

This project was developed locally before it had a repository and was not under
version control at the time. The commits here were assembled afterwards, grouped
by component. Each commit date is the last-modified time of the newest file in
that commit, so dates are approximate but real. The final commit (README and
license) was added when the project was published.
