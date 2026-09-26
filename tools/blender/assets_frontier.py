"""Frontier models for the river and valley chapters.

Ashen Front: a missile transporter-erector-launcher truck, a fixed missile
launch site, a drone launch pad and a one-storey barracks hut. Riverside and
canyon nature: pine, log pile, sawmill shed, reeds and a dry shrub.

Same kit language as assets_hostile / assets_world: chunky bevelled forms,
charcoal armour with ember markings and hazard stripes, sand-webbing sandbags,
warm concrete; saturated greens and warm woods for nature. Forward is +Y,
ground contact at z=0.

These models are built lean: every exported vertex costs ~32 bytes, so
markings are painted panes, rods are smooth open sticks, sandbag rows are
single pinched sheets and small parts skip their bevels.

Missile racks hang under a `Rack` empty (identity rotation) on the hinge at
the rear of the rack. At rest the missiles lie flat pointing +Y; the runtime
raises the front end by rotating Rack about its local +X axis
(three.js `rack.rotation.x = +angle`).
"""
import math
import random

from mathutils import Matrix, Vector

from assets_harbour import corrugated, pane
from assets_hostile import clip_poly
from assets_world import blob

X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
UP = (X, Y, Z)  # decal basis for a surface facing +Z


def _rng(seed):
    return random.Random(seed)


