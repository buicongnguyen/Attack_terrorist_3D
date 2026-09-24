"""Render Tidelock review contact sheets from the exported GLBs.

Run from the repo root (after build_assets.py):
  blender --background --factory-startup --python tools/blender/render_sheet.py -- \
      --models public/models --docs docs

Writes docs/asset-sheet.png (every asset, normalised into a labelled grid) and
docs/asset-sheet-city.png / -river.png / -valley.png (true-scale chapter
lineups seen from a game-like three-quarter camera). Eevee, Standard view
transform, warm key + cool fill + rim light.

The staging helpers (stage, aim, label, lineup, grid) are also imported by the
live Blender review loop.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True  # keep tools/blender free of __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import style  # noqa: E402

STAGE_TAG = 'tidelock_stage'


def _tag(idb):
    idb[STAGE_TAG] = True
    return idb


def _lin(hexcol):
    return (*style.linear(style.srgb(hexcol)), 1)


def stage(scene, background='#cfe4f2', strength=.75):
    """Eevee + Standard view transform + warm key / cool fill / rim suns."""
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.compression = 90
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    world = scene.world
    if world is None or not world.get(STAGE_TAG):
        world = _tag(bpy.data.worlds.new('Tidelock review sky'))
        scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = _lin(background)
    bg.inputs[1].default_value = strength
    for o in list(scene.objects):
        if o.get(STAGE_TAG) and o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
    for name, direction, energy, color, angle in (
            ('Warm key', (-.55, -.35, -.76), 3.1, (1, .9, .74), 3),
            ('Cool fill', (.7, .3, -.45), 1.0, (.62, .78, 1), 10),
            ('Rim', (.1, .95, -.3), 1.8, (1, .97, .92), 4)):
        data = _tag(bpy.data.lights.new(name, 'SUN'))
        data.energy = energy
        data.color = color
        data.angle = math.radians(angle)
        o = _tag(bpy.data.objects.new(name, data))
        scene.collection.objects.link(o)
        o.rotation_euler = Vector(direction).to_track_quat('-Z', 'Y').to_euler()
    return scene


def mesh_bounds(objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    bpy.context.view_layer.update()
    for o in objs:
        for m in [o, *o.children_recursive]:
            if m.type != 'MESH':
                continue
            for c in m.bound_box:
                w = m.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
    return lo, hi


def view_dir(az, el):
    a, e = math.radians(az), math.radians(el)
    return Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))


def aim(scene, objs, az=32, el=38, margin=1.1, res=(1200, 900), extra=()):
    """Orthographic camera looking from azimuth `az` (0 = +Y front) framing `objs`."""
    cam = scene.camera
    if cam is None or not cam.get(STAGE_TAG):
        cam = _tag(bpy.data.objects.new('Review camera', _tag(bpy.data.cameras.new('Review camera'))))
        scene.collection.objects.link(cam)
        scene.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.clip_start = .1
    cam.data.clip_end = 2000
    d = view_dir(az, el)
    q = d.to_track_quat('Z', 'Y')
    right, up = q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0))
    pts = []
    for o in objs:
        for m in [o, *o.children_recursive]:
            if m.type in ('MESH', 'FONT'):
                pts.extend(m.matrix_world @ Vector(c) for c in m.bound_box)
    pts.extend(Vector(p) for p in extra)
    xs = [p.dot(right) for p in pts]
    ys = [p.dot(up) for p in pts]
    zs = [p.dot(d) for p in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    aspect = res[0] / res[1]
    cam.data.ortho_scale = max(w, h * aspect) * margin
    cam.rotation_euler = q.to_euler()
    cam.location = right * (max(xs) + min(xs)) / 2 + up * (max(ys) + min(ys)) / 2 + d * (max(zs) + 60)
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    return cam


def game_camera(scene, target, units_across=50.0, res=(1440, 900), az=26, el=40):
    """Camera matching the game's scale: `units_across` world units over res[0] px."""
    cam = aim(scene, [], az, el, res=res, extra=[Vector(target)])
    cam.data.ortho_scale = units_across
    d = view_dir(az, el)
    cam.location = Vector(target) + d * 120
    return cam


