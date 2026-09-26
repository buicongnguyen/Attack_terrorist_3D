"""Tidelock stylized art kit: chunky toy forms, soft bevels, glossy warm paint.

Every generator in tools/blender builds its models through `Kit`:

* Colours are authored as sRGB hex swatches (PALETTE) and live in each
  material's baseColorFactor, so the runtime can recolour a clone.
* Painted materials multiply that colour with one tiny shared vertical ramp
  (cool shadow at V=0, warm light at V=1). `Kit.finish()` maps every vertex's
  height onto the ramp, giving all models the same hand-painted ambient
  occlusion for a few hundred bytes.
* Parts are built with bmesh (no operators, no context), bevelled, given
  area-weighted custom normals (big faces stay flat, bevels stay soft) and
  merged into one mesh per (pivot, material) so each GLB costs few draw calls.
* Pivots are EMPTIES with identity rotation. Builders take coordinates in
  asset space (Blender Z-up, metres, forward = +Y) and the kit converts them to
  the pivot's local space.

After glTF export Blender +Y (forward) becomes runtime -Z and +Z becomes +Y.
"""
import json
import math
import re
import struct

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

PALETTE = {
    # Kestrel Response Unit (friendly)
    'sky': '#2f86e8', 'navy': '#173a6b', 'sun': '#ffc62b', 'white': '#f7f1e1',
    'mint': '#33d69f',
    # Ashen Front (hostile)
    'charcoal': '#2f2c35', 'ember': '#ff4b2b', 'ash': '#8d8791', 'webbing': '#d9a45a',
    # Munitions
    'drill': '#ff7a1a', 'violet': '#b04cff', 'blast': '#ff3b3b', 'lance': '#18d5ff',
    # Environment
    'sea': '#19b9c9', 'sand': '#f2d19a', 'grass': '#5cbf45', 'foliage': '#3aa33c',
    'lime': '#8fd64a', 'rock': '#c99f74', 'terracotta': '#e2704f', 'coral': '#ff8a6b',
    'mustard': '#f2b441', 'teal': '#2fb3a6', 'cream': '#f6e7c8', 'asphalt': '#3a3d46',
    'hazard': '#ffcc1f', 'glass': '#7fd8ff', 'rubber': '#24262b', 'gunmetal': '#3a4048',
    'steel': '#9aa6af', 'brass': '#f2b134', 'lamp': '#fff1a8',
    'khaki': '#8f9a5b', 'pine': '#1f8450', 'olive': '#a6a64c',
}

