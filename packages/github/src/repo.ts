export interface PullRef {
    number: number;
    url: string;
}

export interface FileContent {
    /** Blob sha of the file as it exists on the ref that was read. */
    sha: string;
    text: string;
}

export interface PutFileArgs {
    path: string;
    branch: string;
    message: string;
    contents: string;
    /** Blob sha being replaced. Omitted when the file does not yet exist on the branch. */
    sha?: string;
}

/**
 * The repository operations an edit needs, and no more.
 *
 * Deliberately narrow, and deliberately missing two things it could have: there is no
 * merge (A-3) and no force-push (A-4). A capability that is absent from the port cannot
 * be reached for later under deadline.
 */
export interface RepoApi {
    /** Commit sha at the tip of a branch, or undefined when the branch does not exist. */
    getBranchSha(branch: string): Promise<string | undefined>;
    createBranch(branch: string, fromSha: string): Promise<void>;
    getFile(path: string, ref: string): Promise<FileContent | undefined>;
    /** Entry names directly under a directory, or undefined when there is no such directory. */
    listDirectory(path: string, ref: string): Promise<string[] | undefined>;
    putFile(args: PutFileArgs): Promise<void>;
    findOpenPull(headBranch: string): Promise<PullRef | undefined>;
    createPull(args: { head: string; base: string; title: string; body: string }): Promise<PullRef>;
}
