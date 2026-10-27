"""Silhouettes of the animal reference sheets (assets/reference/animals/*.png).

A sheet is a grid of panels (rows x 3 columns: side view facing right, top view head right,
three-quarter view). For a panel, `mask(img)` gives the animal's silhouette: pixels that
differ from the plain grey background, without the soft drop shadows (darker, background-
coloured), holes filled, the biggest connected blob plus anything big attached to it.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

REF = '/home/user/swingers/wobblers/assets/reference/animals/'


def load(name):
    return np.asarray(Image.open(REF + name).convert('RGB')).astype(np.float32) / 255


def splits(img, axis, n):
    """n panel spans along an axis (0 rows, 1 columns): at the sheet's thin light divider lines
    when it has them, else in the widest empty gaps between the drawings, else even splits."""
    L = img.shape[axis]
    prof = img.mean(axis=2).mean(axis=1 - axis)          # mean brightness of each row / column
    base = np.median(prof)
    cuts = []
    for k in range(1, n):
        c = k * L // n
        lo, hi = max(0, c - L // 8), min(L, c + L // 8)
        seg = prof[lo:hi]
        i = int(np.argmax(seg))
        cuts.append(lo + i if seg[i] > base + 0.03 else None)
    if None in cuts and n > 1:
        # no divider: cut through the n - 1 widest gaps where nothing differs from the background
        bg = np.median(img.reshape(-1, 3), axis=0)
        occ = (np.linalg.norm(img - bg, axis=2) > 0.1).sum(axis=1 - axis) > 2
        gaps, i = [], 0
        while i < L:
            if not occ[i]:
                j = i
                while j < L and not occ[j]:
                    j += 1
                if i > 0 and j < L:
                    gaps.append((j - i, (i + j) // 2))
                i = j
            else:
                i += 1
        gaps.sort(reverse=True)
        if len(gaps) >= n - 1:
            cuts = sorted(g[1] for g in gaps[:n - 1])
        else:
            cuts = [c if c is not None else k * L // n for k, c in enumerate(cuts, 1)]
    edges = [0] + cuts + [L]
    return [(edges[i], edges[i + 1]) for i in range(n)]


def panel(img, row, col, rows=1, cols=3, inset=6):
    r0, r1 = splits(img, 0, rows)[row]
    c0, c1 = splits(img, 1, cols)[col]
    return img[r0 + inset:r1 - inset, c0 + inset:c1 - inset]


def mask(p, tol=0.13, grad=0.022, keep=0.02):
    """the animal: everything the background can't reach. The background is flooded in from the
    panel's border through pixels that are background-coloured (or a soft shadow of it) AND
    smooth (no edge), so animal parts the same colour as the background (pale bellies, white
    bands) stay inside the animal's outline."""
    border = np.concatenate([p[:8].reshape(-1, 3), p[-8:].reshape(-1, 3), p[:, :8].reshape(-1, 3), p[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    sm = ndi.gaussian_filter(p, (1.2, 1.2, 0))
    gy, gx = np.gradient(sm, axis=(0, 1))
    g = np.sqrt((gx ** 2 + gy ** 2).sum(axis=2))
    lum, bgl = p.mean(axis=2), bg.mean()
    chroma = p - p.mean(axis=2, keepdims=True); bgc = bg - bg.mean()
    near_bg = np.linalg.norm(p - bg, axis=2) < tol
    shadow = (lum < bgl) & (lum > bgl * 0.5) & (np.linalg.norm(chroma - bgc * (lum / bgl)[..., None], axis=2) < 0.04)
    passable = (near_bg | shadow) & (g < grad)
    passable = ndi.binary_opening(passable, iterations=1)       # don't squeeze through one-pixel gaps in the outline
    lab, n = ndi.label(passable)
    edge_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bgm = np.isin(lab, edge_labels[edge_labels > 0])
    m = ~bgm
    m = ndi.binary_opening(m, iterations=2)                      # the faint halo of the outline
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    if n == 0:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    big = sizes.max()
    good = [i + 1 for i, s in enumerate(sizes) if s >= big * keep]
    return np.isin(lab, good)


if __name__ == '__main__':
    import sys
    # debug: overlay the masks of a sheet's panels
    name, rows = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1
    img = load(name)
    out = []
    for r in range(rows):
        row = []
        for c in range(3):
            p = panel(img, r, c, rows)
            m = mask(p)
            o = p.copy()
            o[m] = o[m] * 0.5 + np.array([1, 0, 0.6]) * 0.5
            edge = m ^ ndi.binary_erosion(m)
            o[edge] = [0, 1, 0]
            row.append(o)
        out.append(np.concatenate(row, axis=1))
    im = np.concatenate(out, axis=0)
    Image.fromarray((im * 255).astype(np.uint8)).resize((im.shape[1] // 2, im.shape[0] // 2)).save(sys.argv[3])
