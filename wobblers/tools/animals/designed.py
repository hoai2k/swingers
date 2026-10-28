"""Animals built from designed body parts, sized and painted from their reference sheets (dev tool).

    python3 wobblers/tools/animals/designed.py [name ...]      # all of DESIGNS by default
    (needs numpy, scipy, Pillow and fast-simplification: pip install fast-simplification)

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


class Lite:
    """a panel's silhouette and its box (what build.write and the designs use)"""
    def __init__(self, rgb, m):
        self.rgb, self.m, self.body, self.comps = rgb, m, m, []
        rows = np.where(m.any(axis=1))[0]; cols = np.where(m.any(axis=0))[0]
        self.r0, self.r1, self.c0, self.c1 = rows[0], rows[-1], cols[0], cols[-1]


class Sheet:
    """One row of a reference sheet: side view (facing +z = right) and top view (head right), in
    metres. L = the side view's length; land: feet on y = 0, else centred on the side view."""
    def __init__(self, sheet, L, row=0, rows=1, land=False, cuts=(), belly=0, open_=0.3, full=False):
        img = load(sheet)
        self.sp, self.tp = panel(img, row, 0, rows), panel(img, row, 1, rows)
        sm = mask(self.sp)
        if land:
            sm = drop_ground_shadow(self.sp, sm, 0.45)
        # (full: build.py's View with the opened body and parts; designs only need the silhouettes)
        V = (lambda rgb, m, *a: View(rgb, m, *a)) if full else (lambda rgb, m, *a: Lite(rgb, m))
        self.S = V(self.sp, sm, open_, land, cuts, belly)
        self.T = V(self.tp, mask(self.tp), open_)
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


def trace(m, seed, step=None):
    """centre line of a limb-like mask from where it starts (seed: pixels where it joins the body),
    by flood-fill distance: [(col, row, half-width px), ...] from the base to the tip"""
    from collections import deque
    dt = ndi.distance_transform_edt(m)
    dist = np.full(m.shape, -1, np.int32); q = deque()
    for r, c in zip(*np.where(seed & m)):
        dist[r, c] = 0; q.append((r, c))
    H, W = m.shape
    while q:
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            r2, c2 = r + dr, c + dc
            if 0 <= r2 < H and 0 <= c2 < W and m[r2, c2] and dist[r2, c2] < 0:
                dist[r2, c2] = dist[r, c] + 1; q.append((r2, c2))
    if dist.max() < 2:
        return np.zeros((0, 3))
    step = step or max(2.0, 0.8 * float(np.median(dt[m])))
    out = []
    for k in np.arange(0, dist.max() + 1, step):
        sel = (dist >= k) & (dist < k + step)
        if sel.sum() < 2:
            continue
        rr, cc = np.where(sel)
        out.append((cc.mean(), rr.mean(), np.percentile(dt[sel], 85)))
    out = np.array(out)
    if len(out) > 3:
        for _ in range(2):
            out[1:-1, :2] = (out[:-2, :2] + out[1:-1, :2] * 2 + out[2:, :2]) / 4
    return out


def biggest(m):
    lab, n = ndi.label(m)
    return lab == (np.argmax(ndi.sum(m, lab, range(1, n + 1))) + 1) if n else m


def mask_sdf(sheet, m, view='t'):
    """a 2D outline (a mask in the top / side panel) as a signed distance over the grid's (z, x) / (z, y), metres"""
    s2 = sdf2(m).astype(np.float32)
    if view == 't':
        return lambda gz, gx: bilin(s2, sheet.col_t(gz), gx / sheet.kt + sheet.axis) * sheet.kt
    return lambda gz, gy: bilin(s2, sheet.col_s(gz), sheet.yref - gy / sheet.ks) * sheet.ks


def decimate(verts, faces, target):
    """simplify the mesh to about `target` triangles (quadric edge collapse); everything after it
    (normals, rig weights, paint) is computed from the vertices, so it follows"""
    if not target or len(faces) <= target:
        return verts, faces
    import fast_simplification
    v2, f2 = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int32), target_reduction=1 - target / len(faces))
    return v2.astype(np.float64), f2.astype(np.int64)


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
    verts, faces = decimate(verts, faces, C.get('tris'))
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

def perchd(name, C):
    """a bird standing on its legs (wings folded), designed part by part like quadd on the side
    view's box: a body through `body` sections [(u, v_top, v_bottom)], `neck` [(u, v, r)], `head`
    (u, v, r, stretch), `beak` [(u, v, r)], optional `crest` feathers [[(u, v, r), ...], ...],
    folded `wing` (u, v, rz, ry, rx) on WING_L / WING_R, a flat `tail` [(u, v, r)] (`tail_xs`,
    `tail_ys`), two legs `leg` [(u, v, r)] hip to foot on FL / FR (`spread` apart) with three toes
    forward and one back (`toe` length). Rig: HEAD, WING_L / WING_R, TAIL, FL / FR."""
    sh = Sheet(C['sheet'], C['L'], land=True)
    S = sh.S
    vh = (S.r1 - S.r0) * sh.ks
    P = lambda u, v, x=0.0: np.array([float(sh.zs(S.c0 + u * (S.c1 - S.c0))), float(sh.ys(S.r0 + v * (S.r1 - S.r0))), x * vh])
    w = max(float(sh.zs(S.c1)) - float(sh.zs(S.c0)), vh)
    G = Grid((float(sh.zs(S.c0)) - 0.05 * w, -0.05 * vh, -0.45 * w), (float(sh.zs(S.c1)) + 0.05 * w, float(sh.ys(S.r0)) + 0.05 * vh, 0.45 * w), C['res'])
    xs = C.get('xs', 0.8)
    bd = C['body']
    fields = [dict(name='body', d=G.cone([P(u, (a_ + b_) / 2) for u, a_, b_ in bd], [(b_ - a_) / 2 * vh for u, a_, b_ in bd], xs=xs), part='body')]
    neck = np.array([P(u, v) for u, v, r in C['neck']]); piv = neck[0]
    fields.append(dict(name='neck', d=G.cone(neck, [r * vh for u, v, r in C['neck']], xs=C.get('neck_xs', 0.9)), part='HEAD', pivot=piv))
    hu, hv, hr, hs = C['head']
    fields.append(dict(name='head', d=G.ell(P(hu, hv), (hr * vh * hs, hr * vh, hr * vh * C.get('head_xs', 0.95))), part='HEAD', pivot=piv))
    bk = np.array([P(u, v) for u, v, r in C['beak']])
    fields.append(dict(name='beak', d=G.cone(bk, [r * vh for u, v, r in C['beak']], xs=C.get('beak_xs', 0.75)), part='HEAD', pivot=piv, blend=0.004 * sh.L))
    for fe in C.get('crest', []):
        fields.append(dict(name='crest', d=G.cone(np.array([P(u, v) for u, v, r in fe]), [r * vh for u, v, r in fe], xs=0.5), part='HEAD', pivot=piv, blend=0.004 * sh.L))
    wu, wv, rz, ry, rx = C['wing']
    bw = C.get('wing_x', 0.1)
    for sgn, part in ((1, 'WING_L'), (-1, 'WING_R')):
        fields.append(dict(name=part, d=G.ell(P(wu, wv, sgn * bw), (rz * vh, ry * vh, rx * vh)), part=part, pivot=P(wu + rz * 0.6 * vh / (S.c1 - S.c0) / sh.ks, wv, sgn * bw), blend=0.01 * sh.L))
    tl = np.array([P(u, v) for u, v, r in C['tail']])
    fields.append(dict(name='tail', d=G.cone(tl, [r * vh for u, v, r in C['tail']], xs=C.get('tail_xs', 1.8), ysc=C.get('tail_ys', 0.35)), part='TAIL', pivot=tl[0], blend=0.01 * sh.L))
    sp = C.get('spread', 0.05); tlen = C.get('toe', 0.08) * vh
    for sgn, part in ((1, 'FL'), (-1, 'FR')):
        lp = np.array([P(u, v, sgn * sp) for u, v, r in C['leg']]); lr = [r * vh for u, v, r in C['leg']]
        fields.append(dict(name='leg' + part, d=G.cone(lp, lr), part=part, pivot=lp[0], blend=0.006 * sh.L))
        f = lp[-1].copy(); f[1] = lr[-1]
        for ang in (-0.5, 0.0, 0.5, np.pi):
            L_ = tlen * (0.55 if ang == np.pi else 1.0)
            tip = f + np.array([np.cos(ang) * L_, -lr[-1] * 0.4, np.sin(ang) * L_ * sgn])
            fields.append(dict(name='toe', d=G.cone([f, tip], [lr[-1] * 0.8, lr[-1] * 0.45]), part=part, pivot=lp[0], blend=0.004 * sh.L))
    finish(name, C, fields, G, sh, blend=C.get('blend', 0.02))


