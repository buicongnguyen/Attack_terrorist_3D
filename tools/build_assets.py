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
    'medical': '#27cfa2', 'power': '#51c9ff', 'gold': '#f5b83e',
    'rubber': '#182d35', 'brass': '#b48d4e',
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
    if name in ('medical', 'power', 'coral'):
        bsdf.inputs['Emission Color'].default_value = mat.diffuse_color
        bsdf.inputs['Emission Strength'].default_value = .22
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
        mod.segments = 2
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return finish(obj, name, material, parent)


def sphere(name, loc, scale, material, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=loc)
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
    for side in (-1, 1):
        rod('Crew arm', (x + side * .17 * small, y, z + .36 * small),
            (x + side * .2 * small, y + .14 * small, z + .16 * small), .055 * small, 'hull')
        box('Crew boot', (x + side * .09 * small, y + .02 * small, z - .04 * small),
            (.1 * small, .17 * small, .17 * small), 'edge', .01)
    rod('Headset', (x - .17 * small, y, z + .53 * small),
        (x - .17 * small, y + .18 * small, z + .45 * small), .02 * small, 'edge')


def torus(name, loc, radius, thickness, material, parent=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=6,
                                     location=loc, major_radius=radius, minor_radius=thickness)
    return finish(bpy.context.object, name, material, parent)


def star(name, loc, radius, material, depth=.1, parent=None):
    points = [(math.sin(i * math.pi / 5) * (radius if i % 2 == 0 else radius * .43),
               math.cos(i * math.pi / 5) * (radius if i % 2 == 0 else radius * .43)) for i in range(10)]
    vertices = [(x, y, z) for z in (-depth / 2, depth / 2) for x, y in points]
    faces = [tuple(reversed(range(10))), tuple(range(10, 20))]
    faces.extend((i, (i + 1) % 10, (i + 1) % 10 + 10, i + 10) for i in range(10))
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return finish(obj, name, material, parent)


def cannon_barrel(parent, suffix):
    rod('Barrel ' + suffix, (0, .15, .08), (0, 1.24, .08), .075, 'edge', parent)
    rod('Barrel jacket ' + suffix, (0, .18, .08), (0, .58, .08), .115, 'steel', parent)
    rod('Muzzle brake ' + suffix, (0, 1.12, .08), (0, 1.32, .08), .1, 'dark', parent)
    empty('Muzzle' + suffix, (0, 1.35, .08), parent)


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
single = empty('SingleGun', (0, 0, 0), turret)
cannon_barrel(single, '')
for side, suffix in [(-1, 'L'), (1, 'R')]:
    twin = empty('TwinGun' + suffix, (side * .23, 0, .025), turret)
    cannon_barrel(twin, suffix)
rod('Antenna', (.35, -.9, 1.52), (.35, -.9, 2.25), .025, 'edge')
crew((-.54, -1.42, .58), .8)
for x in (-.67, -.35, 0, .35, .67):
    box('Deck seam', (x, -1.45, .626), (.018, .66, .012), 'steel', 0)
box('Stern hatch', (.38, -1.53, .65), (.55, .52, .065), 'hull', .03)
box('Hatch handle', (.38, -1.53, .71), (.22, .045, .06), 'steel', .015)
for side in (-1, 1):
    box('Hull rubbing strip', (side * 1.01, -.4, .25), (.075, 3.25, .13), 'rubber', .02)
    box('Navigation light', (side * .69, -.17, 1.48), (.12, .15, .1), 'medical' if side < 0 else 'coral', .035)
    cylinder('Stern bollard', (side * .73, -1.87, .7), .07, .18, 'steel')
    rod('Bollard head', (side * .73 - .13, -1.87, .76), (side * .73 + .13, -1.87, .76), .055, 'steel')
for y in (-.9, -.72, -.54, -.36):
    box('Cabin vent', (.645, y, .85), (.035, .065, .16), 'edge', .005)
