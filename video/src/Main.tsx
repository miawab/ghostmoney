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
const EXTRA: Record<string, number> = { s1: 1.2, s2: 0.8, s3: 2, s4: 1.2, s5: 1, s6: 1.2, s7: 1, s8: 1, s9: 1, s10: 1, s11: UR_LEN + 1, s12: 1.4, s13: 3 };
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

// The ancestor: a big sugar skull whose eyes can look around.
const Skull: React.FC<{ x: number; y: number; size?: number; look?: number; wink?: boolean }> = ({ x, y, size = 1, look = 0, wink }) => {
  const f = useCurrentFrame();
  const bob = Math.sin(f / 10) * 6;
  const eye = (cx: number, closed: boolean) => (
    <g>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        return <circle key={i} cx={cx + Math.cos(a) * 42} cy={210 + Math.sin(a) * 42} r={15} fill={MARIGOLD} />;
      })}
      {closed
        ? <path d={`M${cx - 26} 212 q26 -22 52 0`} stroke={CARD} strokeWidth={10} fill="none" strokeLinecap="round" />
        : <><circle cx={cx} cy={210} r={32} fill="#fff" /><circle cx={cx + look * 18} cy={210} r={17} fill={CARD} /></>}
    </g>
  );
  return (
    <svg style={{ position: "absolute", left: x - 200 * size, top: y - 210 * size + bob, overflow: "visible" }} width={400 * size} height={420 * size} viewBox="0 0 400 420">
      <path d="M200 20C100 20 36 92 36 186c0 58 30 104 74 130v48a18 18 0 0 0 18 18h144a18 18 0 0 0 18-18v-48c44-26 74-72 74-130C364 92 300 20 200 20z" fill={PAPER} />
      {Array.from({ length: 9 }).map((_, i) => {
        const a = Math.PI + (i * Math.PI) / 8;
        return <circle key={i} cx={200 + Math.cos(a) * 138} cy={190 + Math.sin(a) * 138} r={10} fill={i % 2 ? ROSE : TEAL} />;
      })}
      {eye(128, false)}
      {eye(272, !!wink)}
      <path d="M200 262l24 42h-48z" fill={ROSE} />
      <path d="M152 336v44M200 336v44M248 336v44" stroke={CARD} strokeWidth={10} />
      <circle cx={200} cy={92} r={32} fill={MARIGOLD} />
      <text x={200} y={108} fontFamily="Arial" fontWeight={700} fontSize={42} textAnchor="middle" fill={CARD}>Rs</text>
    </svg>
  );
};

const Bubble: React.FC<{ at: number; until?: number; x: number; y: number; color?: string; ink?: string; size?: number; children: React.ReactNode }> = ({ at, until, x, y, color = PAPER, ink = CARD, size = 64, children }) => (
  <Pop at={at} until={until} style={{ position: "absolute", left: x, top: y }}>
    <div style={{ background: color, color: ink, fontFamily: DISPLAY, fontSize: size, padding: "26px 44px", borderRadius: 44, boxShadow: "0 12px 40px rgba(0,0,0,.4)", whiteSpace: "nowrap" }}>{children}</div>
  </Pop>
);

const BigText: React.FC<{ children: React.ReactNode; size?: number; color?: string; shadow?: string; style?: React.CSSProperties }> = ({ children, size = 150, color = GOLD, shadow = ROSE, style }) => (
  <div style={{ fontFamily: DISPLAY, fontSize: size, color, textShadow: `0 8px 0 ${shadow}`, textAlign: "center", lineHeight: 1.1, ...style }}>{children}</div>
);

// Real footage, played from one recording, zooming on a box of the page.
const Footage: React.FC<{ from: number; to: number; id: string; box?: { x: number; y: number; width: number; height: number }; zoomAt?: number; maxZoom?: number }> = ({ from, to, id, box, zoomAt = 0, maxZoom = 1.9 }) => {
  const f = useCurrentFrame();
  const len = LEN(id);
  const rate = (to - from) / (len / FPS);
  let scale = 1, tx = 0, ty = 0;
  if (box) {
    const target = Math.min(maxZoom, 1800 / box.width, 960 / box.height);
    const p = interpolate(f, [zoomAt, zoomAt + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    scale = 1 + (target - 1) * p;
    tx = (960 - (box.x + box.width / 2)) * p;
    ty = (540 - (box.y + box.height / 2)) * p;
  }
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translate(${tx}px, ${ty}px)`, transformOrigin: "50% 50%" }}>
        <OffthreadVideo src={staticFile("footage.webm")} startFrom={Math.round(from * FPS)} playbackRate={rate} muted style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- scenes ----------

const S1 = () => (
  <Land>
    <Pop at={18} style={{ position: "absolute", top: 240, width: "100%" }}><BigText size={120}>Say you could visit.</BigText></Pop>
  </Land>
);

const S2 = () => (
  <Land dim={0.25}>
    <Skull x={960} y={600} size={1.15} look={Math.sin(useCurrentFrame() / 18)} />
    <Bubble at={s(1.8)} until={s(3.4)} x={150} y={300}>You've gotten so thin.</Bubble>
    <Bubble at={s(3.2)} until={s(4.5)} x={1200} y={300} color={TEAL}>Eat something.</Bubble>
    <Bubble at={s(4.3)} x={1150} y={620} color={MARIGOLD}>When's the wedding?</Bubble>
  </Land>
);

const S3 = () => {
  const f = useCurrentFrame();
  const asked = s(vo.s3 - 2);
  const look = f < asked + 12 ? 0 : Math.sign(Math.sin((f - asked) / 8));
  return (
    <Land dim={0.25}>
      <Skull x={1280} y={560} size={1.15} look={look} />
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

const S7 = () => <Footage id="s7" from={M.home} to={M.go} box={M.privacyBox} zoomAt={s(vo.s7 - 2.6)} />;
const S8 = () => <Footage id="s8" from={M.go} to={M.results} box={M.runBox} zoomAt={s(0.6)} maxZoom={1.5} />;
const S9 = () => <Footage id="s9" from={M.summary} to={M.card} box={M.summaryBox} zoomAt={8} />;
const S10 = () => <Footage id="s10" from={M.card} to={M.listen} box={{ x: 372, y: 120, width: 1175, height: 780 }} zoomAt={0} maxZoom={1.4} />;

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
      <Skull x={960} y={660} size={0.95} wink={f > s(vo.s13 - 0.6) && f < s(vo.s13 + 0.4)} />
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
