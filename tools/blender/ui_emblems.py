"""Tidelock chapter emblems: four thick 3D medallions rendered to transparent WebP for the HUD / briefing UI.

Run from the repository root with Blender 4.5:
  blender --background --factory-startup --python tools/blender/ui_emblems.py -- [options] [ids...]

Writes (default --out public/ui, created when missing), 256x256 RGBA WebP, quality 88:
  emblem-city.webp      strike bomb over a tower-block skyline   gold rim on navy
  emblem-river.webp     gunboat on a wavy teal water band        mint rim on navy
  emblem-valley.webp    rescue helicopter over twin mountains    coral rim on navy
  emblem-tidelock.webp  storm-barrier gate, two towers and wave  gold rim, sky-blue accents on navy

Options (after --):
  --out DIR       output folder (default public/ui)
  --size N        square size in px (default 256)
  --quality Q     WebP quality 1-100 (default 88)
  --samples N     Eevee render samples (default 96)
  --scale S       supersample factor for REVIEW frames; S != 1 writes PNGs to --review instead of WebP
  --review DIR    review folder (default .tools/review/ui) used by --scale / --png
  --png           also keep a lossless PNG of each emblem in --review
  --sheet FILE    afterwards compose a contact sheet PNG (dark + light backdrop) of the WebP files in --out
  ids             subset: city river valley tidelock (default: all four)

Each medallion is a thick bevelled disc (accent edge, raised accent rim, recessed navy face) tilted 12 degrees
toward the camera, with a chunky embossed icon standing on the face. Glossy-satin PBR (roughness 0.35-0.5),
Eevee, Standard view transform, warm key + cool fill + cool-white rim, transparent film. Everything is code:
re-running rewrites only the requested files. Palette follows tools/blender/style.py (sun, navy, mint, coral,
sky, sea, cream ...).
"""
import argparse
import math
import os
import sys
import time

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True  # keep tools/blender free of __pycache__
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------- args
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('ids', nargs='*', default=[])
ap.add_argument('--out', default=os.path.join('public', 'ui'))
ap.add_argument('--size', type=int, default=256)
ap.add_argument('--quality', type=int, default=88)
ap.add_argument('--samples', type=int, default=96)
ap.add_argument('--scale', type=float, default=1.0)
ap.add_argument('--review', default=os.path.join('.tools', 'review', 'ui'))
ap.add_argument('--png', action='store_true')
ap.add_argument('--sheet', default='')
OPT = ap.parse_args(argv)


def _abs(p):
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


OUT, REVIEW = _abs(OPT.out), _abs(OPT.review)
EMBLEMS = ['city', 'river', 'valley', 'tidelock']
TODO = [e for e in EMBLEMS if not OPT.ids or e in OPT.ids]

# ---------------------------------------------------------------- palette / materials
PAL = dict(
    navy='#173a6b', navy_deep='#0e2749', navy_lift='#22508f', sun='#ffc62b', sun_deep='#e39a0c', mint='#33d69f',
    mint_deep='#1fa57a', coral='#ff8a6b', coral_deep='#dc5f43', sky='#2f86e8', sky_light='#7cc0ff', sky_deep='#1c5cb5',
    white='#f7f1e1', cream='#f7f1e1', sea='#19b9c9', sea_deep='#0e8493', sea_light='#6fe3ee', rock='#c99f74',
    rock_deep='#9d6b48', terracotta='#e2704f', pine='#1f8450', grass='#5cbf45', glass='#7fd8ff', gunmetal='#3a4048',
    steel='#9aa6af', ember='#ff4b2b', lamp='#fff1a8',
)


def lin(h):
    h = PAL.get(h, h).lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x / 12.92) if x <= .04045 else ((x + .055) / 1.055) ** 2.4) for x in c)


_mats = {}


def mat(key, hexcol=None, rough=.42, metal=0.0, coat=.35, emit=0.0, alpha=1.0):
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = lin(hexcol or key)
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for nm, v in (('Coat Weight', coat), ('Coat Roughness', .2), ('Specular IOR Level', .5)):
        try:
            b.inputs[nm].default_value = v
        except KeyError:
            pass
    if emit:
        try:
            b.inputs['Emission Color'].default_value = (*c, 1)
            b.inputs['Emission Strength'].default_value = emit
        except KeyError:
            pass
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
        m.use_backface_culling = False
    _mats[key] = m
    return m


