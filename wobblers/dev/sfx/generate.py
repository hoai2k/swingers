#!/usr/bin/env python3
"""Generate and process Wobblers' recorded sound effects (adapted from battles/dev/sfx).

    ELEVENLABS_API_KEY=... python3 wobblers/dev/sfx/generate.py [name ...]

1. Each sound in sfx.json gets `n` variants from the ElevenLabs sound-generation API,
   saved as originals in wobblers/assets/originals/sfx/<name>-<i>.mp3 (art source:
   not deployed). Existing originals are kept, so a run resumes; delete one to remake it.
2. Every original is processed into wobblers/assets/sfx/<name>-<i>.mp3: lead-in silence
   trimmed (so hits land on time), tail trimmed with a short fade, mono, peak-normalised.
3. wobblers/assets/sfx/index.json lists the variants per sound for src/audio.js
   (and `_levels` from each sound's `level`). Loops get a crossfaded seam instead of trims.

`hold: true` on a sound keeps it out of the game (no processed file, not in the index) until
the owner has listened to it: ambient loops always start held.

The key is only read from the environment; never write it into a file.
"""
import json, os, subprocess, sys, tempfile, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
ORIG = os.path.join(ROOT, 'assets', 'originals', 'sfx')
OUT = os.path.join(ROOT, 'assets', 'sfx')
API = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128'


def generate(spec, style, key):
    os.makedirs(ORIG, exist_ok=True)
    for i in range(1, spec['n'] + 1):
        path = os.path.join(ORIG, f"{spec['name']}-{i}.mp3")
        if os.path.exists(path):
            continue
        req = {'text': f"{spec['prompt']}. {style}", 'duration_seconds': spec['dur'], 'prompt_influence': 0.6}
        if spec.get('loop'):
            req['loop'] = True
        body = json.dumps(req)
        for attempt in range(4):
            r = subprocess.run(['curl', '-sS', '-o', path, '-w', '%{http_code}', API, '-H', f'xi-api-key: {key}',
                                '-H', 'Content-Type: application/json', '-d', body], capture_output=True, text=True)
            if r.stdout == '200':
                print('made', os.path.basename(path), flush=True)
                break
            err = open(path, 'rb').read()[:300] if os.path.exists(path) else r.stderr
            if os.path.exists(path):
                os.remove(path)
            print('failed', os.path.basename(path), r.stdout, err, flush=True)
            time.sleep(2 ** (attempt + 1))


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def process_loop(src, dst):
    a = decode(src)
    if not len(a) or np.abs(a).max() < 1e-4:
        print('silent', src)
        return False
    # generated takes often fade in / out: drop 1.5 s at each end so the seam joins full-level sound
    cut = 66150 if len(a) > 8 * 44100 else 0
    a = a[cut:len(a) - cut]
    a /= np.abs(a).max()
    x = min(len(a) // 4, 3 * 44100)  # 3 s equal-power crossfade: the tail fades into the head
    t = np.linspace(0, np.pi / 2, x)
    head, tail = a[:x].copy(), a[-x:]
    a = a[x:].copy()
    a[-x:] = tail * np.cos(t) + head * np.sin(t)
    a *= 10 ** (-3 / 20) / max(1e-6, np.abs(a).max())
    with tempfile.NamedTemporaryFile(suffix='.f32') as f:
        a.astype(np.float32).tofile(f.name)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', f.name,
                        '-b:a', '96k', dst], check=True)
    return True


def process(src, dst):
    a = decode(src)
    if not len(a) or np.abs(a).max() < 1e-4:
        print('silent', src)
        return False
    a /= np.abs(a).max()
    w = 220  # 5 ms windows
    env = np.array([np.sqrt(np.mean(a[i:i + w] ** 2)) for i in range(0, len(a), w)])
    loud = np.where(env > 10 ** (-40 / 20))[0]
    start = max(0, loud[0] * w - 220)  # keep 5 ms before the onset
    tail = np.where(env > 10 ** (-55 / 20))[0]
    end = min(len(a), (tail[-1] + 1) * w + 2205)
    a = a[start:end]
    fade = min(len(a) // 4, 4410)  # up to 100 ms fade out, 3 ms fade in
    a[-fade:] *= np.linspace(1, 0, fade)
    a[:132] *= np.linspace(0, 1, 132)
    a *= 10 ** (-1 / 20) / max(1e-6, np.abs(a).max())
    with tempfile.NamedTemporaryFile(suffix='.f32') as t:
        a.astype(np.float32).tofile(t.name)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', t.name,
                        '-b:a', '96k', dst], check=True)
    return True


def main():
    cfg = json.load(open(os.path.join(HERE, 'sfx.json')))
    only = set(sys.argv[1:])
    key = os.environ.get('ELEVENLABS_API_KEY')
    for s in cfg['sounds']:
        if only and s['name'] not in only:
            continue
        if key:
            generate(s, cfg['style'], key)
    os.makedirs(OUT, exist_ok=True)
    index = {}
    for s in cfg['sounds']:
        for i in range(1, s['n'] + 1):
            src = os.path.join(ORIG, f"{s['name']}-{i}.mp3")
            dst = os.path.join(OUT, f"{s['name']}-{i}.mp3")
            if s.get('hold'):  # generated, but waiting for the owner to approve it: not in the game
                if os.path.exists(dst):
                    os.remove(dst)
                continue
            if not os.path.exists(src):
                continue
            proc = process_loop if s.get('loop') else process
            if (only and s['name'] not in only and os.path.exists(dst)) or proc(src, dst):
                index.setdefault(s['name'], []).append(f"assets/sfx/{s['name']}-{i}.mp3")
    index['_levels'] = {s['name']: s.get('level', 1) for s in cfg['sounds']}
    index['_loops'] = [s['name'] for s in cfg['sounds'] if s.get('loop') and not s.get('hold')]
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
    print('index:', {k: len(v) for k, v in index.items()})


if __name__ == '__main__':
    main()
