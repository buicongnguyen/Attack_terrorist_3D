"""Environment and civilian props: nature, city rooftops/streets, riverbank.

Chunky toy shapes with vivid warm colour: glossy lime/green foliage, terracotta,
teal, mustard, cream, sunflower hazard stripes. Origin at ground contact.
"""
import math
import random

import bmesh
from mathutils import Vector

from assets_hostile import hazard_panel, sandbag_ring
from assets_friendly import body_ring


def _rng(seed):
    return random.Random(seed)


# ------------------------------------------------------------------ foliage helpers
def frond(k, base, yaw, length, width, lift, droop, mat, segs=7, pitch=20.0, parent=None):
    """Arched palm frond: a folded leaf blade along a drooping spine."""
    base = Vector(base)
    a = math.radians(yaw)
    fwd = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-math.sin(a), math.cos(a), 0))
    verts, faces = [], []
    for i in range(segs + 1):
        t = i / segs
        h = lift * math.sin(math.pi * min(t * 1.2, 1)) - droop * t * t + math.tan(math.radians(pitch)) * t * length * .3
        p = base + fwd * (length * t) + Vector((0, 0, h))
        w = width * math.sin(math.pi * (t * .92 + .04)) * (1 - .25 * t)
        fold = w * .35
        verts += [p + side * w - Vector((0, 0, fold)), p + Vector((0, 0, .02)), p - side * w - Vector((0, 0, fold))]
    for i in range(segs):
        r0, r1 = i * 3, (i + 1) * 3
        faces += [(r0, r1, r1 + 1, r0 + 1), (r0 + 1, r1 + 1, r1 + 2, r0 + 2)]
    k.mesh([tuple(v) for v in verts], faces, mat, parent, wexp=1.0)


def blob(k, loc, radii, mat, subdiv=2, seed=0, jitter=.08, parent=None, flat_bottom=None):
    """Smooth lumpy canopy puff (UV sphere with seeded radial jitter)."""
    rng = _rng(seed)
    bm = bmesh.new()
    seg, rings = {1: (10, 6), 2: (14, 8), 3: (18, 10)}[subdiv]
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        s = 1 + rng.uniform(-jitter, jitter)
        v.co *= s
        if flat_bottom is not None and v.co.z < flat_bottom:
            v.co.z = flat_bottom + (v.co.z - flat_bottom) * .35
        v.co.x *= radii[0]
        v.co.y *= radii[1]
        v.co.z *= radii[2]
        v.co += Vector(loc)
    k._add(bm, mat, parent, None, True, wexp=1.0)


# ------------------------------------------------------------------ palm
def palm(k):
    pts = []
    for i in range(9):
        t = i / 8
        pts.append(Vector((.5 * t * t, .1 * t, .12 + 2.62 * t)))
    for i in range(8):
        r0 = .21 - .08 * (i / 8)
        r1 = .21 - .08 * ((i + 1) / 8)
        k.capsule(pts[i], pts[i + 1], r0 * 1.08, r1 * .92, 'palm_bark' if i % 2 == 0 else 'wood_light', 10, 2)
    top = pts[-1] + Vector((0, 0, .12))
    k.sphere(tuple(top), (.2, .2, .16), 'palm_bark', 10, 6)
    for i, (dx, dy) in enumerate(((.16, .02), (-.08, .14), (-.06, -.14))):
        k.sphere((top.x + dx, top.y + dy, top.z - .14), .14, 'coconut', 10, 6)
    for i in range(8):
        yaw = i * 45 + (12 if i % 2 else 0)
        L = 1.9 if i % 2 == 0 else 1.6
        frond(k, tuple(top + Vector((0, 0, .05))), yaw, L, .36, .38, 1.15, 'lime' if i % 2 else 'foliage', 7)
    frond(k, tuple(top + Vector((0, 0, .08))), 70, .9, .22, .55, .2, 'lime', 5, 50)
    frond(k, tuple(top + Vector((0, 0, .08))), 250, .9, .22, .55, .2, 'foliage', 5, 50)
    k.cyl((0, 0, .06), .34, .12, 'sand', 'Z', 12, .05)


