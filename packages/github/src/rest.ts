import { SubmitError } from "./errors.ts";
import type { FileContent, PullRef, PutFileArgs, RepoApi } from "./repo.ts";

export interface RestRepoOptions {
    owner: string;
    repo: string;
    /**
     * A token belonging to the signed-in person. Every write below is attributed to
     * whoever it belongs to, which is E-4: an edit is never a bot's.
     */
    token: string;
    apiBase?: string;
    fetch?: typeof globalThis.fetch;
}

/**
 * Base64 for the Contents API, in chunks.
 *
 * The obvious `String.fromCharCode(...bytes)` passes every byte as a separate argument and
 * throws `RangeError` somewhere around 100 kB in a browser — which is small enough that a
 * screenshot reaches it, and large enough that no document ever did.
 */
const BASE64_CHUNK = 0x8000;

function toBase64(contents: string | Uint8Array): string {
    const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
    let binary = "";
    for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
    }
    return btoa(binary);
}

/** GitHub's REST API, reached directly from wherever the token already is. */
export function restRepo(options: RestRepoOptions): RepoApi {
    const api = options.apiBase ?? "https://api.github.com";
    const doFetch = options.fetch ?? globalThis.fetch;
    const root = `${api}/repos/${options.owner}/${options.repo}`;

    async function call(method: string, path: string, body?: unknown): Promise<Response> {
        return doFetch(`${root}${path}`, {
            method,
            headers: {
                accept: "application/vnd.github+json",
                authorization: `Bearer ${options.token}`,
                "x-github-api-version": "2022-11-28",
                ...(body ? { "content-type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    }

    async function expectOk(response: Response, what: string): Promise<unknown> {
        if (response.ok) return response.json();
        const detail = await response.text().catch(() => "");

        // GitHub answers a missing app permission with "Resource not accessible by
        // integration", which names neither the permission nor the app. Every adopter
        // meets this once, and the raw message sends them looking in the wrong place —
        // usually at their own account's access rather than at the app's grant.
        if (response.status === 403 && detail.includes("not accessible by integration")) {
            throw new SubmitError(
                "E-4",
                `${what} was refused: the GitHub App lacks write access to this repository. ` +
                    `Set Contents and Pull requests to "Read and write" in the app's permissions, ` +
                    `then accept the updated permissions on the installation — a change to an app's ` +
                    `permissions does not reach an existing installation until it is approved.`,
            );
        }

        throw new SubmitError("C-2", `${what} failed (${response.status}): ${detail.slice(0, 400)}`);
    }

    return {
        async getBranchSha(branch) {
            const response = await call("GET", `/git/ref/heads/${encodeURIComponent(branch)}`);
            if (response.status === 404) return undefined;
            const data = (await expectOk(response, `reading branch \`${branch}\``)) as {
                object: { sha: string };
            };
            return data.object.sha;
        },

        async createBranch(branch, fromSha) {
            const response = await call("POST", "/git/refs", {
                ref: `refs/heads/${branch}`,
                sha: fromSha,
            });
            await expectOk(response, `creating branch \`${branch}\``);
        },

        async getFile(path, ref): Promise<FileContent | undefined> {
            const response = await call(
                "GET",
                `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
            );
            if (response.status === 404) return undefined;
            const data = (await expectOk(response, `reading \`${path}\``)) as {
                sha: string;
                content?: string;
                encoding?: string;
            };
            // R-6. GitHub answers a file over 1 MB with `encoding: "none"` and no content.
            // Reading that as "" is how a document merely too big to read becomes an empty
            // file on the next save: the editor shows nothing, and the author saves nothing
            // over it.
            if (data.encoding !== "base64") {
                throw new SubmitError(
                    "R-6",
                    `\`${path}\` cannot be read through the Contents API: GitHub reported encoding ` +
                        `\`${data.encoding ?? "none"}\`, which is what it answers for a file over 1 MB. ` +
                        `A file that large has to be edited in git.`,
                );
            }
            // An empty file is base64 with empty content, and is genuinely empty.
            const text = new TextDecoder().decode(
                Uint8Array.from(atob((data.content ?? "").replace(/\n/g, "")), (c) => c.charCodeAt(0)),
            );
            return { sha: data.sha, text };
        },

        async listDirectory(path, ref) {
            const response = await call(
                "GET",
                `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
            );
            if (response.status === 404) return undefined;
            const data = (await expectOk(response, `listing \`${path}\``)) as unknown;
            // A file at that path answers with an object, not an array: not a directory.
            return Array.isArray(data) ? (data as { name: string }[]).map((e) => e.name) : undefined;
        },

        async putFile(args: PutFileArgs) {
            const encoded = toBase64(args.contents);
            const response = await call(
                "PUT",
                `/contents/${args.path.split("/").map(encodeURIComponent).join("/")}`,
                {
                    message: args.message,
                    content: encoded,
                    branch: args.branch,
                    ...(args.sha ? { sha: args.sha } : {}),
                },
            );

            // C-2: a 409 means the branch moved between the read and the write. The edit
            // is reported and left alone — retrying with force is the one repair this
            // design refuses to make.
            if (response.status === 409) {
                throw new SubmitError(
                    "C-2",
                    `\`${args.branch}\` moved while the edit was being written; nothing was committed`,
                );
            }
            await expectOk(response, `writing \`${args.path}\``);
        },

        async findOpenPull(headBranch): Promise<PullRef | undefined> {
            const head = `${options.owner}:${headBranch}`;
            const response = await call(
                "GET",
                `/pulls?state=open&head=${encodeURIComponent(head)}&per_page=1`,
            );
            const data = (await expectOk(response, `looking for a pull request on \`${headBranch}\``)) as {
                number: number;
                html_url: string;
            }[];
            const first = data[0];
            return first ? { number: first.number, url: first.html_url } : undefined;
        },

        async createPull(args): Promise<PullRef> {
            const response = await call("POST", "/pulls", args);
            const data = (await expectOk(response, "opening a pull request")) as {
                number: number;
                html_url: string;
            };
            return { number: data.number, url: data.html_url };
        },
    };
}
