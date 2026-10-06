#!/usr/bin/env python3
"""Build web-ready copies of the generated art into assets/web/.

The originals in assets/{bg,heads,tiles,ui} stay untouched (they're the
source of truth from image generation). This script:
  - re-encodes the 2400x1350 backdrops + key art as 1920x1080 JPGs
    (~30 MB of PNG -> a few MB),
  - crossfades the left/right edges of every horizontal tile so it repeats
    without a visible seam,
  - shrinks head sprites to 256x256 (they're drawn ~40px tall).
Run:  python3 tools/build_assets.py   (needs Pillow)
"""
import glob, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'assets', 'web')
os.makedirs(OUT, exist_ok=True)

def out(name):
    return os.path.join(OUT, name)

def seamless(im, k):
    """Crossfade the last k columns into the first k: the result is k px
    narrower and its right edge flows straight into its left edge."""
    w, h = im.size
    body = im.crop((0, 0, w - k, h))
    tail = im.crop((w - k, 0, w, h))
    for x in range(k):
        t = x / k            # 0 at the seam -> pure tail, k -> pure body
        a = body.crop((x, 0, x + 1, h))
        b = tail.crop((x, 0, x + 1, h))
        body.paste(Image.blend(b, a, t), (x, 0))
    return body

for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'bg', '*.png'))):
    name = os.path.splitext(os.path.basename(f))[0]
    Image.open(f).convert('RGB').resize((1920, 1080), Image.LANCZOS).save(out(f'bg_{name}.jpg'), quality=84, optimize=True)

Image.open(os.path.join(ROOT, 'assets', 'ui', 'keyart.png')).convert('RGB') \
    .resize((1920, 1080), Image.LANCZOS).save(out('keyart.jpg'), quality=84, optimize=True)

def edge_seam(im):
    """Mean per-channel difference between the first and last column."""
    rgb = im.convert('RGB')
    w, h = rgb.size
    tot = 0
    for y in range(h):
        a, b = rgb.getpixel((0, y)), rgb.getpixel((w - 1, y))
        tot += sum(abs(p - q) for p, q in zip(a, b))
    return tot / h / 3

for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'tiles', '*.png'))):
    im = Image.open(f)
    im = im.convert('RGBA' if im.mode == 'RGBA' else 'RGB')
    # only touch tiles with a visible seam (periodic art like spikes is
    # already seamless and a crossfade would break its rhythm)
    if edge_seam(im) > 5:
        im = seamless(im, im.width // 8)
    im.save(out('tile_' + os.path.basename(f)), optimize=True)

for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'heads', '*.png'))):
    Image.open(f).convert('RGBA').resize((256, 256), Image.LANCZOS) \
        .save(out('head_' + os.path.basename(f)), optimize=True)

for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'ui', 'icon_*.png'))):
    Image.open(f).convert('RGBA').resize((64, 64), Image.LANCZOS).save(out(os.path.basename(f)), optimize=True)

# power-up icons + effect sprites (round 3)
for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'ui', 'power_*.png'))
                + glob.glob(os.path.join(ROOT, 'assets', 'ui', 'fx_*.png'))):
    Image.open(f).convert('RGBA').resize((128, 128), Image.LANCZOS).save(out(os.path.basename(f)), optimize=True)

Image.open(os.path.join(ROOT, 'assets', 'ui', 'logo.png')).convert('RGBA') \
    .resize((960, 300), Image.LANCZOS).save(out('logo.png'), optimize=True)

# level objects (round 4): keep aspect, long side at most 512
for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'ui', 'obj_*.png'))):
    im = Image.open(f).convert('RGBA')
    k = 512 / max(im.size)
    if k < 1:
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im.save(out(os.path.basename(f)), optimize=True)

# favicon: Pip, the cheerful Rounders rookie
fav = os.path.join(ROOT, 'assets', 'characters', 'pip.png')
if os.path.exists(fav):
    Image.open(fav).convert('RGBA').resize((64, 64), Image.LANCZOS).save(out('favicon.png'), optimize=True)

# title screen art (optional until delivered)
tb = os.path.join(ROOT, 'assets', 'ui', 'title-bg.png')
if os.path.exists(tb):
    Image.open(tb).convert('RGB').resize((1920, 1080), Image.LANCZOS).save(out('title_bg.jpg'), quality=86, optimize=True)
la = os.path.join(ROOT, 'assets', 'ui', 'logo-arch.png')
if os.path.exists(la):
    im = Image.open(la).convert('RGBA')
    im.resize((1400, round(1400 * im.height / im.width)), Image.LANCZOS).save(out('logo_arch.png'), optimize=True)
print('built', len(os.listdir(OUT)), 'files into assets/web/')