# key: (material name, sRGB colour, roughness, metallic, emission strength, options)
# Metallic stays low: the runtime has no environment map, so metal would go dark.
MATERIALS = {
    # friendly
    'sky': ('Kestrel sky', '#2f86e8', .38, 0),
    'navy': ('Kestrel navy', '#173a6b', .42, 0),
    'sun': ('Sunflower', '#ffc62b', .38, 0),
    'white': ('Warm white', '#f7f1e1', .4, 0),
    'mint': ('Relief mint', '#33d69f', .38, 0),
    'orange': ('Signal orange', '#ff8a1f', .38, 0),
    # hostile
    'charcoal': ('Ashen charcoal', '#2f2c35', .5, 0),
    'char_light': ('Ashen slate', '#4a4652', .5, 0),
    'ember': ('Ember paint', '#ff4b2b', .36, 0),
    'ash': ('Ash grey', '#8d8791', .55, 0),
    'webbing': ('Sand webbing', '#d9a45a', .62, 0),
    'accent': ('Hostile accent', '#ff4b2b', .34, 0),
    'beacon': ('Beacon light', '#ff4b2b', .3, 0, 5.0),
    'ember_glow': ('Ember glow', '#ff5a2a', .3, 0, 4.0),
    # munitions
    'drill': ('Drill orange', '#ff7a1a', .36, 0),
    'violet': ('Scatter violet', '#b04cff', .36, 0),
    'violet_dark': ('Scatter plum', '#5d2a8a', .45, 0),
    'blast': ('Shockwave red', '#ff3b3b', .34, 0),
    'lance': ('Lance cyan', '#18d5ff', .34, 0),
    'seeker': ('Seeker glass', '#1b2a44', .12, 0),
    # people
    'skin': ('Skin warm', '#f2b48a', .6, 0),
    'skin_deep': ('Skin deep', '#b9784e', .6, 0),
    'hair': ('Hair dark', '#3a2519', .6, 0),
    # environment
    'sand': ('Sand', '#f2d19a', .7, 0),
    'grass': ('Grass', '#5cbf45', .55, 0),
    'foliage': ('Foliage', '#3aa33c', .42, 0, 0, {'double': True}),
    'lime': ('Lime leaf', '#8fd64a', .4, 0, 0, {'double': True}),
    'leaf_deep': ('Leaf deep', '#23843a', .45, 0, 0, {'double': True}),
    'rock': ('Warm rock', '#c99f74', .72, 0),
    'rock_dark': ('Warm rock shade', '#9c7552', .75, 0),
    'moss': ('Moss', '#7cc443', .6, 0),
    'terracotta': ('Terracotta', '#e2704f', .5, 0),
    'coral': ('Coral', '#ff8a6b', .42, 0),
    'mustard': ('Mustard', '#f2b441', .45, 0),
    'teal': ('Teal', '#2fb3a6', .42, 0),
    'cream': ('Cream', '#f6e7c8', .5, 0),
    'concrete': ('Warm concrete', '#d8c6aa', .75, 0),
    'concrete_dark': ('Concrete shade', '#a8967e', .78, 0),
    'bunker': ('Bunker concrete', '#a8969a', .72, 0),
    'bunker_dark': ('Bunker footing', '#76666e', .75, 0),
    'asphalt': ('Asphalt', '#3a3d46', .7, 0),
    'hazard': ('Hazard yellow', '#ffcc1f', .4, 0),
    'glass': ('Glass', '#7fd8ff', .08, 0, .12, {'ramp': False}),
    'glass_dark': ('Tinted glass', '#23507e', .08, 0, 0, {'ramp': False}),
    'rubber': ('Rubber', '#24262b', .7, 0),
    'gunmetal': ('Gunmetal', '#3a4048', .38, .25),
    'steel': ('Steel', '#9aa6af', .34, .25),
    'brass': ('Brass', '#f2b134', .3, .2),
    'gold': ('Medal gold', '#ffc21a', .24, .2),
    'lamp': ('Lamp glow', '#fff1a8', .3, 0, 3.0),
    'mint_glow': ('Mint glow', '#5cffc4', .3, 0, 3.0),
    'wood': ('Warm wood', '#c47f45', .62, 0),
    'wood_light': ('Pale wood', '#e0a868', .6, 0),
    'wood_dark': ('Dark wood', '#8a5530', .65, 0),
    'bark': ('Bark', '#8b5a3c', .7, 0),
    'palm_bark': ('Palm bark', '#c8904f', .66, 0),
    'fuel': ('Fuel red', '#f2302a', .34, 0),
    'car': ('Car paint', '#ff6a3d', .3, 0),
    'livery': ('Livery', '#ffc62b', .36, 0),
    'tyre': ('Tyre black', '#24262b', .75, 0),
    'coconut': ('Coconut', '#9a5a2c', .55, 0),
    'blossom': ('Blossom', '#ff7fa8', .45, 0),
    # frontier (river / valley): Ashen barracks walls, conifers, dry canyon scrub
    'khaki': ('Olive khaki', '#8f9a5b', .6, 0),
    'pine': ('Pine green', '#1f8450', .5, 0),
    'olive': ('Dry olive', '#a6a64c', .62, 0),
}

RAMP_LOW, RAMP_HIGH = .74, 1.0
SHARP_DEFAULT = 50.0


def srgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def linear(c):
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)