torus('Lifebuoy', (.75, -1.1, .84), .23, .065, 'yellow')
radar = empty('Radar', (-.28, -.85, 1.65))
box('Radar scanner', (0, 0, .13), (.83, .16, .12), 'deck', .025, radar)
support = empty('SupportRack', (.64, -.7, .74))
for x in (-.13, .13):
    box('Support tube', (x, 0, 0), (.19, .65, .19), 'steel', .025, support)
    sphere('Loaded rocket', (x, .34, .025), (.085, .2, .085), 'power', support)

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
    box('Cabin door', (side * .96, -.35, -.05), (.08, .98, .8), 'hull', .08)
    box('Door window', (side * 1.01, -.28, .15), (.03, .59, .35), 'glass', .04)
    box('Door handle', (side * 1.04, -.63, -.11), (.07, .2, .04), 'steel', .01)
    for y in (-.85, -.65, -.45):
        box('Engine intake', (side * .57, y, .76), (.23, .11, .11), 'edge', .02)
    for dx in (-.1, .1):
        rod('Rocket tube', (side * 1.25 + dx, -.56, -.05),
            (side * 1.25 + dx, .55, -.05), .085, 'edge')
    sphere('Position light', (side * 1.48, -.2, .04), (.065,) * 3, 'medical' if side < 0 else 'coral')
sphere('Searchlight housing', (0, .91, -.68), (.24, .26, .19), 'edge')
sphere('Searchlight lens', (0, 1.04, -.73), (.18, .1, .12), 'yellow')
for x in (-.38, .38):
    rod('Engine exhaust', (x, -1.15, .55), (x, -1.69, .65), .14, 'steel')
    cylinder('Rotor fastener', (x * .3, -.12, 1.4), .04, .08, 'brass')

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
    for x in (2.7, 3.35):
        box('Wing service stripe', (side * x, .22, .249), (.07, 1.0, .018), 'hull', .005)
    box('Trailing flap', (side * 2.8, -.39, .13), (2.1, .13, .07), 'steel', .015)
    sphere('Wingtip light', (side * 4.39, .29, .2), (.085, .12, .07), 'medical' if side < 0 else 'coral')
    rod('Exhaust pipe', (side * 1.8, .2, -.12), (side * 1.8, -.05, -.2), .07, 'steel')
box('Aircraft dorsal panel', (0, -.8, .61), (.38, .95, .06), 'hull', .025)
rod('Aircraft antenna', (0, -.95, .64), (0, -.95, 1.13), .025, 'steel')

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
box('Backpack', (0, -.21, .85), (.32, .19, .35), 'green', .05)
box('Utility belt', (0, .02, .57), (.4, .29, .08), 'brass', .02)
for side in (-1, 1):
    box('Vest pouch', (side * .085, .218, .78), (.12, .05, .14), 'steel', .018)
    box('Shoulder armour', (side * .24, 0, .97), (.17, .23, .12), 'dark', .035)
rod('Headset boom', (-.18, .0, 1.16), (-.18, .19, 1.11), .018, 'edge')

start('cannon')
cylinder('Footing', (0, 0, .12), 1.05, .25, 'rock', 8)
box('Base', (0, 0, .4), (1.15, 1.2, .4), 'dark')
turret = empty('Turret', (0, 0, .92))
box('Armour', (0, 0, 0), (1.15, .9, .62), 'uniform', .12, turret)
rod('Barrel', (0, .15, .14), (0, 1.7, .32), .12, 'dark', turret)
box('Marking', (0, .466, -.05), (.44, .05, .18), 'coral', .01, turret)
for side in (-1, 1):
    rod('Recoil cylinder', (side * .29, .1, -.06), (side * .29, .94, .12), .065, 'steel', turret)
    box('Turret side panel', (side * .58, -.07, .03), (.08, .58, .35), 'dark', .025, turret)
for angle in range(0, 360, 60):
    a = math.radians(angle)
    cylinder('Anchor bolt', (math.cos(a) * .82, math.sin(a) * .82, .28), .07, .075, 'steel', 6)
rod('Cannon muzzle collar', (0, 1.5, .297), (0, 1.76, .327), .16, 'edge', turret)

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
for side in (-1, 1):
    for y in (-.65, -.35, -.05, .25):
        box('Bunker vent', (side * 1.415, y, .92), (.035, .12, .45), 'edge', .01)
    box('Door frame', (side * .47, 1.19, .67), (.12, .1, 1.24), 'deck', .015)
    cylinder('Roof fastening', (side * 1.28, -.95, 1.9), .065, .1, 'brass', 6)
box('Lintel', (0, 1.19, 1.34), (1.05, .1, .13), 'deck', .015)
box('Door inset', (0, 1.214, .8), (.46, .04, .23), 'steel', .025)
for x in (-1, -.5, 0, .5, 1):
    box('Caution stripe', (x, 1.36, .2), (.18, .045, .14), 'yellow', .005)

