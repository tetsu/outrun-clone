"""Dress the rear of the decorated truck (art/models/traffic/deco-truck).

The generated model has richly decorated sides but a blank dark panel for rear doors and no
tail lamps, and the rear is the side the player sees. This adds, as separate objects:

  - a painting on the rear doors (drawn here: sunrise over the sea with a lighthouse on a cliff)
  - door lock rods and handles
  - a row of three round tail lamps on each side
  - a number plate (blank)

All positions are measured on this model after prep_car.py at a length of 6.0 m.

Usage:
  blender --background --factory-startup --python tools/blender/fix_deco_truck.py -- <in.blend> <out.blend>
"""
import math
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
in_blend, out_blend = argv[0], argv[1]

# The dark door panel: x from -PANEL_HALF_W to +PANEL_HALF_W, z from PANEL_BOTTOM to PANEL_TOP.
# Its surface is at y = 2.83 and the frame around it at y = 2.85.
PANEL_HALF_W = 0.82
PANEL_BOTTOM, PANEL_TOP = 1.635, 3.04
PANEL_Y = 2.838
LAMP_X, LAMP_Y, LAMP_Z = 0.915, 2.83, 0.847     # centre of each tail-lamp cluster
PLATE_Y, PLATE_Z = 2.972, 0.55

PAINT_W, PAINT_H = 1170, 1000    # pixels; the panel is 1.64 m x 1.405 m
SUPERSAMPLE = 2


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def over(base, colour, alpha):
    """Lay `colour` over `base` with coverage `alpha` (an array the size of the picture)."""
    return base * (1 - alpha[..., None]) + np.asarray(colour, np.float32) * alpha[..., None]


