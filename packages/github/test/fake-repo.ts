import type { PutFileArgs, RepoApi } from "../src/index.ts";

/**
 * An in-memory repository. Records every write so a test can assert not only what
 * happened but what did not — which is most of what this design promises.
 */
export class FakeRepo implements RepoApi {
    branches = new Map<string, string>([["main", "base-sha"]]);
    files = new Map<string, { sha: string; text: string }>();
    pulls: { number: number; url: string; head: string; open: boolean }[] = [];
    commits: { branch: string; path: string; message: string; sha?: string }[] = [];
    private nextPull = 1;

    /** Seed a file on a ref. */
    seed(ref: string, path: string, text: string): void {
        this.files.set(`${ref}:${path}`, { sha: `seed-${path}`, text });
    }

    async getBranchSha(branch: string) {
        return this.branches.get(branch);
    }

    async createBranch(branch: string, fromSha: string) {
        if (this.branches.has(branch)) throw new Error(`branch ${branch} already exists`);
        this.branches.set(branch, fromSha);
        // A new branch sees everything its base saw.
        const base = [...this.branches.entries()].find(([, sha]) => sha === fromSha)?.[0];
        if (base) {
            for (const [key, value] of [...this.files]) {
                if (key.startsWith(`${base}:`)) {
                    this.files.set(`${branch}:${key.slice(base.length + 1)}`, value);
                }
            }
        }
    }

    async getFile(path: string, ref: string) {
        return this.files.get(`${ref}:${path}`);
    }

    async listDirectory(path: string, ref: string) {
        const prefix = `${ref}:${path.replace(/\/$/, "")}/`;
        const names = [...this.files.keys()]
            .filter((key) => key.startsWith(prefix))
            .map((key) => key.slice(prefix.length).split("/")[0]!);
        return names.length ? [...new Set(names)] : undefined;
    }

    async putFile(args: PutFileArgs) {
        this.commits.push({ branch: args.branch, path: args.path, message: args.message, sha: args.sha });
        this.files.set(`${args.branch}:${args.path}`, {
            sha: `sha-${this.commits.length}`,
            text:
                typeof args.contents === "string"
                    ? args.contents
                    : new TextDecoder().decode(args.contents),
        });
        this.branches.set(args.branch, `commit-${this.commits.length}`);
    }

    async findOpenPull(headBranch: string) {
        const found = this.pulls.find((p) => p.head === headBranch && p.open);
        return found ? { number: found.number, url: found.url } : undefined;
    }

    async createPull(args: { head: string; base: string; title: string; body: string }) {
        const pull = {
            number: this.nextPull++,
            url: `https://example.test/pull/${this.nextPull - 1}`,
            head: args.head,
            open: true,
        };
        this.pulls.push(pull);
        return { number: pull.number, url: pull.url };
    }
}
