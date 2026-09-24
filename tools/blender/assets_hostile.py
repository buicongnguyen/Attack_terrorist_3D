"""Ashen Front vehicles and emplacements.

Hostile language: charcoal armour, ember-red markings and warning lights,
hazard-yellow stripes, sand-webbing sandbags, warm concrete. Barrels point +Y.
Ground/water contact at z=0 except the drone (centre of mass).
"""
import math

from assets_friendly import body_ring, loft_body, blade, wing
from assets_people import hostile_gunner


# ------------------------------------------------------------------ shared helpers
def sandbag_ring(k, center, radius, count, layers=2, bag=(.52, .3, .22), mat='webbing', gap=None, parent=None,
                 z0=0.0):
    """Ring of pillow sandbags; `gap` = (angle_deg, width_deg) leaves an opening."""
    cx, cy = center[0], center[1]
    for layer in range(layers):
        off = (180 / count) * (layer % 2)
        for i in range(count):
            a = 360 * i / count + off
            if gap and abs((a - gap[0] + 180) % 360 - 180) < gap[1] / 2:
                continue
            r = math.radians(a)
            loc = (cx + math.cos(r) * radius, cy + math.sin(r) * radius, z0 + bag[2] * (.5 + layer * .92))
            k.box(loc, bag, mat, bag[2] * .45, 2, rot=(0, 0, a + 90), parent=parent)


def clip_poly(poly, x0, x1, y0, y1):
    """Sutherland-Hodgman clip of a 2D polygon against an axis-aligned rectangle."""
    def clip(pts, inside, inter):
        out = []
        for i, p in enumerate(pts):
            q = pts[i - 1]
            if inside(p):
                if not inside(q):
                    out.append(inter(q, p))
                out.append(p)
            elif inside(q):
                out.append(inter(q, p))
        return out

    def ix(xc):
        return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]))

    def iy(yc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (yc - a[1]) / (b[1] - a[1]), yc)

    pts = poly
    for inside, inter in ((lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)),
                          (lambda p: p[1] >= y0, iy(y0)), (lambda p: p[1] <= y1, iy(y1))):
        pts = clip(pts, inside, inter)
        if len(pts) < 3:
            return []
    return pts


def hazard_panel(k, center, width, height, face='+Y', stripe=.18, base='charcoal', mat='hazard', depth=.04,
                 parent=None):
    """Charcoal plate with diagonal hazard stripes, facing +Y/-Y/+X/-X."""
    cx, cy, cz = center
    axis = face[1]
    sign = 1 if face[0] == '+' else -1
    if axis == 'Y':
        k.box(center, (width, depth, height), base, depth * .45, 1, parent=parent)
    else:
        k.box(center, (depth, width, height), base, depth * .45, 1, parent=parent)
    x0, x1, z0, z1 = -width / 2 + .03, width / 2 - .03, -height / 2 + .03, height / 2 - .03
    x = x0 - height
    while x < x1:
        poly = [(x, z0), (x + stripe, z0), (x + stripe + (z1 - z0), z1), (x + (z1 - z0), z1)]
        c = clip_poly(poly, x0, x1, z0, z1)
        if len(c) >= 3:
            if axis == 'Y':
                k.prism(c, depth * .6, mat, loc=(cx, cy + sign * depth * .5, cz), axis='Y', bevel=0, parent=parent)
            else:
                k.prism([(p[0], p[1]) for p in c], depth * .6, mat, loc=(cx + sign * depth * .5, cy, cz), axis='Y',
                        bevel=0, rot=(0, 0, 90), parent=parent)
        x += stripe * 2


def warning_light(k, loc, r=.14, mat='ember_glow', parent=None):
    x, y, z = loc
    k.cyl((x, y, z - r * .9), r * 1.05, r * .5, 'gunmetal', 'Z', 12, r * .15, parent=parent)
    k.sphere((x, y, z), (r, r, r * 1.1), mat, 12, 6, parent=parent)
    for a in (0, 90):
        k.torus((x, y, z), r * 1.05, r * .12, 'gunmetal', 'X', 12, 4, rot=(0, 0, a), parent=parent)


def pillow(k, loc, size, mat, rot=None, parent=None):
    k.box(loc, size, mat, min(size) * .45, 2, rot=rot, parent=parent)


