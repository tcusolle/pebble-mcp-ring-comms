import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { checkPassword, clearSessionCookieHeader, isAuthenticated, makeSessionCookieHeader } from "./auth";
import { dashboardPage, loginPage, type Capture } from "./pages";
import { classifyAndRespond, expandCapture, type Route } from "./router";
import { generateDigest } from "./digest";

// Define our MCP agent with tools
export class MyMCP extends McpAgent<Env> {
	server = new McpServer(
		{
			name: "Pebble Index 01 Relay",
			version: "1.0.0",
		},
		{
			// Read by the Pebble app as extra context for its own model. This is
			// the lever that stops the client from adding its own freeform commentary
			// on top of our tool's confirmation — without it, the ring feed shows
			// both our result AND a separate generic follow-up message.
			instructions:
				"When the log_voice_note tool returns, speak its result text back to the user VERBATIM as your entire reply. " +
				"Do not summarize it, do not add commentary, do not ask follow-up questions, do not append anything before or after it. " +
				"The tool's returned text IS the complete, final response to the user.",
		},
	);

	async init() {
		this.server.registerTool(
			"log_voice_note",
			{
				description:
					"Logs the user's transcribed voice note text verbatim. Use this for every voice recording from the ring, regardless of content.",
				inputSchema: { text: z.string() },
			},
			async ({ text }) => {
				const { route, confirmation, detail } = await classifyAndRespond(this.env, text);
				await this.env.DB.prepare(
					`INSERT INTO captures (raw_text, tool_name, route, status, result, detail) VALUES (?, 'log_voice_note', ?, 'captured', ?, ?)`,
				)
					.bind(text, route, confirmation, detail)
					.run();
				return {
					content: [{ type: "text", text: confirmation }],
				};
			},
		);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// MCP endpoint — unauthenticated, called by the Pebble app directly.
		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		if (url.pathname === "/login" && request.method === "GET") {
			return new Response(loginPage(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
		}

		if (url.pathname === "/login" && request.method === "POST") {
			const form = await request.formData();
			const password = String(form.get("password") ?? "");
			if (checkPassword(password, env)) {
				const cookie = await makeSessionCookieHeader(env.SESSION_SECRET);
				return new Response(null, {
					status: 302,
					headers: { Location: "/", "Set-Cookie": cookie },
				});
			}
			return new Response(loginPage("Incorrect password."), {
				status: 401,
				headers: { "Content-Type": "text/html;charset=UTF-8" },
			});
		}

		if (url.pathname === "/logout") {
			return new Response(null, {
				status: 302,
				headers: { Location: "/login", "Set-Cookie": clearSessionCookieHeader() },
			});
		}

		if (url.pathname === "/") {
			if (!(await isAuthenticated(request, env))) {
				return new Response(null, { status: 302, headers: { Location: "/login" } });
			}
			const { results } = await env.DB.prepare(
				`SELECT id, created_at, raw_text, tool_name, route, status, result, expansion FROM captures ORDER BY created_at DESC LIMIT 50`,
			).all<Capture>();
			const latestDigest = await env.DB.prepare(
				`SELECT created_at, content, capture_count FROM digests ORDER BY created_at DESC LIMIT 1`,
			).first<{ created_at: string; content: string; capture_count: number }>();
			return new Response(dashboardPage(results, latestDigest ?? null), {
				headers: { "Content-Type": "text/html;charset=UTF-8" },
			});
		}

		const expandMatch = url.pathname.match(/^\/captures\/(\d+)\/expand$/);
		if (expandMatch && request.method === "POST") {
			if (!(await isAuthenticated(request, env))) {
				return new Response(null, { status: 302, headers: { Location: "/login" } });
			}
			const id = Number(expandMatch[1]);
			const row = await env.DB.prepare(`SELECT raw_text, route FROM captures WHERE id = ?`)
				.bind(id)
				.first<{ raw_text: string; route: Route }>();
			if (row) {
				try {
					const expansion = await expandCapture(env, row.route, row.raw_text);
					await env.DB.prepare(`UPDATE captures SET expansion = ? WHERE id = ?`).bind(expansion, id).run();
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					await env.DB.prepare(`UPDATE captures SET expansion = ? WHERE id = ?`)
						.bind(`(Expansion failed: ${message})`, id)
						.run();
				}
			}
			return new Response(null, { status: 302, headers: { Location: "/" } });
		}

		return new Response("Not found", { status: 404 });
	},

	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(
			(async () => {
				try {
					const result = await generateDigest(env);
					console.log(result.skipped ? "Digest skipped: no new captures" : `Digest ${result.id} generated`);
				} catch (err) {
					console.error("Digest generation failed:", err instanceof Error ? err.message : String(err));
				}
			})(),
		);
	},
};
