# -*- coding: utf-8 -*-
"""build-reach.py : a second river reach for the nashua world, from the wide sources only (P5.5).

The first reach (build-pack.py) stands on a 1 m route grid made for that site. This one has no such grid: it proves the
pack format works from the general layers alone, so it writes the same arrays from
  land cover 2 m (class 1 water, class 2 tree canopy)  the water edge, the centreline, the canopy
  wide DEM 4 m                                          ground, ridges, the water surface
  municipal footprints and bridge lines                 buildings and bridges, where the layer reaches
and declares what it cannot know: no measured bed (the estimated proxy), no dam, CSOs or outfalls on this reach, and the
named levels carried unchanged from the confluence.

Reach: the Merrimack below the Bridge St crossing, downstream to the south edge of the sources. s runs downstream.
Writes data/nashua/merrimack/pack.json, pack.bin, pack_preview.png. No source file name enters the pack.
  python tools/nashua/build-reach.py [--quick]
No em dashes.
"""
import os, io, sys, json, math, time, datetime, importlib.util
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('build_pack', os.path.join(HERE, 'build-pack.py'))
bp = importlib.util.module_from_spec(spec); spec.loader.exec_module(bp)
log, tri_smooth, fill_nan, Raster, write = bp.log, bp.tri_smooth, bp.fill_nan, bp.Raster, bp.write
DS, DSEC, SEC_HALF, SEC_STEP, EDGE_MAX, BANDS, FAR, OCC, SMOOTH_M, SRC, ROOT = bp.DS, bp.DSEC, bp.SEC_HALF, bp.SEC_STEP, bp.EDGE_MAX, bp.BANDS, bp.FAR, bp.OCC, bp.SMOOTH_M, bp.SRC, bp.ROOT
OUT = os.path.join(ROOT, 'data', 'nashua', 'merrimack')
bp.PLOT.update({'L': 'side +1 left bank (looking downstream)', 'R': 'side -1 right bank', 'x': 's, m along the Merrimack below the Bridge St crossing (bed: estimated proxy only)', 'marks': False})

Y_TOP = 29270.0          # just below the Bridge St crossing, where the first reach ends
Y_BOTTOM = 24470.0       # the south edge of the land cover, less a margin
X_MIN, X_MAX = 318000.0, 319400.0
SEED = (318650.0, 27000.0)
BED_BANK, BED_MID, BED_RAMP = 0.9, 4.3, 40.0   # the first reach's estimated bed proxy for the Merrimack, m


def centreline(lc):
    """the medial path of the river from the top of the window to the bottom, on the 2 m land cover"""
    from scipy import ndimage as ni
    from skimage.graph import route_through_array
    inv = ~lc.t
    c0, r0 = [int(v) for v in inv * (X_MIN, Y_TOP)]
    c1, r1 = [int(v) for v in inv * (X_MAX, Y_BOTTOM)]
    W = lc.v[r0:r1, c0:c1] == 1
    # bridges and shadows break the water class: close gaps up to 60 m, keep the piece holding the seed
    Wc = ni.binary_closing(np.pad(W, 20), iterations=15)[20:-20, 20:-20] | W
    lab, n = ni.label(Wc)
    sc, sr = [int(v) for v in inv * SEED]
    sr -= r0; sc -= c0
    d = ni.distance_transform_edt(Wc)
    win = d[max(0, sr - 100):sr + 100, max(0, sc - 200):sc + 200]
    k = np.unravel_index(int(np.argmax(win)), win.shape)
    piece = lab[max(0, sr - 100) + k[0], max(0, sc - 200) + k[1]]
    M = lab == piece
    d = ni.distance_transform_edt(M)
    log('river piece', int(M.sum()) * 4 / 1e4, 'ha; widest', round(float(d.max()) * 4, 1), 'm')
    rows = np.where(M.any(1))[0]
    top, bot = rows.min() + 5, rows.max() - 5
    a = (top, int(np.argmax(d[top]))); b = (bot, int(np.argmax(d[bot])))
    cost = np.where(M, 1.0 / (d + 0.5) ** 2, 1e6)
    path, _ = route_through_array(cost, a, b, fully_connected=True, geometric=True)
    path = np.array(path, np.float64)
    xs, ys = lc.t * (path[:, 1] + c0 + 0.5, path[:, 0] + r0 + 0.5)
    pts = np.stack([xs, ys], 1)
    # smooth (200 m window) and thin to every 20 m, ends kept
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    u = np.arange(0, seg[-1], 5.0)
    P = np.stack([np.interp(u, seg, pts[:, 0]), np.interp(u, seg, pts[:, 1])], 1)
    h = 20; k = np.ones(2 * h + 1) / (2 * h + 1)
    S = np.stack([np.convolve(np.pad(P[:, i], h, mode='edge'), k, 'valid') for i in (0, 1)], 1)
    return S[::4], (M, r0, c0)


