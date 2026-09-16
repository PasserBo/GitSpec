/**
 * Sign-in against a GitHub App, from a static page.
 *
 * The browser talks to github.com for authorization and to the broker only to exchange
 * a code or a refresh token — the two steps that need the app's client secret. The
 * resulting token belongs to the person, not to GitSpec, which is what makes E-4 true:
 * a commit is authored by whoever is signed in.
 *
 * Tokens live in this browser. They are never sent anywhere except github.com and the
 * broker, and the broker keeps none of them.
 */

export interface AuthConfig {
    clientId: string;
    /** Base URL of the token broker, e.g. https://gitspec-broker.example.workers.dev */
    broker: string;
}

interface StoredAuth {
    accessToken: string;
    /** Epoch ms. GitHub App user tokens expire after 8 hours by default. */
    expiresAt: number;
    refreshToken?: string;
    refreshExpiresAt?: number;
}

const AUTH_KEY = "gitspec:auth";
const PENDING_KEY = "gitspec:auth:pending";
/** Refresh early, so an edit submitted at the boundary does not fail on a stale token. */
const EARLY_REFRESH_MS = 5 * 60 * 1000;

function read(): StoredAuth | undefined {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return undefined;
    try {
        return JSON.parse(raw) as StoredAuth;
    } catch {
        return undefined;
    }
}

function write(auth: StoredAuth | undefined): void {
    if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
}

export function signOut(): void {
    write(undefined);
}

interface GrantResponse {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
}

function store(grant: GrantResponse): StoredAuth {
    if (!grant.access_token) {
        throw new Error(grant.error_description ?? grant.error ?? "the grant carried no token");
    }
    const now = Date.now();
    const auth: StoredAuth = {
        accessToken: grant.access_token,
        // A token without an expiry is one the app opted out of expiring. Treating it as
        // valid for a day keeps the refresh path exercised rather than dormant.
        expiresAt: now + (grant.expires_in ?? 86_400) * 1000,
        refreshToken: grant.refresh_token,
        refreshExpiresAt: grant.refresh_token_expires_in
            ? now + grant.refresh_token_expires_in * 1000
            : undefined,
    };
    write(auth);
    return auth;
}

async function post(url: string, body: unknown): Promise<GrantResponse> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const grant = (await response.json().catch(() => ({}))) as GrantResponse;
    if (!response.ok) {
        throw new Error(grant.error_description ?? grant.error ?? `broker returned ${response.status}`);
    }
    return grant;
}

/** Send the browser to GitHub. `returnTo` is restored after the redirect back. */
export function beginSignIn(config: AuthConfig, returnTo: string): void {
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ nonce, returnTo }));

    const redirectUri = new URL(location.pathname, location.origin).toString();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", nonce);
    location.assign(authorize.toString());
}

/**
 * Finish a redirect back from GitHub, if this load is one.
 *
 * Returns the query string the editor was on before signing in, or undefined when this
 * is an ordinary load. The `state` check is what stops a code from somewhere else being
 * redeemed in this tab.
 */
export async function completeSignIn(config: AuthConfig): Promise<string | undefined> {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) return undefined;

    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    const pending = pendingRaw ? (JSON.parse(pendingRaw) as { nonce: string; returnTo: string }) : undefined;

    if (!pending || pending.nonce !== state) {
        throw new Error("this sign-in did not start here");
    }

    store(await post(`${config.broker.replace(/\/$/, "")}/token`, { code }));
    // The code is single-use and now spent; leaving it in the address bar invites a
    // reload that fails for a reason nobody can see.
    history.replaceState(null, "", location.pathname + pending.returnTo);
    return pending.returnTo;
}

export function isSignedIn(): boolean {
    const auth = read();
    return Boolean(auth && (auth.expiresAt > Date.now() || auth.refreshToken));
}

/** A usable access token, refreshed when it is close to expiring. Undefined when signed out. */
export async function currentToken(config: AuthConfig): Promise<string | undefined> {
    const auth = read();
    if (!auth) return undefined;

    if (auth.expiresAt - EARLY_REFRESH_MS > Date.now()) return auth.accessToken;

    if (!auth.refreshToken || (auth.refreshExpiresAt ?? 0) < Date.now()) {
        write(undefined);
        return undefined;
    }

    try {
        return store(
            await post(`${config.broker.replace(/\/$/, "")}/refresh`, {
                refresh_token: auth.refreshToken,
            }),
        ).accessToken;
    } catch {
        // A refresh token GitHub will not honour is not worth keeping; leaving it would
        // make every later load retry the same rejected exchange.
        write(undefined);
        return undefined;
    }
}
