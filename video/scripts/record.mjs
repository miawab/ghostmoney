// Records real footage of Ghost Money (python -m gm.server must be running) using the page's public sample.
// Every real row is blurred before it can reach the video.
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = new URL("../public/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const size = { width: 1920, height: 1080 };

function init() {
  const c = document.createElement("div");
  c.style.cssText = "position:fixed;z-index:99999;width:24px;height:24px;border-radius:50%;background:rgba(255,46,147,.95);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px";
  addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(c);
    document.documentElement.style.zoom = "1.25";
    const st = document.createElement("style");
    // a letter stays fully blurred until its names and numbers have been marked below
    st.textContent = ".nm,.facts dd,.gemma,.extra pre:not([data-marked]){filter:blur(9px)}";
    document.head.append(st);
    // the on-screen rule: no interpuncts
    const clean = (n) => {
      if (n.nodeType === 3) { if (n.data.includes("·")) n.data = n.data.replace(/\s*·\s*/g, ", "); } else n.childNodes.forEach(clean);
    };
    new MutationObserver((ms) => ms.forEach((m) => { m.addedNodes.forEach(clean); if (m.type === "characterData") clean(m.target); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
    clean(document.body);
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: size, recordVideo: { dir: OUT, size } });
await ctx.addInitScript(init);
const p = await ctx.newPage();
const t0 = Date.now();
const marks = {};
const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
const moveClick = async (l) => {
  const x = await l.boundingBox();
  await p.mouse.move(x.x + x.width / 2, x.y + x.height / 2, { steps: 20 });
  await pause(200);
  await p.mouse.down();
  await p.mouse.up();
};
const ur = {};
p.on("request", (r) => { if (r.url().endsWith("/api/voice")) ur.body = r.postDataJSON(); });

await p.goto("http://localhost:8000/");
await p.waitForFunction(() => document.getElementById("gemmaPill").classList.contains("on"), null, { timeout: 20000 }).catch(() => {});
await pause(800);
mark("home");
await pause(2500);
await p.evaluate(() => document.querySelector(".search").scrollIntoView({ block: "start" }));
await pause(600);
await moveClick(p.locator("#fName"));
await p.keyboard.type("Ghulam Rasool", { delay: 90 });
await pause(300);
await moveClick(p.locator("#fFather"));
await p.keyboard.type("Allah Ditta", { delay: 80 });
await pause(600);
await p.locator(".privacy").evaluate((e) => e.scrollIntoView({ block: "center" }));
await pause(300);
marks.privacyBox = await p.locator(".privacy").boundingBox();
mark("privacy");
await pause(3000);
mark("go");
await moveClick(p.locator("#goBtn"));
await pause(400);
await p.evaluate(() => document.getElementById("run").scrollIntoView({ block: "center" }));
await pause(100);
marks.runBox = await p.locator("#run").boundingBox();
await p.waitForFunction(() => !document.getElementById("results").hidden, null, { timeout: 400000 });
mark("results");
await pause(1500);
await p.evaluate(() => document.getElementById("summary").scrollIntoView({ block: "center" }));
await pause(800);
marks.summaryBox = await p.locator("#summary").boundingBox();
mark("summary");
await pause(5000);
// a card that names its branch
const card = p.locator("#cards .acct", { hasNot: p.locator(".where", { hasText: "branch not given" }) }).first();
await card.evaluate((e) => e.scrollIntoView({ block: "start" }));
await pause(800);
mark("card");
await moveClick(card.locator(".b-branch"));
await card.locator(".extra a").first().waitFor({ timeout: 40000 }).catch(() => {});
await pause(1500);
await card.evaluate((e) => e.querySelector(".extra").scrollIntoView({ block: "center" }));
await pause(2500);
mark("letterClick");
await moveClick(card.locator(".b-letter"));
await card.locator(".extra pre").waitFor({ timeout: 300000 });
// names and numbers in the letter are real row data: blur them in the same tick the letter is seen
await card.evaluate((e) => {
  const pre = e.querySelector(".extra pre");
  const nm = e.querySelector(".nm").textContent.trim();
  const fth = [...e.querySelectorAll(".facts div")].find((d) => /father/i.test(d.innerText))?.querySelector("dd")?.textContent.trim().split(" ").slice(-2).join(" ");
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blur = (m) => `<span style="filter:blur(8px)">${m}</span>`;
  let h = pre.textContent.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  [nm, fth].filter(Boolean).forEach((x) => { h = h.replace(new RegExp(esc(x), "gi"), blur); });
  h = h.replace(/(Rs\.?\s*)?\d[\d,./-]{2,}/g, blur);
  pre.innerHTML = h;
  pre.dataset.marked = "1";
  pre.scrollIntoView({ block: "center" });
});
await pause(300);
mark("letter");
await pause(4500);
await p.evaluate(() => document.getElementById("summary").scrollIntoView({ block: "center" }));
await pause(800);
marks.listenBox = await p.locator('#summary [data-lang="ur"]').boundingBox();
mark("listen");
await moveClick(p.locator('#summary [data-lang="ur"]'));
await pause(9000);
mark("end");
const v = p.video();
await ctx.close();
await b.close();
fs.renameSync(await v.path(), OUT + "footage.webm");
fs.writeFileSync(OUT + "marks.json", JSON.stringify(marks, null, 1));
fs.writeFileSync(OUT + "ur.json", JSON.stringify(ur.body));
// the Urdu audio itself: curl -X POST localhost:8000/api/voice with this same body, to public/ur.mp3
console.log(JSON.stringify(marks), JSON.stringify(ur.body));
