interface DigestCapture {
	created_at: string;
	raw_text: string;
	route: string;
	result: string | null;
	expansion: string | null;
}

/**
 * Builds and stores a digest summarizing captures since the last digest (or
 * the last 24h if none exists). Called by the nightly cron trigger; failures
 * are caught by the caller so a bad night doesn't crash the scheduled event.
 */
export async function generateDigest(env: Env): Promise<{ skipped: true } | { skipped: false; id: number }> {
	const lastDigest = await env.DB.prepare(`SELECT period_end FROM digests ORDER BY created_at DESC LIMIT 1`).first<{
		period_end: string;
	}>();
	const periodStart = lastDigest?.period_end ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const periodEnd = new Date().toISOString();

	// created_at is stored via SQLite's datetime('now') (space-separated), while
	// periodStart/periodEnd are JS ISO strings (T-separated) — naive string
	// comparison between the two formats silently returns wrong results
	// (verified: '2026-08-19 02:50:53' > '2026-08-19T00:00:00.000Z' is FALSE
	// despite being genuinely later). unixepoch() normalizes both correctly.
	const { results } = await env.DB.prepare(
		`SELECT created_at, raw_text, route, result, expansion FROM captures
		 WHERE unixepoch(created_at) > unixepoch(?) AND unixepoch(created_at) <= unixepoch(?)
		 ORDER BY created_at ASC`,
	)
		.bind(periodStart, periodEnd)
		.all<DigestCapture>();

	if (results.length === 0) {
		return { skipped: true };
	}

	const transcript = results
		.map((c) => `[${c.route}] ${c.raw_text}${c.expansion ? `\n  (expanded: ${c.expansion})` : ""}`)
		.join("\n");

	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": env.ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: "claude-haiku-4-5-20251001",
			max_tokens: 800,
			system:
				"You write a short daily digest of voice memos the user captured via a smart ring. Group by what matters: new ideas worth a second look, open curiosities, things the user asked to communicate, and to-dos. Be direct and useful, like a chief of staff's morning note — not a listicle. Plain text, no markdown headers or bullet symbols, just clear paragraphs. End with what's still open/unaddressed if anything is.",
			messages: [{ role: "user", content: transcript }],
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
	}

	const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
	const textBlock = data.content.find((c) => c.type === "text");
	if (!textBlock?.text) throw new Error("No text block in digest response");

	const insertResult = await env.DB.prepare(
		`INSERT INTO digests (period_start, period_end, content, capture_count) VALUES (?, ?, ?, ?)`,
	)
		.bind(periodStart, periodEnd, textBlock.text, results.length)
		.run();

	return { skipped: false, id: insertResult.meta.last_row_id };
}