# ------------------------------------------------------------------ bank gun
def cannon(k):
    k.cyl((0, 0, .09), 1.05, .18, 'bunker_dark', 'Z', 10, .05)
    sandbag_ring(k, (0, 0), .84, 9, 2, (.5, .3, .22), z0=.18)
    turret = k.joint('Turret', (0, 0, .6))
    k.cyl((0, 0, .6), .56, .16, 'gunmetal', 'Z', 16, .04, parent=turret)
    k.tbox((0, -.05, .88), (.74, .8), (.86, 1.02), .42, 'charcoal', .12, 2, parent=turret)
    k.tbox((0, .44, .93), (.98, .14), (1.1, .2), .6, 'char_light', .06, 2, shift=(0, -.08), parent=turret)
    k.box((0, .53, 1.02), (.9, .05, .12), 'ember', .025, 1, rot=(8, 0, 0), parent=turret)
    for side in (-1, 1):
        k.box((side * .53, .43, .82), (.1, .16, .42), 'ember', .035, 1, parent=turret)
    k.cyl((0, .7, .9), .17, .5, 'charcoal', 'Y', 14, .04, parent=turret)
    k.rod((0, .9, .9), (0, 1.62, .9), .105, 'gunmetal', 12, parent=turret)
    k.cyl((0, 1.66, .9), .16, .22, 'gunmetal', 'Y', 12, .04, parent=turret)
    k.cyl((0, 1.3, .9), .125, .08, 'ember', 'Y', 12, parent=turret)
    k.joint('Muzzle', (0, 1.8, .9), turret)
    for side in (-1, 1):
        k.rod((side * .22, .55, .75), (side * .22, 1.05, .78), .05, 'steel', 8, parent=turret)
    k.box((.22, -.3, 1.14), (.24, .3, .16), 'gunmetal', .05, 2, parent=turret)
    warning_light(k, (-.25, -.35, 1.24), .1, parent=turret)
    k.box((0, -.55, .8), (.5, .2, .3), 'ash', .06, 2, parent=turret)


# ------------------------------------------------------------------ missile bunker
def launcher(k):
    k.box((0, 0, .12), (3.2, 2.7, .24), 'bunker_dark', .08, 2)
    k.tbox((0, 0, .9), (2.5, 2.1), (2.85, 2.4), 1.32, 'bunker', .16, 2)
    k.box((0, 0, 1.64), (3.0, 2.55, .2), 'charcoal', .08, 2)
    k.box((0, 0, 1.52), (2.66, 2.26, .08), 'ember', .03, 1)
    # front: door with ember frame, hazard stripes along the base
    k.box((0, 1.13, .82), (1.0, .14, 1.15), 'ember', .05, 2)
    k.box((0, 1.19, .8), (.78, .06, 1.02), 'charcoal', .03, 1)
    k.box((0, 1.23, .95), (.46, .03, .14), 'gunmetal', .01, 1)
    for side in (-1, 1):
        hazard_panel(k, (side * .98, 1.3, .38), .8, .26, '+Y', .12)
        k.box((side * 1.28, 0, .88), (.06, 1.2, .5), 'charcoal', .02, 1)
        for dy in (-.35, 0, .35):
            k.box((side * 1.31, dy, .88), (.04, .16, .42), 'char_light', .01, 1)
        pillow(k, (side * 1.5, 1.35, .35), (.55, .32, .24), 'webbing', rot=(0, 0, 90 + side * 15))
        pillow(k, (side * 1.48, 1.3, .58), (.5, .3, .22), 'webbing', rot=(0, 0, 90 - side * 10))
    # launch rack: three tubes angled up toward +Y
    k.box((0, -.15, 1.86), (2.3, 1.5, .24), 'gunmetal', .08, 2)
    for side in (-1, 1):
        k.box((side * 1.0, -.25, 2.2), (.14, 1.2, .5), 'charcoal', .05, 2, rot=(32, 0, 0))
    for x in (-.62, 0, .62):
        k.lathe([(.25, -.92), (.28, -.86), (.28, .82), (.31, .86), (.31, .96), (.26, 1.0)], 'charcoal',
                (x, -.05, 2.35), 'Y', 14, rot=(32, 0, 0))
        k.lathe([(0, .7), (.2, .72), (.2, .86), (.14, 1.0), (.05, 1.08), (0, 1.1)], 'ember',
                (x, -.05, 2.35), 'Y', 12, rot=(32, 0, 0))
    # warning light mast
    k.rod((1.2, -.95, 1.74), (1.2, -.95, 2.7), .05, 'gunmetal', 8)
    warning_light(k, (1.2, -.95, 2.86), .17)
    k.box((-1.1, -.9, 1.86), (.5, .4, .24), 'ash', .07, 2)