def paint_doors():
    """The picture on the doors as an (H, W, 4) float array, bottom row first. sRGB values."""
    w, h = PAINT_W * SUPERSAMPLE, PAINT_H * SUPERSAMPLE
    aspect = w / h
    v, u = np.meshgrid((np.arange(h) + 0.5) / h, (np.arange(w) + 0.5) / w, indexing="ij")
    x = u * aspect                     # same scale as v, so circles stay round
    px = 1.0 / h                       # one pixel, for soft edges
    horizon = 0.40

    # Sky: pale gold at the horizon through vermilion to indigo at the top.
    t = np.clip((v - horizon) / (1 - horizon), 0, 1)[..., None]
    gold, vermilion, indigo = np.array([1.0, 0.80, 0.35]), np.array([0.90, 0.28, 0.16]), np.array([0.10, 0.10, 0.36])
    img = np.where(t < 0.45, gold + (vermilion - gold) * (t / 0.45), vermilion + (indigo - vermilion) * ((t - 0.45) / 0.55))
    img = img.astype(np.float32)

    # Sun with alternating rays.
    sx, sy, sr = 0.40 * aspect, 0.56, 0.17
    dx, dy = x - sx, v - sy
    dist = np.hypot(dx, dy)
    rays = (np.floor((np.arctan2(dy, dx) + math.pi) / (math.pi / 14)) % 2).astype(np.float32)
    img = over(img, (1.0, 0.86, 0.45), rays * 0.38 * smooth(sr, sr + 0.02, dist) * (v > horizon))
    img = over(img, (0.93, 0.10, 0.08), 1 - smooth(sr - px, sr + px, dist))
    img = over(img, (1.0, 0.45, 0.20), (1 - smooth(0.0, sr * 0.9, dist)) * 0.55)

    # Bands of golden mist, as capsules.
    for cx, cy, half_len, r in ((0.16, 0.86, 0.13, 0.030), (0.30, 0.80, 0.10, 0.022), (0.72, 0.90, 0.16, 0.034),
                                (0.60, 0.74, 0.08, 0.020), (0.10, 0.66, 0.07, 0.018)):
        ddx = np.abs(x - cx * aspect) - half_len * aspect
        d = np.hypot(np.maximum(ddx, 0), v - cy)
        img = over(img, (0.98, 0.82, 0.38), (1 - smooth(r - px, r + px, d)) * 0.92)
        img = over(img, (1.0, 0.95, 0.70), (1 - smooth(r * 0.45 - px, r * 0.45 + px, np.hypot(np.maximum(ddx, 0), v - cy - r * 0.2))) * 0.6)

    # Cliff with a lighthouse on the right, and its beam.
    cliff_top = horizon + 0.17 * smooth(0.62, 0.80, u) + 0.012 * np.sin(u * 61) + 0.008 * np.sin(u * 23 + 1.0)
    tower_x, base_v, top_v = 0.82, horizon + 0.16, 0.80
    beam_angle = np.arctan2(v - (top_v + 0.025), (tower_x - u) * aspect)
    in_beam = (np.abs(beam_angle - 0.30) < 0.11) & (u < tower_x)
    img = over(img, (1.0, 0.97, 0.75), in_beam * 0.42 * smooth(0.0, 0.25, (tower_x - u)) * (1 - smooth(0.45, 0.80, tower_x - u)))
    img = over(img, (0.16, 0.12, 0.22), (1 - smooth(-px, px, v - cliff_top)) * (v > horizon - 0.01))
    half = 0.030 + (0.018 - 0.030) * np.clip((v - base_v) / (top_v - base_v), 0, 1)
    tower = (1 - smooth(half - px, half + px, np.abs(u - tower_x) * aspect)) * (v > base_v) * (v < top_v)
    shade = 0.78 + 0.22 * np.clip((tower_x - u) * aspect / 0.03 + 0.5, 0, 1)
    img = over(img, (1.0, 1.0, 1.0), tower)
    img = img * (1 - tower[..., None] * (1 - shade[..., None]))
    gallery = (np.abs(u - tower_x) * aspect < 0.030) & (v >= top_v) & (v < top_v + 0.012)
    lantern = (np.abs(u - tower_x) * aspect < 0.017) & (v >= top_v + 0.012) & (v < top_v + 0.042)
    roof = (np.abs(u - tower_x) * aspect < (top_v + 0.075 - v) * 0.62) & (v >= top_v + 0.042) & (v < top_v + 0.075)
    img = over(img, (0.12, 0.10, 0.16), gallery.astype(np.float32))
    img = over(img, (1.0, 0.93, 0.45), lantern.astype(np.float32))
    img = over(img, (0.75, 0.10, 0.10), roof.astype(np.float32))

    # Sea: rows of scalloped waves, far to near, each with a foam crest.
    img = over(img, (0.06, 0.20, 0.45), (v < horizon).astype(np.float32))
    img = over(img, (1.0, 0.70, 0.35), (1 - smooth(0.0, 0.10, np.abs(x - sx))) * (v < horizon) * 0.55 * smooth(horizon - 0.22, horizon, v))
    rows = 7
    blues = [(0.10, 0.30, 0.58), (0.05, 0.20, 0.46)]
    for k in range(rows):
        f = k / (rows - 1)
        crest = horizon - 0.03 - f * 0.30
        period = 0.11 + 0.10 * f
        amp = 0.030 + 0.045 * f
        phase = (k % 2) * 0.5 + k * 0.13
        curve = crest + amp * np.abs(np.sin(math.pi * (x / period + phase)))
        below = 1 - smooth(-px, px, v - curve)
        img = over(img, blues[k % 2], below)
        foam = below * (1 - smooth(0.006 + 0.010 * f - px, 0.006 + 0.010 * f + px, curve - v))
        img = over(img, (0.97, 0.98, 1.0), foam)
        curl = below * (1 - smooth(0.0, 0.012, np.abs((curve - v) - (0.018 + 0.022 * f)))) * 0.55
        img = over(img, (0.75, 0.88, 1.0), curl)

    # Gold border and the seam between the two doors.
    edge = np.minimum(np.minimum(x, aspect - x), np.minimum(v, 1 - v))
    img = over(img, (0.20, 0.12, 0.05), 1 - smooth(0.024 - px, 0.024 + px, edge))
    img = over(img, (0.95, 0.76, 0.28), 1 - smooth(0.018 - px, 0.018 + px, edge))
    img = over(img, (0.12, 0.08, 0.10), 1 - smooth(0.0025 - px, 0.0025 + px, np.abs(u - 0.5) * aspect))

    img = img.reshape(PAINT_H, SUPERSAMPLE, PAINT_W, SUPERSAMPLE, 3).mean(axis=(1, 3))
    return np.concatenate([np.clip(img, 0, 1), np.ones((PAINT_H, PAINT_W, 1), np.float32)], axis=2)


