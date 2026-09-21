"""Render a traffic vehicle's sprite sheet from a .blend prepared by prep_car.py.

Traffic is seen from behind and from either side as the player passes it, so the frames are
yaw angles only; hills are left to the game's scaling. The view is the game camera
REFERENCE_DISTANCE metres behind the vehicle: a vehicle at that distance is drawn 1:1 on the
reference screen, and the game scales the frame for any other distance.

Frame index = yaw index. Positive yaw turns the nose to the right of the screen.

Usage:
  blender --background --factory-startup --python tools/blender/render_traffic.py -- <in.blend> <out_dir>
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sprite_common import (  # noqa: E402
    CAMERA_HEIGHT, FOCAL_PX, MAX_SHEET_WIDTH, REFERENCE_SCREEN_HEIGHT, VFOV_DEG,
    add_turntable, fit_frame, pack_sheet, set_attitude, setup_scene,
)

argv = sys.argv[sys.argv.index("--") + 1:]
in_blend, out_dir = argv[0], os.path.abspath(argv[1])   # Blender resolves a relative path against the drive root
os.makedirs(out_dir, exist_ok=True)

REFERENCE_DISTANCE = 10.0            # metres from the camera to the vehicle's centre
YAWS = list(range(-40, 41, 8))       # 11 frames; a vehicle one lane over and close is seen from about 35 degrees

bpy.ops.wm.open_mainfile(filepath=in_blend)
scene = bpy.context.scene
riders = [o for o in scene.objects if o.parent is None and o.type == "MESH"]

FRAME_W, FRAME_H, FRAME_TOP = fit_frame(scene, [(yaw, 0) for yaw in YAWS], REFERENCE_DISTANCE)
COLUMNS = min(len(YAWS), MAX_SHEET_WIDTH // FRAME_W)
print(f"frame {FRAME_W} x {FRAME_H}, top {FRAME_TOP} px below the principal point, {COLUMNS} per row", flush=True)

setup_scene(scene, FRAME_W, FRAME_H, FRAME_TOP, REFERENCE_DISTANCE)
pitch_root, yaw_root = add_turntable(scene, riders)

frame_paths = []
for yaw in YAWS:
    set_attitude(pitch_root, yaw_root, yaw, 0)
    path = os.path.join(out_dir, "frames", f"y{yaw:+d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    frame_paths.append(path)
    print("rendered", os.path.basename(path), flush=True)

(sheet_w, sheet_h), clipped = pack_sheet(frame_paths, FRAME_W, FRAME_H, COLUMNS, os.path.join(out_dir, "sheet.png"))

pixels_per_metre = FOCAL_PX / REFERENCE_DISTANCE
meta = {
    "image": "sheet.png",
    "frameWidth": FRAME_W,
    "frameHeight": FRAME_H,
    "columns": COLUMNS,
    "yaws": YAWS,
    # The point on the road under the vehicle's centre, in frame pixels from the top-left.
    "anchorX": FRAME_W / 2,
    "anchorY": pixels_per_metre * CAMERA_HEIGHT - FRAME_TOP,
    "pixelsPerMetre": pixels_per_metre,
    "referenceScreenHeight": REFERENCE_SCREEN_HEIGHT,
    "camera": {"height": CAMERA_HEIGHT, "distance": REFERENCE_DISTANCE, "vfovDeg": VFOV_DEG},
}
with open(os.path.join(out_dir, "sheet.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)
print("saved sheet", sheet_w, "x", sheet_h)
print("frames cut off at the edge:", clipped if clipped else "none")