def quadd(name, C):
    """a four-legged animal designed part by part where quad.py's automatic measuring can't read the
    sheet (giant ears, a bushy tail held level, sprawled legs): every part is placed on the side
    view's box (u: tail end 0 .. nose 1, v: top 0 .. ground 1; radii in box heights), widths from
    the top view as ratios (xs). Parts: a torso through `torso` sections [(u, v_top, v_bottom)],
    `neck` [(u, v, r)], `head` (u, v, r, stretch), `muzzle` [(u, v, r)], `ears` [(u, v, r, x)] stacks
    (thin, mirrored), legs `front` / `hind` [(u, v, r)] from the hip down to the paw (+ `paw`
    (length, height) in box heights), `spread` (paws' x, in box heights), `tail` [(u, v, r)] with
    `tail_xs`. Rig: HEAD (neck, head, muzzle, ears), FL / FR / BL / BR, TAIL."""
    sh = Sheet(C['sheet'], C['L'], land=True)
    S, T = sh.S, sh.T
    vh = (S.r1 - S.r0) * sh.ks
    P = lambda u, v, x=0.0: np.array([float(sh.zs(S.c0 + u * (S.c1 - S.c0))), float(sh.ys(S.r0 + v * (S.r1 - S.r0))), x * vh])
    lo = (float(sh.zs(S.c0)) - 0.05 * vh, -0.05 * vh, -0.6 * vh)
    hi = (float(sh.zs(S.c1)) + 0.05 * vh, float(sh.ys(S.r0)) + 0.05 * vh, 0.6 * vh)
    G = Grid(lo, hi, C['res'])
    fields = []
    xs = C.get('xs', 0.8)
    tor = C['torso']
    cen = [P(u, (a_ + b_) / 2) for u, a_, b_ in tor]; rad = [(b_ - a_) / 2 * vh for u, a_, b_ in tor]
    fields.append(dict(name='body', d=G.cone(cen, rad, xs=xs), part='body'))
    neck = np.array([P(u, v) for u, v, r in C['neck']]); nr = [r * vh for u, v, r in C['neck']]
    hu, hv, hr, hs = C['head']; hc = P(hu, hv); piv = neck[0]
    fields.append(dict(name='neck', d=G.cone(neck, nr, xs=C.get('neck_xs', xs)), part='HEAD', pivot=piv))
    fields.append(dict(name='head', d=G.ell(hc, (hr * vh * hs, hr * vh, hr * vh * C.get('head_xs', 0.9))), part='HEAD', pivot=piv))
    mz = np.array([P(u, v) for u, v, r in C['muzzle']]); mr = [r * vh for u, v, r in C['muzzle']]
    fields.append(dict(name='muzzle', d=G.cone(mz, mr, xs=C.get('muzzle_xs', 0.85)), part='HEAD', pivot=piv, blend=0.01 * sh.L))
    for sgn in (1, -1):
        for u, v, r, x in C.get('ears', []):           # thin leaves (flat front to back), mirrored
            fields.append(dict(name='ear', d=G.ell(P(u, v, sgn * x), (r * vh, r * vh * C.get('ear_h', 1.6), r * vh * C.get('ear_t', 0.3))), part='HEAD', pivot=piv, blend=0.008 * sh.L))   # (broad seen from the side, thin across)
    sp = C['spread']
    for front, (pl, pr_) in ((True, ('FL', 'FR')), (False, ('BL', 'BR'))):
        chain = C['front' if front else 'hind']
        for sgn, part in ((1, pl), (-1, pr_)):
            # (u, v, r) points spread from 0.75 to 1 x `spread`; (u, v, r, x) points sit out at x (sprawled legs)
            pts = np.array([P(q[0], q[1], sgn * (q[3] if len(q) > 3 else sp * 0.75 + (sp * 0.25) * i / (len(chain) - 1))) for i, q in enumerate(chain)])
            rr = [q[2] * vh for q in chain]
            fields.append(dict(name='leg' + part, d=G.cone(pts, rr), part=part, pivot=pts[0], blend=0.012 * sh.L))
            pl_, ph_ = C.get('paw', (0.12, 0.05))
            foot = pts[-1].copy(); foot[1] = ph_ * vh * 0.6
            fields.append(dict(name='paw' + part, d=G.ell(foot + [pl_ * vh * 0.3, 0, 0], (pl_ * vh * 0.6, ph_ * vh * 0.6, rr[-1] * 1.3)), part=part, pivot=pts[0], blend=0.008 * sh.L))
    for u, v, rz, ry, rx, part in C.get('blobs', []):   # extra rounded volumes (a dewlap, a hump)
        fields.append(dict(name='blob', d=G.ell(P(u, v), (rz * vh, ry * vh, rx * vh)), part=part, pivot=piv if part == 'HEAD' else None, blend=0.012 * sh.L))
    if C.get('crest'):                                   # a row of spikes along the back (u0, u1, n, height)
        u0, u1, n, hgt = C['crest']
        tops = [(u, a_) for u, a_, b_ in tor] + [(C['head'][0], C['head'][1] - C['head'][2])]
        for i in range(n):
            u = u0 + (u1 - u0) * i / max(1, n - 1); v = float(np.interp(u, [q[0] for q in tops], [q[1] for q in tops]))
            hh = hgt * (1 - abs(i / max(1, n - 1) - 0.6) * 1.2)
            fields.append(dict(name='spike', d=G.cone([P(u, v + 0.03), P(u - 0.015, v - hh)], [0.04 * vh, 0.006 * vh]), part='HEAD' if u > C['neck'][0][0] else 'body', pivot=piv if u > C['neck'][0][0] else None, blend=0.004 * sh.L))
    if C.get('tail'):
        tp = np.array([P(u, v) for u, v, r in C['tail']]); tr = [r * vh for u, v, r in C['tail']]
        fields.append(dict(name='tail', d=G.cone(tp, tr, xs=C.get('tail_xs', 1.0)), part='TAIL', pivot=tp[0], blend=0.02 * sh.L))
    finish(name, C, fields, G, sh, blend=C.get('blend', 0.025))


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
    if C.get('prof_top'):    # a sheet with a raised neck / rattle: the top view's width is the reliable thickness
        hy_t = hx_t.copy()
    prof = hy_t / hy_t[int(0.3 * len(tt)):int(0.85 * len(tt))].max()
    if C.get('rattle'):      # the tail tapers into the rattle (beads added below), not into the drawn rattle's bulk
        rz = C['rattle'][1]
        prof = np.minimum(prof, np.clip(0.25 + (tt - rz) / 0.2, 0.25, 1.0))
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
    if C.get('rattle'):      # rattle: a stack of rounded beads at the tail tip, shrinking to a button
        n, rz = C['rattle']
        for i in range(n):
            z = -Ls / 2 + rz * Ls * (i + 0.5) / n; rb = R * (0.32 + 0.18 * i / max(1, n - 1))
            fields.append(dict(name='rattle', d=G.ell((z, R * 0.4, 0), (rz * Ls / n * 0.65, rb, rb * 1.1)), part='TAIL', pivot=(-Ls / 2 + rz * Ls * 1.5, R * 0.4, 0), blend=0.002 * Ls))
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


def _top_axes(sh):
    T = sh.T
    return sh.xt(np.arange(T.m.shape[0]))[:, None], sh.zt(np.arange(T.m.shape[1]))[None, :]


def _flippers(sh, G, fields, keep_out, bodyx, yroot, droop, root_t, wing_parts, leg_parts, zsplit, min_frac=0.02):
    """flippers / fins: the top view's pieces sticking out sideways (outside keep_out), the biggest
    one per side in front of zsplit (wing_parts) and behind it (leg_parts); each a plate in its
    outline, rooted at bodyx(z), drooping by droop(|x| beyond the root, tip) from yroot"""
    from build import disk
    T = sh.T
    xT, zT = _top_axes(sh)
    rest = T.m & ~keep_out
    lab, n = ndi.label(rest)
    pieces = []
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < min_frac * T.m.sum():
            continue
        zc_ = float((zT * m).sum() / m.sum() * 1) if False else float(np.mean(np.broadcast_to(zT, m.shape)[m]))
        xc_ = float(np.mean(np.broadcast_to(xT, m.shape)[m]))
        pieces.append((m, zc_, xc_))
    out = []
    for front, parts in ((True, wing_parts), (False, leg_parts)):
        for sgn, part in ((1, parts[0]), (-1, parts[1])):
            c = [p for p in pieces if (p[1] > zsplit) == front and p[2] * sgn > 0]
            if not c:
                continue
            m, zc_, xc_ = max(c, key=lambda p: p[0].sum())
            zcols = np.broadcast_to(zT, m.shape)[m]; xs_ = np.abs(np.broadcast_to(xT, m.shape)[m])
            xr = bodyx(zc_); xtip = float(xs_.max())
            grow = ndi.binary_dilation(m, structure=disk(max(3, 0.06 * (T.r1 - T.r0)))) & T.m & (np.abs(xT) > 0.3 * xr)
            pm = ndi.binary_closing(m | grow, iterations=2)
            sdf = mask_sdf(sh, pm)
            th0 = root_t
            thick = lambda gz, gx, xr=xr, xtip=xtip, th0=th0: th0 * np.clip(1 - (np.abs(gx) - xr) / max(1e-6, xtip - xr), 0.08, 1)
            ymid = lambda gz, gx, xr=xr, xtip=xtip, fr=front: yroot - droop(fr) * np.clip((np.abs(gx) - xr) / max(1e-6, xtip - xr), 0, 1) * (xtip - xr)
            zroot = float(np.mean(zcols[xs_ < xr + 0.25 * (xtip - xr)])) if (xs_ < xr + 0.25 * (xtip - xr)).any() else zc_
            fields.append(dict(name=part, d=G.plate(sdf, thick, ymid), part=part, pivot=(zroot, yroot, sgn * xr), blend=0.012 * sh.L))
            out.append(part)
    return out


