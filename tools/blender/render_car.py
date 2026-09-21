"""Render the player car's sprite sheet from a prepared .blend.

The Blender camera reproduces the game camera exactly (same height, distance behind the
car and vertical field of view, looking level), so a frame drawn at its reference position
lines up with the road without any per-frame fiddling. Camera shift crops the frame to the
part of the view that holds the car.

Frames: every steering yaw x every road pitch. Frame index = pitch_index * len(YAWS) + yaw_index.
Positive yaw turns the nose to the right of the screen; positive pitch lifts the nose (uphill).

Seated characters move with each frame: in a turn their upper bodies sway towards the outside
of the bend, and on a slope they lean to stay nearer upright, with the head turning back a
little against both. The driver's hands are put back on the wheel after every lean.

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pose_person import reach, turn  # noqa: E402
from seat_person import WHEEL_NORMAL, wheel_point  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
in_blend, out_dir = argv[0], argv[1]
os.makedirs(out_dir, exist_ok=True)

# Must match src/game/camera.ts.
CAMERA_HEIGHT = 2.0       # metres above the road
CAMERA_DISTANCE = 6.5     # metres behind the car's centre
VFOV_DEG = 60.0
REFERENCE_SCREEN_HEIGHT = 1440   # a frame is 1:1 on a screen this many pixels tall

YAWS = list(range(-24, 25, 4))       # 13 steering frames
PITCHES = [-10, -5, 0, 5, 10]        # 5 slope frames
MAX_SHEET_WIDTH = 8192               # widest texture every desktop GPU accepts
FRAME_MARGIN = 12                    # pixels kept clear around the car in every frame
# The frame size and position are fitted to the car below, so every attitude stays inside.

# Occupants' body motion, degrees per degree of the car's attitude.
SWAY_PER_YAW = 8.0 / 24    # upper body towards the outside of the bend
LEAN_PER_PITCH = 0.4       # upper body against the slope, towards upright
HEAD_RETURN = 0.4          # share of the body's lean the head turns back

bpy.ops.wm.open_mainfile(filepath=in_blend)
scene = bpy.context.scene
# The car and everything riding in it (seated characters and their rigs) turn together.
riders = [o for o in scene.objects if o.parent is None and o.type in ("MESH", "ARMATURE")]

focal_px = (REFERENCE_SCREEN_HEIGHT / 2) / math.tan(math.radians(VFOV_DEG) / 2)


def fit_frame():
    """Project the car and its occupants for every attitude with the game camera, and return the
    frame (width, height, top edge below the principal point) that holds all of them."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.evaluated_get(depsgraph).to_mesh()
        co = np.empty(len(mesh.vertices) * 3, np.float32)
        mesh.vertices.foreach_get("co", co)
        obj.evaluated_get(depsgraph).to_mesh_clear()
        co = co.reshape(-1, 3)[::7]
        m = np.array(obj.matrix_world)
        points.append(co @ m[:3, :3].T + m[:3, 3])
    points = np.concatenate(points)
    half_w, top, bottom = 0.0, 1e9, -1e9
    for pitch in PITCHES:
        for yaw in YAWS:
            a, b = math.radians(-pitch), math.radians(-yaw)
            rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
            rz = np.array([[math.cos(b), -math.sin(b), 0], [math.sin(b), math.cos(b), 0], [0, 0, 1]])
            p = points @ (rx @ rz).T
            depth = CAMERA_DISTANCE - p[:, 1]
            sx = focal_px * p[:, 0] / depth
            sy = focal_px * (CAMERA_HEIGHT - p[:, 2]) / depth    # pixels below the principal point
            half_w = max(half_w, float(np.abs(sx).max()))
            top, bottom = min(top, float(sy.min())), max(bottom, float(sy.max()))
    def up16(v):
        return int(math.ceil(v / 16) * 16)
    frame_w = up16(2 * (half_w + FRAME_MARGIN))
    frame_top = int(math.floor(top - FRAME_MARGIN))
    frame_h = up16(bottom + FRAME_MARGIN - frame_top)
    return frame_w, frame_h, frame_top