# ---------------------------------------------------------------- modelling kit (chunky, bevelled, smooth)
def _finish(o, m, bevel, seg=4, angle=32):
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    if bevel:
        bv = o.modifiers.new('bevel', 'BEVEL')
        bv.width, bv.segments, bv.limit_method = bevel, seg, 'ANGLE'
        bv.angle_limit = math.radians(angle)
        bv.profile = .55
    wn = o.modifiers.new('wn', 'WEIGHTED_NORMAL')
    wn.keep_sharp, wn.weight = True, 60
    return o


def box(loc, size, m, bevel=.03, rot=(0, 0, 0), seg=4):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=[math.radians(r) for r in rot])
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, bevel, seg)


def cyl(loc, r, depth, m, rot=(90, 0, 0), bevel=.02, verts=48, r2=None, seg=3):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=[math.radians(x) for x in rot])
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=[math.radians(x) for x in rot])
    return _finish(bpy.context.object, m, bevel, seg)


def sphere(loc, r, m, scale=(1, 1, 1), seg=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc, rotation=[math.radians(x) for x in rot])
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, 0)


def torus(loc, R, r, m, rot=(90, 0, 0), major=64, minor=16):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor,
                                     location=loc, rotation=[math.radians(x) for x in rot])
    return _finish(bpy.context.object, m, 0)


