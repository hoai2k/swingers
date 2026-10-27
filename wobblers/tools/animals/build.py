"""Build the Wobblers' animal models from their reference sheets (dev tool; needs numpy, Pillow, scipy).

    python3 wobblers/tools/animals/build.py [name ...]      # all of CONFIG by default
    python3 wobblers/tools/animals/build.py shark --debug   # also writes debug images

Each sheet (assets/reference/animals/, image round 16) shows the animal side-on (facing right)
and from above (head right) at the same scale. From those two silhouettes:

1. body: the silhouette opened with a disc (thin parts removed). Its 3D shape is the body hull
   whose cross-section at every z is the ellipse spanned by the side view's height there and
   the top view's width there (`ellipse hull`).
2. the thin parts the opening removed, by kind (CONFIG, auto-guessed when not given):
   'fin'   a thin plate at x = 0 in the side view's outline (dorsal / tail / anal fins),
   'tube'  a round limb inflated from its side-view outline (tails, necks, legs at +-x),
   'wing'  a plate in the top view's outline, spreading out sideways and rising / drooping to
           the height its tip has in the side view (flippers, pectoral fins, wings, flukes),
   'ttube' a round limb inflated from its top-view outline (tentacles, crab legs),
   'skip'  ignored (paws seen from above: the side view's legs already make them).
3. all parts smooth-unioned into one distance field, meshed (surface nets), normals from the
   field, each vertex given the rig part it moves with (critters.js: legs, tail, wings, head)
   and a weight that fades where the part meets the body, so limbs bend like rubber.
4. paint: the side and top views themselves, background filled in from the nearest animal
   pixel, projected onto the model per pixel in the game (critters.js `proj`).

Output in assets/animals/: <name>.bin (mesh), <name>.json (layout, parts, projection boxes),
<name>_side.jpg and <name>_top.jpg (paint). The game loads only those (animalgeo.js).
"""
import json, os, struct, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(__file__))
from segment import load, panel, mask, drop_ground_shadow

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'animals')
PART = {'body': 0, 'FL': 1, 'FR': 2, 'BL': 3, 'BR': 4, 'TAIL': 5, 'HEAD': 6, 'WING_L': 7, 'WING_R': 8, 'JAW': 9}

# name: sheet, row / rows of the sheet, length (m, nose to tail tip in the side view), land
# (feet on y = 0) or not (centred), open: opening radius as a fraction of the body's height,
# res: cells along the longest side, parts: overrides by component (see --debug labels)
CONFIG = {
    # sea: tails seen from above duplicate the side view's (skip); flukes are flat (from above);
    # strips under the body are ground shadows (skip); snout tips are rounded (tube)
    'shark':     dict(sheet='shark.png', L=2.8, open=0.22, res=110, thick=0.012,
                      parts={'s2': 'skip', 's4': 'tube', 't0': 'skip', 't1': 'skip'}),
    'dolphin':   dict(sheet='dolphin.png', L=2.2, open=0.22, res=100, thick=0.012,
                      parts={'s1': 'skip', 's2': 'tube', 't0': {'kind': 'wing', 'flat': True}, 't1': {'kind': 'wing', 'flat': True}, 't4': 'skip', 't5': 'skip'}),
    'whale':     dict(sheet='whale.png', L=9.0, open=0.2, res=110, thick=0.012,
                      parts={'s1': 'skip', 't0': {'kind': 'wing', 'flat': True}, 't1': {'kind': 'wing', 'flat': True}}),
    'puffer':    dict(sheet='pufferfish.png', L=0.5, open=0.18, res=48, thick=0.02,
                      parts={'t0': 'skip', 't1': 'skip'}),
    'clownfish': dict(sheet='reef_fish.png', row=0, rows=4, L=0.4, open=0.2, res=36, thick=0.025,
                      parts={'s0': 'skip', 't0': 'skip', 't1': 'skip', 't2': 'skip'}),
    'blueTang':  dict(sheet='reef_fish.png', row=1, rows=4, L=0.42, open=0.2, res=36, thick=0.025,
                      parts={'s1': 'skip', 't0': 'skip', 't1': 'skip'}),
    'yellowTang': dict(sheet='reef_fish.png', row=2, rows=4, L=0.4, open=0.2, res=36, thick=0.025,
                      parts={'s1': 'tube', 't0': 'skip', 't1': 'skip', 't4': 'skip'}),
    'moorishIdol': dict(sheet='reef_fish.png', row=3, rows=4, L=0.4, open=0.2, res=36, thick=0.025,
                      parts={'s3': 'tube', 't0': 'skip', 't1': 'skip', 't4': 'skip'}),
    # land: feet on y = 0; side parts reaching the ground are legs, behind the body a tail,
    # above the head ears (auto); paws seen from above are skipped
    'tiger':     dict(sheet='tiger.png', L=2.4, open=0.3, res=110, thick=0.02, land=True),
    'leopard':   dict(sheet='leopard.png', L=2.1, open=0.3, res=110, thick=0.02, land=True, belly=0.42, cuts=[(0.5, 0.3, 0.5, 1.0)]),
    'monkey':    dict(sheet='monkey.png', L=1.0, open=0.3, res=96, thick=0.02, land=True),
    'hog':       dict(sheet='river_hog.png', L=1.3, open=0.3, res=96, thick=0.02, land=True, belly=0.33, cuts=[(0.5, 0.3, 0.5, 1.0)]),
    'capybara':  dict(sheet='capybara.png', L=1.1, open=0.3, res=96, thick=0.02, land=True, belly=0.24, cuts=[(0.5, 0.3, 0.5, 1.0)], parts={'s1': 'skip'}),
    'tapir':     dict(sheet='tapir.png', L=1.9, open=0.3, res=96, thick=0.02, land=True),
    'croc':      dict(sheet='crocodile.png', L=3.0, open=0.3, res=110, thick=0.02, land=True, belly=0.3, cuts=[(0.5, 0.3, 0.5, 1.0)]),
}


