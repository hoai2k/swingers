#!/usr/bin/env python3
"""Make the short musical stingers listed in stingers.json with the ElevenLabs Music API.

    ELEVENLABS_API_KEY=... python3 wobblers/dev/sfx/stingers.py [file name ...]

Each original is kept in <game>/assets/originals/music/ (art source: not deployed; an
existing original is reused, delete it to remake it). The game copy is trimmed: lead-in
silence cut, the tail cut after the last sound with a 0.4 s fade, peak at -1 dB, 192 kbps.
The key is only read from the environment; never write it into a file.
"""
import json, os, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
API = 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192'


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', '44100', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def process(src, dst):
    a = decode(src)
    mono = np.abs(a).max(axis=1)
    w = 441  # 10 ms windows
    env = np.array([mono[i:i + w].max() for i in range(0, len(mono), w)])
    peak = env.max()
    loud = np.where(env > peak * 10 ** (-40 / 20))[0]
    start = max(0, loud[0] * w - 441)
    tail = np.where(env > peak * 10 ** (-50 / 20))[0]
    end = min(len(a), (tail[-1] + 1) * w + 4410)
    a = a[start:end]
    fade = min(len(a) // 4, 17640)  # up to 0.4 s
    a[-fade:] *= np.linspace(1, 0, fade)[:, None]
    a *= 10 ** (-1 / 20) / max(1e-6, np.abs(a).max())
    with tempfile.NamedTemporaryFile(suffix='.f32') as t:
        a.astype(np.float32).tofile(t.name)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', t.name, '-b:a', '192k', dst], check=True)
    return len(a) / 44100


def main():
    cfg = json.load(open(os.path.join(HERE, 'stingers.json')))
    only = set(sys.argv[1:])
    key = os.environ.get('ELEVENLABS_API_KEY')
    for s in cfg['stingers']:
        name = os.path.basename(s['out'])
        if only and name not in only:
            continue
        game = s['out'].split('/')[0]
        orig = os.path.join(REPO, game, 'assets', 'originals', 'music', name)
        dst = os.path.join(REPO, s['out'])
        os.makedirs(os.path.dirname(orig), exist_ok=True)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(orig):
            if not key:
                print('no key and no original:', name)
                continue
            body = json.dumps({'prompt': s['prompt'], 'music_length_ms': s['ms'], 'force_instrumental': True})
            r = subprocess.run(['curl', '-sS', '-o', orig, '-w', '%{http_code}', API, '-H', f'xi-api-key: {key}',
                                '-H', 'Content-Type: application/json', '-d', body], capture_output=True, text=True)
            if r.stdout != '200':
                print('failed', name, r.stdout, open(orig, 'rb').read()[:300] if os.path.exists(orig) else r.stderr)
                if os.path.exists(orig):
                    os.remove(orig)
                continue
        print(name, f'{process(orig, dst):.2f} s')


if __name__ == '__main__':
    main()
