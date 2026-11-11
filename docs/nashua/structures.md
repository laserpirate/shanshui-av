# Structures along the reach (P6, A2)

Made by `tools/nashua/structures.py` on 2026-11-11 from the public packs (Nashua 142069fbabc9dc29, Merrimack a2df6eee9cae4101) and the pack builder's coverage record. We stand on the south bank looking north: the north bank is the left bank (side +1, the default view), downstream to the right. Inside the oxbow (s 880 to 1420) the left bank faces south-west; it is still the left bank.

## Structures the plans show

Names and ids exactly as the plan or the data gives them. Where the data has no name, the kind comes from the source (the structures layer's primary occupancy) and a question is logged in DECISIONS.

| Name or id | Kind | Station s | Source | Drawn | Note |
| --- | --- | --- | --- | --- | --- |
| Jackson Mills dam (NID NH00121) | dam | 0 m (0 ft) | 1:5000 plan v04, 1:2000 plan S2-S3 v04 ("Jackson Mills dam"); national dam inventory | yes | the dam in section at s 0: headpond, crest gate, spillway face, white water |
| Nashua Flood Control Levee (NID NH03813) | dike | 2 m (7 ft) | national dam inventory (a point); Merrimack reach | yes | side -1 (right); height 4.6 m from the inventory; past this end of the route by 90 m from the route: drawn at the end, approximate; a point in the inventory; the line of the dike is not in the data |
| S1 | station | 165 m (541 ft) | 1:5000 plan v04 (stations S1 to S6) | yes | label, and a station on the map inset; s 0 to 330 |
| Bridge, rail bridge | bridge | 362 m (1188 ft) | 1:5000 plan v04; base layer bridge lines | yes | in section where the scroll crosses it |
| S2 | station | 605 m (1985 ft) | 1:5000 plan v04 (stations S1 to S6) | yes | label, and a station on the map inset; s 330 to 880 |
| structures layer id 6000042 (Light industrial) | mill or factory massing | 606 m (1990 ft) | 1:2000 plan S2-S3 v04 (building massing); structures layer | yes | s 342 to 871, 529 m long, estimated height 14 m; no name in the data |
| Bridge, Canal St | bridge | 870 m (2854 ft) | 1:5000 plan v04; base layer bridge lines | yes | in section where the scroll crosses it |
| parking lot (90 Canal St, NRPC parcel 41-78) | lot | 1052 m (3451 ft) | 1:2000 plan S2-S3 v04 ("Former parking lot") | yes | paving lines over s 1013 to 1091 on the north bank |
| structures layer id 24170 (Religious) | church | 1110 m (3643 ft) | structures layer (primary occupancy); 1:2000 plan S2-S3 v04 (building massing) | yes | 97 m (319 ft) from the water edge; no name in the data: labelled by its kind |
| S3 | station | 1150 m (3773 ft) | 1:5000 plan v04 (stations S1 to S6) | yes | label, and a station on the map inset; s 880 to 1420 |
| CSO #9 | CSO outfall | 1262 m (4140 ft) | assembly (CSO list) | yes | a pipe at the water line |
| structures layer id 25063 (Religious) | church | 1325 m (4347 ft) | structures layer (primary occupancy); 1:2000 plan S2-S3 v04 (building massing) | yes | 41 m (134 ft) from the water edge; no name in the data: labelled by its kind |
| S4 | station | 1635 m (5364 ft) | 1:5000 plan v04 (stations S1 to S6) | yes | label, and a station on the map inset; s 1420 to 1850 |
| Bridge, rail bridge | bridge | 1706 m (5597 ft) | 1:5000 plan v04; base layer bridge lines | yes | in section where the scroll crosses it |
| OF-9617 | outfall | 1840 m (6037 ft) | assembly (outfalls) | yes | a pipe at the water line, 18 in |
| S5 | station | 2004 m (6576 ft) | 1:5000 plan v04 (stations S1 to S6) | yes | label, and a station on the map inset; s 1850 to 2159 |
| S6 | station | 2309 m (7575 ft) | 1:5000 plan v04 (stations S1 to S6) | yes | label, and a station on the map inset; s 2159 to 2458 |
| Bridge, Bridge St | bridge | 2450 m (8038 ft) | 1:5000 plan v04; base layer bridge lines | yes | in section where the scroll crosses it |
| Nashua Flood Control Levee (NID NH03813) | dike | 2457 m (8060 ft) | national dam inventory (a point); Nashua reach | yes | side -1 (right); height 4.6 m from the inventory; past this end of the route by 115 m from the route: drawn at the end, approximate; a point in the inventory; the line of the dike is not in the data |
| Bridge, Main St | bridge | outside | 1:5000 plan v04; base layer bridge lines | no | upstream of the dam |
| Bridge, Broad St Pkwy | bridge | outside | 1:5000 plan v04; base layer bridge lines | no | upstream of the dam |
| Bridge, Ferry St | bridge | outside | 1:5000 plan v04; base layer bridge lines | no | past the end of the route |

## Landmarks drawn as glyphs (ADDENDUM-B B8)

Each is drawn **schematic, at the surveyed position**: exaggerated so it reads at the default scale, at the station the data gives. The label word is the owner's; the source's name and id are here and in the label's tooltip only.

| Label | Source name and id | Station s | Glyph | Note |
| --- | --- | --- | --- | --- |
| Dam | Jackson Mills dam (NID NH00121) | 0 m (0 ft) | a wide body (22 m of spillway face, wider than surveyed), the crest gate, the spillway face with falling water, the headpond 4.92 m above the tailwater |  |
| Levee (approximate) | Nashua Flood Control Levee (NID NH03813); Merrimack reach (reach=merrimack), its own s | 2 m (7 ft) | a trapezoid embankment with a flat crest, 4.6 m from the inventory, side slopes 1 in 2.5 | a point in the inventory, drawn at the end of the route: approximate |
| rail bridge | rail bridge, Nashua River | 362 m (1187 ft) | a bolder deck and pier with a footing; on the deck a boxcar (a train glyph is cheap: one box, a door, four wheels) | deck 14.4 m above the water from the ground at its two ends |
| Factory | structures layer id 6000042 (Light industrial) | 606 m (1990 ft) | a long mill over s 342 to 871 with a sawtooth roof and rows of tall windows; a smokestack to 2.2 times the estimated height | Owner's call: the smokestack is not in the data (flagged, ADDENDUM-B B8) |
| Canal St | road bridge, Nashua River | 870 m (2853 ft) | a bolder deck and pier with a footing; on the deck a car | deck 9.1 m above the water from the ground at its two ends |
| Church | structures layer id 24170 (Religious) | 1110 m (3643 ft) | a nave with a gable, a steeple (tower and spire to 2.25 times the estimated height) and a cross, over its footprint | the steeple is not in the data |
| CSO #9 | CSO #9 (assembly, CSO list) | 1262 m (4140 ft) | a pipe mouth 2.2 m across in a headwall set into the bank (no diameter in the data) | side +1 (left) |
| CSO #6 | CSO #6 (assembly, CSO list) | 1691 m (5549 ft) | a pipe mouth 2.2 m across in a headwall set into the bank (no diameter in the data) | side -1 (right) |
| rail bridge | rail bridge, Nashua River | 1706 m (5597 ft) | a bolder deck and pier with a footing; on the deck a boxcar (a train glyph is cheap: one box, a door, four wheels) | deck 8.2 m above the water from the ground at its two ends |
| Bridge St | road bridge, Merrimack River | 2450 m (8038 ft) | a bolder deck and pier with a footing; on the deck a bus | deck 4.5 m above the water from the ground at its two ends |

## Building footprints within 400 m of the north bank, dam to confluence

**45 drawn of 45 in range** (footprints whose centroid projects onto the route between s 0 and 2158.8 m on the left bank, at most 400 m from the water edge). Heights are estimated from footprint area (7, 10 or 14 m): no lidar first-return surface is in the Episode 2 GIS outputs, so no real heights.

None left out.

All 458 footprints in the source layer: more than 1100 m from the route, off the 1 m grid 182; drawn 152; upstream of the dam 70; past the end of the route 34; kept in the pack, not drawn: more than 700 m behind the water edge 20.