def _matrix(loc=(0, 0, 0), rot=None, scale=None):
    m = Matrix.Translation(Vector(loc))
    if rot is not None:
        if isinstance(rot, Matrix):
            m = m @ rot.to_4x4()
        else:
            m = m @ Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
    if scale is not None:
        s = scale if isinstance(scale, (tuple, list, Vector)) else (scale,) * 3
        m = m @ Matrix.Diagonal((*s, 1))
    return m


AXIS_ROT = {
    'Z': Matrix.Identity(3),
    'X': Euler((0, math.pi / 2, 0)).to_matrix(),
    'Y': Euler((-math.pi / 2, 0, 0)).to_matrix(),
}


def superellipse(w, h, n=2.0, count=16, cx=0.0, cz=0.0, bottom=None):
    """Closed ring of (x, z) points: half-width w, half-height h, exponent n.

    n=2 is an ellipse, n=3..5 is a rounded rectangle (toy car body, hull).
    `bottom` (optional) flattens/pinches the lower half to that half-height.
    """
    pts = []
    for i in range(count):
        t = math.tau * i / count
        c, s = math.cos(t), math.sin(t)
        x = w * math.copysign(abs(c) ** (2 / n), c)
        hh = h if (s >= 0 or bottom is None) else bottom
        z = hh * math.copysign(abs(s) ** (2 / n), s)
        pts.append((cx + x, cz + z))
    return pts


class _Buffer:
    __slots__ = ('verts', 'faces', 'normals')

    def __init__(self):
        self.verts, self.faces, self.normals = [], [], []


