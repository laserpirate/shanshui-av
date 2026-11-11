# -*- coding: utf-8 -*-
"""structures.py : docs/nashua/structures.md, the A2 acceptance list (P6, ADDENDUM-A).

Every structure the plans show along the reach, with its name or id exactly as the plan or the data gives it, its
station, its source, and whether the scroll draws it; then every building footprint within 400 m of the north bank
(the left bank, side +1) between the dam and the confluence: N drawn of M, and each one left out with the reason.
Reads the public packs and their coverage.json, the source base layer (bridges) through sources.local.json.
No local path or file name of the source lane is written: sources are described.
  python tools/nashua/structures.py
No em dashes.
"""
import os, io, json, datetime
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = json.load(io.open(os.path.join(HERE, 'sources.local.json'), encoding='utf-8'))
PK = json.load(io.open(os.path.join(ROOT, 'data', 'nashua', 'existing', 'pack.json'), encoding='utf-8'))
MK = json.load(io.open(os.path.join(ROOT, 'data', 'nashua', 'merrimack', 'pack.json'), encoding='utf-8'))
COV = json.load(io.open(os.path.join(ROOT, 'data', 'nashua', 'existing', 'coverage.json'), encoding='utf-8'))['footprints']
NAS, LEN = PK['nashua_len_m'], PK['route_len_m']
FT = 0.3048
fm = lambda m: '%.0f m (%.0f ft)' % (m, m / FT)


def bridges_in_base():
    """every bridge line in the base layer: its name or type, where it crosses or meets the route"""
    from shapely.geometry import shape, LineString
    R = LineString(json.load(io.open(SRC['centreline'], encoding='utf-8'))['features'][0]['geometry']['coordinates'])
    out = []
    for f in json.load(io.open(SRC['base'], encoding='utf-8'))['features']:
        p = f['properties']
        if p.get('kind') != 'bridge': continue
        ln = shape(f['geometry']); m = ln.interpolate(0.5, normalized=True)
        out.append({'name': p.get('name') or p.get('type') or 'bridge', 'type': p.get('type'), 's': float(R.project(m)), 'd': float(R.distance(m))})
    return out


