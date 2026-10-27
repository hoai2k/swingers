"""Animals built from designed body parts, sized and painted from their reference sheets (dev tool).

    python3 wobblers/tools/animals/designed.py [name ...]      # all of DESIGNS by default

The method quad.py uses for the four-legged animals, for everything else: each animal is made of
parts that make sense for it (a snake's tapering tube and head, a bird's body, head, beak, fan
tail and wing planforms, a turtle's shell and flippers...), on the rig parts the game animates
(critters.js: HEAD, JAW, legs, TAIL, WING_L / WING_R, tentacles). The sheet is a measuring tape
(lengths, thickness profiles, where parts sit, wing / flipper outlines) and the paint: its side
and top views are projected onto the model, and parts posed or stretched away from the drawing
carry `paint` positions saying where the drawing has them.

Shared pieces: `Sheet` (one row of a sheet: views, scales, profiles), `Grid` (the voxel grid and
the primitive shapes: ellipsoid, tapered tube, planform plate) and `finish` (union, mesh, rig
weights, pivots, paint positions, write). quad.py uses them too.
"""
import os, sys
import numpy as np
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(__file__))
from segment import load, panel, mask, drop_ground_shadow
from build import View, sdf2, surface_nets, trilin, write, PART, bilin


def runs(col):
    d = np.diff(np.concatenate([[0], col.astype(np.int8), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))  # [a, b)


class Sheet:
    """One row of a reference sheet: side view (facing +z = right) and top view (head right), in
    metres. L = the side view's length; land: feet on y = 0, else centred on the side view."""
    def __init__(self, sheet, L, row=0, rows=1, land=False, cuts=(), belly=0, open_=0.3, cols=None):
        img = load(sheet)
        self.sp, self.tp = panel(img, row, 0, rows), panel(img, row, 1, rows)
        sm = mask(self.sp)
        if land:
            sm = drop_ground_shadow(self.sp, sm, 0.45)
        self.S = View(self.sp, sm, open_, land, cuts, belly)
        self.T = View(self.tp, mask(self.tp), open_)
        S, T = self.S, self.T
        self.L = L
        self.ks = L / (S.c1 - S.c0)
        self.kt = self.ks * (S.c1 - S.c0) / max(1, T.c1 - T.c0)
        self.yref = S.r1 if land else (S.r0 + S.r1) / 2
        self.axis = (T.r0 + T.r1) / 2
        self.land = land

    # side: column -> z, row -> y; top: column -> z, row -> x (fronts aligned)
    def zs(self, c): return (np.asarray(c, float) - self.S.c0) * self.ks - self.L / 2
    def ys(self, r): return (self.yref - np.asarray(r, float)) * self.ks
    def zt(self, c): return (np.asarray(c, float) - self.T.c1) * self.kt + self.zs(self.S.c1)
    def xt(self, r): return (np.asarray(r, float) - self.axis) * self.kt
    def col_s(self, z): return (np.asarray(z, float) + self.L / 2) / self.ks + self.S.c0
    def col_t(self, z): return (np.asarray(z, float) - self.zs(self.S.c1)) / self.kt + self.T.c1

    def side_profile(self, m=None):
        """per side column of the silhouette: z, top y, bottom y of the first run from the top"""
        m = self.S.m if m is None else m
        cols = np.where(m.any(axis=0))[0]
        top, bot = [], []
        for c in cols:
            a, b = runs(m[:, c])[0]; top.append(self.ys(a)); bot.append(self.ys(b - 1))
        return self.zs(cols), np.array(top), np.array(bot)

    def top_profile(self, m=None):
        """per top column: z, centre x and half-width of its widest run"""
        m = self.T.m if m is None else m
        cols = np.where(m.any(axis=0))[0]
        cx, hw = [], []
        for c in cols:
            a, b = max(runs(m[:, c]), key=lambda q: q[1] - q[0])
            cx.append(self.xt((a + b - 1) / 2)); hw.append((b - a) / 2 * self.kt)
        return self.zt(cols), np.array(cx), np.array(hw)

    def proj(self):
        """what build.write needs to place the paint"""
        return dict(ks=self.ks, kt=self.kt, S0=(float(self.zs(0)), float(self.ys(0))), T0=(float(self.zt(0)), float(self.xt(0))))


class Grid:
    def __init__(self, lo, hi, res):
        """lo / hi: (z, y, x) bounds in metres; res: cells along the longest side"""
        lo, hi = np.asarray(lo, float), np.asarray(hi, float)
        self.h = h = float((hi - lo).max() / res)
        pad = 4 * h
        self.Z = np.arange(lo[0] - pad, hi[0] + pad, h); self.Y = np.arange(lo[1] - pad, hi[1] + pad, h); self.X = np.arange(lo[2] - pad, hi[2] + pad, h)
        self.gz, self.gy, self.gx = np.meshgrid(self.Z, self.Y, self.X, indexing='ij')

    def ell(self, c, r):
        """ellipsoid at c (z, y, x) with radii r (z, y, x)"""
        gz, gy, gx = self.gz, self.gy, self.gx
        e = np.sqrt(((gz - c[0]) / r[0]) ** 2 + ((gy - c[1]) / r[1]) ** 2 + ((gx - c[2]) / r[2]) ** 2)
        return ((e - 1) * min(r)).astype(np.float32)

    def cone(self, pts, rad, xs=1.0, ysc=1.0, step=None):
        """tapered tube through pts (n, 3: z, y, x) with radii rad, squashed across (xs) / vertically (ysc)"""
        pts = np.asarray(pts, float); rad = np.asarray(rad, float)
        pr, rr = resample(pts, rad, step or self.h * 0.7)
        sc = np.array([1.0, ysc, xs])
        d = chain_sdf((self.gz, self.gy / ysc, self.gx / xs), pr / sc, rr, self.h)
        return (d * min(1.0, xs, ysc)).astype(np.float32)

    def plate(self, sdf_zx, thick, ymid):
        """a plate whose outline is a 2D signed distance over (z, x) (a function of the grid's z, x
        arrays, metres), half-thickness thick(z, x) (>= 1.1 cells) and mid-surface height ymid(z, x)"""
        gz, gy, gx = self.gz, self.gy, self.gx
        t = np.maximum(thick(gz, gx), 1.1 * self.h)
        return np.maximum(sdf_zx(gz, gx), np.abs(gy - ymid(gz, gx)) - t).astype(np.float32)


def resample(pts, rad, step):
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < step:
        return pts[[0, -1]], rad[[0, -1]]
    t = np.linspace(0, s[-1], max(2, int(s[-1] / step) + 1))
    return np.stack([np.interp(t, s, pts[:, k]) for k in range(pts.shape[1])], 1), np.interp(t, s, rad)


def chain_sdf(G, pts, rad, h):
    """union of round cones through pts (n, 3: z, y, x), evaluated only near them"""
    gz, gy, gx = G
    D = np.full(gz.shape, 1e3, np.float32)
    lo = pts.min(axis=0) - rad.max() - 4 * h; hi = pts.max(axis=0) + rad.max() + 4 * h
    Z, Y, X = gz[:, 0, 0], gy[0, :, 0], gx[0, 0, :]
    iz = slice(*np.searchsorted(Z, [lo[0], hi[0]])); iy = slice(*np.searchsorted(Y, [lo[1], hi[1]])); ix = slice(*np.searchsorted(X, [lo[2], hi[2]]))
    sz, sy, sx = gz[iz, iy, ix], gy[iz, iy, ix], gx[iz, iy, ix]
    if len(pts) == 1:
        d = np.sqrt((sz - pts[0][0]) ** 2 + (sy - pts[0][1]) ** 2 + (sx - pts[0][2]) ** 2) - rad[0]
    else:
        d = np.full(sz.shape, 1e3, np.float32)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]; ab = b - a; L2 = max(float(ab @ ab), 1e-12)
            t = np.clip(((sz - a[0]) * ab[0] + (sy - a[1]) * ab[1] + (sx - a[2]) * ab[2]) / L2, 0, 1)
            dz, dy, dx = sz - a[0] - t * ab[0], sy - a[1] - t * ab[1], sx - a[2] - t * ab[2]
            d = np.minimum(d, np.sqrt(dz * dz + dy * dy + dx * dx) - (rad[i] + (rad[i + 1] - rad[i]) * t))
    D[iz, iy, ix] = d
    return D


