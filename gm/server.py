"""Ghost Money web server: the page, the index shards, and three small tools.

  /shards/<n>.json.gz  index shards (the browser picks them; the name it is looking for never comes here)
  /api/score           TabPFN match probabilities from feature numbers only
  /api/branch          where a bank branch is today (SerpApi Google Maps), from public list fields only
  /api/voice           an Urdu or English voice summary (ElevenLabs), worded here from counts and banks, no names
  /api/gemma           local Gemma through Ollama, only when OLLAMA_URL is set and the request is from this machine
  /api/trace           timings of the Gemma steps that ran in the browser, turned into Sentry spans (no text)

run:  python -m gm.server   (reads .env; open http://localhost:8000)
"""
import hashlib, json, os, re, threading, time
from collections import defaultdict
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if (ROOT / ".env").exists() else []:
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

from gm.features import FEATURES  # noqa: E402

SITE = Path(os.environ.get("INDEX_DIR", ROOT / "data" / "index" / "site"))
CACHE = ROOT / "data" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)
OLLAMA = os.environ.get("OLLAMA_URL", "")
GEMMA = os.environ.get("GEMMA_MODEL", "gemma4:e4b-it-qat")

if os.environ.get("SENTRY_DSN"):
    import sentry_sdk
    sentry_sdk.init(dsn=os.environ["SENTRY_DSN"], traces_sample_rate=1.0, send_default_pii=False,
                    environment=os.environ.get("RENDER") and "render" or "local")
    span = sentry_sdk.start_span
else:
    from contextlib import nullcontext

    def span(**_):
        return nullcontext(type("S", (), {"set_data": lambda *a: None})())

app = FastAPI(title="Ghost Money", docs_url=None, redoc_url=None)

# ---- limits: free plans, so every paid call has a daily cap and a per-visitor cap ----
_spent = defaultdict(int)
_day = [time.strftime("%Y-%m-%d")]
CAPS = {"score": 3000, "branch": 60, "voice": 40}
PER_IP = {"score": 200, "branch": 15, "voice": 6}


def spend(kind, ip):
    today = time.strftime("%Y-%m-%d")
    if today != _day[0]:
        _spent.clear()
        _day[0] = today
    if _spent[kind] >= CAPS[kind] or _spent[(kind, ip)] >= PER_IP[kind]:
        raise HTTPException(429, f"Daily limit for {kind} reached. It resets at midnight UTC.")
    _spent[kind] += 1
    _spent[(kind, ip)] += 1


def client_ip(req: Request):
    return (req.headers.get("x-forwarded-for") or req.client.host or "").split(",")[0].strip()


# ---- TabPFN scorer ----
_model = {"clf": None, "kind": None}
_model_lock = threading.Lock()


def scorer():
    """TabPFN (Prior Labs API) fitted on CNIC-labelled pairs; logistic regression only if TabPFN is unreachable."""
    with _model_lock:
        if _model["clf"] is not None:
            return _model
        import pandas as pd
        tr = pd.read_csv(ROOT / "data" / "model" / "train-sample.csv")
        X, y = tr[FEATURES].values, tr["label"].values
        try:
            from tabpfn_client import TabPFNClassifier, set_access_token
            set_access_token(os.environ["TABPFN_TOKEN"])
            clf = TabPFNClassifier()
            clf.fit(X, y)
            _model.update(clf=clf, kind="tabpfn")
        except Exception as e:  # keep the site useful, and say which model scored
            print("TabPFN unavailable, using logistic regression:", e)
            from sklearn.linear_model import LogisticRegression
            _model.update(clf=LogisticRegression(max_iter=2000).fit(X, y), kind="logistic-fallback")
        return _model


@app.post("/api/score")
async def score(req: Request):
    body = await req.json()
    rows = body.get("features") or []
    if not isinstance(rows, list) or not rows or len(rows) > 300:
        raise HTTPException(400, "Send 1-300 feature rows.")
    if any(not isinstance(r, list) or len(r) != len(FEATURES) or not all(isinstance(x, (int, float)) for x in r) for r in rows):
        raise HTTPException(400, f"Each row must be {len(FEATURES)} numbers.")
    spend("score", client_ip(req))
    t0 = time.time()
    with span(op="gen_ai.execute_tool", name="execute_tool tabpfn_match_score") as s:
        m = scorer()
        try:
            probs = m["clf"].predict_proba(rows)[:, 1]
        except Exception as e:
            if m["kind"] != "tabpfn":
                raise
            print("TabPFN call failed, falling back:", e)
            _model.update(clf=None)
            os.environ["TABPFN_TOKEN"] = ""
            m = scorer()
            probs = m["clf"].predict_proba(rows)[:, 1]
        s.set_data("gen_ai.tool.name", "tabpfn_match_score")
        s.set_data("rows", len(rows))
        s.set_data("model", m["kind"])
    return {"p": [round(float(p), 4) for p in probs], "model": m["kind"], "ms": int((time.time() - t0) * 1000)}


