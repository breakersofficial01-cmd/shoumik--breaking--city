"""Give the simplified mesh new UVs, bake the high-res colour texture onto them, and transfer
skin weights from the high-res mesh.

Usage: python3 -I bake.py <dump dir> <low.bin> <atlas size> <out prefix>
Needs in <dump dir>: hi_pos.f32, hi_uv.f32, weld_meta.npz, base texture tex0.png (4096 RGBA).
Writes <out prefix>.npz (pos, normal, uv, skin_i, skin_w, index) and <out prefix>.png (atlas).
"""
import sys
from collections import deque

import cv2
import numpy as np
from scipy.spatial import cKDTree

dump, low_path, ATLAS, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
PAD = max(3, ATLAS // 512)            # pixels between charts (mip-map safety)
HEAD_DENSITY = 2.6                    # face gets this many times more texels per area
CHART_COS = np.cos(np.radians(52))    # max angle between a triangle and its chart's direction

# ---------- load ----------
with open(low_path, "rb") as f:
    nv, nt = np.fromfile(f, np.uint32, 2)
    lpos = np.fromfile(f, np.float32, nv * 3).reshape(-1, 3).astype(np.float64)
    ltri = np.fromfile(f, np.uint32, nt * 3).reshape(-1, 3).astype(np.int64)
hpos = np.fromfile(f"{dump}/hi_pos.f32", np.float32).reshape(-1, 3).astype(np.float64)
huv = np.fromfile(f"{dump}/hi_uv.f32", np.float32).reshape(-1, 2).astype(np.float64)
meta = np.load(f"{dump}/weld_meta.npz")
tex = cv2.cvtColor(cv2.imread(f"{dump}/tex0.png", cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGB).astype(np.float32)
TH, TW = tex.shape[:2]
print(f"low: {nv} verts {nt} tris; hi: {len(hpos)//3} tris; texture {TW}x{TH}")

# ---------- high-res triangle data + spatial index ----------
H0, H1, H2 = hpos[0::3], hpos[1::3], hpos[2::3]
hn = np.cross(H1 - H0, H2 - H0)
hn /= np.linalg.norm(hn, axis=1, keepdims=True) + 1e-30
hcent = (H0 + H1 + H2) / 3
tree = cKDTree(hcent)
wtree = cKDTree(meta["pos"])
hw_i, hw_w = meta["skin_i"], meta["skin_w"]


def closest_on_hi(p, n, k=10):
    """For points p (N,3) with surface normals n, find a nearby high-res triangle facing the
    same way and the barycentric coordinates of the closest point on it."""
    _, cand = tree.query(p, k=k)
    best_d = np.full(len(p), np.inf)
    best_t = np.zeros(len(p), np.int64)
    best_b = np.zeros((len(p), 3))
    for j in range(k):
        t = cand[:, j]
        a, b, c = H0[t], H1[t], H2[t]
        nt_ = hn[t]
        # project to the plane, barycentric, clamp into the triangle (approximate closest point)
        q = p - ((p - a) * nt_).sum(1, keepdims=True) * nt_
        v0, v1, v2 = b - a, c - a, q - a
        d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
        d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
        den = d00 * d11 - d01 * d01 + 1e-30
        bv = (d11 * d20 - d01 * d21) / den
        bw = (d00 * d21 - d01 * d20) / den
        bu = 1 - bv - bw
        bary = np.clip(np.stack([bu, bv, bw], 1), 0, None)
        bary /= bary.sum(1, keepdims=True) + 1e-30
        cp = bary[:, :1] * a + bary[:, 1:2] * b + bary[:, 2:] * c
        dist = np.linalg.norm(cp - p, axis=1)
        facing = (nt_ * n).sum(1)
        dist = dist + np.where(facing < 0.2, 0.05, 0.0)  # prefer triangles facing the same way
        better = dist < best_d
        best_d[better], best_t[better], best_b[better] = dist[better], t[better], bary[better]
    return best_t, best_b


def sample_tex(uv):
    """Bilinear sample of the original texture at FBX uvs (v up)."""
    x = np.clip(uv[:, 0] % 1.0 * TW - 0.5, 0, TW - 1.001)
    y = np.clip((1 - uv[:, 1] % 1.0) * TH - 0.5, 0, TH - 1.001)
    x0, y0 = x.astype(int), y.astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    c00, c10 = tex[y0, x0], tex[y0, x0 + 1]
    c01, c11 = tex[y0 + 1, x0], tex[y0 + 1, x0 + 1]
    return (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy


# ---------- low-res normals and per-vertex head weight ----------
L0, L1, L2 = lpos[ltri[:, 0]], lpos[ltri[:, 1]], lpos[ltri[:, 2]]
fn = np.cross(L1 - L0, L2 - L0)
farea = np.linalg.norm(fn, axis=1) * 0.5
fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-30
vnorm = np.zeros_like(lpos)
for j in range(3):
    np.add.at(vnorm, ltri[:, j], fn * farea[:, None])
vnorm /= np.linalg.norm(vnorm, axis=1, keepdims=True) + 1e-30
_, near_w = wtree.query(lpos)
vhead = meta["head"][near_w]
fclass = (vhead[ltri].mean(1) > 0.5).astype(int)  # 1 = head/face triangles

# ---------- charts: grow regions of similar facing ----------
edge_tris = {}
for t in range(nt):
    for j in range(3):
        a, b = ltri[t, j], ltri[t, (j + 1) % 3]
        edge_tris.setdefault((min(a, b), max(a, b)), []).append(t)
neigh = [[] for _ in range(nt)]
for ts in edge_tris.values():
    for a in ts:
        for b in ts:
            if a != b:
                neigh[a].append(b)

chart_of = np.full(nt, -1)
charts = []
order = np.argsort(-farea)
for seed in order:
    if chart_of[seed] >= 0:
        continue
    cid = len(charts)
    members = [seed]
    chart_of[seed] = cid
    acc = fn[seed] * farea[seed]
    cn = fn[seed]
    q = deque([seed])
    while q:
        t = q.popleft()
        for u in neigh[t]:
            if chart_of[u] >= 0 or fclass[u] != fclass[seed]:
                continue
            if fn[u] @ cn < CHART_COS:
                continue
            chart_of[u] = cid
            members.append(u)
            acc = acc + fn[u] * farea[u]
            cn = acc / (np.linalg.norm(acc) + 1e-30)
            q.append(u)
    charts.append({"tris": np.array(members), "n": cn, "head": fclass[seed]})
print(f"{len(charts)} charts")

# ---------- project each chart to 2D ----------
for c in charts:
    n = c["n"]
    up = np.array([0, 1, 0]) if abs(n[1]) < 0.9 else np.array([1, 0, 0])
    ax_u = np.cross(up, n); ax_u /= np.linalg.norm(ax_u)
    ax_v = np.cross(n, ax_u)
    vids = np.unique(ltri[c["tris"]])
    p2 = np.stack([lpos[vids] @ ax_u, lpos[vids] @ ax_v], 1)
    if c["head"]:
        p2 = p2 * HEAD_DENSITY
    lo = p2.min(0)
    c["vids"], c["p2"] = vids, p2 - lo
    c["size"] = p2.max(0) - lo

# ---------- shelf packing (find the biggest scale that fits) ----------
def pack(scale):
    x = y = shelf_h = 0
    for c in sorted(charts, key=lambda c: -c["size"][1]):
        w, h = c["size"] * scale
        w, h = int(np.ceil(w)) + PAD, int(np.ceil(h)) + PAD
        if x + w > ATLAS:
            x, y, shelf_h = 0, y + shelf_h, 0
        c["off"] = (x + PAD / 2, y + PAD / 2)
        x += w
        shelf_h = max(shelf_h, h)
    return y + shelf_h <= ATLAS

total = sum(c["size"][0] * c["size"][1] for c in charts)
scale = np.sqrt(ATLAS * ATLAS * 0.8 / total)
while not pack(scale):
    scale *= 0.97
print(f"texel density {scale:.0f} px per metre (face x{HEAD_DENSITY})")

# ---------- build the output mesh (vertices duplicated along chart borders) ----------
out_pos, out_nrm, out_uv, out_src, out_tri = [], [], [], [], []
for c in charts:
    base = sum(len(p) for p in out_pos)
    remap = {v: i for i, v in enumerate(c["vids"])}
    px = c["p2"] * scale + np.array(c["off"])
    out_pos.append(lpos[c["vids"]])
    out_nrm.append(vnorm[c["vids"]])
    out_uv.append(px)
    out_src.append(c["vids"])
    out_tri.append(np.vectorize(remap.get)(ltri[c["tris"]]) + base)
P = np.concatenate(out_pos); N = np.concatenate(out_nrm); UVpx = np.concatenate(out_uv)
SRC = np.concatenate(out_src); T = np.concatenate(out_tri)
print(f"output: {len(P)} vertices, {len(T)} triangles")

# ---------- bake colour ----------
img = np.zeros((ATLAS, ATLAS, 3), np.float32)
mask = np.zeros((ATLAS, ATLAS), bool)
pts, nrm, pix = [], [], []
grow = 1.5  # also bake a thin band outside each triangle so filtering never sees black
for t in range(len(T)):
    a, b, c = UVpx[T[t, 0]], UVpx[T[t, 1]], UVpx[T[t, 2]]
    x0, y0 = np.floor(np.minimum(np.minimum(a, b), c) - grow).astype(int)
    x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c) + grow).astype(int)
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, ATLAS - 1), min(y1, ATLAS - 1)
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    q = np.stack([gx.ravel(), gy.ravel()], 1)
    v0, v1, v2 = b - a, c - a, q - a
    den = v0[0] * v1[1] - v1[0] * v0[1]
    if abs(den) < 1e-12:
        continue
    bv = (v2[:, 0] * v1[1] - v1[0] * v2[:, 1]) / den
    bw = (v0[0] * v2[:, 1] - v2[:, 0] * v0[1]) / den
    bu = 1 - bv - bw
    # inside test with a margin measured in pixels
    tol = grow / max(np.linalg.norm(v0), np.linalg.norm(v1), 1.0)
    inside = (bu > -tol) & (bv > -tol) & (bw > -tol)
    if not inside.any():
        continue
    bary = np.stack([bu, bv, bw], 1)[inside]
    tri3 = P[T[t]]
    pts.append(bary @ tri3)
    nrm.append(np.repeat(np.cross(tri3[1] - tri3[0], tri3[2] - tri3[0])[None], len(bary), 0))
    pix.append(q[inside].astype(int))