def mask_sdf(sheet, m, view='t'):
    """a 2D outline (a mask in the top / side panel) as a signed distance over the grid's (z, x) / (z, y), metres"""
    s2 = sdf2(m).astype(np.float32)
    if view == 't':
        return lambda gz, gx: bilin(s2, sheet.col_t(gz), gx / sheet.kt + sheet.axis) * sheet.kt
    return lambda gz, gy: bilin(s2, sheet.col_s(gz), sheet.yref - gy / sheet.ks) * sheet.ks


def finish(name, C, fields, G, sheet, blend=0.03, length=None):
    """smooth union of the fields, mesh, rig weights (nearest part, blended where parts meet),
    pivots (a field's own `pivot` (z, y, x), else where the part meets the body), paint positions
    (a field's `inv(P)`: where the drawing has that part), written for the game"""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    k = blend * (length or sheet.L)
    D = fields[0]['d'].copy()
    for f in fields[1:]:
        d = f['d']; kk = f.get('blend', k); hh = np.clip(kk - np.abs(D - d), 0, None) / kk
        D = np.minimum(D, d) - hh * hh * kk * 0.25
    D = ndi.gaussian_filter(D, 0.7)
    verts, faces = surface_nets(D)
    # one piece: drop bits the union left floating
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]]])
    ncomp, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(verts), len(verts))), directed=False)
    if ncomp > 1 and not C.get('pieces'):
        keep = lab == np.argmax(np.bincount(lab))
        remap = np.cumsum(keep) - 1
        faces = remap[faces[keep[faces[:, 0]]]]; verts = verts[keep]
    vx = verts[:, [2, 1, 0]]
    a_, b_, c_ = vx[faces[:, 0]], vx[faces[:, 1]], vx[faces[:, 2]]
    if np.einsum('ij,ij->i', a_, np.cross(b_, c_)).sum() < 0:
        faces = faces[:, [0, 2, 1]]
    P = np.stack([np.interp(verts[:, 0], np.arange(len(G.Z)), G.Z), np.interp(verts[:, 1], np.arange(len(G.Y)), G.Y), np.interp(verts[:, 2], np.arange(len(G.X)), G.X)], 1)
    gzD, gyD, gxD = np.gradient(D)
    N = np.stack([trilin(gzD, verts), trilin(gyD, verts), trilin(gxD, verts)], 1)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    dv = np.stack([trilin(f['d'], verts) for f in fields], 1)
    soft = np.exp(-(dv - dv.min(axis=1, keepdims=True)) / (k * 0.8))
    wsum = soft.sum(axis=1)
    pid = np.array([PART[f['part']] if isinstance(f['part'], str) else f['part'] for f in fields])
    best = np.zeros(len(P), int); bw = np.zeros(len(P))
    for p in set(pid.tolist()) - {0}:
        w = soft[:, pid == p].sum(axis=1) / wsum
        better = w > bw; best[better] = p; bw[better] = w[better]
    weight = np.where(best > 0, bw * bw * (3 - 2 * bw), 0)
    # a part that should move as one piece (a jaw, a tentacle's tip) can ask for full weight
    for j, f in enumerate(fields):
        if f.get('rigid'):
            sel = best == pid[j]; weight[sel] = np.maximum(weight[sel], np.clip(bw[sel] * 1.6, 0, 1))
    paint = None
    if any(f.get('inv') for f in fields):
        paint = np.zeros_like(P)
        for j, f in enumerate(fields):
            paint += (soft[:, j] / wsum)[:, None] * (f['inv'](P) if f.get('inv') else P)
    pivots = {}
    names = {v: k_ for k_, v in PART.items()}
    for j, f in enumerate(fields):
        p = pid[j]
        if p == 0:
            continue
        key = names.get(p, f'TENT{p - 10}')
        if key in pivots:
            continue
        if f.get('pivot') is not None:
            pivots[key] = list(map(float, f['pivot'])); continue
        near = (np.abs(dv[:, 0]) < k) & (dv[:, j] < k)
        sel = P[near] if near.any() else P[best == p]
        pivots[key] = sel.mean(axis=0).tolist() if len(sel) else [0, 0, 0]
    S, T = sheet.S, sheet.T
    S.rgb = sheet.sp; T.rgb = sheet.tp
    write(name, dict(C, L=length or sheet.L), P, N, faces, best, weight, pivots, S, T, sheet.proj(), paint=paint)
    print(f'{name}: {len(P)} verts, {len(faces)} tris, parts {sorted(set(names.get(p, "TENT") for p in pid.tolist()))}')
    return P, faces


