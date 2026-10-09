// Stand-in for `codex exec` in tests. Reads the prompt from stdin and writes {"html": ...}
// (or {"transcript": ...} when given the transcript schema) to the -o file. FAKE_CODEX_MODE:
// "edit" (default) marks the fragment, "login" fails like a logged-out CLI, "error" fails generically.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const mode = process.env.FAKE_CODEX_MODE || "edit";
if (mode === "login") {
  process.stderr.write("Error: Not logged in. Run `codex login`.\n");
  process.exit(1);
}
if (mode === "error") {
  process.stderr.write("Error: model overloaded\n");
  process.exit(2);
}
const prompt = readFileSync(0, "utf8");
const fragment = prompt.split("Fragment to rewrite:\n")[1] || "";
const html = fragment.trim().replace(/<\/(p|h2|h3|li)>/, " (edited)</$1>");
if (process.env.FAKE_CODEX_LOG) writeFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ args, prompt }));
const schema = args[args.indexOf("--output-schema") + 1] || "";
const content = (prompt.split("<content>\n")[1] || "").split("\n</content>")[0];
writeFileSync(args[args.indexOf("-o") + 1], JSON.stringify(schema.endsWith("transcript.schema.json") ? { transcript: `Spoken: ${content}` } : { html }));
process.stdout.write(`${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } })}\n`);