# ------------------------------------------------------------------ contact mine
def mine(k):
    k.sphere((0, 0, .12), (.5, .5, .48), 'charcoal', 18, 9)
    k.torus((0, 0, .12), .5, .045, 'ember', 'Z', 24, 6)
    horns = []
    for i in range(6):
        a = math.radians(i * 60)
        horns.append((math.cos(a), math.sin(a), .35))
    horns += [(math.cos(math.radians(30 + i * 120)) * .5, math.sin(math.radians(30 + i * 120)) * .5, .8)
              for i in range(3)]
    for hx, hy, hz in horns:
        d = (hx, hy, hz)
        n = math.sqrt(sum(c * c for c in d))
        d = tuple(c / n for c in d)
        a = tuple(c * .42 for c in d)
        b = tuple(c * .68 for c in d)
        k.rod((a[0], a[1], a[2] + .12), (b[0], b[1], b[2] + .12), .055, 'steel', 8)
        k.sphere((b[0], b[1], b[2] + .12), .085, 'ember', 10, 5)
    k.cyl((0, 0, .6), .16, .06, 'gunmetal', 'Z', 12, .02)
    k.sphere((0, 0, .68), (.12, .12, .1), 'ember_glow', 12, 6)
    k.torus((0, 0, -.2), .3, .05, 'gunmetal', 'Z', 16, 5)


# ------------------------------------------------------------------ AA truck
def truck_base(k, length=3.1, width=1.6, cab_y=.95, wheel_r=.42, body='charcoal', parent=None):
    """Chunky hostile truck chassis, cab at +Y."""
    k.box((0, 0, .66), (width - .1, length - .1, .34), body, .1, 2, parent=parent)
    k.box((0, 0, .5), (width - .3, length - .5, .2), 'gunmetal', .06, 1, parent=parent)
    for side in (-1, 1):
        for y in (length * .32, -length * .32):
            k.wheel((side * (width / 2 - .02), y, wheel_r), wheel_r, .34, 'tyre', 'ash', 'gunmetal', parent,
                    lugs=0, verts=16, sides=side)
            k.box((side * (width / 2 - .02), y, wheel_r + wheel_r * .72), (.4, wheel_r * 2.3, .1), body, .04, 1,
                  parent=parent)
    # cab
    cy = cab_y
    k.tbox((0, cy, 1.18), (width - .22, .82), (width - .1, 1.0), .72, body, .14, 2, shift=(0, -.08),
           parent=parent)
    k.tbox((0, cy + .02, 1.3), (width - .19, .8), (width - .13, .92), .28, 'glass_dark', .06, 2,
           shift=(0, -.07), parent=parent)
    k.box((0, cy + .48, .74), (width - .05, .16, .3), 'gunmetal', .06, 2, parent=parent)
    for side in (-1, 1):
        k.cyl((side * (width / 2 - .3), cy + .55, .8), .1, .06, 'lamp', 'Y', 12, parent=parent)
    k.box((0, cy + .56, .62), (width - .2, .06, .1), 'ember', .025, 1, parent=parent)
    k.box((0, cy, 1.55), (width - .3, .7, .06), 'ember', .03, 1, parent=parent)


def aa_truck(k):
    truck_base(k)
    k.box((0, -.6, .96), (1.46, 1.75, .28), 'ash', .08, 2)
    for side in (-1, 1):
        k.box((side * .74, -.6, 1.02), (.06, 1.6, .16), 'ember', .02, 1)
    t = k.joint('TruckTurret', (0, -.6, 1.12))
    k.cyl((0, -.6, 1.15), .5, .12, 'gunmetal', 'Z', 16, .03, parent=t)
    k.box((0, -.6, 1.32), (.5, .6, .26), 'charcoal', .08, 2, parent=t)
    for side in (-1, 1):
        x = side * .42
        k.box((side * .24, -.6, 1.42), (.12, .4, .3), 'gunmetal', .04, 1, parent=t)
        k.lathe([(.16, -.7), (.19, -.66), (.19, .6), (.21, .64), (.21, .7)], 'charcoal', (x, -.6, 1.55), 'Y', 12,
                rot=(28, 0, 0), parent=t)
        k.lathe([(0, .46), (.15, .48), (.15, .6), (.1, .74), (0, .8)], 'ember', (x, -.6, 1.55), 'Y', 12,
                rot=(28, 0, 0), parent=t)
    k.rod((0, -.95, 1.4), (0, -.95, 1.75), .05, 'gunmetal', 8, parent=t)
    k.lathe([(0, 0), (.3, .06), (.36, .13), (.33, .15), (0, .08)], 'ash', (0, -.95, 1.85), 'Y', 14,
            rot=(-20, 0, 0), parent=t)
    k.torus((0, -.9, 1.87), .34, .03, 'ember', 'Y', 16, 4, rot=(-20, 0, 0), parent=t)
    k.sphere((0, -.82, 1.9), .05, 'ember_glow', 8, 4, parent=t)


