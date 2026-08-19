const ROUTES = ["idea", "curiosity", "comms", "todo", "uncategorized"] as const;
export type Route = (typeof ROUTES)[number];

export interface RouteResult {
	route: Route;
	/**
	 * Confirmation text written back to the user, spoken through the ring's
	 * own feed as the assistant's reply — must stand alone as the whole
	 * response (see the server `instructions` in index.ts).
	 */
	confirmation: string;
	/** Short structured note about what was done, stored for the dashboard. */
	detail: string;
}

const CLASSIFY_TOOL = {
	name: "classify_capture",
	description: "Classify a voice capture and draft the confirmation reply shown back to the user.",
	input_schema: {
		type: "object" as const,
		properties: {
			route: {
				type: "string",
				enum: ROUTES,
				description:
					"idea = a new idea/concept worth remembering or building on. curiosity = a question or topic the user wants explained/researched. comms = the user wants a message sent or drafted to someone. todo = an action item or reminder. uncategorized = doesn't fit cleanly, or too short/unclear to classify.",
			},
			confirmation: {
				type: "string",
				description:
					"A warm, specific, first-person confirmation spoken directly to the user, 1-2 sentences, referencing the actual content they said. E.g. \"Great idea — I've filed this under ideas for later.\" or \"Got it, I'll dig into that overnight and have something for you in the morning digest.\" Never generic or robotic.",
			},
			detail: {
				type: "string",
				description: "One short internal note (not shown to the user) summarizing what this capture is about, for the dashboard.",
			},
		},
		required: ["route", "confirmation", "detail"],
	},
};

async function callClaude(env: Env, opts: { system: string; user: string; maxTokens: number }): Promise<string> {
	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": env.ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: "claude-haiku-4-5-20251001",
			max_tokens: opts.maxTokens,
			system: opts.system,
			messages: [{ role: "user", content: opts.user }],
		}),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
	}
	const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
	const textBlock = data.content.find((c) => c.type === "text");
	if (!textBlock?.text) throw new Error("No text block in Anthropic response");
	return textBlock.text;
}

/**
 * Tier 1 dashboard action: expand an idea or research a curiosity on demand.
 * Only meaningful for the "idea" and "curiosity" routes.
 */
const NO_MARKDOWN =
	"Write flowing prose paragraphs only. Never start with a title or header line, never use '#', never use markdown syntax of any kind (no bullet points, no bold, no headers). This is rendered as plain text.";

/** Strips a leading markdown header line if the model adds one despite instructions. */
function stripLeadingHeader(text: string): string {
	return text.replace(/^#+\s*.*\n+/, "").trim();
}

export async function expandCapture(env: Env, route: Route, rawText: string): Promise<string> {
	if (route === "idea") {
		const text = await callClaude(env, {
			system: `The user captured a quick voice-memo idea. Flesh it out into a short, punchy spike: what it is, why it might be worth pursuing, and one concrete next step. 3-5 sentences. ${NO_MARKDOWN}`,
			user: rawText,
			maxTokens: 400,
		});
		return stripLeadingHeader(text);
	}
	if (route === "curiosity") {
		const text = await callClaude(env, {
			system: `The user asked this out loud, captured by voice memo. Give them a real, substantive answer — not a teaser or an offer to research later, an actual explanation. A few short paragraphs. ${NO_MARKDOWN}`,
			user: rawText,
			maxTokens: 600,
		});
		return stripLeadingHeader(text);
	}
	throw new Error(`expandCapture called for non-expandable route: ${route}`);
}

export async function classifyAndRespond(env: Env, rawText: string): Promise<RouteResult> {
	try {
		const res = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": env.ANTHROPIC_API_KEY,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-haiku-4-5-20251001",
				max_tokens: 300,
				system:
					"You classify short voice memos captured from a smart ring worn by the user, and draft the reply they'll hear back. Be warm and concise, like a sharp assistant who actually listened, not a form letter.",
				messages: [{ role: "user", content: rawText }],
				tools: [CLASSIFY_TOOL],
				tool_choice: { type: "tool", name: "classify_capture" },
			}),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
		}

		const data = (await res.json()) as {
			content: Array<{ type: string; input?: unknown }>;
		};
		const toolUse = data.content.find((c) => c.type === "tool_use") as
			| { type: "tool_use"; input: { route: Route; confirmation: string; detail: string } }
			| undefined;
		if (!toolUse) throw new Error("No tool_use block in Anthropic response");

		const { route, confirmation, detail } = toolUse.input;
		if (!ROUTES.includes(route)) throw new Error(`Unknown route returned: ${route}`);

		return { route, confirmation, detail };
	} catch (err) {
		// Router failure must never break the ring's feedback loop — fall back
		// to an honest, generic confirmation and keep the raw capture visible
		// on the dashboard for later triage.
		const message = err instanceof Error ? err.message : String(err);
		return {
			route: "uncategorized",
			confirmation: `Got it, saved: "${rawText}"`,
			detail: `router_error: ${message}`,
		};
	}
}
