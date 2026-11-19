"""Adds real surface detail from kit textures to the up-scaled ground atlas.

    python3 -I ground_detail.py <base.png> <kit glTF dir> <out.jpg>

Tiles (columns, same order as GROUND in src/assets/proceduralTextures.js):
ASPHALT, ROAD, ZEBRA, LANE, LOT, SIDEWALK, PLAZA, GRASS.
For each tile: soften the painted speckle a little, then multiply by detail / mean(detail),
where detail = the kit texture, repeated a few times (in metres matching how big the tile is in the game).
"""
import os
import sys

import cv2
import numpy as np

base_path, kit, out = sys.argv[1], sys.argv[2], sys.argv[3]
base = cv2.imread(base_path).astype(np.float32) / 255.0
H = base.shape[0]
COLS = base.shape[1] // H

# tile -> (kit texture, 1/fraction = how many times the texture repeats across one tile, strength, blur px)
# Roads repeat every ~14 m, sidewalks/plazas every few metres (see groundMesher.js).
PLAN = [
    ('T_Concrete_Asphalt_BaseColor', 1.0, 1.0, 3),   # ASPHALT
    ('T_Concrete_Asphalt_BaseColor', 1.0, 1.0, 1),   # ROAD (keep lines crisp)
    ('T_Concrete_Asphalt_BaseColor', 1.0, 1.0, 1),   # ZEBRA
    ('T_Concrete_Asphalt_BaseColor', 0.6, 1.0, 2),   # LANE (old Dhaka lanes)
    ('T_Dirt_BaseColor', 0.5, 0.9, 3),               # LOT
    ('T_Concrete_BaseColor', 0.35, 0.7, 2),          # SIDEWALK (pavers)
    ('T_Concrete_BaseColor', 0.5, 0.7, 2),           # PLAZA
    (None, 0, 0, 2),                                 # GRASS: painted only, softened
]

result = base.copy()
for col, (name, frac, strength, blur) in enumerate(PLAN):
    x0 = col * H
    tile = base[:, x0:x0 + H].copy()
    if blur:
        # Blur only the speckle (small blobs), not the long lines: median keeps edges.
        tile = cv2.medianBlur((tile * 255).astype(np.uint8), 2 * blur + 1).astype(np.float32) / 255.0
    if name:
        tex = cv2.imread(os.path.join(kit, name + '.png')).astype(np.float32) / 255.0
        # Shrink the whole (seamless) texture and repeat it k x k, so the tile stays seamless.
        k = max(1, round(1 / frac))
        small = cv2.resize(tex, (H // k, H // k), interpolation=cv2.INTER_AREA)
        crop = cv2.resize(np.tile(small, (k, k, 1)), (H, H), interpolation=cv2.INTER_NEAREST)
        lum = crop @ np.array([0.114, 0.587, 0.299], np.float32)
        detail = lum / max(1e-3, lum.mean())
        detail = 1 + (detail - 1) * strength
        tile = np.clip(tile * detail[:, :, None], 0, 1)
    result[:, x0:x0 + H] = tile

cv2.imwrite(out, (result * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
print(f'wrote {out} ({COLS} tiles of {H} px)')
