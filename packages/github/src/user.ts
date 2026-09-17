import { SubmitError } from "./errors.ts";

export interface Installation {
    id: number;
    /** The user or organisation the app is installed on. */
    account: string;
}

export interface AccessibleRepository {
    owner: string;
    name: string;
    defaultBranch: string;
    /** Whether the signed-in person can push. Setup offers only these. */
    canPush: boolean;
    private: boolean;
}

export interface UserApi {
    /** Installations of the app that this person has access to. */
    installations(): Promise<Installation[]>;
    /** Repositories under one installation that this person can see, with their own access level. */
    installationRepositories(installationId: number): Promise<AccessibleRepository[]>;
}

export interface RestUserOptions {
    token: string;
    apiBase?: string;
    fetch?: typeof globalThis.fetch;
}

/**
 * The user-scoped half of the API: what the signed-in person can reach through the app.
 *
 * Kept apart from `restRepo` on purpose. `RepoApi` is the write surface for one
 * repository and is deliberately narrow; these are read-only questions about the person,
 * asked once, before a repository has been chosen.
 *
 * GitHub answers them from the intersection of the app's installations and the person's
 * own access, which is exactly the set setup should offer — nothing the app cannot reach,
 * nothing the person could not have pushed to anyway.
 */
export function restUser(options: RestUserOptions): UserApi {
    const api = options.apiBase ?? "https://api.github.com";
    const doFetch = options.fetch ?? globalThis.fetch;

    async function get<T>(path: string, what: string): Promise<T> {
        const response = await doFetch(`${api}${path}`, {
            headers: {
                accept: "application/vnd.github+json",
                authorization: `Bearer ${options.token}`,
                "x-github-api-version": "2022-11-28",
            },
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new SubmitError("E-4", `${what} failed (${response.status}): ${detail.slice(0, 300)}`);
        }
        return (await response.json()) as T;
    }

    return {
        async installations() {
            const data = await get<{ installations: { id: number; account: { login: string } }[] }>(
                "/user/installations?per_page=100",
                "listing app installations",
            );
            return data.installations.map((i) => ({ id: i.id, account: i.account.login }));
        },

        async installationRepositories(installationId) {
            const data = await get<{
                repositories: {
                    name: string;
                    owner: { login: string };
                    default_branch: string;
                    private: boolean;
                    permissions?: { push?: boolean };
                }[];
            }>(
                `/user/installations/${installationId}/repositories?per_page=100`,
                "listing repositories for an installation",
            );
            return data.repositories.map((r) => ({
                owner: r.owner.login,
                name: r.name,
                defaultBranch: r.default_branch,
                canPush: r.permissions?.push === true,
                private: r.private,
            }));
        },
    };
}
