# Shoumik — Character Sheet

Written from 8 reference photos supplied by the owner. Every session must keep Shoumik
consistent with this sheet. The reference photos themselves are NOT stored in this repo; the
owner attaches them in chat when needed.

## Identity (hidden profile card)
- Name: **Shoumik Kumar**
- Sir Salimullah Medical College
- Ex-Notre Dame College
- More details will be added by the owner later.

## Body
- Young adult man, mid-20s, South Asian (Bangladeshi).
- Average height, **stocky / heavy-set build**: broad shoulders, thick arms, full chest, a
  little belly. Not muscular-thin. Model him wider than default NPCs (about 1.15× torso width).
- Stands confidently; signature pose = **arms crossed**, slight head tilt, calm half-smile.
  Use this pose for idle variation, the profile card and the loading screen.

## Head and face
- **Round, full face** with full cheeks and a soft jawline hidden under the beard.
- Skin: warm medium-wheatish brown. Base `#C08B68`, shadow `#9C6A4C`, highlight `#D9A784`.
- Hair: **thick jet-black hair** (`#141010`, highlight `#2A2222`), voluminous on top, swept up
  and back in a quiff with a loose side sweep, a few strands falling on the forehead. Sides
  short/tapered, ears visible.
- Eyebrows: **thick, dark, straight-ish** with a slight arch.
- Eyes: dark brown, **slightly heavy / relaxed eyelids**, calm look.
- Nose: broad, rounded tip.
- **Full beard**, short-to-medium length, well-groomed, connected to a moustache, slightly
  lighter density on the upper cheeks; a small soul patch under the lower lip is visible.
  Beard colour `#1A1513`.
- No glasses.

## Signature accessory
- **Big black chronograph wristwatch on the left wrist** — he wears one in almost every photo.
  Always model it (small dark box on the left wrist).

## Outfits (default first)
| id | Outfit | Colours |
|---|---|---|
| `casual_maroon` (DEFAULT) | Oversized maroon crew-neck T-shirt, beige/khaki chinos, white sneakers | tee `#7E1C24`, pants `#C9B79C`, shoes `#EDEDED` |
| `panjabi_navy` | Navy-blue panjabi (long kurta, mandarin collar, buttons), maroon cuff lining | `#1B3A5C`, cuff `#5A1E2A` |
| `panjabi_grey` | Grey printed panjabi with black-and-white embroidered collar, placket and cuffs | `#8E9490`, trim `#1C1C1C` |
| `doctor` | White doctor's apron over a light checked shirt, black stethoscope around the neck | apron `#F2F2F0`, shirt `#D8E2EE`, stethoscope `#111111` |
| `polo_black` | Black polo shirt with cream-striped collar and sleeve tips | `#141414`, stripes `#E8DCC0` |

No real brand logos on any outfit. The `doctor` outfit fits his medical-college identity
(unlockable, or sold at the clothes shop near Sir Salimullah Medical College).

## Image assets (already in the repo)
- `assets/shoumik/face.png` — 512×512 front face crop (eyebrows to chin, cheek to cheek) for the
  PS2-style face texture on the front of the head. Map it on a slightly rounded front plane;
  blend edges into skin colour `#C08B68` and hair colour at the top.
- `assets/shoumik/portrait.png` — 512×512 head-and-shoulders crop for the HUD portrait and the
  profile card (show it in a circle).

## In-game model notes (Session 2)
- Built in code: `src/entities/shoumik/` (about 2,000 triangles). Colours come from
  `data/player.json → model`, outfits from `data/outfits.json`.
- Outfit details the photos did not fix, chosen in Session 2 (change them in
  `data/outfits.json` if the owner prefers something else):
  - `panjabi_navy`: off-white pajama `#E9E6DC`, brown sandals `#5A3B28`.
  - `panjabi_grey`: white pajama `#F1EFE8`, dark shoes `#2a2420`; the "print" is a fine speckle.
  - `doctor`: dark trousers `#2A2D34`, black shoes `#15151a`, steel chest-piece on the stethoscope.
  - `polo_black`: dark blue jeans `#2B3443`, white sneakers.
- Face texture: the photo is used at 128×128, slightly tone-matched to the skin colour and
  faded at the edges (`data/player.json → model.face`). If the photo is ever replaced, set
  `cheekWidth` and `chinY` there to match the new picture.
- Signature arms-crossed pose plays automatically after 3.5 s of standing still.