start('mine')
sphere('Mine body', (0, 0, 0), (.5, .5, .4), 'dark')
for i in range(8):
    a = i * math.tau / 8
    rod('Contact horn', (.36 * math.cos(a), .36 * math.sin(a), .08),
        (.69 * math.cos(a), .69 * math.sin(a), .2), .055, 'steel')
cylinder('Signal', (0, 0, .41), .12, .07, 'coral')
torus('Mine casing seam', (0, 0, .05), .48, .035, 'steel')
torus('Mine signal bezel', (0, 0, .405), .14, .025, 'brass')

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
    collar = torus('Rocket casing band', (0, .17, 0), .143, .02, 'steel')
    collar.rotation_euler.x = math.pi / 2
    for side in (-1, 1):
        box('Rocket identifier', (side * .145, .06, 0), (.012, .19, .07), 'white', .004)

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
box('Case handle', (0, 0, .79), (.32, .12, .1), 'edge', .02)
for x in (-.28, .28):
    box('Latch', (x, .402, .51), (.11, .06, .19), 'brass', .015)

# Gameplay supply cases have bold top AND upright emblems, independent of the HUD.
for kind, accent in [('health', 'medical'), ('star', 'yellow'), ('gun', 'power'), ('medal', 'gold')]:
    start('pickup-' + kind)
    box('Floating base', (0, 0, .08), (1.45, 1.3, .3), 'rubber', .14)
    box('Case shell', (0, 0, .39), (1.18, 1.03, .55), accent, .11)
    box('Case lid', (0, 0, .73), (1.27, 1.12, .15), 'edge', .05)
    for side in (-1, 1):
        box('Corner bumper', (side * .6, -.44, .47), (.14, .21, .49), 'steel', .04)
        box('Case latch', (side * .4, .54, .61), (.15, .09, .24), 'brass', .02)
    box('Carrying handle', (0, -.44, .87), (.5, .12, .14), 'steel', .035)
    if kind == 'health':
        box('Medical plus vertical', (0, 0, .83), (.25, .8, .075), 'white', .02)
        box('Medical plus horizontal', (0, 0, .83), (.8, .25, .075), 'white', .02)
        box('Front plus vertical', (0, .546, .4), (.13, .04, .34), 'white', .015)
        box('Front plus horizontal', (0, .546, .4), (.35, .04, .13), 'white', .015)
    elif kind == 'star':
        star('Twin weapon star', (0, 0, .85), .45, 'yellow')
        for x in (-.24, .24):
            rod('Spare gun tube', (x, -.24, .94), (x, .41, .94), .055, 'steel')
    elif kind == 'gun':
        for x in (-.26, .26):
            missile = cylinder('Supply rocket', (x, 0, .94), .11, .58, 'power')
            missile.rotation_euler.x = math.pi / 2
            tip = cylinder('Supply rocket tip', (x, .39, .94), .11, .2, 'white', radius_top=0)
            tip.rotation_euler.x = -math.pi / 2
            box('Supply rocket fins', (x, -.25, .94), (.3, .18, .035), 'deck', .01)
    else:
        cylinder('Medal disc', (0, 0, .88), .41, .1, 'gold', 24)
        star('Medal relief', (0, 0, .96), .27, 'white', .045)
        for side in (-1, 1):
            box('Medal ribbon', (side * .18, -.24, .83), (.19, .51, .06), 'coral', .01)

start('beacon')
cylinder('Beacon foot', (0, 0, .12), .75, .24, 'deck', 8)
cylinder('Beacon stem', (0, 0, 1.0), .12, 1.6, 'steel')
sphere('Beacon lens', (0, 0, 1.8), (.27, .27, .38), 'glass')
for side in (-1, 1):
    rod('Beacon arms', (0, 0, 1.6), (side * .7, 0, 2.2), .045, 'yellow')
torus('Beacon lens collar', (0, 0, 1.62), .23, .035, 'steel')
for a in (0, 2.1, 4.2):
    cylinder('Beacon anchor', (math.cos(a) * .55, math.sin(a) * .55, .28), .07, .08, 'brass', 6)

# Batch static detail per material and pivot to keep draw calls low. Animated empties stay intact.
for asset in assets:
    groups = {}
    for obj in list(asset.children_recursive):
        if obj.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        key = (obj.parent.name, obj.data.materials[0].name)
        groups.setdefault(key, []).append(obj)
    for (parent_name, material_name), meshes in groups.items():
        if len(meshes) < 2:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        bpy.context.object.name = parent_name + '_' + material_name

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