# ------------------------------------------------------------------ painted decals
def decal(k, center, u, v, n, width, height, mat, lift=.006, parent=None):
    """Flat painted rectangle on a surface: u = width axis, v = height axis, n = facing."""
    c, u, v, n = Vector(center), Vector(u), Vector(v), Vector(n)
    pts = [c + u * sx * width / 2 + v * sy * height / 2 + n * lift for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    pane(k, [tuple(p) for p in pts], tuple(n), mat, parent)


def hazard_band(k, center, u, v, n, width, height, stripe=.16, mat='hazard', base='charcoal', lift=.006,
                parent=None):
    """Diagonal hazard stripes painted on any face (optionally over a charcoal base)."""
    c, u, v, n = Vector(center), Vector(u), Vector(v), Vector(n)
    margin = 0.0
    if base:
        decal(k, c, u, v, n, width, height, base, lift, parent)
        lift *= 2
        margin = min(.03, height * .12)
    x0, x1, y0, y1 = -width / 2 + margin, width / 2 - margin, -height / 2 + margin, height / 2 - margin
    x = x0 - (y1 - y0)
    while x < x1:
        poly = [(x, y0), (x + stripe, y0), (x + stripe + (y1 - y0), y1), (x + (y1 - y0), y1)]
        cl = clip_poly(poly, x0, x1, y0, y1)
        if len(cl) >= 3:
            pane(k, [tuple(c + u * a + v * b + n * lift) for a, b in cl], tuple(n), mat, parent)
        x += stripe * 2


def disc(k, center, r, mat, n=(0, 0, 1), verts=12, lift=0.0, parent=None, phase=0.0):
    """Flat painted disc facing n (rims, lenses, end grain, lamp faces)."""
    c, nn = Vector(center), Vector(n).normalized()
    ref = Vector((0, 0, 1)) if abs(nn.z) < .9 else Vector((1, 0, 0))
    u = nn.cross(ref).normalized()
    v = nn.cross(u)
    pts = [tuple(c + nn * lift + (u * math.cos(phase + math.tau * i / verts) + v * math.sin(phase + math.tau * i / verts)) * r)
           for i in range(verts)]
    pane(k, pts, tuple(nn), mat, parent)


def annulus(k, center, r_in, r_out, mat, verts=24, parent=None):
    """Flat painted ring facing +Z (explicit winding, so it never flips)."""
    cx, cy, cz = center
    pts, faces = [], []
    for i in range(verts):
        a = math.tau * i / verts
        pts += [(cx + math.cos(a) * r_out, cy + math.sin(a) * r_out, cz),
                (cx + math.cos(a) * r_in, cy + math.sin(a) * r_in, cz)]
    for i in range(verts):
        j = (i + 1) % verts
        faces.append([2 * i, 2 * j, 2 * j + 1, 2 * i + 1])
    k.mesh(pts, faces, mat, parent, smooth=False, recalc=False)


def chevron_mark(k, center, w, h, t, mat, lift=.006):
    """Painted launch chevron on a +Z surface pointing +Y (two parallelogram arms)."""
    cx, cy, cz = center
    z = cz + lift
    for s in (-1, 1):
        pts = [(cx + s * w, cy - h / 2, z), (cx, cy + h / 2 - t, z), (cx, cy + h / 2, z), (cx + s * w, cy - h / 2 + t, z)]
        pane(k, pts, (0, 0, 1), mat)


# ------------------------------------------------------------------ lean parts
def stick(k, a, b, r, mat, verts=6, r2=None, cap=False, parent=None):
    """Smooth-shaded tube (rods, poles, stalks): no split normals, optional end caps."""
    a, b = Vector(a), Vector(b)
    q = (b - a).to_track_quat('Z', 'Y')
    rings = []
    for p, rr in ((a, r), (b, r if r2 is None else r2)):
        rings.append([tuple(p + q @ Vector((math.cos(math.tau * i / verts) * rr, math.sin(math.tau * i / verts) * rr, 0)))
                      for i in range(verts)])
    k.skin(rings, mat, parent, cap, cap, sharp=100)


BAG_ARC = [(-1.0, .02), (-.82, .7), (0, 1.0), (.82, .7), (1.0, .02)]


def bag_chain(k, a, b, n, depth, height, z0, mat='webbing', seed=0, pinch=.62, parent=None):
    """A row of n pillow sandbags from a to b (x, y) as one pinched smooth sheet (no underside)."""
    rng = _rng(seed)
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    d = b - a
    t = d.normalized()
    side = Vector((-t.y, t.x, 0))
    w = depth / 2
    m = 2 * n + 1
    rings = []
    for i in range(m):
        p = a + d * (i / (m - 1))
        if i in (0, m - 1):
            sw, sh = .34, .36
        elif i % 2 == 0:
            sw, sh = pinch, .5
        else:
            sw, sh = rng.uniform(.95, 1.04), rng.uniform(.93, 1.06)
            p = p + side * rng.uniform(-.02, .02)
        rings.append([p + side * (px * w * sw) + Vector((0, 0, z0 + pz * height * sh)) for px, pz in BAG_ARC])
    P = len(BAG_ARC)
    faces = [[i * P + j, (i + 1) * P + j, (i + 1) * P + j + 1, i * P + j + 1] for i in range(m - 1) for j in range(P - 1)]
    k.mesh([tuple(v) for ring in rings for v in ring], faces, mat, parent, sharp=85, recalc=False)


def bag_wall(k, a, b, n, courses=2, depth=.42, height=.28, z0=0.0, seed=0, parent=None):
    """Staggered courses of pillow sandbags (course 2 inset by half a bag)."""
    a, b = Vector((a[0], a[1])), Vector((b[0], b[1]))
    step = (b - a) / n
    for c in range(courses):
        inset = step * .5 * (c % 2)
        bag_chain(k, tuple(a + inset), tuple(b - inset), n - (c % 2), depth, height, z0 + c * height * .8,
                  seed=seed * 7 + c, parent=parent)


def tyre(k, loc, r, width, side, rim='ash', parent=None, verts=10):
    """Light chunky tyre (axis X): smooth open tread band, painted rim + hub on the outer face."""
    x, y, z = loc
    w = width / 2
    k.lathe([(r * .6, -w), (r, -w * .5), (r, w * .5), (r * .6, w)], 'tyre', (x, y, z), 'X', verts, parent=parent,
            sharp=80, cap=(False, False))
    disc(k, (x + side * w * .98, y, z), r * .62, rim, (side, 0, 0), verts, parent=parent)
    disc(k, (x + side * w * 1.0, y, z), r * .24, 'gunmetal', (side, 0, 0), 6, lift=.01, parent=parent)


def beacon_light(k, loc, r=.13, mat='ember_glow', parent=None):
    """Warning light: gunmetal cup, glowing dome, one cage band."""
    x, y, z = loc
    k.lathe([(r * 1.15, z - r * 1.25), (r * 1.15, z - r * .72), (r * .85, z - r * .66)], 'gunmetal', (x, y, 0), 'Z', 8,
            parent=parent, sharp=80, cap=(False, False))
    k.sphere((x, y, z), (r, r, r * 1.15), mat, 8, 4, parent=parent)
    k.lathe([(r * 1.06, z - r * .08), (r * 1.06, z + r * .1)], 'gunmetal', (x, y, 0), 'Z', 8, parent=parent,
            sharp=80, cap=(False, False))


def fin_set(k, x, z, y, span, chord, thick, mat, radius, sweep=.08, rot0=45.0, count=4, parent=None, taper=.45):
    """Trapezoid fins around an axis parallel to Y through (x, z), each two back-to-back panes."""
    base = Vector((x, 0, z))
    prof = [(y - chord / 2, radius * .9), (y + chord / 2, radius * .9),
            (y + chord / 2 - sweep - chord * (1 - taper), span), (y - chord / 2 - sweep, span)]
    for i in range(count):
        a = math.radians(rot0 + i * 360 / count)
        rad = Vector((math.sin(a), 0, math.cos(a)))
        tan = Vector((math.cos(a), 0, -math.sin(a)))
        for sg in (1, -1):
            pts = [tuple(base + Vector((0, py, 0)) + rad * pr + tan * sg * thick / 2) for py, pr in prof]
            pane(k, pts, tuple(tan * sg), mat, parent)


def big_missile(k, x, y0, length, r, z, parent=None, verts=12, nozzle=True):
    """Ashen ballistic missile lying along +Y from its tail at y0: charcoal booster,
    ash upper stage, hazard collar, ember nose and ember fins. Returns the nose y."""
    L = length
    y1 = y0 + L
    ys, yn = y0 + L * .56, y0 + L * .78
    n = y1 - yn
    loc = (x, 0, z)
    if nozzle:
        k.lathe([(r * .5, y0 - .12), (r * .66, y0)], 'gunmetal', loc, 'Y', 8, parent=parent, cap=(True, False))
    k.lathe([(r * .8, y0), (r, y0 + .1), (r, ys)], 'charcoal', loc, 'Y', verts, parent=parent, cap=(True, False))
    k.lathe([(r, ys), (r, yn)], 'ash', loc, 'Y', verts, parent=parent, cap=(False, False))
    k.lathe([(r, yn), (r * .86, yn + n * .45), (r * .46, yn + n * .82), (0, y1)], 'ember',
            loc, 'Y', verts, parent=parent, cap=(False, False))
    k.lathe([(r * 1.04, yn - .11), (r * 1.04, yn - .03)], 'hazard', loc, 'Y', verts, parent=parent,
            cap=(False, False))
    fin_set(k, x, z, y0 + L * .09, r * 2.0, L * .11, r * .14, 'ember', r, sweep=L * .025, parent=parent)
    return y1


def dish(k, loc, r, tilt, yaw=0.0, mat='ash', tip='ember', parent=None):
    """Parabolic dish opening up, tilted `tilt` degrees about X, then yawed about Z."""
    k.lathe([(0, 0), (r * .6, r * .1), (r, r * .32), (r * .88, r * .36), (0, r * .15)], mat, loc, 'Z', 10,
            rot=(tilt, 0, yaw), parent=parent, sharp=70)
    R = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(tilt), 3, 'X')
    c = Vector(loc)
    end = c + R @ Vector((0, 0, r * .8))
    stick(k, tuple(c + R @ Vector((0, 0, r * .14))), tuple(end), r * .05, 'gunmetal', 4, parent=parent)
    k.sphere(tuple(end), r * .11, tip, 6, 3, parent=parent)


