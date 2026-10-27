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
    'monkey':   dict(sheet='monkey.png', L=1.0, res=100),
    'hog':      dict(sheet='river_hog.png', L=1.3, res=96, belly=0.33, cuts=[(0.5, 0.3, 0.5, 1.0)]),
    'capybara': dict(sheet='capybara.png', L=1.1, res=96, belly=0.24, cuts=[(0.5, 0.3, 0.5, 1.0)]),
    'tapir':    dict(sheet='tapir.png', L=1.9, res=96),
    'croc':     dict(sheet='crocodile.png', L=3.0, res=120, belly=0.3, cuts=[(0.5, 0.3, 0.5, 1.0)], wmax=2.4, upright=0.3, leg_r=0.09),
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
    cA, cB = max(S.c0, sb[0] - px(0.02)), S.c1
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

    def loft_sdf():
        zq = np.clip(gz, zc[0], zc[-1])
        Yc, Ay, Ax = (np.interp(zq, zc, v) for v in (yc, ay, ax))
        ez = np.zeros_like(gz)
        cap0, cap1 = 0.8 * min(ay[0], ax[0]), 0.9 * min(ay[-1], ax[-1])
        ez = np.where(gz < zc[0], (zc[0] - gz) / cap0, ez); ez = np.where(gz > zc[-1], (gz - zc[-1]) / cap1, ez)
        f = np.sqrt(((gy - Yc) / Ay) ** 2 + (gx / Ax) ** 2 + ez ** 2)
        return ((f - 1) * np.minimum(Ay, Ax)).astype(np.float32)
    fields = [dict(name='body', d=loft_sdf(), part='body', inv=None)]
    at = lambda z: (float(np.interp(z, zc, yc)), float(np.interp(z, zc, ay)), float(np.interp(z, zc, ax)))

    # ---- legs ------------------------------------------------------------------------------------
    ground = S.r1
    mid = (cA + cB) / 2
    legs = [c for c in S.comps if c['bbox'][3] >= ground - 0.1 * Hs]
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
                break                                          # widening into a strip / the body
            cen = (a + b - 1) / 2; trace.append((r, cen, (b - a) / 2)); wprev = max(b - a, 4)
        tr = np.array(trace[::-1])
        # thickness: a low percentile (side-on the near and far legs overlap into wider runs)
        hw_med = float(np.percentile(tr[: max(2, int(len(tr) * 0.8)), 2], 30))
        fh = min(2.0 * hw_med, 0.3 * len(tr))                  # paw height (px)
        leg = tr[tr[:, 0] <= ground - fh]
        foot = tr[tr[:, 0] > ground - fh]
        if len(leg) < 2:
            leg = tr[:2]
        # the paw: the drawn foot's extent along z near the ankle
        fa, fb = [], []
        for r in range(int(ground - fh), ground + 1):
            for a, b in runs(cm[r]):
                if b > leg[-1, 1] - 2.5 * hw_med and a < leg[-1, 1] + 2.5 * hw_med:
                    fa.append(a); fb.append(b - 1)
        fa, fb = (min(fa), max(fb)) if fa else (leg[-1, 1] - hw_med, leg[-1, 1] + hw_med)
        # metres: (z, y), radius; extend the top up into the body
        # centre line smoothed; thickness a smooth taper thigh -> ankle (rows where the far leg
        # overlaps the near one are wider than either)
        cen_s = ndi.gaussian_filter1d(leg[:, 1].astype(float), max(1.0, hw_med * 0.6), mode='nearest')
        n_ = len(leg)
        r_mid = np.percentile(leg[int(n_ * 0.25): max(int(n_ * 0.25) + 1, int(n_ * 0.65)), 2], 40)
        r_bot = min(np.percentile(leg[int(n_ * 0.65):, 2], 40), r_mid) if n_ > 3 else r_mid
        if C.get('leg_r'):                                        # (stubby legs side-on: croc)
            r_mid = max(r_mid, C['leg_r'] / ks); r_bot = max(r_bot, 0.8 * C['leg_r'] / ks)
        r_top = 1.3 * r_mid                                       # the thigh / shoulder
        P = np.stack([zs(cen_s), ys(leg[:, 0])], 1); R = np.linspace(r_top, r_bot, n_) * ks
        # the root: inside the body (not on the tapering rump / chest), as wide as the body is there
        zr = float(np.clip(P[0, 0], zc[0] + 0.1 * L, zc[-1] - 0.1 * L))
        ycr, ayr, _ = at(zr)
        axr = float(ax[np.abs(zc - zr) < 0.1 * L].max())
        root = np.array([zr, ycr])
        P = np.vstack([root, P]); R = np.concatenate([[R[0] * 1.25], R])
        ank = P[-1].copy(); fhm = fh * ks
        # tilt toward upright about the root, then scale so the ankle sits at paw height
        v = ank - root; ang = np.arctan2(v[0], -v[1]); ang2 = ang * (1 - C.get('upright', 0.7))
        ln = np.linalg.norm(v); target_len = (root[1] - fhm * 0.5) / max(np.cos(ang2), 0.3)
        sc = target_len / ln
        rot = lambda q, a_: np.stack([np.cos(a_) * q[:, 0] - np.sin(a_) * q[:, 1], np.sin(a_) * q[:, 0] + np.cos(a_) * q[:, 1]], 1)
        Q = root + rot((P - root) * sc, -(ang - ang2) if False else (ang2 - ang))
        # (rot by +a turns (0,-1) toward +z when a > 0: arctan2(z, -y) convention)
        ank2 = Q[-1]
        # x: from under the body's side at the root out to the paws seen from above
        tpx = [abs((tc['cy'] - (T.r0 + T.r1) / 2) * kt) for tc in T.comps if abs(zt(tc['cx']) - zs(leg[-1, 1])) < 0.15 * L]
        xpaw = C.get('xpaw') or (float(np.median(tpx)) if tpx else 0.6 * axr)
        xpaw = min(max(xpaw, 0.65 * axr), C.get('wmax', 1.5) * axr)
        xroot = min(0.55 * axr, xpaw)
        tt = np.linspace(0, 1, len(Q))
        fz0, fz1 = zs(fa) + (ank2[0] - ank[0]), zs(fb) + (ank2[0] - ank[0])
        rf = max(fhm / 2, 0.8 * r_bot * ks)
        for sgn, part in ((1, 'FL' if front else 'BL'), (-1, 'FR' if front else 'BR')):
            pts = np.stack([Q[:, 0], Q[:, 1], sgn * (xroot + (xpaw - xroot) * tt)], 1)
            pts_r, rad_r = resample(pts, R, h)
            # paint positions: undo the scale / tilt (about the root, in z / y)
            def inv(p, root=root, sc=sc, a_=ang2 - ang):
                zy = np.stack([p[:, 0], p[:, 1]], 1)
                back = root + rot(zy - root, -a_) / sc
                return np.stack([back[:, 0], back[:, 1], p[:, 2]], 1)
            fields.append(dict(name=f'leg{part}', d=chain_sdf(G, pts_r, rad_r, h), part=part, inv=inv))
            # the paw: a capsule along z on the ground under the ankle
            fp = np.array([[min(fz0 + rf, ank2[0]), rf, sgn * xpaw], [max(fz1 - rf, ank2[0]), rf, sgn * xpaw]])
            dz_ = ank2[0] - ank[0]
            fields.append(dict(name=f'paw{part}', d=chain_sdf(G, fp, np.array([rf, rf * 1.05]), h), part=part,
                               inv=lambda p, dz_=dz_: p - np.array([dz_, 0, 0])))
        print(f'{name}: {"front" if front else "hind"} leg tilt {np.degrees(ang):.0f} -> {np.degrees(ang2):.0f} deg, x {xroot:.2f}..{xpaw:.2f}, paw r {rf:.3f}')

    # ---- tail ------------------------------------------------------------------------------------
    tails = [c for c in S.comps if c['bbox'][3] < ground - 0.1 * Hs and c['cx'] < cA + 0.15 * (cB - cA)]
    if tails:
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
        for k in range(0, dist.max() + 1, int(step)):
            sel = (dist >= k) & (dist < k + step)
            if sel.sum() < 2:
                continue
            rr, cc = np.where(sel)
            pts.append((zs(cc.mean()), ys(rr.mean()), 0.0)); rad.append(np.percentile(dt[sel], 85) * ks)
        pts, rad = np.array(pts), np.array(rad)
        if len(pts) > 3:
            pts[1:-1] = (pts[:-2] + pts[1:-1] * 2 + pts[2:]) / 4
            base = pts[0]; ycb = at(base[0])[0]
            pts = np.vstack([[base[0] + 2 * rad[0], (base[1] + ycb) / 2, 0], pts]); rad = np.concatenate([[rad[0] * 1.2], rad])
            pts_r, rad_r = resample(pts, rad, h)
            fields.append(dict(name='tail', d=chain_sdf(G, pts_r, np.maximum(rad_r, 0.6 * h), h), part='TAIL', inv=None))
            print(f'{name}: tail {len(pts)} points, r {rad.max():.3f}..{rad.min():.3f}')

    # ---- ears: what the back line's opening took off over the head --------------------------------
    resid = top - top_o
    head = cols > cA + 0.6 * (cB - cA)
    on = (resid > 0.025 * Hs * ks) & head
    lab, n = ndi.label(on)
    for i in range(1, n + 1):
        idx = np.where(lab == i)[0]
        wz = (idx[-1] - idx[0] + 1) * ks
        if wz > 0.14 * L or wz < 0.015 * L:
            continue
        he = resid[idx].max(); zc_ = zc[idx].mean(); ybase = top_o[idx].mean()
        _, _, axe = at(zc_)
        for sgn in (1, -1):
            ctr = np.array([zc_, ybase + he * 0.4, sgn * 0.6 * axe])
            e = np.sqrt(((gz - ctr[0]) / (wz * 0.38)) ** 2 + ((gy - ctr[1]) / (he * 0.75)) ** 2 + ((gx - ctr[2]) / (wz * 0.45)) ** 2)
            fields.append(dict(name='ear', d=((e - 1) * min(wz * 0.38, he * 0.75)).astype(np.float32), part='body', inv=None))
        print(f'{name}: ears at z {zc_:.2f}, {wz:.3f} wide, {he:.3f} tall')

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
        near = (np.abs(dv[:, 0]) < k) & (dv[:, j] < k)
        sel = P[near] if near.any() else P[best == PART[p]]
        pivots[p] = sel.mean(axis=0).tolist() if len(sel) else [0, 0, 0]
    S.rgb = sp; T.rgb = tp
    write(name, dict(C, L=L), P, N, faces, best, weight, pivots, S, T, dict(ks=ks, kt=kt, S0=(zs(0), ys(0)), T0=(zt(0), (0 - (T.r0 + T.r1) / 2) * kt)), paint=paint)
    print(f'{name}: {len(P)} verts, {len(faces)} tris, fields {[f["name"] for f in fields]}')


if __name__ == '__main__':
    for n in [a for a in sys.argv[1:] if not a.startswith('--')] or list(QUADS):
        build(n)