# ---- where to claim today ----
def _cached(kind, key, fn):
    path = CACHE / f"{kind}-{hashlib.sha256(key.encode()).hexdigest()[:20]}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8")), True
    data = fn()
    path.write_text(json.dumps(data), encoding="utf-8")
    return data, False


@app.post("/api/branch")
async def branch(req: Request):
    b = await req.json()
    bank = str(b.get("bank", ""))[:80]
    br = str(b.get("branch", ""))[:80]
    prov = str(b.get("province", ""))[:30]
    if not bank or not br:
        raise HTTPException(400, "bank and branch are required")
    q = re.sub(r"\s+", " ", f"{bank} {br} branch {prov} Pakistan").strip()

    def lookup():
        spend("branch", client_ip(req))
        if not os.environ.get("SERPAPI_KEY"):
            return {"query": q, "results": []}
        with span(op="gen_ai.execute_tool", name="execute_tool serpapi_branch_lookup") as s:
            r = httpx.get("https://serpapi.com/search.json", timeout=25, params={
                "engine": "google_maps", "q": q, "type": "search", "hl": "en", "gl": "pk",
                "api_key": os.environ["SERPAPI_KEY"]})
            r.raise_for_status()
            j = r.json()
            res = j.get("local_results") or ([j["place_results"]] if j.get("place_results") else [])
            s.set_data("results", len(res))
        return {"query": q, "results": [{k: x.get(k) for k in ("title", "address", "phone", "rating", "hours", "gps_coordinates", "place_id")}
                                        for x in res[:3]]}

    data, hit = _cached("branch", q.lower(), lookup)
    return {**data, "cached": hit}


# ---- voice summary ----
URDU_NUM = "۰۱۲۳۴۵۶۷۸۹"


def voice_text(lang, found, total, banks):
    banks = [re.sub(r"[^\w\s()&.-]", "", str(x))[:40] for x in banks[:3]]
    if lang == "ur":
        if not found:
            return "سرکاری فہرستوں میں ابھی کوئی پکا نام نہیں ملا۔ ہجے بدل کر یا والد کے نام کے ساتھ دوبارہ تلاش کریں۔"
        return (f"سرکاری فہرستوں میں {found} ایسے کھاتے ملے ہیں جو ان کے ہو سکتے ہیں، کل تقریباً {round(total):,} روپے۔ "
                f"بینک: {'، '.join(banks)}۔ وارث متعلقہ برانچ میں درخواست دے سکتے ہیں۔")
    if not found:
        return "No strong match in the State Bank lists yet. Try another spelling, or add the father's name."
    return (f"I found {found} account{'s' if found > 1 else ''} in the State Bank lists that could be theirs, about "
            f"{round(total):,} rupees in all, at {', '.join(banks)}. Heirs can claim at the branch.")