def roof_plane(k, a, b, down, thick, slab, sheet, ribs, depth=.045, parent=None):
    """Pitched roof plane with its top surface on ridge a->b and eave edge a+down..b+down:
    a slab `thick` below the plane plus a corrugated sheet whose ribs run down the slope."""
    a, b, down = Vector(a), Vector(b), Vector(down)
    u = b - a
    if u.cross(down).z < 0:
        a, b = b, a
        u = -u
    length, height = u.length, down.length
    u.normalize()
    v = down.normalized()
    n = u.cross(v)
    R = Matrix((u, v, n)).transposed()
    c = a + u * length / 2 + v * height / 2 - n * thick / 2
    k.box(tuple(c), (length, height, thick), slab, .03, 1, rot=R, parent=parent)
    corrugated(k, tuple(a + n * .004), tuple(u), tuple(v), length, height, ribs, depth, sheet, tuple(n))
    return n


def painted_window(k, c, face, w=.8, h=.5, bars=2, frame='charcoal', sill='ember'):
    """Barred window painted flush on a wall face ('+Y', '-Y', '+X', '-X')."""
    along_x = face[1] == 'Y'
    sg = 1 if face[0] == '+' else -1
    u = X if along_x else Y
    n = (0, sg, 0) if along_x else (sg, 0, 0)
    c = Vector(c)
    uu = Vector(u)
    decal(k, c, u, Z, n, w + .16, h + .16, frame, .006)
    decal(k, c, u, Z, n, w, h, 'glass_dark', .012)
    for i in range(bars):
        off = (i - (bars - 1) / 2) * w / (bars + 1)
        decal(k, c + uu * off, u, Z, n, .05, h, 'gunmetal', .018)
    if sill:
        decal(k, c - Vector((0, 0, h / 2 + .12)), u, Z, n, w + .24, .07, sill, .008)


# ------------------------------------------------------------------ missile TEL truck
def missile_truck(k):
    """Transporter-erector-launcher, 3.8 x 1.7 m: cab at +Y, twin missiles on an erector
    rack hinged at the rear top of the bed (joint `Rack` at (0, -1.62, 1.2))."""
    # chassis frame, bed deck (z .84..1.0, y -1.9..0.9), lockers between the axles
    k.box((0, -.05, .52), (1.0, 3.6, .22), 'gunmetal', .05, 1)
    k.box((0, -.5, .92), (1.66, 2.8, .16), 'charcoal', .06, 1)
    for s in (-1, 1):
        decal(k, (s * .83, -.5, .92), Y, Z, (s, 0, 0), 2.5, .06, 'ember', .004)
        k.box((s * .68, .34, .7), (.3, 1.0, .28), 'char_light', .05, 1)
        decal(k, (s * .83, .34, .7), Y, Z, (s, 0, 0), .8, .06, 'hazard', .004)
        for y in (1.3, -.62, -1.38):
            tyre(k, (s * .7, y, .4), .4, .32, s)
    # cab-over-engine cab: y .95..1.9, z .78..1.68
    cab_y, cz0, ch = 1.42, .78, .9
    k.tbox((0, cab_y, cz0 + ch / 2), (1.5, .78), (1.66, .95), ch, 'charcoal', .12, 1, shift=(0, -.06))

    def fy(z):
        t = (z - cz0) / ch
        return cab_y - .06 * t + (.95 - .17 * t) / 2

    fn = Vector((0, 1, .16)).normalized()
    k.tbox((0, 1.39, 1.42), (1.555, .83), (1.605, .885), .3, 'glass_dark', .05, 1, shift=(0, -.02))
    decal(k, (0, 1.36, 1.68), *UP, 1.1, .44, 'ember')
    beacon_light(k, (0, 1.2, 1.84), .12)
    stick(k, (-.6, 1.1, 1.66), (-.64, 1.02, 2.35), .014, 'gunmetal', 4)
    k.box((0, fy(.66) + .04, .66), (1.72, .2, .22), 'gunmetal', .06, 1)
    k.box((0, fy(1.0), 1.0), (.9, .06, .26), 'gunmetal', 0)
    for i in range(3):
        decal(k, (0, fy(1.0) + .03, .92 + i * .08), X, Z, Y, .8, .03, 'char_light', .004)
    decal(k, (0, fy(1.19), 1.19), X, Z, tuple(fn), 1.42, .06, 'ember', .008)
    for s in (-1, 1):
        disc(k, (s * .6, fy(.95), .95), .1, 'lamp', tuple(fn), 8, lift=.01)
        k.box((s * .9, 1.72, 1.36), (.06, .12, .22), 'gunmetal', 0)
    # rear bumper with hazard stripes, tail lights
    k.box((0, -1.9, .66), (1.6, .14, .22), 'gunmetal', .04, 1)
    hazard_band(k, (0, -1.97, .66), X, Z, (0, -1, 0), 1.44, .18, .13, base=None, lift=.004)
    for s in (-1, 1):
        decal(k, (s * .7, -1.9, .92), X, Z, (0, -1, 0), .18, .08, 'ember_glow', .004)
    # stabiliser jacks at the rear corners (deployed)
    for s in (-1, 1):
        k.box((s * .92, -1.72, .76), (.3, .16, .14), 'hazard', .03, 1)
        for dx in (.85, .99):
            decal(k, (s * dx, -1.72, .83), *UP, .05, .16, 'charcoal', .004)
        stick(k, (s * 1.03, -1.72, .08), (s * 1.03, -1.72, .78), .065, 'char_light', 8, cap=True)
        k.box((s * 1.03, -1.72, .04), (.26, .26, .08), 'charcoal', 0)
    # hinge brackets, front rest behind the cab, erector ram, deck stripes
    hinge = (0, -1.62, 1.2)
    for s in (-1, 1):
        k.box((s * .77, hinge[1], 1.1), (.1, .34, .36), 'char_light', .03, 1)
    k.box((0, .72, 1.085), (1.36, .14, .17), 'char_light', .03, 1)
    stick(k, (0, -1.25, 1.07), (0, .3, 1.07), .075, 'gunmetal', 8, cap=True)
    stick(k, (0, .3, 1.07), (0, .6, 1.07), .045, 'char_light', 6)
    hazard_band(k, (0, .845, 1.0), *UP, 1.3, .1, .1)
    # erector rack: everything below hangs on the Rack joint
    rack = k.joint('Rack', hinge)
    stick(k, (-.72, hinge[1], hinge[2]), (.72, hinge[1], hinge[2]), .085, 'gunmetal', 8, cap=True, parent=rack)
    for s in (-1, 1):
        k.box((s * .62, -.44, 1.23), (.12, 2.56, .12), 'charcoal', .03, 1, parent=rack)
        decal(k, (s * .68, -.44, 1.23), Y, Z, (s, 0, 0), 2.3, .05, 'ember', .004, parent=rack)
    for y in (-.35, .55):
        k.box((0, y, 1.26), (1.3, .12, .16), 'char_light', 0, parent=rack)
    for mx in (-.3, .3):
        big_missile(k, mx, -1.74, 2.6, .17, 1.51, parent=rack, verts=10, nozzle=False)


