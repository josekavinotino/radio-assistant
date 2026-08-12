const { spawnSync } = require("child_process");
const fs = require("fs");

const opts = {
  encoding: "utf8",
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
};

const l = spawnSync("npx.cmd eslint app/page.tsx", opts);
const t = spawnSync("npx.cmd tsc --noEmit", opts);

let out = `ESLINT:${l.status === 0 ? "OK" : `FAIL(${l.status})`}\n`;
out += `TSC:${t.status === 0 ? "OK" : `FAIL(${t.status})`}\n`;

if (l.status !== 0 && l.stderr) out += `[ESLINT_STDERR]\n${l.stderr}\n`;
if (l.status !== 0 && l.stdout) out += `[ESLINT_STDOUT]\n${l.stdout}\n`;
if (t.status !== 0 && t.stderr) out += `[TSC_STDERR]\n${t.stderr}\n`;
if (t.status !== 0 && t.stdout) out += `[TSC_STDOUT]\n${t.stdout}\n`;

fs.writeFileSync("verify-page.txt", out);