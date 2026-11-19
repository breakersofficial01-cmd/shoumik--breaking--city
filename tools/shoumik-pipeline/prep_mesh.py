"""Weld the triangle-soup high-res mesh and write the simplifier input.

Usage: python3 -I prep_mesh.py <dump dir> <importance face> <importance hands>
Writes <dump dir>/weld_in.bin (qem input) and <dump dir>/weld_meta.npz (welded positions,
per-welded-vertex skin weights for later transfer).
"""
import json
import sys

import numpy as np

d = sys.argv[1]
w_face = float(sys.argv[2])
w_hand = float(sys.argv[3])

pos = np.fromfile(f"{d}/hi_pos.f32", dtype=np.float32).reshape(-1, 3)
skin_i = np.fromfile(f"{d}/hi_skinIndex.u16", dtype=np.uint16).reshape(-1, 4)
skin_w = np.fromfile(f"{d}/hi_skinWeight.f32", dtype=np.float32).reshape(-1, 4)
sk = json.load(open(f"{d}/hi_skeleton.json"))
names = [b["name"] for b in sk["bones"]]

# Weld identical positions (the FBX gives 3 separate vertices per triangle).
uniq, inverse = np.unique(pos, axis=0, return_inverse=True)
inverse = inverse.reshape(-1)
tris = inverse.reshape(-1, 3).astype(np.uint32)
# Drop degenerate triangles (two corners welded together).
good = (tris[:, 0] != tris[:, 1]) & (tris[:, 1] != tris[:, 2]) & (tris[:, 0] != tris[:, 2])
tris = tris[good]
print(f"welded {len(pos)} -> {len(uniq)} vertices, {len(tris)} triangles ({(~good).sum()} degenerate dropped)")

# One skin-weight row per welded vertex (first occurrence).
first = np.zeros(len(uniq), dtype=np.int64)
first[inverse[::-1]] = np.arange(len(pos))[::-1]
wi = skin_i[first]
ww = skin_w[first]

# Importance: weight on the head bone -> face, on hand/finger bones -> hands.
def bone_weight(pred):
    ids = [i for i, n in enumerate(names) if pred(n)]
    m = np.isin(wi, ids)
    return (ww * m).sum(axis=1)

head = bone_weight(lambda n: n.endswith("Head") or n.endswith("Neck"))
hand = bone_weight(lambda n: "Hand" in n)
importance = 1.0 + (w_face - 1.0) * np.clip(head, 0, 1) + (w_hand - 1.0) * np.clip(hand, 0, 1)
print(f"face vertices: {(head > 0.5).sum()}, hand vertices: {(hand > 0.5).sum()}")

with open(f"{d}/weld_in.bin", "wb") as f:
    np.array([len(uniq), len(tris)], dtype=np.uint32).tofile(f)
    uniq.astype(np.float32).tofile(f)
    importance.astype(np.float32).tofile(f)
    tris.astype(np.uint32).tofile(f)
np.savez(f"{d}/weld_meta.npz", pos=uniq, skin_i=wi, skin_w=ww, head=head, hand=hand)
print("bounds", uniq.min(0).round(3), uniq.max(0).round(3))
