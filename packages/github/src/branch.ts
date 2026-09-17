import { SubmitError } from "./errors.ts";
import type { PullRef, RepoApi } from "./repo.ts";

/** Git refs disallow a fair amount; ids are already slug-shaped, so this is a guard, not a transform. */
export function branchNameFor(id: string, attempt = 1): string {
    const slug =
        id
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^[-.]+|[-.]+$/g, "")
            .replace(/\.lock$/, "") || "document";
    return attempt === 1 ? `gitspec/${slug}` : `gitspec/${slug}-${attempt}`;
}

export interface ResolvedBranch {
    branch: string;
    /** Present when this id already has an open pull request, whose branch is reused. */
    pull?: PullRef;
}

/**
 * Decide which branch an id's next change belongs on.
 *
 * E-2/E-3: an open pull request for this id decides everything — its branch is reused and
 * a second pull request is never opened. A branch with no open pull request is spent (its
 * pull request was merged or closed); A-4 forbids forcing it back to base, so the next
 * change takes the next name and the old branch is left exactly as it was.
 *
 * Shared by document edits and by setup, so the two cannot disagree about where a change
 * goes — which is the same reason `loadForEdit` resolves through the same rule.
 */
export async function resolveBranch(repo: RepoApi, id: string, base: string): Promise<ResolvedBranch> {
    for (let attempt = 1; attempt <= 50; attempt++) {
        const candidate = branchNameFor(id, attempt);
        if (candidate === base) {
            throw new SubmitError("E-1", `the branch for \`${id}\` collides with the base branch`);
        }

        const open = await repo.findOpenPull(candidate);
        if (open) return { branch: candidate, pull: open };

        if ((await repo.getBranchSha(candidate)) === undefined) return { branch: candidate };
    }

    throw new SubmitError("E-2", `no free branch name for \`${id}\` after 50 attempts`);
}