# ================================================================================================
# designs
# ================================================================================================

def snake(name, C):
    """a long python: one tapering tube winding gently along z (the game's slither wave adds the
    rest), thickness profile and paint from the sheet stretched along it, a flat wedge head"""
    sh = Sheet(C['sheet'], C['L'])
    # sheet: centre line and thickness along the body (side: height; top: width about the winding path)
    zS, top, bot = sh.side_profile()
    zT, cxT, hwT = sh.top_profile()
    ycS = ndi.gaussian_filter1d((top + bot) / 2, 3); hyS = ndi.gaussian_filter1d((top - bot) / 2, 3)
    cxT = ndi.gaussian_filter1d(cxT, 3); hwT = ndi.gaussian_filter1d(hwT, 3)
    z0s, z1s = zS[0], zS[-1]                                   # tail tip .. snout on the sheet
    Ls, R = C['length'], C['radius']
    ts = lambda z: (np.asarray(z) - z0s) / (z1s - z0s)          # sheet z -> 0..1 tail..snout
    # our snake: t along z, radius profile from the side view's thickness (max -> R)
    tt = np.linspace(0, 1, 160)
    hy_t = np.interp(tt, ts(zS), hyS); hx_t = np.interp(tt, ts(zT), hwT)
    prof = hy_t / hy_t[int(0.3 * len(tt)):int(0.85 * len(tt))].max()
    prof = np.clip(ndi.gaussian_filter1d(prof, 4), 0.08, 1.0)
    head0 = 1 - C.get('head', 0.07)                             # where the head starts (fraction)
    prof = prof * (1 - 0.22 * np.exp(-((tt - (head0 - 0.01)) / 0.02) ** 2))   # a neck behind the head
    zt_ = -Ls / 2 + tt * Ls
    wav = C.get('wave', 0.1) * np.sin(zt_ * 2 * np.pi / C.get('wavelength', 1.6)) * np.clip(tt / 0.15, 0, 1) * np.clip((head0 - tt) / 0.12, 0, 1)
    body = tt <= head0 + 0.02
    pts = np.stack([zt_, R * prof, wav], 1)                    # lying on the ground (y = radius)
    xs = float(np.clip(np.median(hx_t[40:130] / np.maximum(hy_t[40:130], 1e-6)), 1.0, 1.35))
    lo = (-Ls / 2 - R, 0, -0.3 - R * 2); hi = (Ls / 2 + R, 2.5 * R, 0.3 + R * 2)
    G = Grid(lo, hi, C['res'])
    fields = [dict(name='body', d=G.cone(pts[body], R * prof[body], xs=xs), part='body')]
    # head: a flat wedge (skull + tapering snout) a little wider than the neck
    zh0 = -Ls / 2 + head0 * Ls; hl = Ls - head0 * Ls
    rn = R * prof[int(head0 * len(tt))]
    rh = rn * C.get('head_r', 1.5)
    fields.append(dict(name='skull', d=G.ell((zh0 + 0.35 * hl, rh * 0.8, 0), (0.45 * hl, rh * 0.75, rh * 1.15)), part='HEAD', pivot=(zh0 - 0.3 * hl, rn, 0)))
    fields.append(dict(name='snout', d=G.cone([[zh0 + 0.5 * hl, rh * 0.7, 0], [Ls / 2 - 0.35 * rh, rh * 0.5, 0]], [rh * 0.75, rh * 0.42], xs=1.25), part='HEAD', pivot=(zh0 - 0.3 * hl, rn, 0)))
    # paint: each point of our snake takes the colour of a place along the drawn one: the tail tip
    # and the head as drawn, the long body in between going back and forth over the drawn body
    # (mirrored repeats, no seams) so the blotches keep their shape instead of stretching
    hs, tl = C.get('sheet_head', 0.2), 0.12
    hymax = hyS.max(); stretch = (Ls / R) / ((z1s - z0s) / hymax)
    mid0, mid1 = tl, head0 - 0.02
    nrep = max(1.0, round(stretch * (mid1 - mid0) / (1 - hs - 0.15 - 0.1) * 0.5) * 2 - 1)
    def s_of(t):
        s_ = np.empty_like(t)
        a = t < mid0; s_[a] = t[a] / mid0 * 0.15
        b = (t >= mid0) & (t < mid1); u = (t[b] - mid0) / (mid1 - mid0) * nrep
        tri = np.abs(((u + 1) % 2) - 1)                         # 0..1..0 ...
        tri = np.where(np.floor(u) % 2 == 0, u % 1, 1 - u % 1)
        s_[b] = 0.15 + tri * (1 - hs - 0.15 - 0.12)
        c = (t >= mid1) & (t < head0); s_[c] = (1 - hs - 0.12) + (t[c] - mid1) / (head0 - mid1) * 0.12
        d = t >= head0; s_[d] = (1 - hs) + (t[d] - head0) / (1 - head0) * hs
        return s_
    def inv(P):
        z, y, x = P[:, 0], P[:, 1], P[:, 2]
        t = np.clip((z + Ls / 2) / Ls, 0, 1)
        zsh = z0s + s_of(t) * (z1s - z0s)
        pr = np.interp(t, tt, prof) * R; ctr_x = np.interp(t, tt, wav)
        ys_ = np.interp(zsh, zS, ycS) + (y - pr) / np.maximum(pr, 1e-6) * np.interp(zsh, zS, hyS)
        xs_ = np.interp(zsh, zT, cxT) + (x - ctr_x) / np.maximum(pr * xs, 1e-6) * np.interp(zsh, zT, hwT)
        return np.stack([zsh, ys_, xs_], 1)
    for f in fields:
        f['inv'] = inv
    finish(name, C, fields, G, sh, blend=0.004, length=Ls)


