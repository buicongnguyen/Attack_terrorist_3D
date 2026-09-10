"""Run: blender --background --python tools/build_assets.py -- --output public/models."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='public/models')
options = parser.parse_args(args)
out = Path(options.output).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

COLORS = {
    'hull': '#254952', 'edge': '#142e39', 'deck': '#e0e8da',
    'yellow': '#ffd15d', 'glass': '#58cbd2', 'steel': '#798c91',
    'coral': '#ed6853', 'dark': '#293939', 'uniform': '#87585b',
    'skin': '#ce9b76', 'green': '#49805a', 'leaf': '#80b474',
    'rock': '#b2b5a4', 'white': '#f5f2e2', 'crate': '#8c9d71',
}
mats = {}
for name, value in COLORS.items():
    mat = bpy.data.materials.new(name)
    srgb = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in srgb]
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = mat.diffuse_color
    bsdf.inputs['Roughness'].default_value = 0.38 if name in ('glass', 'steel') else 0.75
    bsdf.inputs['Metallic'].default_value = 0.25 if name in ('steel', 'hull') else 0.0
    mats[name] = mat

root = None
assets = []


def start(name):
    global root
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    assets.append(root)
    return root


def finish(obj, name, material, parent=None):
    obj.name = name
    obj.data.materials.append(mats[material])
    obj.parent = parent or root
    return obj


def box(name, loc, size, material, bevel=0.04, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Edge highlights', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return finish(obj, name, material, parent)


def sphere(name, loc, scale, material, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, name, material, parent)


def cylinder(name, loc, radius, depth, material, vertices=12, parent=None, radius_top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
                                    radius2=radius if radius_top is None else radius_top,
                                    depth=depth, location=loc)
    return finish(bpy.context.object, name, material, parent)


def rod(name, a, b, radius, material, parent=None):
    delta = Vector(b) - Vector(a)
    obj = cylinder(name, (Vector(a) + Vector(b)) / 2, radius, delta.length, material, 8, parent)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta)
    return obj


def empty(name, loc, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.parent = parent or root
    return obj


def crew(loc, small=1):
    x, y, z = loc
    box('Crew vest', (x, y, z + .22 * small), (.28 * small, .2 * small, .38 * small), 'yellow')
    sphere('Crew helmet', (x, y, z + .54 * small), (.15 * small,) * 3, 'white')
    box('Crew visor', (x, y + .115 * small, z + .54 * small), (.2 * small, .07 * small, .08 * small), 'edge', .01)


start('boat')
# Faceted bow and a waterline-keel silhouette.
sections = [(-2.35, .7), (-1.5, 1.05), (.9, 1.05), (2.4, .13)]
verts = []
for y, width in sections:
    verts.extend([(-width * .7, y, -.28), (width * .7, y, -.28),
                  (width, y, .48), (-width, y, .48)])
faces = [(0, 3, 2, 1), (12, 13, 14, 15)]
for i in range(3):
    for j in range(4):
        faces.append((i * 4 + j, i * 4 + (j + 1) % 4, (i + 1) * 4 + (j + 1) % 4, (i + 1) * 4 + j))
mesh = bpy.data.meshes.new('Patrol hull mesh')
mesh.from_pydata(verts, [], faces)
obj = bpy.data.objects.new('Patrol hull', mesh)
bpy.context.collection.objects.link(obj)
finish(obj, 'Patrol hull', 'hull')
box('Deck', (0, -.25, .53), (1.76, 3.6, .16), 'deck', .12)
box('Cabin', (0, -.65, 1.01), (1.25, 1.05, .83), 'hull', .12)
box('Roof', (0, -.65, 1.48), (1.4, 1.25, .16), 'yellow')
box('Windshield', (0, -.08, 1.17), (1.03, .04, .34), 'glass', .015)
for side in (-1, 1):
    box('Side glass', (side * .637, -.6, 1.15), (.025, .65, .32), 'glass', .01)
    for y in (-1.6, .0, 1.2):
        rod('Rail post', (side * .89, y, .57), (side * .89, y, .94), .025, 'white')
    rod('Rail', (side * .89, -1.75, .94), (side * .89, 1.35, .94), .027, 'white')
    sphere('Fender', (side * 1.04, -1.15, .42), (.13, .32, .21), 'edge')
cylinder('Turret base', (0, .92, .65), .48, .21, 'steel')
turret = empty('Turret', (0, .92, .9))
box('Turret housing', (0, 0, 0), (.66, .61, .42), 'hull', .08, turret)
rod('Barrel', (0, .22, .08), (0, 1.15, .08), .07, 'edge', turret)
rod('Antenna', (.35, -.9, 1.52), (.35, -.9, 2.25), .025, 'edge')
crew((-.54, -1.42, .58), .8)

start('helicopter')
sphere('Airframe', (0, 0, .0), (1.02, 1.62, .87), 'hull')
sphere('Canopy', (0, .84, .12), (.92, .93, .68), 'glass')
box('Canopy centre', (0, 1.15, .23), (.065, 1.2, 1.1), 'hull')
box('Roof stripe', (0, -.15, .77), (.55, 1.65, .15), 'yellow')
rod('Tail boom', (0, -1, .17), (0, -4.15, .68), .23, 'hull')
box('Tail fin', (0, -3.83, 1.01), (.13, .82, 1.1), 'yellow')
box('Tail wing', (0, -3.2, .6), (2.25, .47, .12), 'hull')
rotor = empty('Rotor', (0, -.12, 1.17))
cylinder('Rotor hub', (0, 0, 0), .18, .32, 'steel', parent=rotor)
for angle in (0, math.pi / 2):
    blade = box('Rotor blade', (0, 0, .13), (7.1, .19, .045), 'edge', .01, rotor)
    blade.rotation_euler.z = angle
tail_rotor = empty('TailRotor', (.2, -3.95, .75))
box('Tail blade', (0, 0, 0), (.07, 1.12, .12), 'white', .01, tail_rotor)
box('Tail cross', (0, 0, 0), (.07, .12, 1.12), 'white', .01, tail_rotor)
for side in (-1, 1):
    rod('Skid support', (side * .57, -.6, -.52), (side * 1.03, -.6, -1.15), .07, 'steel')
    rod('Skid support', (side * .57, .65, -.52), (side * 1.03, .65, -1.15), .07, 'steel')
    rod('Landing skid', (side * 1.03, -1.4, -1.15), (side * 1.03, 1.42, -1.15), .085, 'edge')
    box('Weapon pod', (side * 1.25, -.1, -.05), (.38, 1.1, .36), 'steel')

start('plane')
sphere('Fuselage', (0, 0, 0), (.65, 2.75, .61), 'yellow')
sphere('Cockpit', (0, 1.22, .42), (.51, .81, .42), 'glass')
box('Wing', (0, .22, .16), (8.8, 1.18, .16), 'deck', .09)
box('Tail wing', (0, -2.01, .2), (3.1, .65, .12), 'deck')
box('Tail fin', (0, -2.18, .56), (.13, .85, 1.01), 'hull')
for side in (-1, 1):
    sphere('Engine', (side * 1.8, .54, .16), (.34, .85, .34), 'hull')
    prop = empty('Propeller' + ('L' if side < 0 else 'R'), (side * 1.8, 1.4, .16))
    box('Propeller blade', (0, 0, 0), (1.55, .055, .12), 'edge', .02, prop)
    box('Wing tip', (side * 4.1, .22, .26), (.35, 1.1, .07), 'hull')

start('enemy')
box('Torso', (0, 0, .78), (.38, .26, .48), 'uniform')
box('Vest', (0, .155, .81), (.31, .085, .29), 'dark', .025)
sphere('Head', (0, 0, 1.17), (.175, .16, .18), 'skin')
sphere('Helmet', (0, -.005, 1.26), (.195, .19, .13), 'dark')
box('Visor', (0, .148, 1.2), (.23, .07, .075), 'coral', .015)
for side, suffix in ((-1, 'L'), (1, 'R')):
    arm = empty('Arm' + suffix, (side * .25, 0, .96))
    box('Sleeve', (0, 0, -.18), (.15, .18, .37), 'uniform', .03, arm)
    sphere('Glove', (0, 0, -.4), (.085,) * 3, 'dark', arm)
    leg = empty('Leg' + suffix, (side * .11, 0, .57))
    box('Trouser', (0, 0, -.23), (.16, .2, .46), 'dark', .025, leg)
    box('Boot', (0, .045, -.47), (.185, .3, .14), 'edge', .025, leg)
rod('Equipment', (.2, .21, .88), (.2, .47, .58), .045, 'edge')

start('cannon')
cylinder('Footing', (0, 0, .12), 1.05, .25, 'rock', 8)
box('Base', (0, 0, .4), (1.15, 1.2, .4), 'dark')
turret = empty('Turret', (0, 0, .92))
box('Armour', (0, 0, 0), (1.15, .9, .62), 'uniform', .12, turret)
rod('Barrel', (0, .15, .14), (0, 1.7, .32), .12, 'dark', turret)
box('Marking', (0, .466, -.05), (.44, .05, .18), 'coral', .01, turret)

start('launcher')
box('Foundation', (0, 0, .15), (3.2, 2.7, .3), 'rock')
box('Bunker', (0, 0, .91), (2.8, 2.3, 1.5), 'steel', .08)
box('Door', (0, 1.18, .65), (.74, .05, 1.15), 'edge')
box('Roof', (0, 0, 1.74), (3.05, 2.6, .25), 'deck')
for x in (-.65, 0, .65):
    tube = box('Launch tube', (x, 0, 2.18), (.45, 1.9, .46), 'dark')
    tube.rotation_euler.x = .25
    box('Tube cap', (x, .91, 2.4), (.31, .12, .3), 'coral')
rod('Mast', (1.15, -.7, 1.85), (1.15, -.7, 3.0), .035, 'dark')
sphere('Warning beacon', (1.15, -.7, 3.02), (.13,) * 3, 'coral')

start('mine')
sphere('Mine body', (0, 0, 0), (.5, .5, .4), 'dark')
for i in range(8):
    a = i * math.tau / 8
    rod('Contact horn', (.36 * math.cos(a), .36 * math.sin(a), .08),
        (.69 * math.cos(a), .69 * math.sin(a), .2), .055, 'steel')
cylinder('Signal', (0, 0, .41), .12, .07, 'coral')

for name, color in [('missile-friendly', 'glass'), ('missile-enemy', 'coral')]:
    start(name)
    body = cylinder('Body', (0, 0, 0), .14, .87, color)
    body.rotation_euler.x = math.pi / 2
    nose = cylinder('Nose', (0, .54, 0), .14, .24, 'white', radius_top=0)
    nose.rotation_euler.x = -math.pi / 2
    for angle in (0, math.pi / 2):
        fin = box('Fin', (0, -.32, 0), (.63, .3, .04), 'dark', .01)
        fin.rotation_euler.y = angle
    sphere('Exhaust', (0, -.5, 0), (.1, .25, .1), 'yellow')

start('palm')
rod('Trunk', (0, 0, 0), (.18, 0, 3.2), .14, 'rock')
for i in range(7):
    a = i * math.tau / 7
    x, y = math.cos(a), math.sin(a)
    mesh = bpy.data.meshes.new('Frond mesh')
    mesh.from_pydata([(.18, 0, 3.18), (.18 + x * 1.2 - y * .35, y * 1.2 + x * .35, 3.46),
                     (.18 + x * 2.5, y * 2.5, 2.75), (.18 + x * 1.2 + y * .35, y * 1.2 - x * .35, 3.46),
                     (.18 + x * 1.2, y * 1.2, 3.62)], [], [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)])
    obj = bpy.data.objects.new('Frond', mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, 'Frond', 'green' if i % 2 else 'leaf')

start('rock')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
obj = bpy.context.object
obj.scale = (1.35, 1.05, .87)
obj.location.z = .48
finish(obj, 'Faceted stone', 'rock')

start('supply')
box('Supply case', (0, 0, .38), (.85, .75, .7), 'crate', .06)
for x in (-.24, .24):
    box('Strap', (x, 0, .4), (.1, .79, .74), 'white', .01)
box('Case emblem', (0, .401, .44), (.16, .03, .2), 'yellow', .01)

start('beacon')
cylinder('Beacon foot', (0, 0, .12), .75, .24, 'deck', 8)
cylinder('Beacon stem', (0, 0, 1.0), .12, 1.6, 'steel')
sphere('Beacon lens', (0, 0, 1.8), (.27, .27, .38), 'glass')
for side in (-1, 1):
    rod('Beacon arms', (0, 0, 1.6), (side * .7, 0, 2.2), .045, 'yellow')

manifest = {'author': 'Original procedural assets authored for Tidelock', 'blender': bpy.app.version_string,
            'units': 'metres', 'forward': '-Z in glTF', 'assets': []}
for asset in assets:
    bpy.ops.object.select_all(action='DESELECT')
    objs = [asset, *asset.children_recursive]
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = asset
    bpy.ops.export_scene.gltf(filepath=str(out / (asset.name + '.glb')), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False,
                              export_cameras=False, export_lights=False)
    manifest['assets'].append({'name': asset.name, 'file': asset.name + '.glb',
                               'meshes': sum(o.type == 'MESH' for o in objs),
                               'bytes': (out / (asset.name + '.glb')).stat().st_size})

# The source library opens as an arranged asset sheet; GLBs retain their local origins.
for i, asset in enumerate(assets):
    asset.location = ((i % 4) * 10, (i // 4) * 10, 0)
bpy.context.scene.world.color = (.2, .2, .2)
source = out.parent.parent / 'art'
source.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source / 'tidelock-assets.blend'))
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('TIDELOCK_ASSETS_READY', len(assets), sum(item['bytes'] for item in manifest['assets']))