class Kit:
    """Material library plus bmesh primitive builders for one asset at a time."""

    def __init__(self, collection=None, tag='tidelock'):
        self.collection = collection or bpy.context.scene.collection
        self.tag = tag
        self.materials = {}
        self.ramp_image = None
        self.root = None

    # ------------------------------------------------------------------ materials
    def _tagged(self, idblock):
        idblock[self.tag] = True
        return idblock

    def ramp(self):
        """Neutral painted-light ramp: cool shadow at V=0, warm light at V=1."""
        if self.ramp_image is not None:
            return self.ramp_image
        size = 32
        pixels = []
        for y in range(size):
            t = y / (size - 1)
            t = t * t * (3 - 2 * t)
            k = RAMP_LOW + (RAMP_HIGH - RAMP_LOW) * t
            tint = (1 - .06 * (1 - t), 1 - .025 * (1 - t), 1 + .03 * (1 - t) - .03 * t)
            pixels.extend(([max(0., min(1., k * c)) for c in tint] + [1.]) * 2)
        image = bpy.data.images.new('Painted light ramp', width=2, height=size)
        image.pixels.foreach_set(pixels)
        image.pack()
        self.ramp_image = self._tagged(image)
        return image

    def mat(self, key):
        """Material by catalogue key (see MATERIALS) or an existing bpy material."""
        if isinstance(key, bpy.types.Material):
            return key
        if key in self.materials:
            return self.materials[key]
        spec = MATERIALS[key]
        name, color, rough, metal = spec[:4]
        emit = spec[4] if len(spec) > 4 else 0
        opts = spec[5] if len(spec) > 5 else {}
        c = linear(srgb(color))
        m = self._tagged(bpy.data.materials.new(name))
        m.diffuse_color = (*c, 1)
        m.use_nodes = True
        m.use_backface_culling = not opts.get('double', False)
        tree = m.node_tree
        p = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        p.inputs['Base Color'].default_value = (*c, 1)
        p.inputs['Roughness'].default_value = rough
        p.inputs['Metallic'].default_value = metal
        if emit:
            p.inputs['Emission Color'].default_value = (*c, 1)
            p.inputs['Emission Strength'].default_value = emit
        if not emit and opts.get('ramp', True):
            tex = tree.nodes.new('ShaderNodeTexImage')
            tex.image = self.ramp()
            tex.extension = 'EXTEND'
            tex.interpolation = 'Linear'
            mix = tree.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1
            tree.links.new(tex.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = (*c, 1)
            tree.links.new(mix.outputs[2], p.inputs['Base Color'])
        self.materials[key] = m
        return m

    # ------------------------------------------------------------------ hierarchy
    def _link(self, obj):
        self.collection.objects.link(obj)
        return self._tagged(obj)

    def begin(self, name):
        """Start an asset: an empty root at the origin named after the file."""
        self.root = self._link(bpy.data.objects.new(name, None))
        self.root.empty_display_size = .5
        self.asset = name
        self.origin = {self.root: Vector()}
        self.groups = {}
        self.order = []
        return self.root

    def joint(self, name, loc, parent=None):
        """Articulation empty (identity rotation) at asset-space `loc`."""
        parent = parent or self.root
        o = self._link(bpy.data.objects.new(name, None))
        o.empty_display_type = 'PLAIN_AXES'
        o.empty_display_size = .3
        o.parent = parent
        o.location = Vector(loc) - self.origin[parent]
        self.origin[o] = Vector(loc)
        return o

    # ------------------------------------------------------------------ core add
    def _add(self, bm, mat, parent=None, matrix=None, smooth=True, sharp=SHARP_DEFAULT, wexp=2.0):
        if matrix is not None:
            bm.transform(matrix)
            if matrix.to_3x3().determinant() < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.normal_update()
        parent = parent or self.root
        material = self.mat(mat)
        key = (parent.name, material.name)
        if key not in self.groups:
            self.groups[key] = (parent, material, _Buffer())
            self.order.append(key)
        buf = self.groups[key][2]
        offset = self.origin[parent]
        bm.verts.index_update()
        base = len(buf.verts)
        buf.verts.extend((v.co - offset) for v in bm.verts)
        corner = _loop_normals(bm, smooth, sharp, wexp)
        for f in bm.faces:
            idx = [l.vert.index for l in f.loops]
            if len(set(idx)) < 3:
                continue
            buf.faces.append([base + i for i in idx])
            buf.normals.extend(corner[l.index] for l in f.loops)
        bm.free()

    # ------------------------------------------------------------------ primitives
    @staticmethod
    def bevel(bm, width, segments=2, angle=30.0, profile=.5):
        if width <= 0:
            return
        limit = math.radians(angle)
        edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > limit]
        if edges:
            bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type='OFFSET',
                            profile_type='SUPERELLIPSE', segments=segments, profile=profile,
                            affect='EDGES', clamp_overlap=True, loop_slide=True)

    def box(self, loc, size, mat, bevel=.05, seg=2, rot=None, parent=None, smooth=True, taper=None,
            shift=(0, 0), profile=.5):
        """Bevelled box centred on `loc`. `taper`=(sx, sy) scales the top face."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        sx, sy, sz = size
        for v in bm.verts:
            top = v.co.z > 0
            tx, ty = taper if (taper and top) else (1, 1)
            v.co.x *= sx * tx
            v.co.y *= sy * ty
            v.co.z *= sz
            if top:
                v.co.x += shift[0]
                v.co.y += shift[1]
        b = min(bevel, min(size) * .48)
        self.bevel(bm, b, seg, profile=profile)
        self._add(bm, mat, parent, _matrix(loc, rot), smooth)

    def tbox(self, loc, top, bottom, height, mat, bevel=.05, seg=2, shift=(0, 0), rot=None, parent=None):
        """Tapered box: `top`/`bottom` are (x, y) sizes; `shift` slides the top face."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts:
            s = top if v.co.z > 0 else bottom
            v.co.x *= s[0]
            v.co.y *= s[1]
            v.co.z *= height
            if v.co.z > 0:
                v.co.x += shift[0]
                v.co.y += shift[1]
        self.bevel(bm, min(bevel, height * .48, min(top + bottom) * .48), seg)
        self._add(bm, mat, parent, _matrix(loc, rot))

    def cyl(self, loc, r, depth, mat, axis='Z', verts=16, bevel=0., seg=2, r2=None, rot=None,
            parent=None, cap=True, smooth=True):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=r,
                              radius2=r if r2 is None else r2, depth=depth)
        if bevel:
            rr = min(r, r2) if r2 else r
            self.bevel(bm, min(bevel, depth * .45, rr * .9), seg, angle=55)
        m = AXIS_ROT[axis]
        if rot is not None:
            m = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix() @ m
        self._add(bm, mat, parent, _matrix(loc, m), smooth, wexp=1.5)

    def sphere(self, loc, radii, mat, seg=16, rings=8, rot=None, parent=None, smooth=True):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
        r = radii if isinstance(radii, (tuple, list)) else (radii,) * 3
        self._add(bm, mat, parent, _matrix(loc, rot, r), smooth, wexp=1.0)

    def ico(self, loc, radii, mat, subdiv=1, rot=None, parent=None, smooth=False):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
        r = radii if isinstance(radii, (tuple, list)) else (radii,) * 3
        self._add(bm, mat, parent, _matrix(loc, rot, r), smooth, wexp=1.0)

    def skin(self, rings, mat, parent=None, cap_start=True, cap_end=True, closed=True, smooth=True,
             sharp=SHARP_DEFAULT, wexp=1.0, matrix=None):
        """Bridge a list of vertex rings (equal counts). A ring of one point is a pole."""
        bm = bmesh.new()
        vr = []
        for ring in rings:
            pts = [Vector(p) for p in ring]
            if len(pts) > 1 and max((p - pts[0]).length for p in pts) < 1e-6:
                pts = pts[:1]
            vr.append([bm.verts.new(p) for p in pts])
        for a, b in zip(vr, vr[1:]):
            n = max(len(a), len(b))
            span = n if closed else n - 1
            for i in range(span):
                j = (i + 1) % n
                if len(a) == 1:
                    bm.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1:
                    bm.faces.new((a[i], a[j], b[0]))
                else:
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        if closed:
            if cap_start and len(vr[0]) > 2:
                bm.faces.new(list(reversed(vr[0])))
            if cap_end and len(vr[-1]) > 2:
                bm.faces.new(vr[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self._add(bm, mat, parent, matrix, smooth, sharp, wexp)

    def lathe(self, profile, mat, loc=(0, 0, 0), axis='Z', verts=16, rot=None, parent=None, smooth=True,
              sharp=SHARP_DEFAULT, wexp=1.0, scale=None, cap=(True, True)):
        """Revolve [(radius, height), ...] (bottom to top) around `axis`."""
        rings = []
        for r, h in profile:
            if r <= 1e-6:
                rings.append([(0, 0, h)])
            else:
                rings.append([(r * math.cos(math.tau * i / verts), r * math.sin(math.tau * i / verts), h)
                              for i in range(verts)])
        m = AXIS_ROT[axis]
        if rot is not None:
            m = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix() @ m
        self.skin(rings, mat, parent, cap[0], cap[1], smooth=smooth, sharp=sharp, wexp=wexp,
                  matrix=_matrix(loc, m, scale))

    def loft(self, sections, mat, parent=None, smooth=True, sharp=SHARP_DEFAULT, wexp=1.0, cap=(True, True),
             loc=(0, 0, 0), rot=None):
        """Loft along +Y: sections are (y, [(x, z), ...]) with equal point counts."""
        rings = [[(x, y, z) for x, z in pts] for y, pts in sections]
        self.skin(rings, mat, parent, cap[0], cap[1], smooth=smooth, sharp=sharp, wexp=wexp,
                  matrix=_matrix(loc, rot))

    def rod(self, a, b, r, mat, verts=8, parent=None, r2=None, bevel=0., cap=True, smooth=True):
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=r,
                              radius2=r if r2 is None else r2, depth=d.length)
        if bevel:
            self.bevel(bm, min(bevel, d.length * .45, r * .9), 2, angle=55)
        q = d.to_track_quat('Z', 'Y')
        self._add(bm, mat, parent, _matrix((a + b) / 2, q.to_matrix()), smooth, wexp=1.5)

    def capsule(self, a, b, r1, r2, mat, verts=12, rings=3, parent=None):
        """Tapered capsule (round ends) from a to b: limbs, barrels, horns."""
        a, b = Vector(a), Vector(b)
        d = b - a
        L = d.length
        prof = [(0, -r1)]
        for i in range(1, rings + 1):
            t = math.pi / 2 * i / rings
            prof.append((r1 * math.sin(t), -r1 * math.cos(t)))
        for i in range(rings - 1, -1, -1):
            t = math.pi / 2 * i / rings
            prof.append((r2 * math.sin(t), L + r2 * math.cos(t)))
        prof = [(r, h) for r, h in prof]
        q = d.to_track_quat('Z', 'Y')
        rings_v = []
        for r, h in prof:
            if r <= 1e-6:
                rings_v.append([(0, 0, h)])
            else:
                rings_v.append([(r * math.cos(math.tau * i / verts), r * math.sin(math.tau * i / verts), h)
                                for i in range(verts)])
        self.skin(rings_v, mat, parent, matrix=_matrix(a, q.to_matrix()))

    def torus(self, loc, R, r, mat, axis='Z', seg=24, minor=8, rot=None, parent=None, scale=None):
        rings = []
        for i in range(seg):
            a = math.tau * i / seg
            ca, sa = math.cos(a), math.sin(a)
            rings.append([((R + r * math.cos(math.tau * j / minor)) * ca,
                           (R + r * math.cos(math.tau * j / minor)) * sa,
                           r * math.sin(math.tau * j / minor)) for j in range(minor)])
        bm = bmesh.new()
        vr = [[bm.verts.new(p) for p in ring] for ring in rings]
        for i in range(seg):
            a, b = vr[i], vr[(i + 1) % seg]
            for j in range(minor):
                k = (j + 1) % minor
                bm.faces.new((a[j], b[j], b[k], a[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        m = AXIS_ROT[axis]
        if rot is not None:
            m = Euler([math.radians(x) for x in rot], 'XYZ').to_matrix() @ m
        self._add(bm, mat, parent, _matrix(loc, m, scale), True, wexp=1.0)

    def prism(self, profile, width, mat, loc=(0, 0, 0), axis='X', bevel=.02, seg=2, rot=None, parent=None,
              smooth=True):
        """Extrude a 2D profile. axis X: [(y, z)], axis Y: [(x, z)], axis Z: [(x, y)]."""
        bm = bmesh.new()
        if axis == 'X':
            verts = [bm.verts.new((-width / 2, p[0], p[1])) for p in profile]
            vec = Vector((width, 0, 0))
        elif axis == 'Y':
            verts = [bm.verts.new((p[0], -width / 2, p[1])) for p in profile]
            vec = Vector((0, width, 0))
        else:
            verts = [bm.verts.new((p[0], p[1], -width / 2)) for p in profile]
            vec = Vector((0, 0, width))
        face = bm.faces.new(verts)
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        bmesh.ops.translate(bm, vec=vec, verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if bevel:
            self.bevel(bm, bevel, seg)
        self._add(bm, mat, parent, _matrix(loc, rot), smooth)

    def star(self, loc, r_out, r_in, depth, mat, points=5, axis='Z', bevel=.03, seg=2, rot=None, parent=None,
             spin=90.0):
        prof = []
        for i in range(points * 2):
            a = math.radians(spin) + i * math.pi / points
            r = r_out if i % 2 == 0 else r_in
            prof.append((math.cos(a) * r, math.sin(a) * r))
        if axis == 'Z':
            self.prism(prof, depth, mat, loc, 'Z', bevel, seg, rot, parent)
        else:
            self.prism([(x, y) for x, y in prof], depth, mat, loc, 'Y', bevel, seg, rot, parent)

    def mesh(self, verts, faces, mat, parent=None, smooth=True, sharp=SHARP_DEFAULT, wexp=1.0, matrix=None,
             recalc=True):
        bm = bmesh.new()
        bv = [bm.verts.new(v) for v in verts]
        for f in faces:
            try:
                bm.faces.new([bv[i] for i in f])
            except ValueError:
                pass
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self._add(bm, mat, parent, matrix, smooth, sharp, wexp)

    def sweep(self, points, radius, mat, verts=8, parent=None, radii=None, cap=True):
        """Tube along a polyline (roots, handles, thread ridges, cables)."""
        pts = [Vector(p) for p in points]
        rings = []
        up = Vector((0, 0, 1))
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = up if abs(d.dot(up)) < .95 else Vector((1, 0, 0))
            x = d.cross(ref).normalized()
            y = d.cross(x).normalized()
            r = radii[i] if radii else radius
            rings.append([p + (x * math.cos(math.tau * j / verts) + y * math.sin(math.tau * j / verts)) * r
                          for j in range(verts)])
        self.skin(rings, mat, parent, cap, cap)

    def wheel(self, loc, r, width, mat_tyre='tyre', mat_rim='white', mat_hub='gunmetal', parent=None, lugs=0,
              verts=16, sides=None):
        """Fat round-shouldered toy tyre with a bright dished rim (axis X).

        `sides` limits the rim/hub to the visible face(s): -1, +1 or None for both.
        """
        x, y, z = loc
        w = width / 2
        prof = [(r * .55, -w * .96), (r * .84, -w), (r * .99, -w * .62), (r * .99, w * .62), (r * .84, w),
                (r * .55, w * .96)]
        self.lathe(prof, mat_tyre, (x, y, z), 'X', verts, parent=parent, sharp=70)
        for s in ((-1, 1) if sides is None else (sides,)):
            dish = [(r * .6, 0), (r * .56, w * .05), (r * .3, w * .02), (r * .2, w * .1), (0, w * .12)]
            self.lathe([(a, s * b) for a, b in dish], mat_rim, (x + s * w * .9, y, z), 'X', verts, parent=parent,
                       sharp=70)
            if mat_hub:
                self.cyl((x + s * w * 1.02, y, z), r * .16, w * .12, mat_hub, 'X', 8, parent=parent)
        for i in range(lugs):
            a = math.tau * i / lugs
            self.box((x, y + math.sin(a) * r * .98, z + math.cos(a) * r * .98),
                     (width * .8, r * .22, r * .1), mat_tyre, .02, 1, rot=(-math.degrees(a), 0, 0),
                     parent=parent)

    # ------------------------------------------------------------------ finish
    def finish(self):
        """Merge parts per (pivot, material), paint the height ramp, return stats."""
        root = self.root
        zs = []
        for parent, material, buf in self.groups.values():
            oz = self.origin[parent].z
            zs.extend(v.z + oz for v in buf.verts)
        lo, hi = (min(zs), max(zs)) if zs else (0, 1)
        span = max(hi - lo, 1e-4)
        tris = 0
        objects = []
        for key in self.order:
            parent, material, buf = self.groups[key]
            pname = parent.name.split('.')[0]
            label = self.asset if parent is root else pname
            name = '%s %s %s' % (self.asset, '' if parent is root else pname, material.name)
            name = re.sub(r'\s+', ' ', name)
            me = self._tagged(bpy.data.meshes.new(name))
            me.from_pydata([tuple(v) for v in buf.verts], [], buf.faces)
            me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
            me.materials.append(material)
            uv = me.uv_layers.new(name='UVMap')
            oz = self.origin[parent].z
            flat = []
            for loop in me.loops:
                z = buf.verts[loop.vertex_index].z + oz
                flat.extend((.5, .03 + .94 * max(0., min(1., (z - lo) / span))))
            uv.data.foreach_set('uv', flat)
            me.normals_split_custom_set([tuple(n) for n in buf.normals])
            me.update()
            ob = self._link(bpy.data.objects.new(name, me))
            ob.parent = parent
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            objects.append(ob)
            del label
        self.groups = {}
        self.order = []
        return {'name': self.asset, 'root': root, 'meshes': len(objects), 'triangles': tris}


def _loop_normals(bm, smooth, sharp_deg, wexp):
    """Per-corner normals: area-weighted within smooth fans split at sharp edges.

    With wexp=2 large faces dominate their vertices, so a bevelled box keeps
    perfectly flat faces while its bevel strips curve softly (the weighted
    normal look) without needing a modifier or operator context.
    """
    bm.faces.index_update()
    loops = {}
    idx = 0
    for f in bm.faces:
        for l in f.loops:
            l.index = idx
            idx += 1
    out = [None] * idx
    if not smooth:
        for f in bm.faces:
            n = f.normal.copy()
            for l in f.loops:
                out[l.index] = n
        return out
    cos_sharp = math.cos(math.radians(sharp_deg))
    area = {f: max(f.calc_area(), 1e-9) ** wexp for f in bm.faces}
    for v in bm.verts:
        faces = list(v.link_faces)
        if not faces:
            continue
        parent = {f: f for f in faces}

        def find(f):
            while parent[f] is not f:
                parent[f] = parent[parent[f]]
                f = parent[f]
            return f

        for e in v.link_edges:
            lf = e.link_faces
            if len(lf) == 2 and e.smooth and lf[0].normal.dot(lf[1].normal) >= cos_sharp:
                ra, rb = find(lf[0]), find(lf[1])
                if ra is not rb:
                    parent[ra] = rb
        sums = {}
        for f in faces:
            r = find(f)
            sums[r] = sums.get(r, Vector()) + f.normal * area[f]
        for l in v.link_loops:
            n = sums[find(l.face)]
            out[l.index] = n.normalized() if n.length > 1e-12 else l.face.normal.copy()
    del loops
    return out


# ---------------------------------------------------------------------- export
def export_glb(root, path):
    """Export `root` and its descendants as a GLB; strip Blender .001 suffixes."""
    objs = [root, *root.children_recursive]
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_apply=True, export_animations=False, export_cameras=False,
                              export_lights=False, export_extras=False, export_yup=True,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_draco_mesh_compression_enable=False)
    strip_glb_suffixes(path)


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB'
    jlen, jtype = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    rest = data[20 + jlen:]
    return doc, rest


def write_glb(path, doc, rest):
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + len(rest)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A))
        fh.write(js)
        fh.write(rest)


def strip_glb_suffixes(path):
    doc, rest = read_glb(path)
    pat = re.compile(r'\.\d{3}$')
    for key in ('nodes', 'meshes', 'materials'):
        for item in doc.get(key, []):
            if 'name' in item:
                item['name'] = pat.sub('', item['name'])
    write_glb(path, doc, rest)


def glb_info(path):
    import os
    doc, _ = read_glb(path)
    tris = 0
    for mesh in doc.get('meshes', []):
        for prim in mesh['primitives']:
            if prim.get('mode', 4) == 4:
                acc = doc['accessors'][prim['indices']] if 'indices' in prim else \
                    doc['accessors'][prim['attributes']['POSITION']]
                tris += acc['count'] // 3
    nodes = doc.get('nodes', [])
    return {
        'bytes': os.path.getsize(path),
        'triangles': tris,
        'meshes': sum(1 for n in nodes if 'mesh' in n),
        'primitives': sum(len(m['primitives']) for m in doc.get('meshes', [])),
        'nodes': nodes,
        'materials': [m.get('name', '') for m in doc.get('materials', [])],
        'extensions': doc.get('extensionsUsed', []),
        'images': len(doc.get('images', [])),
    }