# ---- 2D helpers -------------------------------------------------------------------------------
def sdf2(m):
    """signed distance (px) of a 2D mask: negative inside"""
    return ndi.distance_transform_edt(~m) - ndi.distance_transform_edt(m)


def disk(r):
    r = max(1, int(round(r)))
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def bilin(img, u, v):
    """sample a 2D array at float pixel coords (u = column, v = row), clamped"""
    h, w = img.shape
    u = np.clip(u, 0, w - 1.001); v = np.clip(v, 0, h - 1.001)
    u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fu, fv = u - u0, v - v0
    a, b, c, d = img[v0, u0], img[v0, u0 + 1], img[v0 + 1, u0], img[v0 + 1, u0 + 1]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


def fill_bg(rgb, m):
    """every background pixel takes the colour of the nearest animal pixel (no grey halo when projected)"""
    _, (iy, ix) = ndi.distance_transform_edt(~m, return_indices=True)
    return rgb[iy, ix]


# ---- view: a panel's silhouette in metres -----------------------------------------------------
def ellipse(rx, ry):
    rx, ry = max(1, int(round(rx))), max(1, int(round(ry)))
    y, x = np.mgrid[-ry:ry + 1, -rx:rx + 1]
    return (x / rx) ** 2 + (y / ry) ** 2 <= 1


class View:
    def __init__(self, rgb, m, open_frac, land=False, cuts=(), belly=0):
        self.rgb, self.m = rgb, m
        rows = np.where(m.any(axis=1))[0]; cols = np.where(m.any(axis=0))[0]
        self.r0, self.r1, self.c0, self.c1 = rows[0], rows[-1], cols[0], cols[-1]
        # body: opened with a disc ~ open_frac of the typical height of the silhouette; a land
        # animal's with a wide flat ellipse (a torso is long, legs are upright: legs drop out
        # even where the near and far ones overlap under the belly)
        heights = m.sum(axis=0); hmed = np.percentile(heights[heights > 0], 75)
        self.rho = max(2, open_frac * hmed)
        if land:
            body = ndi.binary_opening(m, structure=ellipse(0.16 * (self.c1 - self.c0), self.rho * 0.7))
            if belly:  # nothing below the belly line is body (crouched animals: legs merge under it)
                body[int(self.r1 - belly * (self.r1 - self.r0)):, :] = False
                body = ndi.binary_opening(body, structure=disk(self.rho * 0.5))
        else:
            body = ndi.binary_opening(m, structure=disk(self.rho))
        self.cuts = cuts
        lab, n = ndi.label(body)
        if n > 1:  # keep the biggest blob (and anything at least a fifth of it: a head on a neck)
            sizes = ndi.sum(body, lab, range(1, n + 1))
            body = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.2])
        self.body = body
        self.recomp()

    def recomp(self, split_row=None):
        m, body = self.m, self.body
        resid = m & ~ndi.binary_dilation(body, iterations=2)
        resid = ndi.binary_opening(resid, iterations=1)
        # cuts: lines (fractions of the silhouette's box) that separate parts touching each other
        for (ax, ay, bx, by) in getattr(self, 'cuts', ()):
            W_, H_ = self.c1 - self.c0, self.r1 - self.r0
            n = 400
            for t in np.linspace(0, 1, n):
                x = int(self.c0 + (ax + (bx - ax) * t) * W_); y = int(self.r0 + (ay + (by - ay) * t) * H_)
                resid[max(0, y - 2):y + 3, max(0, x - 2):x + 3] = False
        if split_row is not None:  # top view: a part never crosses the centre line (left / right wings)
            resid[int(round(split_row)), :] = False
        lab, n = ndi.label(resid)
        self.comps = []
        min_area = max(30, body.sum() * 0.012)  # specks, spikes: the paint shows them
        for i in range(1, n + 1):
            cm = lab == i
            if cm.sum() < min_area:
                continue
            # grow it back into the body a little so it attaches
            grown = cm | (ndi.binary_dilation(cm, iterations=int(self.rho * 0.6) + 2) & m)
            ys, xs = np.where(cm)
            self.comps.append(dict(mask=grown, core=cm, area=int(cm.sum()), cx=float(xs.mean()), cy=float(ys.mean()), bbox=(xs.min(), xs.max(), ys.min(), ys.max())))
        self.comps.sort(key=lambda c: c['cx'])