# ------------------------------------------------------------------ hostile drone
DRONE = [
    (1.02, 0, 0, 0, 0),
    (.9, .2, .18, 0, .18),
    (.5, .34, .28, 0, .26),
    (-.2, .34, .28, .02, .24),
    (-.75, .22, .18, .05, .14),
    (-1.0, .08, .08, .06, .06),
    (-1.05, 0, 0, .06, 0),
]


def drone(k):
    loft_body(k, DRONE, 'charcoal', 0, math.pi, 14, cap=(False, False), n=2.3)
    loft_body(k, DRONE, 'char_light', math.pi, math.tau, 14, cap=(False, False), n=2.3)
    k.sphere((0, .86, -.06), (.17, .16, .16), 'gunmetal', 12, 6)
    k.sphere((0, .97, -.07), (.13, .1, .13), 'ember_glow', 12, 6)
    k.box((0, .15, .3), (.1, .9, .04), 'ember', .02, 1)
    for side in (-1, 1):
        wing(k, side * .2, side * 1.55, .0, .62, .44, .1, .07, .06, .12, 'ash', .1, 2, 12)
        wing(k, side * 1.35, side * 1.62, -.08, .46, .4, .08, .08, .12, .13, 'ember', .04, 1, 12)
        k.lathe([(0, -.35), (.06, -.3), (.06, .22), (.03, .3), (0, .33)], 'charcoal', (side * .8, .05, -.08), 'Y',
                8)
        k.cyl((side * .8, .36, -.08), .045, .06, 'ember', 'Y', 8)
        k.box((side * .8, .05, .0), (.04, .3, .08), 'gunmetal', .015, 1)
        # V-tail
        k.box((side * .24, -.88, .2), (.36, .3, .05), 'ash', .02, 1, rot=(0, side * -35, 0))
        k.box((side * .38, -.9, .3), (.1, .26, .04), 'ember', .015, 1, rot=(0, side * -35, 0))
    k.cyl((0, -.1, .28), .07, .22, 'gunmetal', 'Z', 8)
    rotor = k.joint('DroneRotor', (0, -.1, .42))
    k.cyl((0, -.1, .42), .14, .1, 'char_light', 'Z', 12, .03, parent=rotor)
    for a in (0, 180):
        blade(k, (0, -.1, .44), 1.0, .18, .045, a + 30, 'charcoal', rotor, 'Z', 5, r0=.12)
        blade(k, (0, -.1, .445), .22, .19, .05, a + 30, 'ember', rotor, 'Z', 5, r0=1.1)


# ------------------------------------------------------------------ rooftop AA nest
def aa_nest(k):
    k.cyl((0, 0, .04), 1.2, .08, 'bunker_dark', 'Z', 20, .03)
    sandbag_ring(k, (0, 0), 1.08, 12, 2, (.5, .3, .22), z0=.08)
    t = k.joint('Turret', (0, 0, .3))
    k.cyl((0, 0, .3), .42, .12, 'gunmetal', 'Z', 14, .03, parent=t)
    k.cyl((0, -.05, .55), .12, .4, 'gunmetal', 'Z', 10, parent=t)
    k.box((0, -.42, .62), (.42, .32, .12), 'charcoal', .05, 2, parent=t)
    k.box((0, -.55, .82), (.42, .1, .36), 'charcoal', .04, 1, parent=t)
    k.box((0, .02, .86), (.62, .5, .3), 'charcoal', .1, 2, rot=(45, 0, 0), parent=t)
    k.box((0, .22, .86), (.7, .08, .44), 'char_light', .03, 1, rot=(45, 0, 0), parent=t)
    k.box((0, .25, .87), (.54, .05, .1), 'ember', .02, 1, rot=(45, 0, 0), parent=t)
    c = math.cos(math.radians(45))
    for side, name in ((-1, 'L'), (1, 'R')):
        x = side * .19
        a = (x, .1, .9)
        b = (x, .1 + 1.15 * c, .9 + 1.15 * c)
        k.rod(a, b, .075, 'gunmetal', 10, parent=t)
        mid = (x, .1 + .9 * c, .9 + .9 * c)
        k.rod(mid, (x, .1 + 1.05 * c, .9 + 1.05 * c), .1, 'ember', 10, parent=t)
        k.cyl(b, .1, .12, 'gunmetal', 'Y', 10, rot=(45, 0, 0), parent=t)
        k.joint('Muzzle' + name, (x, .1 + 1.22 * c, .9 + 1.22 * c), t)
        k.box((side * .48, -.05, .72), (.24, .36, .26), 'ash', .06, 2, parent=t)
        k.box((side * .48, .13, .72), (.2, .02, .08), 'ember', .01, 1, parent=t)


