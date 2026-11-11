# -*- coding: utf-8 -*-
"""build-pack.py : the nashua world's data packs, from the source GIS read in place.

Source paths come from tools/nashua/sources.local.json (gitignored), so no source file name enters a tracked file
or the pack. Writes, never into the source folder:
  data/nashua/existing/pack.json, pack.bin, pack_preview.png   public: existing conditions
  data/local/nashua/design/pack.json, pack.bin                 gitignored: the landform design layers
Every per-station array is a pure function of the sources, so a rebuild gives the same content hash.

Station axis: s in m along the route (dam s = 0 to 300 m into the Merrimack), every 2 m; sections every 10 m.
Side +1 = left bank looking downstream (the lot bank), side -1 = right bank.
Heights are m above the local water surface ws(s); ws(s) itself is kept so absolute levels can be offset.
Smoothing: 50 m triangular window along s on every skyline, bed and edge line (stated in pack.json).

  python tools/nashua/build-pack.py [--design] [--quick]
No em dashes.
"""
import os, io, sys, json, math, time, hashlib, datetime
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_PUB = os.environ.get('NASHUA_OUT') or os.path.join(ROOT, 'data', 'nashua', 'existing')   # NASHUA_OUT: a trial build elsewhere
OUT_DES = os.path.join(ROOT, 'data', 'local', 'nashua', 'design')
SRC = json.load(io.open(os.path.join(HERE, 'sources.local.json'), encoding='utf-8'))

FT = 0.3048
DS = float(os.environ.get('NASHUA_DS') or 1.0)   # station spacing, m (P6: 1 m, was 2; at 8 px per m a 2 m step showed corners; NASHUA_DS for a trial)
DSEC = 10.0                   # section spacing, m
SEC_HALF, SEC_STEP = 400.0, 4.0
SMOOTH_M = 50.0               # triangular window, full width
EDGE_MAX = 400.0
BANDS = [(0, 40), (40, 120), (120, 300), (300, 700)]   # m from the water edge, 1 m grid then wide DEM
FAR = [(700, 1500), (1500, 3000)]                      # wide DEM only
OCC = ['Residential', 'Commercial', 'Industrial', 'Institutional', 'Mixed', 'Other']
PRIM = []                     # primary occupancy strings from the structures layer, in first-seen order (P6)
# absolute levels found in the source lane's water-metrics glossary (v02), as the v06 scroll drew them
LEVELS_ABS = [
    {'id': 'fema1', 'name': 'Fluvial · 1% Annual Chance Flood (FEMA) 34.63 m (113.6 ft)', 'z': 34.63},
    {'id': 'f1936', 'name': 'Fluvial · 1936 Flood of Record 39.09 m (128.26 ft)', 'z': 39.09},
]
DAM = {'s': 0.0, 'headpond_m': 34.75, 'head_m': 4.92, 'gate_m': 2.44, 'height_m': 10.06, 'crest_length_m': 100.6,
       'source': 'dam figures as used by the source lane scroll (v06)'}


def ornl_index():
    """the structures layer (id and primary occupancy per footprint), centroids for a nearest join"""
    from shapely.geometry import shape
    if not SRC.get('ornl'): return [], np.zeros((0, 2))
    orn = json.load(io.open(SRC['ornl'], encoding='utf-8'))['features']
    return orn, np.array([[shape(o['geometry']).centroid.x, shape(o['geometry']).centroid.y] for o in orn])


def ornl_of(orn, oc, c):
    """(prim, build_id) of the structure whose centroid is within 2 m of c, else ('Unclassified', None)"""
    if len(oc):
        dd = np.hypot(oc[:, 0] - c.x, oc[:, 1] - c.y); j = int(np.argmin(dd))
        if dd[j] < 2.0: return (orn[j]['properties'].get('prim_occ') or '').strip() or 'Unclassified', orn[j]['properties'].get('build_id')
    return 'Unclassified', None


