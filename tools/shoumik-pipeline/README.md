# Shoumik model pipeline (Mixamo FBX → `assets/shoumik/shoumik.glb`)

For Claude sessions, not part of the game. Rebuild the GLB whenever the owner sends a new
Shoumik model or new Mixamo animations. Everything runs headless; needs Node + Playwright,
Python 3 with numpy/scipy/opencv, g++, and a local copy of three.js r170 (`<three>`).

| Step | Command | What it does |
|---|---|---|
| 1 | put all FBX files in one folder `<fbx>` (clean names, `standing.fbx` = the rig in T-pose) | |
| 2 | `node fbx-tool.js <three> <fbx> <work> dump standing.fbx` | high-res mesh, UVs, skin weights, skeleton → `<work>/hi_*` |
| 3 | `node fbx-tool.js <three> <fbx> <work> clips` | every clip → `<work>/clips/<name>.json` |
| 4 | extract the 4K colour texture embedded in any FBX (the first PNG inside the file) to `<work>/tex0.png` | |
| 5 | `python3 -I prep_mesh.py <work> 12 6` | weld the triangle soup; face ×12 and hands ×6 importance |
| 6 | `g++ -O2 -o qem qem.cpp && ./qem <work>/weld_in.bin <work>/low_20k.bin 20000` | quadric simplifier (own code) |
| 7 | `python3 -I bake.py <work> <work>/low_20k.bin 2048 <work>/shoumik20k` | new UV charts, bake colour, transfer skin weights |
| 8 | save `shoumik20k.npz` arrays as `<work>/low_<key>.bin` and the atlas as a 1024 JPEG | |
| 9 | `node assemble.js <three> <fbx> <work> <work>/shoumik_1024.jpg <work>/shoumik.glb clipmap.json` | GLB + preview renders |

`clipmap.json` names the clips the game uses (see `data/player.json → model.glb`), marks
clips with forward travel as `inPlace`, and builds the arms-crossed signature idle
(`idleCrossed`, `crossarms.js`) from Mixamo's Idle. `pose-lab.js` renders a pose to tune those
arm directions.

Result (2026-11-19): 618,812 → 20,000 triangles, 1024² texture, 32 clips, 4.2 MB.