def turtle(name, C):
    """a sea turtle: a domed shell (an ellipsoid, higher above its rim than below) as outlined from
    above, a head on a short neck, flat flippers cut from the top view (front ones flap: WING_L /
    WING_R, back ones paddle: BL / BR), a short tail"""
    from build import disk
    sh = Sheet(C['sheet'], C['L'])
    S, T = sh.S, sh.T
    xT, zT = _top_axes(sh)
    shell = biggest(ndi.binary_opening(T.m, structure=disk(0.2 * (T.r1 - T.r0) * C.get('shell_open', 0.5))))
    zsh = np.broadcast_to(zT, shell.shape)[shell]; xsh = np.abs(np.broadcast_to(xT, shell.shape)[shell])
    z0, z1 = float(zsh.min()), float(zsh.max()); rz = (z1 - z0) / 2; zc_ = (z0 + z1) / 2; rx = float(xsh.max())
    zS_, topS, botS = sh.side_profile()
    on = (zS_ > z0) & (zS_ < z1)
    ytop = float(topS[on].max())
    ybot = float(np.median(botS[(zS_ > z0 + 0.2 * rz) & (zS_ < zc_)])) if ((zS_ > z0 + 0.2 * rz) & (zS_ < zc_)).any() else float(botS[on].min())
    yeq = ybot + 0.32 * (ytop - ybot)
    lo = (float(sh.zs(S.c0)) - 0.03, float(sh.ys(S.r1)) - 0.03, -float(np.abs(sh.xt(np.array([T.r0, T.r1]))).max()) - 0.03)
    hi = (float(sh.zs(S.c1)) + 0.03, float(sh.ys(S.r0)) + 0.03, -lo[2])
    G = Grid(lo, hi, C['res'])
    ryt, ryb = ytop - yeq, yeq - ybot
    ry = np.where(G.gy > yeq, ryt, ryb)
    e = np.sqrt(((G.gz - zc_) / rz) ** 2 + ((G.gy - yeq) / ry) ** 2 + (G.gx / rx) ** 2)
    fields = [dict(name='shell', d=((e - 1) * np.minimum(ry, min(rz, rx))).astype(np.float32), part='body')]
    # head: the top view in front of the shell, as wide as it is there; height from the side view
    hm = biggest(T.m & (zT > z1 - 0.05 * rz) & (np.abs(xT) < 0.45 * rx))
    hz = np.broadcast_to(zT, hm.shape)[hm]; hx = np.abs(np.broadcast_to(xT, hm.shape)[hm])
    ztip = float(hz.max()); hw = float(np.percentile(hx, 97))
    zh = ztip - 1.1 * hw
    yh = float(np.interp(zh, zS_, (topS + botS) / 2)); hry = float(np.interp(zh, zS_, (topS - botS) / 2))
    hry = min(hry, 1.1 * hw)
    piv = (z1 - 0.25 * rz, yeq + 0.1 * ryt, 0)
    fields.append(dict(name='head', d=G.ell((zh, yh, 0), (1.15 * hw, hry, hw)), part='HEAD', pivot=piv))
    fields.append(dict(name='neck', d=G.cone([[z1 - 0.3 * rz, yeq + 0.05 * ryt, 0], [zh - 0.4 * hw, yh, 0]], [0.75 * hw, 0.7 * hw], xs=1.1), part='HEAD', pivot=piv))
    keep = ndi.binary_dilation(shell, iterations=3) | hm
    _flippers(sh, G, fields, keep, lambda z: rx * np.sqrt(max(0.05, 1 - ((z - zc_) / rz) ** 2)) * 0.85, yeq - 0.15 * ryb,
              lambda fr: C.get('droop', 0.35) if fr else C.get('droop_back', 0.15), 0.3 * ryb, ('WING_L', 'WING_R'), ('BL', 'BR'), zc_)
    fields.append(dict(name='tail', d=G.cone([[z0 + 0.15 * rz, yeq, 0], [z0 - 0.12 * rz, yeq - 0.1 * ryb, 0]], [0.16 * ryb * 2, 0.04 * ryb * 2]), part='body'))
    finish(name, C, fields, G, sh, blend=0.02)


