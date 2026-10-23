// Talk to a local `codex app-server` over stdio (uses the current CODEX_HOME).
// usage: node codex-appserver.mjs '<json array of [method, params]>'  -> prints results
import { spawn } from "node:child_process";
const calls = JSON.parse(process.argv[2]);
const child = spawn("codex", ["app-server"], { stdio: ["pipe", "pipe", "inherit"] });
let buf = ""; const pending = new Map(); let id = 0;
child.stdout.on("data", (d) => {
  buf += d; let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const req = (method, params) => new Promise((res) => { const myId = ++id; pending.set(myId, res); child.stdin.write(JSON.stringify({ id: myId, method, params }) + "\n"); });
const t = setTimeout(() => { console.error("timeout"); child.kill(); process.exit(1); }, 60000);
const init = await req("initialize", { clientInfo: { name: "client-workspace-setup", version: "0.0.1" }, capabilities: { experimentalApi: true } });
if (init.error) { console.log(JSON.stringify(init.error)); process.exit(1); }
child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
for (const [method, params] of calls) {
  const r = await req(method, params);
  console.log(JSON.stringify({ method, result: r.result, error: r.error }));
}
clearTimeout(t); child.stdin.end(); child.kill(); process.exit(0);
