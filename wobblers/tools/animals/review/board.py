# python3 board.py row <key> <tag>          -> $REVIEW_DIR/boards/<key>_<tag>.png from turn.cjs's tv_<key>_{0,1,2}.png (side / top / 3-4)
# python3 board.py make <key> <sheet.png>  -> $REVIEW_DIR/boards/<key>.jpg: the reference sheet, then every saved row (oldest first), labelled
# Name rows so they tell the story: "1 old procedural stand-in", "2 designed from the sheet v1", ... See ../METHOD.md.
import sys, os, glob
from PIL import Image, ImageChops, ImageDraw, ImageFont
SP = os.environ.get('REVIEW_DIR', '/tmp/animal-review'); os.makedirs(SP + '/boards', exist_ok=True)
REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../assets/reference/animals/')
def crop(im):
    bg = Image.new('RGB', im.size, im.getpixel((2, 2)))
    box = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 12 else 0).getbbox() or (0, 0, im.width, im.height)
    pad = 12; box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
    c = im.crop(box); t = Image.new('RGB', (640, 360), im.getpixel((2, 2)))
    c.thumbnail((620, 340)); t.paste(c, ((640 - c.width) // 2, (360 - c.height) // 2)); return t
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 40)
except Exception: font = ImageFont.load_default()
cmd, key = sys.argv[1], sys.argv[2]
if cmd == 'row':
    row = Image.new('RGB', (1920, 360), 'white')
    for i in range(3): row.paste(crop(Image.open(f'{SP}/tv_{key}_{i}.png').convert('RGB')), (i * 640, 0))
    row.save(f'{SP}/boards/{key}_{sys.argv[3]}.png')
else:
    ref = Image.open(REF + sys.argv[3]).convert('RGB').resize((1920, 1080))
    rows = sorted(glob.glob(f'{SP}/boards/{key}_*.png'), key=os.path.getmtime)
    H = 1080 + 60 + sum(420 for _ in rows)
    out = Image.new('RGB', (1920, H), 'white'); d = ImageDraw.Draw(out)
    d.text((20, 10), f'{key}: reference sheet', fill='black', font=font); out.paste(ref, (0, 60)); y = 1140
    for r in rows:
        tag = os.path.basename(r)[len(key) + 1:-4]
        d.text((20, y + 8), tag, fill='black', font=font); out.paste(Image.open(r), (0, y + 60)); y += 420
    out.resize((out.width // 2, out.height // 2)).save(f'{SP}/boards/{key}.jpg', quality=85)
