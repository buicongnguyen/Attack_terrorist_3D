"""Characters: Ashen Front fighter, Echo recon rescuer, and reusable crew figures.

Toy-soldier proportions: the head and helmet take ~32% of the height so the
faction reads from the helmet alone at ~40 px. Figures face Blender +Y and the
character's right hand side is +X.
Hostile = charcoal + ember visor/band/crest; friendly = sky/mint + white helmet.
"""
from mathutils import Vector


class Frame:
    """Maps figure-local coordinates (feet at origin, facing +Y) into asset space."""

    def __init__(self, base=(0, 0, 0), s=1.0):
        self.base = Vector(base)
        self.s = s

    def p(self, x, y, z):
        return tuple(self.base + Vector((x, y, z)) * self.s)

    def v(self, *xyz):
        return tuple(c * self.s for c in xyz)

    def d(self, value):
        return value * self.s


HOSTILE_HELMET = [(0, 1.39), (.13, 1.385), (.22, 1.34), (.265, 1.26), (.275, 1.2), (.29, 1.18), (.25, 1.165),
                  (0, 1.165)]
HOSTILE_CREST = [(-.17, 1.3), (.12, 1.3), (.2, 1.34), (.07, 1.46), (-.14, 1.46), (-.22, 1.37)]
FRIENDLY_HELMET = [(0, 1.45), (.14, 1.44), (.225, 1.395), (.258, 1.32), (.265, 1.26), (.285, 1.235),
                   (.25, 1.22), (0, 1.22)]


def hostile_head(k, f, accent, parent=None, verts=16):
    P, V, D = f.p, f.v, f.d
    k.cyl(P(0, 0, 1.0), D(.16), D(.09), 'webbing', 'Z', 12, D(.035), parent=parent)
    k.sphere(P(0, .005, 1.14), V(.2, .19, .19), 'skin_deep', 12, 6, parent=parent)
    k.lathe(HOSTILE_HELMET, 'charcoal', loc=P(0, 0, 0), verts=verts, scale=(f.s, f.s * 1.06, f.s),
            parent=parent)
    k.torus(P(0, 0, 1.235), D(.27), D(.035), accent, 'Z', 16, 5, scale=(1, 1.06, 1), parent=parent)
    k.box(P(0, .165, 1.11), V(.3, .1, .09), accent, D(.04), 2, taper=(1.08, 1), parent=parent)
    k.prism([(f.base.y + y * f.s, f.base.z + z * f.s) for y, z in HOSTILE_CREST], D(.075), accent,
            loc=(f.base.x, 0, 0), bevel=D(.025), parent=parent)


def hostile_torso(k, f, parent=None):
    P, V, D = f.p, f.v, f.d
    k.box(P(0, 0, .56), V(.44, .28, .16), 'charcoal', D(.07), 2, parent=parent)
    k.tbox(P(0, 0, .77), (D(.56), D(.32)), (D(.46), D(.28)), D(.42), 'charcoal', D(.1), 2, parent=parent)
    k.tbox(P(0, .02, .77), (D(.54), D(.37)), (D(.5), D(.35)), D(.3), 'webbing', D(.08), 2, parent=parent)
    k.box(P(0, 0, .565), V(.47, .31, .07), 'webbing', D(.03), 1, parent=parent)
    k.box(P(0, .16, .565), V(.1, .04, .07), 'charcoal', D(.02), 1, parent=parent)
    for x in (-.14, 0, .14):
        k.box(P(x, .21, .7), V(.11, .07, .13), 'webbing', D(.035), 1, parent=parent)
    k.box(P(0, -.23, .8), V(.36, .16, .34), 'char_light', D(.07), 2, parent=parent)
    k.box(P(0, -.31, .66), V(.3, .08, .09), 'charcoal', D(.035), 1, parent=parent)


