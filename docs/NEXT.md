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

## Ideas noted during Session 5
- Small 3D shop fronts / stall props (tea kettle, fuchka cart, showroom glass, a "To-Let" sign at
  homes) at each ring; cars on display at the showroom that you can walk round before buying.
- Pick the colour of a bought vehicle (swatches from `data/vehicles.json → colors`).
- Sell vehicles back (half price) at the showroom; a garage menu at home to pick which vehicle
  waits outside.
- Fast travel between owned homes (taxi fare) and a minimap legend for the coloured dots.
- Quiz Class leaderboards (best streak per day) and a "review my wrong answers" list.
- Weekly bonus for finishing every lesson of a chapter; a certificate on the profile card.
- Turn on `quizClass.dailyCap` (e.g. ৳2,000) once there are many lessons, so practice money
  cannot be farmed with a few memorised questions.
- Show which lessons are new since the last visit (badge on the ring).

## Ideas noted during Session 6
- Drive-by shooting (aim sideways from a car / motorbike) and shooting from a rickshaw as passenger.
- Weapon pick-ups dropped by dead officers; health / armour pick-ups hidden around the city.
- Gun sounds, sirens with Doppler, police radio chatter in Bangla (Session 7 sound pass).
- Police path finding on the sidewalk graph (like pedestrians) so officers go round buildings.
- "Hide in a garage / change outfit to lose a star" (Vice City paint shop idea with the clothes shop).
- Ambulance arriving for bodies; fire truck for burning wrecks.
- Jail could offer Quiz Class questions from both institutes and a "study streak" bonus.
- Show the wanted level on the minimap (police dots, a red/blue flashing rim).
- Phone aim assist cycling between targets with a swipe; lock on to vehicles too.
- Profile card (Session 7) showing the Session 6 stats with Bangla digits.

## Ideas noted during Session 7
- Street lamps with light pools on the road at night (decals, not real lights) and car headlights
  (cheap glowing cones / projected decal) — the night streets are lit only by windows and neon now.
- Umbrellas for pedestrians and rickshaw plastic covers while it rains; puddle splashes; water
  logging on some roads after heavy rain (slower driving).
- Neon reflections in wet roads (screen-space or a mirrored neon pass on High).
- Real recorded sounds (royalty-free packs): rickshaw bells, CNG engines, Bangla hawker calls,
  azan-free ambient city loops; Doppler on sirens; police radio chatter in Bangla.
- Real radio tracks from Bangladeshi indie artists (with written permission), a talk-show station
  with Breaking School study tips, adverts for real courses between songs.
- Load-shedding makes traffic lights go off too (junction chaos) and the MRT stop for 30 s.
- Daily login reward and "study streak" codes in the reward system; codes per institute.
- Photo mode: free camera, filters, Shoumik poses, stickers of the brands for social media posts.
- Weather forecast on an LED screen; fog in winter mornings; heat haze in the afternoon.
- Moon phases; fireworks at night on special dates (e.g. Pohela Boishakh, Victory Day) from data.

## Ideas noted during Session 8 (release)
- "Update ready" toast when a new version was downloaded in the background (now it simply shows
  on the next launch).
- A "Download everything for offline" button in Settings (precache all GLBs for Medium/High).
- Self-host the Hind Siliguri font files (OFL allows it) so Bangla text looks the same offline.
- Play Store listing assets: feature graphic, screenshots from the screenshot feature, 17+ rating.
- Share-to-install: a "Play Breaking City" QR code poster in the city and on social posts.
- Auto-raise quality on strong phones (the watchdog only lowers today).


## Ideas noted during Update 9 (accounts, sheet, map)
- "Forgot PIN": reset by SMS OTP (needs an SMS gateway like SSL Wireless / a BD provider + budget),
  or the owner resets it from the Players tab with a helper menu in the Apps Script.
- Leaderboard board in the city (LED screen): top students this week from the Players tab.
- Shop pictures from the Products tab shown on the 3D shop signs too (now only in the panel).
- 3D models from `model_url` (GLB) for new products through the asset registry.
- Map: waypoints by long-press anywhere; voice-free turn arrows on the HUD while a route is set.
- Health pack pickup sound + green screen flash; hospital "heal for free once a day" for new players.
- Quiz by topic: pick a topic (Questions → topic) and get questions from every class with it.
- Admin page (owner only) listing players and totals, read from the sheet.

## Ideas noted during Roadmap 2 · Session 1 (street look)
- Walkable footbridges: climb the stairs and cross on the deck. Needs a ground height that
  depends on where you come from (a car under the deck must stay on the road) — e.g. a
  "layer" on the player (street / bridge) switched at the top and bottom of the stairs.
- Advert panels on the footbridge sides as poster slots (Dhaka footbridges are covered in ads):
  add a `footbridge` kind to `data/posterSlots.json` using `world.street.plan.footbridges`.
- Quaternius "Modular Streets" pack (CC0) has nicer street lights and traffic lights; its Google
  Drive was over its download quota on 2026-11-21. Try again later or ask the owner to upload the ZIP.
- Street props LOD: drop benches/bins in chunks further than ~150 m (cheaper far chunks).
- Parked rickshaws and tea stalls under the footbridges; people sitting on benches.
- Scaffold end posts (the last bamboo column of a wall has no right-hand pole) and a tower crane
  at the biggest construction sites.
- Real light pools that follow the road surface exactly (now a flat disc at kerb height).