def plesiosaur(name, C):
    """a plesiosaur: a smooth torso (measured cross-sections), a long neck and head along the drawn
    neck's centre line (HEAD), a tapering tail along the drawn tail (TAIL), four flippers cut from
    the top view (front: WING_L / WING_R, back: BL / BR) held out a little below the body"""
    from build import disk
    sh = Sheet(C['sheet'], C['L'])
    S, T = sh.S, sh.T
    xT, zT = _top_axes(sh)
    # torso from above: the central run's width, opened hard (neck, tail, flippers off)
    axis_r = int(round(sh.axis))
    cw = np.zeros(T.m.shape[1])
    for c in range(T.m.shape[1]):
        for a, b in runs(T.m[:, c]):
            if a <= axis_r < b:
                cw[c] = (b - a) / 2
    bwpx = np.percentile(cw[cw > 0], 90)
    torso_t = biggest(ndi.binary_opening(T.m, structure=disk(C.get('torso_open', 0.75) * bwpx)))
    tzz = np.broadcast_to(zT, torso_t.shape)[torso_t]
    tz0, tz1 = float(tzz.min()), float(tzz.max())
    # side: top / bottom per column over the torso, flipper dips under it closed
    zS_, topS, botS = sh.side_profile()
    on = (zS_ >= tz0) & (zS_ <= tz1)
    zc = zS_[on]; top = topS[on]
    bot = np.maximum(botS[on], np.percentile(botS[on], 80))       # flippers hang below most of the belly
    top = ndi.gaussian_filter1d(top, 3); bot = ndi.gaussian_filter1d(bot, 3)
    wcol = np.array([((torso_t[:, int(round(float(sh.col_t(z))))]).sum() / 2) * sh.kt for z in zc])
    wcol = ndi.gaussian_filter1d(wcol, 3)
    # (side-on, flippers reach the ground under nearly all of the torso: its depth follows its width)
    ax = wcol; ay = np.maximum(C.get('depth', 0.6) * ax, 1e-3); yc = top - ay
    lo = (float(sh.zs(S.c0)) - 0.05, float(sh.ys(S.r1)) - 0.05, -float(np.abs(sh.xt(np.array([T.r0, T.r1]))).max()) - 0.05)
    hi = (float(sh.zs(S.c1)) + 0.05, float(sh.ys(S.r0)) + 0.05, -lo[2])
    G = Grid(lo, hi, C['res'])
    zq = np.clip(G.gz, zc[0], zc[-1])
    Yc, Ay, Ax = (np.interp(zq, zc, v) for v in (yc, ay, ax))
    ez = np.where(G.gz < zc[0], (zc[0] - G.gz) / (0.8 * min(ay[0], ax[0])), np.where(G.gz > zc[-1], (G.gz - zc[-1]) / (0.8 * min(ay[-1], ax[-1])), 0))
    f = np.sqrt(((G.gy - Yc) / Ay) ** 2 + (G.gx / Ax) ** 2 + ez ** 2)
    fields = [dict(name='torso', d=((f - 1) * np.minimum(Ay, Ax)).astype(np.float32), part='body')]
    zmid = (tz0 + tz1) / 2
    # neck + head, tail: traced in the side view from where they leave the torso
    # (only above the torso's lower half there: flippers hang under the tail base and the neck)
    Z = sh.zs(np.arange(S.m.shape[1]))[None, :]; Yr = sh.ys(np.arange(S.m.shape[0]))[:, None]
    yfl = lambda z: float(np.interp(z, zc, yc)) - 0.6 * float(np.interp(z, zc, ay))
    # the tail: its thickness from above (the central run), hanging from the side view's back line by it
    tcols = [c for c in range(T.m.shape[1]) if cw[c] > 0 and float(sh.zt(c)) < tz0 + 0.06 * sh.L]
    if len(tcols) > 3:
        ztl = sh.zt(np.array(tcols)); rtl = ndi.gaussian_filter1d(cw[tcols] * sh.kt, 2)
        ytl = np.interp(ztl, zS_, ndi.gaussian_filter1d(topS, 3)) - rtl
        o = np.argsort(-ztl)                                       # from the torso back to the tip
        pts = np.stack([ztl[o], ytl[o], np.zeros(len(o))], 1); rad = rtl[o]
        r0 = min(float(np.percentile(rtl, 60)), float(ax[0]))   # (the run beside the torso includes flipper roots)
        rad = r0 + (max(float(rad[-1]), 0.12 * r0) - r0) * np.linspace(0, 1, len(rad))
        pts[:, 1] = np.interp(pts[:, 0], zS_, ndi.gaussian_filter1d(topS, 3)) - rad
        fields.append(dict(name='tail', d=G.cone(pts[::3], np.maximum(rad[::3], 0.8 * G.h)), part='TAIL', pivot=pts[0]))
    for nm, sel, seedz, part in (('neck', (Z > tz1 - 0.04 * sh.L) & (Yr > yfl(tz1)), tz1 - 0.04 * sh.L, 'HEAD'),):
        m = biggest(S.m & sel)
        seed = m & (np.abs(Z - seedz) < 0.01 * sh.L)
        tr = trace(m, seed)
        if len(tr) < 3:
            continue
        pts = np.stack([sh.zs(tr[:, 0]), sh.ys(tr[:, 1]), np.zeros(len(tr))], 1); rad = tr[:, 2] * sh.ks
        if nm == 'tail':
            rad = rad[0] + (max(rad[-1], 0.15 * rad[0]) - rad[0]) * np.linspace(0, 1, len(rad))
        else:
            # the neck tapers smoothly to the head; the head (its last stretch) gets a skull and snout
            nh = max(3, int(len(pts) * C.get('head_frac', 0.2)))
            rad = ndi.gaussian_filter1d(rad, 2)
            hp = pts[-nh:]; hr = float(rad[-nh:].max())
            skull = hp[int(nh * 0.35)]
            fields.append(dict(name='skull', d=G.ell(skull, (1.3 * hr, hr, 0.95 * hr)), part='HEAD', pivot=pts[0]))
            fields.append(dict(name='snout', d=G.cone([skull, pts[-1] - (pts[-1] - skull) * 0.05], [0.85 * hr, 0.35 * hr], xs=0.9), part='HEAD', pivot=pts[0]))
            # the neck: from deep in the front of the torso, as thick as the body there, along the
            # drawn neck's (smoothed) line, tapering steadily to the head; a wide fillet into the shoulders
            zb = tz1 - C.get('neck_root', 0.15) * (tz1 - tz0)
            yb_, ab_, xb_ = float(np.interp(zb, zc, yc)), float(np.interp(zb, zc, ay)), float(np.interp(zb, zc, ax))
            npts = pts[:-nh // 2].copy()
            npts[:, 0] = ndi.gaussian_filter1d(npts[:, 0], 2, mode='nearest'); npts[:, 1] = ndi.gaussian_filter1d(npts[:, 1], 2, mode='nearest')
            npts = npts[npts[:, 0] > zb + 0.3 * ab_]
            base = np.array([zb, yb_ + 0.15 * ab_, 0.0])
            pts = np.vstack([base, npts])
            t = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]); t /= t[-1]
            rb = 0.85 * min(ab_, xb_); rhd = 0.75 * hr
            rad = rhd + (rb - rhd) * (1 - t) ** 1.8
            fields.append(dict(name=nm, d=G.cone(pts, np.maximum(rad, 0.8 * G.h)), part=part, pivot=pts[0], blend=C.get('neck_blend', 0.06) * sh.L))
            continue
        fields.append(dict(name=nm, d=G.cone(pts, np.maximum(rad, 0.8 * G.h)), part=part, pivot=pts[0]))
    keep = ndi.binary_dilation(torso_t, iterations=4) | (np.abs(xT) < 0.6 * bwpx * sh.kt)
    yr = float(np.interp(zmid, zc, yc)) - 0.3 * float(np.interp(zmid, zc, ay))
    _flippers(sh, G, fields, keep, lambda z: 0.7 * float(np.interp(z, zc, ax)), yr, lambda fr: C.get('droop', 0.3),
              0.32 * float(ay.max()), ('WING_L', 'WING_R'), ('BL', 'BR'), zmid)
    finish(name, C, fields, G, sh, blend=0.02)


def manta(name, C):
    """a manta ray: a flat egg of a body, wings cut from the top view's outline (WING_L / WING_R,
    a slight lift to the tips), the curled cephalic lobes (HEAD), a long whip tail (TAIL). Undersides
    take the white of the side view's belly. u: side / top box along z (tail tip 0 .. front 1),
    v: top box across (0 .. 1), w: side box down (0 top .. 1 bottom)"""
    sh = Sheet(C['sheet'], C['L'])
    S, T = sh.S, sh.T
    xT, zT = _top_axes(sh)
    zu = lambda u: float(sh.zs(S.c0 + u * (S.c1 - S.c0)))
    yw = lambda w: float(sh.ys(S.r0 + w * (S.r1 - S.r0)))
    span = (T.r1 - T.r0) * sh.kt                                  # wing tip to wing tip (m)
    (bu0, bu1), (bw0, bw1) = C['body_u'], C['body_w']
    zb0, zb1 = zu(bu0), zu(bu1); ry = (yw(bw1) - yw(bw0)) / -2 if yw(bw1) < yw(bw0) else (yw(bw0) - yw(bw1)) / 2
    ry = abs(ry); ymid = (yw(bw0) + yw(bw1)) / 2; rx = C['body_x'] * span
    lo = (zu(0) - 0.05, yw(1) - 0.1, -span / 2 - 0.05); hi = (zu(1) + 0.05, yw(0) + 0.1, span / 2 + 0.05)
    G = Grid(lo, hi, C['res'])
    zc_ = (zb0 + zb1) / 2
    fields = [dict(name='body', d=G.ell((zc_, ymid, 0), ((zb1 - zb0) / 2, ry, rx)), part='body')]
    dih = np.tan(np.radians(C.get('lift', 6)))
    surf = lambda gz, gx: ymid + 0.1 * ry + np.maximum(np.abs(gx) - rx, 0) * dih
    cu = C['ceph_u']; zcf = zu(cu)
    for sgn, part in ((1, 'WING_L'), (-1, 'WING_R')):
        wm = T.m & (xT * sgn > 0.45 * rx) & ~((zT < zu(C['tail_u'])) & (np.abs(xT) < 0.12 * span)) & (zT < zcf)
        wm = ndi.binary_opening(biggest(wm), iterations=2)
        tip = float(np.abs(np.broadcast_to(xT, wm.shape)[wm]).max())
        th = lambda gz, gx, tip=tip: 0.75 * ry * np.clip(1 - (np.abs(gx) - 0.5 * rx) / (tip - 0.5 * rx), 0.04, 1) ** 1.3
        fields.append(dict(name=part, d=G.plate(mask_sdf(sh, wm), th, surf), part=part, pivot=(zc_, ymid, sgn * 0.8 * rx), blend=0.02 * sh.L))
        # cephalic lobe: the top view's lobe in front of the head, a thick curled-down plate
        cm = biggest(T.m & (zT > zcf - 0.02 * sh.L) & (xT * sgn > 0.25 * rx))
        if cm.sum() > 10:
            fields.append(dict(name='lobe', d=G.plate(mask_sdf(sh, cm), lambda gz, gx: 0.28 * ry + 0 * gz, lambda gz, gx: ymid - 0.15 * ry + 0 * gz), part='HEAD', pivot=(zb1 - 0.2 * (zb1 - zb0), ymid, 0), blend=0.015 * sh.L))
    # tail: a whip along the side view's tail line
    zS_, topS, botS = sh.side_profile()
    tz = np.linspace(zu(C['tail_u']) + 0.03 * sh.L, zu(0) + 0.005, 24)
    ty = np.interp(tz, zS_, ndi.gaussian_filter1d((topS + botS) / 2, 3))
    tr = np.linspace(0.16 * ry, 0.025 * ry, len(tz))
    fields.append(dict(name='tail', d=G.cone(np.stack([tz, ty, 0 * tz], 1), np.maximum(tr, 0.7 * G.h)), part='TAIL', pivot=(tz[0], ty[0], 0)))
    # paint: anything below the wings' mid-surface takes the side view's white belly
    ybel = yw(C.get('belly_w', 0.88))
    def inv(P):
        z, y, x = P[:, 0], P[:, 1], P[:, 2]
        under = y < surf(z, x) - 0.05 * ry
        out = P.copy()
        out[under, 0] = np.clip(z[under], zu(0.5), zu(0.72)); out[under, 1] = ybel
        return out
    for f in fields:
        if f['part'] in ('body', 'WING_L', 'WING_R'):
            f['inv'] = inv
    finish(name, C, fields, G, sh, blend=0.02)


