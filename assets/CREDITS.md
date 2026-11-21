# Asset credits and licences

Every file here must be safe for a free commercial game on a public repo. Before adding a pack,
check its licence page. Do NOT add models extracted from games, apps or websites, or models
with real brand logos.

| Folder | Pack | Author | Licence |
|---|---|---|---|
| `assets/vehicles/` (cop, normal-car1/2, suv, sports-car, sports-car2, taxi) | Cars Pack | Quaternius (quaternius.com) | CC0 1.0 |
| `assets/vehicles/` (ambulance, bus) | Public Transport Pack | Quaternius | CC0 1.0 |
| `assets/trains/` | Train Pack | Quaternius | CC0 1.0 |
| `assets/weapons/` | Ultimate Gun Pack | Quaternius | CC0 1.0 |
| `assets/shoumik/shoumik.glb` | Owner's Shoumik model rigged and animated with Mixamo | owner / Adobe Mixamo | owner's files; Mixamo animations are free for games |
| `assets/city/facades.jpg`, `assets/city/ground.jpg` (baked from kit pieces and textures) | Downtown City MegaKit (free Standard version) | Quaternius | CC0 1.0 |
| `assets/street/street-props.glb` (street lamps, park double lamps, cones, barriers, site fences, waste containers) | City Kit (Roads) 2.2, kenney.nl/assets/city-kit-roads (downloaded 2026-11-21) | Kenney (www.kenney.nl) | CC0 1.0 |

Street props: packed by `tools/street-kit/pack-props.js` (palette texture baked into vertex colours,
lamps recoloured grey, scaled to metres). Benches, dustbins, transformers, bamboo scaffolding,
nets and footbridges are built in code (no pack).

Converted from FBX to GLB in headless three.js (FBXLoader → GLTFExporter): FBX colours fixed
(linear), opacity fixed, units in metres. No textures needed (flat colours).

Owner: please keep the original download page / receipt for each pack.