def nid_structures(R, LEN, near_m=400):
    """dikes and levees of the national dam inventory within near_m of the route R and inside (0, LEN), at their station"""
    from shapely.geometry import shape
    out = []
    if not SRC.get('nid'): return out
    for f in json.load(io.open(SRC['nid'], encoding='utf-8'))['features']:
        p = f['properties']; nm = ((p.get('OTHER_NAMES') or '') + ' ' + (p.get('NAME') or '')).lower()
        if 'dike' not in nm and 'levee' not in nm: continue
        pt = shape(f['geometry'])
        sp = float(R.project(pt)); dist = R.distance(pt)
        # past an end of the route by at most 150 m: drawn at that end, its position marked approximate
        at_end = (sp <= 0.5 or sp >= LEN - 0.5) and dist <= 150
        if dist > near_m or ((sp <= 0.5 or sp >= LEN - 0.5) and not at_end):
            log('structure', p['NIDID'], 'not in this reach: s', round(sp, 1), 'd', round(dist, 1)); continue
        a = R.interpolate(max(0, min(sp, LEN - 3) - 3)); b = R.interpolate(min(R.length, max(sp, 3) + 3))
        side = 1 if (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x) > 0 else -1
        if at_end: sp = 2.0 if sp <= 0.5 else LEN - 2.0
        out.append({'kind': 'dike', 'id': p['NIDID'], 'name': p.get('NAME'), 'other_names': p.get('OTHER_NAMES'), 's': round(sp, 1), 'side': side,
                    'd_route_m': round(R.distance(pt), 1), 'height_m': round(float(p.get('DAM_HEIGHT') or 0) * FT, 2),
                    'line': 'a point in the inventory; the line of the dike is not in the data',
                    'position': ('past this end of the route by %.0f m from the route: drawn at the end, approximate' % dist) if at_end else 'at its station',
                    'label': (p.get('OTHER_NAMES') or p.get('NAME')) + ' (NID ' + p['NIDID'] + ')'})
    return out


def plan_of(R, LEN, step=10.0):
    """the route in plan for the map inset (P6, A4): EPSG:32110 m every step m from s = 0 to LEN, north up"""
    pts = [[round(R.interpolate(float(s)).x, 1), round(R.interpolate(float(s)).y, 1)] for s in np.arange(0, LEN + 1e-6, step)]
    return {'crs': 'EPSG:32110', 'step_m': step, 'pts': pts, 'note': 'route centreline; the banks are drawn from edge_L and edge_R along its normals'}


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def tri_smooth(v, width_m=SMOOTH_M, step=DS):
    """nan-aware triangular smoothing along s, full width width_m"""
    h = max(1, int(round(width_m / 2 / step)))
    k = 1 - np.abs(np.arange(-h, h + 1)) / (h + 1)
    v = np.asarray(v, np.float64)
    ok = np.isfinite(v)
    a = np.pad(np.where(ok, v, 0.0), h, mode='edge')
    w = np.pad(ok.astype(np.float64), h, mode='edge')
    num = np.convolve(a, k, 'valid'); den = np.convolve(w, k, 'valid')
    out = np.where(den > 1e-9, num / np.maximum(den, 1e-9), np.nan)
    return out


def fill_nan(v):
    v = np.asarray(v, np.float64).copy()
    ok = np.isfinite(v)
    if not ok.any():
        return np.zeros_like(v)
    i = np.arange(len(v))
    v[~ok] = np.interp(i[~ok], i[ok], v[ok])
    return v


class Grid:
    def __init__(self, path, keys):
        z = np.load(path, allow_pickle=False)
        self.meta = json.loads(str(z['meta']))
        self.a = {k: z[k] for k in keys if k in z.files}
        m = self.meta
        self.x0, self.y1, self.res = m['x0'], m['y1'], m['res']
        self.ny, self.nx = self.a['existing'].shape

    def rc(self, xs, ys):
        return (self.y1 - np.asarray(ys)) / self.res - 0.5, (np.asarray(xs) - self.x0) / self.res - 0.5

    def inside(self, xs, ys):
        r, c = self.rc(xs, ys)
        return (r >= 0) & (c >= 0) & (r <= self.ny - 1) & (c <= self.nx - 1)

    def lin(self, key, xs, ys):
        from scipy.ndimage import map_coordinates
        r, c = self.rc(xs, ys)
        return map_coordinates(self.a[key].astype(np.float64), [r, c], order=1, mode='nearest')

    def near(self, key, xs, ys):
        r, c = self.rc(xs, ys)
        r = np.clip(np.round(r).astype(int), 0, self.ny - 1); c = np.clip(np.round(c).astype(int), 0, self.nx - 1)
        return self.a[key][r, c]