# ------------------------------------------------------------------ jammer relay mast
def relay_mast(k):
    k.box((0, 0, .36), (1.4, 1.4, .72), 'charcoal', .12, 2)
    k.box((0, 0, .76), (1.2, 1.2, .1), 'gunmetal', .04, 1)
    for side in (-1, 1):
        k.box((0, side * .71, .4), (.9, .05, .3), 'ember', .02, 1)
        k.box((side * .71, 0, .4), (.05, .9, .3), 'ember', .02, 1)
        for dx in (-.25, 0, .25):
            k.box((dx, side * .71, .16), (.16, .03, .12), 'char_light', .01, 1)
    k.box((.35, -.35, 1.0), (.4, .4, .4), 'ash', .08, 2)
    # triangular lattice: legs banded ember/white, zig-zag braces
    legs = []
    for i in range(3):
        a = math.radians(90 + i * 120)
        legs.append(a)
    z0, z1, r0, r1 = .8, 4.7, .5, .12
    bands = 6
    for a in legs:
        for b in range(bands):
            t0, t1 = b / bands, (b + 1) / bands
            p0 = (math.cos(a) * (r0 + (r1 - r0) * t0), math.sin(a) * (r0 + (r1 - r0) * t0), z0 + (z1 - z0) * t0)
            p1 = (math.cos(a) * (r0 + (r1 - r0) * t1), math.sin(a) * (r0 + (r1 - r0) * t1), z0 + (z1 - z0) * t1)
            k.rod(p0, p1, .065, 'ember' if b % 2 == 0 else 'white', 8)
    steps = 7
    for s in range(steps):
        t0, t1 = s / steps, (s + 1) / steps
        for i in range(3):
            a, b2 = legs[i], legs[(i + 1) % 3]
            r_a, r_b = r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1
            p = (math.cos(a) * r_a, math.sin(a) * r_a, z0 + (z1 - z0) * t0)
            q = (math.cos(b2) * r_b, math.sin(b2) * r_b, z0 + (z1 - z0) * t1)
            k.rod(p, q, .03, 'gunmetal', 6)
    k.cyl((0, 0, 4.72), .2, .1, 'gunmetal', 'Z', 12, .02)
    # spinning dish on an arm
    dish = k.joint('Dish', (0, 0, 3.4))
    k.cyl((0, 0, 3.4), .16, .22, 'gunmetal', 'Z', 12, .03, parent=dish)
    k.rod((0, 0, 3.4), (0, .42, 3.4), .05, 'gunmetal', 8, parent=dish)
    k.lathe([(0, 0), (.25, .03), (.44, .1), (.5, .16), (.47, .18), (.24, .08), (0, .05)], 'white',
            (0, .42, 3.4), 'Y', 18, parent=dish)
    k.torus((0, .58, 3.4), .49, .03, 'ember', 'Y', 18, 4, parent=dish)
    k.rod((0, .5, 3.4), (0, .82, 3.4), .025, 'gunmetal', 6, parent=dish)
    k.sphere((0, .84, 3.4), .06, 'ember', 8, 4, parent=dish)
    # blinking top light
    beacon = k.joint('Beacon', (0, 0, 4.98))
    k.cyl((0, 0, 4.82), .15, .12, 'gunmetal', 'Z', 12, .03, parent=beacon)
    k.sphere((0, 0, 4.98), (.17, .17, .19), 'beacon', 12, 6, parent=beacon)
    k.rod((.1, 0, 4.76), (.14, 0, 5.4), .018, 'gunmetal', 6)


