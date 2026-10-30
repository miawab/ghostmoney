// Writes public/vo/durations.json from the audio files (Remotion needs the lengths up front).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const out = {};
const len = (file) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
for (const f of fs.readdirSync("public/vo")) {
  if (f.endsWith(".mp3")) out[f.replace(".mp3", "")] = len(`public/vo/${f}`);
}
if (fs.existsSync("public/ur.mp3")) out.ur = len("public/ur.mp3");
fs.writeFileSync("public/vo/durations.json", JSON.stringify(out, null, 1));
console.log(out);