def jellyfish(name, C):
    """a jellyfish, upright (the sheet draws it swimming sideways): a domed bell with a hollow
    underside (the body: the game's pulse squeezes it), frilly oral arms from its middle and thin
    tentacles from its rim (each its own tentacle part: the game waves them). Painted from the side
    view only, each part mapped back onto where the drawing has it."""
    sh = Sheet(C['sheet'], C['L'])
    S = sh.S
    zu = lambda u: float(sh.zs(S.c0 + u * (S.c1 - S.c0)))
    yv = lambda v: float(sh.ys(S.r0 + v * (S.r1 - S.r0)))
    z_rim_s, z_apex_s = zu(C['rim_u']), zu(1.0)
    axis_s = yv(0.5); Rs = (yv(0) - yv(1)) / 2                     # the drawn bell's radius (across)
    R, D, Lt = C['R'], C['D'], C['tent']                            # our bell radius, depth, tentacle length
    G = Grid((-R * 1.6, -Lt - 0.05, -R * 1.6), (R * 1.6, D * 1.15, R * 1.6), C['res'])
    gz, gy, gx = G.gz, G.gy, G.gx
    outer = np.sqrt((gx / R) ** 2 + (gy / D) ** 2 + (gz / R) ** 2)
    inner = np.sqrt((gx / (0.86 * R)) ** 2 + ((gy + 0.12 * D) / (0.78 * D)) ** 2 + (gz / (0.86 * R)) ** 2)
    bell = np.maximum.reduce([(outer - 1) * min(R, D), -(inner - 1) * 0.8 * min(R, D), -(gy + 0.04 * D)])
    fields = [dict(name='bell', d=bell.astype(np.float32), part='body')]
    rng = np.random.default_rng(7)
    k = 0
    def wavy(x0, z0, length, n, amp, ph, out):
        t = np.linspace(0, 1, n)
        ang = np.arctan2(z0, x0) if (x0 or z0) else 0
        rr = np.hypot(x0, z0) + out * t
        w = amp * np.sin(t * 3 * np.pi + ph) * t
        return np.stack([np.sin(ang) * rr + np.cos(ang) * w, -t * length, np.cos(ang) * rr - np.sin(ang) * w], 1)  # (z, y, x)
    # oral arms: 4 frilly ribbons from the middle
    for i in range(C.get('arms', 4)):
        a = np.pi / 4 + i * np.pi / 2
        pts = wavy(0.18 * R * np.cos(a), 0.18 * R * np.sin(a), Lt * 0.62, 18, 0.06 * R, rng.uniform(0, 6), 0.1 * R)
        pts = np.vstack([[pts[0, 0], 0.62 * D, pts[0, 2]], pts])    # rooted on the inside of the dome
        tt_ = np.linspace(0, 1, len(pts))
        rad = (0.075 * R - 0.04 * R * tt_) * (1 + 0.35 * np.sin(tt_ * 44 + i))   # frilly
        fields.append(dict(name='arm', d=G.cone(pts, np.maximum(rad, 0.8 * G.h)), part=10 + k, pivot=pts[0], vband=0.5 + 0.1 * np.cos(a), ln=Lt * 0.62, base=pts[0]))
        k += 1
    # tentacles from the rim
    nt = C.get('tentacles', 10)
    for i in range(nt):
        a = 2 * np.pi * i / nt + 0.2
        pts = wavy(0.9 * R * np.cos(a), 0.9 * R * np.sin(a), Lt * rng.uniform(0.75, 1.0), 22, 0.08 * R, rng.uniform(0, 6), 0.15 * R)
        rad = np.linspace(0.04 * R, 0.018 * R, len(pts))
        fields.append(dict(name='tentacle', d=G.cone(pts, np.maximum(rad, 0.75 * G.h)), part=10 + k, pivot=pts[0], vband=[0.06, 0.94, 0.2, 0.8, 0.12, 0.88][i % 6], ln=Lt, base=pts[0]))
        k += 1
    # paint: the bell maps onto the drawn bell (our height -> along its axis, our z -> across it);
    # arms and tentacles run left from the drawn rim along their own band of the drawing
    len_s = z_rim_s - zu(0.02)
    def inv_bell(P):
        z, y, x = P[:, 0], P[:, 1], P[:, 2]
        return np.stack([z_rim_s + np.clip(y, 0, None) / D * (z_apex_s - z_rim_s), axis_s + z / R * Rs, x], 1)
    fields[0]['inv'] = inv_bell
    for f in fields[1:]:
        def inv(P, f=f):
            z, y, x = P[:, 0], P[:, 1], P[:, 2]
            down = np.clip((f['base'][1] - y) / f['ln'], 0, 1)
            off = (z - f['base'][0]) * 0.3
            return np.stack([z_rim_s - down * len_s, yv(f['vband']) + off * Rs / R, x], 1)
        f['inv'] = inv
    finish(name, C, fields, G, sh, blend=0.015, length=2 * R)