@app.post("/api/voice")
async def voice(req: Request):
    b = await req.json()
    lang = "ur" if b.get("lang") == "ur" else "en"
    found = max(0, min(50, int(b.get("found") or 0)))
    total = max(0.0, min(1e10, float(b.get("total") or 0)))
    text = voice_text(lang, found, total, list(b.get("banks") or []))
    path = CACHE / f"voice-{hashlib.sha256(text.encode()).hexdigest()[:20]}.mp3"
    if not path.exists():
        if not os.environ.get("ELEVENLABS_API_KEY"):
            raise HTTPException(503, "Voice is off on this server.")
        spend("voice", client_ip(req))
        with span(op="gen_ai.execute_tool", name="execute_tool elevenlabs_voice") as s:
            r = httpx.post(f"https://api.elevenlabs.io/v1/text-to-speech/{os.environ.get('ELEVENLABS_VOICE_ID', 'JBFqnCBsd6RMkjVDRZzb')}"
                           "?output_format=mp3_44100_64", timeout=60,
                           headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"},
                           json={"text": text, "model_id": os.environ.get("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
                                 **({"language_code": "ur"} if lang == "ur" else {})})
            if r.status_code != 200:
                raise HTTPException(502, f"ElevenLabs said {r.status_code}")
            s.set_data("chars", len(text))
            path.write_bytes(r.content)
    return Response(path.read_bytes(), media_type="audio/mpeg", headers={"X-Text": hashlib.sha1(text.encode()).hexdigest()[:8]})


# ---- local Gemma ----
@app.get("/api/gemma")
async def gemma_status(req: Request):
    return {"local": bool(OLLAMA) and _is_local(req), "model": GEMMA if OLLAMA else None}


def _is_local(req):
    return (req.client.host in ("127.0.0.1", "::1", "localhost")) and not req.headers.get("x-forwarded-for")


_gpu = {}


@app.post("/api/gemma")
async def gemma(req: Request):
    if not OLLAMA or not _is_local(req):
        raise HTTPException(404, "Local Gemma is only available when you run Ghost Money on your own machine.")
    b = await req.json()
    t0 = time.time()
    with span(op="gen_ai.chat", name=f"chat {GEMMA}") as s:
        body = {"model": GEMMA, "stream": False, "format": "json", "think": False,
                "options": {"temperature": 0.1, "num_ctx": 8192, "num_predict": 1500, **_gpu},
                "messages": [{"role": "system", "content": str(b.get("system", ""))[:12000]},
                             {"role": "user", "content": str(b.get("user", ""))[:20000]}]}
        async with httpx.AsyncClient(timeout=600) as c:
            r = await c.post(f"{OLLAMA}/api/chat", json=body)
            if r.status_code == 500 and "CUDA" in r.text and not _gpu:
                # the GPU runner can break after an Ollama update; the CPU still works, just slower
                print("Ollama GPU failed, using CPU from now on:", r.text[:120])
                _gpu["num_gpu"] = 0
                body["options"]["num_gpu"] = 0
                r = await c.post(f"{OLLAMA}/api/chat", json=body)
        r.raise_for_status()
        j = r.json()
        s.set_data("gen_ai.request.model", GEMMA)
        s.set_data("gen_ai.usage.input_tokens", j.get("prompt_eval_count"))
        s.set_data("gen_ai.usage.output_tokens", j.get("eval_count"))
        s.set_data("gen_ai.operation.name", str(b.get("step", "chat"))[:40])
    return {"text": j["message"]["content"], "model": GEMMA, "ms": int((time.time() - t0) * 1000),
            "in": j.get("prompt_eval_count"), "out": j.get("eval_count")}


@app.post("/api/trace")
async def trace(req: Request):
    """The browser ran Gemma itself; it reports only step names, timings and token counts."""
    b = await req.json()
    steps = b.get("steps") or []
    if os.environ.get("SENTRY_DSN") and isinstance(steps, list):
        import sentry_sdk
        now = time.time()
        total = sum(float(x.get("ms") or 0) for x in steps[:20]) / 1000
        with sentry_sdk.start_transaction(op="gen_ai.invoke_agent", name="invoke_agent ghostmoney (browser)",
                                          start_timestamp=now - total) as tx:
            tx.set_data("gen_ai.agent.name", "ghostmoney")
            t = now - total
            for x in steps[:20]:
                ms = float(x.get("ms") or 0) / 1000
                child = tx.start_child(op=str(x.get("op", "gen_ai.chat"))[:40], name=str(x.get("name", "step"))[:80], start_timestamp=t)
                for k in ("model", "in", "out", "rows", "shards", "candidates"):
                    if k in x:
                        child.set_data(k, x[k] if isinstance(x[k], (int, float)) else str(x[k])[:60])
                child.finish(end_timestamp=t + ms)
                t += ms
    return {"ok": True}


# ---- data + page ----
@app.get("/shards/{n}.json.gz")
def shard(n: int):
    if not 0 <= n < 4096:
        raise HTTPException(404)
    path = SITE / "shards" / f"{n}.json.gz"
    if not path.exists():
        raise HTTPException(404, "index not built")
    return Response(path.read_bytes(), media_type="application/json",
                    headers={"Content-Encoding": "gzip", "Cache-Control": "public, max-age=86400"})


@app.get("/stats.json")
def stats():
    return FileResponse(SITE / "stats.json", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/health")
def health():
    return {"ok": True, "index": (SITE / "stats.json").exists(), "scorer": _model["kind"]}


app.mount("/", StaticFiles(directory=ROOT / "public", html=True), name="public")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))
