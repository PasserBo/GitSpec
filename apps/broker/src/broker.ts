/**
 * The one GitSpec-operated component the free side depends on (B-4).
 *
 * It exists for exactly one reason: a GitHub App's client secret cannot live in a
 * browser, and GitHub will not exchange an authorization code without it. Everything
 * else the editor does — reading a document, committing, opening a pull request — the
 * browser does directly against github.com.
 *
 * So this holds no state, stores no token, and never sees a document. It forwards two
 * exchanges and returns what GitHub said. If it disappears, already-signed-in editors
 * keep working until their token expires; nothing that is already in the repository is
 * affected, because nothing of the repository is here.
 */

export interface BrokerEnv {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    /** Comma-separated origins allowed to call this. Empty means same-origin only. */
    ALLOWED_ORIGINS?: string;
}

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

function allowedOrigins(env: BrokerEnv): string[] {
    return (env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function corsHeaders(request: Request, env: BrokerEnv): Record<string, string> {
    const origin = request.headers.get("origin");
    const allowed = allowedOrigins(env);
    if (!origin || !allowed.includes(origin)) return {};
    return {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
        vary: "origin",
    };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
    });
}

/**
 * Forward one grant to GitHub and hand back its answer verbatim.
 *
 * The response is passed through rather than reshaped so that an error from GitHub
 * reaches the person who can act on it. Nothing here is logged: the body contains a
 * token on success and a code that can still be redeemed on some failures.
 */
async function exchange(
    env: BrokerEnv,
    params: Record<string, string>,
    fetchImpl: typeof fetch,
): Promise<{ status: number; body: unknown }> {
    // Form-encoded, which is what GitHub's own examples use and what every OAuth token
    // endpoint accepts. A JSON body leaves whether the credentials were read at all
    // indistinguishable from their being wrong, since both answer the same way.
    const form = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        ...params,
    });

    const response = await fetchImpl(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
    });

    const body = (await response.json().catch(() => ({ error: "unparseable_response" }))) as Record<
        string,
        unknown
    >;

    // GitHub answers 200 with an `error` field for a rejected grant. Passing that
    // through as success would leave the editor waiting for a token that never comes.
    if (!response.ok || typeof body.error === "string") {
        return { status: response.ok ? 400 : response.status, body };
    }
    return { status: 200, body };
}

export async function handleBroker(
    request: Request,
    env: BrokerEnv,
    fetchImpl: typeof fetch = fetch,
): Promise<Response> {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405, cors);
    }
    if (request.headers.get("origin") && Object.keys(cors).length === 0) {
        // A browser from an origin we do not serve. Refused here rather than relying on
        // the browser to enforce the missing CORS header.
        return json({ error: "origin_not_allowed" }, 403, {});
    }
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return json({ error: "broker_not_configured" }, 500, cors);
    }

    const url = new URL(request.url);
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return json({ error: "invalid_body" }, 400, cors);

    if (url.pathname.endsWith("/token")) {
        const code = payload.code;
        if (typeof code !== "string" || !code) return json({ error: "missing_code" }, 400, cors);
        const result = await exchange(env, { code }, fetchImpl);
        return json(result.body, result.status, cors);
    }

    if (url.pathname.endsWith("/refresh")) {
        const refreshToken = payload.refresh_token;
        if (typeof refreshToken !== "string" || !refreshToken) {
            return json({ error: "missing_refresh_token" }, 400, cors);
        }
        const result = await exchange(
            env,
            { refresh_token: refreshToken, grant_type: "refresh_token" },
            fetchImpl,
        );
        return json(result.body, result.status, cors);
    }

    return json({ error: "not_found" }, 404, cors);
}

export default {
    fetch: (request: Request, env: BrokerEnv) => handleBroker(request, env),
};