def prism(points, depth, m, loc=(0, 0, 0), bevel=.04, seg=4, y0=0.0, angle=25):
    """Extrude a 2D outline (x, z) along Y, centred on y0 (front face toward -Y, i.e. toward the camera)."""
    me = bpy.data.meshes.new('prism')
    bm = bmesh.new()
    vs = [bm.verts.new((x, y0 + depth / 2, z)) for x, z in points]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    ex = [v for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, -depth, 0), verts=ex)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('prism', me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    return _finish(o, m, bevel, seg, angle)


def lathe(profile, m, loc=(0, 0, 0), steps=48, bevel=0):
    """Revolve a (radius, height) profile around local Z (smooth, closed at the axis)."""
    me = bpy.data.meshes.new('lathe')
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, h)) for r, h in profile]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=list(bm.verts) + list(bm.edges), cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('lathe', me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    return _finish(o, m, bevel)


def poly_tube(pts, r, m):
    """Round tube of radius r along a 3D polyline (returns the tube and its two end caps)."""
    cu = bpy.data.curves.new('tube', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth, cu.bevel_resolution, cu.use_fill_caps = r, 5, True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    cu.materials.append(m)
    o = bpy.data.objects.new('tube', cu)
    bpy.context.scene.collection.objects.link(o)
    return [o] + [sphere(p, r, m, seg=12) for p in (pts[0], pts[-1])]


def densify(pts, step=.02):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.dist(a, b) / step))
        out.extend((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(1, n + 1))
    return out


def disc_clip(profile, Rc):
    """Region under a left-to-right (x, z) profile, clipped to a disc of radius Rc: returns a polygon whose
    bottom follows the disc edge (so scenery sits inside the circular face)."""
    pts = [p for p in densify(profile) if p[0] * p[0] + p[1] * p[1] <= Rc * Rc]

    def push(p):
        r = math.hypot(*p)
        return (p[0] * Rc / r, p[1] * Rc / r)
    l, r = push(pts[0]), push(pts[-1])
    pts = [l] + pts[1:-1] + [r]
    ar, al = math.atan2(r[1], r[0]), math.atan2(l[1], l[0])
    while al > ar:
        al -= math.tau
    arc = [(Rc * math.cos(ar + (al - ar) * i / 28), Rc * math.sin(ar + (al - ar) * i / 28)) for i in range(1, 28)]
    return pts + arc


def wave_fn(z0, amp, k, ph):
    return lambda x: z0 + amp * math.sin(k * x + ph)


def sample(fn, x0, x1, n=90):
    return [(x0 + (x1 - x0) * i / n, fn(x0 + (x1 - x0) * i / n)) for i in range(n + 1)]


def pivot(loc, rot=(0, 0, 0), parent=None):
    e = bpy.data.objects.new('pivot', None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    e.rotation_euler = [math.radians(r) for r in rot]
    if parent:
        e.parent = parent
    return e


def adopt(parent, objs):
    for o in objs:
        if o.parent is None:
            o.parent = parent
    return objs


# ---------------------------------------------------------------- medallion
FACE_Y = -.25          # front of the recessed face plate; icons stand on it and grow toward -Y (the camera)
R_FACE = .80           # usable radius inside the rim
TILT = 12.0            # degrees: top of the medal leans toward the camera
YAW = -8.0             # degrees about the vertical axis: turns one edge toward the camera so the coin thickness shows


def medallion(accent, accent_deep, accent_light, tag):
    """Thick bevelled disc: accent edge, raised accent rim, recessed navy face with a lighter inner plate."""
    edge = mat(tag + '_edge', accent_deep, rough=.42, metal=.25, coat=.3)
    rim = mat(tag + '_rim', accent, rough=.36, metal=.28, coat=.5)
    line = mat(tag + '_line', accent_light, rough=.34, metal=.1, coat=.5)
    navy = mat('navy', 'navy', rough=.5, coat=.25)
    lift = mat('navy_lift', 'navy_lift', rough=.5, coat=.25)
    out = []
    out.append(cyl((0, 0, 0), 1.0, .46, edge, rot=(90, 0, 0), bevel=.07, verts=96, seg=5))
    out.append(cyl((0, FACE_Y + .015, 0), .90, .03, navy, rot=(90, 0, 0), bevel=0, verts=96))
    out.append(torus((0, FACE_Y - .09, 0), .905, .105, rim, rot=(90, 0, 0), major=120, minor=24))
    out.append(torus((0, FACE_Y - .04, 0), .795, .022, line, rot=(90, 0, 0), major=120, minor=12))
    out.append(cyl((0, FACE_Y - .0, 0), .74, .04, lift, rot=(90, 0, 0), bevel=.01, verts=96))
    for i in range(24):                                                   # rim studs
        a = math.tau * i / 24
        out.append(sphere((.905 * math.sin(a), FACE_Y - .19, .905 * math.cos(a)), .028, line, scale=(1, .5, 1), seg=10))
    return out


def stand(depth, lift=0.0):
    """Y centre for a part of the given depth standing on the face plate."""
    return FACE_Y - .02 - depth / 2 - lift
# ---------------------------------------------------------------- emblem: city (strike bomb over skyline)
def build_city():
    out = medallion('sun', 'sun_deep', '#ffe28a', 'city')
    ground = mat('c_ground', 'navy_deep', rough=.5)
    tower = mat('c_tower', '#5aa8f2', rough=.42, coat=.4)
    tower2 = mat('c_tower2', '#3d86d6', rough=.42, coat=.4)
    back = mat('c_back', '#2a62ad', rough=.45, coat=.3)
    roof = mat('c_roof', 'navy_deep', rough=.45)
    win = mat('c_win', 'sun', rough=.4, coat=0, emit=1.4)
    win_dim = mat('c_win_dim', '#ffd86a', rough=.4, coat=0, emit=.5)
    gold = mat('c_gold', 'sun', rough=.34, metal=.15, coat=.5)
    cream = mat('c_cream', 'cream', rough=.36, coat=.5)
    red = mat('c_red', 'ember', rough=.34, coat=.5)
    ink = mat('c_ink', 'navy_deep', rough=.4)
    base = -.52
    out.append(prism(disc_clip([(-.9, base), (.9, base)], .745), .08, ground, y0=stand(.08), bevel=.015))
    # back row (dimmer, taller) then the front row of towers
    for x, w, h in ((-.40, .20, .58), (-.14, .20, .84), (.36, .20, .62)):
        d = .16
        yc = stand(d) + .10
        out.append(box((x, yc, base + h / 2 - .01), (w, d, h), back, bevel=.03))
        out.append(box((x, yc - .01, base + h), (w + .03, d + .02, .04), roof, bevel=.012))
        for r in range(int((h - .1) / .13)):
            out.append(box((x, yc - d / 2 - .002, base + .10 + r * .13), (.045, .02, .05), win_dim, bevel=.008, seg=2))
    towers = [(-.54, .22, .36, tower2), (-.30, .23, .60, tower), (-.05, .24, .42, tower2), (.20, .24, .72, tower), (.45, .21, .34, tower2)]
    for x, w, h, m in towers:
        d = .24
        yc = stand(d) + .02
        out.append(box((x, yc, base + h / 2 - .01), (w, d, h), m, bevel=.03))
        out.append(box((x, yc - .012, base + h - .005), (w + .04, d + .03, .05), roof, bevel=.015))
        for r in range(int((h - .1) / .11)):
            for c in range(2):
                wx = x + (c - .5) * (w * .46)
                out.append(box((wx, yc - d / 2 - .002, base + .10 + r * .11), (.055, .02, .06), win, bevel=.008, seg=2))
    out.append(cyl((.20, stand(.05) + .04, base + .72 + .08), .012, .16, ink, rot=(0, 0, 0), bevel=0, verts=10))      # antenna
    out.append(sphere((.20, stand(.05) + .04, base + .72 + .17), .03, red, seg=12))
    # strike bomb, nose down-right
    ang = -33.0
    ax = Vector((math.cos(math.radians(ang)), 0, math.sin(math.radians(ang))))
    pv = pivot((.0, stand(.36) - .24, .22))
    pv.rotation_euler = Vector((0, 0, 1)).rotation_difference(ax).to_euler()
    prof = [(0, -.62), (.055, -.60), (.11, -.55), (.15, -.47), (.18, -.36), (.20, -.2), (.205, 0), (.20, .18), (.185, .32),
            (.15, .45), (.10, .54), (.05, .60), (0, .625)]
    parts = [lathe(prof, cream, steps=48)]
    parts.append(torus((0, 0, .06), .207, .03, red, rot=(0, 0, 0), major=48, minor=12))
    parts.append(torus((0, 0, .17), .200, .026, gold, rot=(0, 0, 0), major=48, minor=12))
    parts.append(torus((0, 0, -.30), .18, .022, gold, rot=(0, 0, 0), major=48, minor=12))
    parts.append(sphere((0, 0, .57), .075, gold, seg=20))
    parts.append(cyl((0, 0, -.63), .085, .07, ink, rot=(0, 0, 0), bevel=.015, verts=24))
    for rz in (0, 90):                                                   # cross fins
        parts.append(box((0, 0, -.46), (.56, .03, .26), gold, bevel=.012, rot=(0, 0, rz)))
        parts.append(box((0, 0, -.55), (.44, .026, .10), gold, bevel=.01, rot=(0, 0, rz)))
    adopt(pv, parts)
    out += parts + [pv]
    return out


# ---------------------------------------------------------------- emblem: river (gunboat on water)
def build_river():
    out = medallion('mint', 'mint_deep', '#a6f5d4', 'river')
    cream = mat('r_cream', 'cream', rough=.38, coat=.5)
    mint = mat('r_mint', 'mint', rough=.36, coat=.5)
    glass = mat('r_glass', 'glass', rough=.15, coat=.6, emit=.6)
    gun = mat('r_gun', 'gunmetal', rough=.4, coat=.4)
    navy = mat('r_navy', 'navy_deep', rough=.45)
    sea_back = mat('r_sea_back', 'sea_deep', rough=.36, coat=.5)
    sea = mat('r_sea', 'sea', rough=.34, coat=.55)
    sea_l = mat('r_sea_l', 'sea_light', rough=.34, coat=.5)
    foam = mat('r_foam', 'white', rough=.4, coat=.3, emit=.35)
    out.append(prism(disc_clip(sample(wave_fn(-.10, .045, 7.5, 1.0), -.9, .9), .745), .30, sea_back, y0=stand(.30) + .02, bevel=.03))
    moon = mat('r_moon', '#f3ead2', rough=.45, coat=.2, emit=.3)
    out.append(cyl((.42, stand(.06), .46), .12, .06, moon, rot=(90, 0, 0), bevel=.02, verts=48))
    # gunboat (bow to the right), built at full size then scaled about its centre
    yc = stand(.32) - .04
    bp = pivot((0, 0, 0))
    k, F = .95, Vector((-.02, yc, .0))
    bp.location = F * (1 - k) + Vector((-.07, 0, .02))
    bp.scale = (k, k, k)
    boat = []
    hull = [(-.56, .03), (.34, .03), (.60, .17), (.46, -.11), (-.42, -.16), (-.58, -.08)]
    boat.append(prism(hull, .34, cream, y0=yc, bevel=.05))
    boat.append(prism([(-.57, -.03), (.50, -.03), (.47, -.11), (-.42, -.16), (-.58, -.08)], .36, mint, y0=yc, bevel=.03))
    boat.append(box((-.16, yc, .06), (.62, .30, .05), gun, bevel=.02))                    # deck plate
    boat.append(box((-.20, yc, .21), (.36, .26, .26), mint, bevel=.05))                   # cabin
    boat.append(box((-.20, yc, .365), (.44, .32, .06), cream, bevel=.03))                 # roof
    for wx in (-.30, -.10):
        boat.append(box((wx, yc - .135, .22), (.14, .03, .11), glass, bevel=.015, seg=2))
    boat.append(cyl((-.20, yc, .48), .014, .16, gun, rot=(0, 0, 0), bevel=0, verts=10))  # mast
    boat.append(box((-.16, yc, .52), (.14, .03, .07), mint, bevel=.01, seg=2))
    boat.append(cyl((.28, yc, .10), .12, .10, navy, rot=(90, 0, 0), bevel=.02))           # gun mount
    boat.append(box((.30, yc, .19), (.24, .18, .12), gun, bevel=.035))                   # gun housing
    boat.append(cyl((.52, yc, .20), .036, .30, gun, rot=(0, 90, 0), bevel=.01, verts=20))  # barrel
    boat.append(cyl((.68, yc, .20), .052, .07, mint, rot=(0, 90, 0), bevel=.012, verts=20))
    boat.append(sphere((-.47, yc, .10), .045, glass, seg=14))                            # stern light
    adopt(bp, boat)
    out += boat + [bp]
    # water in front of the hull: a lighter wavy layer with foam, and a low front swell
    f1 = wave_fn(-.19, .05, 7.5, 3.6)
    out.append(prism(disc_clip(sample(f1, -.9, .9), .745), .22, sea, y0=stand(.22) - .16, bevel=.03))
    out.extend(poly_tube([(x, stand(.22) - .30, f1(x) + .012) for x, _ in sample(lambda x: 0, -.68, .68, 48)], .018, foam))
    f2 = wave_fn(-.40, .035, 9.0, .4)
    out.append(prism(disc_clip(sample(f2, -.9, .9), .745), .12, sea_l, y0=stand(.12) - .30, bevel=.02))
    out.extend(poly_tube([(x, stand(.12) - .37, f2(x) + .01) for x, _ in sample(lambda x: 0, -.50, .50, 40)], .014, foam))
    return out


# ---------------------------------------------------------------- emblem: valley (helicopter over mountains)
def build_valley():
    out = medallion('coral', 'coral_deep', '#ffc7b5', 'valley')
    rock = mat('v_rock', 'rock', rough=.5, coat=.2)
    rock_d = mat('v_rock_d', 'rock_deep', rough=.5, coat=.2)
    snow = mat('v_snow', 'white', rough=.4, coat=.4)
    pine = mat('v_pine', 'pine', rough=.42, coat=.3)
    grass = mat('v_grass', 'grass', rough=.5, coat=.2)
    cream = mat('v_cream', 'cream', rough=.36, coat=.55)
    coral = mat('v_coral', 'coral', rough=.34, coat=.55)
    glass = mat('v_glass', 'glass', rough=.12, coat=.6, emit=.5)
    gun = mat('v_gun', 'gunmetal', rough=.4, coat=.4)
    blade = mat('v_blade', 'cream', rough=.4, coat=.3)
    disc = mat('v_disc', '#ffffff', rough=.4, coat=0, emit=1.6, alpha=.16)
    gold = mat('v_gold', 'sun', rough=.34, coat=.5)
    Rc = .745
    zb = -.60
    peaks = [(-.28, .10, -.90, .30), (.38, -.16, -.20, .95)]      # peak x, peak z, left foot x, right foot x
    ym = stand(.14)
    for i, (px, pz, xl, xr) in enumerate(peaks):
        yy = ym + (.06 if i == 0 else -.02)
        a, b, c = (xl, zb), (px, pz), (xr, zb)
        out.append(prism(_mount_poly(a, b, (px, zb - .3), Rc), .16, rock, y0=yy, bevel=.02))
        out.append(prism(_mount_poly(b, c, (px, zb - .3), Rc, right=True), .16, rock_d, y0=yy, bevel=.02))
        t = .26
        cl = (px + (xl - px) * t, pz + (zb - pz) * t)
        cr = (px + (xr - px) * t, pz + (zb - pz) * t)
        zig = [(px, pz + .012), (cr[0], cr[1]), (px + (cr[0] - px) * .5, cr[1] - .06), (px + (cr[0] - px) * .12, cr[1] + .0),
               (px - (px - cl[0]) * .45, cl[1] - .06), (cl[0], cl[1])]
        out.append(prism(zig, .18, snow, y0=yy - .012, bevel=.015))
    out.append(prism(disc_clip([(-.9, -.58), (.9, -.58)], Rc), .10, grass, y0=stand(.10) - .10, bevel=.015))
    for x, s in ((-.52, .8), (.50, .9), (.28, .6)):                                            # pines on the meadow
        yp = stand(.16) - .10
        out.append(cyl((x, yp, -.56 + .13 * s), .12 * s, .22 * s, pine, rot=(0, 0, 0), r2=.0, bevel=.01, verts=20))
        out.append(cyl((x, yp, -.56 + .27 * s), .09 * s, .18 * s, pine, rot=(0, 0, 0), r2=.0, bevel=.01, verts=20))
    # rescue helicopter, three-quarter from above, facing right (built at full size, scaled about its centre)
    hp = pivot((.0, stand(.3) - .20, .34), rot=(-32, 0, -8))
    hp.scale = (.74, .74, .74)
    parts = []
    parts.append(sphere((0, 0, 0), .30, cream, scale=(1.15, .72, .78), seg=36))                  # fuselage
    parts.append(sphere((.24, -.0, .015), .19, glass, scale=(.95, .82, .88), seg=28))            # cockpit
    parts.append(cyl((-.42, 0, .03), .10, .56, cream, rot=(0, -90, 0), r2=.05, bevel=0, verts=24))    # tail boom
    parts.append(box((-.68, 0, .12), (.20, .04, .22), coral, bevel=.015, rot=(0, 24, 0)))        # tail fin
    parts.append(box((.0, 0, -.06), (.62, .36, .07), coral, bevel=.03))                          # belly stripe
    parts.append(cyl((-.68, -.03, .05), .09, .02, disc, rot=(90, 0, 0), bevel=0, verts=24))      # tail rotor
    parts.append(cyl((0, 0, .27), .04, .12, gun, rot=(0, 0, 0), bevel=0, verts=14))              # mast
    parts.append(sphere((0, 0, .34), .06, gold, seg=14))                                         # hub
    parts.append(cyl((0, 0, .335), .62, .012, disc, rot=(0, 0, 0), bevel=0, verts=64))           # rotor blur disc
    for a in (18, 108):
        parts.append(box((0, 0, .335), (1.16, .075, .022), blade, bevel=.008, rot=(0, 0, a)))
    for s in (-1, 1):                                                                            # skids
        parts.append(cyl((.02, s * .17, -.26), .022, .62, gun, rot=(0, 90, 0), bevel=0, verts=12))
        for x in (-.16, .16):
            parts.append(cyl((x, s * .17, -.19), .018, .14, gun, rot=(0, 0, 0), bevel=0, verts=10))
    adopt(hp, parts)
    out += parts + [hp]
    return out


def _close_on_disc(pts, Rc):
    """Close an open left-to-right path with an arc along the bottom of the disc (clockwise from the last point)."""
    pts = list(pts)
    a0, a1 = math.atan2(pts[-1][1], pts[-1][0]), math.atan2(pts[0][1], pts[0][0])
    while a1 > a0:
        a1 -= math.tau
    arc = [(Rc * math.cos(a0 + (a1 - a0) * i / 24), Rc * math.sin(a0 + (a1 - a0) * i / 24)) for i in range(1, 24)]
    return pts + arc


def _mount_poly(a, b, c, Rc, right=False):
    """One slope of a mountain clipped to the disc. Left slope: a = foot, b = peak, c = point below the peak.
    Right slope: a = peak, b = foot, c = point below the peak."""
    path = [c, a, b] if right else [a, b, c]
    pts = [p for p in densify(path, .015) if p[0] ** 2 + p[1] ** 2 <= Rc * Rc]
    return _close_on_disc(pts, Rc)


# ---------------------------------------------------------------- emblem: tidelock (barrier gate + wave)
def build_tidelock():
    out = medallion('sun', 'sun_deep', '#ffe28a', 'tidelock')
    cream = mat('t_cream', 'cream', rough=.38, coat=.5)
    sky = mat('t_sky', 'sky', rough=.32, coat=.6)
    sky_l = mat('t_sky_l', 'sky_light', rough=.34, coat=.5)
    sky_d = mat('t_sky_d', 'sky_deep', rough=.4, coat=.4)
    gold = mat('t_gold', 'sun', rough=.34, metal=.15, coat=.5)
    navy_d = mat('t_navy_d', 'navy_deep', rough=.45)
    foam = mat('t_foam', 'white', rough=.4, coat=.3, emit=.4)
    lamp = mat('t_lamp', 'lamp', rough=.3, coat=0, emit=3.0)
    glow = mat('t_glow', 'sky_light', rough=.3, coat=0, emit=1.6)
    yt = stand(.28)                                   # tower centre plane
    # sluice recess and gate between the towers
    out.append(box((0, stand(.14) - .0, -.06), (.64, .14, .78), navy_d, bevel=.03))
    for i in range(7):
        out.append(box((-.255 + i * .085, yt - .03, -.08), (.05, .10, .60), cream, bevel=.015, seg=3))
    out.append(box((0, yt - .02, .25), (.70, .16, .075), gold, bevel=.03))                  # gold lintel
    out.append(box((0, yt - .02, -.40), (.70, .16, .06), sky_d, bevel=.02))                 # sill
    # sluice towers
    for s in (-1, 1):
        x = s * .44
        out.append(box((x, yt, -.42), (.38, .34, .10), sky_d, bevel=.03))                   # plinth
        out.append(box((x, yt, -.03), (.28, .28, .72), cream, bevel=.05))                   # shaft
        out.append(box((x, yt - .01, .14), (.31, .30, .07), sky, bevel=.02))                # sky band
        out.append(box((x, yt - .01, -.22), (.31, .30, .07), sky, bevel=.02))
        out.append(box((x, yt - .145, -.04), (.075, .03, .20), glow, bevel=.012, seg=2))     # window slit
        out.append(box((x, yt, .36), (.36, .32, .07), gold, bevel=.03))                     # gold cap
        out.append(sphere((x, yt, .44), .055, lamp, seg=16))                                # beacon
    # storm wave in front (curling right), with foam and a flow line
    prof = [(-.70, -.25), (-.58, -.16), (-.44, -.04), (-.30, .10), (-.16, .24), (-.02, .34), (.12, .40), (.26, .40),
            (.38, .34), (.45, .24), (.44, .14), (.36, .10), (.28, .15), (.20, .14), (.14, .06), (.12, -.06), (.18, -.18),
            (.30, -.28), (.46, -.34), (.62, -.36)]
    T = lambda x, z: (x * .86, z * .72 - .14)          # keep the crest under the lintel so both towers stay readable
    prof = [T(*p) for p in prof]
    yw = stand(.20) - .24
    out.append(prism(_close_on_disc(prof, .745), .20, sky, y0=yw, bevel=.035))
    crest = [(x, yw - .13, z + .01) for x, z in prof[2:11]]
    out.extend(poly_tube(crest, .032, foam))
    flow = [(x + .02, yw - .11, z - .11) for x, z in prof[1:8]]
    out.extend(poly_tube(flow, .022, sky_l))
    flow2 = [(x + .03, yw - .11, z - .20) for x, z in prof[3:8]]
    out.extend(poly_tube(flow2, .018, sky_l))
    for (x, z, r) in ((.40, .31, .034), (.50, .22, .026), (.31, .43, .028), (.20, .47, .022), (.52, .34, .02)):    # spray
        x, z = T(x, z)
        out.append(sphere((x, yw - .12, z), r, foam, seg=12))
    return out


BUILDERS = {'city': build_city, 'river': build_river, 'valley': build_valley, 'tidelock': build_tidelock}


# ---------------------------------------------------------------- scene / lighting / camera
def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    s = bpy.context.scene
    try:
        s.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        s.render.engine = 'BLENDER_EEVEE'
    s.eevee.taa_render_samples = OPT.samples
    for k in ('use_shadows', 'use_raytracing', 'use_gtao'):
        try:
            setattr(s.eevee, k, True)
        except Exception:
            pass
    s.render.film_transparent = True
    s.render.filter_size = 1.1
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.view_settings.exposure = .25
    px = int(round(OPT.size * OPT.scale))
    s.render.resolution_x = s.render.resolution_y = px
    s.render.resolution_percentage = 100
    s.world = bpy.data.worlds.new('w')
    s.world.use_nodes = True
    nt = s.world.node_tree
    bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs[1].default_value, mr.inputs[2].default_value = -1, 1
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.0, (*lin('#1b2f4d'), 1)
    el[1].position, el[1].color = 1.0, (*lin('#fff4e2'), 1)
    el.new(.46).color = (*lin('#7d97b0'), 1)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mr.inputs[0])
    nt.links.new(mr.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = .8
    return s


def sun(direction_from, energy, color, angle=14):
    bpy.ops.object.light_add(type='SUN')
    l = bpy.context.object
    l.data.energy, l.data.angle = energy, math.radians(angle)
    l.data.color = lin(color)
    l.rotation_euler = (-Vector(direction_from)).to_track_quat('-Z', 'Y').to_euler()


def eval_coords(objs):
    deps = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(deps)
        try:
            me = ev.to_mesh()
        except RuntimeError:
            continue
        pts.extend(ev.matrix_world @ v.co for v in me.vertices)
        ev.to_mesh_clear()
    return pts


def stage(objs, fill=.965):
    """Tilt the whole medal, add a camera looking along +Y, fit it to the frame and light it."""
    s = bpy.context.scene
    root = pivot((0, 0, 0), rot=(TILT, 0, YAW))
    adopt(root, objs)
    bpy.context.view_layer.update()
    pts = [p for p in eval_coords([o for o in objs if o.type in ('MESH', 'CURVE')])]
    lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    c = (lo + hi) / 2
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    s.camera = cam
    cam.data.lens, cam.data.sensor_width, cam.data.sensor_fit = 90, 36, 'HORIZONTAL'
    cam.data.clip_start, cam.data.clip_end = .01, 100
    cam.rotation_euler = (math.pi / 2, 0, 0)
    dist = 7.0
    step = max(1, len(pts) // 4000)
    sm = pts[::step]
    for _ in range(14):
        cam.location = (c.x, c.y - dist, c.z)
        bpy.context.view_layer.update()
        nd = [world_to_camera_view(s, cam, p) for p in sm]
        x0, x1 = min(n.x for n in nd), max(n.x for n in nd)
        y0, y1 = min(n.y for n in nd), max(n.y for n in nd)
        dist *= max(x1 - x0, y1 - y0) / fill
        cam.data.shift_x += (x0 + x1) / 2 - .5
        cam.data.shift_y += (y0 + y1) / 2 - .5
    # warm key (upper left front), cool fill (right), cool-white rim from behind above, warm bounce below
    sun((-.75, -.9, .85), 3.6, '#ffe0b0', 14)
    sun((1.0, -.5, .25), 1.1, '#9cc4ff', 30)
    sun((.4, .9, .9), 5.0, '#d6ecff', 8)
    sun((-.6, .5, .2), 1.6, '#b9dcff', 10)
    sun((0, -.5, -.9), .55, '#ffb070', 30)


def grade(sat=1.0, val=1.0, contrast=0.0):
    """Compositor colour grade (Render Layers -> Hue/Sat/Value -> Contrast -> Composite); alpha passes through."""
    s = bpy.context.scene
    s.use_nodes = True
    nt = s.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new('CompositorNodeRLayers')
    hs = nt.nodes.new('CompositorNodeHueSat')
    hs.inputs['Saturation'].default_value = sat
    hs.inputs['Value'].default_value = val
    bc = nt.nodes.new('CompositorNodeBrightContrast')
    bc.inputs['Contrast'].default_value = contrast
    co = nt.nodes.new('CompositorNodeComposite')
    co.use_alpha = True
    nt.links.new(rl.outputs['Image'], hs.inputs['Image'])
    nt.links.new(hs.outputs['Image'], bc.inputs['Image'])
    nt.links.new(bc.outputs['Image'], co.inputs['Image'])


def save(name):
    s = bpy.context.scene
    s.render.image_settings.color_mode = 'RGBA'
    if OPT.scale == 1.0:
        os.makedirs(OUT, exist_ok=True)
        s.render.image_settings.file_format = 'WEBP'
        s.render.image_settings.quality = OPT.quality
        s.render.filepath = os.path.join(OUT, name + '.webp')
        bpy.ops.render.render(write_still=True)
    if OPT.png or OPT.scale != 1.0:
        os.makedirs(REVIEW, exist_ok=True)
        s.render.image_settings.file_format = 'PNG'
        s.render.filepath = os.path.join(REVIEW, name + ('' if OPT.scale == 1.0 else '@%g' % OPT.scale) + '.png')
        bpy.ops.render.render(write_still=True)


def contact_sheet(path):
    """Dark + light backdrop preview of the written WebP files (sRGB alpha compositing, like a browser)."""
    import numpy as np
    files = ['emblem-%s.webp' % e for e in EMBLEMS if os.path.isfile(os.path.join(OUT, 'emblem-%s.webp' % e))]
    tiles = []
    for f in files:
        im = bpy.data.images.load(os.path.join(OUT, f))
        w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        tiles.append(a.reshape(h, w, 4))
    pad = 16
    tw, th = tiles[0].shape[1], tiles[0].shape[0]
    bands = [tuple(int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)) for c in ('#0d1826', '#e9eef3')]
    band_h = th + 2 * pad
    W, H = len(tiles) * (tw + pad) + pad, band_h * len(bands)
    sheet = np.ones((H, W, 4), dtype=np.float32)
    for row, bg in enumerate(bands):                       # image rows run bottom-up: row 0 is the top band
        yb = H - (row + 1) * band_h
        sheet[yb:yb + band_h, :, :3] = bg
        for i, t in enumerate(tiles):
            x, y = pad + i * (tw + pad), yb + pad
            al = t[..., 3:4]
            sheet[y:y + th, x:x + tw, :3] = np.array(bg) * (1 - al) + t[..., :3] * al
    out = bpy.data.images.new('sheet', W, H, alpha=False)
    out.pixels.foreach_set(sheet.reshape(-1))
    out.filepath_raw = _abs(path)
    out.file_format = 'PNG'
    os.makedirs(os.path.dirname(_abs(path)), exist_ok=True)
    out.save()
    print('SHEET', _abs(path))


if __name__ == '__main__':
    t0 = time.time()
    for e in TODO:
        t = time.time()
        new_scene()
        objs = BUILDERS[e]()
        stage(objs)
        grade(sat=1.05, contrast=.06)
        save('emblem-' + e)
        print('EMBLEM', e, '%.1fs' % (time.time() - t))
    if OPT.sheet:
        contact_sheet(OPT.sheet)
    print('DONE %d emblems in %.1fs -> %s' % (len(TODO), time.time() - t0, OUT))
