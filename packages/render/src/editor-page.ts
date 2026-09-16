import { SITE_STYLE } from "./layout.ts";

const EDITOR_STYLE = `
body { margin:0; height:100vh; display:flex; flex-direction:column; }
.bar { display:flex; gap:12px; align-items:center; padding:10px 16px; border-bottom:1px solid var(--rule); flex:none; }
footer.bar { border-bottom:0; border-top:1px solid var(--rule); }
.bar > div:first-child { flex:1; min-width:0; }
.split { flex:1; display:grid; grid-template-columns:1fr 1fr; min-height:0; }
textarea {
  border:0; border-right:1px solid var(--rule); resize:none; padding:20px 22px;
  font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;
  background:var(--bg); color:var(--fg); outline:none; tab-size:2;
}
.preview { overflow:auto; padding:20px 26px; }
.preview :first-child { margin-top:0; }
input { flex:1; padding:7px 11px; border:1px solid var(--rule); border-radius:6px; background:var(--bg); color:var(--fg); font:inherit; font-size:14px; }
button { padding:7px 15px; border-radius:6px; border:1px solid var(--rule); background:var(--bg); color:var(--fg); font:inherit; font-size:14px; cursor:pointer; }
button.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
button:disabled { opacity:.55; cursor:default; }
.panel { max-width:56ch; margin:12vh auto; padding:0 24px; }
.panel h1 { font-size:20px; margin-top:0; }
.panel input { width:100%; margin:8px 0 12px; }
.note { color:var(--muted); font-size:13px; }
.provisional { border-left:3px solid var(--rule); padding-left:12px; }
.result { padding:12px 16px; border-top:1px solid var(--rule); font-size:14px; flex:none; }
.result.ok { background:color-mix(in srgb, var(--accent) 10%, transparent); }
.result.bad { background:color-mix(in srgb, #d33 12%, transparent); }
@media (max-width:860px) { .split { grid-template-columns:1fr; grid-template-rows:1fr 1fr; } textarea { border-right:0; border-bottom:1px solid var(--rule); } }
`;

/**
 * The shell the editor mounts into. Everything it needs beyond this arrives at runtime:
 * the manifest as a file, the document text from the repository. Nothing about a
 * particular document is baked in, so one page serves the whole site.
 */
export function editorPage(args: { siteTitle: string; bundlePath: string }): string {
    return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edit &middot; ${args.siteTitle.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)}</title>
<style>${SITE_STYLE}${EDITOR_STYLE}</style>
<div id="app"><div class="panel"><p class="note">Loading…</p></div></div>
<script type="module" src="${args.bundlePath}"></script>
`;
}
