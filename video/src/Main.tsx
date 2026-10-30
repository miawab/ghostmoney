import React, { useState } from "react";
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import "@fontsource/chango";
import "@fontsource/noto-nastaliq-urdu";
import lines from "../public/vo/lines.json";
import VO from "../public/vo/durations.json";
import marks from "../public/marks.json";
import urInfo from "../public/ur.json";

// Colours from the Ghost Money page itself.
const NIGHT = "#140a3a";
const CARD = "#2a1468";
const PAPER = "#fff3d6";
const MARIGOLD = "#ff9f1c";
const GOLD = "#ffd166";
const ROSE = "#ff2e93";
const TEAL = "#19e3d0";
const MUTED = "#cdbcf0";
const DISPLAY = '"Chango", serif';
const FONT = '"Segoe UI", system-ui, sans-serif';

const FPS = 30;
const s = (sec: number) => Math.round(sec * FPS);
const vo = VO as Record<string, number>;
const M = marks as any;

// Scene lengths: the narration plus a little room. s11 also plays the real Urdu voice summary.
const UR_LEN = 4; // a taste of it: the judges read English
const EXTRA: Record<string, number> = { s1: 1.2, s2: 0.8, s3: 2, s4: 1.2, s5: 1, s6: 1.2, s7: 1, s8: 1, s9: 1, s10: 1.7, s11: UR_LEN + 1, s12: 1.4, s13: 3 };
const ORDER = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13"];
const LEN = (k: string) => s(vo[k] + EXTRA[k]);
export const TOTAL = ORDER.reduce((a, k) => a + LEN(k), 0) + 180;

// ---------- building blocks ----------

const Pop: React.FC<{ at: number; until?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, until, children, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - at, fps, config: { damping: 12 } });
  const out = until === undefined ? 1 : interpolate(f, [until, until + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ ...style, opacity: p * out, transform: `scale(${0.6 + 0.4 * p})` }}>{children}</div>;
};

const Captions: React.FC<{ id: string }> = ({ id }) => {
  const f = useCurrentFrame();
  const text: string = (lines as Record<string, string>)[id];
  const chunks = text.match(/[^.?!]+[.?!]*/g)!.flatMap((c) => {
    const w = c.trim().split(" ");
    if (w.length <= 9) return [c.trim()];
    const mid = Math.ceil(w.length / 2);
    return [w.slice(0, mid).join(" "), w.slice(mid).join(" ")];
  }).filter(Boolean);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const t = f / FPS / vo[id];
  let acc = 0;
  let cur = "";
  for (const c of chunks) {
    if (t * total >= acc) cur = c;
    acc += c.length;
  }
  if (f / FPS > vo[id] + 0.3) return null;
  return (
    <div style={{ position: "absolute", bottom: 40, width: "100%", display: "flex", justifyContent: "center" }}>
      <div style={{ background: "rgba(20,10,58,.92)", color: PAPER, fontFamily: FONT, fontSize: 46, fontWeight: 600, padding: "12px 30px", borderRadius: 14, maxWidth: 1600, textAlign: "center" }}>{cur}</div>
    </div>
  );
};

const Petals: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 16 }).map((_, i) => {
        const x = (i * 127) % 1920;
        const y = ((f * (3 + (i % 3)) + i * 180) % 1200) - 60;
        return <div key={i} style={{ position: "absolute", left: x + Math.sin(f / 20 + i) * 40, top: y, width: 20, height: 14, borderRadius: "60% 40% 60% 40%", background: [MARIGOLD, GOLD, "#ff7a1a"][i % 3], transform: `rotate(${f * 4 + i * 40}deg)` }} />;
      })}
    </AbsoluteFill>
  );
};