def octopus(name, C):
    """an octopus: a mantle (a tilted egg, raised behind the head), a round head with the eyes, and
    eight arms that follow the drawn arms from above (curls included) lying on the ground and rising
    to the head at their roots, each its own tentacle part"""
    from build import disk
    sh = Sheet(C['sheet'], C['L'])
    S, T = sh.S, sh.T
    xT, zT = _top_axes(sh)
    zu = lambda u: float(sh.zs(S.c0 + u * (S.c1 - S.c0)))
    yv = lambda v: float(sh.ys(S.r0 + v * (S.r1 - S.r0)))
    vh = yv(0) - yv(1)
    # mantle + head from above: the top view opened (arms are thinner)
    core = biggest(ndi.binary_opening(T.m, structure=disk(C.get('core_open', 0.09) * (T.r1 - T.r0))))
    cz = np.broadcast_to(zT, core.shape)[core]; cx = np.abs(np.broadcast_to(xT, core.shape)[core])
    hu, hv, hr = C['head']; zh, yh = zu(hu), yv(hv); rh = hr * vh
    (mu0, mu1), (mv0, mv1) = C['mantle_u'], C['mantle_v']
    zm0, zm1 = zu(mu0), zu(mu1); ym = (yv(mv0) + yv(mv1)) / 2
    lift = C.get('mantle_lift', 0) * (yv(0) - yv(1))            # the mantle carried higher than drawn
    rmz, rmy = (zm1 - zm0) / 2, (yv(mv0) - yv(mv1)) / 2
    rmx = float(np.percentile(cx[(cz > zm0) & (cz < zm1)], 95)) if ((cz > zm0) & (cz < zm1)).any() else rmy
    rmx = min(rmx, 1.3 * rmy)
    span = float(np.abs(sh.xt(np.array([T.r0, T.r1]))).max())
    ext = (C.get('arm_len', 1.0) - 1) * 0.6 * sh.L                  # room for the longer arms
    G = Grid((zu(0) - 0.03 - ext, -0.02, -span * C.get('arm_len', 1.0) - 0.03), (zu(1) + 0.03 + ext, yv(0) + 0.03 + lift, span * C.get('arm_len', 1.0) + 0.03), C['res'])
    gz, gy, gx = G.gz, G.gy, G.gx
    tilt = np.radians(C.get('tilt', 18)); zc_ = (zm0 + zm1) / 2
    dz, dy = gz - zc_, gy - ym - lift
    rz_, ry_ = dz * np.cos(tilt) + dy * np.sin(tilt), -dz * np.sin(tilt) + dy * np.cos(tilt)
    e = np.sqrt((rz_ / rmz) ** 2 + (ry_ / rmy) ** 2 + (gx / rmx) ** 2)
    fields = [dict(name='mantle', d=((e - 1) * min(rmz, rmy, rmx)).astype(np.float32), part='body',
                   inv=lambda P: P - np.array([0, lift, 0]) * np.clip((zh - P[:, :1]) / max(1e-6, zh - zc_), 0, 1))]
    hx = min(rh * 1.1, float(np.percentile(cx[np.abs(cz - zh) < rh], 95)) if (np.abs(cz - zh) < rh).any() else rh)
    fields.append(dict(name='head', d=G.ell((zh, yh, 0), (rh, rh, hx)), part='body'))
    # the mantle grows out of the back of the head
    fields.append(dict(name='nape', d=G.cone([[zh, yh, 0], [zc_ + 0.35 * rmz, ym + lift + 0.1 * rmy, 0]], [0.85 * rh, 0.75 * rmy], xs=float(np.clip(hx / rh, 0.8, 1.2))), part='body',
                       inv=lambda P: P - np.array([0, lift, 0]) * np.clip((zh - P[:, :1]) / max(1e-6, zh - zc_), 0, 1)))
    # eyes: bulging from the sides of the head where the side view draws them (its eye paints them;
    # their tops, seen from above, read as lids)
    eu, ev, er = C['eye']
    ze, ye = zu(eu), yv(ev); re = er * vh
    for sgn in (1, -1):
        fields.append(dict(name='eye', d=G.ell((ze, ye, sgn * 0.92 * hx), (re, re, 0.8 * re)), part='body', blend=0.006 * sh.L))
    # the skirt under the head where the arms meet
    fields.append(dict(name='web', d=G.ell((zh - 0.2 * rh, 0.45 * yh, 0), (1.3 * rh, 0.45 * yh, 1.2 * hx)), part='body'))
    # arms: the top view outside the mantle / head, traced from where they leave it
    arms = T.m & ~ndi.binary_dilation(core, iterations=2)
    lab, n = ndi.label(arms)
    pieces = sorted([lab == i for i in range(1, n + 1)], key=lambda m: -m.sum())[:C.get('arms', 8)]
    seedzone = ndi.binary_dilation(core, iterations=6) & ~core
    k = 0
    for m in pieces:
        if m.sum() < 0.004 * T.m.sum():
            continue
        tr = trace(m, seedzone)
        if len(tr) < 4:
            continue
        z_ = sh.zt(tr[:, 0]); x_ = sh.xt(tr[:, 1]); r_ = tr[:, 2] * sh.kt
        # a curled tip reads as a filled blob from above: stop where the arm swells, and curl it
        r0 = float(np.median(r_[: max(2, len(r_) // 3)]))
        cut = next((i for i in range(len(r_) // 3, len(r_)) if r_[i] > 1.5 * np.median(r_[max(0, i - 6):i])), len(r_))
        blob_r = float(r_[cut:].max()) if cut < len(r_) else 0.0
        z_, x_ = z_[:cut], x_[:cut]
        if blob_r > 0 and len(z_) > 2:
            d = np.array([z_[-1] - z_[-2], x_[-1] - x_[-2]]); d /= np.linalg.norm(d) + 1e-9
            turn = 1.0 if (k % 2) else -1.0
            rc = 0.75 * blob_r; ang0 = np.arctan2(d[1], d[0]) - turn * np.pi / 2
            cz, cx2 = z_[-1] - rc * np.cos(ang0), x_[-1] - rc * np.sin(ang0)
            th = np.linspace(0, 1.6 * np.pi, 14)[1:]
            rr = rc * (1 - 0.55 * th / th[-1])
            z_ = np.concatenate([z_, cz + rr * np.cos(ang0 + turn * th)]); x_ = np.concatenate([x_, cx2 + rr * np.sin(ang0 + turn * th)])
        # longer than drawn (stretched out from where it leaves the head); paint mapped back
        al = C.get('arm_len', 1.0); z00, x00 = float(z_[0]), float(x_[0])
        z_ = z00 + (z_ - z00) * al; x_ = x00 + (x_ - x00) * al
        n_ = len(z_); t = np.linspace(0, 1, n_)
        r_ = r0 * (1 - 0.8 * t)                                    # tapering to the tip
        y_ = r_ + (0.5 * yh) * np.clip(1 - t / 0.35, 0, 1) ** 2        # rising to the head at the root
        root = np.array([zh - 0.2 * rh, 0.55 * yh, 0.3 * np.sign(x_[0]) * hx])
        pts = np.vstack([root, np.stack([z_, y_, x_], 1)]); rad = np.concatenate([[r_[0] * 1.1], r_])
        def inv(P, z00=z00, x00=x00, al=al):
            out = P.copy(); out[:, 0] = z00 + (P[:, 0] - z00) / al; out[:, 2] = x00 + (P[:, 2] - x00) / al
            return out
        fields.append(dict(name='arm', d=G.cone(pts, np.maximum(rad, 0.8 * G.h)), part=10 + k, pivot=pts[1], inv=inv))
        k += 1
    print(f'{name}: {k} arms')
    finish(name, C, fields, G, sh, blend=0.03)


def _limbs_from_top(sh, core, n, min_frac=0.004):
    """the top view's pieces outside core (dilated), biggest first, each traced from where it leaves
    the core: [(z, x, r), ...] per piece, plus its mask"""
    T = sh.T
    rest = T.m & ~ndi.binary_dilation(core, iterations=2)
    lab, k = ndi.label(rest)
    pieces = sorted([lab == i for i in range(1, k + 1)], key=lambda m: -m.sum())[:n]
    seedzone = ndi.binary_dilation(core, iterations=6) & ~core
    out = []
    for m in pieces:
        if m.sum() < min_frac * T.m.sum():
            continue
        tr = trace(m, seedzone)
        if len(tr) >= 3:
            out.append((sh.zt(tr[:, 0]), sh.xt(tr[:, 1]), tr[:, 2] * sh.kt, m))
    return out


def seastar(name, C):
    """a sea star: a domed disc and five flattened arms tapering along the drawn ones (from above)"""
    from build import disk
    sh = Sheet(C['sheet'], C['L'], row=C['row'], rows=C['rows'])
    T = sh.T
    zT_, cxT, hwT = sh.top_profile()
    core = biggest(ndi.binary_opening(T.m, structure=disk(C.get('core_open', 0.13) * (T.r1 - T.r0))))
    xT, zT = _top_axes(sh)
    cz = float(np.mean(np.broadcast_to(zT, core.shape)[core])); cx = float(np.mean(np.broadcast_to(xT, core.shape)[core]))
    rc = float(np.sqrt(core.sum() / np.pi)) * sh.kt
    th = C.get('thick', 0.22) * rc
    span = float(max(np.abs(sh.xt(np.array([T.r0, T.r1]))).max(), np.abs(zT_ - cz).max()))
    G = Grid((cz - span - 0.02, -0.01, -span - 0.02), (cz + span + 0.02, 2.5 * th, span + 0.02), C['res'])
    fields = [dict(name='disc', d=G.ell((cz, 0.9 * th, cx), (rc, 1.2 * th, rc)), part='body')]
    for z_, x_, r_, m in _limbs_from_top(sh, core, 5):
        r0 = float(np.median(r_[: max(2, len(r_) // 3)]))
        n_ = len(z_); t = np.linspace(0, 1, n_)
        rad = np.maximum(r0 * (1 - 0.8 * t), 0.8 * G.h)
        pts = np.vstack([[cz, 0.9 * th, cx], np.stack([z_, 0.9 * th * (1 - 0.55 * t), x_], 1)])
        fields.append(dict(name='arm', d=G.cone(pts, np.concatenate([[rad[0]], rad]), ysc=C.get('flat', 0.45)), part='body'))
    finish(name, C, fields, G, sh, blend=0.03, length=2 * span)


def crab(name, C):
    """a crab: an oval shell over a smaller body, eight walking legs following the drawn ones from
    above and arched (up from the body to a knee, down to the tip: front pairs FL / FR, back pairs
    BL / BR), two arms with claws (two fingers each) and two eye stalks. u / v: the side box."""
    from build import disk
    sh = Sheet(C['sheet'], C['L'], row=C['row'], rows=C['rows'])
    S, T = sh.S, sh.T
    xT, zT = _top_axes(sh)
    yv = lambda v: float(sh.ys(S.r0 + v * (S.r1 - S.r0)))
    zu = lambda u: float(sh.zs(S.c0 + u * (S.c1 - S.c0)))
    core = biggest(ndi.binary_opening(T.m, structure=disk(C.get('core_open', 0.12) * (T.r1 - T.r0))))
    czs = np.broadcast_to(zT, core.shape)[core]; cxs = np.abs(np.broadcast_to(xT, core.shape)[core])
    z0, z1 = float(czs.min()), float(czs.max()); rz = (z1 - z0) / 2; zc_ = (z0 + z1) / 2; rx = float(np.percentile(cxs, 98))
    (v0, v1) = C['shell_v']; ytop, ybot = yv(v0), yv(v1); ry = (ytop - ybot) / 2; yc_ = (ytop + ybot) / 2
    span = float(np.abs(sh.xt(np.array([T.r0, T.r1]))).max())
    G = Grid((zu(0) - 0.02, -0.01, -span - 0.02), (zu(1) + 0.02, yv(0) + 0.02, span + 0.02), C['res'])
    fields = [dict(name='shell', d=G.ell((zc_, yc_, 0), (rz, ry, rx)), part='body'),
              dict(name='belly', d=G.ell((zc_, ybot, 0), (0.75 * rz, 0.6 * ry, 0.7 * rx)), part='body')]
    limbs = _limbs_from_top(sh, core, 10)
    # claws: the two pieces reaching furthest forward; legs: the rest
    limbs.sort(key=lambda l: -float(l[0].max()))
    claws, legs = limbs[:2], limbs[2:]
    hk = yc_ + 0.1 * ry                                            # knee height
    legs_by_side = {1: [], -1: []}
    for z_, x_, r_, m in legs:
        legs_by_side[1 if np.median(x_) > 0 else -1].append((z_, x_, r_))
    for sgn, ls in legs_by_side.items():
        ls.sort(key=lambda l: -float(np.median(l[0])))           # front first
        for i, (z_, x_, r_) in enumerate(ls[:4]):
            part = ('FL' if sgn > 0 else 'FR') if i < 2 else ('BL' if sgn > 0 else 'BR')
            r0 = float(np.median(r_[: max(2, len(r_) // 3)]))
            t = np.linspace(0, 1, len(z_))
            y_ = (ybot + 0.2 * ry) * (1 - t) + (hk - ybot) * np.sin(np.pi * np.clip(t * 1.25, 0, 1)) * 0.8 + r0 * 0.5 * t
            y_ = np.maximum(y_, 0.6 * r0 * (1 - 0.7 * t))
            root = np.array([np.median(z_[:2]), ybot + 0.2 * ry, sgn * 0.6 * rx])
            pts = np.vstack([root, np.stack([z_, y_, x_], 1)]); rad = np.maximum(r0 * (1 - 0.65 * np.linspace(0, 1, len(pts))), 0.8 * G.h)
            fields.append(dict(name=f'leg{part}', d=G.cone(pts, rad), part=part, pivot=root))
    for z_, x_, r_, m in claws:
        sgn = 1 if np.median(x_) > 0 else -1
        # the arm: thin to the wrist; the claw: a swollen oval along the arm's end, two fingers
        cut = int(len(z_) * C.get('wrist', 0.5))
        ra = float(np.median(r_[:max(2, cut)]))
        t = np.linspace(0, 1, len(z_))
        y_ = ybot + 0.1 * ry + 0.25 * ry * np.sin(np.pi * t * 0.6)
        root = np.array([z1 - 0.2 * rz, ybot + 0.1 * ry, sgn * 0.5 * rx])
        pts = np.vstack([root, np.stack([z_[:cut], y_[:cut], x_[:cut]], 1)])
        hand = np.stack([z_[cut:], y_[cut:], x_[cut:]], 1)
        rc = 1.15 * float(r_[cut:].max()) if len(r_) > cut else 2 * ra
        ra = max(ra, 0.35 * rc)
        fields.append(dict(name='arm', d=G.cone(pts, np.full(len(pts), max(ra, 0.8 * G.h))), part='body'))
        if len(hand) >= 2:
            # the palm: an oval from the wrist; then a pincer: an upper and a lower finger from the
            # palm's end, bowed apart and closing toward the tips, an open gap between them
            j = max(1, int(len(hand) * 0.55))
            base = hand[j]; d = hand[-1] - base; d[1] = 0; d /= np.linalg.norm(d) + 1e-9
            fields.append(dict(name='claw', d=G.cone([hand[0], base - d * 0.35 * rc], [0.8 * rc, rc], ysc=0.85), part='body'))
            fl = max(float(np.linalg.norm(hand[-1] - base)), 2.1 * rc)
            up = np.array([0, 1.0, 0])
            for sgn_f, rf0 in ((1, 0.4), (-1, 0.48)):                    # upper (moving) and lower (fixed) finger
                fp = np.array([base + up * sgn_f * 0.4 * rc,
                               base + d * 0.5 * fl + up * sgn_f * 0.72 * rc,
                               base + d * fl + up * sgn_f * 0.16 * rc])
                fields.append(dict(name='finger', d=G.cone(fp, [rf0 * rc, 0.27 * rc, 0.07 * rc], xs=0.8), part='body', blend=0.002 * sh.L))
    # eye stalks
    for sgn in (1, -1):
        base = np.array([z1 - 0.35 * rz, yc_ + 0.4 * ry, sgn * 0.22 * rx]); top = np.array([z1 - 0.1 * rz, max(yv(0.06), ytop + 0.25 * ry), sgn * 0.3 * rx])
        fields.append(dict(name='stalk', d=G.cone([base, top], [0.12 * ry, 0.08 * ry]), part='body'))
        fields.append(dict(name='eye', d=G.ell(top, (0.16 * ry, 0.16 * ry, 0.16 * ry)), part='body'))
    finish(name, C, fields, G, sh, blend=0.02)


def seahorse(name, C):
    """a seahorse, upright: a body flattened sideways along the drawn spine (crown to the curled tail
    tip, thickness from the drawing), a trumpet snout, the back fin as a thin plate. Side paint only
    (the sheet's other view is not a top view of an upright seahorse)."""
    sh = Sheet(C['sheet'], C['L'], row=C['row'], rows=C['rows'])
    S = sh.S
    H_, W_ = S.m.shape
    U = (np.arange(W_)[None, :] - S.c0) / (S.c1 - S.c0); V = (np.arange(H_)[:, None] - S.r0) / (S.r1 - S.r0)
    zu = lambda u: float(sh.zs(S.c0 + u * (S.c1 - S.c0)))
    yv = lambda v: float(sh.ys(S.r0 + v * (S.r1 - S.r0)))
    body = S.m.copy()
    for (ua, ub, va, vb) in C['cut']:                              # snout, fin: not the spine
        body &= ~((U >= ua) & (U <= ub) & (V >= va) & (V <= vb))
    body = biggest(body)
    seed = body & (V < 0.04)
    tr = trace(body, seed)
    pts = np.stack([sh.zs(tr[:, 0]), sh.ys(tr[:, 1]), np.zeros(len(tr))], 1); rad = ndi.gaussian_filter1d(tr[:, 2] * sh.ks, 1.5)
    vh = yv(0) - yv(1)
    G = Grid((zu(0) - 0.01, yv(1) - 0.01, -0.12 * vh), (zu(1) + 0.01, yv(0) + 0.01, 0.12 * vh), C['res'])
    xs = C.get('flat', 0.7)
    fields = [dict(name='body', d=G.cone(pts, np.maximum(rad, 0.8 * G.h), xs=xs), part='body')]
    (su0, sv0), (su1, sv1) = C['snout']
    a, b = np.array([zu(su0), yv(sv0), 0]), np.array([zu(su1), yv(sv1), 0])
    sr = C.get('snout_r', 0.035) * vh
    fields.append(dict(name='snout', d=G.cone([a, b - (b - a) * 0.08, b], [sr, 0.8 * sr, 1.3 * sr], xs=0.85), part='HEAD', pivot=a))
    fu0, fu1, fv0, fv1 = C['fin']
    fm = S.m & (U >= fu0) & (U <= fu1) & (V >= fv0) & (V <= fv1)
    sdf = mask_sdf(sh, fm, view='s')
    fields.append(dict(name='fin', d=np.maximum(sdf(G.gz, G.gy), np.abs(G.gx) - max(0.012 * vh, 1.1 * G.h)).astype(np.float32), part='body', blend=0.01 * sh.L))
    finish(name, C, fields, G, sh, blend=0.015)


DESIGNS = {
    # round 18 birds: standing (perchd) and the snowy owl in flight (bird, from the spread-wing top view)
    'roadrunner': (perchd, dict(tris=6000, sheet='roadrunner.png', L=0.55, res=150, xs=0.75, spread=0.05, toe=0.09,
        body=[(0.4, 0.46, 0.6), (0.5, 0.44, 0.74), (0.61, 0.44, 0.74), (0.71, 0.46, 0.62)],
        neck=[(0.7, 0.5, 0.07), (0.76, 0.36, 0.05), (0.8, 0.25, 0.05)], head=(0.84, 0.21, 0.08, 1.1), beak=[(0.9, 0.24, 0.03), (0.99, 0.255, 0.008)],
        crest=[[(0.82, 0.14, 0.025), (0.76, 0.02, 0.008)], [(0.8, 0.15, 0.025), (0.72, 0.06, 0.007)], [(0.84, 0.14, 0.02), (0.8, 0.03, 0.007)]],
        wing=(0.56, 0.52, 0.17, 0.08, 0.04), wing_x=0.1, tail=[(0.4, 0.5, 0.09), (0.22, 0.37, 0.09), (0.02, 0.26, 0.07)], tail_xs=1.5, tail_ys=0.5,
        leg=[(0.56, 0.62, 0.045), (0.58, 0.8, 0.028), (0.57, 0.97, 0.02)])),
    'flamingo': (perchd, dict(tris=6000, sheet='flamingo.png', L=0.8, res=170, xs=0.8, spread=0.03, toe=0.07,
        body=[(0.08, 0.42, 0.45), (0.28, 0.34, 0.54), (0.5, 0.32, 0.54), (0.64, 0.35, 0.46)],
        neck=[(0.66, 0.36, 0.065), (0.84, 0.33, 0.05), (0.89, 0.24, 0.045), (0.81, 0.13, 0.042), (0.75, 0.05, 0.042), (0.8, 0.02, 0.045)],
        head=(0.83, 0.04, 0.04, 1.2), beak=[(0.87, 0.05, 0.028), (0.95, 0.1, 0.024), (0.955, 0.17, 0.012)],
        wing=(0.33, 0.37, 0.28, 0.1, 0.05), wing_x=0.06, tail=[(0.12, 0.46, 0.04), (0.0, 0.52, 0.02)], tail_xs=1.2, tail_ys=0.5,
        leg=[(0.44, 0.52, 0.028), (0.4, 0.69, 0.018), (0.42, 0.98, 0.014)])),
    'snowyOwl': (perchd, dict(tris=6000, sheet='snowy_owl.png', L=0.6, res=150, xs=0.9, spread=0.12, toe=0.07,
        body=[(0.1, 0.55, 0.75), (0.35, 0.38, 0.82), (0.6, 0.3, 0.9), (0.78, 0.3, 0.85)],
        neck=[(0.76, 0.38, 0.2), (0.84, 0.26, 0.19)], head=(0.87, 0.2, 0.2, 0.95), beak=[(0.96, 0.21, 0.04), (0.99, 0.27, 0.015)],
        wing=(0.45, 0.5, 0.42, 0.2, 0.08), wing_x=0.22, tail=[(0.15, 0.63, 0.08), (0.0, 0.67, 0.05)],
        leg=[(0.6, 0.8, 0.07), (0.61, 0.97, 0.05)])),
    'owlFly': (bird, dict(tris=6000, sheet='snowy_owl.png', row=0, rows=1, L=0.6, res=150, wing_top=True, body_u=(0.25, 0.8), body_v=(0.3, 0.85),
        body_w=0.07, head=(0.87, 0.2, 0.2), beak=[(0.96, 0.21, 0.04), (0.99, 0.27, 0.015)], wing_u=(0.3, 0.75), tail_u=0.2, feet=(0.6, 0.85))),
    # round 18 (quadd: designed four-legged animals, parts placed on the side view's box)
    'iguana': (quadd, dict(tris=8000, sheet='iguana.png', L=1.5, res=150, xs=1.15, spread=0.3,
        torso=[(0.38, 0.55, 0.78), (0.5, 0.42, 0.78), (0.65, 0.36, 0.76), (0.76, 0.36, 0.72)],
        neck=[(0.76, 0.45, 0.17), (0.82, 0.33, 0.15)], head=(0.87, 0.22, 0.13, 1.3), head_xs=0.85, muzzle=[(0.9, 0.22, 0.1), (0.975, 0.24, 0.06)],
        blobs=[(0.82, 0.48, 0.07, 0.15, 0.05, 'HEAD')], crest=(0.3, 0.86, 16, 0.22),
        front=[(0.7, 0.58, 0.07, 0.14), (0.72, 0.62, 0.06, 0.38), (0.75, 0.9, 0.05, 0.42)], hind=[(0.43, 0.6, 0.085, 0.14), (0.4, 0.63, 0.07, 0.4), (0.44, 0.92, 0.05, 0.46)], paw=(0.18, 0.05),
        tail=[(0.38, 0.63, 0.11), (0.25, 0.66, 0.07), (0.12, 0.69, 0.04), (0.0, 0.71, 0.012)])),
    'arcticFox': (quadd, dict(tris=7000, sheet='arctic_fox.png', L=0.95, res=130, xs=0.85, spread=0.12,
        torso=[(0.40, 0.34, 0.70), (0.55, 0.28, 0.69), (0.70, 0.27, 0.66), (0.76, 0.27, 0.6)],
        neck=[(0.76, 0.36, 0.14), (0.82, 0.26, 0.12)], head=(0.86, 0.22, 0.12, 1.05), muzzle=[(0.9, 0.27, 0.07), (0.98, 0.31, 0.03)],
        ears=[(0.835, 0.07, 0.06, 0.1)], ear_t=0.45, ear_h=1.1,
        front=[(0.74, 0.58, 0.07), (0.755, 0.8, 0.05), (0.77, 0.95, 0.045)], hind=[(0.45, 0.56, 0.09), (0.4, 0.8, 0.05), (0.43, 0.95, 0.045)], paw=(0.13, 0.06),
        tail=[(0.40, 0.45, 0.08), (0.29, 0.46, 0.17), (0.15, 0.55, 0.18), (0.04, 0.66, 0.07)], tail_xs=0.9)),
    'fennec': (quadd, dict(tris=7000, sheet='fennec_fox.png', L=0.75, res=130, xs=0.75, spread=0.07,
        torso=[(0.37, 0.48, 0.70), (0.47, 0.45, 0.72), (0.6, 0.46, 0.72), (0.70, 0.5, 0.72)],
        neck=[(0.7, 0.58, 0.1), (0.78, 0.55, 0.085)], head=(0.85, 0.54, 0.09, 1.1), muzzle=[(0.88, 0.57, 0.06), (0.97, 0.59, 0.025)],
        ears=[(0.8, 0.36, 0.13, 0.07), (0.79, 0.24, 0.1, 0.1), (0.785, 0.12, 0.06, 0.12)], ear_t=0.25, ear_h=1.2,
        front=[(0.66, 0.62, 0.04), (0.665, 0.8, 0.032), (0.67, 0.95, 0.027)], hind=[(0.42, 0.6, 0.055), (0.38, 0.8, 0.033), (0.4, 0.95, 0.027)], paw=(0.1, 0.05),
        tail=[(0.37, 0.52, 0.05), (0.25, 0.58, 0.1), (0.13, 0.66, 0.11), (0.03, 0.75, 0.05)], tail_xs=0.9)),
    # birds: u along the side view tail tip 0 .. beak tip 1, v top 0 .. bottom 1 (fractions of its box)
    'parrot': (bird, dict(tris=8000, sheet='parrot_toucan.png', row=0, rows=2, L=0.85, res=130, wing_top=True, body_u=(0.47, 0.86), body_v=(0.62, 0.9),
                          body_w=0.075, head=(0.885, 0.615, 0.105), wing_u=(0.47, 0.76), tail_u=0.45, feet=(0.58, 0.9),
                          beak=[(0.925, 0.6, 0.075), (0.965, 0.62, 0.06), (0.99, 0.67, 0.035), (0.982, 0.74, 0.012)],
                          lower=[(0.93, 0.68, 0.04), (0.955, 0.7, 0.025)], beak_xs=0.8)),
    'toucan': (bird, dict(tris=8000, sheet='parrot_toucan.png', row=1, rows=2, L=0.62, res=130, wing_top=True, body_u=(0.33, 0.73), body_v=(0.6, 0.92),
                          body_w=0.085, head=(0.735, 0.6, 0.11), wing_u=(0.36, 0.66), tail_u=0.3, feet=(0.47, 0.9),
                          beak=[(0.77, 0.6, 0.11), (0.86, 0.6, 0.09), (0.94, 0.63, 0.06), (0.99, 0.69, 0.02)], beak_xs=0.62)),
    'turtle': (turtle, dict(tris=9000, sheet='sea_turtle.png', L=1.0, res=120, wing_top=True)),
    'plesiosaur': (plesiosaur, dict(tris=12000, sheet='plesiosaur.png', L=6.0, res=150, wing_top=True)),
    'manta': (manta, dict(tris=9000, sheet='manta_ray.png', L=4.0, res=150, body_u=(0.4, 0.93), body_w=(0.42, 0.95), body_x=0.09,
                          ceph_u=0.88, tail_u=0.42, belly_w=0.9, lift=6)),
    'jelly': (jellyfish, dict(tris=4000, sheet='jellyfish.png', L=1.2, R=0.22, D=0.2, tent=0.75, rim_u=0.7, res=150, side_only=True, tentacles=10)),
    'octopus': (octopus, dict(tris=9000, sheet='octopus.png', L=0.9, res=125, head=(0.6, 0.33, 0.13), mantle_u=(0.08, 0.56), mantle_v=(0.02, 0.46), tilt=16,
                                mantle_lift=0.08, arm_len=1.3, eye=(0.61, 0.32, 0.08))),
    'seaStar': (seastar, dict(tris=1600, sheet='sea_star_crab_seahorse.png', row=0, rows=3, L=0.3, res=110)),
    'crab': (crab, dict(tris=5000, sheet='sea_star_crab_seahorse.png', row=1, rows=3, L=0.4, res=120, shell_v=(0.12, 0.55))),
    'seahorse': (seahorse, dict(tris=3000, sheet='sea_star_crab_seahorse.png', row=2, rows=3, L=0.14, res=110, side_only=True,
                                cut=[(0.62, 1.0, 0.12, 0.34), (0.0, 0.33, 0.33, 0.66)], snout=((0.6, 0.2), (0.98, 0.26)),
                                fin=(0.0, 0.36, 0.33, 0.66))),
    'rattlesnake': (snake, dict(tris=7000, sheet='rattlesnake.png', L=0.9, length=1.7, radius=0.06, res=300, wave=0.05, wavelength=0.6, head=0.06, head_r=1.6, prof_top=True, rattle=(5, 0.045), sheet_head=0.16)),
    'snake': (snake, dict(tris=10000, sheet='snake.png', L=1.6, length=4.6, radius=0.14, res=300, wave=0.1, wavelength=1.6)),
}

if __name__ == '__main__':
    for n in [a for a in sys.argv[1:] if not a.startswith('--')] or list(DESIGNS):
        fn, C = DESIGNS[n]
        fn(n, C)