def build(quick=False):
    t0 = time.time()
    from shapely.geometry import shape, LineString
    wide = Raster(SRC['dem_wide_ft'], bp.FT)
    lc = Raster(SRC['landcover'])
    line, (M, r0, c0) = centreline(lc)
    R = LineString(line.tolist())
    LEN = math.floor(R.length / DS) * DS
    log('centreline', round(R.length, 1), 'm, used', LEN, 'from', [round(v) for v in line[0]], 'to', [round(v) for v in line[-1]])
    S = np.arange(0, LEN + 1e-6, DS)
    if quick: S = S[::10]
    n = len(S)
    inv = ~lc.t
    H, Wd = lc.v.shape

    def water(xs, ys):
        """the closed river inside the window, the land cover's water class outside it"""
        c, r = inv * (np.asarray(xs), np.asarray(ys))
        r = np.clip(np.floor(r).astype(int), 0, H - 1); c = np.clip(np.floor(c).astype(int), 0, Wd - 1)
        out = lc.v[r, c] == 1
        rr, cc = r - r0, c - c0
        ins = (rr >= 0) & (cc >= 0) & (rr < M.shape[0]) & (cc < M.shape[1])
        out[ins] |= M[rr[ins], cc[ins]]
        return out

    pt = lambda s: R.interpolate(float(min(max(s, 0.0), R.length)))
    P = np.array([[pt(s).x, pt(s).y] for s in S])
    T = np.array([[pt(s + 3).x - pt(s - 3).x, pt(s + 3).y - pt(s - 3).y] for s in S]); T /= np.linalg.norm(T, axis=1)[:, None]
    NL = np.stack([-T[:, 1], T[:, 0]], 1)            # left of downstream
    # the water surface: the DEM along the centreline (hydro-flattened), median over 400 m, never rising downstream
    raw = wide.sample(P[:, 0], P[:, 1])
    step = S[1] - S[0]; h = max(1, int(200 / step))
    med = np.array([np.nanmedian(raw[max(0, i - h):i + h + 1]) for i in range(n)])
    ws = np.minimum.accumulate(fill_nan(med))
    log('ws', round(float(ws[0]), 2), 'to', round(float(ws[-1]), 2))
    TT = np.arange(0, EDGE_MAX + 0.5, 1.0)
    edge, bands, bmean, canopy, far = {}, {}, {}, {}, {}
    for sg in (1, -1):
        e = np.full(n, np.nan)
        for i in range(n):
            w = water(P[i, 0] + NL[i, 0] * TT * sg, P[i, 1] + NL[i, 1] * TT * sg)
            run = np.convolve((~w).astype(int), np.ones(4, int), 'valid') == 4
            k = np.nonzero(run)[0]
            e[i] = TT[k[0]] if len(k) else EDGE_MAX
        edge[sg] = e
        B = np.full((len(BANDS), n), np.nan); Mn = np.full((len(BANDS), n), np.nan); C = np.full((len(BANDS), n), np.nan)
        for j, (a, b) in enumerate(BANDS):
            D = np.arange(a, b, 2.0) + 1.0
            for i in range(n):
                dd = e[i] + D
                xs = P[i, 0] + NL[i, 0] * dd * sg; ys = P[i, 1] + NL[i, 1] * dd * sg
                z = wide.sample(xs, ys)
                wet = water(xs, ys)
                z = np.where(wet, np.nan, z)
                if np.isfinite(z).any():
                    B[j, i] = np.nanmax(z) - ws[i]; Mn[j, i] = np.nanmedian(z) - ws[i]
                cv = lc.sample(xs, ys, order=0)
                okc = np.isfinite(cv) & ~wet & (cv > 0)
                C[j, i] = float(np.mean(cv[okc] == 2)) if okc.any() else np.nan
        F = np.full((len(FAR), n), np.nan)
        for j, (a, b) in enumerate(FAR):
            D = np.arange(a, b, 8.0) + 4.0
            for i in range(n):
                dd = e[i] + D
                z = wide.sample(P[i, 0] + NL[i, 0] * dd * sg, P[i, 1] + NL[i, 1] * dd * sg)
                if np.isfinite(z).any(): F[j, i] = np.nanmax(z) - ws[i]
        bands[sg], bmean[sg], canopy[sg], far[sg] = B, Mn, C, F
        log('side', sg, 'edge min/med/max', np.nanmin(e), np.nanmedian(e), np.nanmax(e), 'bands max', np.round(np.nanmax(B, 1), 1), 'far max', np.round(np.nanmax(F, 1), 1))

    # sections: ground from the DEM, the bed the estimated proxy (deepening from the bank to mid-channel)
    SS = np.arange(0, LEN + 1e-6, DSEC)
    if quick: SS = SS[::5]
    OFF = np.arange(-SEC_HALF, SEC_HALF + 0.1, SEC_STEP)
    sec = np.zeros((len(SS), len(OFF)), np.float32); secf = np.zeros((len(SS), len(OFF)), np.uint8)
    for i, s in enumerate(SS):
        p, q, o = pt(s), pt(s + 3), pt(s - 3)
        tx, ty = q.x - o.x, q.y - o.y; nn = math.hypot(tx, ty); tx, ty = tx / nn, ty / nn
        xs = p.x - ty * OFF; ys = p.y + tx * OFF
        k = int(np.clip(round(s / step), 0, n - 1))
        wsl = float(ws[k])
        z = wide.sample(xs, ys)
        wet = water(xs, ys)
        to_edge = np.where(OFF >= 0, edge[1][k] - OFF, edge[-1][k] + OFF)     # m to the bank on that side
        bz = wsl - (BED_BANK + (BED_MID - BED_BANK) * np.clip(to_edge / BED_RAMP, 0, 1))
        sec[i] = np.nan_to_num(np.where(wet, bz, z) - wsl, nan=0.0)
        secf[i] = np.where(wet, 2, 3)
    log('sections', sec.shape)

    # buildings and bridges where the layer reaches
    base = json.load(io.open(SRC['base'], encoding='utf-8'))['features']
    blds = []
    for f in base:
        pr = f['properties']
        if pr.get('kind') != 'building': continue
        geo = shape(f['geometry'])
        if geo.geom_type == 'MultiPolygon': geo = max(geo.geoms, key=lambda g: g.area)
        c = geo.centroid
        if R.distance(c) > EDGE_MAX + BANDS[-1][1]: continue
        sc = float(R.project(c))
        if sc <= 0.5 or sc >= LEN - 0.5: continue
        a, b = pt(sc - 3), pt(sc + 3)
        side = 1 if (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0 else -1
        wd = math.sqrt(max(geo.area, 1.0))
        k = int(np.clip(round(sc / step), 0, n - 1))
        d = R.distance(c) - edge[side][k]
        band = int(np.searchsorted([q for _, q in BANDS], max(0.0, d), side='right'))
        vx = np.array(geo.exterior.coords)
        zb = wide.sample(vx[:, 0], vx[:, 1])
        occ = pr.get('occ') or 'Other'
        blds.append([round(max(0.0, sc - wd / 2), 1), round(min(LEN, sc + wd / 2), 1), side, min(band, len(BANDS)), round(float(np.nanmin(zb)) - float(ws[k]), 2),
                     round(float(pr.get('height_m') or 6.0), 1), OCC.index(occ) if occ in OCC else len(OCC) - 1, round(max(0.0, d), 1)])
    blds.sort(key=lambda b: (b[0], b[2]))
    log('buildings kept', len(blds))
    bridges = []
    for f in base:
        if f['properties'].get('kind') != 'bridge': continue
        ln = shape(f['geometry'])
        if not ln.intersects(R): continue
        x = ln.intersection(R); x = x if x.geom_type == 'Point' else x.centroid
        sb = float(R.project(x))
        if sb <= 1 or sb >= LEN - 1: continue
        xy = np.array(ln.coords); k = int(np.clip(round(sb / step), 0, n - 1))
        z = wide.sample(xy[[0, -1], 0], xy[[0, -1], 1])
        typ = f['properties'].get('type') or 'road bridge'
        bridges.append({'name': f['properties'].get('name') or typ, 'kind': 'rail bridge' if 'rail' in typ else 'road bridge', 'river': 'Merrimack River', 's': round(sb, 1), 'd': 0,
                        'deck_h': round(float(np.nanmax(z)) - float(ws[k]), 2), 'span_m': round(float(edge[1][k] + edge[-1][k]), 1),
                        'deck_source': 'ground at the two ends of the mapped bridge line, above ws', 'span_source': 'channel width at s'})
    log('bridges', [(b['name'], b['s'], b['deck_h'], b['span_m']) for b in bridges])
    first = json.load(io.open(os.path.join(bp.OUT_PUB, 'pack.json'), encoding='utf-8'))

    A = {'s': S, 'ws': tri_smooth(ws, step=step), 'bed': np.full(n, -BED_MID), 'bed_measured': np.zeros(n, np.float32)}
    A['width'] = tri_smooth(edge[1] + edge[-1], step=step)
    for sg, nm in ((1, 'L'), (-1, 'R')):
        A['edge_' + nm] = tri_smooth(edge[sg], step=step)
        for j in range(len(BANDS)):
            A['band%d_%s' % (j, nm)] = tri_smooth(fill_nan(bands[sg][j]), step=step)
            A['mean%d_%s' % (j, nm)] = tri_smooth(fill_nan(bmean[sg][j]), step=step)
            A['canopy%d_%s' % (j, nm)] = tri_smooth(fill_nan(canopy[sg][j]), step=step)
            A['fine%d_%s' % (j, nm)] = np.zeros(n, np.float32)
        for j in range(len(FAR)):
            A['far%d_%s' % (j, nm)] = tri_smooth(fill_nan(far[sg][j]), SMOOTH_M * 3, step=step)
    A['sec_s'] = SS; A['sec_off'] = OFF; A['sec'] = sec; A['sec_flag'] = secf
    pack = {
        'pack': 'nashua-merrimack', 'version': 1, 'written': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        'crs': first['crs'], 'units': 'm', 'heights': first['heights'],
        'route_len_m': float(LEN), 'nashua_len_m': None, 'station_step_m': float(step), 'section_step_m': DSEC if not quick else DSEC * 5,   # nashua_len_m: no confluence inside this reach
        'side': {'L': '+1, left bank looking downstream', 'R': '-1, right bank'},
        'smoothing': first['smoothing'], 'bands_m_from_water_edge': BANDS, 'far_m_from_water_edge': FAR,
        'band_value': first['band_value'], 'canopy': first['canopy'],
        'bed': 'no measurements on this reach: the estimated proxy (0.9 m at the bank to 4.3 m mid-channel)',
        'buildings_fields': first['buildings_fields'], 'occ_codes': OCC, 'building_heights': first['building_heights'],
        'sources': {
            'centreline': 'medial path of the land cover water class, smoothed over 200 m',
            'terrain': 'wide LiDAR DEM 4 m cells (feet, converted), EPSG:32110',
            'water_surface': 'the DEM along the centreline, median over 400 m, never rising downstream',
            'canopy': 'land cover 2 m, class 2 tree canopy', 'bed': 'estimated proxy, nothing measured here',
            'buildings': first['sources']['buildings'],
            'levels': 'carried unchanged from the confluence; no values specific to this reach',
        },
        'fact_note': 'levels carried from the confluence',
        'levels': first['levels'], 'dam': None, 'bridges': bridges, 'cso': [], 'outfalls': [], 'lot': None, 'stations': [],
        'buildings': blds, 'landmarks': [],
        'counts': {'stations': int(n), 'sections': int(len(SS)), 'buildings': len(blds), 'bridges': len(bridges), 'contours': 0, 'bed_measured_stations': 0},
        'check': {'ws_start_m': round(float(ws[0]), 2), 'ws_end_m': round(float(ws[-1]), 2), 'edge_median_m': round(float(np.nanmedian(edge[1] + edge[-1])), 1)},
    }
    return pack, A, t0


if __name__ == '__main__':
    quick = '--quick' in sys.argv
    pack, A, t0 = build(quick=quick)
    out = os.path.join(ROOT, 'data', 'local', 'nashua', 'merrimack-quick') if quick else OUT
    write(pack, A, out, preview=True)
    log('done in %.1f s' % (time.time() - t0))