FRAME_W, FRAME_H, FRAME_TOP = fit_frame()
COLUMNS = MAX_SHEET_WIDTH // FRAME_W
print(f"frame {FRAME_W} x {FRAME_H}, top {FRAME_TOP} px below the principal point, {COLUMNS} per row", flush=True)

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

cam_data = bpy.data.cameras.new("cam")
# Blender measures lens and shift against the frame's larger side; fit the sensor to it.
horizontal = FRAME_W >= FRAME_H
cam_data.sensor_fit = "HORIZONTAL" if horizontal else "VERTICAL"
cam_data.sensor_width = cam_data.sensor_height = 36.0
larger = FRAME_W if horizontal else FRAME_H
cam_data.lens = focal_px * 36.0 / larger
cam_data.shift_x = 0.0
cam_data.shift_y = -(FRAME_TOP + FRAME_H / 2) / larger
cam_data.clip_start = 0.1
cam = bpy.data.objects.new("cam", cam_data)
cam.location = (0.0, CAMERA_DISTANCE, CAMERA_HEIGHT)
cam.rotation_euler = (math.radians(90), 0.0, math.radians(180))   # level, looking along -Y
scene.collection.objects.link(cam)
scene.camera = cam

car = bpy.data.objects["car"]
rigs = [o for o in riders if o.type == "ARMATURE"]
base_pose = {rig.name: {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones} for rig in rigs}


def pose_occupants(yaw, pitch):
    """Sway and lean the seated characters for this attitude of the car."""
    sway = SWAY_PER_YAW * yaw        # a right turn (yaw > 0) throws them towards the car's left, +X
    lean = LEAN_PER_PITCH * pitch    # uphill (pitch > 0) they lean forwards, -Y
    for rig in rigs:
        for pb in rig.pose.bones:
            pb.matrix_basis = base_pose[rig.name][pb.name]
        bpy.context.view_layer.update()
        # Axes are the armature's, which are the car's: +Y is backwards, so a positive turn about
        # Y tips the head to +X, and a positive turn about X tips it forwards.
        turn(rig, "spine", "y", sway * 0.6)
        turn(rig, "chest", "y", sway * 0.4)
        turn(rig, "spine", "x", lean)
        turn(rig, "head", "y", -sway * HEAD_RETURN)
        turn(rig, "head", "x", -lean * HEAD_RETURN)
        if rig.name == "driver_rig":
            back = car.matrix_world.to_3x3() @ (-WHEEL_NORMAL * 0.06)
            for side, angle, pole in (("L", 60, (0.6, 0.3, -1.0)), ("R", -60, (-0.6, 0.3, -1.0))):
                grip = car.matrix_world @ wheel_point(angle)
                reach(rig, side, grip + back, grip, pole)


frame_paths = []
for pitch in PITCHES:
    for yaw in YAWS:
        # The car faces -Y and the camera sits on +Y: nose-right is a negative turn about Z,
        # nose-up is a negative turn about X.
        yaw_root.rotation_euler = (0.0, 0.0, math.radians(-yaw))
        pitch_root.rotation_euler = (math.radians(-pitch), 0.0, 0.0)
        bpy.context.view_layer.update()
        pose_occupants(yaw, pitch)
        path = os.path.join(out_dir, "frames", f"p{pitch:+d}_y{yaw:+d}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        frame_paths.append(path)
        print("rendered", os.path.basename(path), flush=True)

rows = math.ceil(len(frame_paths) / COLUMNS)
sheet_w, sheet_h = COLUMNS * FRAME_W, rows * FRAME_H
sheet = np.zeros((sheet_h, sheet_w, 4), np.float32)
clipped = []
for i, path in enumerate(frame_paths):
    img = bpy.data.images.load(path)
    px = np.empty(FRAME_W * FRAME_H * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    alpha = px.reshape(FRAME_H, FRAME_W, 4)[:, :, 3]
    edges = {"bottom": alpha[0], "top": alpha[-1], "left": alpha[:, 0], "right": alpha[:, -1]}
    touching = [name for name, edge in edges.items() if edge.max() > 0.02]
    if touching:
        clipped.append(f"{os.path.basename(path)}: {', '.join(touching)}")
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
print("frames cut off at the edge:", clipped if clipped else "none")
