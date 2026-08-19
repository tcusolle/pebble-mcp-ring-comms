const BASE_STYLE = `
	:root { color-scheme: dark; }
	* { box-sizing: border-box; }
	body {
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		background: #0b0b0d;
		color: #e8e6e3;
		margin: 0;
		padding: 2rem 1rem;
	}
	.wrap { max-width: 640px; margin: 0 auto; }
	h1 { font-size: 1.4rem; margin: 0 0 1.5rem; }
	.card {
		background: #16161a;
		border: 1px solid #2a2a30;
		border-radius: 12px;
		padding: 1.25rem;
	}
`;

export function loginPage(error?: string): string {
	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Pebble Ring Dashboard — Sign in</title>
	<style>
		${BASE_STYLE}
		.wrap { max-width: 360px; margin-top: 4rem; }
		input {
			width: 100%;
			padding: 0.75rem;
			border-radius: 8px;
			border: 1px solid #2a2a30;
			background: #0b0b0d;
			color: #e8e6e3;
			font-size: 1rem;
			margin: 0.75rem 0;
		}
		button {
			width: 100%;
			padding: 0.75rem;
			border-radius: 8px;
			border: none;
			background: #e8622c;
			color: white;
			font-size: 1rem;
			font-weight: 600;
			cursor: pointer;
		}
		.error { color: #ff6b6b; font-size: 0.9rem; margin-top: 0.5rem; }
	</style>
</head>
<body>
	<div class="wrap card">
		<h1>Pebble Ring Dashboard</h1>
		<form method="POST" action="/login">
			<input type="password" name="password" placeholder="Password" autofocus required>
			<button type="submit">Sign in</button>
		</form>
		${error ? `<div class="error">${error}</div>` : ""}
	</div>
</body>
</html>`;
}

export interface Capture {
	id: number;
	created_at: string;
	raw_text: string;
	tool_name: string;
	route: string;
	status: string;
	result: string | null;
	expansion: string | null;
}

export interface Digest {
	created_at: string;
	content: string;
	capture_count: number;
}

const EXPANDABLE_ROUTES = new Set(["idea", "curiosity"]);
const ACTION_LABEL: Record<string, string> = {
	idea: "Expand into spike",
	curiosity: "Research this",
};

export function dashboardPage(captures: Capture[], latestDigest: Digest | null): string {
	const digestSection = latestDigest
		? `<div class="card digest">
			<div class="digest-header">
				<span class="digest-title">Latest digest</span>
				<span class="time">${escapeHtml(latestDigest.created_at)} · ${latestDigest.capture_count} capture${latestDigest.capture_count === 1 ? "" : "s"}</span>
			</div>
			<div class="digest-content">${escapeHtml(latestDigest.content)}</div>
		</div>`
		: "";

	const rows = captures
		.map((c) => {
			const canExpand = EXPANDABLE_ROUTES.has(c.route) && !c.expansion;
			return `
		<div class="capture">
			<div class="capture-meta">
				<span class="badge">${escapeHtml(c.route)}</span>
				<span class="time">${escapeHtml(c.created_at)}</span>
			</div>
			<div class="capture-text">${escapeHtml(c.raw_text)}</div>
			${c.result ? `<div class="capture-result">${escapeHtml(c.result)}</div>` : ""}
			${c.expansion ? `<div class="capture-expansion">${escapeHtml(c.expansion)}</div>` : ""}
			${
				canExpand
					? `<form method="POST" action="/captures/${c.id}/expand" class="action-form">
						<button type="submit" class="action-btn">${ACTION_LABEL[c.route]}</button>
					</form>`
					: ""
			}
		</div>`;
		})
		.join("");

	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Pebble Ring Dashboard</title>
	<style>
		${BASE_STYLE}
		.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
		.logout { color: #8a8a90; font-size: 0.85rem; text-decoration: none; }
		.capture { padding: 0.9rem 0; border-bottom: 1px solid #2a2a30; }
		.capture:last-child { border-bottom: none; }
		.capture-meta { display: flex; justify-content: space-between; margin-bottom: 0.35rem; }
		.badge {
			font-size: 0.7rem;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			background: #2a2a30;
			color: #b8b6b3;
			padding: 0.15rem 0.5rem;
			border-radius: 999px;
		}
		.time { font-size: 0.75rem; color: #6a6a70; }
		.capture-text { font-size: 0.95rem; line-height: 1.4; }
		.capture-result { font-size: 0.85rem; line-height: 1.4; color: #b8b6b3; margin-top: 0.35rem; }
		.capture-expansion {
			font-size: 0.88rem;
			line-height: 1.5;
			color: #d8d6d3;
			margin-top: 0.6rem;
			padding: 0.75rem;
			background: #0b0b0d;
			border: 1px solid #2a2a30;
			border-radius: 8px;
			white-space: pre-wrap;
		}
		.action-form { margin-top: 0.6rem; }
		.action-btn {
			padding: 0.4rem 0.8rem;
			border-radius: 999px;
			border: 1px solid #e8622c;
			background: transparent;
			color: #e8622c;
			font-size: 0.8rem;
			font-weight: 600;
			cursor: pointer;
		}
		.action-btn:hover { background: #e8622c; color: white; }
		.empty { color: #6a6a70; text-align: center; padding: 2rem 0; }
		.digest { margin-bottom: 1.25rem; border-color: #e8622c; }
		.digest-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.6rem; }
		.digest-title { font-weight: 600; font-size: 0.9rem; color: #e8622c; }
		.digest-content { font-size: 0.9rem; line-height: 1.55; white-space: pre-wrap; }
	</style>
</head>
<body>
	<div class="wrap">
		<div class="header">
			<h1>Captures</h1>
			<a class="logout" href="/logout">Sign out</a>
		</div>
		${digestSection}
		<div class="card">
			${captures.length ? rows : '<div class="empty">Nothing captured yet — trigger the ring.</div>'}
		</div>
	</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
