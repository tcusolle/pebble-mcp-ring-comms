// Secrets aren't declared in wrangler.jsonc, so `wrangler types` doesn't
// know about them. This file augments the generated Env interface and is
// NOT overwritten when `wrangler types` reruns (only worker-configuration.d.ts is).
declare global {
	interface Env {
		AUTH_PASSWORD: string;
		SESSION_SECRET: string;
		ANTHROPIC_API_KEY: string;
	}
}

export {};
