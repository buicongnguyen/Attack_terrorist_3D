"""Harbour assets for the city chapter: Ashen Front warships, a civilian ferry and
dockside props.

Hostile ships wear the Ashen livery so they read from the high 45-degree strike
camera: charcoal hulls framing lighter bunker-grey decks, a bold ember gunwale
stripe, ember roof blocks and deck markings, gunmetal guns and small ember
lights. The ferry is plainly civilian: white hull, sky and mint stripes, a glazed
passenger saloon, pale-wood decks, sunflower lifeboats and rails, no weapons.

Bow = +Y, waterline z = 0 (hulls dip below it). Turret empties sit on the ring
centre with identity rotation; barrels point +Y and clear the superstructure
through a full turn. Painted markings (deck chevrons, hazard stripes, window
panes, door bars) are single flat polygons so they cost a few vertices each.
"""
import math

from mathutils import Euler, Vector

from assets_friendly import hull_section
from assets_hostile import clip_poly


def _lerp(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------ flat decals
def pane(k, pts, normal, mat, parent=None):
    """Single flat polygon facing `normal` (window panes, painted markings)."""
    n = Vector()
    for i, p in enumerate(pts):
        n += Vector(p).cross(Vector(pts[(i + 1) % len(pts)]))
    if n.dot(Vector(normal)) < 0:
        pts = list(reversed(pts))
    k.mesh([tuple(p) for p in pts], [list(range(len(pts)))], mat, parent, smooth=False, recalc=False)


def hazard_decal(k, center, width, height, face='-Y', stripe=.14, base='charcoal', mat='hazard', depth=.04):
    """Charcoal plate with painted diagonal hazard stripes on its +Y or -Y face."""
    cx, cy, cz = center
    sign = 1 if face[0] == '+' else -1
    k.box(center, (width, depth, height), base, depth * .45, 1)
    x0, x1, z0, z1 = -width / 2 + .03, width / 2 - .03, -height / 2 + .03, height / 2 - .03
    y = cy + sign * (depth / 2 + .004)
    x = x0 - height
    while x < x1:
        poly = [(x, z0), (x + stripe, z0), (x + stripe + (z1 - z0), z1), (x + (z1 - z0), z1)]
        c = clip_poly(poly, x0, x1, z0, z1)
        if len(c) >= 3:
            pane(k, [(cx + px, y, cz + pz) for px, pz in c], (0, sign, 0), mat)
        x += stripe * 2


# ------------------------------------------------------------------ hull helpers
def station_at(stations, y):
    """Hull station (y, w, top, keel, chine) at y. The loft is linear, so this lies on the hull."""
    for a, b in zip(stations, stations[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(_lerp(p, q, t) for p, q in zip(a, b))
    return stations[0] if y < stations[0][0] else stations[-1]


def deck_z(stations, y):
    """Top of the deck plate at y."""
    return station_at(stations, y)[2] + .07


def hull_half(st, z):
    """Exact half-width of the hull_section ring at height z."""
    pts = hull_section(*st[1:])[:6]
    if z <= pts[0][1]:
        return 0.0
    for (xa, za), (xb, zb) in zip(pts, pts[1:]):
        if za <= z <= zb:
            return _lerp(xa, xb, (z - za) / max(zb - za, 1e-6))
    return pts[-1][0]


def _to_tip(stations, t=.6):
    """Stations up to a point between the last two, where the bow still has width."""
    return stations[:-1] + [tuple(_lerp(p, q, t) for p, q in zip(stations[-2], stations[-1]))]


def ship_hull(k, stations, hull, deck, fender=None, fender_r=.05, inset=.14):
    """V-bottom hull, inset deck plate and an optional rub rail round the deck edge and transom."""
    rings = [[(x, st[0], z) for x, z in hull_section(*st[1:])] for st in stations]
    k.skin(rings, hull, None, True, True, wexp=1.0)
    plate = []
    for st in stations[:-1]:
        y, w, top = st[0], st[1] * .985 - inset, st[2] + .02
        plate.append([(x, y, z) for x, z in ((-w, top), (w, top), (w, top + .05), (-w, top + .05))])
    k.skin(plate, deck, None, True, True, wexp=1.0)
    if fender:
        side = [(hull_half(st, st[2] - .02) + .03, st[0], st[2] - .02) for st in _to_tip(stations, .45)]
        tip = stations[-1]
        path = [(-x, y, z) for x, y, z in side] + [(0, tip[0] + .02, tip[2] - .03)] + list(reversed(side))
        k.sweep(path, fender_r, fender, 8)
        st = stations[0]
        x = side[0][0] - .04
        k.sweep([(-x, st[0] - .03, st[2] - .05), (x, st[0] - .03, st[2] - .05)], fender_r, fender, 8)


def gunwale_stripe(k, stations, d0, d1, mat, out=.016):
    """Livery stripe on both hull sides from d0 to d1 below the deck edge (follows the sheer)."""
    for side in (-1, 1):
        rings = []
        for st in _to_tip(stations):
            top = st[2]
            rings.append([(side * (hull_half(st, z) + out), st[0], z)
                          for z in (top - d1, top - (d0 + d1) / 2, top - d0)])
        k.skin(rings, mat, None, False, False, closed=False)


def deck_mark(k, stations, y, profile, mat, x=0.0, lift=.006):
    """Painted marking ([(x, y)] around 0) on the deck plate at y, following the sheer."""
    pts = [(x + px, y + py, deck_z(stations, y + py) + lift) for px, py in profile]
    pane(k, pts, (0, 0, 1), mat)


def chevron(w, h, b):
    """Bow chevron pointing +Y: half-width w, height h, band thickness b."""
    return [(-w, -h / 2), (0, h / 2), (w, -h / 2), (w, -h / 2 - b), (0, h / 2 - b * 1.3), (-w, -h / 2 - b)]


# ------------------------------------------------------------------ superstructure helpers
def house(k, x, y, z0, bottom, top, height, mat, bevel=.1, shift=0.0, window=None, glass='glass_dark', proud=.018,
          seg=2, parent=None):
    """Tapered deckhouse standing on z0 with an optional band (windows, livery) between height fractions."""
    k.tbox((x, y, z0 + height / 2), top, bottom, height, mat, bevel, seg, shift=(0, shift), parent=parent)
    if window:
        f0, f1 = window

        def size(f):
            return (_lerp(bottom[0], top[0], f) + 2 * proud, _lerp(bottom[1], top[1], f) + 2 * proud)

        k.tbox((x, y + shift * f0, z0 + height * (f0 + f1) / 2), size(f1), size(f0), height * (f1 - f0), glass,
               .03, 1, shift=(0, shift * (f1 - f0)), parent=parent)
    return z0 + height


def wall_panes(k, x, y, z0, bottom, top, height, shift, side, spans, f0, f1, mat='glass', off=.012, chamfer=.05):
    """Chamfered window panes on one wall of a tapered house (see `house`).

    side is '+X', '-X', '+Y' or '-Y'; spans are (s0, s1) along the wall: absolute y
    on the X walls, x offsets on the Y walls. f0/f1 are height fractions.
    """
    c, cz = chamfer, chamfer / height
    normal = {'+X': (1, 0, 0), '-X': (-1, 0, 0), '+Y': (0, 1, 0), '-Y': (0, -1, 0)}[side]
    sign = 1 if side[0] == '+' else -1
    for s0, s1 in spans:
        loop = [(s0 + c, f0), (s1 - c, f0), (s1, f0 + cz), (s1, f1 - cz), (s1 - c, f1), (s0 + c, f1), (s0, f1 - cz),
                (s0, f0 + cz)]
        pts = []
        for s, f in loop:
            z = z0 + f * height
            if side[1] == 'X':
                pts.append((x + sign * (_lerp(bottom[0], top[0], f) / 2 + off), s, z))
            else:
                pts.append((x + s, y + shift * f + sign * (_lerp(bottom[1], top[1], f) / 2 + off), z))
        pane(k, pts, normal, mat)


def lamp(k, loc, r=.07, mat='ember_glow', parent=None):
    """Small light on a gunmetal cup."""
    x, y, z = loc
    k.cyl((x, y, z - r * .85), r * 1.1, r * .5, 'gunmetal', 'Z', 8, parent=parent)
    k.sphere((x, y, z), (r, r, r * 1.1), mat, 8, 4, parent=parent)


def lattice_mast(k, x, y, z0, z1, b0, b1, mat='gunmetal', levels=3, r=.03, parent=None):
    """Four-leg tapering lattice mast with zig-zag bracing; b0/b1 are half sizes at foot and head."""
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

    def pt(c, t):
        return (x + c[0] * _lerp(b0[0], b1[0], t), y + c[1] * _lerp(b0[1], b1[1], t), _lerp(z0, z1, t))

    for c in corners:
        k.rod(pt(c, 0), pt(c, 1), r * 1.35, mat, 8, parent=parent, cap=False)
    for i in range(levels):
        t0, t1 = i / levels, (i + 1) / levels
        for j in range(4):
            a, b = corners[j], corners[(j + 1) % 4]
            if (i + j) % 2:
                a, b = b, a
            k.rod(pt(a, t0), pt(b, t1), r, mat, 8, parent=parent, cap=False)


# ------------------------------------------------------------------ patrol boat
PATROL = [  # y, half-width, deck z, keel z, chine z
    (-2.2, .6, .5, -.05, .14),
    (-1.8, .68, .49, -.19, .05),
    (-.6, .7, .49, -.26, .02),
    (.5, .7, .5, -.27, .02),
    (1.25, .63, .54, -.22, .06),
    (1.75, .48, .6, -.13, .15),
    (2.05, .27, .66, .02, .28),
    (2.2, .06, .7, .24, .48),
]


def patrol_boat(k):
    S = PATROL
    ship_hull(k, S, 'charcoal', 'bunker')
    gunwale_stripe(k, S, .05, .2, 'ember')
    deck_mark(k, S, 1.64, chevron(.3, .3, .12), 'ember')
    # cabin: wrap-around dark glazing, ember roof block, whip mast with a warning light
    zc = deck_z(S, -.75) - .02
    top = house(k, 0, -.75, zc, (1.0, 1.34), (.86, 1.08), .56, 'char_light', .1, -.08, (.42, .8))
    k.box((0, -.83, top + .03), (.94, 1.16, .08), 'charcoal', .04, 2)
    k.box((0, -.8, top + .08), (.6, .8, .04), 'ember', .02, 1)
    k.rod((0, -1.3, top + .06), (0, -1.3, top + .6), .03, 'gunmetal', 8)
    k.box((0, -1.3, top + .4), (.46, .06, .06), 'gunmetal', .02, 1)
    lamp(k, (0, -1.3, top + .66), .06)
    # aft deck: engine hatch, exhausts, stern light
    za = deck_z(S, -1.75)
    k.box((0, -1.74, za + .03), (.7, .46, .07), 'gunmetal', .03, 1)
    for s in (-1, 1):
        k.cyl((s * .3, -2.22, .3), .06, .1, 'gunmetal', 'Y', 8)
    lamp(k, (.4, -2.02, za + .1), .045)
    # bow gun with shield on the Turret
    zt = deck_z(S, 1.0)
    k.cyl((0, 1.0, zt + .03), .3, .06, 'char_light', 'Z', 12)
    t = k.joint('Turret', (0, 1.0, zt + .06))
    k.cyl((0, 1.0, zt + .2), .07, .28, 'gunmetal', 'Z', 8, parent=t)
    k.box((0, 1.08, zt + .4), (.24, .54, .2), 'gunmetal', .06, 2, parent=t)
    k.rod((0, 1.32, zt + .42), (0, 1.9, zt + .42), .05, 'gunmetal', 8, parent=t, cap=False)
    k.cyl((0, 1.92, zt + .42), .075, .1, 'charcoal', 'Y', 8, parent=t)
    k.box((0, 1.28, zt + .46), (.6, .05, .36), 'char_light', .025, 1, parent=t)
    k.box((0, 1.31, zt + .56), (.46, .03, .08), 'ember', .01, 1, parent=t)
    k.box((.18, .98, zt + .36), (.12, .22, .14), 'ash', .04, 1, parent=t)


# ------------------------------------------------------------------ missile boat
MISSILE = [
    (-2.9, .74, .54, -.06, .15),
    (-2.4, .83, .53, -.22, .05),
    (-1.0, .85, .53, -.3, .02),
    (.6, .85, .54, -.3, .02),
    (1.6, .76, .58, -.25, .06),
    (2.25, .56, .65, -.15, .15),
    (2.65, .3, .72, .0, .3),
    (2.9, .07, .77, .24, .52),
]


def box_launcher(k, center, pitch, yaw, deck, size=(.5, 1.8, .42)):
    """Missile box on struts, nose raised by `pitch` and splayed by `yaw` (degrees)."""
    rot = (pitch, 0, yaw)
    R = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix()
    C = Vector(center)

    def at(p):
        return tuple(C + R @ Vector(p))

    w, L, h = size
    k.box(at((0, 0, 0)), size, 'charcoal', .07, 2, rot=rot)
    for yy in (L / 2 - .03, -L / 2 + .03):
        k.box(at((0, yy, 0)), (w + .05, .1, h + .05), 'char_light', .03, 1, rot=rot)
    k.box(at((0, L * .18, 0)), (w + .03, .16, h + .03), 'ember', .02, 1, rot=rot)
    for x in (-.12, .12):
        k.cyl(at((x, L / 2 + .035, 0)), .095, .04, 'ember', 'Y', 10, rot=rot)
    for yy in (L * .3, -L * .34):
        for x in (-w * .3, w * .3):
            p = at((x, yy, -h / 2))
            k.rod((p[0], p[1], deck - .02), p, .04, 'gunmetal', 8, cap=False)
    k.box((C.x, C.y, deck + .02), (w + .12, L * .82, .05), 'gunmetal', .02, 1, rot=(0, 0, yaw))


def missile_boat(k):
    S = MISSILE
    ship_hull(k, S, 'charcoal', 'bunker')
    gunwale_stripe(k, S, .05, .22, 'ember')
    deck_mark(k, S, 2.1, chevron(.36, .36, .13), 'ember')
    k.cyl((0, 1.55, deck_z(S, 1.55) + .06), .1, .12, 'gunmetal', 'X', 8)  # anchor winch
    # low bridge forward of midships, ember roof stripes, radome and mast
    zb = deck_z(S, .8) - .02
    top = house(k, 0, .8, zb, (1.24, 1.5), (1.02, 1.12), .52, 'char_light', .12, -.1, (.4, .8))
    k.box((0, .7, top + .03), (1.1, 1.24, .08), 'charcoal', .04, 2)
    for s in (-1, 1):
        k.box((s * .33, .72, top + .08), (.18, 1.14, .04), 'ember', .02, 1)
    k.cyl((0, .45, top + .14), .08, .14, 'gunmetal', 'Z', 8)
    k.sphere((0, .45, top + .36), (.22, .22, .2), 'ash', 12, 6)
    k.rod((0, 1.0, top + .06), (0, 1.0, top + .6), .03, 'gunmetal', 8)
    k.box((0, 1.0, top + .42), (.5, .05, .05), 'gunmetal', .02, 1)
    lamp(k, (0, 1.0, top + .66), .06)
    # engine vent between bridge and launchers
    zv = deck_z(S, -.2)
    k.box((0, -.2, zv + .1), (.5, .36, .2), 'char_light', .06, 1)
    pane(k, [(x, y, zv + .205) for x, y in ((-.18, -.3), (.18, -.3), (.18, -.1), (-.18, -.1))], (0, 0, 1),
         'gunmetal')
    # twin angled missile boxes on the aft deck
    zl = deck_z(S, -1.4)
    for s in (-1, 1):
        box_launcher(k, (s * .42, -1.42, zl + .49), 12, -s * 6, zl)
    # stern: exhausts and a light
    for s in (-1, 1):
        k.cyl((s * .34, -2.92, .3), .065, .1, 'gunmetal', 'Y', 8)
    lamp(k, (0, -2.62, deck_z(S, -2.62) + .1), .05)


# ------------------------------------------------------------------ frigate
FRIGATE = [
    (-4.2, .95, .68, -.05, .16),
    (-3.7, 1.06, .67, -.24, .06),
    (-2.0, 1.1, .67, -.34, .02),
    (.6, 1.1, .68, -.35, .02),
    (2.0, 1.0, .72, -.3, .06),
    (3.1, .74, .8, -.2, .16),
    (3.8, .4, .88, -.02, .32),
    (4.2, .08, .94, .28, .6),
]


def twin_aa(k, y, z):
    """Twin AA mount on `Turret`, guns elevated 35 degrees, MuzzleL/MuzzleR at the tips."""
    k.cyl((0, y, z + .04), .5, .08, 'char_light', 'Z', 16)
    t = k.joint('Turret', (0, y, z + .08))
    k.cyl((0, y, z + .13), .4, .1, 'gunmetal', 'Z', 12, parent=t)
    k.box((0, y - .05, z + .34), (.62, .62, .34), 'charcoal', .11, 2, parent=t)
    k.box((0, y + .27, z + .38), (.64, .06, .12), 'ember', .02, 1, parent=t)
    k.box((0, y - .05, z + .52), (.4, .4, .04), 'ember', .015, 1, parent=t)
    k.box((0, y + .16, z + .56), (.44, .24, .18), 'gunmetal', .06, 1, parent=t)
    c, s = math.cos(math.radians(35)), math.sin(math.radians(35))
    d = Vector((0, c, s))
    for side, nm in ((-1, 'L'), (1, 'R')):
        a = Vector((side * .14, y + .2, z + .58))
        k.rod(a, a + d * .95, .045, 'gunmetal', 8, parent=t, cap=False)
        k.cyl(tuple(a + d * .55), .066, .08, 'ember', 'Y', 8, rot=(35, 0, 0), parent=t, cap=False)
        k.cyl(tuple(a + d * .97), .066, .1, 'charcoal', 'Y', 8, rot=(35, 0, 0), parent=t)
        k.joint('Muzzle' + nm, tuple(a + d * 1.03), t)
        k.box((side * .38, y - .1, z + .32), (.14, .34, .22), 'ash', .05, 1, parent=t)
    k.box((0, y - .3, z + .56), (.22, .16, .1), 'char_light', .04, 1, parent=t)
    return t


def frigate(k):
    S = FRIGATE
    ship_hull(k, S, 'charcoal', 'bunker')
    gunwale_stripe(k, S, .06, .27, 'ember')
    deck_mark(k, S, 3.38, chevron(.42, .4, .15), 'ember')
    # vertical launch block on the foredeck: painted hatches and an ember edge
    zv = deck_z(S, 2.35)
    k.box((0, 2.35, zv + .04), (.92, .8, .1), 'gunmetal', .03, 1)
    for i in range(3):
        for j in range(2):
            x0, y0 = -.29 + i * .29 - .11, 2.35 + (j - .5) * .37 - .15
            pane(k, [(x0, y0, zv + .092), (x0 + .22, y0, zv + .092), (x0 + .22, y0 + .3, zv + .092),
                     (x0, y0 + .3, zv + .092)], (0, 0, 1), 'char_light')
    k.box((0, 2.8, zv + .02), (.92, .08, .04), 'ember', .015, 1)
    # long deckhouse, bridge block with wings, ember roof block
    zd = deck_z(S, .2) - .02
    top1 = house(k, 0, .2, zd, (1.6, 3.4), (1.5, 3.3), .7, 'char_light', .1)
    top2 = house(k, 0, 1.35, top1 - .02, (1.36, 1.0), (1.2, .78), .56, 'charcoal', .1, -.08, (.36, .78))
    k.box((0, 1.66, top1 + .36), (1.86, .3, .07), 'charcoal', .03, 1)
    k.box((0, 1.27, top2 + .03), (1.26, .84, .08), 'char_light', .04, 1)
    k.box((0, 1.27, top2 + .08), (.9, .6, .04), 'ember', .02, 1)
    # lattice mast with radar, yardarm and lights
    zm = top2 + .07
    lattice_mast(k, 0, 1.2, zm, zm + 1.3, (.26, .22), (.06, .06))
    mt = zm + 1.3
    k.box((0, 1.2, zm + .85), (.9, .05, .05), 'gunmetal', .02, 1)
    for s in (-1, 1):
        k.sphere((s * .43, 1.2, zm + .9), .045, 'ember_glow', 8, 4)
    k.box((0, 1.2, mt + .03), (.3, .3, .05), 'gunmetal', .02, 1)
    k.rod((0, 1.2, mt + .05), (0, 1.2, mt + .15), .035, 'gunmetal', 8, cap=False)
    k.box((0, 1.2, mt + .2), (.84, .12, .1), 'ash', .04, 1)
    k.box((0, 1.27, mt + .2), (.8, .03, .05), 'ember', .01, 1)
    lamp(k, (0, 1.2, mt + .36), .055, 'beacon')
    # raked funnel with an ember band, life-raft canisters either side
    ft = house(k, 0, -.6, top1 - .02, (.66, .9), (.52, .66), .8, 'charcoal', .1, -.14, (.62, .8), 'ember', seg=1)
    k.box((0, -.74, ft + .01), (.56, .7, .06), 'gunmetal', .025, 1)
    for s in (-1, 1):
        k.box((s * .6, -.55, top1 + .1), (.24, .6, .2), 'ash', .09, 1)
        k.box((s * .6, -.55, top1 + .1), (.26, .1, .22), 'ember', .02, 1)
    # AA twin-gun mount aft and a stern ensign
    twin_aa(k, -2.75, deck_z(S, -2.75))
    zs = deck_z(S, -3.8)
    k.rod((0, -4.0, zs), (0, -4.0, zs + .9), .025, 'gunmetal', 8)
    k.box((0, -4.19, zs + .76), (.02, .36, .24), 'ember', .008, 1)
    deck_mark(k, S, -3.75, [(-.5, -.05), (.5, -.05), (.5, .05), (-.5, .05)], 'ember')


# ------------------------------------------------------------------ destroyer "Cinder" (flagship)
DESTROYER = [
    (-6.0, 1.1, .76, -.05, .18),
    (-5.4, 1.24, .75, -.26, .06),
    (-3.0, 1.3, .75, -.38, .02),
    (1.0, 1.3, .77, -.4, .02),
    (3.0, 1.2, .82, -.34, .06),
    (4.5, .88, .94, -.22, .18),
    (5.4, .48, 1.04, -.02, .36),
    (6.0, .09, 1.1, .3, .7),
]

FLAME = [(0, .5), (.12, .22), (.26, .36), (.3, .02), (.2, -.26), (0, -.36), (-.2, -.26), (-.3, .02), (-.26, .36),
         (-.12, .22)]


def gun_turret(k, name, y, z):
    """Heavy twin gun house on its own empty; barrels reach 1.85 m ahead of the pivot."""
    k.cyl((0, y, z + .08), .74, .16, 'char_light', 'Z', 14)
    t = k.joint(name, (0, y, z + .16))
    house(k, 0, y - .08, z + .16, (1.24, 1.5), (.98, 1.0), .6, 'charcoal', .14, -.14, (.12, .3), 'ember', .02,
          parent=t)
    k.box((0, y - .22, z + .78), (.84, .8, .05), 'char_light', .02, 1, parent=t)
    pane(k, [(-.4, y + .07, z + .806), (.4, y + .07, z + .806), (.4, y + .17, z + .806), (-.4, y + .17, z + .806)],
         (0, 0, 1), 'ember', parent=t)
    k.box((0, y - .42, z + .66), (1.42, .14, .14), 'gunmetal', .05, 1, parent=t)
    for x in (-.24, .24):
        k.box((x, y + .55, z + .46), (.26, .2, .26), 'char_light', .08, 1, parent=t)
        k.rod((x, y + .6, z + .46), (x, y + 1.7, z + .46), .08, 'gunmetal', 8, parent=t, cap=False)
        k.cyl((x, y + 1.2, z + .46), .1, .06, 'ember', 'Y', 8, parent=t, cap=False)
        k.cyl((x, y + 1.76, z + .46), .11, .14, 'gunmetal', 'Y', 8, parent=t)
    return t


def mini_aa(k, x, y, z):
    """Fixed secondary twin mount (decoration)."""
    k.box((x, y - .02, z + .11), (.28, .3, .2), 'charcoal', .07, 1)
    k.box((x, y + .13, z + .13), (.3, .03, .06), 'ember', .01, 1)
    d = Vector((0, math.cos(math.radians(30)), math.sin(math.radians(30))))
    for dx in (-.07, .07):
        a = Vector((x + dx, y + .08, z + .16))
        k.rod(a, a + d * .5, .03, 'gunmetal', 8, cap=False)


def destroyer(k):
    S = DESTROYER
    ship_hull(k, S, 'charcoal', 'bunker')
    gunwale_stripe(k, S, .06, .36, 'ember', .018)
    deck_mark(k, S, 4.9, FLAME, 'ember')
    hazard_decal(k, (0, -6.03, .48), 1.5, .28, '-Y', .12)
    # fore and aft heavy turrets
    gun_turret(k, 'TurretF', 3.3, deck_z(S, 3.3))
    gun_turret(k, 'TurretA', -4.3, deck_z(S, -4.3))
    # main deckhouse (ends clear of both turrets' barrel sweep)
    zd = deck_z(S, -.5) - .02
    top1 = house(k, 0, -.5, zd, (1.8, 3.7), (1.66, 3.5), .66, 'char_light', .12, seg=1)
    for s in (-1, 1):
        k.box((s * .885, -.5, zd + .4), (.03, 3.2, .12), 'ember', .01, 1)
    # bridge tower: two tiers, dark glazing, wings with searchlights, ember roof
    top2 = house(k, 0, .72, top1 - .02, (1.4, 1.2), (1.3, 1.05), .55, 'charcoal', .1, seg=1)
    top3 = house(k, 0, .76, top2 - .02, (1.5, 1.1), (1.34, .86), .52, 'char_light', .1, -.06, (.35, .8))
    k.box((0, 1.0, top2 + .02), (2.2, .34, .08), 'charcoal', .03, 1)
    for s in (-1, 1):
        k.sphere((s * 1.02, 1.04, top2 + .12), .065, 'lamp', 8, 4)
    k.box((0, .7, top3 + .03), (1.44, .92, .08), 'charcoal', .04, 1)
    k.box((0, .72, top3 + .08), (1.1, .7, .04), 'ember', .02, 1)
    # lattice mast: yardarm lights, big radar bar, beacon
    zr = top3 + .07
    lattice_mast(k, 0, .56, zr, zr + 1.5, (.3, .24), (.07, .07), levels=2, r=.032)
    mt = zr + 1.5
    k.box((0, .56, zr + .8), (1.2, .05, .05), 'gunmetal', .02, 1)
    for s in (-1, 1):
        k.sphere((s * .58, .56, zr + .85), .05, 'ember_glow', 8, 4)
    k.box((0, .56, mt + .03), (.32, .32, .06), 'gunmetal', .02, 1)
    k.rod((0, .56, mt + .06), (0, .56, mt + .18), .04, 'gunmetal', 8, cap=False)
    k.box((0, .56, mt + .26), (1.3, .16, .2), 'ash', .06, 1)
    k.box((0, .65, mt + .26), (1.26, .03, .08), 'ember', .01, 1)
    k.rod((0, .56, mt + .36), (0, .56, mt + .7), .025, 'gunmetal', 8)
    lamp(k, (0, .56, mt + .76), .07, 'beacon')
    # twin raked funnels with ember bands and smouldering tops
    for fy, fh in ((-.42, 1.0), (-1.58, .88)):
        ft = house(k, 0, fy, top1 - .02, (.8, .95), (.62, .7), fh, 'charcoal', .1, -.16, (.6, .78), 'ember', seg=1)
        k.box((0, fy - .16, ft + .01), (.66, .74, .06), 'gunmetal', .025, 1)
        k.box((0, fy - .16, ft + .045), (.34, .4, .02), 'ember_glow', .008, 1)
    # lifeboats between the funnels, secondary AA aft on the deckhouse
    for s in (-1, 1):
        k.box((s * .64, -1.0, top1 + .12), (.28, .78, .22), 'ash', .1, 1)
        k.box((s * .64, -1.0, top1 + .12), (.3, .1, .24), 'ember', .02, 1)
        mini_aa(k, s * .6, -2.02, top1 - .01)
    # bow jackstaff and stern ensign
    zb = deck_z(S, 5.6)
    k.rod((0, 5.6, zb - .04), (0, 5.6, zb + .5), .022, 'gunmetal', 8)
    zs = deck_z(S, -5.7)
    k.rod((0, -5.7, zs), (0, -5.7, zs + 1.0), .026, 'gunmetal', 8)
    k.box((0, -5.92, zs + .84), (.02, .42, .28), 'ember', .008, 1)


# ------------------------------------------------------------------ harbour ferry (civilian)
FERRY = [
    (-3.6, 1.16, .72, -.02, .2),
    (-3.2, 1.27, .71, -.2, .06),
    (-1.0, 1.3, .71, -.3, .02),
    (1.2, 1.3, .72, -.3, .02),
    (2.3, 1.2, .76, -.24, .06),
    (3.0, .92, .84, -.14, .18),
    (3.4, .52, .9, .02, .36),
    (3.6, .1, .94, .26, .62),
]


def ferry(k):
    S = FERRY
    ship_hull(k, S, 'white', 'wood_light', fender='sky', fender_r=.055)
    gunwale_stripe(k, S, .1, .2, 'mint')
    gunwale_stripe(k, S, .27, .5, 'sky')
    # passenger saloon: white house with a row of glass windows down each side and across the ends
    y0 = -.35
    z0 = deck_z(S, y0) - .02
    B, T, H = (2.2, 4.3), (2.12, 4.18), .8
    top = house(k, 0, y0, z0, B, T, H, 'white', .12)
    spans = [(y0 - 1.9 + i * .43, y0 - 1.9 + i * .43 + .32) for i in range(9)]
    for side in ('+X', '-X'):
        wall_panes(k, 0, y0, z0, B, T, H, 0, side, spans, .34, .74)
    wall_panes(k, 0, y0, z0, B, T, H, 0, '+Y', [(-.9, -.5), (-.42, -.02), (.02, .42), (.5, .9)], .34, .74)
    wall_panes(k, 0, y0, z0, B, T, H, 0, '-Y', [(-.86, -.44), (.44, .86)], .34, .74)
    wall_panes(k, 0, y0, z0, B, T, H, 0, '-Y', [(-.24, .24)], .06, .78, 'sky', chamfer=.06)
    # open sun deck: pale wood, sunflower rails, lifeboats, benches, life rings
    k.box((0, y0, top + .02), (1.94, 3.98, .05), 'wood_light', .02, 1)
    zr = top + .36
    rail = [(-.95, .62, zr), (-.95, -2.1, zr), (-.8, -2.25, zr), (.8, -2.25, zr), (.95, -2.1, zr), (.95, .62, zr)]
    k.sweep(rail, .03, 'sun', 8)
    for px, py in [(s * .95, y) for s in (-1, 1) for y in (.62, -.75, -2.1)] + [(0, -2.25)]:
        k.rod((px, py, top + .03), (px, py, zr), .024, 'sun', 8, cap=False)
    for s in (-1, 1):
        k.box((s * .62, -1.2, top + .17), (.34, .96, .24), 'sun', .11, 1)
        k.box((s * .62, -1.2, top + .31), (.26, .66, .1), 'white', .04, 1)
        k.torus((s * .975, -.3, top + .22), .12, .038, 'orange', 'X', 10, 8)
    for by, face in ((-1.95, 1), (.2, -1)):
        k.box((0, by, top + .13), (.9, .26, .16), 'sky', .06, 1)
        k.box((0, by - face * .11, top + .3), (.9, .06, .22), 'sky', .03, 1)
    # wheelhouse forward on the sun deck: glazed front, mint roof, mast with radar and light
    wy, wz = 1.22, top + .03
    WB, WT, WH = (1.46, .96), (1.3, .78), .62
    wtop = house(k, 0, wy, wz, WB, WT, WH, 'white', .1, -.06)
    wall_panes(k, 0, wy, wz, WB, WT, WH, -.06, '+Y', [(-.6, -.22), (-.18, .18), (.22, .6)], .4, .82)
    for side in ('+X', '-X'):
        wall_panes(k, 0, wy, wz, WB, WT, WH, -.06, side, [(wy - .32, wy + .18)], .4, .82)
    k.box((0, wy - .04, wtop + .04), (1.6, 1.1, .09), 'mint', .04, 1)
    k.rod((0, wy - .25, wtop + .08), (0, wy - .25, wtop + .66), .03, 'white', 8)
    k.box((0, wy - .25, wtop + .46), (.46, .08, .06), 'sky', .025, 1)
    lamp(k, (0, wy - .25, wtop + .72), .055, 'lamp')
    # sky funnel with a white band and navy cap
    fy = -1.35
    ft = house(k, 0, fy, top + .03, (.56, .8), (.46, .62), .62, 'sky', .1, -.1, (.55, .74), 'white', seg=1)
    k.box((0, fy - .1, ft + .01), (.5, .66, .05), 'navy', .02, 1)
    # foredeck: mooring bitts and a sunflower bow rail
    for s in (-1, 1):
        k.cyl((s * .4, 2.75, deck_z(S, 2.75) + .07), .07, .16, 'navy', 'Z', 8)
    bow = [(-.92, 2.2), (-.72, 2.95), (-.34, 3.35), (0, 3.5), (.34, 3.35), (.72, 2.95), (.92, 2.2)]
    k.sweep([(x, y, deck_z(S, y) + .28) for x, y in bow], .028, 'sun', 8)
    for x, y in bow[::3]:
        k.rod((x, y, deck_z(S, y) - .01), (x, y, deck_z(S, y) + .28), .022, 'sun', 8, cap=False)
    # aft deck: bench along the transom and a mint ensign
    za = deck_z(S, -3.2)
    k.box((0, -3.2, za + .09), (1.5, .26, .16), 'sky', .06, 1)
    k.box((0, -3.31, za + .26), (1.5, .06, .22), 'sky', .03, 1)
    k.rod((0, -3.5, za - .02), (0, -3.5, za + .82), .024, 'white', 8)
    k.box((0, -3.68, za + .68), (.02, .34, .22), 'mint', .008, 1)


# ------------------------------------------------------------------ dockside gantry crane
def harbour_crane(k):
    L = 1.35
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * L, sy * L, 2.41), (.3, .3, 4.3), 'hazard', .06, 1)
    for sx in (-1, 1):
        x = sx * L
        k.box((x, 0, .14), (.46, 3.56, .28), 'gunmetal', .06, 1)  # rail bogie beam
        k.box((x, 0, 4.76), (.36, 3.06, .42), 'hazard', .08, 1)
        k.rod((x, -L + .16, 1.55), (x, L - .16, 4.52), .05, 'charcoal', 8, cap=False)
        k.rod((x, L - .16, 1.55), (x, -L + .16, 4.52), .05, 'charcoal', 8, cap=False)
    for sy in (-1, 1):
        k.box((0, sy * L, 4.76), (2.4, .32, .38), 'hazard', .08, 1)
    # machinery house on a deck plate, counterweight with hazard stripes, operator cab
    k.box((0, 0, 5.04), (2.0, 2.0, .16), 'charcoal', .05, 1)
    k.box((0, -.3, 5.58), (1.5, 1.8, .92), 'hazard', .12, 1)
    k.box((0, -.3, 6.07), (1.56, 1.86, .08), 'charcoal', .03, 1)
    for s in (-1, 1):
        pane(k, [(s * .762, y, z) for y, z in ((-.9, 5.45), (-.2, 5.45), (-.2, 5.8), (-.9, 5.8))], (s, 0, 0),
             'gunmetal')
    k.box((0, -1.47, 5.5), (1.3, .56, .8), 'charcoal', .07, 1)
    hazard_decal(k, (0, -1.77, 5.5), 1.1, .5, '-Y', .14)
    k.box((.56, .92, 5.3), (.55, .6, .55), 'hazard', .08, 1)
    pane(k, [(.37, 1.227, 5.26), (.75, 1.227, 5.26), (.75, 1.227, 5.46), (.37, 1.227, 5.46)], (0, 1, 0), 'glass_dark')
    pane(k, [(.842, .72, 5.26), (.842, 1.12, 5.26), (.842, 1.12, 5.46), (.842, .72, 5.46)], (1, 0, 0), 'glass_dark')
    # A-frame, luffed lattice jib pointing +Y, pendants
    for s in (-1, 1):
        k.rod((s * .6, -.85, 6.1), (s * .12, -.5, 7.02), .06, 'hazard', 8, cap=False)
    k.box((0, -.5, 7.06), (.4, .2, .14), 'charcoal', .04, 1)
    k.sphere((0, -.5, 7.18), .06, 'ember_glow', 8, 4)
    root, tip = Vector((0, .62, 5.85)), Vector((0, 5.3, 6.75))

    def corner(t, cx, cz):
        return root.lerp(tip, t) + Vector((cx * _lerp(.3, .16, t), 0, cz * _lerp(.28, .14, t)))

    for cx in (-1, 1):
        for cz in (-1, 1):
            k.rod(corner(0, cx, cz), corner(1, cx, cz), .055, 'hazard', 8, cap=False)
    bays = 4
    for i in range(bays):
        t0, t1 = i / bays, (i + 1) / bays
        lo, hi = (-1, 1) if i % 2 == 0 else (1, -1)
        for cx in (-1, 1):
            k.rod(corner(t0, cx, lo), corner(t1, cx, hi), .026, 'charcoal', 8, cap=False)
        k.rod(corner(t0, lo, 1), corner(t1, hi, 1), .026, 'charcoal', 8, cap=False)
    k.box(tuple(tip + Vector((0, .1, 0))), (.4, .34, .36), 'charcoal', .06, 1)
    k.rod((0, -.5, 7.04), (0, tip.y, tip.z + .14), .02, 'gunmetal', 8, cap=False)
    # hoist rope, hook block and hook
    hx, hy = 0, tip.y + .16
    k.rod((hx, hy, tip.z - .1), (hx, hy, 3.94), .018, 'gunmetal', 8, cap=False)
    k.box((hx, hy, 3.76), (.3, .22, .36), 'hazard', .07, 1)
    k.sweep([(hx, hy, 3.58), (hx, hy, 3.36), (hx, hy + .12, 3.27), (hx, hy + .21, 3.38)], .035,
            'gunmetal', 8)


# ------------------------------------------------------------------ channel marker buoy
def buoy(k):
    k.lathe([(0, -.3), (.24, -.28), (.36, -.18), (.42, -.04), (.43, .06)], 'ember', verts=16, cap=(False, False))
    k.lathe([(.43, .06), (.43, .2)], 'white', verts=16, cap=(False, False))
    k.lathe([(.43, .2), (.41, .27), (.3, .32), (0, .33)], 'ember', verts=16, cap=(False, False))
    k.torus((0, 0, .06), .44, .035, 'rubber', 'Z', 16, 4)
    for i in range(3):
        a = math.radians(90 + i * 120)
        c, s = math.cos(a), math.sin(a)
        k.rod((c * .25, s * .25, .3), (c * .085, s * .085, .84), .03, 'white', 8, cap=False)
    k.torus((0, 0, .57), .17, .03, 'ember', 'Z', 12, 4)
    k.cyl((0, 0, .86), .14, .05, 'ember', 'Z', 12, .015)
    k.cyl((0, 0, .91), .06, .06, 'gunmetal', 'Z', 8)
    k.sphere((0, 0, .98), (.07, .07, .08), 'lamp', 10, 5)
    k.cyl((0, 0, 1.06), .05, .03, 'gunmetal', 'Z', 8)


# ------------------------------------------------------------------ container stack
def corrugated(k, origin, u, v, length, height, ribs, depth, mat, normal):
    """Corrugated sheet: `ribs` trapezoid ribs along unit u (length), extruded along unit v (height)."""
    o, u, v, n = Vector(origin), Vector(u), Vector(v), Vector(normal)
    period = length / ribs
    prof = []
    for i in range(ribs):
        s = i * period
        prof += [(s, 0), (s + period * .3, depth), (s + period * .6, 0)]
    prof.append((length, 0))
    verts, faces = [], []
    for s, d in prof:
        verts += [o + u * s + n * d, o + u * s + v * height + n * d]
    for i in range(len(prof) - 1):
        a, b = 2 * i, 2 * i + 2
        faces.append([a, b, b + 1, a + 1])
    if u.cross(v).dot(n) < 0:
        faces = [list(reversed(f)) for f in faces]
    k.mesh([tuple(p) for p in verts], faces, mat, None, recalc=False)


CONTAINERS = [  # x, y, layer, colour, yaw (degrees)
    (-.52, -1.25, 0, 'terracotta', 0), (.52, -1.25, 0, 'teal', 0),
    (-.52, 1.25, 0, 'sky', 0), (.52, 1.25, 0, 'mustard', 0),
    (-.52, -1.14, 1, 'coral', 1.5), (.52, -1.3, 1, 'mustard', -1),
    (-.52, 1.18, 1, 'teal', .8), (.52, 1.32, 1, 'terracotta', -1.6),
]


def container_stack(k):
    W, L, H = 1.0, 2.4, 1.0
    for x, y, layer, mat, yaw in CONTAINERS:
        R = Euler((0, 0, math.radians(yaw))).to_matrix()
        C = Vector((x, y, layer * H))

        def at(p):
            return C + R @ Vector(p)

        k.box(tuple(at((0, 0, H / 2))), (W, L, H), mat, .05, 1, rot=(0, 0, yaw))
        sx = 1 if x > 0 else -1
        sy = 1 if y > 0 else -1
        # ribs on the outer long wall, and across the roof on the top layer
        corrugated(k, at((sx * (W / 2 + .01), -L / 2 + .1, .08)), R @ Vector((0, 1, 0)), R @ Vector((0, 0, 1)),
                   L - .2, H - .16, 6, .035, mat, R @ Vector((sx, 0, 0)))
        if layer:
            corrugated(k, at((-W / 2 + .08, -L / 2 + .1, H + .01)), R @ Vector((0, 1, 0)), R @ Vector((1, 0, 0)),
                       L - .2, W - .16, 6, .03, mat, (0, 0, 1))
        # painted lock bars on the outer (door) end
        ye = sy * (L / 2 + .006)
        for dx, w in ((-.3, .025), (-.12, .025), (.12, .025), (.3, .025)):
            pts = [at((dx - w, ye, .1)), at((dx + w, ye, .1)), at((dx + w, ye, H - .1)), at((dx - w, ye, H - .1))]
            pane(k, pts, R @ Vector((0, sy, 0)), 'gunmetal')