# ------------------------------------------------------------------ fixed missile launch site
def missile_site(k):
    """4.6 m concrete pad, three-sided sandbag wall (open at +Y), pivot base and one
    big missile on a launch rail hinged at its rear (joint `Rack` at (0, -1.22, 0.8))."""
    Zp = .24
    k.box((0, 0, Zp / 2), (4.6, 4.6, Zp), 'concrete', .08, 1)
    decal(k, (0, .17, Zp), *UP, 1.3, 3.46, 'concrete_dark')
    hazard_band(k, (0, 2.06, Zp), *UP, 2.9, .3, .2)
    # three-sided sandbag wall
    bag_wall(k, (-2.02, -2.08), (2.02, -2.08), 5, z0=Zp, seed=1)
    for s in (-1, 1):
        bag_wall(k, (s * 1.98, -1.8), (s * 1.98, 1.62), 4, z0=Zp, seed=2 + s)
    # pivot base: turntable, plinth, cheek plates
    hinge = (0, -1.22, .8)
    disc(k, (0, hinge[1], Zp), .72, 'gunmetal', Z, 16, lift=.014)
    k.box((0, hinge[1], Zp + .12), (1.0, .8, .24), 'charcoal', .05, 1)
    decal(k, (0, hinge[1] + .4, Zp + .12), X, Z, Y, .7, .07, 'ember', .004)
    for s in (-1, 1):
        k.box((s * .45, hinge[1], .62), (.1, .46, .5), 'char_light', 0)
        disc(k, (s * .5, hinge[1], hinge[2]), .09, 'ember', (s, 0, 0), 8, lift=.004)
    # front rest post (stays behind when the rail rises)
    k.box((0, 1.28, Zp + .29), (.12, .12, .58), 'gunmetal', 0)
    k.box((0, 1.28, .84), (.44, .16, .06), 'char_light', 0)
    # launch rail and missile on the Rack
    rack = k.joint('Rack', hinge)
    stick(k, (-.4, hinge[1], hinge[2]), (.4, hinge[1], hinge[2]), .1, 'gunmetal', 8, cap=True, parent=rack)
    k.box((0, .06, .93), (.26, 2.84, .14), 'gunmetal', .03, 1, parent=rack)
    for s in (-1, 1):
        k.box((s * .16, .06, .95), (.05, 2.7, .2), 'charcoal', .015, 1, parent=rack)
        decal(k, (s * .185, .06, .95), Y, Z, (s, 0, 0), 2.5, .05, 'ember', .003, parent=rack)
    big_missile(k, 0, -1.42, 3.2, .24, 1.26, parent=rack, verts=12, nozzle=False)
    # control box with dish and a cable to the base
    cx, cy = 1.42, -1.3
    k.box((cx, cy, Zp + .45), (.72, .56, .9), 'charcoal', .08, 1)
    k.box((cx, cy, Zp + .93), (.8, .64, .06), 'char_light', 0)
    decal(k, (cx, cy + .28, Zp + .6), X, Z, Y, .46, .26, 'glass_dark', .004)
    decal(k, (cx, cy + .28, Zp + .36), X, Z, Y, .5, .06, 'ember', .004)
    hazard_band(k, (cx - .36, cy, Zp + .2), Y, Z, (-1, 0, 0), .5, .2, .1, base=None, lift=.004)
    stick(k, (cx + .12, cy - .1, Zp + .96), (cx + .12, cy - .1, Zp + 1.28), .035, 'gunmetal', 6)
    dish(k, (cx + .12, cy - .1, Zp + 1.3), .36, -40, -150)
    k.sweep([(cx - .36, cy + .1, Zp + .12), (.9, -1.1, Zp + .05), (.5, -1.2, Zp + .1)], .035, 'gunmetal', 5)
    # warning light mast
    mx, my = -1.42, -1.42
    k.box((mx, my, Zp + .06), (.3, .3, .12), 'charcoal', 0)
    stick(k, (mx, my, Zp + .1), (mx, my, Zp + 1.62), .045, 'gunmetal', 6)
    stick(k, (mx, my, Zp + .85), (mx, my, Zp + 1.15), .07, 'ember', 8, cap=True)
    beacon_light(k, (mx, my, Zp + 1.8), .15)
    # hazard sign panels flanking the open front
    for s in (-1, 1):
        k.box((s * 1.98, 1.95, Zp + .3), (.62, .06, .5), 'charcoal', 0)
        hazard_band(k, (s * 1.98, 1.98, Zp + .3), (-1, 0, 0), Z, Y, .56, .44, .12, base=None, lift=.004)