# ------------------------------------------------------------------ technical pickup
def technical(k):
    L, W = 4.3, 1.95
    k.box((0, 0, .7), (W - .1, L - .1, .36), 'charcoal', .1, 2)
    k.box((0, 0, .52), (W - .35, L - .7, .2), 'gunmetal', .06, 1)
    for side in (-1, 1):
        for y in (1.35, -1.3):
            k.wheel((side * .9, y, .44), .44, .36, 'tyre', 'ash', 'gunmetal', None, lugs=0, verts=16, sides=side)
            k.box((side * .92, y, .96), (.34, 1.02, .1), 'charcoal', .04, 1)
    # hood and cab
    k.tbox((0, 1.62, .98), (W - .2, 1.0), (W - .1, 1.05), .22, 'charcoal', .1, 2)
    k.box((0, 1.64, 1.1), (.5, .9, .04), 'ember', .02, 1)
    k.tbox((0, .52, 1.4), (W - .3, .95), (W - .12, 1.2), .78, 'charcoal', .14, 2, shift=(0, -.1))
    k.tbox((0, .53, 1.5), (W - .27, .92), (W - .15, 1.1), .3, 'glass_dark', .06, 2, shift=(0, -.08))
    k.box((0, .44, 1.8), (W - .45, .76, .05), 'ember', .025, 1)
    # bull bar and lights
    k.sweep([(-.8, 2.2, .55), (-.8, 2.3, .95), (.8, 2.3, .95), (.8, 2.2, .55)], .06, 'gunmetal', 8)
    k.box((0, 2.2, .72), (1.4, .08, .08), 'gunmetal', .03, 1)
    for side in (-1, 1):
        k.cyl((side * .62, 2.14, .92), .11, .06, 'lamp', 'Y', 12)
        k.box((side * .9, -2.12, .9), (.16, .06, .1), 'ember_glow', .02, 1)
    # bed with ember-striped walls
    for side in (-1, 1):
        k.box((side * .9, -1.08, 1.08), (.12, 2.0, .42), 'charcoal', .05, 2)
        k.box((side * .965, -1.08, 1.12), (.02, 1.9, .1), 'ember', .01, 1)
    k.box((0, -2.08, 1.08), (1.9, .12, .42), 'charcoal', .05, 2)
    hazard_panel(k, (0, -2.15, 1.08), 1.2, .24, '-Y', .12)
    k.box((0, -1.08, .9), (1.7, 2.0, .06), 'gunmetal', .02, 1)
    k.cyl((-.5, -1.7, 1.0), .28, .22, 'tyre', 'Z', 14, .06)
    # pintle gun with a gunner on the Turret
    t = k.joint('Turret', (0, -.95, .95))
    k.cyl((0, -.95, 1.22), .07, .56, 'gunmetal', 'Z', 8, parent=t)
    k.box((0, -.85, 1.56), (.22, .7, .22), 'gunmetal', .06, 2, parent=t)
    k.rod((0, -.5, 1.58), (0, .35, 1.58), .06, 'gunmetal', 8, parent=t)
    k.cyl((0, .38, 1.58), .085, .12, 'charcoal', 'Y', 8, parent=t)
    k.box((0, -.55, 1.66), (.7, .06, .44), 'char_light', .03, 1, parent=t)
    k.box((0, -.52, 1.78), (.56, .03, .08), 'ember', .01, 1, parent=t)
    k.box((.18, -.85, 1.4), (.18, .22, .16), 'ash', .04, 1, parent=t)
    hostile_gunner(k, (0, -1.52, .93), .78, parent=t)


# ------------------------------------------------------------------ attack skiff
SKIFF = [  # y, half-width, deck z, keel z
    (-2.1, .72, .46, -.08),
    (-1.4, .8, .45, -.16),
    (.4, .8, .46, -.18),
    (1.3, .66, .52, -.12),
    (1.85, .38, .6, .02),
    (2.12, .08, .66, .2),
]


def skiff_ring(w, top, keel):
    right = [(w * .45, keel + .05), (w * .92, keel + .2), (w, keel + (top - keel) * .6), (w * .97, top)]
    pts = [(0, keel)] + right + [(0, top + .01)]
    return pts + [(-x, z) for x, z in reversed(pts[1:-1])]


def skiff(k):
    rings = [[(x, y, z) for x, z in skiff_ring(w, top, keel)] for y, w, top, keel in SKIFF]
    k.skin(rings, 'charcoal', None, True, True)
    for side in (-1, 1):
        strip = []
        for y, w, top, keel in SKIFF[:-1]:
            z0, z1 = keel + (top - keel) * .55, keel + (top - keel) * .8
            strip.append([(side * (w * .995 + .012), y, z) for z in (z0, z1)])
        k.skin(strip, 'ember', None, False, False, closed=False)
    deck = [[(x, y, z) for x, z in ((-w, top), (w, top), (w, top + .04), (-w, top + .04))]
            for y, w, top in ((-2.02, .6, .44), (1.3, .56, .5), (1.8, .28, .58))]
    k.skin(deck, 'char_light', None, True, True)
    rail = [(.76, -2.1, .5), (.78, .4, .5), (.64, 1.3, .56), (.36, 1.86, .64)]
    k.sweep([(-x, y, z) for x, y, z in rail] + [(0, 2.14, .68)] + list(reversed(rail)), .05, 'rubber', 8)
    # outboard motor
    k.box((0, -2.28, .75), (.42, .5, .55), 'charcoal', .14, 2)
    k.box((0, -2.28, .9), (.43, .51, .1), 'ember', .04, 1)
    k.box((0, -2.3, .24), (.14, .22, .7), 'gunmetal', .05, 1)
    k.box((0, -1.6, .72), (.5, .5, .5), 'ash', .1, 2)
    # bow gun and gunner on the Turret
    t = k.joint('Turret', (0, .5, .48))
    k.cyl((0, .5, .74), .06, .5, 'gunmetal', 'Z', 8, parent=t)
    k.box((0, .6, 1.02), (.2, .6, .2), 'gunmetal', .06, 2, parent=t)
    k.rod((0, .9, 1.04), (0, 1.62, 1.04), .055, 'gunmetal', 8, parent=t)
    k.cyl((0, 1.64, 1.04), .08, .1, 'charcoal', 'Y', 8, parent=t)
    k.box((0, .88, 1.1), (.62, .05, .38), 'char_light', .025, 1, parent=t)
    k.box((0, .9, 1.22), (.48, .03, .08), 'ember', .01, 1, parent=t)
    hostile_gunner(k, (0, .08, .48), .74, parent=t)