# ------------------------------------------------------------------ rock
def rock(k):
    def chunk(center, size, seed, cuts=7, moss=True):
        rng = _rng(seed)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts:
            v.co.x *= size[0]
            v.co.y *= size[1]
            v.co.z *= size[2]
        k.bevel(bm, min(size) * .3, 2)
        for _ in range(cuts):
            n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.2, 1))).normalized()
            d = max(abs(n.x) * size[0], abs(n.y) * size[1], abs(n.z) * size[2]) * .5 * rng.uniform(.72, .86)
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=n * d, plane_no=n, clear_outer=True)
            cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
            if cut:
                bmesh.ops.holes_fill(bm, edges=cut, sides=0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        top_faces = [f for f in bm.faces if f.normal.z > .82 and f.calc_area() > .02]
        moss_bm = None
        if moss and top_faces:
            moss_bm = bmesh.new()
            vmap = {}
            for f in top_faces:
                vs = []
                for v in f.verts:
                    if v not in vmap:
                        vmap[v] = moss_bm.verts.new(v.co + Vector((0, 0, .025)))
                    vs.append(vmap[v])
                try:
                    moss_bm.faces.new(vs)
                except ValueError:
                    pass
            moss_bm.transform(_translate(center))
        bm.transform(_translate(center))
        k._add(bm, 'rock', None, None, True, 38, 2.0)
        if moss_bm is not None:
            k._add(moss_bm, 'moss', None, None, True, 38, 2.0)

    chunk((0, 0, .72), (2.3, 1.8, 1.7), 11)
    chunk((.95, -.55, .42), (1.0, .9, .95), 5, 6)
    chunk((-.95, .55, .28), (.7, .65, .6), 3, 5, False)


def _translate(v):
    from mathutils import Matrix
    return Matrix.Translation(Vector(v))


# ------------------------------------------------------------------ relief crate
def relief_leaf(k, loc, scale, mat, axis='Z', rot=0.0, parent=None):
    leaf = [(-.3, -.05), (-.18, .12), (0, .22), (.18, .24), (.32, .2), (.24, .02), (.08, -.12), (-.1, -.16)]
    leaf = [(x * scale, y * scale) for x, y in leaf]
    if axis == 'Z':
        k.prism(leaf, .04 * scale / .5, mat, loc=loc, axis='Z', bevel=.01, rot=(0, 0, rot), parent=parent)
    else:
        k.prism(leaf, .04 * scale / .5, mat, loc=loc, axis='Y', bevel=.01, rot=(0, rot, 0), parent=parent)


def supply(k):
    k.box((0, 0, .36), (.85, .75, .68), 'white', .09, 3)
    k.box((0, 0, .72), (.88, .78, .06), 'mint', .03, 1)
    for x in (-.25, .25):
        k.box((x, 0, .37), (.1, .785, .7), 'mint', .03, 1)
    k.box((0, 0, .03), (.8, .7, .06), 'navy', .02, 1)
    k.cyl((0, 0, .765), .2, .03, 'white', 'Z', 18)
    relief_leaf(k, (0, 0, .78), .45, 'mint', 'Z', 20)
    k.cyl((0, .38, .42), .16, .02, 'mint', 'Y', 16)
    relief_leaf(k, (0, .395, .42), .32, 'white', 'Y', 20)
    for side in (-1, 1):
        k.torus((side * .44, 0, .5), .09, .025, 'sun', 'X', 12, 4, scale=(1, 1.4, 1))


# ------------------------------------------------------------------ rescue beacon
def beacon(k):
    k.cyl((0, 0, .08), .62, .16, 'navy', 'Z', 16, .05)
    for i in range(3):
        a = math.radians(90 + i * 120)
        k.rod((math.cos(a) * .55, math.sin(a) * .55, .1), (math.cos(a) * .12, math.sin(a) * .12, .9), .05, 'navy', 8)
        k.box((math.cos(a) * .58, math.sin(a) * .58, .05), (.22, .22, .1), 'sun', .04, 1, rot=(0, 0, 90 + i * 120))
    for i, z in enumerate((.4, .7, 1.0, 1.3)):
        k.cyl((0, 0, z + .15), .1, .3, 'white' if i % 2 == 0 else 'sky', 'Z', 12)
    k.cyl((0, 0, 1.66), .26, .12, 'navy', 'Z', 16, .04)
    k.sphere((0, 0, 1.92), (.24, .24, .3), 'lamp', 16, 8)
    for i in range(4):
        a = math.radians(i * 90 + 45)
        k.rod((math.cos(a) * .24, math.sin(a) * .24, 1.7), (math.cos(a) * .24, math.sin(a) * .24, 2.12), .025,
              'sun', 6)
    k.cyl((0, 0, 2.18), .28, .08, 'sun', 'Z', 16, .03)
    k.sphere((0, 0, 2.24), (.12, .12, .07), 'sun', 10, 5)
    k.box((.36, 0, 1.2), (.4, .05, .3), 'navy', .02, 1, rot=(0, -35, 0))
    k.box((.36, .03, 1.2), (.36, .02, .26), 'glass_dark', .01, 1, rot=(0, -35, 0))
    k.rod((-.1, .05, 1.7), (-.18, .1, 2.3), .015, 'gunmetal', 6)


# ------------------------------------------------------------------ roof water tank
def roof_tank(k):
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.rod((sx * .5, sy * .5, 0), (sx * .44, sy * .44, .92), .06, 'gunmetal', 8)
    for z in (.25, .6):
        for a, b in (((-.49, -.49), (.49, -.49)), ((.49, -.49), (.49, .49)), ((.49, .49), (-.49, .49)),
                     ((-.49, .49), (-.49, -.49))):
            k.rod((a[0], a[1], z), (b[0], b[1], z), .03, 'gunmetal', 6)
    k.cyl((0, 0, .96), .74, .1, 'wood_dark', 'Z', 16, .03)
    k.lathe([(0, 1.0), (.64, 1.0), (.7, 1.1), (.72, 1.5), (.7, 1.9), (.66, 2.0), (0, 2.0)], 'wood', verts=18)
    for z in (1.15, 1.5, 1.85):
        k.torus((0, 0, z), .715, .035, 'teal', 'Z', 20, 5)
    k.lathe([(0, 1.98), (.8, 1.98), (.78, 2.05), (.3, 2.34), (.08, 2.4), (0, 2.42)], 'terracotta', verts=18)
    k.sphere((0, 0, 2.46), .07, 'teal', 8, 5)
    for z in (.3, .6, .9, 1.2, 1.5, 1.8):
        k.box((.0, -.77, z), (.3, .04, .04), 'sun', .01, 1)
    for x in (-.15, .15):
        k.rod((x, -.77, .1), (x, -.77, 1.95), .025, 'sun', 6)


# ------------------------------------------------------------------ rooftop HVAC
def roof_hvac(k):
    for x in (-.6, .6):
        k.box((x, 0, .05), (.18, 1.0, .1), 'gunmetal', .03, 1)
    k.box((0, 0, .5), (1.6, 1.1, .8), 'cream', .1, 2)
    k.box((0, 0, .88), (1.5, 1.0, .06), 'teal', .03, 1)
    # side louvres
    for i in range(5):
        z = .28 + i * .1
        k.box((.25, .56, z), (.9, .04, .04), 'teal', .012, 1)
    k.box((-.55, .56, .45), (.3, .04, .36), 'gunmetal', .02, 1)
    # fan grille on top
    k.cyl((.28, 0, .93), .42, .06, 'gunmetal', 'Z', 20, .02)
    k.cyl((.28, 0, .95), .36, .04, 'charcoal', 'Z', 20)
    for i in range(3):
        a = i * 120
        k.box((.28 + math.cos(math.radians(a)) * .17, math.sin(math.radians(a)) * .17, .97), (.3, .1, .02),
              'steel', .01, 1, rot=(12, 0, a))
    for i in range(4):
        a = math.radians(i * 45)
        k.box((.28, 0, 1.0), (.8, .03, .03), 'gunmetal', .01, 1, rot=(0, 0, i * 45))
    k.torus((.28, 0, 1.0), .38, .025, 'gunmetal', 'Z', 20, 4)
    k.torus((.28, 0, 1.0), .2, .02, 'gunmetal', 'Z', 16, 4)
    k.box((-.5, 0, .98), (.36, .5, .14), 'teal', .05, 2)
    k.sweep([(-.8, -.3, .6), (-.95, -.3, .6), (-.95, -.3, .05)], .06, 'steel', 8)


# ------------------------------------------------------------------ parked car
CAR = [  # y, half-width, upper half-height, zc, lower half-height
    (-2.0, .82, .28, .62, .26),
    (-1.8, .94, .36, .6, .32),
    (1.5, .95, .34, .58, .32),
    (1.9, .88, .26, .54, .28),
    (2.02, .74, .18, .52, .22),
]


def car(k):
    rings = []
    for y, w, h, zc, b in CAR:
        rings.append([(x, y, z) for x, z in body_ring(w, h, zc, 16, 3.4, bottom=b)])
    k.skin(rings, 'car', None, True, True, wexp=1.0)
    # cabin with wrap-around windows
    k.tbox((0, -.25, 1.1), (1.46, 1.55), (1.74, 2.3), .52, 'car', .2, 2, shift=(0, -.1))
    k.tbox((0, -.24, 1.1), (1.49, 1.6), (1.76, 2.2), .32, 'glass_dark', .1, 2, shift=(0, -.1))
    k.box((0, -.33, 1.38), (1.36, 1.4, .06), 'white', .03, 1)
    for x in (-.5, .5):
        k.box((x, -.33, 1.43), (.08, 1.3, .06), 'steel', .03, 1)
    # bumpers, lights, grille
    k.box((0, 2.02, .42), (1.7, .2, .2), 'white', .09, 2)
    k.box((0, -2.02, .44), (1.7, .2, .2), 'white', .09, 2)
    for side in (-1, 1):
        k.cyl((side * .58, 2.0, .68), .13, .06, 'lamp', 'Y', 10)
        k.cyl((side * .58, 1.985, .68), .16, .05, 'white', 'Y', 10)
        k.box((side * .64, -2.03, .7), (.3, .05, .12), 'ember_glow', .02, 1)
        for y in (1.3, -1.25):
            k.wheel((side * .88, y, .38), .38, .32, 'tyre', 'white', 'gunmetal', None, 0, 14, side)
        k.box((side * .97, .1, .82), (.03, .5, .05), 'white', .012, 1)
    k.box((0, 2.05, .6), (.7, .04, .12), 'gunmetal', .02, 1)


# ------------------------------------------------------------------ barricade
def barricade(k):
    prof = [(-.3, 0), (.3, 0), (.3, .12), (.13, .28), (.1, .72), (-.1, .72), (-.13, .28), (-.3, .12)]
    k.prism(prof, 2.3, 'white', loc=(0, 0, 0), axis='X', bevel=.04)
    hazard_panel(k, (0, .115, .5), 2.1, .3, '+Y', .16, depth=.03)
    hazard_panel(k, (0, -.115, .5), 2.1, .3, '-Y', .16, depth=.03)
    k.box((0, 0, .7), (2.32, .22, .05), 'ember', .02, 1)
    for x, rz in ((-.62, 4), (0, -3), (.62, 6)):
        k.box((x, 0, .84), (.56, .3, .22), 'webbing', .1, 2, rot=(0, 0, rz))
    for x in (-1.0, 1.0):
        k.box((x, .3, .12), (.2, .1, .2), 'gunmetal', .03, 1)


# ------------------------------------------------------------------ street tree
def street_tree(k):
    k.lathe([(0, 0), (.5, 0), (.58, .08), (.62, .5), (.56, .56), (.5, .5), (0, .5)], 'terracotta', verts=18)
    k.torus((0, 0, .54), .56, .05, 'cream', 'Z', 20, 5)
    k.cyl((0, 0, .5), .5, .04, 'wood_dark', 'Z', 16)
    k.capsule((0, 0, .45), (.08, 0, 2.2), .14, .1, 'bark', 10, 2)
    k.capsule((.05, 0, 1.6), (.45, .1, 2.3), .07, .05, 'bark', 8, 2)
    blob(k, (0, 0, 2.65), (1.05, 1.0, .9), 'foliage', 3, 3, .035, flat_bottom=-.5)
    blob(k, (.45, .3, 3.0), (.62, .6, .55), 'lime', 2, 5, .04)
    blob(k, (-.42, -.2, 2.9), (.58, .56, .52), 'leaf_deep', 2, 8, .04)
    blob(k, (.1, -.35, 3.2), (.48, .46, .42), 'lime', 2, 9, .03)


# ------------------------------------------------------------------ streetlight
def streetlight(k):
    k.cyl((0, 0, .15), .26, .3, 'navy', 'Z', 12, .06)
    k.lathe([(.11, .3), (.09, .8), (.07, 3.6), (.06, 3.75)], 'teal', verts=10, cap=(False, True))
    for z in (.9, 2.4):
        k.cyl((0, 0, z), .1, .08, 'cream', 'Z', 10, .02)
    k.sweep([(0, 0, 3.7), (0, .1, 3.95), (0, .45, 4.05), (0, .95, 3.98)], .055, 'teal', 8)
    k.lathe([(0, 3.72), (.3, 3.74), (.34, 3.8), (.24, 3.96), (0, 4.0)], 'teal', (0, .95, 0), verts=14)
    k.cyl((0, .95, 3.72), .24, .06, 'lamp', 'Z', 14)
    k.box((0, .0, 1.5), (.16, .03, .5), 'sun', .01, 1)


# ------------------------------------------------------------------ fuel drums
def drum(k, loc, mat='fuel', rot=None):
    x, y, z = loc
    k.lathe([(0, 0), (.27, 0), (.3, .03), (.3, .84), (.27, .88), (0, .88)], mat, (x, y, z), verts=12, sharp=60)
    for h in (.22, .66):
        k.torus((x, y, z + h), .302, .025, 'hazard', 'Z', 12, 4)
    k.lathe([(.3, .38), (.308, .4), (.308, .48), (.3, .5)], 'hazard', (x, y, z), verts=12, cap=(False, False))
    k.cyl((x + .12, y + .08, z + .9), .06, .04, 'gunmetal', 'Z', 8)
    k.cyl((x - .1, y - .1, z + .9), .04, .04, 'gunmetal', 'Z', 8)


def fuel_drums(k):
    for x in (-.6, 0, .6):
        k.box((x, 0, .05), (.12, 1.5, .1), 'wood_dark', .02, 1)
    for y in (-.6, -.3, 0, .3, .6):
        k.box((0, y, .13), (1.5, .2, .05), 'wood_light', .02, 1)
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        drum(k, (sx * .36, sy * .36, .155))
        # hazard diamond facing out
        a = math.atan2(sy, sx)
        px, py = sx * .36 + math.cos(a) * .305, sy * .36 + math.sin(a) * .305
        k.box((px, py, .6), (.2, .03, .2), 'hazard', .02, 1, rot=(0, 45, math.degrees(a) + 90))
        k.box((px + math.cos(a) * .01, py + math.sin(a) * .01, .6), (.08, .03, .08), 'charcoal', .01, 1,
              rot=(0, 45, math.degrees(a) + 90))


# ------------------------------------------------------------------ jungle tree
def jungle_tree(k):
    rng = _rng(21)
    trunk = [(0, 0, .6), (.05, .02, 1.6), (.18, .05, 2.6), (.1, .0, 3.1)]
    k.sweep(trunk, .2, 'bark', 10, radii=[.26, .2, .17, .14])
    for i in range(6):
        a = math.radians(i * 60 + rng.uniform(-12, 12))
        r = 1.0 + rng.uniform(-.1, .2)
        pts = [(math.cos(a) * .12, math.sin(a) * .12, 1.0), (math.cos(a) * .55 * r, math.sin(a) * .55 * r, .95),
               (math.cos(a) * .9 * r, math.sin(a) * .9 * r, .5), (math.cos(a) * 1.05 * r, math.sin(a) * 1.05 * r, 0)]
        k.sweep(pts, .08, 'bark', 6, radii=[.1, .08, .07, .065])
    for i, (x, y, z, rx, ry, rz, mat, seed) in enumerate((
            (0, 0, 3.3, 1.45, 1.35, .75, 'leaf_deep', 1), (.9, .4, 3.0, .95, .9, .6, 'foliage', 2),
            (-.85, -.3, 3.05, 1.0, .9, .6, 'foliage', 3), (.2, -.9, 3.2, .85, .8, .55, 'lime', 4),
            (-.3, .8, 3.45, .8, .75, .5, 'lime', 5), (.25, .1, 3.8, .75, .7, .45, 'foliage', 6))):
        blob(k, (x, y, z), (rx, ry, rz), mat, 2, seed, .05, flat_bottom=-.45)
    for (x, y, z) in ((.9, .9, 3.3), (-1.1, .2, 3.35), (.4, -1.1, 3.4), (-.2, .5, 4.1), (1.3, -.2, 3.2)):
        k.sphere((x, y, z), .12, 'blossom', 8, 5)
    k.cyl((0, 0, .03), 1.1, .06, 'rock_dark', 'Z', 14, .02)


# ------------------------------------------------------------------ stilt house
def stilt_house(k):
    for sx in (-1.45, 0, 1.45):
        for sy in (-1.45, 0, 1.45):
            k.cyl((sx, sy, .45), .09, 1.5, 'wood_dark', 'Z', 6)
    for sy in (-1.45, 1.45):
        k.rod((-1.45, sy, -.1), (1.45, sy, .9), .05, 'wood_dark', 6)
    k.box((0, 0, 1.25), (3.5, 3.5, .16), 'wood', .04, 1)
    for i in range(5):
        k.box((-1.2 + i * .6, 0, 1.335), (.04, 3.4, .01), 'wood_dark', 0)
    # walls with vertical planks, windows and door
    k.box((0, -.35, 2.1), (2.6, 2.3, 1.6), 'teal', .06, 2)
    for i in range(6):
        x = -1.15 + i * .46
        k.box((x, .81, 2.1), (.03, .03, 1.5), 'white', 0)
    k.box((.55, .82, 1.95), (.6, .05, 1.2), 'coral', .03, 1)
    k.sphere((.35, .86, 1.95), .04, 'brass', 6, 4)
    for side in (-1, 1):
        k.box((side * 1.31, -.35, 2.25), (.05, .7, .55), 'glass_dark', .02, 1)
        k.box((side * 1.33, -.35, 2.25), (.04, .8, .06), 'mustard', .015, 1)
        for dy in (-.5, .5):
            k.box((side * 1.33, -.35 + dy * 1.08, 2.25), (.05, .18, .62), 'mustard', .02, 1)
    k.box((-.55, .81, 2.3), (.6, .05, .5), 'glass_dark', .02, 1)
    k.box((-.55, .84, 2.02), (.72, .1, .06), 'mustard', .02, 1)
    # corrugated tin gable roof
    ridge_z, eave_z = 3.95, 2.85
    half_w = 1.85
    for side in (-1, 1):
        ang = math.degrees(math.atan2(ridge_z - eave_z, half_w))
        L = math.hypot(half_w, ridge_z - eave_z) + .1
        cx, cz = side * half_w / 2, (ridge_z + eave_z) / 2 + .02
        k.box((cx, -.35, cz), (L, 2.9, .08), 'terracotta', .03, 1, rot=(0, side * ang, 0))
        for i in range(6):
            y = -1.6 + i * .5
            k.box((cx, y, cz + .05), (L - .06, .06, .05), 'coral', 0, rot=(0, side * ang, 0))
    k.prism([(-half_w - .05, eave_z - .03), (0, ridge_z - .05), (half_w + .05, eave_z - .03)], 2.3, 'teal',
            loc=(0, -.35, 0), axis='Y', bevel=.03)
    k.box((0, -.35, ridge_z + .06), (.2, 3.0, .1), 'mustard', .04, 1)
    # porch rail and ladder down to the water
    for x in (-1.65, -.8, .8, 1.65):
        k.rod((x, 1.65, 1.33), (x, 1.65, 1.85), .035, 'wood_dark', 6)
    k.box((0, 1.65, 1.85), (3.4, .06, .06), 'wood_light', .02, 1)
    for side in (-1, 1):
        k.box((side * 1.65, .6, 1.85), (.06, 2.1, .06), 'wood_light', .02, 1)
    for x in (-.25, .25):
        k.rod((x, 1.85, -.3), (x, 1.75, 1.3), .03, 'wood_light', 6)
    for z in (-.1, .25, .6, .95):
        k.box((0, 1.82, z), (.5, .04, .04), 'wood_light', .01, 1)
    k.box((1.1, 1.2, 1.55), (.36, .3, .44), 'wood_light', .04, 1)
    k.cyl((-1.2, 1.2, 1.5), .15, .4, 'terracotta', 'Z', 10, .03)
    blob(k, (-1.2, 1.2, 1.8), (.25, .25, .2), 'lime', 1, 4, .1)