const Land: React.FC<{ children?: React.ReactNode; dim?: number }> = ({ children, dim = 0 }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, 300], [1, 1.06]);
  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: FONT, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: "50% 100%" }}>
        <Img src={staticFile("land.svg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(20,10,58,${dim})` }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 104, backgroundImage: `url(${staticFile("papel.svg")})`, backgroundRepeat: "repeat-x" }} />
      <Petals />
      {children}
    </AbsoluteFill>
  );
};

const Night: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 50% 40%, #33187f, ${NIGHT})`, fontFamily: FONT }}>{children}</AbsoluteFill>
);

// The ancestors: friendly round ghosts, each with a marigold garland.
const Ancestor: React.FC<{ x: number; y: number; size?: number; look?: number; wink?: boolean; kind?: "dada" | "dadi" | "chacha" }> = ({ x, y, size = 1, look = 0, wink, kind = "dada" }) => {
  const f = useCurrentFrame();
  const bob = Math.sin(f / 10 + x) * 8;
  const eye = (cx: number, closed: boolean) => closed
    ? <path d={`M${cx - 24} 186 q24 -24 48 0`} stroke={CARD} strokeWidth={10} fill="none" strokeLinecap="round" />
    : <><circle cx={cx} cy={180} r={30} fill="#fff" stroke={CARD} strokeWidth={5} /><circle cx={cx + look * 14} cy={180} r={17} fill={CARD} /></>;
  return (
    <svg style={{ position: "absolute", left: x - 200 * size, top: y - 210 * size + bob, overflow: "visible" }} width={400 * size} height={420 * size} viewBox="0 0 400 420">
      <path d="M60 400V180a140 140 0 0 1 280 0V400q-35-40-70 0q-35 40-70 0q-35-40-70 0q-35 40-70 0z" fill={PAPER} />
      {kind === "dadi" && <path d="M60 180a140 140 0 0 1 280 0v30q-20-120-140-120t-140 120z" fill={ROSE} />}
      {kind === "dada" && <path d="M120 66q80-50 160 0v-34q-80-34-160 0z" fill={TEAL} />}
      {eye(150, false)}
      {eye(250, !!wink)}
      {kind === "chacha" && <path d="M180 180h40M120 180a30 30 0 0 1 60 0a30 30 0 0 1-60 0zM220 180a30 30 0 0 1 60 0a30 30 0 0 1-60 0z" fill="none" stroke={ROSE} strokeWidth={8} />}
      <circle cx={112} cy={232} r={20} fill={ROSE} opacity={0.35} />
      <circle cx={288} cy={232} r={20} fill={ROSE} opacity={0.35} />
      <path d="M160 240q40 40 80 0" stroke={CARD} strokeWidth={10} fill="none" strokeLinecap="round" />
      {kind === "dada" && <path d="M200 226q-30-16-52 6q28 8 52-6q30-16 52 6q-28 8-52-6z" fill={CARD} />}
      {Array.from({ length: 9 }).map((_, i) => {
        const a = Math.PI * (0.12 + (i * 0.76) / 8);
        return <circle key={i} cx={200 + Math.cos(a) * 150} cy={190 + Math.sin(a) * 150} r={17} fill={i % 2 ? MARIGOLD : GOLD} />;
      })}
    </svg>
  );
};

const Bubble: React.FC<{ at: number; until?: number; x?: number; right?: number; y: number; color?: string; ink?: string; size?: number; children: React.ReactNode }> = ({ at, until, x, right, y, color = PAPER, ink = CARD, size = 64, children }) => (
  <Pop at={at} until={until} style={{ position: "absolute", left: x, right, top: y }}>
    <div style={{ background: color, color: ink, fontFamily: DISPLAY, fontSize: size, padding: "26px 44px", borderRadius: 44, boxShadow: "0 12px 40px rgba(0,0,0,.4)", whiteSpace: "nowrap" }}>{children}</div>
  </Pop>
);