# ------------------------------------------------------------------ gate tower (boss)
def gate_tower(k):
    k.box((0, 0, .3), (3.5, 3.5, .6), 'bunker_dark', .12, 2)
    k.box((0, 0, 3.0), (3.0, 3.0, 4.8), 'bunker', .2, 2)
    for z in (1.4, 3.3):
        k.box((0, 0, z), (3.1, 3.1, .22), 'charcoal', .07, 1)
    for ang in (0, 90, 180, 270):
        r = math.radians(ang)
        dx, dy = round(math.sin(r)), round(math.cos(r))
        along_x = abs(dy) > 0
        for off in (-.7, .7):
            px, py = dx * 1.52 + dy * off, dy * 1.52 - dx * off
            k.box((px, py, 2.35), (.36, .08, 1.62) if along_x else (.08, .36, 1.62), 'ember', .03, 1)
        sx, sy = dx * 1.52, dy * 1.52
        k.box((sx, sy, 4.45), (.8, .08, .26) if along_x else (.08, .8, .26), 'charcoal', .03, 1)
        k.box((sx * 1.012, sy * 1.012, 4.45), (.6, .05, .1) if along_x else (.05, .6, .1), 'ember_glow', .02, 1)
    hazard_panel(k, (0, 1.77, .3), 3.2, .4, '+Y', .22)
    # crenellated parapet
    k.box((0, 0, 5.52), (3.2, 3.2, .3), 'charcoal', .1, 2)
    for i in range(12):
        side = i // 3
        t = (i % 3 - 1) * 1.0
        pos = [(t, 1.42), (1.42, t), (t, -1.42), (-1.42, t)][side]
        k.box((pos[0], pos[1], 5.86), (.56, .56, .42), 'char_light', .1, 2)
    # heavy twin cannon turret
    t = k.joint('Turret', (0, 0, 5.72))
    k.cyl((0, 0, 5.8), 1.05, .2, 'gunmetal', 'Z', 20, .05, parent=t)
    k.tbox((0, -.1, 6.25), (1.5, 1.5), (1.9, 2.1), .78, 'charcoal', .2, 2, shift=(0, -.1), parent=t)
    k.box((0, .88, 6.2), (1.3, .1, .24), 'ember', .04, 1, parent=t)
    k.box((0, -.05, 6.66), (.8, .8, .1), 'char_light', .05, 1, parent=t)
    warning_light(k, (.55, -.65, 6.8), .13, parent=t)
    for x in (-.36, .36):
        k.cyl((x, 1.02, 6.3), .24, .5, 'charcoal', 'Y', 14, .05, parent=t)
        k.rod((x, 1.2, 6.3), (x, 2.55, 6.3), .15, 'gunmetal', 12, parent=t)
        k.cyl((x, 2.62, 6.3), .22, .3, 'gunmetal', 'Y', 12, .05, parent=t)
        k.cyl((x, 1.9, 6.3), .17, .1, 'ember', 'Y', 12, parent=t)
    k.joint('Muzzle', (0, 2.82, 6.3), t)