def build(name, debug=False):
    C = CONFIG[name]
    img = load(C['sheet'])
    rows, row = C.get('rows', 1), C.get('row', 0)
    sp, tp = panel(img, row, 0, rows), panel(img, row, 1, rows)
    land = C.get('land', False)
    sm = mask(sp)
    if land:
        sm = drop_ground_shadow(sp, sm, C.get('shadow_band', 0.45))
    S = View(sp, sm, C['open'], land, C.get('cuts', ()), C.get('belly', 0))
    T = View(tp, mask(tp), C['open'])
    # scale: the side silhouette's length is L; the top view is matched by the body's length
    ks = C['L'] / (S.c1 - S.c0)                      # metres per side pixel
    sb = np.where(S.body.any(axis=0))[0]; tb = np.where(T.body.any(axis=0))[0]
    kt = ks * (sb[-1] - sb[0]) / max(1, tb[-1] - tb[0])  # metres per top pixel
    if land:  # the opened bodies differ between views (legs, shoulders); the whole outlines don't
        kt = ks * (S.c1 - S.c0) / max(1, T.c1 - T.c0)
    zs = lambda col: (col - S.c0) * ks - C['L'] / 2  # side column -> z
    zt = (lambda col: (col - T.c1) * kt + zs(S.c1)) if land else (lambda col: (col - tb[0]) * kt + zs(sb[0]))  # top column -> z (snouts / bodies aligned)
    # vertical: land animals stand on y = 0, swimmers are centred on the body
    brow = np.where(S.body.any(axis=1))[0]
    ybase = S.r1 if land else (brow[0] + brow[-1]) / 2
    ys_ = lambda r: (ybase - r) * ks
    # top view axis: the body's centre line
    trow = np.where(T.body.any(axis=1))[0]
    axis_row = (trow[0] + trow[-1]) / 2
    xt = lambda r: (r - axis_row) * kt
    # inverse maps (metres -> pixels)
    col_s = lambda z: (z + C['L'] / 2) / ks + S.c0
    row_s = lambda y: ybase - y / ks
    col_t = (lambda z: (z - zs(S.c1)) / kt + T.c1) if land else (lambda z: (z - zs(sb[0])) / kt + tb[0])
    row_t = lambda x: x / kt + axis_row

    # ---- grid -----------------------------------------------------------------------------------
    zmin, zmax = min(zs(S.c0), zt(T.c0)), max(zs(S.c1), zt(T.c1))
    ymin, ymax = ys_(S.r1), ys_(S.r0)
    xmax = max(abs(xt(T.r0)), abs(xt(T.r1)))
    h = max(zmax - zmin, ymax - ymin, 2 * xmax) / C['res']
    pad = 3 * h
    Z = np.arange(zmin - pad, zmax + pad, h); Y = np.arange(ymin - pad, ymax + pad, h); X = np.arange(-xmax - pad, xmax + pad, h)
    gz, gy, gx = np.meshgrid(Z, Y, X, indexing='ij')                      # [z, y, x]
    us, vs = col_s(gz), row_s(gy)                                         # side pixel of each voxel
    ut, vt = col_t(gz), row_t(gx)                                         # top pixel of each voxel
    big = 1e3

    # ---- body: ellipse hull ---------------------------------------------------------------------
    def runs_map(bm):
        """per pixel inside the mask: centre and half-length of its vertical run (in px)"""
        H, W = bm.shape
        cen = np.zeros((H, W), np.float32); half = np.zeros((H, W), np.float32)
        for c in range(W):
            col = bm[:, c]
            if not col.any():
                continue
            d = np.diff(np.concatenate([[0], col.astype(np.int8), [0]]))
            starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
            for a, b in zip(starts, ends):
                cen[a:b, c] = (a + b - 1) / 2; half[a:b, c] = max(0.5, (b - a) / 2)
        return cen, half
    sc, sh = runs_map(S.body)
    # the body seen from above: the side view's half-height at each z times the body's width /
    # height ratio (a low percentile over z, so fins sticking out sideways don't count), about
    # the top view's centre line. Anything wider is a part (fins, flippers, wings, paws).
    zcols = np.arange(sb[0], sb[-1] + 1)
    hz = np.array([S.body[:, c].sum() for c in zcols]) / 2 * ks                       # half height (m) at side columns
    zz = zs(zcols)
    tw = []
    for z, hh in zip(zz, hz):
        c = int(round(col_t(z)))
        tm_ = T.body if land else T.m   # land: the opened top view (legs and paws sticking out removed)
        if 0 <= c < T.m.shape[1] and tm_[:, c].any() and hh > 0:
            r = np.where(tm_[:, c])[0]
            tw.append(max(abs(xt(r[0])), abs(xt(r[-1]))) / hh)
    ratio = (C.get('ratio') or float(np.percentile(tw, C.get('ratio_pct', 40)))) if tw else 1.0
    H_, W_ = T.m.shape
    # ...and never wider than the top view's own half-width with the fins' spikes opened away
    # (a 1D opening along z, window ~ a quarter of the length)
    tw_prof = np.array([max(abs(xt(np.where(T.m[:, c])[0][0])), abs(xt(np.where(T.m[:, c])[0][-1]))) if T.m[:, c].any() else 0 for c in range(W_)])
    win = max(3, int(0.25 * (tb[-1] - tb[0])))
    # (over the animal's own extent only: the empty panel beyond the snout must not erode the head)
    ext = np.where(tw_prof > 0)[0]
    tw_open = np.zeros_like(tw_prof)
    seg = tw_prof[ext[0]:ext[-1] + 1]
    tw_open[ext[0]:ext[-1] + 1] = ndi.maximum_filter1d(ndi.minimum_filter1d(seg, win, mode='nearest'), win, mode='nearest')
    tbody = np.zeros_like(T.m)
    for c in range(W_):
        z = zt(c)
        if z < zz[0] or z > zz[-1]:
            continue
        hh = min(np.interp(z, zz, hz) * ratio, tw_open[c] if tw_open[c] > 0 else 1e9)
        r0, r1 = int(np.floor(row_t(-hh))), int(np.ceil(row_t(hh)))
        tbody[max(0, r0):min(H_, r1 + 1), c] = True
    T.body = tbody & T.m
    T.recomp(axis_row)
    tc, th = runs_map(T.body)
    s_in = bilin(S.body.astype(np.float32), us, vs) > 0.5
    t_in = bilin(T.body.astype(np.float32), ut, vt) > 0.5
    Hc, Hh = bilin(sc, us, vs), bilin(sh, us, vs)                         # side run centre / half height (px)
    Wc, Wh = bilin(tc, ut, vt), bilin(th, ut, vt)
    ey = (vs - Hc) / np.maximum(Hh, 0.5); ex = (vt - Wc) / np.maximum(Wh, 0.5)
    f = np.sqrt(ey * ey + ex * ex)
    rad = np.minimum(Hh * ks, Wh * kt)
    d_ell = np.where(s_in & t_in, (f - 1) * rad, big)
    d_body = np.maximum.reduce([bilin(sdf2(S.body), us, vs) * ks, bilin(sdf2(T.body), ut, vt) * kt, d_ell])
    fields = [('body', d_body, None)]

    # ---- thin parts ------------------------------------------------------------------------------
    kinds = C.get('parts', {})
    body_top = lambda zcol: (np.where(S.body[:, int(np.clip(zcol, 0, S.body.shape[1] - 1))])[0] if S.body[:, int(np.clip(zcol, 0, S.body.shape[1] - 1))].any() else None)
    labels = []
    def kind_of(key, default, c):
        k = kinds.get(key, default)
        if isinstance(k, dict):  # {'kind': ..., plus options merged into the component: flat, x, y, part...}
            c.update({kk: v for kk, v in k.items() if kk != 'kind'}); k = k.get('kind', default)
        return k
    bcols = np.where(S.body.any(axis=0))[0]; brows_ = np.where(S.body.any(axis=1))[0]
    bz0, bz1, bmid = bcols[0], bcols[-1], (bcols[0] + bcols[-1]) / 2
    def land_kind(c):
        x0, x1, y0, y1 = c['bbox']
        if y1 >= S.r1 - 0.1 * (S.r1 - S.r0):
            return 'leg'                       # reaches the ground
        if c['cx'] < bz0 + 0.1 * (bz1 - bz0):
            return 'tail'                      # behind the body
        if y1 < brows_[0] + 0.25 * (brows_[-1] - brows_[0]) and c['cx'] > bmid:
            return 'ear'                       # above the head
        if c['cx'] > bz1 - 0.15 * (bz1 - bz0):
            return 'hull'                      # in front: the head
        return 'tube'
    for i, c in enumerate(S.comps):
        labels.append(('s', i, kind_of(f's{i}', land_kind(c) if land else 'fin', c), c))
    # legs: per front / back group only the biggest outline (near and far legs overlap side-on)
    legs = [l for l in labels if l[2] == 'leg']
    for grp in (lambda c: c['cx'] > bmid, lambda c: c['cx'] <= bmid):
        g = [l for l in legs if grp(l[3])]
        for l in g:
            if l is not max(g, key=lambda q: q[3]['area']):
                labels[labels.index(l)] = (l[0], l[1], 'skip', l[3])
    for i, c in enumerate(T.comps):
        labels.append(('t', i, kind_of(f't{i}', 'skip' if land else 'wing', c), c))
    thick = max(C['thick'] * C['L'], 1.1 * h)  # plates thinner than ~2 cells break up when meshed
    for view, i, kind, c in labels:
        if kind == 'skip':
            continue
        cm = c['mask']
        s2 = sdf2(cm)
        if view == 's' and kind == 'fin':
            depth = np.clip(-s2 / max(1, -s2.min()), 0, 1)                 # thicker toward the middle of the fin
            t = thick * (0.7 + 0.3 * bilin(depth.astype(np.float32), us, vs))
            # ...and round where the top view is solid there too (a tail stalk), up to its width
            e = np.maximum(-s2, 0).astype(np.float32)
            R = ndi.maximum_filter(e, size=int(max(3, e.max() * 1.5)))
            infl = bilin(np.sqrt(np.maximum(e * (2 * R - e), 0)) * ks, us, vs)
            cap = np.interp(ut, np.arange(len(tw_open)), tw_open)
            t = np.maximum(t, np.minimum(infl, cap))
            d = np.maximum(bilin(s2, us, vs) * ks, np.abs(gx) - t)
            fields.append((f's{i}:fin', d, c))
        elif view == 's' and kind == 'tube':
            e = np.maximum(-s2, 0).astype(np.float32)
            R = ndi.maximum_filter(e, size=int(max(3, e.max() * 1.5)))
            hw = np.sqrt(np.maximum(e * (2 * R - e), 0)) * ks
            xc = c.get('x', 0.0)
            d1 = np.maximum(bilin(s2, us, vs) * ks, np.abs(gx - xc) - bilin(hw, us, vs))
            fields.append((f's{i}:tube', d1, c))
        elif view == 's' and kind == 'hull':
            # like the body: an ellipse of this part's side height and the top view's width there
            # (its width is the body's width / height ratio times its own height, centred on the axis
            # and never wider than the top view: ears and paws seen from above don't widen it)
            pc, ph = runs_map(cm)
            inside = bilin(cm.astype(np.float32), us, vs) > 0.5
            Pc, Ph = bilin(pc, us, vs), bilin(ph, us, vs)
            topw = np.interp(ut, np.arange(len(tw_prof)), tw_prof)
            Qh = np.minimum(Ph * ks * c.get('ratio', ratio), np.where(topw > 0, topw, 1e9))
            eyy = (vs - Pc) / np.maximum(Ph, 0.5); exx = gx / np.maximum(Qh, 1e-3)
            ff = np.sqrt(eyy * eyy + exx * exx)
            dh = np.where(inside, (ff - 1) * np.minimum(Ph * ks, Qh), big)
            d = np.maximum(bilin(s2, us, vs) * ks, dh)
            fields.append((f's{i}:hull', d, c))
        elif view == 's' and kind in ('leg', 'tail', 'ear'):
            e = np.maximum(-s2, 0).astype(np.float32)
            R = ndi.maximum_filter(e, size=int(max(3, e.max() * 1.5)))
            hwv = bilin(np.sqrt(np.maximum(e * (2 * R - e), 0)) * ks, us, vs)
            sd = bilin(s2, us, vs) * ks
            x0c, x1c, y0c, y1c = c['bbox']
            zc_ = zs(c['cx'])
            if kind == 'tail':
                fields.append((f's{i}:tail', np.maximum(sd, np.abs(gx) - hwv), dict(c, part='TAIL', pivot=None)))
                continue
            # half-width of the body (from above) at this z: legs stand under its sides, ears on top
            colb = int(np.clip(round(col_t(zc_)), 0, T.body.shape[1] - 1))
            rb = np.where(T.body[:, colb])[0]
            bw = max(abs(xt(rb[0])), abs(xt(rb[-1]))) if rb.size else 0.1 * C['L']
            if kind == 'leg':
                # where the paws show from above, if they do
                px = [abs(xt(tc_['cy'])) for tc_ in T.comps if abs(zt(tc_['cx']) - zc_) < 0.12 * C['L']]
                xl = c.get('x') or (float(np.median(px)) if px else 0.55 * bw)
                xl = min(xl, bw * 0.85)
                front = c['cx'] > bmid
                for sgn, part in ((1, 'FL' if front else 'BL'), (-1, 'FR' if front else 'BR')):
                    fields.append((f's{i}:leg{"+" if sgn > 0 else "-"}', np.maximum(sd, np.abs(gx - sgn * xl) - hwv), dict(c, part=part)))
            else:
                xe = c.get('x') or 0.45 * bw
                for sgn in (1, -1):
                    fields.append((f's{i}:ear{"+" if sgn > 0 else "-"}', np.maximum(sd, np.abs(gx - sgn * xe) - np.minimum(hwv, 0.35 * hwv.max() + 1e-6)), c))
        elif view == 't' and kind == 'wing':
            # height of the plate: from where it leaves the body to its tip, linear in |x|; the tip
            # height is the extreme of the side view's silhouette over the plate's z-range below /
            # above the body (or the body's middle when the side view shows nothing there)
            z0c, z1c = c['bbox'][0], c['bbox'][1]
            zr = (zt(z0c), zt(z1c))
            sc0, sc1 = int(col_s(zr[0])), int(col_s(zr[1]))
            colrange = S.m[:, max(0, sc0):max(1, sc1 + 1)]
            bodyrows = S.body[:, max(0, sc0):max(1, sc1 + 1)]
            if bodyrows.any():
                br = np.where(bodyrows.any(axis=1))[0]
                ymid = ys_((br[0] + br[-1]) / 2)
            else:
                ymid = 0.0
            extra = colrange & ~ndi.binary_dilation(bodyrows, iterations=2)
            tip = ymid
            if extra.any() and not c.get('flat'):
                er = np.where(extra.any(axis=1))[0]
                lo, hi = ys_(er[-1]), ys_(er[0])
                tip = lo if abs(lo - ymid) > abs(hi - ymid) else hi
            ys_t = np.where(c['core'].any(axis=1))[0]
            xin = min(abs(xt(ys_t[0])), abs(xt(ys_t[-1]))) if ys_t.size else 0
            xout = max(abs(xt(ys_t[0])), abs(xt(ys_t[-1]))) if ys_t.size else 1
            xin = min(xin, xout * 0.5)
            k = np.clip((np.abs(gx) - xin) / max(1e-6, xout - xin), 0, 1)
            yp = ymid + (tip - ymid) * k + c.get('lift', 0) * k
            cos = 1 / np.sqrt(1 + ((tip - ymid) / max(1e-6, xout - xin)) ** 2)   # thickness across the tilted plate
            depth = np.clip(-s2 / max(1, -s2.min()), 0, 1)
            t = thick * (0.7 + 0.3 * bilin(depth.astype(np.float32), ut, vt))
            d = np.maximum(bilin(s2, ut, vt) * kt, np.abs(gy - yp) * cos - t)
            fields.append((f't{i}:wing', d, c))
        elif view == 't' and kind == 'ttube':
            e = np.maximum(-s2, 0).astype(np.float32)
            R = ndi.maximum_filter(e, size=int(max(3, e.max() * 1.5)))
            hw = np.sqrt(np.maximum(e * (2 * R - e), 0)) * kt
            yc = c.get('y', 0.0)
            d = np.maximum(bilin(s2, ut, vt) * kt, np.abs(gy - yc) - bilin(hw, ut, vt))
            fields.append((f't{i}:ttube', d, c))

    # ---- union, mesh ------------------------------------------------------------------------------
    k = C.get('blend', 0.025) * C['L']
    D = fields[0][1].copy()
    for _, d, _ in fields[1:]:
        hh = np.clip(k - np.abs(D - d), 0, None) / k
        D = np.minimum(D, d) - hh * hh * k * 0.25
    D = ndi.gaussian_filter(D, 0.6)
    verts, faces = surface_nets(D)
    # outward winding: the signed volume of a closed mesh wound counter-clockwise is positive
    vx = verts[:, [2, 1, 0]]  # in game order (x, y, z): the grid's (z, y, x) is mirrored
    a, b, c_ = vx[faces[:, 0]], vx[faces[:, 1]], vx[faces[:, 2]]
    if np.einsum('ij,ij->i', a, np.cross(b, c_)).sum() < 0:
        faces = faces[:, [0, 2, 1]]
    P = np.stack([np.interp(verts[:, 0], np.arange(len(Z)), Z), np.interp(verts[:, 1], np.arange(len(Y)), Y), np.interp(verts[:, 2], np.arange(len(X)), X)], 1)  # z, y, x
    gzD, gyD, gxD = np.gradient(D)
    N = np.stack([trilin(gzD, verts), trilin(gyD, verts), trilin(gxD, verts)], 1)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    # part weights: which field is nearest at each vertex
    dv = np.stack([trilin(d, verts) for _, d, _ in fields], 1)
    soft = np.exp(-(dv - dv.min(axis=1, keepdims=True)) / (k * 1.2))
    part_names = [partname(n, c, land) for n, _, c in fields]
    pid = np.array([PART[p] for p in part_names])
    wsum = soft.sum(axis=1)
    best = np.zeros(len(P), int); bw = np.zeros(len(P))
    for p in set(pid.tolist()) - {0}:
        w = soft[:, pid == p].sum(axis=1) / wsum
        better = w > bw
        best[better] = p; bw[better] = w[better]
    weight = np.where(best > 0, bw * bw * (3 - 2 * bw), 0)
    # a mirrored wing field drives the left wing on +x and the right one on -x
    best = np.where((best == PART['WING_L']) & (P[:, 2] < 0), PART['WING_R'], best)
    pivots = {}
    for (n, d, c), p in zip(fields, part_names):
        if PART[p] == 0 or p in pivots:
            continue
        near = (np.abs(dv[:, 0]) < k) & (dv[:, part_names.index(p)] < k)  # where the part meets the body
        sel = P[near] if near.any() else P[best == PART[p]]
        pivots[p] = sel.mean(axis=0).tolist() if len(sel) else [0, 0, 0]
    if 'WING_L' in pivots:
        pl = pivots['WING_L']; pivots['WING_L'] = [pl[0], pl[1], abs(pl[2])]; pivots['WING_R'] = [pl[0], pl[1], -abs(pl[2])]
    write(name, C, P, N, faces, best, weight, pivots, S, T, dict(ks=ks, kt=kt, S0=(zs(0), ys_(0)), T0=(zt(0), xt(0))))
    if debug:
        dbg(name, S, T, labels)
    print(f'{name}: {len(P)} verts, {len(faces)} tris, parts {sorted(set(part_names))}, fields {[n for n, _, _ in fields]}')


