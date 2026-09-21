"""Render a traffic vehicle's sprite sheet from a .blend prepared by prep_car.py.

Traffic drives the player's way, parallel to the road, and is seen off to one side as the
player passes it. Each frame is one sideways offset: the vehicle REFERENCE_DISTANCE metres ahead
of the game camera and that many metres to the side, pointing straight down the road, with the
camera looking straight ahead. Lens shift centres the vehicle in the frame.

Frames are picked by the offset in metres, not by the angle the vehicle is seen at. Lines along
the road run to the vanishing point, and how steeply they run there on screen depends only on how
far to the side they are: a frame rendered at the right offset keeps its sides pointing down the
road when the game scales it for any distance, near or far. (Turning the vehicle in front of the
camera made traffic point away from the road; picking by angle made it point outwards far off
and inwards up close.) What scaling does not get right is how long the side looks, which is
stretched more the nearer the vehicle is; hills are left to the scaling too.

Frame index = offset index. A positive offset is a vehicle to the right of the camera.

Usage:
  blender --background --factory-startup --python tools/blender/render_traffic.py -- <in.blend> <out_dir>
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sprite_common import (  # noqa: E402
    CAMERA_HEIGHT, MAX_SHEET_WIDTH, VFOV_DEG, focal_px,
    frame_from_extent, mesh_points, pack_sheet, setup_scene,
)

argv = sys.argv[sys.argv.index("--") + 1:]
in_blend, out_dir = argv[0], os.path.abspath(argv[1])   # Blender resolves a relative path against the drive root
os.makedirs(out_dir, exist_ok=True)

REFERENCE_DISTANCE = 10.0            # metres from the camera to the vehicle's centre
# Metres to the side, closer together near the middle, where the slope of the sides changes
# fastest; beyond the last one the game uses the last. A lane is about 4.3 m.
OFFSETS = [-12, -8.5, -6, -4.3, -3, -2, -1, 0, 1, 2, 3, 4.3, 6, 8.5, 12]
# Frames are 1:1 on a screen this tall; lower than the player car's, as there are more frames per
# vehicle and traffic is small on screen most of the time.
REFERENCE_SCREEN_HEIGHT = 1080
FOCAL_PX = focal_px(REFERENCE_SCREEN_HEIGHT)

bpy.ops.wm.open_mainfile(filepath=in_blend)
scene = bpy.context.scene


def extent(points):
    """Half width, top and bottom of the vehicle in pixels over every offset, measured from where
    the road point under its centre projects (the anchor, the middle of the frame). The vehicle
    faces -Y and the camera looks along -Y from +Y, so the screen's right is world -X: the camera
    at +X puts the vehicle to the right."""
    half_w, top, bottom = 0.0, 1e9, -1e9
    for cx in OFFSETS:
        depth = REFERENCE_DISTANCE - points[:, 1]
        sx = FOCAL_PX * (cx - points[:, 0]) / depth - FOCAL_PX * cx / REFERENCE_DISTANCE
        sy = FOCAL_PX * (CAMERA_HEIGHT - points[:, 2]) / depth
        half_w = max(half_w, float(abs(sx).max()))
        top, bottom = min(top, float(sy.min())), max(bottom, float(sy.max()))
    return half_w, top, bottom


FRAME_W, FRAME_H, FRAME_TOP = frame_from_extent(*extent(mesh_points(scene)))
COLUMNS = min(len(OFFSETS), MAX_SHEET_WIDTH // FRAME_W)
print(f"frame {FRAME_W} x {FRAME_H}, top {FRAME_TOP} px below the principal point, {COLUMNS} per row", flush=True)

setup_scene(scene, FRAME_W, FRAME_H, FRAME_TOP, REFERENCE_DISTANCE, REFERENCE_SCREEN_HEIGHT)
cam = scene.camera
larger = max(FRAME_W, FRAME_H)

frame_paths = []
for offset in OFFSETS:
    cam.location.x = offset
    # the vehicle's anchor is FOCAL_PX * offset / distance right of the principal point; shift is in frame widths
    cam.data.shift_x = FOCAL_PX * offset / REFERENCE_DISTANCE / larger
    path = os.path.join(out_dir, "frames", f"x{offset:+05.1f}.png")
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
    "offsets": OFFSETS,
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