# ------------------------------------------------------------------ river lock gate
def gate_leaf(k, hinge_x, sign, pivot):
    """One door leaf from x=hinge_x to x=0 (sign = +1 for the left leaf)."""
    x0, x1 = hinge_x, -.04 * sign
    cx, w = (x0 + x1) / 2, abs(x1 - x0)
    k.box((cx, 0, 1.8), (w, .56, 5.6), 'char_light', .1, 2, parent=pivot)
    for z in (.2, 1.8, 3.4):
        k.box((cx, 0, z), (w - .1, .78, .36), 'charcoal', .08, 2, parent=pivot)
        k.box((cx, .4, z), (w - .5, .04, .1), 'ember', .02, 1, parent=pivot)
        k.box((cx, -.4, z), (w - .5, .04, .1), 'ember', .02, 1, parent=pivot)
    for i in range(5):
        x = x0 + sign * (1.0 + i * 1.75)
        k.box((x, 0, 1.8), (.2, .7, 5.3), 'charcoal', .06, 1, parent=pivot)
    k.box((x0 + sign * .15, 0, 1.8), (.34, .9, 5.7), 'gunmetal', .1, 2, parent=pivot)
    for face in ('+Y', '-Y'):
        hazard_panel(k, (x1 - sign * .7, (.3 if face == '+Y' else -.3), 4.2), 1.2, .9, face, .2, parent=pivot)
    k.box((cx, 0, 4.66), (w, .66, .12), 'gunmetal', .04, 1, parent=pivot)


def lock_gate(k):
    # piers beyond each hinge
    for side in (-1, 1):
        x = side * 9.9
        k.box((x, 0, 2.2), (1.8, 3.4, 6.4), 'bunker', .16, 2)
        k.box((x, 0, 5.5), (2.0, 3.6, .3), 'charcoal', .08, 2)
        k.box((x, 0, -.6), (2.1, 3.7, 1.2), 'bunker_dark', .12, 2)
        for face in (1, -1):
            hazard_panel(k, (x, face * 1.72, 1.0), 1.4, .5, '+Y' if face > 0 else '-Y', .2)
            k.box((x, face * 1.72, 3.6), (.34, .06, 1.8), 'ember', .02, 1)
        warning_light(k, (x + side * .5, 1.3, 5.84), .16)
    gl = k.joint('GateL', (-9.0, 0, 0))
    gr = k.joint('GateR', (9.0, 0, 0))
    gate_leaf(k, -9.0, 1, gl)
    gate_leaf(k, 9.0, -1, gr)
    # overhead gantry walkway
    for y in (-.95, .95):
        k.box((0, y, 5.9), (19.6, .3, .5), 'charcoal', .08, 2)
        k.box((0, y * 1.08, 5.9), (19.0, .04, .12), 'ember', .02, 1)
    k.box((0, 0, 5.72), (19.4, 1.7, .1), 'ash', .03, 1)
    for x in range(-8, 9, 2):
        if x == 0:
            continue
        k.box((x, 0, 6.18), (.12, 2.0, .12), 'gunmetal', .03, 1)
        k.box((x, 0, 5.72), (.18, 2.0, .16), 'charcoal', .04, 1)
    for y in (-1.02, 1.02):
        k.box((0, y, 6.45), (19.0, .06, .06), 'hazard', .02, 1)
        for x in range(-9, 10, 3):
            k.box((x, y, 6.28), (.06, .06, .36), 'hazard', .02, 1)
    # crane trolley on the gantry
    k.box((-4.2, 0, 6.35), (1.0, 2.3, .4), 'hazard', .1, 2)
    k.box((-4.2, 0, 6.6), (.8, 1.2, .2), 'charcoal', .05, 1)
    k.rod((-4.2, .4, 6.15), (-4.2, .4, 5.4), .025, 'gunmetal', 6)
    k.box((-4.2, .4, 5.3), (.2, .12, .2), 'ember', .04, 1)
    # generator housing and glowing power core (weak point)
    k.box((0, 0, 6.1), (2.4, 2.4, .5), 'charcoal', .12, 2)
    gen = k.joint('Generator', (0, 0, 6.35))
    k.cyl((0, 0, 6.42), .95, .16, 'gunmetal', 'Z', 20, .04, parent=gen)
    k.lathe([(0, 6.45), (.55, 6.5), (.62, 6.9), (.5, 7.3), (0, 7.42)], 'ember_glow', parent=gen, verts=16)
    for i in range(6):
        a = math.radians(i * 60)
        k.rod((math.cos(a) * .82, math.sin(a) * .82, 6.45), (math.cos(a) * .66, math.sin(a) * .66, 7.35), .06,
              'gunmetal', 6, parent=gen)
    k.torus((0, 0, 7.36), .64, .07, 'gunmetal', 'Z', 18, 5, parent=gen)
    k.torus((0, 0, 6.52), .84, .07, 'ember', 'Z', 20, 5, parent=gen)
    for side in (-1, 1):
        k.sweep([(side * 1.2, .5, 6.2), (side * 4.0, .6, 6.4), (side * 8.8, .6, 6.2)], .08, 'rubber', 6)