# ------------------------------------------------------------------ drone launch pad
def drone_pad(k):
    """5 x 5 m pad (0.3 m) with two launch cradles centred at (+-1.25, -0.4), top z=0.32.
    Control hut straddles the rear-right edge; drums rear-left; floodlight front-left."""
    H = .3
    k.box((0, 0, H / 2), (5.0, 5.0, H), 'concrete', .07, 1)
    # hazard striping along the top edge (front and sides), plain charcoal rear edge
    hazard_band(k, (0, 2.36, H), *UP, 4.9, .24, .24)
    for s in (-1, 1):
        hazard_band(k, (s * 2.36, -.01, H), Y, X, Z, 4.5, .24, .24)
    decal(k, (0, -2.36, H), *UP, 4.9, .24, 'charcoal')
    # launch cradles: disc (top z=.32), yellow ring, dark H; chevrons toward +Y
    for cx in (-1.25, 1.25):
        cy = -.4
        disc(k, (cx, cy, .32), .9, 'ash', Z, 20)
        annulus(k, (cx, cy, .325), .66, .8, 'hazard', 16)
        for dx in (-.19, .19):
            decal(k, (cx + dx, cy, .32), *UP, .11, .58, 'charcoal', lift=.005)
        decal(k, (cx, cy, .32), *UP, .3, .1, 'charcoal', lift=.005)
        chevron_mark(k, (cx, 1.2, H), .42, .5, .16, 'hazard')
        chevron_mark(k, (cx, 1.8, H), .42, .5, .16, 'hazard')
    # control hut (rear-right, straddling the rear edge)
    hx, hy = 1.62, -2.35
    k.box((hx, hy, .06), (1.7, 1.4, .12), 'charcoal', 0)
    k.box((hx, hy, .78), (1.5, 1.2, 1.44), 'charcoal', .1, 1)
    k.box((hx, hy, 1.54), (1.66, 1.36, .12), 'char_light', .04, 1)
    for s in (-1, 1):
        decal(k, (hx, hy + s * .6, 1.4), X, Z, (0, s, 0), 1.42, .08, 'ember', .004)
        decal(k, (hx + s * .75, hy, 1.4), Y, Z, (s, 0, 0), 1.12, .08, 'ember', .004)
    decal(k, (hx - .2, hy + .6, 1.02), X, Z, Y, .7, .36, 'glass_dark', .008)
    decal(k, (hx - .2, hy + .6, .8), X, Z, Y, .8, .05, 'ember', .008)
    decal(k, (hx + .75, hy + .05, .72), Y, Z, X, .6, 1.2, 'gunmetal', .008)
    decal(k, (hx + .75, hy + .25, .72), Y, Z, X, .08, .08, 'hazard', .014)
    k.box((hx - .3, hy - .2, 1.7), (.4, .34, .2), 'ash', .05, 1)
    stick(k, (hx + .4, hy - .2, 1.6), (hx + .4, hy - .2, 1.95), .04, 'gunmetal', 6)
    dish(k, (hx + .4, hy - .2, 1.98), .42, -35, 160)
    stick(k, (hx - .6, hy - .45, 1.6), (hx - .62, hy - .5, 2.5), .014, 'gunmetal', 4)
    k.sphere((hx - .62, hy - .5, 2.52), .035, 'ember', 6, 3)
    # fuel drums (rear-left)
    for dx, dy in ((-2.02, -2.0), (-1.42, -2.12)):
        k.cyl((dx, dy, H + .44), .3, .88, 'fuel', 'Z', 10)
        k.lathe([(.305, .52), (.305, .64)], 'hazard', (dx, dy, H), 'Z', 10, cap=(False, False))
        disc(k, (dx + .1, dy + .1, H + .88), .06, 'gunmetal', Z, 6, lift=.004)
    # floodlight mast (front-left)
    fx, fy = -2.2, 2.2
    k.box((fx, fy, H + .06), (.34, .34, .12), 'charcoal', 0)
    stick(k, (fx, fy, H + .1), (fx, fy, H + 3.0), .055, 'gunmetal', 8)
    stick(k, (fx, fy, H + 1.0), (fx, fy, H + 1.4), .08, 'hazard', 8, cap=True)
    k.box((fx, fy, H + 2.95), (.9, .1, .1), 'gunmetal', 0, rot=(0, 0, 45))
    for s in (-1, 1):
        lx, ly = fx + s * .3 * .707, fy + s * .3 * .707
        k.box((lx, ly, H + 3.08), (.34, .2, .26), 'charcoal', 0, rot=(-30, 0, -135))
        k.box((lx + .075, ly - .075, H + 3.04), (.28, .02, .2), 'lamp', 0, rot=(-30, 0, -135))
    # windsock (front-right)
    wx, wy = 2.25, 2.25
    stick(k, (wx, wy, H), (wx, wy, H + 2.1), .03, 'gunmetal', 6)
    sock = [(.16, 0), (.12, .45), (.07, .9)]
    for i, mat in enumerate(('ember', 'ash')):
        k.lathe([sock[i], sock[i + 1]], mat, (wx, wy, H + 2.0), 'X', 8, rot=(0, 12, 200), cap=(False, False),
                sharp=80)