def bird(name, C):
    """a bird in flight: egg body, round head, its own beak along the drawn beak's centre line, a fan
    tail and two wings whose outlines are the top view's (spread, a slight dihedral) on WING_L /
    WING_R, tucked feet. Positions are fractions of the side view's box (u: tail tip 0 .. beak tip 1,
    v: top 0 .. bottom 1); sizes and outlines are measured."""
    sh = Sheet(C['sheet'], C['L'], row=C['row'], rows=C['rows'])
    S, T = sh.S, sh.T
    P = lambda u, v: np.array([float(sh.zs(S.c0 + u * (S.c1 - S.c0))), float(sh.ys(S.r0 + v * (S.r1 - S.r0))), 0.0])
    vh = (S.r1 - S.r0) * sh.ks                                   # side box height (m)
    xt_v = lambda v: float(sh.xt(T.r0 + v * (T.r1 - T.r0)))     # top box v -> x
    bw = C['body_w'] * (T.r1 - T.r0) * sh.kt                     # body half-width (m)
    u0, u1 = C['body_u']; bv0, bv1 = C['body_v']
    bh = (bv1 - bv0) / 2 * vh                                    # body half-height
    yb = float(P(0, (bv0 + bv1) / 2)[1])
    zr, zc_, zn = float(P(u0, 0)[0]), float(P((u0 + u1) / 2, 0)[0]), float(P(u1, 0)[0])
    hu, hv, hr = C['head']; hc = P(hu, hv); hrm = hr * vh
    lo = (float(sh.zs(S.c0)) - 0.02, float(sh.ys(S.r1)) - 0.05, -float(abs(sh.xt(T.r0))) - 0.05)
    hi = (float(sh.zs(S.c1)) + 0.02, float(sh.ys(S.r0)) + 0.05, float(abs(sh.xt(T.r1))) + 0.05)
    G = Grid(lo, hi, C['res'])
    xs = bw / bh
    fields = [dict(name='body', d=G.cone([[zr, yb + 0.1 * bh, 0], [zc_, yb, 0], [zn, yb + 0.25 * bh, 0]], [0.7 * bh, bh, 0.75 * bh], xs=xs), part='body')]
    neck_piv = (zn - 0.2 * bh, yb + 0.3 * bh, 0)
    fields.append(dict(name='neck', d=G.cone([[zn - 0.3 * bh, yb + 0.2 * bh, 0], hc - [0.3 * hrm, 0, 0]], [0.75 * bh, 0.8 * hrm], xs=xs * 0.95), part='HEAD', pivot=neck_piv))
    fields.append(dict(name='head', d=G.ell(hc, (hrm * 1.08, hrm, hrm * min(1.0, xs * 0.95))), part='HEAD', pivot=neck_piv))
    # beak: a tube along the drawn beak's centre line, as tall as drawn, narrower across
    bpts = np.array([P(u, v) for u, v, _ in C['beak']]); brad = np.array([r * vh for _, _, r in C['beak']])
    fields.append(dict(name='beak', d=G.cone(bpts, brad, xs=C.get('beak_xs', 0.7)), part='HEAD', pivot=neck_piv, blend=0.006 * sh.L))
    if C.get('lower'):
        lp = np.array([P(u, v) for u, v, _ in C['lower']]); lr = np.array([r * vh for _, _, r in C['lower']])
        fields.append(dict(name='lower', d=G.cone(lp, lr, xs=C.get('beak_xs', 0.7) * 1.1), part='HEAD', pivot=neck_piv, blend=0.006 * sh.L))
    # wings: the top view beyond the body's sides (tail and head are narrower), joined to the body
    # by a root strip; half-thickness from a third of the body's down to a sliver, slight dihedral
    xT = sh.xt(np.arange(T.m.shape[0]))[:, None]; zT = sh.zt(np.arange(T.m.shape[1]))[None, :]
    wu0, wu1 = C['wing_u']; wz0, wz1 = float(P(wu0, 0)[0]), float(P(wu1, 0)[0])
    for sgn, part in ((1, 'WING_L'), (-1, 'WING_R')):
        side = (xT * sgn > 0)
        wm = T.m & side & (np.abs(xT) > 1.35 * bw)
        lab, n = ndi.label(wm); wm = lab == (np.argmax(ndi.sum(wm, lab, range(1, n + 1))) + 1)
        root = side & (np.abs(xT) > 0.3 * bw) & (np.abs(xT) <= 1.5 * bw) & (zT > wz0) & (zT < wz1)
        wm = ndi.binary_closing(wm | root, iterations=3)
        span = float(np.abs(xT[wm.any(axis=1)]).max())
        sdf = mask_sdf(sh, wm)
        y0 = yb + 0.3 * bh; dih = np.tan(np.radians(C.get('dihedral', 8)))
        thick = lambda gz, gx, span=span: 0.35 * bh * np.clip(1 - (np.abs(gx) - bw) / (span - bw), 0.05, 1) ** 1.2
        ymid = lambda gz, gx, y0=y0, dih=dih: y0 + np.maximum(np.abs(gx) - bw, 0) * dih
        fields.append(dict(name=part, d=G.plate(sdf, thick, ymid), part=part, pivot=((wz0 + wz1) / 2, y0, sgn * 0.6 * bw), blend=0.012 * sh.L))
    # tail: the top view's fan behind the body, lying along the side view's tail line
    tu1 = C['tail_u']; tz1 = float(P(tu1, 0)[0])
    tm = T.m & (zT < tz1) & (np.abs(xT) < 2.5 * bw)
    tm = tm | ((zT >= tz1) & (zT < zr + 0.3 * bh) & (np.abs(xT) < 0.6 * bw))
    # (the side view's lowest run: over the tail a raised wing may show above it)
    tcols = np.where(S.m.any(axis=0))[0]
    zS_ = sh.zs(tcols); tyS = np.array([float(sh.ys((lambda a, b: (a + b - 1) / 2)(*runs(S.m[:, c])[-1]))) for c in tcols])
    tyS = ndi.gaussian_filter1d(tyS, 4)
    sel = zS_ < zr                                              # tail feathers fan out: a straight line through them
    a_, b_ = np.polyfit(zS_[sel], tyS[sel], 1) if sel.sum() > 3 else (0.0, yb)
    tail_y = lambda gz, gx: np.where(gz < zr, a_ * gz + b_, np.interp(gz, zS_, tyS))
    sdf_t = mask_sdf(sh, tm)
    tz0 = float(sh.zs(S.c0))
    tthick = lambda gz, gx: 0.28 * bh * np.clip((gz - tz0) / max(1e-6, zr - tz0), 0.15, 1)
    fields.append(dict(name='tail', d=G.plate(sdf_t, tthick, tail_y), part='TAIL', pivot=(zr, yb, 0), blend=0.015 * sh.L))
    # feet: tucked under the body, two toes each
    fu, fv = C['feet']; fc = P(fu, fv)
    for sgn in (1, -1):
        c = fc + [0, 0, sgn * 0.45 * bw]
        fields.append(dict(name='foot', d=G.cone([c + [0.25 * bh, 0.35 * bh, 0], c, c - [0.25 * bh, 0.05 * bh, 0]], [0.16 * bh, 0.14 * bh, 0.1 * bh]), part='body', blend=0.01 * sh.L))
    finish(name, C, fields, G, sh, blend=0.02)