def enemy(k):
    """Ashen Front fighter, 1.45 tall, rifle held at the hip (rides on ArmR)."""
    f = Frame()
    P, V, D = f.p, f.v, f.d
    arm_l = k.joint('ArmL', (-.33, 0, .9))
    arm_r = k.joint('ArmR', (.33, 0, .9))
    leg_l = k.joint('LegL', (-.125, 0, .56))
    leg_r = k.joint('LegR', (.125, 0, .56))
    for side, par in ((-1, leg_l), (1, leg_r)):
        x = side * .125
        k.capsule(P(x, 0, .56), P(x, .01, .2), D(.14), D(.125), 'charcoal', 8, 2, parent=par)
        k.box(P(x, .05, .09), V(.23, .36, .19), 'rubber', D(.075), 2, parent=par)
        k.box(P(x, .1, .33), V(.15, .08, .12), 'webbing', D(.04), 1, parent=par)
        k.box(P(x * 2.08, 0, .43), V(.06, .15, .14), 'webbing', D(.025), 1, parent=par)
    hostile_torso(k, f)
    hostile_head(k, f, 'accent')
    for side, par in ((-1, arm_l), (1, arm_r)):
        sx = side * .33
        k.sphere(P(sx, 0, .91), V(.13, .14, .12), 'charcoal', 10, 5, parent=par)
        elbow = (side * .36, .08, .7)
        hand = (.15, .34, .66) if side > 0 else (-.1, .46, .72)
        k.capsule(P(sx, 0, .88), P(*elbow), D(.1), D(.09), 'charcoal', 8, 2, parent=par)
        k.capsule(P(*elbow), P(*hand), D(.09), D(.08), 'charcoal', 8, 2, parent=par)
        k.torus(P(side * .345, .03, .8), D(.09), D(.032), 'accent', 'Z', 12, 5, rot=(12, side * -8, 0),
                parent=par)
        k.sphere(P(*hand), D(.08), 'rubber', 8, 5, parent=par)
    # rifle rides on the right arm
    x, z = .09, .7
    k.box(P(x, .38, z), V(.09, .5, .13), 'gunmetal', D(.035), 1, parent=arm_r)
    k.box(P(x, .07, z - .02), V(.08, .22, .14), 'wood', D(.03), 1, taper=(1, .8), parent=arm_r)
    k.box(P(x, .38, z - .12), V(.07, .1, .16), 'rubber', D(.025), 1, rot=(-18, 0, 0), parent=arm_r)
    k.rod(P(x, .6, z + .02), P(x, .88, z + .02), D(.038), 'gunmetal', 8, parent=arm_r)
    k.cyl(P(x, .88, z + .02), D(.055), D(.08), 'gunmetal', 'Y', 8, parent=arm_r)


def hostile_gunner(k, base, s=.9, parent=None):
    """Upper-body gunner for skiffs and technicals: hands forward on the gun grips."""
    f = Frame(base, s)
    P, V, D = f.p, f.v, f.d
    for side in (-1, 1):
        x = side * .125
        k.capsule(P(x, 0, .56), P(x, .01, .18), D(.125), D(.11), 'charcoal', 8, 2, parent=parent)
        k.box(P(x, .05, .09), V(.22, .35, .18), 'rubber', D(.075), 2, parent=parent)
    hostile_torso(k, f, parent)
    hostile_head(k, f, 'ember', parent, 14)
    for side in (-1, 1):
        k.sphere(P(side * .33, 0, .91), V(.13, .14, .12), 'charcoal', 10, 5, parent=parent)
        k.capsule(P(side * .33, 0, .88), P(side * .26, .32, .8), D(.09), D(.075), 'charcoal', 8, 2, parent=parent)
        k.sphere(P(side * .2, .42, .8), D(.08), 'rubber', 8, 5, parent=parent)
        k.torus(P(side * .33, .06, .86), D(.09), D(.032), 'ember', 'Z', 10, 5, rot=(62, 0, 0), parent=parent)