def partname(n, c, land):
    if n == 'body':
        return 'body'
    if c is not None and c.get('part'):
        return c['part']
    if n.endswith(':wing'):
        return 'WING_L'  # split by side after weighting
    return 'body'


def trilin(V, p):
    i = np.clip(np.floor(p).astype(int), 0, np.array(V.shape) - 2)
    f = p - i
    out = 0
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                w = (f[:, 0] if dz else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dx else 1 - f[:, 2])
                out = out + w * V[i[:, 0] + dz, i[:, 1] + dy, i[:, 2] + dx]
    return out


def surface_nets(D):
    """vertices (grid coords) and triangles of the zero surface of a distance volume"""
    s = D < 0
    nz, ny, nx = D.shape
    cube = np.zeros((nz - 1, ny - 1, nx - 1, 3)); cnt = np.zeros((nz - 1, ny - 1, nx - 1))
    corners = [(a, b, c) for a in (0, 1) for b in (0, 1) for c in (0, 1)]
    edges = [(p, q) for p in corners for q in corners if sum(abs(np.array(p) - np.array(q))) == 1 and p < q]
    sl = lambda o: (slice(o[0], nz - 1 + o[0]), slice(o[1], ny - 1 + o[1]), slice(o[2], nx - 1 + o[2]))
    for p, q in edges:
        a, b = D[sl(p)], D[sl(q)]
        x = (a < 0) != (b < 0)
        t = np.where(x, a / np.where(x, a - b, 1), 0)
        for ax in range(3):
            cube[..., ax] += np.where(x, p[ax] + (q[ax] - p[ax]) * t, 0)
        cnt += x
    has = cnt > 0
    idx = -np.ones(cnt.shape, int)
    idx[has] = np.arange(has.sum())
    verts = cube[has] / cnt[has][:, None] + np.argwhere(has)
    faces = []
    for ax in range(3):
        o = [0, 0, 0]; o[ax] = 1
        a = s[:nz - o[0], :ny - o[1], :nx - o[2]]; b = s[o[0]:, o[1]:, o[2]:]
        edge = a != b
        e = np.argwhere(edge)
        inside_first = a[edge]
        u, v = [i for i in range(3) if i != ax]
        good = (e[:, u] >= 1) & (e[:, v] >= 1) & (e[:, u] < D.shape[u] - 1) & (e[:, v] < D.shape[v] - 1)
        e, inside_first = e[good], inside_first[good]
        def cell(du, dv):
            c = e.copy(); c[:, u] -= du; c[:, v] -= dv
            c[:, ax] = np.minimum(c[:, ax], cnt.shape[ax] - 1)
            return idx[c[:, 0], c[:, 1], c[:, 2]]
        q = np.stack([cell(1, 1), cell(0, 1), cell(0, 0), cell(1, 0)], 1)
        ok = (q >= 0).all(axis=1)
        q, fl = q[ok], inside_first[ok]
        # orientation: counter-clockwise seen from outside
        flip = fl if ax != 1 else ~fl
        t1 = np.where(flip[:, None], q[:, [0, 1, 2]], q[:, [0, 2, 1]])
        t2 = np.where(flip[:, None], q[:, [0, 2, 3]], q[:, [0, 3, 2]])
        faces += [t1, t2]
    return verts, np.concatenate(faces)