DESIGNS = {
    # birds: u along the side view tail tip 0 .. beak tip 1, v top 0 .. bottom 1 (fractions of its box)
    'parrot': (bird, dict(sheet='parrot_toucan.png', row=0, rows=2, L=0.85, res=130, wing_top=True, body_u=(0.47, 0.86), body_v=(0.62, 0.9),
                          body_w=0.075, head=(0.885, 0.615, 0.105), wing_u=(0.47, 0.76), tail_u=0.45, feet=(0.58, 0.9),
                          beak=[(0.925, 0.6, 0.075), (0.965, 0.62, 0.06), (0.99, 0.67, 0.035), (0.982, 0.74, 0.012)],
                          lower=[(0.93, 0.68, 0.04), (0.955, 0.7, 0.025)], beak_xs=0.8)),
    'toucan': (bird, dict(sheet='parrot_toucan.png', row=1, rows=2, L=0.62, res=130, wing_top=True, body_u=(0.33, 0.73), body_v=(0.6, 0.92),
                          body_w=0.085, head=(0.735, 0.6, 0.11), wing_u=(0.36, 0.66), tail_u=0.3, feet=(0.47, 0.9),
                          beak=[(0.77, 0.6, 0.11), (0.86, 0.6, 0.09), (0.94, 0.63, 0.06), (0.99, 0.69, 0.02)], beak_xs=0.62)),
    'snake': (snake, dict(sheet='snake.png', L=1.6, length=4.6, radius=0.14, res=300, wave=0.1, wavelength=1.6)),
}

if __name__ == '__main__':
    for n in [a for a in sys.argv[1:] if not a.startswith('--')] or list(DESIGNS):
        fn, C = DESIGNS[n]
        fn(n, C)