def friendly_body(k, f, parent=None, vest='mint', suit='sky', helmet='white', trim='sky', radio=True):
    """Kestrel/Echo rescuer body without arms: open face, white helmet, bright vest."""
    P, V, D = f.p, f.v, f.d
    for side in (-1, 1):
        x = side * .125
        k.capsule(P(x, 0, .56), P(x, .01, .18), D(.125), D(.11), 'navy', 8, 2, parent=parent)
        k.box(P(x, .05, .09), V(.22, .35, .18), 'rubber', D(.075), 2, parent=parent)
        k.box(P(x, .03, .19), V(.21, .24, .045), 'sun', D(.02), 1, parent=parent)
    k.box(P(0, 0, .56), V(.44, .28, .16), 'navy', D(.07), 2, parent=parent)
    k.tbox(P(0, 0, .77), (D(.54), D(.32)), (D(.46), D(.28)), D(.42), suit, D(.1), 2, parent=parent)
    k.tbox(P(0, .005, .78), (D(.55), D(.37)), (D(.5), D(.345)), D(.38), vest, D(.09), 2, parent=parent)
    for z in (.7, .84):
        k.tbox(P(0, .005, z), (D(.545), D(.375)), (D(.54), D(.37)), D(.045), 'white', D(.02), 1, parent=parent)
    k.box(P(0, 0, .565), V(.47, .31, .06), 'sun', D(.025), 1, parent=parent)
    # head: open face with eyes, helmet with a coloured brim and goggles
    k.cyl(P(0, 0, 1.0), D(.12), D(.08), 'skin', 'Z', 10, parent=parent)
    k.sphere(P(0, .01, 1.14), V(.2, .19, .2), 'skin', 12, 6, parent=parent)
    k.sphere(P(0, .2, 1.1), V(.045, .035, .04), 'skin_deep', 8, 4, parent=parent)
    for side in (-1, 1):
        k.sphere(P(side * .075, .18, 1.16), V(.028, .02, .042), 'navy', 6, 4, parent=parent)
    k.lathe(FRIENDLY_HELMET, helmet, loc=P(0, 0, 0), verts=16, scale=(f.s, f.s * 1.05, f.s), parent=parent)
    k.torus(P(0, 0, 1.232), D(.27), D(.028), trim, 'Z', 16, 5, scale=(1, 1.05, 1), parent=parent)
    k.box(P(0, .235, 1.31), V(.3, .06, .075), 'navy', D(.03), 1, rot=(-20, 0, 0), parent=parent)
    for side in (-1, 1):
        k.box(P(side * .07, .258, 1.315), V(.1, .03, .05), 'glass', D(.015), 1, rot=(-20, 0, 0), parent=parent)
    if radio:
        k.box(P(0, -.25, .82), V(.36, .17, .4), 'navy', D(.07), 2, parent=parent)
        k.box(P(-.1, -.345, .9), V(.1, .04, .1), 'sun', D(.02), 1, parent=parent)
        k.rod(P(.12, -.28, .98), P(.15, -.3, 1.75), D(.024), 'gunmetal', 6, parent=parent)
        k.sphere(P(.15, -.3, 1.78), D(.06), 'sun', 8, 5, parent=parent)


def rescue_soldier(k):
    """Echo recon team member waving an orange signal panel (right arm on WaveArm)."""
    f = Frame()
    P, V, D = f.p, f.v, f.d
    wave = k.joint('WaveArm', (.33, 0, .9))
    friendly_body(k, f)
    # left arm relaxed, radio handset at the chest
    k.sphere(P(-.33, 0, .91), V(.13, .14, .12), 'sky', 10, 5)
    k.capsule(P(-.33, 0, .88), P(-.37, .05, .68), D(.09), D(.08), 'sky', 8, 2)
    k.capsule(P(-.37, .05, .68), P(-.2, .2, .62), D(.08), D(.07), 'sky', 8, 2)
    k.sphere(P(-.19, .22, .63), D(.075), 'skin', 8, 5)
    k.box(P(-.18, .25, .7), V(.08, .07, .15), 'rubber', .025, 1)
    # raised right arm on the WaveArm pivot, signal panel in hand
    k.sphere(P(.33, 0, .91), V(.13, .14, .12), 'sky', 10, 5, parent=wave)
    k.capsule(P(.34, 0, .94), P(.53, .02, 1.16), D(.09), D(.08), 'sky', 8, 2, parent=wave)
    k.capsule(P(.53, .02, 1.16), P(.59, .03, 1.42), D(.08), D(.07), 'sky', 8, 2, parent=wave)
    k.torus(P(.45, .01, 1.06), D(.088), D(.03), 'white', 'Z', 12, 5, rot=(0, 42, 0), parent=wave)
    k.sphere(P(.595, .03, 1.47), D(.08), 'skin', 8, 5, parent=wave)
    k.rod(P(.595, .03, 1.45), P(.61, .03, 1.6), D(.028), 'gunmetal', 6, parent=wave)
    k.box(P(.61, .03, 1.76), V(.4, .06, .3), 'orange', .035, 2, parent=wave)
    k.box(P(.61, .065, 1.76), V(.3, .02, .08), 'white', .01, 1, parent=wave)


def crew(k, base, s=.72, parent=None, vest='sun', suit='sky', helmet='white'):
    """Small friendly crew member (boat helm, barge deck), hands forward."""
    f = Frame(base, s)
    friendly_body(k, f, parent, vest=vest, suit=suit, helmet=helmet, trim='sky', radio=False)
    P, D = f.p, f.d
    for side in (-1, 1):
        k.sphere(P(side * .33, 0, .91), f.v(.13, .14, .12), suit, 8, 5, parent=parent)
        k.capsule(P(side * .33, 0, .88), P(side * .24, .32, .78), D(.09), D(.075), suit, 8, 2, parent=parent)
        k.sphere(P(side * .21, .38, .78), D(.075), 'skin', 8, 5, parent=parent)
