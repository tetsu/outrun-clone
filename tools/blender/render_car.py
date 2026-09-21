"""Render the player car's sprite sheet from a prepared .blend.

The Blender camera reproduces the game camera exactly (same height, distance behind the
car and vertical field of view, looking level), so a frame drawn at its reference position
lines up with the road without any per-frame fiddling. The camera, frame fitting and sheet
packing are shared with the traffic render in sprite_common.py.

Frames: every steering yaw x every road pitch. Frame index = pitch_index * len(YAWS) + yaw_index.
Positive yaw turns the nose to the right of the screen; positive pitch lifts the nose (uphill).

Seated characters move with each frame: in a turn their upper bodies sway towards the outside
of the bend, and on a slope they lean to stay nearer upright, with the head turning back a
little against both. The driver's hands are put back on the wheel after every lean.

Usage:
  blender --background --factory-startup --python tools/blender/render_car.py -- <in.blend> <out_dir>
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pose_person import reach, turn  # noqa: E402
from seat_person import WHEEL_NORMAL, wheel_point  # noqa: E402
from sprite_common import (  # noqa: E402
    CAMERA_HEIGHT, MAX_SHEET_WIDTH, REFERENCE_SCREEN_HEIGHT, VFOV_DEG,
    add_turntable, fit_frame, pack_sheet, set_attitude, setup_scene,
)

argv = sys.argv[sys.argv.index("--") + 1:]
in_blend, out_dir = argv[0], os.path.abspath(argv[1])   # Blender resolves a relative path against the drive root
os.makedirs(out_dir, exist_ok=True)

CAMERA_DISTANCE = 6.5     # metres behind the car's centre; must match src/game/camera.ts

YAWS = list(range(-24, 25, 4))       # 13 steering frames
PITCHES = [-10, -5, 0, 5, 10]        # 5 slope frames
# The frame size and position are fitted to the car, so every attitude stays inside.

# Occupants' body motion, degrees per degree of the car's attitude.
SWAY_PER_YAW = 8.0 / 24    # upper body towards the outside of the bend
LEAN_PER_PITCH = 0.4       # upper body against the slope, towards upright
HEAD_RETURN = 0.4          # share of the body's lean the head turns back

bpy.ops.wm.open_mainfile(filepath=in_blend)
scene = bpy.context.scene
# The car and everything riding in it (seated characters and their rigs) turn together.
riders = [o for o in scene.objects if o.parent is None and o.type in ("MESH", "ARMATURE")]

attitudes = [(yaw, pitch) for pitch in PITCHES for yaw in YAWS]
FRAME_W, FRAME_H, FRAME_TOP = fit_frame(scene, attitudes, CAMERA_DISTANCE)
COLUMNS = MAX_SHEET_WIDTH // FRAME_W
print(f"frame {FRAME_W} x {FRAME_H}, top {FRAME_TOP} px below the principal point, {COLUMNS} per row", flush=True)

setup_scene(scene, FRAME_W, FRAME_H, FRAME_TOP, CAMERA_DISTANCE)
pitch_root, yaw_root = add_turntable(scene, riders)

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
for yaw, pitch in attitudes:
    set_attitude(pitch_root, yaw_root, yaw, pitch)
    pose_occupants(yaw, pitch)
    path = os.path.join(out_dir, "frames", f"p{pitch:+d}_y{yaw:+d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    frame_paths.append(path)
    print("rendered", os.path.basename(path), flush=True)

(sheet_w, sheet_h), clipped = pack_sheet(frame_paths, FRAME_W, FRAME_H, COLUMNS, os.path.join(out_dir, "sheet.png"))

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
