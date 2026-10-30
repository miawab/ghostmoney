# Writes public/music.wav: a short original marimba waltz, made from sine plucks. No samples, no licence.
import wave
import numpy as np
SR = 44100
BEAT = 60 / 138
def pluck(freq, dur, vol):
    t = np.arange(int(SR * dur)) / SR
    return vol * np.exp(-t * 7) * (np.sin(2 * np.pi * freq * t) + .35 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t * 18))
def hz(n): return 440 * 2 ** ((n - 69) / 12)
CHORDS = [[55, 59, 62], [60, 64, 67], [62, 66, 69], [55, 59, 62], [52, 55, 59], [60, 64, 67], [62, 66, 69], [55, 59, 62]]
TUNE = [[74, None, 71], [72, 76, None], [74, 78, 81], [79, None, None], [76, 74, 71], [72, None, 76], [74, 72, 69], [67, None, None]]
bars = int(140 / (BEAT * 3)) + 1
out = np.zeros(int(SR * BEAT * 3 * (bars + 1)))
def add(at, sig):
    i = int(at * SR)
    sig = sig[:len(out) - i]
    out[i:i + len(sig)] += sig
for b in range(bars):
    c, m = CHORDS[b % 8], TUNE[b % 8]
    t0 = b * BEAT * 3
    add(t0, pluck(hz(c[0] - 12), 1.2, .5))
    for k in (1, 2):
        for n in c[1:]:
            add(t0 + k * BEAT, pluck(hz(n), .6, .16))
    if b >= 4:
        for k, n in enumerate(m):
            if n:
                add(t0 + k * BEAT, pluck(hz(n), .8, .3))
out = out / np.abs(out).max() * .8
with wave.open("public/music.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())