class Raster:
    def __init__(self, path, scale=1.0):
        import rasterio
        with rasterio.open(path) as r:
            self.v = r.read(1).astype(np.float32)
            nd = r.nodata
            self.t = r.transform
            self.crs = str(r.crs)
            self.res = r.res
        if nd is not None:
            self.v[(self.v == nd) | (self.v < -1e30)] = np.nan
        self.v *= scale
        self.a = np.nan_to_num(self.v, nan=-9999.0).astype(np.float64)

    def sample(self, xs, ys, order=1):
        from scipy.ndimage import map_coordinates
        inv = ~self.t
        c, r = inv * (np.asarray(xs), np.asarray(ys))
        out = map_coordinates(self.a, [r - 0.5, c - 0.5], order=order, mode='constant', cval=-9999.0)
        out[out < -9000] = np.nan
        return out


def build(design=False, quick=False):
    t0 = time.time()
    from shapely.geometry import shape, LineString, Point
    gkeys = ['existing', 'sequence', 'water', 'ws', 's', 'side', 'bed_proxy', 'obs', 'station']
    g = Grid(SRC['grid_design' if design else 'grid_existing'], gkeys)
    gx = Grid(SRC['grid_existing'], ['existing', 'bed_proxy', 'water', 'ws', 's', 'side'])   # bed proxy and ws from v03
    surf = 'sequence' if design else 'existing'
    wide = Raster(SRC['dem_wide_ft'], FT)
    lc = Raster(SRC['landcover'])
    log('grids', g.nx, g.ny, 'wide', wide.v.shape, wide.res, wide.crs, 'landcover', lc.v.shape)
    R = LineString(json.load(io.open(SRC['centreline'], encoding='utf-8'))['features'][0]['geometry']['coordinates'])
    LEN = float(g.meta['route_len_m']); NAS = float(g.meta['nashua_len_m'])
    S = np.arange(0, LEN + 1e-6, DS)
    if quick: S = S[::10]
    n = len(S)

    def elev(xs, ys):
        e = g.lin(surf, xs, ys)
        ins = g.inside(xs, ys)
        w = wide.sample(xs, ys)
        return np.where(ins, e, w), ins

    P = np.array([[R.interpolate(float(s)).x, R.interpolate(float(s)).y] for s in S])
    Q = np.array([[R.interpolate(min(float(s) + 3, R.length)).x, R.interpolate(min(float(s) + 3, R.length)).y] for s in S])
    O = np.array([[R.interpolate(max(float(s) - 3, 0)).x, R.interpolate(max(float(s) - 3, 0)).y] for s in S])
    T = Q - O; T /= np.linalg.norm(T, axis=1)[:, None]
    NL = np.stack([-T[:, 1], T[:, 0]], 1)            # left of downstream
    ws = gx.lin('ws', P[:, 0], P[:, 1])
    # left normal = side +1? check against the grid's own side layer 30 m out
    chk = gx.near('side', P[:, 0] + NL[:, 0] * 30, P[:, 1] + NL[:, 1] * 30)
    agree = float(np.mean(chk[chk != 0] == 1)) if np.any(chk != 0) else float('nan')
    log('left normal on grid side +1:', round(agree, 3))
    wkey = 'water'
    TT = np.arange(0, EDGE_MAX + 0.5, 1.0)
    edge = {}; bands = {}; bmean = {}; canopy = {}; far = {}; ins_share = {}
    for sg in (1, -1):
        e = np.full(n, np.nan)
        for i in range(n):
            xs = P[i, 0] + NL[i, 0] * TT * sg; ys = P[i, 1] + NL[i, 1] * TT * sg
            w = g.near(wkey, xs, ys).astype(bool) & g.inside(xs, ys)
            land = ~w
            # first run of 4 land metres
            run = np.convolve(land.astype(int), np.ones(4, int), 'valid') == 4
            k = np.nonzero(run)[0]
            e[i] = TT[k[0]] if len(k) else EDGE_MAX
        edge[sg] = e
        B = np.full((len(BANDS), n), np.nan); M = np.full((len(BANDS), n), np.nan); C = np.full((len(BANDS), n), np.nan)
        I = np.zeros((len(BANDS), n))
        for j, (a, b) in enumerate(BANDS):
            D = np.arange(a, b, 2.0) + 1.0
            for i in range(n):
                dd = e[i] + D
                xs = P[i, 0] + NL[i, 0] * dd * sg; ys = P[i, 1] + NL[i, 1] * dd * sg
                z, ins = elev(xs, ys)
                wet = g.near(wkey, xs, ys).astype(bool) & ins
                z = np.where(wet, np.nan, z)
                if np.isfinite(z).any():
                    B[j, i] = np.nanmax(z) - ws[i]; M[j, i] = np.nanmedian(z) - ws[i]
                cv = lc.sample(xs, ys, order=0)
                okc = np.isfinite(cv) & ~wet
                C[j, i] = float(np.mean(cv[okc] == 2)) if okc.any() else np.nan
                I[j, i] = float(np.mean(ins))
        F = np.full((len(FAR), n), np.nan)
        for j, (a, b) in enumerate(FAR):
            D = np.arange(a, b, 8.0) + 4.0
            for i in range(n):
                dd = e[i] + D
                xs = P[i, 0] + NL[i, 0] * dd * sg; ys = P[i, 1] + NL[i, 1] * dd * sg
                z = wide.sample(xs, ys)
                if np.isfinite(z).any(): F[j, i] = np.nanmax(z) - ws[i]
        bands[sg] = B; bmean[sg] = M; canopy[sg] = C; far[sg] = F; ins_share[sg] = I
        log('side', sg, 'edge min/med/max', np.nanmin(e), np.nanmedian(e), np.nanmax(e), 'bands max', np.round(np.nanmax(B, 1), 1), 'far max', np.round(np.nanmax(F, 1), 1))

    # bed along the centreline: measured contours where they cover, the estimated proxy elsewhere
    from scipy.interpolate import griddata
    bf = json.load(io.open(SRC['bathy'], encoding='utf-8'))['features']
    pts, vals = [], []
    for f in bf:
        if f['geometry']['type'] != 'LineString' or 'elev_m' not in f['properties']: continue
        for x, y in f['geometry']['coordinates']:
            pts.append((x, y)); vals.append(f['properties']['elev_m'])
    pts = np.array(pts); vals = np.array(vals)
    nbathy = sum(1 for f in bf if f['geometry']['type'] == 'LineString')
    bmeas = griddata(pts, vals, P, method='linear')
    proxy = gx.near('bed_proxy', P[:, 0], P[:, 1]).astype(np.float64)
    proxy[proxy < -9000] = np.nan
    bed_flag = np.isfinite(bmeas).astype(np.float32)
    bed = np.where(np.isfinite(bmeas), bmeas, proxy)
    bed = np.where(np.isfinite(bed), bed, ws - 1.8288) - ws
    log('bed measured at', int(bed_flag.sum()), 'of', n, 'stations; contours', nbathy, 'vertices', len(vals))

    # sections every 10 m: ground or bed across both banks, m above ws(s)
    SS = np.arange(0, LEN + 1e-6, DSEC)
    if quick: SS = SS[::5]
    OFF = np.arange(-SEC_HALF, SEC_HALF + 0.1, SEC_STEP)
    sec = np.zeros((len(SS), len(OFF)), np.float32); secf = np.zeros((len(SS), len(OFF)), np.uint8)
    for i, s in enumerate(SS):
        p = R.interpolate(float(s)); q = R.interpolate(min(float(s) + 3, R.length)); o = R.interpolate(max(float(s) - 3, 0))
        tx, ty = q.x - o.x, q.y - o.y; nn = math.hypot(tx, ty); tx, ty = tx / nn, ty / nn
        xs = p.x - ty * OFF; ys = p.y + tx * OFF
        z, ins = elev(xs, ys)
        wsl = float(gx.lin('ws', [p.x], [p.y])[0])
        wet = g.near(wkey, xs, ys).astype(bool) & ins
        bm = griddata(pts, vals, np.stack([xs, ys], 1), method='linear')
        bp = gx.near('bed_proxy', xs, ys).astype(np.float64); bp[bp < -9000] = np.nan
        bz = np.where(np.isfinite(bm), bm, np.where(np.isfinite(bp), bp, wsl - 1.8288))
        zz = np.where(wet, bz, z)
        sec[i] = np.nan_to_num(zz - wsl, nan=0.0)
        secf[i] = np.where(~ins, 3, np.where(wet, np.where(np.isfinite(bm), 1, 2), 0))
    log('sections', sec.shape)

    # buildings, bridges, landmarks
    base = json.load(io.open(SRC['base'], encoding='utf-8'))['features']
    # P6: the structures layer the footprints came from (same polygons, EPSG:32110) gives each one an id and a primary
    # occupancy; joined by nearest centroid within 2 m
    orn, oc = ornl_index()
    blds = []; cover = []
    for f in base:
        pr = f['properties']
        if pr.get('kind') != 'building': continue
        geo = shape(f['geometry'])
        if geo.geom_type == 'MultiPolygon': geo = max(geo.geoms, key=lambda q: q.area)
        vx = np.array(geo.exterior.coords)
        c = geo.centroid
        prim, bid = ornl_of(orn, oc, c)
        # the coverage record (A2): every footprint, where it projects on the route, and what happened to it
        sp_ = float(R.project(c)); a_ = R.interpolate(max(0, sp_ - 3)); b_ = R.interpolate(min(R.length, sp_ + 3))
        cv = {'id': bid, 'prim': prim, 'area_m2': round(geo.area, 1), 's': round(sp_, 1), 'd_route_m': round(R.distance(c), 1),
              'side': 1 if (b_.x - a_.x) * (c.y - a_.y) - (b_.y - a_.y) * (c.x - a_.x) > 0 else -1, 'kept': False, 'why': ''}
        cover.append(cv)
        ing = bool(g.inside([c.x], [c.y])[0])
        if ing:
            sv = gx.near('s', vx[:, 0], vx[:, 1]).astype(np.float64); sc = float(gx.near('s', [c.x], [c.y])[0])
            side = int(gx.near('side', [c.x], [c.y])[0])
        else:   # outside the 1 m grid: nearest point on the route, wide DEM for the base
            if R.distance(c) > EDGE_MAX + BANDS[-1][1]: cv['why'] = 'more than %d m from the route, off the 1 m grid' % (EDGE_MAX + BANDS[-1][1]); continue
            sc = float(R.project(c)); sv = np.array([sc]); side = 0
        if side == 0:
            sp = R.project(c); a = R.interpolate(max(0, sp - 3)); b = R.interpolate(min(R.length, sp + 3))
            side = 1 if (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0 else -1
            if sc <= 0.5: sc = float(sp)
        if sc <= 0.5 or sc >= LEN - 0.5: cv['why'] = 'upstream of the dam' if sc <= 0.5 else 'past the end of the route'; continue
        wd = math.sqrt(max(geo.area, 1.0))
        # the long side of the footprint (minimum rotated rectangle): a long mill keeps its whole s range
        mr = np.array(geo.minimum_rotated_rectangle.exterior.coords)
        lng = max(math.hypot(*(mr[1] - mr[0])), math.hypot(*(mr[2] - mr[1])))
        s0, s1 = float(sv.min()), float(sv.max())
        if s1 - s0 > max(2 * wd, 1.5 * lng) + 30: s0, s1 = sc - wd / 2, sc + wd / 2       # inside a bend the s of a footprint is ambiguous
        k = int(np.clip(round(sc / DS), 0, len(edge[side]) - 1)) if not quick else int(np.clip(round(sc / (DS * 10)), 0, n - 1))
        d = R.distance(c) - edge[side][k]
        band = int(np.searchsorted([b for _, b in BANDS], max(0.0, d), side='right'))
        zb, _ = elev(vx[:, 0], vx[:, 1])
        wsl = float(gx.lin('ws', [c.x], [c.y])[0])
        occ = pr.get('occ') or 'Other'
        if prim not in PRIM: PRIM.append(prim)
        blds.append([round(max(0.0, s0), 1), round(min(LEN, s1), 1), side, min(band, len(BANDS)), round(float(np.nanmin(zb)) - wsl, 2),
                     round(float(pr.get('height_m') or 6.0), 1), OCC.index(occ) if occ in OCC else len(OCC) - 1, round(max(0.0, d), 1),
                     PRIM.index(prim), bid if bid is not None else -1])
        cv.update(kept=True, s=round(sc, 1), side=side, d_edge_m=round(max(0.0, d), 1), band=min(band, len(BANDS)), s0=blds[-1][0], s1=blds[-1][1])
        cv['why'] = 'drawn' if band <= 3 else 'kept in the pack, not drawn: more than 700 m behind the water edge'
    blds.sort(key=lambda b: (b[0], b[2]))
    log('buildings kept', len(blds), 'of', sum(1 for f in base if f['properties'].get('kind') == 'building'))
    # structures that are points only in the data: dikes from the national dam inventory, at their station
    structures = nid_structures(R, LEN)
    log('structures', structures)
    asm = json.load(io.open(SRC['assembly'], encoding='utf-8'))
    bgeo = [f for f in base if f['properties'].get('kind') == 'bridge']
    bridges = []
    for b in asm['bridges']:
        best, bd = None, 1e9
        for f in bgeo:
            ln = shape(f['geometry']); m = ln.interpolate(0.5, normalized=True)
            sm = float(gx.near('s', [m.x], [m.y])[0])
            nm_ok = f['properties'].get('name') == b['name'] or (b['kind'] == 'rail bridge' and f['properties'].get('type') == 'rail bridge')
            if nm_ok and abs(sm - b['s']) < bd: best, bd = f, abs(sm - b['s'])
        deck = None; span = None
        if best is not None:
            ln = shape(best['geometry']); xy = np.array(ln.coords)
            z, _ = elev(xy[[0, -1], 0], xy[[0, -1], 1])
            wsl = float(gx.lin('ws', xy[[0, -1], 0], xy[[0, -1], 1]).mean())
            deck = round(float(np.nanmax(z)) - wsl, 2)
        ki = int(np.clip(round(b['s'] / (S[1] - S[0])), 0, n - 1))
        span = round(float(edge[1][ki] + edge[-1][ki]), 1)
        bridges.append({'name': b['name'], 'kind': b['kind'], 'river': b['river'], 's': b['s'], 'd': b['d'], 'deck_h': deck, 'span_m': span,
                        'deck_source': 'ground at the two ends of the mapped bridge line, above ws' if deck is not None else 'none',
                        'span_source': 'channel width at s'})
    log('bridges', [(b['name'], b['s'], b['deck_h'], b['span_m']) for b in bridges])
    dam = dict(DAM); dam['label'] = [f['properties']['label'] for f in base if f['properties'].get('kind') == 'dam'][0]
    st = json.load(io.open(SRC['stations'], encoding='utf-8'))['features']
    stations = [{'id': f['properties']['id'], 's0': f['properties']['s0'], 's1': min(f['properties']['s1'], LEN), 'where': f['properties'].get('where', '')} for f in st]
    levels = [{'id': L['id'], 'name': L['name'], 'type': 'local', 'h': L['h']} for L in asm['levels']] + [{'id': L['id'], 'name': L['name'], 'type': 'absolute', 'z': L['z']} for L in LEVELS_ABS]
    lot = {'s0': asm['lot']['s0'], 's1': asm['lot']['s1'], 'side': 1, 'label': [f['properties']['label'] for f in base if f['properties'].get('kind') == 'lot'][0]}

    # arrays, smoothed along s
    A = {}
    A['s'] = S; A['ws'] = tri_smooth(ws); A['bed'] = tri_smooth(bed); A['bed_measured'] = bed_flag
    A['width'] = tri_smooth(edge[1] + edge[-1])
    for sg, nm in ((1, 'L'), (-1, 'R')):
        A['edge_' + nm] = tri_smooth(edge[sg])
        for j in range(len(BANDS)):
            A['band%d_%s' % (j, nm)] = tri_smooth(fill_nan(bands[sg][j]))
            A['mean%d_%s' % (j, nm)] = tri_smooth(fill_nan(bmean[sg][j]))
            A['canopy%d_%s' % (j, nm)] = tri_smooth(fill_nan(canopy[sg][j]))
            A['fine%d_%s' % (j, nm)] = ins_share[sg][j]
        for j in range(len(FAR)):
            A['far%d_%s' % (j, nm)] = tri_smooth(fill_nan(far[sg][j]), SMOOTH_M * 3)
    A['sec_s'] = SS; A['sec_off'] = OFF; A['sec'] = sec; A['sec_flag'] = secf
    pack = {
        'pack': 'nashua-design' if design else 'nashua-existing',
        'version': 1,
        'written': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        'crs': g.meta['crs'], 'units': 'm', 'heights': 'm above the local water surface ws(s), unless named absolute',
        'route_len_m': LEN, 'nashua_len_m': NAS, 'station_step_m': DS if not quick else DS * 10, 'section_step_m': DSEC,
        'side': {'L': '+1, left bank looking downstream (the lot bank)', 'R': '-1, right bank'},
        'smoothing': 'triangular window, 50 m full width, along s, on every skyline, bed, edge and width line; far ridges 150 m',
        'bands_m_from_water_edge': BANDS, 'far_m_from_water_edge': FAR,
        'band_value': 'maximum ground elevation inside the band along the station normal, water cells excluded',
        'canopy': 'share of tree canopy cells (land cover class 2) inside the band along the normal',
        'bed': 'measured depth contours interpolated where they cover the centreline (bed_measured 1), the estimated bed proxy elsewhere (0)',
        'buildings_fields': ['s0', 's1', 'side', 'band', 'base_h', 'height_m', 'occ', 'd_from_edge_m', 'prim', 'id'],
        'occ_codes': OCC, 'prim_codes': PRIM,
        'building_ids': 'id and prim: build_id and primary occupancy of the structures layer the footprints came from (-1: no match)',
        'building_span': 's0 to s1 is the footprint\'s s range, unless it is longer than 1.5 x its long side + 30 m (a bend), then its width about the centroid',
        'structures': structures, 'plan': plan_of(R, LEN),
        'building_heights': 'estimated from footprint area, not surveyed',
        'sources': {
            'terrain': '1 m route grid (existing grade' + (', landform sequence' if design else '') + '), EPSG:32110, from 10 k and 1 k LiDAR DEM cells',
            'far_ridges': 'wide LiDAR DEM 4 m cells (feet, converted), EPSG:32110',
            'canopy': 'land cover 2 m, class 2 tree canopy',
            'bed': '%d measured depth contours (part of the reach) and an estimated bed proxy (0.9 m at the bank, 1.8 m mid-channel, 4.3 m in the last 200 m and the Merrimack)' % nbathy,
            'buildings': 'municipal footprints with occupancy; heights estimated from footprint area',
            'levels': 'local offsets carried upstream from the confluence; absolute FEMA 1% and 1936 lines',
        },
        'levels': levels, 'dam': dam, 'bridges': bridges, 'cso': asm['cso'], 'outfalls': asm['outfalls'], 'lot': lot,
        'stations': stations, 'buildings': blds,
        'landmarks': [{'id': 'dam', 's': 0.0}, {'id': 'confluence', 's': NAS}],
        'counts': {'stations': int(n), 'sections': int(len(SS)), 'buildings': len(blds), 'bridges': len(bridges), 'contours': nbathy,
                   'bed_measured_stations': int(bed_flag.sum())},
        'check': {'left_normal_on_grid_side_plus1': round(agree, 3)},
    }
    if design:
        obs = []
        if 'obs' in g.a:
            sv = g.a['s']; sd = g.a['side']
            for k in range(1, int(g.a['obs'].max()) + 1):
                m = g.a['obs'] == k
                if m.any(): obs.append({'id': k, 's0': round(float(sv[m].min()), 1), 's1': round(float(sv[m].max()), 1), 'side': int(np.sign(np.median(sd[m])))})
        pack['observatories'] = obs
        pack['stations'] = [{**stations[i], 'studies': st[i]['properties'].get('studies', '')} for i in range(len(st))]
        pack['labels'] = {'existing': 'Existing Grade (before landform)', 'design': 'Landform Sequence (after landform)'}
    pack['_coverage'] = cover
    return pack, A, t0


def write(pack, A, out, preview=True):
    os.makedirs(out, exist_ok=True)
    cover = pack.pop('_coverage', None)
    if cover is not None:   # every footprint and what happened to it (A2), next to the pack, not in it
        io.open(os.path.join(out, 'coverage.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps({'footprints': cover}, ensure_ascii=False, indent=0))
    index, blobs, off = [], [], 0
    for k, v in A.items():
        v = np.asarray(v)
        dt = 'u1' if v.dtype == np.uint8 else 'f4'
        b = np.ascontiguousarray(v.astype('<' + dt if dt == 'f4' else dt)).tobytes()
        pad = (-len(b)) % 4
        index.append({'name': k, 'dtype': 'uint8' if dt == 'u1' else 'float32', 'shape': list(v.shape), 'offset': off, 'bytes': len(b)})
        blobs.append(b + b'\0' * pad); off += len(b) + pad
    binb = b''.join(blobs)
    pack['index'] = index
    pack['bin'] = {'file': 'pack.bin', 'bytes': len(binb)}
    body = json.dumps({k: v for k, v in pack.items() if k not in ('written', 'hash')}, sort_keys=True, separators=(',', ':'))
    pack['hash'] = hashlib.sha256(binb + body.encode('utf-8')).hexdigest()[:16]
    io.open(os.path.join(out, 'pack.bin'), 'wb').write(binb)
    io.open(os.path.join(out, 'pack.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(pack, ensure_ascii=False, separators=(',', ':')))
    log('wrote', out, 'bin', len(binb), 'bytes, hash', pack['hash'])
    if preview: plot(pack, A, os.path.join(out, 'pack_preview.png'))


# preview labels (build-reach.py sets its own)
PLOT = {'L': 'side +1 left bank (lot bank)', 'R': 'side -1 right bank', 'x': 's, m along the route (dam 0, confluence %.1f)', 'marks': True}


def plot(pack, A, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    s = A['s']
    fig, axs = plt.subplots(2, 1, figsize=(24, 10), sharex=True, dpi=100)
    tones = ['#07090e', '#3e466b', '#8b8ba3', '#b0b0c1']
    for ax, nm, title in ((axs[0], 'L', PLOT['L']), (axs[1], 'R', PLOT['R'])):
        for j in range(2):
            ax.plot(s, A['far%d_%s' % (j, nm)], color='#dddee4' if j else '#c4c6ca', lw=1.2, label='far %d' % j)
        for j in range(len(BANDS) - 1, -1, -1):
            ax.plot(s, A['band%d_%s' % (j, nm)], color=tones[j], lw=1.6 - 0.2 * j, label='band %d %d to %d m' % (j, *BANDS[j]))
        ax.plot(s, A['bed'], color='#2E4A8C', lw=1.4, label='bed (centreline)')
        ax.fill_between(s, A['bed'], -6, where=A['bed_measured'] > 0.5, color='#9FC8F0', alpha=0.5, label='bed measured')
        ax.axhline(0, color='#2E4A8C', lw=0.8)
        for b in pack['buildings']:
            if b[2] == (1 if nm == 'L' else -1):
                ax.add_patch(plt.Rectangle((b[0], b[4]), max(1.0, b[1] - b[0]), b[5], color='#4a4f59', alpha=0.25, lw=0))
        for br in pack['bridges']:
            ax.axvline(br['s'], color='#07090e', lw=0.8, ls='--')
            ax.text(br['s'], ax.get_ylim()[1] if False else 70, br['name'], rotation=90, fontsize=8, va='top')
        if PLOT['marks']: ax.axvline(0, color='#07090e', lw=1.2); ax.axvline(pack['nashua_len_m'], color='#2E4A8C', lw=1.2)
        ax.set_ylim(-8, 75); ax.set_ylabel('m above ws(s)'); ax.set_title(title, loc='left', fontsize=11)
        ax.legend(loc='upper right', fontsize=8, ncol=4)
    axs[1].set_xlabel(PLOT['x'] % pack['nashua_len_m'] if '%' in PLOT['x'] else PLOT['x'])
    fig.tight_layout()
    fig.savefig(path, metadata={'Software': None})
    plt.close(fig)
    log('preview', path)


if __name__ == '__main__':
    design = '--design' in sys.argv
    quick = '--quick' in sys.argv
    pack, A, t0 = build(design=design, quick=quick)
    out = OUT_DES if design else OUT_PUB
    if quick: out = os.path.join(ROOT, 'data', 'local', 'nashua', 'quick')
    write(pack, A, out, preview=not design)
    log('done in %.1f s' % (time.time() - t0))
