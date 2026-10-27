"""Four-legged animals built from measurements of their reference sheets (dev tool; numpy, Pillow, scipy).

    python3 wobblers/tools/animals/quad.py [name ...]      # all of QUADS by default

build.py turns a sheet's silhouettes into a model directly, which copies the drawing too
literally for legged animals (near and far legs overlap side-on, ears and manes become lumps).
This builds the expected anatomy instead and only measures it on the sheet:

- body: one loft from rump to snout. At every z its cross-section is an ellipse spanning the side
  view's back line (ears and crests opened away) down to the belly line (the dips where legs and
  thighs hang below it closed), as wide as the top view (paws and ears opened away).
- four legs: the near front and near hind leg of the drawing traced row by row (centre and
  thickness), extended up into the body, tilted toward upright (and shortened to keep the paw on
  the ground), with a paw from the drawn foot; mirrored to both sides, as far out as the paws
  seen from above.
- a tail: the drawn tail's centre line (geodesic from where it joins the body), so curls survive.
- ears: the bumps the back line's opening removed over the head, one on each side.
- paint: the sheet's own views projected like build.py's, and each limb also records where the
  drawing has it (`paint` positions): a leg stood upright still takes the colours of the drawn leg.
"""
import os, sys
from collections import deque
import numpy as np
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(__file__))
from segment import load, panel, mask, drop_ground_shadow
from build import View, sdf2, surface_nets, trilin, write, PART, dbg

# L: nose to tail tip (m); upright: how much of a leg's tilt is taken out (1 = vertical);
# wmax: widest the body may be for its height; open: the side opening for the parts (as build.py)
QUADS = {
    'tiger':    dict(sheet='tiger.png', L=2.4, res=110),
    'leopard':  dict(sheet='leopard.png', L=2.1, res=110, belly=0.42, cuts=[(0.5, 0.3, 0.5, 1.0)]),
    'monkey':   dict(sheet='monkey.png', L=1.0, res=100, ears='side', hock=0.8, head=(0.1, 0.3)),
    'hog':      dict(sheet='river_hog.png', L=1.3, res=96, belly=0.33, cuts=[(0.5, 0.3, 0.5, 1.0)], hock=0.5),
    'capybara': dict(sheet='capybara.png', L=1.1, res=96, belly=0.24, cuts=[(0.5, 0.3, 0.5, 1.0)], hock=0.6),
    'tapir':    dict(sheet='tapir.png', L=1.9, res=96, hock=0.5),
    'croc':     dict(sheet='crocodile.png', L=3.0, res=120, belly=0.3, cuts=[(0.5, 0.3, 0.5, 1.0)], wmax=2.4, leg_r=0.1, leg_r_fixed=True, sprawl=True, body_tail=True, jaw=True, head=(0.14, 0.24)),
}


