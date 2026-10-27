#!/usr/bin/env bun
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    checkRepository,
    discover,
    DiscoveryError,
    parseConfig,
    sortFindings,
    type Finding,
} from "@gitspec/core";

/**
 * `gitspec check` — the rules of the format, run before anyone has to review them.
 *
 * This exists because of who writes documentation now. An agent given a repository can
 * already create `docs/something.md`; what it could not do was find out whether what it
 * wrote was right. The only feedback was a person reading a pull request, which arrives
 * hours later and costs the one thing a small team has least of.
 *
 * So the loop closes here: write, check, fix, commit. The same command runs in CI, and
 * the same rules run in the editor for whoever is editing by hand — one definition, three
 * places, because three definitions would disagree inside a month.
 *
 * It reports and exits; it does not rewrite anything. What a report should stop is the
 * repository's own decision, made through branch protection rather than by this tool.
 */

function flag(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const has = (name: string) => process.argv.includes(`--${name}`);

const root = resolve(flag("root", "."));
const configPath = resolve(root, flag("config", "gitspec.yaml"));

/** Every file in the repository, so a link can be told from a link to nothing. */
async function allFiles(from: string): Promise<Set<string>> {
    const skip = new Set([".git", "node_modules", "_site", ".next", "dist", "build", "vendor"]);
    const files = new Set<string>();
    async function walk(rel: string): Promise<void> {
        for (const entry of await readdir(join(from, rel), { withFileTypes: true })) {
            const child = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (!skip.has(entry.name)) await walk(child);
            } else if (entry.isFile()) {
                files.add(child);
            }
        }
    }
    await walk("");
    return files;
}

function human(findings: Finding[], documents: number): string {
    if (findings.length === 0) {
        return `${documents} document${documents === 1 ? "" : "s"} checked, nothing to report.`;
    }
    const lines: string[] = [];
    let current = "";
    for (const finding of findings) {
        if (finding.path !== current) {
            current = finding.path;
            lines.push("", current);
        }
        const where = finding.line ? `:${finding.line}` : "";
        const mark = finding.severity === "error" ? "error" : "warn ";
        lines.push(`  ${mark} ${current}${where}  [${finding.rule}] ${finding.message}`);
    }
    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.length - errors;
    lines.push(
        "",
        `${documents} document${documents === 1 ? "" : "s"} checked: ${errors} error${errors === 1 ? "" : "s"}, ` +
            `${warnings} warning${warnings === 1 ? "" : "s"}.`,
    );
    return lines.join("\n").replace(/^\n/, "");
}

try {
    const config = parseConfig(await readFile(configPath, "utf8"));
    const discovery = await discover(root, config);

    const documents = [];
    for (const space of discovery.spaces) {
        for (const document of space.documents) {
            documents.push({ document, source: await readFile(join(root, document.path), "utf8") });
        }
    }

    const findings = sortFindings(
        checkRepository({ documents, files: await allFiles(root) }),
    );
    const errors = findings.filter((f) => f.severity === "error").length;

    if (has("json")) {
        // The shape an agent reads. Stable on purpose: it is an interface, not a log.
        console.log(
            JSON.stringify({ documents: documents.length, errors, warnings: findings.length - errors, findings }, null, 2),
        );
    } else {
        console.log(human(findings, documents.length));
    }

    // Warnings alone do not fail: a link to a file someone has not written yet is a
    // normal state for a document that is ahead of the code it describes.
    process.exit(errors > 0 ? 1 : 0);
} catch (error) {
    const message = error instanceof DiscoveryError ? error.message : String(error);
    if (has("json")) console.log(JSON.stringify({ error: message }, null, 2));
    else console.error(message);
    process.exit(2);
}
