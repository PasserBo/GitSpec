// Bun bundles a file imported `with { type: "text" }` as a string. This lets the setup
// page carry examples/docs.yml verbatim, so the workflow we install is the one we document.
declare module "*.yml" {
    const text: string;
    export default text;
}