def write(name, C, P, N, F, part, weight, pivots, S, T, m):
    os.makedirs(OUT, exist_ok=True)
    # mesh: z, y, x -> x, y, z
    pos = P[:, [2, 1, 0]].astype(np.float32)
    nrm = N[:, [2, 1, 0]]
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    q = np.round((pos - lo) / (hi - lo) * 65535).astype(np.uint16)
    nq = np.round(nrm * 127).astype(np.int8)
    idx = F.astype(np.uint32 if len(pos) > 65535 else np.uint16)
    with open(os.path.join(OUT, name + '.bin'), 'wb') as f:
        f.write(q.tobytes()); f.write(nq.tobytes()); f.write(part.astype(np.uint8).tobytes())
        f.write(np.round(weight * 255).astype(np.uint8).tobytes()); f.write(idx.tobytes())
    # paint: the two views, background filled, cropped to the silhouette (+ a margin)
    boxes = {}
    for key, V, k0, kk in (('side', S, m['S0'], m['ks']), ('top', T, m['T0'], m['kt'])):
        mg = 6
        r0, r1, c0, c1 = max(0, V.r0 - mg), min(V.m.shape[0], V.r1 + mg), max(0, V.c0 - mg), min(V.m.shape[1], V.c1 + mg)
        rgb = fill_bg(V.rgb, V.m)[r0:r1, c0:c1]
        im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
        s = 512 / max(im.size); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}_{key}.jpg'), quality=86)
        # metric box: column c -> z = k0[0] + c * kk ; row r -> (side) y = k0[1] - r * kk, (top) x = k0[1] + r * kk
        if key == 'side':
            boxes[key] = [k0[0] + c0 * kk, k0[0] + c1 * kk, k0[1] - r1 * kk, k0[1] - r0 * kk]   # z0, z1, y0 (bottom), y1 (top)
        else:
            boxes[key] = [k0[0] + c0 * kk, k0[0] + c1 * kk, k0[1] + r0 * kk, k0[1] + r1 * kk]   # z0, z1, x at the image top row, x at the bottom
    meta = dict(n=len(pos), tris=len(F), lo=lo.tolist(), hi=hi.tolist(), index32=len(pos) > 65535, pivots={k: [v[2], v[1], v[0]] for k, v in pivots.items()},  # (z, y, x) -> (x, y, z)
                proj=boxes, length=C['L'])
    with open(os.path.join(OUT, name + '.json'), 'w') as f:
        json.dump(meta, f)


