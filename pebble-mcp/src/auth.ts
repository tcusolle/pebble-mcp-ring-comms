const SESSION_COOKIE = "session";
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days

async function hmacHex(data: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function getCookie(request: Request, name: string): string | undefined {
	const header = request.headers.get("Cookie");
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		if (k === name) return decodeURIComponent(rest.join("="));
	}
	return undefined;
}

export async function makeSessionCookieHeader(secret: string): Promise<string> {
	const expiry = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS;
	const sig = await hmacHex(String(expiry), secret);
	const value = `${expiry}.${sig}`;
	return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
	return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
	const value = getCookie(request, SESSION_COOKIE);
	if (!value) return false;
	const [expiryStr, sig] = value.split(".");
	if (!expiryStr || !sig) return false;
	const expiry = Number.parseInt(expiryStr, 10);
	if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
	const expectedSig = await hmacHex(expiryStr, env.SESSION_SECRET);
	return timingSafeEqual(sig, expectedSig);
}

export function checkPassword(submitted: string, env: Env): boolean {
	return timingSafeEqual(submitted, env.AUTH_PASSWORD);
}