def material(name, colour, roughness, metallic=0.0, emission=0.0, image=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*colour, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    if image is not None:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def add(name, mat):
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


bpy.ops.wm.open_mainfile(filepath=in_blend)

pixels = paint_doors()
image = bpy.data.images.new("deco_truck_rear", PAINT_W, PAINT_H, alpha=True)
image.pixels.foreach_set(pixels.astype(np.float32).reshape(-1))
image.pack()

chrome = material("rear_chrome", (0.85, 0.85, 0.88), 0.18, metallic=1.0)
red_lamp = material("rear_lamp_red", (0.90, 0.02, 0.02), 0.25, emission=1.2)
amber_lamp = material("rear_lamp_amber", (1.0, 0.30, 0.0), 0.25, emission=1.2)
plate_green = material("rear_plate", (0.02, 0.20, 0.09), 0.5)

# The painting: a plane facing +Y (towards the camera behind the truck). After the turn about X
# its U runs along +X (the left of a viewer behind the truck) and its V runs down, so both are
# flipped to keep the picture the right way round.
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, PANEL_Y, (PANEL_BOTTOM + PANEL_TOP) / 2), rotation=(math.radians(-90), 0, 0))
painting = add("rear_painting", material("rear_painting", (1, 1, 1), 0.35, image=image))
painting.scale = (2 * PANEL_HALF_W, PANEL_TOP - PANEL_BOTTOM, 1)
for loop in painting.data.uv_layers.active.data:
    loop.uv = (1 - loop.uv.x, 1 - loop.uv.y)

# Lock rods and handles on both doors.
for x in (-0.13, 0.13):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=PANEL_TOP - PANEL_BOTTOM - 0.04, location=(x, PANEL_Y + 0.018, (PANEL_BOTTOM + PANEL_TOP) / 2))
    add("rear_lock_rod", chrome)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, PANEL_Y + 0.03, PANEL_BOTTOM + 0.30))
    add("rear_handle", chrome).scale = (0.05, 0.03, 0.16)

# Tail lamps: a chrome housing with three round lamps, red outside and amber inside.
for side in (-1, 1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(side * LAMP_X, LAMP_Y + 0.012, LAMP_Z))
    add("rear_lamp_housing", chrome).scale = (0.44, 0.03, 0.19)
    for i, mat in enumerate((amber_lamp, red_lamp, red_lamp)):
        x = side * (LAMP_X - 0.135 + i * 0.135)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=0.03, location=(x, LAMP_Y + 0.04, LAMP_Z), rotation=(math.radians(90), 0, 0))
        add("rear_lamp", mat)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.062, minor_radius=0.009, location=(x, LAMP_Y + 0.05, LAMP_Z), rotation=(math.radians(90), 0, 0))
        add("rear_lamp_ring", chrome)

# Number plate (left blank: lettering would not be readable at game size).
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, PLATE_Y, PLATE_Z))
add("rear_plate", plate_green).scale = (0.44, 0.012, 0.16)

for obj in bpy.context.scene.objects:
    if obj.name.startswith("rear_") and obj.type == "MESH" and obj.name != "rear_painting":
        for poly in obj.data.polygons:
            poly.use_smooth = obj.name.split(".")[0] in ("rear_lamp", "rear_lamp_ring", "rear_lock_rod")

bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
print("saved", out_blend)