def label(scene, text, loc, size, cam, color='#173a6b', collection=None):
    curve = _tag(bpy.data.curves.new('Label', 'FONT'))
    curve.body = text
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    o = _tag(bpy.data.objects.new('Label ' + text[:20], curve))
    (collection or scene.collection).objects.link(o)
    o.location = loc
    o.rotation_euler = cam.rotation_euler.copy()
    m = bpy.data.materials.get('Review label ' + color)
    if m is None:
        m = _tag(bpy.data.materials.new('Review label ' + color))
        m.use_nodes = True
        p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        p.inputs['Base Color'].default_value = (0, 0, 0, 1)
        p.inputs['Emission Color'].default_value = _lin(color)
        p.inputs['Emission Strength'].default_value = 1.0
    curve.materials.append(m)
    return o


def plinth(scene, center, radius, color='#eef4f7', collection=None, depth=.04):
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=radius, radius2=radius, depth=depth)
    me = _tag(bpy.data.meshes.new('Plinth'))
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.get('Review plinth ' + color)
    if m is None:
        m = _tag(bpy.data.materials.new('Review plinth ' + color))
        m.use_nodes = True
        p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        p.inputs['Base Color'].default_value = _lin(color)
        p.inputs['Roughness'].default_value = .85
    me.materials.append(m)
    o = _tag(bpy.data.objects.new('Plinth', me))
    (collection or scene.collection).objects.link(o)
    o.location = Vector(center) - Vector((0, 0, depth / 2))
    return o


def lineup(scene, roots, gap=1.2, rows=1, collection=None, ground=None, names=None, az=26, el=40,
           res=(2400, 1100), label_size=None, ground_pad=4.0):
    """Place roots at true scale in rows (smallest in front), label, frame."""
    for r in roots:
        r.location = (0, 0, 0)
        r.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    items = []
    for r in roots:
        lo, hi = mesh_bounds([r])
        items.append((r, lo, hi))
    items.sort(key=lambda it: max(it[2].x - it[1].x, it[2].y - it[1].y, it[2].z - it[1].z))
    per_row = math.ceil(len(items) / rows)
    y = 0
    placed = []
    for ri in range(rows):
        row = items[ri * per_row:(ri + 1) * per_row]
        if not row:
            continue
        widths = [hi.x - lo.x for _, lo, hi in row]
        total = sum(widths) + gap * (len(row) - 1)
        x = -total / 2
        depth = max(hi.y - lo.y for _, lo, hi in row)
        for (r, lo, hi), w in zip(row, widths):
            base_z = -lo.z if lo.z < -.05 else 0
            r.location = (x - lo.x, y - depth / 2 - (lo.y + hi.y) / 2, base_z)
            placed.append((r, lo, hi))
            x += w + gap
        y -= depth + gap * 2.6
    bpy.context.view_layer.update()
    cam = aim(scene, roots, az, el, 1.12, res)
    size = label_size or cam.data.ortho_scale * .011
    up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    labels = []
    for (r, lo, hi) in placed:
        lo2, hi2 = mesh_bounds([r])
        c = Vector(((lo2.x + hi2.x) / 2, hi2.y + .3, 0))
        key = r.get('asset', r.name.split('.')[0])
        text = names.get(key, key) if names else key
        labels.append(label(scene, text, c - up * size * .9 + view_dir(az, el) * 25, size, cam,
                            collection=collection))
    if ground:
        lo, hi = mesh_bounds(roots)
        g = plinth(scene, ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0), 1, ground, collection, .02)
        g.scale = ((hi.x - lo.x) / 2 + ground_pad, (hi.y - lo.y) / 2 + ground_pad, 1)
        g.data.polygons.foreach_set('use_smooth', [False] * len(g.data.polygons))
    aim(scene, roots + labels, az, el, 1.05, res)
    return cam