# ------------------------------------------------------------------ barracks hut
def barracks_hut(k):
    """Ashen Front one-storey barracks, 6.0 x 3.6 m, ridge 2.8 m: khaki walls, ash
    corrugated roof with an ember ridge, door centred on the +Y face, barred windows,
    sandbags either side of the door, ember flag at the front-right corner, crates."""
    W, D, Zf = 6.0, 3.6, .24
    eave, ridge = 2.1, 2.8
    k.box((0, 0, Zf / 2), (W + .3, D + .3, Zf), 'concrete_dark', .05, 1)
    k.box((0, 0, Zf + (eave - Zf) / 2), (W, D, eave - Zf), 'khaki', .06, 1)
    k.prism([(-D / 2, eave - .02), (D / 2, eave - .02), (0, ridge - .02)], W - .02, 'khaki', axis='X', bevel=0)
    k.box((0, 0, Zf + .12), (W + .04, D + .04, .2), 'char_light', .03, 1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * (W / 2 - .02), sy * (D / 2 - .02), Zf + (eave - Zf) / 2), (.16, .16, eave - Zf + .02),
                  'charcoal', 0)
    # roof: charcoal slabs, ash corrugated sheets, ember ridge cap, stovepipe
    slope = (ridge - eave) / (D / 2)
    ov = .32
    for s in (-1, 1):
        roof_plane(k, (-W / 2 - .25, 0, ridge + .06), (W / 2 + .25, 0, ridge + .06),
                   (0, s * (D / 2 + ov), -(D / 2 + ov) * slope), .08, 'charcoal', 'ash', 11, .05)
    k.box((0, 0, ridge + .1), (W + .6, .5, .1), 'ember', .03, 1)
    stick(k, (1.9, -.95, ridge - .2), (1.9, -.95, ridge + .55), .09, 'gunmetal', 8)
    k.box((1.9, -.95, ridge + .58), (.3, .3, .06), 'gunmetal', 0)
    # door with ember frame on the +Y face and a step
    k.box((0, D / 2, Zf + .87), (1.14, .12, 1.74), 'ember', .03, 1)
    k.box((0, D / 2 + .04, Zf + .8), (.86, .08, 1.58), 'wood_dark', .03, 1)
    for z in (.45, .95, 1.35):
        decal(k, (0, D / 2 + .08, Zf + z), X, Z, Y, .78, .05, 'charcoal', .004)
    decal(k, (.3, D / 2 + .08, Zf + .82), X, Z, Y, .06, .14, 'gunmetal', .01)
    k.box((0, D / 2 + .36, Zf / 2), (1.3, .5, Zf), 'concrete_dark', .03, 1)
    # barred windows (painted flush)
    for x in (-1.95, 1.95):
        painted_window(k, (x, D / 2, 1.42), '+Y')
        painted_window(k, (x, -D / 2, 1.42), '-Y', sill=None)
    for s in (-1, 1):
        painted_window(k, (s * W / 2, 0, 1.42), '+X' if s > 0 else '-X', sill=None)
    # sandbags either side of the door (on the ground, clear of the doorway)
    for s in (-1, 1):
        bag_wall(k, (s * .66, D / 2 + .4), (s * 2.46, D / 2 + .4), 3, depth=.38, height=.26, seed=5 + s)
    # ember flag on a short pole at the front-right corner
    px, py = W / 2 + .3, D / 2 + .3
    k.box((px, py, .08), (.3, .3, .16), 'concrete_dark', 0)
    stick(k, (px, py, .1), (px, py, 3.55), .04, 'gunmetal', 6)
    stick(k, (px, py, 3.55), (px, py, 3.66), .06, 'hazard', 6, cap=True)

    def wave(x):
        t = (x - px - .04) / .95
        return py + math.sin(t * 3.2) * .1 * t

    rings = []
    for i in range(5):
        t = i / 4
        x = px + .04 + t * .95
        y = wave(x)
        z0, z1 = 2.95 - t * .12, 3.5 - t * .06
        rings.append([(x, y - .015, z0), (x, y + .015, z0), (x, y + .015, z1), (x, y - .015, z1)])
    k.skin(rings, 'ember', None, True, True, sharp=80)
    for s in (1, -1):
        pts = [(px + .38, 3.24), (px + .52, 3.1), (px + .66, 3.24), (px + .52, 3.38)]
        pane(k, [(x, wave(x) + s * .022, z) for x, z in pts], (0, s, 0), 'charcoal')
    # crates at the front-left corner
    cx, cy = -W / 2 - .05, D / 2 + .45
    k.box((cx, cy, .3), (.66, .6, .6), 'wood', .04, 1, rot=(0, 0, 8))
    k.box((cx, cy, .6), (.5, .44, .012), 'ember', 0, rot=(0, 0, 8))
    k.box((cx + .55, cy + .05, .2), (.5, .4, .4), 'char_light', .04, 1, rot=(0, 0, -12))
    k.box((cx + .55, cy + .05, .4), (.4, .1, .012), 'hazard', 0, rot=(0, 0, -12))


# ------------------------------------------------------------------ pine
def pine(k):
    """Conifer ~4.7 m: bark trunk, four star-edged cone tiers, lighter tip."""
    rng = _rng(7)
    k.lathe([(.26, 0), (.21, .2), (.16, 1.0), (.09, 3.4), (0, 4.3)], 'bark', verts=8, sharp=80, cap=(False, False))
    tiers = [(.8, 1.55, 1.5, 'pine'), (1.72, 1.22, 1.32, 'pine'), (2.55, .92, 1.2, 'pine'), (3.3, .62, 1.38, 'foliage')]
    for ti, (z0, r, h, mat) in enumerate(tiers):
        pts = 14
        ox, oy = rng.uniform(-.06, .06), rng.uniform(-.06, .06)
        spin = rng.uniform(0, math.tau)
        under, skirt, mid = [], [], []
        for j in range(pts):
            a = spin + math.tau * j / pts + rng.uniform(-.05, .05)
            tip = j % 2 == 0
            rr = r * (1.0 if tip else .8) * rng.uniform(.9, 1.07)
            zz = z0 + (-.1 if tip else .05) + rng.uniform(-.05, .05)
            c, s = math.cos(a), math.sin(a)
            skirt.append((ox + c * rr, oy + s * rr, zz))
            mid.append((ox * .5 + c * rr * .6, oy * .5 + s * rr * .6, z0 + h * .42))
            under.append((ox + c * r * .3, oy + s * r * .3, z0 + .2))
        apex = [(ox * .3 + rng.uniform(-.04, .04), oy * .3 + rng.uniform(-.04, .04), z0 + h)]
        k.skin([under, skirt, mid, apex], mat, None, True, True, sharp=60)
    disc(k, (0, 0, .01), .5, 'wood_dark', Z, 10)


# ------------------------------------------------------------------ log pile
def _log(k, x, y, z, L, r, verts=8):
    k.cyl((x, y, z), r, L, 'bark', 'X', verts, cap=False)
    for s in (-1, 1):
        ex = x + s * L / 2
        disc(k, (ex, y, z), r * 1.02, 'wood_light', (s, 0, 0), verts, lift=.004, phase=math.pi / verts)
        disc(k, (ex, y, z), r * .42, 'wood', (s, 0, 0), 5, lift=.009, phase=y * 7)


