/** Shared by the editor and the setup page. Deliberately tiny: there is no framework here. */

export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function escape(text: string): string {
    return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** A centred message. `retry` adds a reload button for states that a reload can fix. */
export function panel(title: string, note: string, retry = false): void {
    $("app").innerHTML =
        `<div class="panel"><h1>${escape(title)}</h1><p class="note">${escape(note)}</p>` +
        (retry ? `<button class="primary" onclick="location.reload()">Try again</button>` : "") +
        `</div>`;
}
