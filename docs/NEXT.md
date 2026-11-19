# Ideas backlog

- Connect lessons and questions to a Google Sheet (format in CONTENT_GUIDE.md).
- Posters from a Google Sheet as well.
- Real discount codes for courses after N lessons.
- Android app via Capacitor; PC keyboard/mouse polish.
- Online save + weekly "Top student" leaderboard (Supabase) before any real prizes.
- Better 3D models for Shoumik and landmarks.
- Add Li Ador Noirrit font file at assets/fonts/LiAdorNoirrit-Regular.ttf once the owner confirms a web/embedding licence from Lipighor (its EULA forbids redistribution), then set `data/ui.json → fonts.bn.fileInstalled` to true. Until then Hind Siliguri is used.

## Ideas noted during Session 1
- Pick Low quality automatically on weak phones at first launch (planned for Session 8; could
  come earlier if the owner's test phone struggles).
- Far-away chunks could use a simpler mesh (no balconies/signs) to cut triangles in Old Dhaka.
- Host three.js inside the repo (`/vendor/`) instead of the CDN so the game also works when
  the CDN is slow or blocked, and for the offline PWA (needs the owner's OK: tech rule says CDN).
- Handle "WebGL context lost" (phone under memory pressure) with a friendly reload message.
- Arched Hatirjheel bridges with lights and kerb ramps for vehicles (Sessions 3–4).
- Street lights, rooftop AC units and dish antennas, parked rickshaws as static props.
- Debug teleport menu (`?debug=1`) listing districts, for faster testing.
- Sunset reflection streak on the water; crows circling (Session 7 vibe pass).
- Camera option "fixed follow" for players who dislike the auto-swing.

## Ideas noted during Session 2
- Pedestrians in the small lanes inside blocks (Old Dhaka), tea-stall groups standing and
  chatting, people sitting on benches/steps.
- People avoiding each other; walking in pairs; umbrellas in the rain (Session 7).
- A small nose/brow bump on Shoumik's head so his profile is less flat; a second, sharper
  face photo taken straight-on in even light would also help.
- Proper cloth for long kurtas/sarees (hide the legs under the skirt instead of poking through).
- Crowd reactions to Shoumik dancing well (clapping circle), a dance mini-game for small tips.
- Café tables/umbrellas at the Gulshan spot, fairy lights at Hatirjheel (Session 4 landmarks).
- Loading screen and profile card showing Shoumik in his arms-crossed pose (Session 7).
- Pedestrian LOD 3: one flat "impostor" card per person beyond ~60 m for even bigger crowds.

## Ideas noted during Session 3
- Visible traffic lights (or a traffic policeman with a stick) at junctions; indicator lights.
- Shoumik visible through the windows of closed cars; opening doors; riders pedalling.
- Minimap blips: owned vehicles, the hired ride's destination, rickshaw stands.
- AI rickshaws inside the narrow Old Dhaka lanes; overtaking; ambulances and police with sirens
  that others make way for (police chases are Session 6).
- Passengers visibly getting on and off buses at stops; riding a bus as a passenger for ৳10.
- Vehicle damage you can see (dents, a missing bumper), tyre marks on the road, sparks.
- A horn that makes pedestrians and rickshaws move aside.
- Unique-jump bonuses on the ramps, a stunt counter on the profile card.
- Boats at Sadarghat; the MRT train as something you can ride (after Session 4).
- Trailers / vans of goods, tea-stall carts and parked rickshaw rows as street dressing.

## Ideas noted during Session 4
- Ride the MRT: buy a ticket (৳) at a station, sit in the train, get off at another station.
- Drive on the elevated expressway (ramps up/down at both ends; needs a second road level).
- Pillars in the water where the MRT crosses the lakes; Hatirjheel water-taxi boats you can hire.
- Landmark interiors: walk into TSC, Curzon Hall, Ahsan Manzil (museum) — or at least open doors.
- Night lighting for landmarks (Session 7): floodlit Sangsad, lit Shaheed Minar, glowing launches.
- Minimap icons for landmarks, MRT stations and Breaking School / Biology.
- Posters from a Google Sheet tab (same columns as posters.json) — add a poster sheet mapper.
- Tap analytics (which poster was opened how often) once there is a server; optional QR posters.
- Video-like LED screens (2–3 frame animated posters) and night-time glow for billboards.
- Seasonal posters (Eid, Pohela Boishakh, exam season) prepared in advance with dates.
- Unload far poster pictures from memory if the poster list grows past ~50.
- Bus-stop posters on the sidewalk side of the shelter too; posters on MRT station walls.

## Ideas noted during Session 4.5 (Part A)
- Auto-pick quality from the first seconds of FPS (Medium may be heavy on 4 GB phones now that it
  has shadows + bloom). Planned for Session 8; worth doing as soon as the owner reports phone FPS.
- A cheaper "Medium-lite": bloom without shadows, or shadows every second frame.
- Headlights and tail lights as glow materials so cars look good at night (Session 7).
- Glass towers with a reflective MeshStandardMaterial (they would pick up the sky map).
- Make the vehicle/poster test tools use game time instead of real time, so they also pass on
  Medium/High in the software renderer.

## Ideas noted during Session 4.5 (Part B: real Shoumik)
- Outfits on the 3D model: recolour the shirt/trouser areas of the texture per outfit (mask by
  colour in the atlas), or ask the owner for one Mixamo export per outfit.
- Use the real enterCar/exitCar clips (5 s, they walk to the door) once boarding has time for
  them; use `sit` instead of `drive` when he is a rickshaw/CNG passenger.
- Turn-on-the-spot clips (turnLeft/turnRight) when he rotates while standing.
- Compress the GLB (quantised animation keys, meshopt) to cut 4.2 MB to ~1.5 MB.
- Pedestrians could share Mixamo animations too (needs rigged NPC models).

## Ideas noted during Session 4.5 (Part C: vehicle, train and gun packs)
- A ground railway (Kamalapur–Tejgaon–Banani) with the cargo and locomotive models and the
  track pieces already in `assets/trains/`.
- Traffic lights, road signs and cones from the public-transport pack (converted in the work
  folder, not added yet) as street props.
- Two-handed rifle hold (left hand on the fore-grip) and gun-specific grips in Session 6.
- NormalCar2 (a small hatchback) as its own "compact" type; the bicycle models from the
  public-transport pack (needs the rider to fit).
- Headlight/tail-light materials of the real cars as glow materials for night (Session 7).
- Ask the owner for CC0 / licensed models of a Dhaka-style bus, CNG and rickshaw if a better
  look is wanted; the code-built ones stay until then.

## Ideas noted during Session 4.5 (Part C2: city kit)
- Kit props as instanced street furniture: AC units on walls (very Dhaka), bollards, planters,
  manholes, drains (`Prop_*` in the kit).
- A few hero buildings built from real kit pieces (whole 3D modules) near the start area and
  landmarks, where the extra triangles are worth it.
- Lit windows at night: an emissive version of the facade atlas (Session 7).
- 512 px facade tiles on High only (sharper up close), 256 px on Low/Medium.
- Roof cornices and corner columns along the top edge of buildings (kit Cornice_* / Brick_CornerColumn_*).
