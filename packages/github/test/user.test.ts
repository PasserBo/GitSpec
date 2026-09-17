import { describe, expect, test } from "bun:test";
import { restUser, SubmitError } from "../src/index.ts";

/** Routes by path suffix; records the URLs asked for. */
function fakeGitHub(routes: Record<string, unknown>, status = 200) {
    const asked: string[] = [];
    const impl = (async (url: string | URL | Request) => {
        const path = new URL(String(url)).pathname;
        asked.push(path);
        const hit = Object.entries(routes).find(([suffix]) => path.endsWith(suffix));
        return new Response(JSON.stringify(hit?.[1] ?? { message: "Not Found" }), {
            status: hit ? status : 404,
            headers: { "content-type": "application/json" },
        });
    }) as unknown as typeof fetch;
    return { impl, asked };
}

describe("installations", () => {
    test("returns the app installations this person can reach", async () => {
        const github = fakeGitHub({
            "/user/installations": {
                installations: [
                    { id: 11, account: { login: "PasserBo" } },
                    { id: 22, account: { login: "some-org" } },
                ],
            },
        });
        const user = restUser({ token: "t", fetch: github.impl });

        expect(await user.installations()).toEqual([
            { id: 11, account: "PasserBo" },
            { id: 22, account: "some-org" },
        ]);
        expect(github.asked[0]).toBe("/user/installations");
    });

    test("none installed is an empty list, not an error", async () => {
        const github = fakeGitHub({ "/user/installations": { installations: [] } });
        expect(await restUser({ token: "t", fetch: github.impl }).installations()).toEqual([]);
    });
});

describe("O-5: only repositories the person can push to are offered", () => {
    test("canPush comes from the person's own permission on each repository", async () => {
        const github = fakeGitHub({
            "/user/installations/11/repositories": {
                repositories: [
                    {
                        name: "mine",
                        owner: { login: "PasserBo" },
                        default_branch: "main",
                        private: false,
                        permissions: { admin: true, push: true, pull: true },
                    },
                    {
                        name: "read-only",
                        owner: { login: "some-org" },
                        default_branch: "develop",
                        private: true,
                        permissions: { admin: false, push: false, pull: true },
                    },
                    {
                        name: "no-permissions-field",
                        owner: { login: "some-org" },
                        default_branch: "main",
                        private: false,
                    },
                ],
            },
        });
        const repos = await restUser({ token: "t", fetch: github.impl }).installationRepositories(11);

        expect(repos).toEqual([
            { owner: "PasserBo", name: "mine", defaultBranch: "main", canPush: true, private: false },
            { owner: "some-org", name: "read-only", defaultBranch: "develop", canPush: false, private: true },
            // Absent permissions are not assumed to be write access.
            { owner: "some-org", name: "no-permissions-field", defaultBranch: "main", canPush: false, private: false },
        ]);
    });

    test("the default branch is carried through, so setup proposes against the right one", async () => {
        const github = fakeGitHub({
            "/user/installations/11/repositories": {
                repositories: [
                    { name: "r", owner: { login: "o" }, default_branch: "trunk", private: false, permissions: { push: true } },
                ],
            },
        });
        const [repo] = await restUser({ token: "t", fetch: github.impl }).installationRepositories(11);
        expect(repo!.defaultBranch).toBe("trunk");
    });
});

describe("failures", () => {
    test("a rejected token is reported as an auth failure, not swallowed", async () => {
        const github = fakeGitHub({ "/user/installations": { message: "Bad credentials" } }, 401);
        const error = (await restUser({ token: "bad", fetch: github.impl }).installations().catch((e) => e)) as SubmitError;
        expect(error).toBeInstanceOf(SubmitError);
        expect(error.rule).toBe("E-4");
        expect(error.message).toContain("401");
    });
});