const BigText: React.FC<{ children: React.ReactNode; size?: number; color?: string; shadow?: string; style?: React.CSSProperties }> = ({ children, size = 150, color = GOLD, shadow = ROSE, style }) => (
  <div style={{ fontFamily: DISPLAY, fontSize: size, color, textShadow: `0 8px 0 ${shadow}`, textAlign: "center", lineHeight: 1.1, ...style }}>{children}</div>
);

// Real footage from one recording: a list of clips, each with its own speed and zoom.
// A box is only true once the page has scrolled to it, so a clip starts where its box is on screen.
type Box = { x: number; y: number; width: number; height: number };
type Clip = { from: number; to: number; sec?: number; box?: Box; maxZoom?: number; ease?: boolean };

const Shot: React.FC<Clip & { frames: number }> = ({ from, to, frames, box, maxZoom = 1.9, ease }) => {
  const f = useCurrentFrame();
  let scale = 1, tx = 0, ty = 0;
  if (box) {
    const target = Math.min(maxZoom, 1800 / box.width, 960 / box.height);
    const p = ease ? interpolate(f, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
    scale = 1 + (target - 1) * p;
    tx = (960 - (box.x + box.width / 2)) * p;
    ty = (540 - (box.y + box.height / 2)) * p;
  }
  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translate(${tx}px, ${ty}px)`, transformOrigin: "50% 50%" }}>
      <OffthreadVideo src={staticFile("footage.webm")} startFrom={Math.round(from * FPS)} playbackRate={(to - from) / (frames / FPS)} muted style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};

// The last clip takes whatever time is left in the scene.
const Footage: React.FC<{ id: string; clips: Clip[] }> = ({ id, clips }) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
      {clips.map((c, i) => {
        const frames = c.sec === undefined ? LEN(id) - at : s(c.sec);
        const start = at;
        at += frames;
        return <Sequence key={i} from={start} durationInFrames={frames}><Shot {...c} frames={frames} /></Sequence>;
      })}
    </AbsoluteFill>
  );
};

// ---------- scenes ----------

const S1 = () => (
  <Land>
    <Pop at={12} style={{ position: "absolute", top: 170, width: "100%" }}><BigText size={100}>One night. Whole family.</BigText></Pop>
    <Pop at={s(1.6)} style={{ position: "absolute", inset: 0 }}><Ancestor x={480} y={620} size={0.95} kind="dadi" /></Pop>
    <Pop at={s(2.2)} style={{ position: "absolute", inset: 0 }}><Ancestor x={960} y={620} size={0.95} kind="dada" /></Pop>
    <Pop at={s(2.8)} style={{ position: "absolute", inset: 0 }}><Ancestor x={1440} y={620} size={0.95} kind="chacha" /></Pop>
  </Land>
);

const S2 = () => (
  <Land dim={0.15}>
    <Ancestor x={340} y={560} size={1.15} kind="dadi" look={Math.sin(useCurrentFrame() / 18)} />
    <Bubble at={s(1.8)} right={90} y={190}>You've gotten so thin.</Bubble>
    <Bubble at={s(3.2)} right={90} y={410} color={TEAL}>Eat something.</Bubble>
    <Bubble at={s(4.3)} right={90} y={630} color={MARIGOLD}>When's the wedding?</Bubble>
  </Land>
);

const S3 = () => {
  const f = useCurrentFrame();
  const asked = s(vo.s3 - 2);
  const look = f < asked + 12 ? 0 : Math.sign(Math.sin((f - asked) / 8));
  return (
    <Land dim={0.15}>
      <Ancestor x={1420} y={560} size={1.15} kind="dada" look={look} />
      <Bubble at={asked - 12} x={110} y={330} color={ROSE} ink={PAPER} size={68}>Did you leave any<br />hidden treasure?</Bubble>
    </Land>
  );
};

const S4 = () => (
  <Night>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: 90 }}>
      <Pop at={s(2)}><BigText size={200}>Rs 50.7 billion</BigText></Pop>
      <Pop at={s(4)} style={{ marginTop: 40 }}><div style={{ fontFamily: FONT, fontWeight: 700, color: PAPER, fontSize: 72 }}>in people's names</div></Pop>
    </AbsoluteFill>
  </Night>
);

// An illustration of a list file: the cells are blanks, no real rows.
const Sheet: React.FC<{ scroll?: number; children?: React.ReactNode }> = ({ scroll = 0, children }) => (
  <div style={{ position: "absolute", left: 120, top: 90, width: 1680, height: 780, background: "#f5f7f5", borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}>
    <div style={{ height: 60, background: "#1f7a4d" }} />
    <div style={{ transform: `translateY(${-scroll % 62}px)` }}>
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{ height: 62, borderBottom: "2px solid #d5dbd6", display: "flex", gap: 30, alignItems: "center", padding: "0 30px" }}>
          {[420, 300, 260, 200, 240].map((w, k) => <div key={k} style={{ width: w * (0.75 + ((i * 7 + k * 3) % 5) / 16), height: 20, background: "#bcc6bf", borderRadius: 6 }} />)}
        </div>
      ))}
    </div>
    {children}
  </div>
);

const S5 = () => {
  const f = useCurrentFrame();
  const rows = Math.round(interpolate(f, [10, s(3.4)], [0, 530000], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Night>
      <Sheet scroll={f * 34} />
      <AbsoluteFill style={{ background: "rgba(20,10,58,.72)" }} />
      <Pop at={10} style={{ position: "absolute", top: 240, width: "100%" }}>
        <BigText size={130}>{rows.toLocaleString()} rows</BigText>
      </Pop>
      <Pop at={s(3.6)} style={{ position: "absolute", top: 440, width: "100%" }}>
        <BigText size={130} color={TEAL} shadow={CARD}>in one file</BigText>
      </Pop>
      <Pop at={s(5.2)} style={{ position: "absolute", top: 640, width: "100%" }}>
        <BigText size={130} color={PAPER}>782 files</BigText>
      </Pop>
    </Night>
  );
};

const S6 = () => {
  const found = s(3.8);
  const f = useCurrentFrame();
  return (
    <Night>
      <Sheet>
        {f >= found && (
          <div style={{ position: "absolute", left: 0, right: 0, top: 370, height: 110, background: GOLD, display: "flex", alignItems: "center", padding: "0 40px", fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 64, color: CARD }}>MOHD RASUL</div>
        )}
      </Sheet>
      <Pop at={6} style={{ position: "absolute", top: 130, left: 300 }}>
        <div style={{ background: "#fff", border: "4px solid #333", borderRadius: 16, padding: "24px 36px", fontSize: 58, fontFamily: FONT, color: "#222", boxShadow: "0 12px 30px rgba(0,0,0,.4)" }}>
          Find: <b>MUHAMMAD RASOOL</b> <span style={{ color: "#c62828", fontWeight: 800, marginLeft: 30 }}>0 results</span>
        </div>
      </Pop>
      <Pop at={s(1)} style={{ position: "absolute", top: 620, left: 180 }}><BigText size={170} color={ROSE} shadow={CARD}>51%</BigText></Pop>
      <Bubble at={found + 18} x={1000} y={640} color={TEAL} size={76}>Thanks, clerk.</Bubble>
    </Night>
  );
};

// Times read off the footage: the page scrolls to the steps 2.4s after "go".
const STEPS_ON_SCREEN = M.go + 2.4;
const BRANCH_CENTERED = M.letterClick - 2.5;
const LETTER_WRITTEN = M.letter - 0.2;
const CARD_TOP = { x: 372, y: 0, width: 1175, height: 780 };
const MIDDLE = { x: 372, y: 150, width: 1175, height: 780 };

const S7 = () => <Footage id="s7" clips={[{ from: M.home, to: M.privacy - 0.25, sec: 2.7 }, { from: M.privacy - 0.25, to: M.go, box: { ...M.privacyBox, x: 372, width: 1175 }, maxZoom: 1.5, ease: true }]} />;
const S8 = () => <Footage id="s8" clips={[{ from: M.go, to: STEPS_ON_SCREEN, sec: 1.6 }, { from: STEPS_ON_SCREEN, to: M.results, box: M.runBox, maxZoom: 1.5, ease: true }]} />;
const S9 = () => <Footage id="s9" clips={[{ from: M.summary, to: M.card, box: M.summaryBox, ease: true }]} />;
const S10 = () => <Footage id="s10" clips={[
  { from: M.card, to: BRANCH_CENTERED, sec: 2.6, box: CARD_TOP, maxZoom: 1.3 },
  { from: BRANCH_CENTERED, to: M.letterClick + 0.6, sec: 1.4, box: MIDDLE, maxZoom: 1.3 },
  { from: LETTER_WRITTEN, to: M.listen - 1, box: MIDDLE, maxZoom: 1.3 },
]} />;

const S11 = () => {
  const f = useCurrentFrame();
  const n = (urInfo as any).crowd as number;
  const start = s(vo.s11 + 0.2);
  return (
    <Land dim={0.55}>
      <Sequence from={start}><Audio src={staticFile("ur.mp3")} volume={(fr) => interpolate(fr, [s(UR_LEN - 0.8), s(UR_LEN)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} /></Sequence>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", height: 170, marginBottom: 40 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} style={{ width: 16, borderRadius: 8, background: i % 2 ? MARIGOLD : TEAL, height: f < start ? 16 : 30 + Math.abs(Math.sin(f / 3.4 + i * 0.8)) * 130 }} />
          ))}
        </div>
        <div lang="ur" dir="rtl" style={{ fontFamily: '"Noto Nastaliq Urdu", serif', fontSize: 62, lineHeight: 2.1, color: PAPER, textAlign: "center", maxWidth: 1600 }}>
          سرکاری فہرستوں میں اس نام کے {n?.toLocaleString("en-US")} کھاتے ہیں
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 52, color: GOLD, marginTop: 20 }}>{n?.toLocaleString("en-US")} accounts under this name</div>
      </AbsoluteFill>
    </Land>
  );
};

const S12 = () => {
  const f = useCurrentFrame();
  const bar = (label: string, pct: number, color: string, y: number, at: number) => {
    const w = interpolate(f, [at, at + 22], [0, pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <div style={{ position: "absolute", left: 130, top: y, width: 1660 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 56, color: PAPER, marginBottom: 12 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ height: 96, width: `${w * 0.8}%`, background: color, borderRadius: 18 }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 92, color }}>{Math.round(w)}%</div>
        </div>
      </div>
    );
  };
  return (
    <Night>
      {bar("Ctrl+F", 51, MUTED, 90, 6)}
      {bar("Ghost Money", 77, MARIGOLD, 320, 24)}
      {bar("With the father's name (85 searches)", 99, TEAL, 550, s(vo.s12 * 0.5))}
    </Night>
  );
};

const S13 = () => {
  const f = useCurrentFrame();
  const end = s(vo.s13 + 0.4);
  return (
    <Land dim={0.2}>
      <Ancestor x={960} y={680} size={0.95} kind="dada" wink={f > s(vo.s13 - 0.6) && f < s(vo.s13 + 0.4)} />
      <Pop at={end} style={{ position: "absolute", top: 130, width: "100%" }}><BigText size={130}>Ghost Money</BigText></Pop>
      <Pop at={end + 12} style={{ position: "absolute", top: 300, width: "100%" }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, color: PAPER, fontSize: 60, textAlign: "center" }}>Find what your elders left behind.</div>
      </Pop>
    </Land>
  );
};

// The real result, details blurred. On-screen text only: real people's words are never voiced by the AI.
const Proof = () => (
  <Night>
    <div style={{ position: "absolute", left: 260, top: 300, width: 1400, height: 680, overflow: "hidden", borderRadius: 24, boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
      <Img src={staticFile("proof.png")} style={{ width: 1920, marginLeft: -260 }} />
    </div>
    <Pop at={10} style={{ position: "absolute", top: 70, width: "100%" }}>
      <BigText size={92} color={GOLD}>Then I searched for my dad.</BigText>
    </Pop>
    <Pop at={s(2.2)} style={{ position: "absolute", top: 190, width: "100%" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, color: PAPER, fontSize: 60, textAlign: "center" }}>It found his account.</div>
    </Pop>
  </Night>
);
const PROOF_LEN = s(6);

// Stills for the post: npx remotion still src/index.ts Cover out/cover.png
export const Cover: React.FC = () => (
  <Land dim={0.42}>
    <Ancestor x={1540} y={600} size={1.35} kind="dada" />
    <div style={{ position: "absolute", left: 90, top: 200 }}>
      <BigText size={150} style={{ textAlign: "left" }}>Ghost Money</BigText>
      <div style={{ fontFamily: FONT, fontWeight: 700, color: PAPER, fontSize: 60, marginTop: 30 }}>Find what your elders left behind.</div>
      <div style={{ fontFamily: FONT, fontWeight: 700, color: GOLD, fontSize: 60, marginTop: 24 }}>Rs 50.7 billion in people's names</div>
    </div>
  </Land>
);

export const Chart: React.FC = () => {
  const bar = (label: string, pct: number, color: string, y: number) => (
    <div style={{ position: "absolute", left: 100, top: y, width: 1400 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 44, color: PAPER, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ height: 80, width: `${pct * 0.85}%`, background: color, borderRadius: 14 }} />
        <div style={{ fontFamily: DISPLAY, fontSize: 72, color }}>{pct}%</div>
      </div>
    </div>
  );
  return (
    <Night>
      <div style={{ position: "absolute", left: 100, top: 50, fontFamily: DISPLAY, fontSize: 56, color: GOLD }}>Right account ranked first</div>
      {bar("Ctrl+F", 51, MUTED, 160)}
      {bar("Fuzzy text match", 62, ROSE, 320)}
      {bar("TabPFN on 12 numbers", 77, MARIGOLD, 480)}
      {bar("TabPFN, father's name on both records (85 searches)", 99, TEAL, 640)}
    </Night>
  );
};

const SCENES: Record<string, React.FC> = { s1: S1, s2: S2, s3: S3, s4: S4, s5: S5, s6: S6, s7: S7, s8: S8, s9: S9, s10: S10, s11: S11, s12: S12, s13: S13 };

export const Main: React.FC = () => {
  const [h] = useState(() => delayRender("fonts"));
  useState(() => {
    Promise.all([document.fonts.load('40px "Chango"'), document.fonts.load('40px "Noto Nastaliq Urdu"', "سرکاری")]).finally(() => continueRender(h));
    return 0;
  });
  let at = 0;
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <Audio src={staticFile("music.wav")} volume={(f) => interpolate(f, [0, 30, TOTAL - 60, TOTAL], [0, 0.13, 0.13, 0], { extrapolateRight: "clamp" })} />
      {ORDER.map((k) => {
        // the real result plays between the demo and the numbers
        const proofAt = k === "s12" ? at : -1;
        if (k === "s12") at += PROOF_LEN;
        const from = at;
        at += LEN(k);
        const Scene = SCENES[k];
        return (
          <React.Fragment key={k}>
            {proofAt >= 0 && <Sequence from={proofAt} durationInFrames={PROOF_LEN}><Proof /></Sequence>}
            <Sequence from={from} durationInFrames={LEN(k)}>
              <Scene />
              <Audio src={staticFile(`vo/${k}.mp3`)} />
              <Captions id={k} />
            </Sequence>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
