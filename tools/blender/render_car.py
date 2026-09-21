"""Render the player car's sprite sheet from a prepared .blend.

The Blender camera reproduces the game camera exactly (same height, distance behind the
car and vertical field of view, looking level), so a frame drawn at its reference position
lines up with the road without any per-frame fiddling. Camera shift crops the frame to the
part of the view that holds the car.

Frames: every steering yaw x every road pitch. Frame index = pitch_index * len(YAWS) + yaw_index.
Positive yaw turns the nose to the right of the screen; positive pitch lifts the nose (uphill).

Usage:
  blender --background --factory-startup --python tools/blender/render_car.py -- <in.blend> <out_dir>
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
in_blend, out_dir = argv[0], argv[1]
os.makedirs(out_dir, exist_ok=True)

# Must match src/game/camera.ts.
CAMERA_HEIGHT = 2.0       # metres above the road
CAMERA_DISTANCE = 6.5     # metres behind the car's centre
VFOV_DEG = 60.0
REFERENCE_SCREEN_HEIGHT = 1440   # a frame is 1:1 on a screen this many pixels tall

FRAME_W, FRAME_H = 1024, 576
FRAME_TOP = 60            # frame's top edge, in pixels below the view's principal point
YAWS = [-20, -15, -10, -5, 0, 5, 10, 15, 20]
PITCHES = [-6, 0, 6]
COLUMNS = 5

bpy.ops.wm.open_mainfile(filepath=in_blend)
scene = bpy.context.scene
# The car and everything riding in it (seated characters and their rigs) turn together.
riders = [o for o in scene.objects if o.parent is None and o.type in ("MESH", "ARMATURE")]

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = FRAME_W
scene.render.resolution_y = FRAME_H
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"

world = bpy.data.worlds.new("sprite_world")
if world.node_tree is None:
    world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.62, 0.74, 0.95, 1)
bg.inputs[1].default_value = 1.1
scene.world = world

sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 3.2
sun_data.angle = math.radians(3)
sun = bpy.data.objects.new("sun", sun_data)
# Light from high up, behind the camera and a little to the left, so the rear of the car is lit.
sun.rotation_euler = (-Vector((0.35, 0.55, 1.0))).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(sun)

# pitch (about the world's X axis) wraps yaw (about Z); both pivot on the road under the car's centre
pitch_root = bpy.data.objects.new("pitch_root", None)
yaw_root = bpy.data.objects.new("yaw_root", None)
scene.collection.objects.link(pitch_root)
scene.collection.objects.link(yaw_root)
yaw_root.parent = pitch_root
for obj in riders:
    obj.parent = yaw_root

focal_px = (REFERENCE_SCREEN_HEIGHT / 2) / math.tan(math.radians(VFOV_DEG) / 2)
cam_data = bpy.data.cameras.new("cam")
cam_data.sensor_fit = "HORIZONTAL"
cam_data.sensor_width = 36.0
cam_data.lens = focal_px * 36.0 / FRAME_W
cam_data.shift_x = 0.0
cam_data.shift_y = -(FRAME_TOP + FRAME_H / 2) / FRAME_W
cam_data.clip_start = 0.1
cam = bpy.data.objects.new("cam", cam_data)
cam.location = (0.0, CAMERA_DISTANCE, CAMERA_HEIGHT)
cam.rotation_euler = (math.radians(90), 0.0, math.radians(180))   # level, looking along -Y
scene.collection.objects.link(cam)
scene.camera = cam

frame_paths = []
for pitch in PITCHES:
    for yaw in YAWS:
        # The car faces -Y and the camera sits on +Y: nose-right is a negative turn about Z,
        # nose-up is a negative turn about X.
        yaw_root.rotation_euler = (0.0, 0.0, math.radians(-yaw))
        pitch_root.rotation_euler = (math.radians(-pitch), 0.0, 0.0)
        path = os.path.join(out_dir, "frames", f"p{pitch:+d}_y{yaw:+d}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        frame_paths.append(path)
        print("rendered", os.path.basename(path), flush=True)

rows = math.ceil(len(frame_paths) / COLUMNS)
sheet_w, sheet_h = COLUMNS * FRAME_W, rows * FRAME_H
sheet = np.zeros((sheet_h, sheet_w, 4), np.float32)
for i, path in enumerate(frame_paths):
    img = bpy.data.images.load(path)
    px = np.empty(FRAME_W * FRAME_H * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    col, row = i % COLUMNS, i // COLUMNS
    y0 = sheet_h - (row + 1) * FRAME_H          # image rows are stored bottom-up
    sheet[y0:y0 + FRAME_H, col * FRAME_W:(col + 1) * FRAME_W] = px.reshape(FRAME_H, FRAME_W, 4)

out_img = bpy.data.images.new("sheet", sheet_w, sheet_h, alpha=True)
out_img.pixels.foreach_set(sheet.reshape(-1))
out_img.filepath_raw = os.path.join(out_dir, "sheet.png")
out_img.file_format = "PNG"
out_img.save()

meta = {
    "image": "sheet.png",
    "frameWidth": FRAME_W,
    "frameHeight": FRAME_H,
    "columns": COLUMNS,
    "yaws": YAWS,
    "pitches": PITCHES,
    "principalX": FRAME_W / 2,
    "principalY": -FRAME_TOP,
    "referenceScreenHeight": REFERENCE_SCREEN_HEIGHT,
    "camera": {"height": CAMERA_HEIGHT, "distance": CAMERA_DISTANCE, "vfovDeg": VFOV_DEG},
}
with open(os.path.join(out_dir, "sheet.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)
print("saved sheet", sheet_w, "x", sheet_h)