pts = np.concatenate(pts); nrm = np.concatenate(nrm); pix = np.concatenate(pix)
nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-30
print(f"baking {len(pts)} texels")
CH = 400000
for s in range(0, len(pts), CH):
    t_id, bary = closest_on_hi(pts[s:s + CH], nrm[s:s + CH])
    uv = bary[:, :1] * huv[t_id * 3] + bary[:, 1:2] * huv[t_id * 3 + 1] + bary[:, 2:] * huv[t_id * 3 + 2]
    col = sample_tex(uv)
    xy = pix[s:s + CH]
    img[xy[:, 1], xy[:, 0]] = col
    mask[xy[:, 1], xy[:, 0]] = True

# fill the gaps between charts by growing edge colours outwards
img8 = np.clip(img, 0, 255).astype(np.uint8)
holes = (~mask).astype(np.uint8)
filled = img8.copy()
known = mask.copy()
for _ in range(PAD * 3):
    dil = cv2.dilate(filled, np.ones((3, 3), np.uint8))
    kd = cv2.dilate(known.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    blur = cv2.blur(filled.astype(np.float32) * known[..., None], (3, 3))
    cnt = cv2.blur(known.astype(np.float32), (3, 3))[..., None]
    avg = (blur / np.maximum(cnt, 1e-6)).astype(np.uint8)
    new = kd & ~known
    filled[new] = avg[new]
    known = kd
cv2.imwrite(f"{out}.png", cv2.cvtColor(filled, cv2.COLOR_RGB2BGR))

# ---------- skin weights from the high-res mesh ----------
t_id, bary = closest_on_hi(P, N)
nb = int(hw_i.max()) + 1
dense = np.zeros((len(P), nb))
for corner in range(3):
    hv = hpos[t_id * 3 + corner]
    _, wv = wtree.query(hv)                      # welded index of that high-res corner
    for k in range(4):
        np.add.at(dense, (np.arange(len(P)), hw_i[wv, k]), hw_w[wv, k] * bary[:, corner])
top = np.argsort(-dense, axis=1)[:, :4]
topw = np.take_along_axis(dense, top, 1)
topw /= topw.sum(1, keepdims=True) + 1e-30

np.savez(f"{out}.npz", pos=P.astype(np.float32), normal=N.astype(np.float32),
         uv=(UVpx / ATLAS).astype(np.float32), skin_i=top.astype(np.uint16),
         skin_w=topw.astype(np.float32), index=T.astype(np.uint32))
print("saved", f"{out}.npz", f"{out}.png")
