#!/usr/bin/env python3
"""Make sign boards transparent around their rounded edges.

Generated sign images often sit on a flat background (black, white or a
colour) instead of filling the frame. This flood-fills that background from
the image border (only when most of the border is one colour, so full-bleed
boards are left alone), makes it transparent, and recentres the board on a
4:1 canvas so the game's 4:1 sign planes don't stretch it.

The untouched originals are kept in assets/originals/signs/ (not loaded by
the game). Re-run after adding signs, then run build_manifest.py.
"""
import shutil
from collections import deque
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'assets'
src_dir, orig_dir = root / 'signs', root / 'originals' / 'signs'
orig_dir.mkdir(parents=True, exist_ok=True)
TOL = 40

def close(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2])) <= TOL

for f in sorted(src_dir.glob('*.png')):
    orig = orig_dir / f.name
    if not orig.exists():
        shutil.copy2(f, orig)
    im = Image.open(orig).convert('RGBA')
    w, h = im.size
    px = im.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    ref = px[0, 0]
    share = sum(close(px[p], ref) for p in border) / len(border)
    if share < 0.6:
        print(f'{f.name:22s} full-bleed, left as is')
        if orig.read_bytes() != f.read_bytes():
            shutil.copy2(orig, f)
        continue
    seen = bytearray(w * h)
    q = deque(p for p in border if close(px[p], ref))
    for x, y in q:
        seen[y * w + x] = 1
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and close(px[nx, ny], ref):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    a = im.split()[3]
    bbox = a.getbbox()
    # if the "background" was really the board itself (only letters remain),
    # keep the original full-bleed image
    hist = a.crop(bbox).histogram()
    solid = 1 - hist[0] / sum(hist)
    if solid < 0.8:
        print(f'{f.name:22s} board shares the background colour ({solid:.0%} solid), left as is')
        shutil.copy2(orig, f)
        continue
    board = im.crop(bbox)
    bw, bh = board.size
    # recentre on a 4:1 canvas
    cw, ch = (bw, round(bw / 4)) if bw / bh >= 4 else (round(bh * 4), bh)
    out = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    out.paste(board, ((cw - bw) // 2, (ch - bh) // 2))
    out = out.resize((1024, 256), Image.LANCZOS)
    out.save(f)
    print(f'{f.name:22s} background removed ({share:.0%} of the border), board {bw}x{bh}')
