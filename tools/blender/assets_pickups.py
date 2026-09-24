"""Floating pickup cases (~1.45 x 1.3, ~1 tall) with a bold symbol on the lid.

Each case differs by colour AND silhouette of its top symbol so the four read
apart from above: repair = mint case + white plus, twin guns = sunflower case
+ star flanked by two barrels, guided missiles = sky case + two missiles,
medal = navy case + big gold medal. Origin at the waterline.
"""
import math

from assets_munitions import fins


def rounded_rect_path(w, d, r, z, steps=4):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180),
                       (w / 2 - r, -d / 2 + r, 270)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, z))
    pts.append(pts[0])
    return pts


def case(k, body, lid, trim='navy'):
    """Shared floating case: white float collar, rounded shell, lid, bumpers, latches."""
    k.sweep(rounded_rect_path(1.32, 1.18, .34, .16), .14, 'white', 10, cap=False)
    k.box((0, 0, .44), (1.16, 1.02, .56), body, .16, 3)
    k.box((0, 0, .77), (1.24, 1.1, .16), lid, .07, 2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * .57, sy * .49, .47), (.14, .14, .5), trim, .06, 2)
    for side in (-1, 1):
        k.box((side * .32, .53, .66), (.14, .07, .2), 'brass', .03, 1)
        k.box((side * .62, 0, .5), (.06, .36, .1), trim, .03, 1)
    return .85  # lid top


def pickup_health(k):
    top = case(k, 'mint', 'mint', 'navy')
    for size in ((.26, .82, .12), (.82, .26, .12)):
        k.box((0, 0, top + .06), size, 'white', .1, 3)
    # wrench on the front face
    k.box((.02, .525, .44), (.34, .03, .08), 'white', .02, 1, rot=(0, 35, 0))
    for dx, dz in ((-.14, .1), (.17, -.1)):
        k.cyl((.02 + dx, .525, .44 + dz), .07, .03, 'white', 'Y', 12)
        k.cyl((.02 + dx, .54, .44 + dz), .03, .03, 'mint', 'Y', 8)


def pickup_star(k):
    top = case(k, 'sun', 'sun', 'navy')
    k.star((0, -.02, top + .07), .44, .2, .12, 'white', 5, 'Z', .035, 2)
    for x in (-.44, .44):
        k.rod((x, -.34, top + .07), (x, .44, top + .07), .07, 'gunmetal', 10)
        k.cyl((x, .46, top + .07), .09, .08, 'navy', 'Y', 10, .02)
        k.box((x, -.3, top + .04), (.16, .16, .08), 'navy', .03, 1)


def pickup_gun(k):
    top = case(k, 'sky', 'sky', 'navy')
    for x in (-.24, .24):
        z = top + .12
        k.lathe([(0, -.44), (.08, -.42), (.11, -.34), (.11, .14), (.1, .22), (.07, .3), (.03, .36), (0, .38)],
                'white', (x, 0, z), 'Y', 12)
        k.lathe([(.113, -.02), (.116, 0), (.116, .07), (.113, .09)], 'navy', (x, 0, z), 'Y', 12)
        k.lathe([(0, .16), (.1, .18), (.08, .28), (.04, .34), (0, .38)], 'sun', (x, 0, z), 'Y', 12)
        for a in (0, 90, 180, 270):
            prof = [(-.42, .05), (-.24, .05), (-.3, .2), (-.44, .2)]
            k.prism(prof, .025, 'sun', loc=(x, 0, z), axis='X', bevel=.01, seg=1, rot=(0, a, 0))
        k.box((x, 0, top + .01), (.14, .5, .04), 'navy', .015, 1)


def pickup_medal(k):
    top = case(k, 'navy', 'navy', 'sky')
    # ribbon tails behind the medal
    for side in (-1, 1):
        k.box((side * .13, -.22, top + .03), (.2, .5, .05), 'sky' if side < 0 else 'white', .02, 1,
              rot=(0, 0, side * -14))
    k.cyl((0, .08, top + .09), .42, .1, 'gold', 'Z', 28, .04, 3)
    k.torus((0, .08, top + .14), .36, .03, 'brass', 'Z', 28, 5)
    k.star((0, .08, top + .16), .25, .11, .05, 'white', 5, 'Z', .015, 1)