def log_pile(k):
    """Nine logs (~3 m, r .24) stacked 4-3-2, pale end grain, two stakes and a strap."""
    rng = _rng(3)
    r = .24
    for row, n in enumerate((4, 3, 2)):
        z = r + row * r * 1.74
        for i in range(n):
            y = (i - (n - 1) / 2) * r * 2.03
            _log(k, rng.uniform(-.12, .12), y, z, 3.0 + rng.uniform(-.2, .1), r * rng.uniform(.93, 1.04))
    # stakes on both long sides, a strap over the top, wedge chocks
    sx = .45
    for s in (-1, 1):
        k.tbox((sx, s * 1.04, .62), (.03, .03), (.12, .12), 1.24, 'wood_dark', 0)
        k.prism([(-.12, 0), (.12, 0), (0, .16)], .22, 'wood', loc=(-.95, s * 1.02, 0), axis='X', bevel=0,
                rot=(0, 0, 0))
    strap = [(-1.06, 1.0), (-.72, 1.14), (-.3, 1.33), (.3, 1.33), (.72, 1.14), (1.06, 1.0)]
    k.sweep([(sx, y, z) for y, z in strap], .03, 'mustard', 6)


# ------------------------------------------------------------------ sawmill shed
def shed(k):
    """Riverside sawmill shed, 5 x 4 m: plank walls, open +Y front with a dark interior,
    workbench with a big circular saw, corrugated terracotta gable roof (ridge along Y,
    eaves 2.6, ridge 3.4), lamp over the opening, stacked planks outside on the +X side."""
    W, D = 5.0, 4.0
    eave, ridge = 2.6, 3.4
    k.box((0, 0, .08), (W + .1, D + .1, .16), 'wood_dark', .03, 1)
    for i in range(6):
        decal(k, (-W / 2 + .5 + i * .8, .1, .16), *UP, .03, D - .3, 'bark', .004)
    # back wall with gable, side walls, front posts, header and gable
    k.box((0, -D / 2 + .06, eave / 2), (W, .12, eave), 'wood', .03, 1)
    k.prism([(-W / 2, eave - .02), (W / 2, eave - .02), (0, ridge)], .12, 'wood', loc=(0, -D / 2 + .06, 0), axis='Y',
            bevel=0)
    for s in (-1, 1):
        k.box((s * (W / 2 - .06), 0, eave / 2), (.12, D, eave), 'wood', .03, 1)
        k.box((s * (W / 2 - .08), D / 2 - .08, eave / 2), (.18, .18, eave), 'wood_dark', 0)
    k.box((0, D / 2 - .08, eave - .1), (W, .18, .22), 'wood_dark', .03, 1)
    k.prism([(-W / 2, eave), (W / 2, eave), (0, ridge)], .1, 'wood', loc=(0, D / 2 - .06, 0), axis='Y', bevel=0)
    # plank seams (painted) on the outside faces
    for i in range(1, 7):
        x = -W / 2 + i * W / 7
        top = eave + (ridge - eave) * (1 - abs(x) / (W / 2)) - .05
        pane(k, [(x - .02, -D / 2 - .004, .18), (x + .02, -D / 2 - .004, .18), (x + .02, -D / 2 - .004, top),
                 (x - .02, -D / 2 - .004, top)], (0, -1, 0), 'wood_dark')
        if top - eave > .15:
            pane(k, [(x - .02, D / 2 - .006, eave + .02), (x + .02, D / 2 - .006, eave + .02), (x + .02, D / 2 - .006, top),
                     (x - .02, D / 2 - .006, top)], (0, 1, 0), 'wood_dark')
    for s in (-1, 1):
        for i in range(1, 6):
            y = -D / 2 + i * D / 6
            pane(k, [(s * (W / 2 + .004), y - .02, .18), (s * (W / 2 + .004), y + .02, .18),
                     (s * (W / 2 + .004), y + .02, eave - .05), (s * (W / 2 + .004), y - .02, eave - .05)],
                 (s, 0, 0), 'wood_dark')
    # dark interior lining
    pane(k, [(-W / 2 + .12, -D / 2 + .125, .17), (W / 2 - .12, -D / 2 + .125, .17), (W / 2 - .12, -D / 2 + .125, eave),
             (0, -D / 2 + .125, ridge - .05), (-W / 2 + .12, -D / 2 + .125, eave)], (0, 1, 0), 'bark')
    for s in (-1, 1):
        pane(k, [(s * (W / 2 - .125), -D / 2 + .12, .17), (s * (W / 2 - .125), D / 2 - .17, .17),
                 (s * (W / 2 - .125), D / 2 - .17, eave - .02), (s * (W / 2 - .125), -D / 2 + .12, eave - .02)],
             (-s, 0, 0), 'bark')
    # corrugated terracotta roof, ridge along Y
    slope = (ridge - eave) / (W / 2)
    ov = .3
    for s in (-1, 1):
        roof_plane(k, (0, -D / 2 - .22, ridge + .08), (0, D / 2 + .22, ridge + .08),
                   (s * (W / 2 + ov), 0, -(W / 2 + ov) * slope), .08, 'wood_dark', 'terracotta', 9, .06)
    k.box((0, 0, ridge + .13), (.34, D + .56, .1), 'wood_dark', .03, 1)
    # workbench with a big circular saw and a log on the carriage
    by = .95
    k.box((0, by, .86), (3.2, .9, .1), 'wood_light', .02, 1)
    for x in (-1.4, 1.4):
        k.box((x, by, .43), (.12, .8, .76), 'wood_dark', 0)
    teeth = []
    for i in range(24):
        a = math.tau * i / 24
        rr = .66 if i % 2 == 0 else .57
        teeth.append((math.cos(a) * rr, math.sin(a) * rr))
    for sg in (1, -1):
        pane(k, [(.3 + px, by + sg * .02, .98 + pz) for px, pz in teeth], (0, sg, 0), 'steel')
        disc(k, (.3, by + sg * .02, .98), .14, 'gunmetal', (0, sg, 0), 6, lift=.006)
    k.box((.3, by + .02, 1.64), (.3, .12, .12), 'hazard', .03, 1)
    k.box((1.05, by, .38), (.5, .45, .45), 'teal', .06, 1)
    k.sweep([(1.05, by + .1, .6), (.6, by + .1, .8), (.4, by + .1, .92)], .025, 'gunmetal', 5)
    k.cyl((-.85, by, 1.13), .22, 1.3, 'bark', 'X', 10, cap=False)
    for s in (-1, 1):
        disc(k, (-.85 + s * .65, by, 1.13), .225, 'wood_light', (s, 0, 0), 10, lift=.003, phase=math.pi / 10)
    k.ico((.3, by + .66, .08), (.42, .28, .1), 'wood_light', 1, smooth=True)
    # lamp over the opening, under the front gable
    stick(k, (0, D / 2 - .02, 3.02), (0, D / 2 + .3, 3.02), .025, 'gunmetal', 4)
    stick(k, (0, D / 2 + .3, 3.02), (0, D / 2 + .3, 2.9), .02, 'gunmetal', 4)
    k.lathe([(0, 2.92), (.2, 2.76), (0, 2.8)], 'gunmetal', (0, D / 2 + .3, 0), 'Z', 8, sharp=70)
    k.sphere((0, D / 2 + .3, 2.76), (.09, .09, .07), 'lamp', 6, 3)
    # stacked planks outside (+X side): bearers and four staggered layers
    px, py = W / 2 + .6, .1
    for y in (-.95, .95):
        k.box((px, py + y, .06), (.8, .14, .12), 'bark', 0)
    for layer in range(4):
        sg = 1 if layer % 2 else -1
        k.box((px + sg * .02, py + sg * .05, .155 + layer * .075), (.74, 2.6, .07), 'wood_light', .015, 1)
    for i in (-1, 1):
        decal(k, (px + .02 + i * .125, py + .05, .155 + 3 * .075 + .035), Y, X, Z, 2.5, .02, 'wood', .003)