def runs(col):
    d = np.diff(np.concatenate([[0], col.astype(np.int8), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))  # [a, b)


def seg_sdf(gz, gy, gx, a, b, ra, rb):
    """distance to a round cone from a to b (z, y, x) with radii ra -> rb"""
    ab = b - a; L2 = max(float(ab @ ab), 1e-12)
    t = np.clip(((gz - a[0]) * ab[0] + (gy - a[1]) * ab[1] + (gx - a[2]) * ab[2]) / L2, 0, 1)
    dz, dy, dx = gz - a[0] - t * ab[0], gy - a[1] - t * ab[1], gx - a[2] - t * ab[2]
    return np.sqrt(dz * dz + dy * dy + dx * dx) - (ra + (rb - ra) * t)


def chain_sdf(G, pts, rad, h):
    """union of round cones through pts (n, 3: z, y, x), evaluated only near them"""
    gz, gy, gx = G
    D = np.full(gz.shape, 1e3, np.float32)
    lo = pts.min(axis=0) - rad.max() - 4 * h; hi = pts.max(axis=0) + rad.max() + 4 * h
    Z, Y, X = gz[:, 0, 0], gy[0, :, 0], gx[0, 0, :]
    iz = slice(*np.searchsorted(Z, [lo[0], hi[0]])); iy = slice(*np.searchsorted(Y, [lo[1], hi[1]])); ix = slice(*np.searchsorted(X, [lo[2], hi[2]]))
    sz, sy, sx = gz[iz, iy, ix], gy[iz, iy, ix], gx[iz, iy, ix]
    d = np.full(sz.shape, 1e3, np.float32)
    for i in range(len(pts) - 1):
        d = np.minimum(d, seg_sdf(sz, sy, sx, pts[i], pts[i + 1], rad[i], rad[i + 1]))
    if len(pts) == 1:
        d = np.sqrt((sz - pts[0][0]) ** 2 + (sy - pts[0][1]) ** 2 + (sx - pts[0][2]) ** 2) - rad[0]
    D[iz, iy, ix] = d
    return D


def resample(pts, rad, step):
    """even spacing along a polyline (fewer cones, smoother)"""
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < step:
        return pts[[0, -1]], rad[[0, -1]]
    t = np.linspace(0, s[-1], max(2, int(s[-1] / step) + 1))
    return np.stack([np.interp(t, s, pts[:, k]) for k in range(pts.shape[1])], 1), np.interp(t, s, rad)


def build(name):
    C = QUADS[name]
    img = load(C['sheet'])
    sp, tp = panel(img, 0, 0, 1), panel(img, 0, 1, 1)
    sm = drop_ground_shadow(sp, mask(sp), 0.45)
    S = View(sp, sm, 0.3, True, C.get('cuts', ()), C.get('belly', 0))
    T = View(tp, mask(tp), 0.3)
    M = S.m
    L = C['L']
    ks = L / (S.c1 - S.c0)
    kt = ks * (S.c1 - S.c0) / max(1, T.c1 - T.c0)
    zs = lambda c: (c - S.c0) * ks - L / 2
    ys = lambda r: (S.r1 - r) * ks
    zt = lambda c: (c - T.c1) * kt + zs(S.c1)
    col_s = lambda z: (z + L / 2) / ks + S.c0
    col_t = lambda z: (z - zs(S.c1)) / kt + T.c1
    Hs = S.r1 - S.r0
    px = lambda frac: max(3, int(frac * (S.c1 - S.c0)))

    # ---- body loft: back line, belly line, width --------------------------------------------------
    sb = np.where(S.body.any(axis=0))[0]
    # (the snout tip is the frontmost point of the upper part: a hand reaching forward isn't a nose)
    cA, cB = max(S.c0, sb[0] - px(0.02)), int(np.where(M[: int(S.r0 + C.get('head_rows', 0.65) * (S.r1 - S.r0))].any(axis=0))[0][-1])
    cols = np.arange(cA, cB + 1)
    top = np.zeros(len(cols)); bot = np.zeros(len(cols))
    for i, c in enumerate(cols):
        rr = runs(M[:, c])
        if not rr:
            top[i] = bot[i] = np.nan; continue
        a, b = rr[0]; top[i] = ys(a); bot[i] = ys(b - 1)
    ok = ~np.isnan(top)
    top = np.interp(np.arange(len(cols)), np.where(ok)[0], top[ok]); bot = np.interp(np.arange(len(cols)), np.where(ok)[0], bot[ok])
    # back line: ears / crests are narrow peaks -> opening; belly: legs are dips -> closing
    top_o = ndi.grey_opening(top, size=px(0.08), mode='nearest')
    # (only where a leg comes down: the columns of every outline reaching the ground, bridged by
    # interpolation; elsewhere (neck, head, rump) the run's own bottom is the belly)
    band = np.zeros(len(cols), bool)
    for c in S.comps:
        if c['bbox'][3] >= S.r1 - 0.4 * Hs and c['bbox'][2] > S.r0 + 0.3 * Hs:   # legs, lifted ones too
            xs_ = np.where(c['core'].any(axis=0))[0]; m_ = int(0.15 * (xs_[-1] - xs_[0]) + 2)
            band |= (cols >= xs_[0] - m_) & (cols <= xs_[-1] + m_)
    bel = np.interp(np.arange(len(cols)), np.where(~band)[0], bot[~band]) if (~band).any() else bot
    bel = np.maximum(bel, bot)
    torso = cols < cA + 0.72 * (cB - cA)                          # (not under the head: jaws hang low)
    bel[torso] = ndi.grey_closing(bel, size=px(0.12), mode='nearest')[torso]   # narrow drips left (a lifted far leg's thigh)
    bel = np.minimum(bel, top_o - 0.12 * Hs * ks)
    top_s = ndi.gaussian_filter1d(top_o, px(0.012)); bel_s = ndi.gaussian_filter1d(bel, px(0.015))
    # width from above (paws and ears opened away), over the animal's own extent
    twp = np.array([(lambda r: (r[-1] - r[0] + 1) / 2 * kt if r.size else 0)(np.where(T.m[:, c])[0]) for c in range(T.m.shape[1])])
    ext = np.where(twp > 0)[0]
    two = np.zeros_like(twp)
    two[ext[0]:ext[-1] + 1] = ndi.grey_opening(twp[ext[0]:ext[-1] + 1], size=max(3, int(0.2 * (T.c1 - T.c0))), mode='nearest')
    ay = np.maximum((top_s - bel_s) / 2, 2 * ks); yc = (top_s + bel_s) / 2
    ax = np.interp(col_t(zs(cols)), np.arange(len(two)), two)
    ax = np.clip(np.where(ax > 0, ax, ay), 0.5 * ay, C.get('wmax', 1.5) * ay)
    ax = ndi.gaussian_filter1d(ax, px(0.015))
    zc = zs(cols)

    # ---- grid ------------------------------------------------------------------------------------
    xmax = max(ax.max(), max(abs((T.r0 - T.r1) / 2 * kt), 0.1)) * 1.25
    ymin, ymax, zmin, zmax = 0, ys(S.r0), zs(S.c0), zs(S.c1)
    h = max(zmax - zmin, ymax - ymin, 2 * xmax) / C['res']
    pad = 4 * h
    Z = np.arange(zmin - pad, zmax + pad, h); Y = np.arange(ymin - pad, ymax + pad, h); X = np.arange(-xmax - pad, xmax + pad, h)
    gz, gy, gx = np.meshgrid(Z, Y, X, indexing='ij')
    G = (gz, gy, gx)

    # ---- primitives (designed shapes; the sheet only sizes and places them) -------------------------
    def ell(c, r):
        e = np.sqrt(((gz - c[0]) / r[0]) ** 2 + ((gy - c[1]) / r[1]) ** 2 + ((gx - c[2]) / r[2]) ** 2)
        return ((e - 1) * min(r)).astype(np.float32)
    def cone(pts, rad, xs=1.0, ysc=1.0):
        """tapered tube through pts (z, y, x), squashed across (xs) / vertically (ysc)"""
        pts = np.asarray(pts, float); rad = np.asarray(rad, float)
        pr, rr = resample(pts, rad, h * 0.7)
        sc = np.array([1.0, ysc, xs])
        d = chain_sdf((gz, gy / ysc, gx / xs), pr / sc, rr, h)
        return (d * min(1.0, xs, ysc)).astype(np.float32)
    sm_ = lambda v: ndi.gaussian_filter1d(v, px(0.035), mode='nearest')
    YC, AY, AX = sm_(yc), sm_(ay), sm_(ax)
    at = lambda z: (float(np.interp(z, zc, YC)), float(np.interp(z, zc, AY)), float(np.interp(z, zc, AX)))
    fields = []

    # ---- legs: measured (where, how thick, paw size, spread) ---------------------------------------
    ground = S.r1
    mid = (cA + cB) / 2
    legs = [c for c in S.comps if c['bbox'][3] >= ground - 0.1 * Hs]
    meas = {}
    for front in (True, False):
        grp = [c for c in legs if (c['bbox'][0] + c['bbox'][1]) / 2 > mid] if front else [c for c in legs if (c['bbox'][0] + c['bbox'][1]) / 2 <= mid]
        if not grp:
            print(name, 'no', 'front' if front else 'hind', 'leg'); continue
        cm = max(grp, key=lambda c: c['area'])['core']
        # traced from the paw up (strips along the belly joined to a leg can't steer it)
        rows = np.where(cm.any(axis=1))[0]
        r = rows[-1]; rr = runs(cm[r]); ccx = np.where(cm)[1].mean()
        a, b = min(rr, key=lambda q: abs((q[0] + q[1] - 1) / 2 - ccx)); cen = (a + b - 1) / 2
        trace = []; wprev = b - a
        for r in range(rows[-1], rows[0] - 1, -1):
            rr = [q for q in runs(cm[r]) if q[1] > cen - wprev and q[0] < cen + wprev]
            if not rr:
                break
            a, b = min(rr, key=lambda q: abs((q[0] + q[1] - 1) / 2 - cen))
            if b - a > 2.5 * wprev + 6 and len(trace) > 5:
                break
            cen = (a + b - 1) / 2; trace.append((r, cen, (b - a) / 2)); wprev = max(b - a, 4)
        tr = np.array(trace[::-1])
        hw = float(np.percentile(tr[: max(2, int(len(tr) * 0.8)), 2], 30))
        fh = min(2.0 * hw, 0.3 * len(tr))
        leg = tr[tr[:, 0] <= ground - fh]
        if len(leg) < 2:
            leg = tr[:2]
        fa, fb = [], []
        for r in range(int(ground - fh), ground + 1):
            for a, b in runs(cm[r]):
                if b > leg[-1, 1] - 2.5 * hw and a < leg[-1, 1] + 2.5 * hw:
                    fa.append(a); fb.append(b - 1)
        fa, fb = (min(fa), max(fb)) if fa else (leg[-1, 1] - hw, leg[-1, 1] + hw)
        n_ = len(leg)
        r_mid = np.percentile(leg[int(n_ * 0.25): max(int(n_ * 0.25) + 1, int(n_ * 0.65)), 2], 40) * ks
        r_bot = (min(np.percentile(leg[int(n_ * 0.65):, 2], 40) * ks, r_mid) if n_ > 3 else r_mid)
        if C.get('leg_r'):
            r_mid = max(r_mid, C['leg_r']); r_bot = max(r_bot, 0.8 * C['leg_r'])
        r_bot = max(r_bot, 0.7 * r_mid)
        zr = float(np.clip(zs(np.median(tr[: max(2, len(tr) // 3), 1])), zc[0] + 0.12 * L, zc[-1] - 0.12 * L))
        axr = float(AX[np.abs(zc - zr) < 0.1 * L].max())
        tpx = [abs((tc['cy'] - (T.r0 + T.r1) / 2) * kt) for tc in T.comps if abs(zt(tc['cx']) - zs(leg[-1, 1])) < 0.15 * L]
        xpaw = C.get('xpaw') or (float(np.median(tpx)) if tpx else 0.75 * axr)
        cen_s = ndi.gaussian_filter1d(tr[:, 1].astype(float), max(1.0, hw * 0.6), mode='nearest')
        meas[front] = dict(zr=zr, axr=axr, r_mid=r_mid, r_bot=r_bot, rf=max(fh * ks / 2, 0.85 * r_bot),
                           fl=float(np.clip((fb - fa) * ks, 2.2 * r_bot, 4.2 * r_bot)), xpaw=xpaw,
                           ty=ys(tr[::-1, 0]), tz=zs(cen_s[::-1]))   # traced centre line, y ascending
    # one animal, one leg build: both pairs as thick as the better measured one (a far leg hiding
    # the near one side-on reads thin), paws in proportion
    if meas:
        ay_sh = at(meas[True]['zr'] if True in meas else 0)[1]
        rm_ = C.get('leg_r') if C.get('leg_r_fixed') else float(np.clip(np.mean([m['r_mid'] for m in meas.values()]), 0.3 * ay_sh, C.get('leg_max', 0.4) * ay_sh))
        for m in meas.values():
            m['r_mid'] = rm_; m['r_bot'] = 0.78 * rm_
            m['rf'] = 0.8 * m['r_bot']; m['fl'] = float(np.clip(m['fl'], 2.4 * m['r_bot'], 3.4 * m['r_bot']))
    z_sh = meas[True]['zr'] if True in meas else zc[0] + 0.7 * (zc[-1] - zc[0])
    z_hip = meas[False]['zr'] if False in meas else zc[0] + 0.2 * (zc[-1] - zc[0])

    # ---- head: neck where the profile is thinnest ahead of the shoulders (or a share of the way) -----
    z_tip = zc[-1]
    win = (zc > z_sh) & (zc < z_tip - 0.1 * L)
    z_neck = z_sh + 0.45 * (z_tip - z_sh)
    if win.sum() > 3:
        i = np.argmin(AY[win]); zn = zc[win][i]
        if AY[win][i] < 0.85 * at(z_sh)[1]:
            z_neck = zn
    Lh = float(np.clip(z_tip - z_neck, C.get('head', (0.14, 0.4))[0] * L, C.get('head', (0.14, 0.4))[1] * L)); z_neck = z_tip - Lh
    zsk = z_neck + 0.33 * Lh
    ysk, ayk, axk = at(zsk)
    ry = 0.95 * ayk; rx = min(axk, 1.3 * ry); rz = min(0.38 * Lh, 1.25 * ry)
    neck_base = np.array([z_neck - 0.3 * Lh, at(z_neck - 0.3 * Lh)[0], 0.0])
    yn, ayn, axn = at(z_neck)
    head_parts = []
    head_parts.append(('neck', cone([neck_base, [z_neck, yn, 0], [zsk, ysk, 0]], [0.8 * min(ayn, axn) / max(0.6, min(1.0, axn / ayn)), 0.82 * ayn, 0.75 * ry], xs=float(np.clip(axn / ayn, 0.7, 1.3)))))
    head_parts.append(('skull', ell((zsk, ysk, 0), (rz, ry, rx))))
    zm0 = zsk + 0.35 * rz; zm1 = z_tip - 0.06 * Lh
    ym0, aym0, axm0 = at(zm0); ym1, aym1, axm1 = at(zm1)
    r0 = 0.85 * aym0; r1 = 0.85 * aym1
    xsm = float(np.clip((axm0 + axm1) / max(1e-6, aym0 + aym1), 0.6, 2.2))
    if C.get('jaw'):
        # a snapping jaw: the muzzle split into an upper snout and a lower jaw hinged under the skull
        head_parts.append(('snout', cone([[zm0, ym0 + 0.3 * r0, 0], [z_tip - r1 * 0.6, ym1 + 0.3 * r1, 0]], [r0 * 0.75, r1 * 0.7], xs=xsm, ysc=0.75)))
        jaw = cone([[zsk, ysk - 0.35 * ry, 0], [z_tip - r1 * 0.7, ym1 - 0.35 * r1, 0]], [0.6 * ry, 0.45 * r1], xs=xsm * 0.95, ysc=0.6)
        fields.append(dict(name='jaw', d=jaw, part='JAW', inv=None, pivot=[zsk, ysk - 0.2 * ry, 0.0]))
    else:
        head_parts.append(('muzzle', cone([[zm0, ym0, 0], [z_tip - r1, ym1, 0]], [r0, r1], xs=xsm)))
    # ears on the skull: the bumps the back line's opening removed over the head (the biggest),
    # or round ones on the sides (C ears='side')
    resid = top - top_o
    on = (resid > 0.025 * Hs * ks) & (zc > z_neck - 0.1 * Lh)
    lab, n = ndi.label(on)
    best_ear = None
    for i in range(1, n + 1):
        idx = np.where(lab == i)[0]; wz = (idx[-1] - idx[0] + 1) * ks
        if 0.015 * L < wz < 0.14 * L and (best_ear is None or wz * resid[idx].max() > best_ear[0]):
            best_ear = (wz * resid[idx].max(), wz, resid[idx].max(), zc[idx].mean())
    if C.get('ears') == 'side':
        for sgn in (1, -1):
            head_parts.append(('ear', ell((zsk - 0.15 * rz, ysk + 0.15 * ry, sgn * 0.95 * rx), (0.14 * ry * 2.2, 0.36 * ry, 0.13 * ry))))
    elif best_ear and C.get('ears') != 'none':
        _, wz, he, ze = best_ear
        ze = float(np.clip(ze, zsk - 0.8 * rz, zsk + 0.4 * rz))
        ytop = ysk + ry * np.sqrt(max(0.0, 1 - ((ze - zsk) / rz) ** 2))
        for sgn in (1, -1):
            head_parts.append(('ear', ell((ze, ytop + 0.35 * he, sgn * 0.62 * rx), (0.36 * wz, 0.75 * he, 0.42 * wz))))
    for nm, d in head_parts:
        fields.append(dict(name=nm, d=d, part='HEAD', inv=None, pivot=neck_base.tolist()))

    # ---- torso: rump to neck, the measured cross-sections smoothed; a croc's tail out of it ----------
    zt0 = zc[0]
    if C.get('body_tail'):
        zt0 = z_hip - 1.4 * at(z_hip)[1]
    zt1 = z_neck + 0.05 * Lh
    def torso_sdf():
        zq = np.clip(gz, zt0, zt1)
        Yc, Ay, Ax = (np.interp(zq, zc, v) for v in (YC, AY, AX))
        ez = np.zeros_like(gz)
        a0, a1 = at(zt0), at(zt1)
        cap0, cap1 = 1.0 * min(a0[1], a0[2]), 0.6 * min(a1[1], a1[2])
        ez = np.where(gz < zt0, (zt0 - gz) / cap0, ez); ez = np.where(gz > zt1, (gz - zt1) / cap1, ez)
        f = np.sqrt(((gy - Yc) / Ay) ** 2 + (gx / Ax) ** 2 + ez ** 2)
        return ((f - 1) * np.minimum(Ay, Ax)).astype(np.float32)
    fields.insert(0, dict(name='body', d=torso_sdf(), part='body', inv=None))
    if C.get('body_tail'):
        zz_ = np.linspace(zt0 + 0.4 * at(zt0)[1], zc[0] + 0.01 * L, 14)
        tp_ = np.array([[z, at(z)[0], 0] for z in zz_]); tr_ = np.array([max(0.85 * min(at(z)[1], at(z)[2] * 1.4), 0.6 * h) for z in zz_])
        xs_t = float(np.clip(np.median([at(z)[2] / at(z)[1] for z in zz_]), 0.5, 1.2))
        fields.append(dict(name='tail', d=cone(tp_, tr_ / max(xs_t, 0.5) * min(1, xs_t), xs=xs_t), part='TAIL', inv=None, pivot=tp_[0].tolist()))

    # ---- legs: designed joints (shoulder / elbow / wrist, hip / knee / hock), oval paws -------------
    for front, mm in meas.items():
        zr = mm['zr']; ycr, ayr, _ = at(zr); axr = mm['axr']
        y_r = ycr - 0.2 * ayr; H = y_r
        rf, fl, rm, rb = mm['rf'], mm['fl'], mm['r_mid'], mm['r_bot']
        hk = C.get('hock', 1.0)
        if C.get('sprawl'):
            x0, x1 = 0.5 * axr, 1.25 * axr
            pts = [[zr, y_r, x0], [zr + 0.02 * L, 0.55 * y_r + 0.45 * 1.6 * rf, 0.5 * (x0 + x1) + 0.25 * axr], [zr, 1.6 * rf, x1]]
            rad = [1.35 * rm, rm, rb]
        elif front:
            x0, x1 = 0.55 * axr, float(np.clip(mm['xpaw'], 0.6 * axr, 0.92 * axr))
            pts = [[zr, y_r, x0], [zr - 0.05 * H * hk, 0.5 * H, 0.5 * (x0 + x1)], [zr + 0.02 * H, 1.5 * rf, x1]]
            rad = [1.4 * rm, 1.0 * rm, rb]
        else:
            x0, x1 = 0.55 * axr, float(np.clip(mm['xpaw'], 0.6 * axr, 0.92 * axr))
            pts = [[zr, y_r, x0], [zr + 0.16 * H * hk, 0.58 * H, 0.6 * x0 + 0.4 * x1], [zr - 0.12 * H * hk, 0.3 * H, 0.2 * x0 + 0.8 * x1], [zr - 0.05 * H * hk, 1.5 * rf, x1]]
            rad = [1.6 * rm, 1.1 * rm, 0.9 * rm, rb]
        pts = np.array(pts, float); rad = np.array(rad, float)
        paw_c = np.array([pts[-1, 0] + 0.25 * fl, rf, pts[-1, 2]])
        # paint: at every height, the drawn leg's centre plus this vertex's offset from the designed one
        dy = np.concatenate([pts[::-1, 1], []]); dz = pts[::-1, 0]
        dy = np.concatenate([[0.0], dy]); dz = np.concatenate([[paw_c[0]], dz])
        def inv(p, ty=mm['ty'], tz=mm['tz'], dy=dy, dz=dz):
            y = p[:, 1]
            return np.stack([np.interp(y, ty, tz) + p[:, 0] - np.interp(y, dy, dz), y, p[:, 2]], 1)
        for sgn, part in ((1, 'FL' if front else 'BL'), (-1, 'FR' if front else 'BR')):
            q = pts * [1, 1, sgn]
            fields.append(dict(name=f'leg{part}', d=cone(q, rad), part=part, inv=inv, pivot=q[0].tolist()))
            fields.append(dict(name=f'paw{part}', d=ell((paw_c[0], paw_c[1], sgn * paw_c[2]), (fl / 2, rf, 1.25 * rb)), part=part, inv=inv, pivot=q[0].tolist()))
        print(f'{name}: {"front" if front else "hind"} legs at z {zr:.2f}, hip h {H:.2f}, r {rm:.3f}/{rb:.3f}, paw {fl:.3f} x {rf:.3f}, x {x0:.2f}..{x1:.2f}')

    # ---- tail ------------------------------------------------------------------------------------
    tails = [c for c in S.comps if c['bbox'][3] < ground - 0.1 * Hs and c['cx'] < cA + 0.15 * (cB - cA)]
    if tails and not C.get('body_tail'):
        tm = max(tails, key=lambda c: c['area'])['mask'] & ~ndi.binary_erosion(S.body, iterations=2) & M
        lab, n = ndi.label(tm); tm = lab == (np.argmax(ndi.sum(tm, lab, range(1, n + 1))) + 1)
        dt = ndi.distance_transform_edt(tm)
        seed = tm & ndi.binary_dilation(S.body, iterations=3)
        if not seed.any():
            seed = tm & (np.arange(M.shape[1])[None, :] == np.where(tm.any(axis=0))[0][-1])
        dist = np.full(tm.shape, -1, np.int32); q = deque()
        for r, c in zip(*np.where(seed)):
            dist[r, c] = 0; q.append((r, c))
        while q:
            r, c = q.popleft()
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                r2, c2 = r + dr, c + dc
                if 0 <= r2 < tm.shape[0] and 0 <= c2 < tm.shape[1] and tm[r2, c2] and dist[r2, c2] < 0:
                    dist[r2, c2] = dist[r, c] + 1; q.append((r2, c2))
        step = max(2.0, 0.8 * float(np.median(dt[tm])))
        pts, rad = [], []
        for k_ in range(0, dist.max() + 1, int(step)):
            sel = (dist >= k_) & (dist < k_ + step)
            if sel.sum() < 2:
                continue
            rr, cc = np.where(sel)
            pts.append((zs(cc.mean()), ys(rr.mean()), 0.0)); rad.append(np.percentile(dt[sel], 85) * ks)
        pts, rad = np.array(pts), np.array(rad)
        if len(pts) > 3:
            for _ in range(3):
                pts[1:-1] = (pts[:-2] + pts[1:-1] * 2 + pts[2:]) / 4
            # a tail tapers: thickness from its base to the tip, never thicker further out
            nr = len(rad); rb_ = np.percentile(rad[: max(2, nr // 3)], 70); rt_ = min(np.percentile(rad[-max(2, nr // 5):], 50), rb_)
            rlim = 0.5 * (next(iter(meas.values()))['r_mid'] if meas else rb_)   # never a thread
            rb_ = max(rb_, rlim); rt_ = max(rt_, 0.55 * rb_)
            rad = rb_ + (rt_ - rb_) * np.linspace(0, 1, nr)
            base = pts[0]; ycb = at(base[0])[0]
            pts = np.vstack([[base[0] + 2 * rad[0], (base[1] + ycb) / 2, 0], pts]); rad = np.concatenate([[rad[0] * 1.2], rad])
            fields.append(dict(name='tail', d=cone(pts, np.maximum(rad, 0.6 * h)), part='TAIL', inv=None, pivot=pts[1].tolist()))
            print(f'{name}: tail {len(pts)} points, r {rad.max():.3f}..{rad.min():.3f}')

    # ---- union, mesh, rig, paint -----------------------------------------------------------------
    k = C.get('blend', 0.03) * L
    D = fields[0]['d'].copy()
    for f in fields[1:]:
        d = f['d']; hh = np.clip(k - np.abs(D - d), 0, None) / k
        D = np.minimum(D, d) - hh * hh * k * 0.25
    D = ndi.gaussian_filter(D, 0.7)
    verts, faces = surface_nets(D)
    # one piece: drop bits the union left floating (a tail tip, a stray claw)
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]]])
    ncomp, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(verts), len(verts))), directed=False)
    if ncomp > 1:
        keep = lab == np.argmax(np.bincount(lab))
        remap = np.cumsum(keep) - 1
        faces = remap[faces[keep[faces[:, 0]]]]; verts = verts[keep]
    vx = verts[:, [2, 1, 0]]
    a_, b_, c_ = vx[faces[:, 0]], vx[faces[:, 1]], vx[faces[:, 2]]
    if np.einsum('ij,ij->i', a_, np.cross(b_, c_)).sum() < 0:
        faces = faces[:, [0, 2, 1]]
    P = np.stack([np.interp(verts[:, 0], np.arange(len(Z)), Z), np.interp(verts[:, 1], np.arange(len(Y)), Y), np.interp(verts[:, 2], np.arange(len(X)), X)], 1)
    gzD, gyD, gxD = np.gradient(D)
    N = np.stack([trilin(gzD, verts), trilin(gyD, verts), trilin(gxD, verts)], 1)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    dv = np.stack([trilin(f['d'], verts) for f in fields], 1)
    soft = np.exp(-(dv - dv.min(axis=1, keepdims=True)) / (k * 0.8))
    wsum = soft.sum(axis=1)
    pid = np.array([PART[f['part']] for f in fields])
    best = np.zeros(len(P), int); bw = np.zeros(len(P))
    for p in set(pid.tolist()) - {0}:
        w = soft[:, pid == p].sum(axis=1) / wsum
        better = w > bw; best[better] = p; bw[better] = w[better]
    weight = np.where(best > 0, bw * bw * (3 - 2 * bw), 0)
    paint = np.zeros_like(P)
    for j, f in enumerate(fields):
        paint += (soft[:, j] / wsum)[:, None] * (f['inv'](P) if f['inv'] else P)
    pivots = {}
    for j, f in enumerate(fields):
        p = f['part']
        if PART[p] == 0 or p in pivots:
            continue
        if f.get('pivot') is not None:
            pivots[p] = list(f['pivot']); continue
        near = (np.abs(dv[:, 0]) < k) & (dv[:, j] < k)
        sel = P[near] if near.any() else P[best == PART[p]]
        pivots[p] = sel.mean(axis=0).tolist() if len(sel) else [0, 0, 0]
    S.rgb = sp; T.rgb = tp
    write(name, dict(C, L=L), P, N, faces, best, weight, pivots, S, T, dict(ks=ks, kt=kt, S0=(zs(0), ys(0)), T0=(zt(0), (0 - (T.r0 + T.r1) / 2) * kt)), paint=paint)
    print(f'{name}: {len(P)} verts, {len(faces)} tris, fields {[f["name"] for f in fields]}')


if __name__ == '__main__':
    for n in [a for a in sys.argv[1:] if not a.startswith('--')] or list(QUADS):
        build(n)
