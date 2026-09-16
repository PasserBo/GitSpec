import { describe, expect, test } from "bun:test";
import { handleBroker, type BrokerEnv } from "../src/broker.ts";

const ENV: BrokerEnv = {
    GITHUB_CLIENT_ID: "Iv23liEXAMPLE",
    GITHUB_CLIENT_SECRET: "secret",
    ALLOWED_ORIGINS: "https://passerbo.github.io,http://localhost:4321",
};

const ORIGIN = "https://passerbo.github.io";

/** Records what reached GitHub, so a test can assert the secret never leaves here another way. */
function fakeGitHub(response: unknown, status = 200) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(response), {
            status,
            headers: { "content-type": "application/json" },
        });
    }) as unknown as typeof fetch;
    return { impl, calls };
}

const post = (path: string, body: unknown, origin = ORIGIN) =>
    new Request(`https://broker.example${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify(body),
    });

describe("origin handling", () => {
    test("a preflight from an allowed origin is answered", async () => {
        const response = await handleBroker(
            new Request("https://broker.example/token", { method: "OPTIONS", headers: { origin: ORIGIN } }),
            ENV,
        );
        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    });

    // Refused here rather than relying on the browser to enforce a missing CORS header:
    // a non-browser caller would not be stopped by that at all.
    test("an unknown origin is refused outright", async () => {
        const github = fakeGitHub({ access_token: "t" });
        const response = await handleBroker(
            post("/token", { code: "abc" }, "https://evil.example"),
            ENV,
            github.impl,
        );
        expect(response.status).toBe(403);
        expect(github.calls).toHaveLength(0);
    });
});

describe("POST /token", () => {
    test("the code is exchanged and the grant returned", async () => {
        const github = fakeGitHub({
            access_token: "gho_x",
            expires_in: 28800,
            refresh_token: "ghr_y",
            refresh_token_expires_in: 15811200,
        });
        const response = await handleBroker(post("/token", { code: "abc" }), ENV, github.impl);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ access_token: "gho_x", refresh_token: "ghr_y" });
        expect(github.calls[0]!.url).toBe("https://github.com/login/oauth/access_token");
        expect(github.calls[0]!.body).toMatchObject({
            client_id: ENV.GITHUB_CLIENT_ID,
            client_secret: ENV.GITHUB_CLIENT_SECRET,
            code: "abc",
            grant_type: "authorization_code",
        });
    });

    test("a missing code never reaches GitHub", async () => {
        const github = fakeGitHub({});
        const response = await handleBroker(post("/token", {}), ENV, github.impl);
        expect(response.status).toBe(400);
        expect(github.calls).toHaveLength(0);
    });

    // GitHub answers 200 with an `error` field for a rejected grant. Passing that through
    // as success would leave the editor waiting for a token that is never coming.
    test("a rejected grant returned as 200 becomes an error", async () => {
        const github = fakeGitHub({ error: "bad_verification_code" });
        const response = await handleBroker(post("/token", { code: "stale" }), ENV, github.impl);

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: "bad_verification_code" });
    });
});

describe("POST /refresh", () => {
    test("the refresh token is exchanged", async () => {
        const github = fakeGitHub({ access_token: "gho_new", expires_in: 28800 });
        const response = await handleBroker(post("/refresh", { refresh_token: "ghr_y" }), ENV, github.impl);

        expect(response.status).toBe(200);
        expect(github.calls[0]!.body).toMatchObject({
            refresh_token: "ghr_y",
            grant_type: "refresh_token",
        });
    });

    test("a missing refresh token never reaches GitHub", async () => {
        const github = fakeGitHub({});
        expect((await handleBroker(post("/refresh", {}), ENV, github.impl)).status).toBe(400);
        expect(github.calls).toHaveLength(0);
    });
});

describe("refusals", () => {
    test.each([
        ["GET", 405],
        ["PUT", 405],
    ])("%s is not allowed (%p)", async (method, status) => {
        const response = await handleBroker(
            new Request("https://broker.example/token", { method, headers: { origin: ORIGIN } }),
            ENV,
        );
        expect(response.status).toBe(status);
    });

    test("an unknown path is a 404", async () => {
        expect((await handleBroker(post("/anything", { code: "a" }), ENV, fakeGitHub({}).impl)).status).toBe(404);
    });

    // Without this the broker would forward an empty client_secret and surface GitHub's
    // confusing answer as though the user had done something wrong.
    test("a missing secret is reported as the broker's own fault", async () => {
        const github = fakeGitHub({});
        const response = await handleBroker(
            post("/token", { code: "abc" }),
            { ...ENV, GITHUB_CLIENT_SECRET: "" },
            github.impl,
        );
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ error: "broker_not_configured" });
        expect(github.calls).toHaveLength(0);
    });
});

describe("caching", () => {
    test("a grant is never cacheable", async () => {
        const response = await handleBroker(
            post("/token", { code: "abc" }),
            ENV,
            fakeGitHub({ access_token: "gho_x" }).impl,
        );
        expect(response.headers.get("cache-control")).toBe("no-store");
    });
});