def grid(scene, roots, cols=7, cell=4.0, names=None, az=30, el=36, res_cell=360, collection=None):
    """Normalise each root into a cell of the camera plane, on a plinth, labelled."""
    d = view_dir(az, el)
    q = d.to_track_quat('Z', 'Y')
    right, up = q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0))
    rows = math.ceil(len(roots) / cols)
    for i, r in enumerate(roots):
        r.location = (0, 0, 0)
        r.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    for i, r in enumerate(roots):
        lo, hi = mesh_bounds([r])
        ext = hi - lo
        # projected extent in the camera plane
        corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
        pw = max(c.dot(right) for c in corners) - min(c.dot(right) for c in corners)
        ph = max(c.dot(up) for c in corners) - min(c.dot(up) for c in corners)
        s = cell * .74 / max(pw, ph * 1.05, 1e-3)
        r.scale = (s, s, s)
        col, row = i % cols, i // cols
        cx = (col - (cols - 1) / 2) * cell
        cy = ((rows - 1) / 2 - row) * cell
        centre = right * cx + up * (cy + cell * .06)
        mid = (lo + hi) / 2 * s
        r.location = centre - mid
        base = Vector((r.location.x + mid.x, r.location.y + mid.y, r.location.z + lo.z * s))
        plinth(scene, base, min(max(ext.x, ext.y) * s * .56 + .12, cell * .42), '#b9ccd6', collection=collection)
        key = r.get('asset', r.name.split('.')[0])
        text = names.get(key, key) if names else key
        label(scene, text, right * cx + up * (cy - cell * .43) + d * 30, cell * .055, _cam_stub(q),
              collection=collection)
    cam = aim(scene, [], az, el, 1.0, (cols * res_cell, rows * res_cell), extra=[Vector()])
    cam.data.ortho_scale = cols * cell
    cam.location = d * 200
    return cam


class _cam_stub:
    def __init__(self, q):
        self.rotation_euler = q.to_euler()


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return path


# ---------------------------------------------------------------------- headless entry
def _import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    return roots[0] if len(roots) == 1 else roots


def _fresh_scene(name):
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    return scene


def _clear_objects():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves, bpy.data.lights,
                 bpy.data.cameras):
        for idb in list(coll):
            if idb.users == 0:
                coll.remove(idb)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default='public/models')
    ap.add_argument('--docs', default='docs')
    ap.add_argument('--only', default='')
    opts = ap.parse_args(argv)
    import catalog
    models = os.path.abspath(opts.models)
    docs = os.path.abspath(opts.docs)
    os.makedirs(docs, exist_ok=True)
    manifest = json.load(open(os.path.join(models, 'manifest.json'), encoding='utf-8'))
    stats = {a['name']: a for a in manifest['assets']}
    sheets = opts.only.split(',') if opts.only else ['all', 'city', 'river', 'valley']
    for sheet in sheets:
        _clear_objects()
        scene = _fresh_scene('Sheet ' + sheet)
        stage(scene)
        specs = catalog.SPECS if sheet == 'all' else [s for s in catalog.SPECS if sheet in s.chapters]
        roots, names = [], {}
        for s in specs:
            r = _import_glb(os.path.join(models, s.name + '.glb'))
            if isinstance(r, list):
                raise RuntimeError('unexpected roots in %s' % s.name)
            r['asset'] = s.name
            roots.append(r)
            st = stats.get(s.name, {})
            names[s.name] = ('%s\n%s tris  %d KB' % (s.name, st.get('triangles', '?'), st.get('bytes', 0) // 1024)
                             if sheet == 'all' else s.name)
        if sheet == 'all':
            grid(scene, roots, cols=7, names=names)
            out = os.path.join(docs, 'asset-sheet.png')
        else:
            ground = {'city': '#c9c3bb', 'river': '#6fd3dc', 'valley': '#9fd67a'}[sheet]
            lineup(scene, roots, gap=1.4, rows=max(1, math.ceil(len(roots) / 8)), ground=ground, names=names,
                   res=(2400, 1350))
            out = os.path.join(docs, 'asset-sheet-%s.png' % sheet)
        render(scene, out)
        print('TIDELOCK_SHEET', out)


if __name__ == '__main__':
    main()
