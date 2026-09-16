import { loadForEdit, restRepo, submitEdit, SubmitError, type PullRef } from "@gitspec/github";
import { renderMarkdown, stripFrontmatter, withBase } from "@gitspec/render";
import type { SiteManifest } from "@gitspec/render";

/**
 * The editor. A static page that talks to GitHub with the reader's own token and to
 * nothing else — there is no GitSpec service in this path, which is what lets a private
 * repository use it (B-1).
 *
 * It edits Markdown source rather than offering a rich-text surface. A round-tripping
 * WYSIWYG rewrites files it did not need to touch, and the resulting churn is exactly
 * what makes a repository hostile to both review and agents. The live preview is meant
 * to carry the weight instead.
 */

const TOKEN_KEY = "gitspec:token";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function escape(text: string): string {
    return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function loadManifest(): Promise<SiteManifest> {
    // The editor page lives at <base>/_edit/, so the manifest is one level up.
    const response = await fetch("../_gitspec/manifest.json");
    if (!response.ok) throw new Error(`manifest unavailable (${response.status})`);
    return response.json();
}

function tokenScreen(onToken: (token: string) => void): void {
    $("app").innerHTML = `
<div class="panel">
  <h1>Sign in to edit</h1>
  <p class="note">
    GitSpec commits as you, so it needs a token that belongs to you. Paste a GitHub
    personal access token with <code>repo</code> access. It is kept in this browser's
    local storage and sent only to github.com — never to any GitSpec service.
  </p>
  <p class="note provisional">
    Pasting a token is temporary scaffolding. Sign-in will replace it, at which point
    this screen goes away and no token is ever handled by hand.
  </p>
  <input id="token" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false">
  <button id="save" class="primary">Continue</button>
</div>`;

    const input = $<HTMLInputElement>("token");
    const submit = () => {
        const value = input.value.trim();
        if (!value) return;
        localStorage.setItem(TOKEN_KEY, value);
        onToken(value);
    };
    $("save").addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key === "Enter") submit();
    });
    input.focus();
}

function editorScreen(args: {
    manifest: SiteManifest;
    document: SiteManifest["documents"][number];
    source: string;
    ref: string;
    pull?: PullRef;
    onSubmit: (contents: string, summary: string) => Promise<void>;
}): void {
    const { manifest, document: doc, source, ref, pull } = args;

    const where = pull
        ? `continuing <a href="${escape(pull.url)}" target="_blank" rel="noopener">pull request #${pull.number}</a>`
        : `proposing against <code>${escape(ref)}</code>`;

    $("app").innerHTML = `
<header class="bar">
  <div>
    <strong>${escape(doc.title)}</strong>
    <span class="note"> &middot; ${escape(doc.path)}</span>
  </div>
  <div class="note">${where}</div>
</header>
<div class="split">
  <textarea id="source" spellcheck="false"></textarea>
  <article id="preview" class="preview"></article>
</div>
<footer class="bar">
  <input id="summary" placeholder="What changed, and why (optional)">
  <button id="submit" class="primary">Propose change</button>
  <a class="note" href="${escape(withBase(manifest.base, doc.address))}">Cancel</a>
</footer>
<div id="result"></div>`;

    const textarea = $<HTMLTextAreaElement>("source");
    const preview = $("preview");
    textarea.value = source;

    const lookup = (path: string) => manifest.documents.find((d) => d.path === path)?.address;

    let pending = 0;
    const refresh = async () => {
        const mine = ++pending;
        const html = await renderMarkdown(
            { kind: doc.kind, address: doc.address, id: doc.id, idDerived: false, path: doc.path, spaceKey: doc.spaceKey, frontmatter: {} },
            stripFrontmatter(textarea.value),
            lookup,
            manifest.base,
        );
        if (mine === pending) preview.innerHTML = html;
    };

    textarea.addEventListener("input", () => void refresh());
    void refresh();

    $("submit").addEventListener("click", async () => {
        const button = $<HTMLButtonElement>("submit");
        button.disabled = true;
        button.textContent = "Proposing…";
        try {
            await args.onSubmit(textarea.value, $<HTMLInputElement>("summary").value);
        } finally {
            button.disabled = false;
            button.textContent = "Propose change";
        }
    });
}

function report(html: string, kind: "ok" | "bad"): void {
    $("result").innerHTML = `<div class="result ${kind}">${html}</div>`;
}

async function main(): Promise<void> {
    const manifest = await loadManifest();
    const id = new URLSearchParams(location.search).get("doc");
    const doc = manifest.documents.find((d) => d.id === id);

    if (!doc) {
        $("app").innerHTML = `<div class="panel"><h1>Nothing to edit</h1><p class="note">No document with id <code>${escape(id ?? "")}</code> is part of this site.</p></div>`;
        return;
    }
    if (!manifest.repository) {
        $("app").innerHTML = `<div class="panel"><h1>Editing is not configured</h1><p class="note">This site was built without repository details, so an edit has nowhere to go. Set <code>repository</code> in <code>gitspec.yaml</code>, or pass it to the action.</p></div>`;
        return;
    }

    const start = async (token: string) => {
        const repository = manifest.repository!;
        const repo = restRepo({ owner: repository.owner, repo: repository.name, token });

        let loaded;
        try {
            loaded = await loadForEdit(repo, { documentId: doc.id, path: doc.path, base: repository.branch });
        } catch (error) {
            // A bad token is the overwhelmingly likely cause, and leaving a stale one in
            // storage would lock the editor into a loop it cannot explain.
            localStorage.removeItem(TOKEN_KEY);
            $("app").innerHTML = `<div class="panel"><h1>Could not open the document</h1><p class="note">${escape(String(error))}</p><button class="primary" onclick="location.reload()">Try again</button></div>`;
            return;
        }

        editorScreen({
            manifest,
            document: doc,
            source: loaded.contents,
            ref: loaded.ref,
            pull: loaded.pull,
            onSubmit: async (contents, summary) => {
                try {
                    const result = await submitEdit(repo, {
                        documentId: doc.id,
                        path: doc.path,
                        contents,
                        base: repository.branch,
                        title: doc.title,
                        summary,
                    });
                    report(
                        `${result.created ? "Opened" : "Added to"} <a href="${escape(result.pull.url)}" target="_blank" rel="noopener">pull request #${result.pull.number}</a>. ` +
                            `It becomes part of the document when it is merged.`,
                        "ok",
                    );
                } catch (error) {
                    const message = error instanceof SubmitError ? error.message : String(error);
                    report(escape(message), "bad");
                }
            },
        });
    };

    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) await start(existing);
    else tokenScreen((token) => void start(token));
}

void main().catch((error) => {
    $("app").innerHTML = `<div class="panel"><h1>Editor failed to start</h1><p class="note">${escape(String(error))}</p></div>`;
});
