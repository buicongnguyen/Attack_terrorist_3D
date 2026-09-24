"""Missiles, bombs and the cluster bomblet. Nose points +Y, origin at the centre of mass.

Every munition is colour-coded so it reads as a coloured streak in flight:
friendly missile sky/white/sunflower, hostile missile charcoal/ember,
Drill orange nose + yellow fins, Scatter violet, Shockwave red with white
bands, Lance cyan with a glass seeker.
"""
import math


def fins(k, y, count, span, chord, thick, mat, radius=0.0, sweep=.0, rot0=45.0, parent=None, taper=.55):
    """Trapezoid fins around the Y axis; `span` measured from the axis."""
    for i in range(count):
        a = rot0 + i * 360 / count
        prof = [(y - chord / 2, radius), (y + chord / 2, radius), (y + chord / 2 - sweep - chord * (1 - taper) * .3,
                                                                  span), (y - chord / 2 - sweep, span)]
        # profile in (y, r) plane, extruded along the tangent direction, then rotated about Y
        k.prism([(p[0], p[1]) for p in prof], thick, mat, loc=(0, 0, 0), axis='X', bevel=min(thick * .4, .02),
                seg=1, rot=(0, a, 0), parent=parent)


def helix(k, y0, y1, r0, r1, turns, tube, mat, steps=40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * math.tau
        r = r0 + (r1 - r0) * t
        pts.append((math.cos(a) * r, y0 + (y1 - y0) * t, math.sin(a) * r))
    k.sweep(pts, tube, mat, 6)


# ------------------------------------------------------------------ missiles
def missile_friendly(k):
    k.lathe([(0, -.56), (.06, -.56), (.09, -.5), (.1, -.44), (.1, .2)], 'sky', axis='Y', verts=14)
    k.lathe([(.1, .2), (.098, .3), (.08, .4), (.05, .48), (.02, .53), (0, .55)], 'white', axis='Y', verts=14)
    k.lathe([(.103, .12), (.106, .14), (.106, .2), (.103, .22)], 'navy', axis='Y', verts=14)
    k.lathe([(.102, -.24), (.105, -.22), (.105, -.14), (.102, -.12)], 'sun', axis='Y', verts=14)
    fins(k, -.4, 4, .24, .22, .03, 'sun', .08, .04)
    fins(k, .08, 4, .15, .1, .025, 'white', .09, .01)
    k.lathe([(0, -.62), (.055, -.6), (.06, -.56), (0, -.55)], 'lamp', axis='Y', verts=10)


def missile_enemy(k):
    k.lathe([(0, -.56), (.07, -.56), (.1, -.5), (.115, -.42), (.115, .16)], 'charcoal', axis='Y', verts=14)
    k.lathe([(.115, .16), (.113, .28), (.1, .38), (.075, .46), (.04, .52), (0, .54)], 'ember', axis='Y', verts=14)
    k.lathe([(.118, .04), (.121, .06), (.121, .12), (.118, .14)], 'ash', axis='Y', verts=14)
    fins(k, -.38, 4, .27, .26, .035, 'ember', .09, .06, rot0=0)
    k.lathe([(0, -.62), (.06, -.6), (.066, -.56), (0, -.55)], 'ember_glow', axis='Y', verts=10)


# ------------------------------------------------------------------ bombs
def bomb_penetrator(k):
    """Drill: slim gunmetal body, bright orange threaded nose cone, yellow fins."""
    k.lathe([(0, -.7), (.07, -.7), (.1, -.6), (.14, -.42), (.14, .18)], 'gunmetal', axis='Y', verts=14)
    k.lathe([(.14, .18), (.13, .3), (.1, .45), (.06, .6), (.02, .68), (0, .71)], 'drill', axis='Y', verts=14)
    helix(k, .2, .66, .135, .03, 3.0, .022, 'charcoal', 54)
    k.lathe([(.143, .08), (.147, .1), (.147, .17), (.143, .19)], 'hazard', axis='Y', verts=14)
    k.lathe([(.143, -.36), (.147, -.34), (.147, -.28), (.143, -.26)], 'hazard', axis='Y', verts=14)
    fins(k, -.52, 4, .27, .26, .03, 'hazard', .09, .06)


def bomb_cluster(k):
    """Scatter: fat violet canister with plum seams, panels and fins."""
    k.lathe([(0, -.6), (.09, -.6), (.15, -.52), (.21, -.36), (.225, -.2), (.225, .3), (.2, .44), (.14, .54),
             (.06, .59), (0, .6)], 'violet', axis='Y', verts=16)
    for y in (-.18, .1, .36):
        k.lathe([(.222, y - .02), (.232, y - .01), (.232, y + .01), (.222, y + .02)], 'violet_dark', axis='Y',
                verts=16)
    for i in range(4):
        a = math.radians(45 + i * 90)
        k.box((math.cos(a) * .226, .08, math.sin(a) * .226), (.03, .5, .03), 'violet_dark', .01, 1,
              rot=(0, -math.degrees(a), 0))
    k.lathe([(.228, -.08), (.232, -.07), (.232, .0), (.228, .01)], 'white', axis='Y', verts=16)
    fins(k, -.48, 4, .32, .22, .035, 'violet_dark', .1, .05)
    k.torus((0, -.55, 0), .3, .025, 'violet_dark', 'Y', 16, 4)


def bomb_blast(k):
    """Shockwave: round red bomb with white bands and a stubby box-fin tail."""
    k.lathe([(0, -.48), (.1, -.47), (.16, -.4), (.22, -.28), (.27, -.1), (.28, .05), (.265, .2), (.22, .34),
             (.14, .45), (.06, .51), (0, .53)], 'blast', axis='Y', verts=18)
    for y in (-.02, .16):
        k.lathe([(.278, y - .03), (.285, y - .015), (.285, y + .015), (.278, y + .03)], 'white', axis='Y',
                verts=18)
    fins(k, -.45, 4, .26, .2, .04, 'blast', .1, .02, taper=.8)
    k.lathe([(.24, -.55), (.26, -.54), (.26, -.37), (.24, -.36), (.23, -.37), (.23, -.54), (.24, -.55)], 'white',
            axis='Y', verts=18, cap=(False, False))
    k.cyl((0, .45, 0), .07, .12, 'gunmetal', 'Y', 10, .02)


def bomb_guided(k):
    """Lance: cyan body, dark seeker glass nose, white canards and fins."""
    k.lathe([(0, -.7), (.07, -.7), (.11, -.6), (.15, -.44), (.15, .38)], 'lance', axis='Y', verts=14)
    k.lathe([(.15, .38), (.155, .41), (.155, .45), (.15, .47)], 'white', axis='Y', verts=14)
    k.lathe([(.15, .47), (.14, .55), (.11, .63), (.06, .69), (0, .71)], 'seeker', axis='Y', verts=14)
    k.lathe([(.152, -.2), (.156, -.18), (.156, -.1), (.152, -.08)], 'white', axis='Y', verts=14)
    fins(k, .26, 4, .25, .13, .025, 'white', .12, .02)
    fins(k, -.52, 4, .3, .26, .03, 'white', .1, .06)
    k.box((.05, .62, .09), (.05, .08, .02), 'white', .01, 1, rot=(-40, 0, 20))


def bomblet(k):
    """Scatter submunition: violet ball with a plum band and a tiny white tail fin."""
    k.sphere((0, 0, 0), (.11, .12, .11), 'violet', 12, 7)
    k.torus((0, 0, 0), .112, .014, 'violet_dark', 'Y', 14, 4)
    k.box((0, -.15, 0), (.02, .1, .14), 'white', .008, 1)
    k.box((0, -.15, 0), (.14, .1, .02), 'white', .008, 1)
