"""Build every Tidelock model from code, export GLBs, verify runtime contracts.

Run from the repository root with Blender 4.5:
  blender --background --factory-startup --python tools/blender/build_assets.py -- --output public/models

Options (after --):
  --output DIR     GLB directory (default public/models); manifest.json is written there
  --blend PATH     editable source library (default art/tidelock-assets.blend, compressed)
  --only a,b       rebuild only these assets (merges into the existing manifest, skips the .blend)
  --no-blend       do not save the source library

Every asset is described in catalog.py (builder, budget class, required empties
and material names). After each export the GLB itself is parsed and checked:
required nodes exist exactly once as empties with identity rotation under the
required parent, required materials exist, triangles fit the budget. The
process exits with code 1 if any check fails.
"""
import argparse
import json
import os
import sys
import time

import bpy

sys.dont_write_bytecode = True  # keep tools/blender free of __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import catalog  # noqa: E402
import style  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', default='public/models')
    ap.add_argument('--blend', default='art/tidelock-assets.blend')
    ap.add_argument('--only', default='')
    ap.add_argument('--no-blend', action='store_true')
    return ap.parse_args(argv)


def reset_scene():
    """Factory-startup scenes contain a cube, camera and light: remove everything."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for idb in list(coll):
            if idb.users == 0:
                coll.remove(idb)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    scene = bpy.context.scene
    scene.name = 'Tidelock assets'
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.view_settings.view_transform = 'Standard'
    return scene


def verify(spec, info):
    errors = []
    nodes = info['nodes']
    parent_of = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent_of[c] = i
    by_name = {}
    for i, n in enumerate(nodes):
        by_name.setdefault(n.get('name', ''), []).append(i)
    roots = by_name.get(spec.name, [])
    if len(roots) != 1 or roots[0] in parent_of:
        errors.append('root node "%s" missing or not unique' % spec.name)
    for name, parent in spec.nodes.items():
        idx = by_name.get(name, [])
        if len(idx) != 1:
            errors.append('node %s found %d times' % (name, len(idx)))
            continue
        n = nodes[idx[0]]
        if 'mesh' in n:
            errors.append('node %s must be an empty' % name)
        rot = n.get('rotation', [0, 0, 0, 1])
        if any(abs(a - b) > 1e-5 for a, b in zip(rot, [0, 0, 0, 1])):
            errors.append('node %s has non-identity rotation %s' % (name, rot))
        if any(abs(s - 1) > 1e-5 for s in n.get('scale', [1, 1, 1])):
            errors.append('node %s has non-unit scale' % name)
        if parent is not None:
            p = parent_of.get(idx[0])
            if p is None or nodes[p].get('name') != parent:
                errors.append('node %s must be a child of %s' % (name, parent))
        if not n.get('children'):
            if name not in ('Muzzle', 'MuzzleL', 'MuzzleR', 'HeliMuzzle', 'PylonL', 'PylonR', 'PylonC'):
                errors.append('node %s has no meshes beneath it' % name)
    for m in spec.materials:
        if m not in info['materials']:
            errors.append('material "%s" missing' % m)
    budget = catalog.BUDGET[spec.kind]
    if info['triangles'] > budget:
        errors.append('%d triangles over the %s budget %d' % (info['triangles'], spec.kind, budget))
    if info['images'] > 1:
        errors.append('%d images (only the shared ramp is allowed)' % info['images'])
    return errors


def gltf_bounds(root):
    """Axis-aligned bounds in runtime glTF axes (x, y up, z = -Blender y), metres."""
    bpy.context.view_layer.update()
    pts = [m.matrix_world @ v.co for m in root.children_recursive if m.type == 'MESH' for v in m.data.vertices]
    lo = [min(p.x for p in pts), min(p.z for p in pts), min(-p.y for p in pts)]
    hi = [max(p.x for p in pts), max(p.z for p in pts), max(-p.y for p in pts)]
    return {'min': [round(v, 3) for v in lo], 'max': [round(v, 3) for v in hi]}


def arrange(roots):
    """Lay the library out in rows by kind so the .blend opens as a readable sheet."""
    x, y, row_h, row_kind = 0.0, 0.0, 0.0, None
    bpy.context.view_layer.update()
    for spec, root in roots:
        if row_kind is not None and spec.kind != row_kind:
            x, y, row_h = 0.0, y - row_h - 4.0, 0.0
        row_kind = spec.kind
        pts = [m.matrix_world @ v.co for m in root.children_recursive if m.type == 'MESH' for v in m.data.vertices]
        xs = [p.x for p in pts]
        ys = [p.y for p in pts]
        w = max(xs) - min(xs)
        d = max(ys) - min(ys)
        root.location = (x - min(xs), y - max(ys), 0)
        x += w + 2.0
        row_h = max(row_h, d)
        if x > 60:
            x, y, row_h = 0.0, y - row_h - 3.0, 0.0


def main():
    opts = parse_args()
    t0 = time.time()
    out = os.path.abspath(opts.output)
    os.makedirs(out, exist_ok=True)
    only = [s for s in opts.only.split(',') if s]
    specs = [catalog.BY_NAME[n] for n in only] if only else catalog.SPECS
    scene = reset_scene()
    kit = style.Kit(scene.collection)
    built, entries, failures = [], [], {}
    for spec in specs:
        coll = bpy.data.collections.new(spec.name)
        scene.collection.children.link(coll)
        kit.collection = coll
        kit.begin(spec.name)
        spec.build(kit)
        stats = kit.finish()
        bounds = gltf_bounds(stats['root'])
        path = os.path.join(out, spec.name + '.glb')
        style.export_glb(stats['root'], path)
        info = style.glb_info(path)
        errors = verify(spec, info)
        if errors:
            failures[spec.name] = errors
        built.append((spec, stats['root']))
        entries.append({
            'name': spec.name, 'file': spec.name + '.glb', 'kind': spec.kind,
            'chapters': list(spec.chapters), 'meshes': info['meshes'], 'triangles': info['triangles'],
            'bytes': info['bytes'], 'nodes': list(spec.nodes), 'materials': list(spec.materials),
            'boundsGltf': bounds,
        })
        print('TIDELOCK_ASSET %-18s nodes=%-3s tris=%-5d meshes=%-3d bytes=%-7d %s' % (
            spec.name, 'ok' if not errors else 'ERR', info['triangles'], info['meshes'], info['bytes'],
            '; '.join(errors)))

    manifest_path = os.path.join(out, 'manifest.json')
    if only and os.path.exists(manifest_path):
        old = json.load(open(manifest_path, encoding='utf-8'))
        merged = {a['name']: a for a in old.get('assets', [])}
        for e in entries:
            merged[e['name']] = e
        entries = [merged[s.name] for s in catalog.SPECS if s.name in merged]
    total = sum(e['bytes'] for e in entries)
    manifest = {
        'author': 'Original procedural assets authored for Tidelock',
        'generator': 'tools/blender/build_assets.py',
        'blender': bpy.app.version_string,
        'units': 'metres',
        'up': '+Y in glTF (Blender +Z)',
        'forward': '-Z in glTF (Blender +Y)',
        'totalBytes': total,
        'assets': entries,
    }
    with open(manifest_path, 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    if total > catalog.TOTAL_BYTES_LIMIT:
        failures['<total>'] = ['total %d bytes over %d' % (total, catalog.TOTAL_BYTES_LIMIT)]

    if not only and not opts.no_blend:
        arrange(built)
        blend = os.path.abspath(opts.blend)
        os.makedirs(os.path.dirname(blend), exist_ok=True)
        bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup next to the library
        bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True, check_existing=False)
        print('TIDELOCK_BLEND', blend)
    print('TIDELOCK_ASSETS_READY count=%d total_bytes=%d seconds=%.1f' % (len(entries), total, time.time() - t0))
    if failures:
        for name, errs in failures.items():
            print('TIDELOCK_CONTRACT_FAIL', name, '; '.join(errs))
        sys.exit(1)


if __name__ == '__main__':
    main()