def main():
    rows = []
    add = lambda name, kind, s, src, drawn, note='': rows.append((name, kind, s, src, drawn, note))
    # the dam and the bridges
    add(PK['dam']['label'], 'dam', 0.0, '1:5000 plan v04, 1:2000 plan S2-S3 v04 ("Jackson Mills dam"); national dam inventory', 'yes', 'the dam in section at s 0: headpond, crest gate, spillway face, white water')
    pb = {(b['name'], round(b['s'])) for b in PK['bridges']}
    for b in bridges_in_base():
        # the pack's own bridge of that name near this one (the pack places a bridge where its line crosses the route)
        hit = [s for n, s in pb if abs(b['s'] - s) < 40 and (n == b['name'] or 'rail' in n and 'rail' in (b['type'] or ''))]
        drawn = bool(hit)
        if hit: b['s'] = float(hit[0])
        inside = drawn or (0.5 < b['s'] < LEN - 0.5 and b['d'] < 60)
        nm = 'Bridge, ' + b['name'] if b['name'] and 'rail' not in b['name'] else 'Bridge, rail bridge'
        note = '' if inside else ('upstream of the dam' if b['s'] <= 0.5 else 'past the end of the route' if b['s'] >= LEN - 0.5 else 'not on the route (%.0f m off)' % b['d'])
        add(nm, 'bridge', b['s'] if inside else None, '1:5000 plan v04; base layer bridge lines', 'yes' if drawn else 'no', note or 'in section where the scroll crosses it')
    # the lot, the mill, the church, the dike
    L = PK['lot']; add(L['label'], 'lot', (L['s0'] + L['s1']) / 2, '1:2000 plan S2-S3 v04 ("Former parking lot")', 'yes', 'paving lines over s %d to %d on the north bank' % (L['s0'], L['s1']))
    prim = PK['prim_codes']
    for b in PK['buildings']:
        if b[2] != 1: continue
        p = prim[b[8]] if len(b) > 8 else ''
        if p in ('Light', 'Heavy', 'Metals/Minerals Processing') and (b[1] - b[0]) >= 60:
            add('structures layer id %s (%s industrial)' % (b[9], p), 'mill or factory massing', (b[0] + b[1]) / 2, '1:2000 plan S2-S3 v04 (building massing); structures layer', 'yes' if b[3] <= 3 else 'no',
                's %.0f to %.0f, %.0f m long, estimated height %.0f m; no name in the data' % (b[0], b[1], b[1] - b[0], b[5]))
        if p == 'Religious':
            add('structures layer id %s (Religious)' % b[9], 'church', (b[0] + b[1]) / 2, 'structures layer (primary occupancy); 1:2000 plan S2-S3 v04 (building massing)', 'yes' if b[3] <= 3 else 'no',
                '%s from the water edge; no name in the data: labelled by its kind' % fm(b[7]))
    for P, reach in ((PK, 'Nashua'), (MK, 'Merrimack')):
        for d in P.get('structures') or []:
            add(d['label'], 'dike', d['s'], 'national dam inventory (a point); ' + reach + ' reach', 'yes',
                'side %s; height %.1f m from the inventory; %s; %s' % ('+1 (left)' if d['side'] == 1 else '-1 (right)', d['height_m'], d['position'], d['line']))
    for c in PK['cso']:
        if c['side'] == 1: add(c['id'], 'CSO outfall', c['s'], 'assembly (CSO list)', 'yes', 'a pipe at the water line')
    for o in PK['outfalls']:
        if o['side'] == 1: add(o['id'], 'outfall', o['s'], 'assembly (outfalls)', 'yes', 'a pipe at the water line, %s in' % o.get('dia_in') if o.get('dia_in') else 'a pipe at the water line')
    for st in PK['stations']:
        add(st['id'], 'station', (st['s0'] + st['s1']) / 2, '1:5000 plan v04 (stations S1 to S6)', 'yes', 'label, and a station on the map inset; s %d to %d' % (st['s0'], st['s1']))
    rows.sort(key=lambda r: (r[2] is None, r[2] if r[2] is not None else 0))

    # footprints: within 400 m of the north bank, dam to confluence
    inr = [f for f in COV if f.get('side') == 1 and 0.5 < f['s'] < NAS and (f.get('d_edge_m', f['d_route_m']) <= 400)]
    drawn = [f for f in inr if f['why'] == 'drawn']
    out = [f for f in inr if f['why'] != 'drawn']
    md = ['# Structures along the reach (P6, A2)', '',
          'Made by `tools/nashua/structures.py` on %s from the public packs (Nashua %s, Merrimack %s) and the pack builder\'s coverage record. '
          'We stand on the south bank looking north: the north bank is the left bank (side +1, the default view), downstream to the right. '
          'Inside the oxbow (s 880 to 1420) the left bank faces south-west; it is still the left bank.' % (datetime.date.today().isoformat(), PK['hash'], MK['hash']), '',
          '## Structures the plans show', '',
          'Names and ids exactly as the plan or the data gives them. Where the data has no name, the kind comes from the source (the structures layer\'s primary occupancy) and a question is logged in DECISIONS.', '',
          '| Name or id | Kind | Station s | Source | Drawn | Note |', '| --- | --- | --- | --- | --- | --- |']
    for r in rows: md.append('| %s | %s | %s | %s | %s | %s |' % (r[0], r[1], fm(r[2]) if r[2] is not None else 'outside', r[3], r[4], r[5]))
    md += ['', '## Building footprints within 400 m of the north bank, dam to confluence', '',
           '**%d drawn of %d in range** (footprints whose centroid projects onto the route between s 0 and %.1f m on the left bank, at most 400 m from the water edge). '
           'Heights are estimated from footprint area (7, 10 or 14 m): no lidar first-return surface is in the Episode 2 GIS outputs, so no real heights.' % (len(drawn), len(inr), NAS), '']
    if out:
        md += ['Left out:', '', '| id | Primary occupancy | s | Reason |', '| --- | --- | --- | --- |']
        for f in out: md.append('| %s | %s | %.0f | %s |' % (f['id'], f['prim'], f['s'], f['why']))
    else:
        md += ['None left out.']
    from collections import Counter
    why = Counter(f['why'] for f in COV)
    md += ['', 'All %d footprints in the source layer: ' % len(COV) + '; '.join('%s %d' % (k, v) for k, v in sorted(why.items(), key=lambda kv: -kv[1])) + '.', '']
    io.open(os.path.join(ROOT, 'docs', 'nashua', 'structures.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(md))
    print('structures rows', len(rows), 'footprints in range', len(inr), 'drawn', len(drawn))


if __name__ == '__main__':
    main()
