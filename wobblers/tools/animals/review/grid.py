# python3 grid.py <sheet.png> <out.png> [row rows]: the sheet's side and top views cropped to the animal's box,
# with a u / v grid (fractions) to read design coordinates from. See ../METHOD.md.
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from designed import Sheet
os.makedirs(os.path.dirname(os.path.abspath(sys.argv[2])), exist_ok=True)
sheet, out, row, rows = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0, int(sys.argv[4]) if len(sys.argv) > 4 else 1
sh = Sheet(sheet, 1.0, row=row, rows=rows, land=True)
S, T = sh.S, sh.T
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
def draw(rgb, V, label):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8) if rgb.dtype != np.uint8 else rgb).convert('RGB')
    im = im.crop((V.c0, V.r0, V.c1, V.r1)); sc = 900 / im.width; im = im.resize((900, int(im.height * sc)))
    d = ImageDraw.Draw(im)
    for i in range(11):
        x = i / 10 * 899; y = i / 10 * (im.height - 1)
        d.line([(x, 0), (x, im.height)], fill=(255, 0, 0) if i % 5 == 0 else (255, 140, 140), width=1)
        d.line([(0, y), (900, y)], fill=(0, 0, 255) if i % 5 == 0 else (140, 140, 255), width=1)
        d.text((x + 2, 2), f'{i/10:.1f}', fill=(200, 0, 0), font=font); d.text((2, y + 2), f'{i/10:.1f}', fill=(0, 0, 200), font=font)
    d.text((300, im.height - 18), label, fill=(0, 0, 0), font=font)
    return im
a = draw(sh.sp, S, 'side: u = column fraction (tail 0 .. nose 1), v = row fraction (top 0 .. ground 1)')
b = draw(sh.tp, T, 'top: u along, v across')
o = Image.new('RGB', (900, a.height + b.height + 10), 'white'); o.paste(a, (0, 0)); o.paste(b, (0, a.height + 10)); o.save(out)
print('side box px', S.c1 - S.c0, 'x', S.r1 - S.r0, ' top box', T.c1 - T.c0, 'x', T.r1 - T.r0)