def dbg(name, S, T, labels):
    SP = '/tmp/claude-0/-home-user-swingers/917c9fc4-43eb-5716-8fa8-b393f4945dbe/scratchpad/'
    from PIL import ImageDraw
    ims = []
    for key, V in (('s', S), ('t', T)):
        o = V.rgb.copy() * 0.5 + 0.5
        o[V.body] = o[V.body] * 0.4 + np.array([0.2, 0.4, 1]) * 0.6
        cols = [(1, 0.3, 0.3), (0.2, 0.9, 0.2), (1, 0.8, 0), (0.8, 0.2, 1), (0, 0.9, 0.9), (1, 0.5, 0)]
        for i, c in enumerate(V.comps):
            o[c['core']] = o[c['core']] * 0.3 + np.array(cols[i % 6]) * 0.7
        im = Image.fromarray((o * 255).astype(np.uint8))
        dr = ImageDraw.Draw(im)
        for vw, i, kind, c in labels:
            if vw == key:
                dr.text((c['cx'], c['cy']), f'{key}{i}:{kind}', fill=(0, 0, 0))
        ims.append(im)
    W = sum(i.width for i in ims); Hh = max(i.height for i in ims)
    out = Image.new('RGB', (W, Hh), 'white'); x = 0
    for i in ims:
        out.paste(i, (x, 0)); x += i.width
    out.save(SP + f'dbg_{name}.jpg', quality=85)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    for n in args or list(CONFIG):
        build(n, '--debug' in sys.argv)
