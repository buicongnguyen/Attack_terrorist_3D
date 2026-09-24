"""Kestrel Response Unit vehicles: gunboat Marlin, rescue helicopter, strike bomber,
relief barge Harbor Mercy.

Friendly language: sky-blue hulls, warm-white cabins, sunflower roofs/stripes,
navy trim, cyan glass. Forward is Blender +Y; vehicles sit on z=0 (waterline),
aircraft are centred on their centre of mass.
"""
import math

from assets_people import crew
from style import superellipse


def _lerp(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------ shared helpers
def body_ring(w, h, zc, count=16, n=2.4, t0=0.0, t1=None, grow=1.0, bottom=None, nb=None):
    """Points of a superellipse section (x, z) from angle t0 to t1 (radians)."""
    t1 = math.tau if t1 is None else t1
    pts = []
    closed = abs(t1 - t0 - math.tau) < 1e-6
    steps = count if closed else count
    for i in range(steps + (0 if closed else 1)):
        t = t0 + (t1 - t0) * i / steps
        c, s = math.cos(t), math.sin(t)
        ee = n if (s >= 0 or nb is None) else nb
        hh = h if (s >= 0 or bottom is None) else bottom
        x = w * grow * math.copysign(abs(c) ** (2 / ee), c)
        z = zc + hh * grow * math.copysign(abs(s) ** (2 / ee), s)
        pts.append((x, z))
    return pts


def loft_body(k, stations, mat, t0=0.0, t1=None, count=16, grow=1.0, parent=None, cap=(True, True), n=2.4,
              nb=None):
    """stations: (y, w, h, zc[, bottom]) ; returns nothing. Open arcs when t0/t1 given."""
    closed = t1 is None
    secs = []
    for st in stations:
        y, w, h, zc = st[:4]
        bottom = st[4] if len(st) > 4 else None
        if w < 1e-4:
            pts = [(0, zc)] * (count if closed else count + 1)
        else:
            pts = body_ring(w, h, zc, count, n, t0, t1, grow, bottom, nb)
        secs.append((y, pts))
    rings = [[(x, y, z) for x, z in pts] for y, pts in secs]
    k.skin(rings, mat, parent, cap[0], cap[1], closed=closed, wexp=1.0)


def interp_station(stations, y):
    stations = sorted(stations, key=lambda s: s[0])
    for a, b in zip(stations, stations[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(_lerp(p, q, t) for p, q in zip(a, b))
    return stations[0] if y < stations[0][0] else stations[-1]


def band(k, stations, y0, y1, mat, grow=1.02, steps=3, count=16, parent=None, n=2.4, nb=None):
    """A full ring band (livery stripe) hugging a lofted body between y0 and y1."""
    secs = [interp_station(stations, _lerp(y0, y1, i / steps)) for i in range(steps + 1)]
    rings = []
    for st in secs:
        y, w, h, zc = st[:4]
        bottom = st[4] if len(st) > 4 else None
        rings.append([(x, y, z) for x, z in body_ring(w, h, zc, count, n, 0, None, grow, bottom, nb)])
    k.skin(rings, mat, parent, False, False, wexp=1.0)


def wing(k, x0, x1, y, chord0, chord1, thick0, thick1, z0, z1, mat, sweep=0.0, stations=4, count=12,
         parent=None, t0=0.0, t1=None, grow=1.0):
    """Wing/stabiliser along X from x0 to x1 made of rounded airfoil rings (YZ)."""
    rings = []
    for i in range(stations + 1):
        t = i / stations
        x = _lerp(x0, x1, t)
        c = _lerp(chord0, chord1, t)
        th = _lerp(thick0, thick1, t)
        z = _lerp(z0, z1, t)
        yy = y - sweep * t
        pts = body_ring(c / 2, th / 2, 0, count, 2.6, t0, t1, grow)
        rings.append([(x, yy + px, z + pz) for px, pz in pts])
    if x1 < x0:
        rings = [list(reversed(r)) for r in rings]
    closed = t1 is None
    k.skin(rings, mat, parent, True, True, closed=closed, wexp=1.0)


def blade(k, center, length, chord, thick, angle, mat, parent=None, axis='Z', twist=0.0, r0=0.0):
    """Rotor/propeller blade from radius r0 to r0+length at `angle` degrees."""
    if axis == 'Z':  # rotor spinning about Z: blade in the XY plane
        a = math.radians(angle)
        mid = r0 + length / 2
        loc = (center[0] + math.cos(a) * mid, center[1] + math.sin(a) * mid, center[2])
        k.box(loc, (length, chord, thick), mat, min(thick * .45, .05), 2, rot=(twist, 0, angle), parent=parent)
    elif axis == 'Y':  # propeller spinning about Y: blade in the XZ plane
        a = math.radians(angle)
        mid = r0 + length / 2
        loc = (center[0] + math.cos(a) * mid, center[1], center[2] + math.sin(a) * mid)
        k.box(loc, (length, thick, chord), mat, min(thick * .45, .05), 2, rot=(0, -angle, 0), parent=parent)
    else:  # axis X: tail rotor, blade in the YZ plane
        a = math.radians(angle)
        mid = r0 + length / 2
        loc = (center[0], center[1] + math.cos(a) * mid, center[2] + math.sin(a) * mid)
        k.box(loc, (thick, length, chord), mat, min(thick * .45, .04), 2, rot=(angle, 0, 0), parent=parent)


# ------------------------------------------------------------------ gunboat Marlin
HULL = [  # y, half-width, deck z, keel z, chine z
    (-2.42, .9, .6, -.1, .12),
    (-2.0, 1.0, .58, -.22, .06),
    (-1.0, 1.05, .56, -.3, .02),
    (.3, 1.05, .58, -.32, .02),
    (1.2, .98, .64, -.28, .06),
    (1.8, .8, .72, -.2, .12),
    (2.2, .5, .8, -.05, .25),
    (2.45, .14, .86, .22, .5),
]


def hull_section(w, top, keel, chine, grow=0.0):
    """Closed hull ring (x, z): V bottom, flared sides, flat deck."""
    g = grow
    right = [(w * .28 + g, keel + (chine - keel) * .45 - g * .3), (w * .7 + g, chine - g * .2),
             (w * .93 + g, chine + (top - chine) * .35), (w + g, chine + (top - chine) * .75),
             (w * .985 + g, top + g * .5)]
    pts = [(0, keel - g)] + right + [(w * .5, top + .015 + g * .5), (0, top + .02 + g * .5)]
    pts += [(-x, z) for x, z in reversed(pts[1:-1])]
    return pts


def hull_x(st, z):
    """Half-width of the hull side at height z (for stripes and fenders)."""
    y, w, top, keel, chine = st
    prof = [(chine, w * .7), (chine + (top - chine) * .35, w * .93), (chine + (top - chine) * .75, w),
            (top, w * .985)]
    if z <= prof[0][0]:
        return prof[0][1]
    for (za, xa), (zb, xb) in zip(prof, prof[1:]):
        if za <= z <= zb:
            return _lerp(xa, xb, (z - za) / max(zb - za, 1e-6))
    return prof[-1][1]


def side_strip(k, stations, z0, z1, mat, side, out=.018, y_range=None, parent=None):
    rings = []
    for st in stations:
        y = st[0]
        if y_range and not (y_range[0] <= y <= y_range[1]):
            continue
        top = st[2]
        za, zb = min(z0, top - .02), min(z1, top - .005)
        if zb - za < .02:
            continue
        pts = [(side * (hull_x(st, z) + out), y, z) for z in (za, (za + zb) / 2, zb)]
        rings.append(pts)
    if len(rings) >= 2:
        k.skin(rings, mat, parent, False, False, closed=False)


def boat(k):
    # hull, deck plate, fender
    rings = [[(x, st[0], z) for x, z in hull_section(st[1], st[2], st[3], st[4])] for st in HULL]
    k.skin(rings, 'sky', None, True, True, wexp=1.0)
    for side in (-1, 1):
        side_strip(k, HULL[:-1], .2, .36, 'sun', side, .012)
        side_strip(k, HULL[:-1], .0, .13, 'navy', side, .01)
    deck = []
    for st in HULL[:-1]:
        y, w, top = st[0], st[1] * .985 - .16, st[2] + .02
        deck.append([(x, y, z) for x, z in ((-w, top), (w, top), (w, top + .05), (-w, top + .05))])
    k.skin(deck, 'cream', None, True, True, wexp=1.0)
    fender = [(hull_x(st, st[2] - .02) + .035, st[0], st[2] - .02) for st in HULL[:-1]]
    k.sweep([(-x, y, z) for x, y, z in fender] + [(0, 2.46, .84)] + list(reversed(fender)), .075, 'navy', 8)
    k.sweep([(-.86, -2.44, .58), (.86, -2.44, .58)], .07, 'navy', 8)
    # bow chevron and deck hatch
    k.prism([(-.42, 1.55), (0, 2.05), (.42, 1.55), (.42, 1.35), (0, 1.8), (-.42, 1.35)], .03, 'sun',
            loc=(0, 0, .515), axis='Z', bevel=.01, rot=(9, 0, 0))
    k.box((0, -2.0, .64), (.9, .4, .05), 'sky', .02, 1)
    # cabin
    k.tbox((0, -.7, .98), (1.2, 1.05), (1.34, 1.3), .78, 'white', .12, 2, shift=(0, -.08))
    k.tbox((0, -.741, 1.14), (1.244, 1.106), (1.298, 1.202), .3, 'glass_dark', .06, 2, shift=(0, -.031))
    k.box((0, -.72, 1.42), (1.5, 1.52, .15), 'sun', .07, 2)
    k.box((0, -.02, 1.43), (1.2, .08, .1), 'navy', .03, 1)
    k.box((0, -.72, .64), (1.44, 1.4, .06), 'navy', .03, 1)
    for side in (-1, 1):
        k.torus((side * .69, -1.05, .95), .16, .055, 'orange', 'X', 16, 6)
        k.box((side * .7, -.3, .8), (.04, .3, .3), 'navy', .02, 1)
    # roof gear: mast, lamps, radar pivot, support rack
    k.rod((-.6, -1.4, 1.5), (-.6, -1.4, 2.05), .04, 'navy', 8)
    k.sphere((-.6, -1.4, 2.08), .075, 'lamp', 8, 5)
    k.cyl((-.3, -.3, 1.55), .11, .12, 'navy', 'Y', 12, .03, rot=(0, 0, 0))
    k.cyl((-.3, -.23, 1.55), .08, .03, 'lamp', 'Y', 12)
    radar = k.joint('Radar', (-.3, -1.05, 1.5))
    k.cyl((-.3, -1.05, 1.56), .06, .12, 'navy', 'Z', 8)
    k.box((-.3, -1.05, 1.69), (.72, .14, .1), 'white', .045, 2, parent=radar)
    k.box((-.3, -.985, 1.69), (.6, .02, .05), 'navy', .01, 1, parent=radar)
    rack = k.joint('SupportRack', (.5, -.9, 1.58))
    k.box((.5, -.95, 1.6), (.36, .72, .12), 'navy', .04, 2, parent=rack)
    for x in (.41, .59):
        k.lathe([(0, -.36), (.065, -.34), (.065, .18), (.04, .28), (0, .33)], 'white', (x, -.92, 1.72), 'Y', 8,
                parent=rack)
        k.cyl((x, -1.2, 1.72), .045, .08, 'sun', 'Y', 8, parent=rack)
        k.box((x, -1.22, 1.72), (.2, .08, .03), 'sun', .01, 1, parent=rack)
    # turret on the foredeck
    k.cyl((0, .9, .67), .5, .12, 'navy', 'Z', 20, .04)
    turret = k.joint('Turret', (0, .9, .72))
    k.lathe([(0, .72), (.47, .72), (.5, .8), (.46, .98), (.34, 1.1), (0, 1.14)], 'sky', (0, .9, 0), parent=turret, verts=20)
    k.torus((0, .9, .79), .5, .045, 'sun', 'Z', 20, 6, parent=turret)
    k.box((0, 1.28, .93), (.72, .16, .34), 'navy', .07, 2, parent=turret)
    single = k.joint('SingleGun', (0, 1.3, .94), turret)
    k.cyl((0, 1.46, .94), .13, .3, 'navy', 'Y', 12, .03, parent=single)
    k.rod((0, 1.55, .94), (0, 2.02, .94), .075, 'gunmetal', 10, parent=single)
    k.cyl((0, 2.04, .94), .11, .16, 'gunmetal', 'Y', 10, .025, parent=single)
    k.cyl((0, 1.8, .94), .09, .05, 'sun', 'Y', 10, parent=single)
    k.joint('Muzzle', (0, 2.14, .94), single)
    for side, name in ((-1, 'L'), (1, 'R')):
        g = k.joint('TwinGun' + name, (side * .3, 1.28, .9), turret)
        k.cyl((side * .3, 1.4, .9), .1, .26, 'navy', 'Y', 10, .025, parent=g)
        k.rod((side * .3, 1.5, .9), (side * .3, 1.86, .9), .06, 'gunmetal', 8, parent=g)
        k.cyl((side * .3, 1.88, .9), .085, .12, 'sun', 'Y', 10, .02, parent=g)
        k.joint('Muzzle' + name, (side * .3, 1.96, .9), g)
    # twin outboards at the transom
    for side in (-1, 1):
        x = side * .45
        k.box((x, -2.62, .62), (.36, .42, .44), 'white', .12, 2)
        k.box((x, -2.62, .74), (.37, .43, .1), 'navy', .04, 1)
        k.box((x, -2.6, .2), (.12, .2, .6), 'navy', .05, 1)
        k.box((x, -2.62, .5), (.38, .06, .06), 'sun', .02, 1)
    # helmsman on the aft deck
    crew(k, (-.35, -1.75, .62), s=.62)


# ------------------------------------------------------------------ rescue helicopter
HELI = [  # y, half-width, upper half-height, zc, lower half-height
    (2.02, 0, 0, -.12, 0),
    (1.9, .38, .34, -.12, .34),
    (1.55, .76, .64, -.06, .66),
    (1.0, .98, .86, 0, .8),
    (.2, 1.0, .92, .05, .82),
    (-.6, .94, .88, .1, .74),
    (-1.25, .62, .6, .22, .5),
    (-1.6, .36, .36, .3, .3),
]


def helicopter(k):
    # two-tone fuselage: sky top, white belly, sunflower cheat line
    loft_body(k, HELI, 'sky', 0, math.pi, 16, cap=(False, False), n=2.3)
    loft_body(k, HELI, 'white', math.pi, math.tau, 16, cap=(False, False), n=2.3)
    for side in (-1, 1):
        rings = []
        for st in HELI[1:-1]:
            y, w, h, zc, b = st
            rings.append([(x, y, z) for x, z in body_ring(w, h, zc, 4, 2.3,
                                                          (.34 if side > 0 else math.pi - .62),
                                                          (.62 if side > 0 else math.pi - .34), 1.014, b)])
        k.skin(rings, 'sun', None, False, False, closed=False)
    # canopy bubble and frame
    k.sphere((0, 1.12, .18), (.84, .95, .7), 'glass', 20, 10)
    k.torus((0, .95, .2), .78, .05, 'navy', 'Y', 24, 6, scale=(1, .95, .95), rot=(-8, 0, 0))
    k.box((0, 1.45, .55), (.07, .7, .07), 'navy', .03, 1, rot=(-35, 0, 0))
    k.box((.35, 1.5, .5), (.3, .08, .03), 'white', .012, 1, rot=(-30, 0, -10))
    # tail boom, fin, stabiliser, mint rescue band
    k.lathe([(0, -1.2), (.36, -1.3), (.3, -2.2), (.21, -3.4), (.16, -4.05), (.12, -4.2), (0, -4.22)], 'sky',
            (0, 0, .2), 'Y', 12, rot=(-4.5, 0, 0))
    k.lathe([(.3, -2.0), (.33, -2.05), (.33, -2.45), (.3, -2.5)], 'mint', (0, 0, .2), 'Y', 12,
            rot=(-4.5, 0, 0))
    k.prism([(-3.55, .5), (-4.1, .45), (-4.35, 1.35), (-4.05, 1.4), (-3.7, .8)], .16, 'sky', bevel=.05)
    k.prism([(-4.13, 1.08), (-4.33, 1.1), (-4.36, 1.36), (-4.05, 1.41), (-3.95, 1.25)], .175, 'sun',
            bevel=.04)
    wing(k, -.1, -1.35, -3.3, .5, .36, .1, .08, .42, .42, 'sky', .08, 2, 10)
    wing(k, .1, 1.35, -3.3, .5, .36, .1, .08, .42, .42, 'sky', .08, 2, 10)
    for side in (-1, 1):
        k.box((side * 1.36, -3.35, .42), (.12, .38, .3), 'sun', .05, 2)
    # engine deck and rotor mast
    k.tbox((0, -.25, 1.0), (.8, 1.1), (1.0, 1.5), .3, 'sky', .12, 2)
    for side in (-1, 1):
        k.box((side * .42, .12, 1.02), (.18, .24, .16), 'navy', .06, 2)
        k.cyl((side * .32, -.95, 1.02), .12, .3, 'gunmetal', 'Y', 10, .03)
    k.cyl((0, -.1, 1.23), .12, .3, 'gunmetal', 'Z', 10)
    rotor = k.joint('Rotor', (0, -.1, 1.35))
    k.lathe([(0, 1.28), (.28, 1.28), (.26, 1.4), (.14, 1.48), (0, 1.5)], 'navy', parent=rotor, verts=14)
    for i in range(4):
        a = 45 + i * 90
        blade(k, (0, -.1, 1.36), 2.95, .3, .07, a, 'charcoal', rotor, 'Z', 4, r0=.22)
        blade(k, (0, -.1, 1.365), .45, .31, .075, a, 'sun', rotor, 'Z', 4, r0=3.07)
    # tail rotor on the right of the fin, blades in the YZ plane
    tail = k.joint('TailRotor', (.2, -4.12, 1.0))
    k.cyl((.2, -4.12, 1.0), .1, .12, 'navy', 'X', 10, .03, parent=tail)
    for i in range(3):
        blade(k, (.24, -4.12, 1.0), .55, .14, .045, 90 + i * 120, 'white', tail, 'X', r0=.05)
    # stub wings with rocket pods
    for side in (-1, 1):
        wing(k, side * .8, side * 1.55, -.2, .62, .5, .12, .1, -.2, -.14, 'navy', 0, 2, 10)
        x = side * 1.5
        k.lathe([(0, -.6), (.14, -.58), (.17, -.45), (.17, .38), (.15, .42)], 'navy', (x, -.2, -.36), 'Y', 12)
        k.cyl((x, .24, -.36), .16, .08, 'sun', 'Y', 12)
        for a in range(4):
            aa = math.radians(45 + a * 90)
            k.cyl((x + math.cos(aa) * .07, .29, -.36 + math.sin(aa) * .07), .035, .04, 'rubber', 'Y', 6)
        # skids and struts
        sx = side * .9
        k.sweep([(sx, -1.2, -1.12), (sx, 1.2, -1.12), (sx, 1.45, -1.02), (sx, 1.55, -.9)], .065, 'gunmetal', 8)
        for y in (-.6, .75):
            k.rod((side * .5, y, -.62), (sx, y, -1.1), .055, 'gunmetal', 8)
        # rescue roundel on the doors
        k.cyl((side * 1.0, -.1, .05), .3, .03, 'white', 'X', 20)
        k.cyl((side * 1.012, -.1, .05), .22, .03, 'mint', 'X', 20)
        k.cyl((side * 1.024, -.1, .05), .09, .03, 'white', 'X', 12)
        k.sphere((side * 1.02, .45, .42), .06, 'mint_glow' if side > 0 else 'lamp', 8, 5)
    # rescue hoist over the right door
    k.box((.98, -.5, .74), (.16, .2, .18), 'sun', .05, 2)
    k.box((1.26, -.5, .8), (.48, .12, .1), 'sun', .04, 2)
    k.rod((1.46, -.5, .74), (1.46, -.5, .3), .02, 'gunmetal', 6)
    k.box((1.46, -.5, .26), (.12, .08, .1), 'orange', .03, 1)
    # chin turret and searchlight
    chin = k.joint('ChinTurret', (0, 1.45, -.66))
    k.sphere((0, 1.45, -.66), (.2, .22, .18), 'gunmetal', 12, 6, parent=chin)
    k.rod((0, 1.55, -.68), (0, 2.12, -.68), .055, 'gunmetal', 8, parent=chin)
    k.cyl((0, 2.12, -.68), .075, .1, 'charcoal', 'Y', 8, parent=chin)
    k.joint('HeliMuzzle', (0, 2.2, -.68), chin)
    k.cyl((0, .4, -.82), .14, .12, 'navy', 'Z', 12)
    k.cyl((0, .4, -.89), .1, .03, 'lamp', 'Z', 12)


# ------------------------------------------------------------------ strike bomber
BOMBER = [  # y, half-width, upper half-height, zc, lower half-height
    (3.62, 0, 0, -.02, 0),
    (3.48, .42, .4, -.02, .4),
    (3.1, .78, .74, 0, .72),
    (2.2, .98, .96, .04, .9),
    (.6, 1.02, 1.0, .06, .92),
    (-.9, .88, .88, .12, .76),
    (-2.2, .52, .56, .28, .42),
    (-3.1, .26, .32, .4, .22),
    (-3.42, 0, 0, .44, 0),
]


def bomber(k):
    loft_body(k, BOMBER, 'sky', 0, math.pi, 16, cap=(False, False), n=2.2)
    loft_body(k, BOMBER, 'white', math.pi, math.tau, 16, cap=(False, False), n=2.2)
    band(k, BOMBER, 2.6, 3.05, 'livery', 1.02, 2, 16, n=2.2)
    band(k, BOMBER, -1.9, -1.6, 'navy', 1.02, 1, 16, n=2.2)
    # big bubble canopy with a navy spine and a white glint
    k.sphere((0, 1.45, .92), (.64, 1.2, .54), 'glass', 20, 10)
    k.box((0, 1.4, 1.43), (.08, 1.5, .07), 'navy', .035, 1)
    k.box((.26, 1.95, 1.3), (.24, .55, .03), 'white', .012, 1, rot=(-12, 14, 0))
    k.box((0, 3.0, .75), (.56, .6, .05), 'navy', .025, 1, rot=(-24, 0, 0))
    # main wing: sky with navy leading edge, livery tips and stripes
    for side in (-1, 1):
        wing(k, side * .7, side * 4.2, .5, 1.9, 1.25, .36, .2, -.22, .06, 'sky', .35, 4, 14)
        wing(k, side * .7, side * 4.2, .5, 1.9, 1.25, .36, .2, -.22, .06, 'navy', .35, 4, 14,
             t0=-.55, t1=.55, grow=1.03)
        wing(k, side * 4.18, side * 4.55, .15, 1.25, .95, .2, .16, .06, .09, 'livery', .12, 1, 14)
        k.box((side * 3.55, .13, .085), (.3, 1.22, .23), 'livery', .08, 2)
        k.sphere((side * 4.52, .2, .09), (.07, .12, .07), 'mint_glow' if side > 0 else 'lamp', 8, 5)
    # fat engine nacelles, spinners and three-blade props (blades in the XZ plane)
    for side, name in ((-1, 'L'), (1, 'R')):
        x, z = side * 1.8, -.1
        k.lathe([(0, -.9), (.24, -.75), (.4, -.2), (.47, .5), (.48, 1.6), (.44, 2.25), (.38, 2.42)], 'white',
                (x, 0, z), 'Y', 16)
        k.lathe([(.39, 2.3), (.42, 2.33), (.42, 2.42), (.38, 2.46)], 'navy', (x, 0, z), 'Y', 16)
        k.box((x, .9, z + .44), (.26, .9, .16), 'navy', .07, 2)
        for dz in (-.14, .06):
            k.cyl((x + side * .46, .2, z + dz), .065, .24, 'gunmetal', 'Y', 8, .015)
        prop = k.joint('Propeller' + name, (x, 2.52, z))
        k.lathe([(0, 2.44), (.26, 2.46), (.24, 2.66), (.13, 2.84), (0, 2.92)], 'livery', (x, 0, z), 'Y', 14,
                parent=prop)
        for i in range(3):
            blade(k, (x, 2.55, z), .52, .26, .06, 90 + i * 120, 'charcoal', prop, 'Y', r0=.14)
            blade(k, (x, 2.56, z), .2, .27, .065, 90 + i * 120, 'sun', prop, 'Y', r0=.66)
    # H-tail with twin fins and livery stripes
    wing(k, -.2, -1.85, -2.85, 1.0, .75, .16, .12, .42, .5, 'sky', .15, 2, 12)
    wing(k, .2, 1.85, -2.85, 1.0, .75, .16, .12, .42, .5, 'sky', .15, 2, 12)
    for side in (-1, 1):
        x = side * 1.85
        k.prism([(-2.45, .3), (-3.35, .3), (-3.55, 1.5), (-3.05, 1.55)], .17, 'sky', loc=(x, 0, 0), bevel=.06)
        k.prism([(-2.8, .8), (-3.43, .8), (-3.5, 1.1), (-2.92, 1.1)], .19, 'livery', loc=(x, 0, 0), bevel=.03)
        k.box((x, -2.95, .47), (.24, .9, .24), 'navy', .08, 2)
    k.prism([(-2.2, .7), (-3.3, .6), (-3.45, 1.05), (-2.9, 1.05)], .12, 'sky', bevel=.04)
    # bomb pylons (empties sit at the release point under each hardpoint)
    for name, x in (('PylonL', -2.6), ('PylonR', 2.6)):
        k.box((x, .3, -.19), (.16, .8, .18), 'navy', .05, 2)
        k.joint(name, (x, .3, -.32))
    k.box((0, .5, -.95), (.24, 1.1, .14), 'navy', .05, 2)
    k.joint('PylonC', (0, .5, -1.04))


# ------------------------------------------------------------------ relief barge Harbor Mercy
BARGE = [  # y, half-width, deck z, bottom z
    (-4.0, 1.5, .72, -.25),
    (-3.7, 1.6, .7, -.4),
    (2.6, 1.6, .7, -.4),
    (3.4, 1.5, .78, -.1),
    (4.0, 1.3, .9, .3),
]


def barge_ring(w, top, bottom, grow=0.0):
    g = grow
    r = .22
    pts = [(0, bottom - g), (w - r + g, bottom - g), (w - r * .3 + g, bottom + r * .3 - g * .3),
           (w + g, bottom + r), (w + g, top - .08), (w - .03 + g, top + g * .3), (0, top + g * .3)]
    return pts + [(-x, z) for x, z in reversed(pts[1:-1])]


def barge(k):
    rings = [[(x, st[0], z) for x, z in barge_ring(st[1], st[2], st[3])] for st in BARGE]
    k.skin(rings, 'white', None, True, True, sharp=40)
    for side in (-1, 1):
        for z0, z1, mat in ((.28, .44, 'mint'), (-.3, .05, 'navy')):
            strip = []
            for st in BARGE[:-1]:
                strip.append([(side * (st[1] + .015), st[0], z) for z in (z0, z1)])
            k.skin(strip, mat, None, False, False, closed=False)
    deck = [[(x, y, z) for x, z in ((-w, .72), (w, .72), (w, .76), (-w, .76))]
            for y, w in ((-3.85, 1.42), (3.3, 1.42), (3.85, 1.2))]
    k.skin(deck, 'navy', None, True, True)
    # bumper rail and bow ramp stripes
    rail = [(1.62, -3.98, .74), (1.62, 3.3, .74), (1.36, 3.98, .9)]
    k.sweep([(-x, y, z) for x, y, z in reversed(rail)] + rail, .07, 'sun', 8)
    for i, x in enumerate((-.9, -.3, .3, .9)):
        k.box((x, 3.95, .8), (.28, .08, .2), 'hazard' if i % 2 == 0 else 'charcoal', .03, 1, rot=(-40, 0, 0))
    # tyre fenders
    for side in (-1, 1):
        for y in (-2.8, -1.0, .8, 2.5):
            k.torus((side * 1.66, y, .42), .2, .085, 'tyre', 'X', 14, 6)
    # containers: two rows, one stacked; relief symbol on the top box
    boxes = [(-.74, 1.55, .76, 'mint'), (.74, 1.55, .76, 'white'), (0, 1.55, 1.8, 'sun'),
             (-.74, -1.0, .76, 'sun'), (.74, -1.0, .76, 'mint')]
    for x, y, z, mat in boxes:
        L = 2.3 if z < 1 else 2.1
        k.box((x, y, z + .5), (1.36, L, 1.0), mat, .07, 2)
        for side in (-1, 1):
            for dy in (-.6, 0, .6):
                k.box((x + side * .69, y + dy, z + .5), (.04, .2, .82), mat, .015, 1)
        k.box((x, y + L / 2 + .01, z + .5), (1.2, .03, .86), 'white' if mat != 'white' else 'mint', .01, 1)
        for dx in (-.15, .15):
            k.box((x + dx, y + L / 2 + .03, z + .5), (.05, .03, .8), 'gunmetal', .01, 1)
    # relief symbol: mint ring with a white leaf, on the stacked container roof
    k.torus((0, 1.55, 2.83), .52, .06, 'mint', 'Z', 28, 6)
    k.cyl((0, 1.55, 2.815), .47, .03, 'white', 'Z', 28)
    leaf = [(-.3, -.05), (-.18, .12), (0, .22), (.18, .24), (.32, .2), (.24, .02), (.08, -.12), (-.1, -.16)]
    k.prism(leaf, .05, 'mint', loc=(0, 1.55, 2.84), axis='Z', bevel=.015, rot=(0, 0, 20))
    k.box((-.14, 1.47, 2.85), (.34, .05, .03), 'mint', .01, 1, rot=(0, 0, 35))
    # wheelhouse at the stern
    k.tbox((0, -3.1, 1.36), (1.5, 1.0), (1.7, 1.2), 1.26, 'white', .12, 2)
    k.tbox((0, -3.0, 1.62), (1.52, .9), (1.62, 1.05), .36, 'glass_dark', .06, 2)
    k.box((0, -3.1, 2.06), (1.95, 1.5, .16), 'mint', .07, 2)
    k.rod((.55, -3.4, 2.1), (.55, -3.4, 2.75), .045, 'navy', 8)
    k.sphere((.55, -3.4, 2.8), .09, 'lamp', 8, 5)
    k.box((-.45, -3.3, 2.22), (.5, .12, .09), 'white', .04, 1)
    k.torus((.86, -3.1, 1.3), .18, .06, 'orange', 'X', 14, 6)
    crew(k, (-.9, -2.0, .76), s=.64, vest='mint')