# ------------------------------------------------------------------ reeds
def _blade(k, base, h, lean_dir, lean, w, mat):
    """Tapered, slightly curved reed blade (smooth triangular section)."""
    base = Vector(base)
    lean_dir = Vector((lean_dir[0], lean_dir[1], 0)).normalized()
    side = Vector((-lean_dir.y, lean_dir.x, 0))
    rings = []
    for t in (0, .4, .74):
        c = base + Vector((0, 0, h * t)) + lean_dir * lean * t * t
        ww = w * (1 - .7 * t)
        rings.append([tuple(c + side * ww), tuple(c - side * ww), tuple(c + lean_dir * ww * .5)])
    rings.append([tuple(base + Vector((0, 0, h)) + lean_dir * lean)])
    k.skin(rings, mat, None, False, False, sharp=150)


def reeds(k):
    """Clump of 20 reed blades and 5 cattails, ~1.5 m tall, on a mossy tussock."""
    rng = _rng(13)
    k.lathe([(.44, 0), (.34, .07), (0, .1)], 'moss', verts=9, sharp=80, cap=(False, False))
    mats = ('lime', 'moss', 'grass', 'lime', 'moss')
    for i in range(20):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(.02, .32)
        base = (math.cos(a) * d, math.sin(a) * d, .04)
        h = rng.uniform(.85, 1.45)
        la = a + rng.uniform(-.6, .6)
        _blade(k, base, h, (math.cos(la), math.sin(la)), rng.uniform(.12, .4) * h, rng.uniform(.035, .05),
               mats[i % len(mats)])
    for i in range(5):
        a = math.tau * i / 5 + rng.uniform(-.3, .3)
        d = rng.uniform(.05, .22)
        bx, by = math.cos(a) * d, math.sin(a) * d
        tilt = rng.uniform(4, 12)
        h = rng.uniform(1.15, 1.5)
        dirv = Vector((math.cos(a), math.sin(a), 0)) * math.sin(math.radians(tilt)) + \
            Vector((0, 0, math.cos(math.radians(tilt))))
        top = Vector((bx, by, .05)) + dirv * h
        stick(k, (bx, by, .05), tuple(top + dirv * .3), .012, 'moss', 4, r2=.005)
        k.lathe([(0, -.15), (.04, -.13), (.048, .08), (.036, .14), (0, .16)], 'bark', tuple(top), 'Z', 6,
                rot=(tilt, 0, math.degrees(a) - 90), sharp=80)


# ------------------------------------------------------------------ dry canyon shrub
def shrub(k):
    """Dry round bush ~1.2 m wide, 0.9 m tall: olive, khaki, moss and sand puffs, dry twigs."""
    blob(k, (0, 0, .4), (.58, .54, .42), 'olive', 1, 3, .12, flat_bottom=-.55)
    blob(k, (.3, .2, .5), (.36, .34, .3), 'khaki', 1, 4, .12)
    blob(k, (-.34, -.08, .4), (.28, .26, .22), 'moss', 1, 6, .12)
    blob(k, (.04, -.26, .64), (.3, .28, .24), 'webbing', 1, 9, .1)
    rng = _rng(5)
    for i in range(3):
        a = math.tau * i / 3 + rng.uniform(-.3, .3) + .6
        stick(k, (math.cos(a) * .35, math.sin(a) * .33, .6),
              (math.cos(a) * .66, math.sin(a) * .62, .74 + rng.uniform(.0, .16)), .016, 'wood_dark', 4, r2=.006)
    k.ico((.55, -.35, .06), (.14, .12, .09), 'rock', 1, rot=(0, 0, 30), smooth=True)
    k.ico((-.5, .4, .05), (.11, .1, .07), 'rock', 1, smooth=True)
