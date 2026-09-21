"""Render the crash sprites: the player car spinning and rolling over, and its two occupants
sitting dazed on the road after being thrown out.

The camera is the game camera (sprite_common.py), as for render_car.py, so a frame drawn at its
reference position lines up with the road.

car: one sheet of the player car, rendered at half resolution (1:1 on a 720-pixel-tall screen, so
  the game draws it at twice the scale of the driving sheet) to save texture memory.
  - spin: the car with its seated occupants (base pose, no sway), yaw 0, 15, ... 345, level.
    Positive yaw turns the nose to the right of the screen, as in render_car.py.
  - roll: the car alone (the occupants have been thrown out), rolled about its own long axis
    through a pivot ROLL_PIVOT_HEIGHT above the road at the car's centre: 0, 30, ... 330, yaw 0.
    Positive roll takes the roof to the right of the screen (clockwise as the camera sees it).
  Frame index: spin frames first (spin.first + yaw index), then roll (roll.first + angle index).
  The meta gives where the pivot projects in the frame, so the game can place a roll frame by it.

people: the driver and the passenger sitting on the road (pose_person.py "sitting_ground"), each
  at PEOPLE_YAWS. Unlike the vehicles, yaw 0 shows a person from the FRONT, facing the camera:
  they sit by the road looking at the traffic coming towards them. Positive yaw turns the person
  to face towards the right of the screen (showing more of their left side), the same sense as a
  vehicle's positive yaw turning its nose to the right. Row 0 is the driver, row 1 the passenger;
  frame index = row * len(yaws) + yaw index. The anchor is the ground point under the hips, which
  is also the point they turn about.

Usage:
  blender --background --factory-startup --python tools/blender/render_crash.py -- car <player-car.occupied.blend> <out_dir>
  blender --background --factory-startup --python tools/blender/render_crash.py -- people <driver.rigged.blend> <passenger.rigged.blend> <out_dir>
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pose_person import sit_on_ground  # noqa: E402
from sprite_common import (  # noqa: E402
    CAMERA_HEIGHT, MAX_SHEET_WIDTH, REFERENCE_SCREEN_HEIGHT, VFOV_DEG,
    add_roll, add_turntable, clear_coat, focal_px, frame_from_extent, mesh_points, pack_sheet,
    project_extent, set_attitude, set_roll, setup_scene, union_extent,
)

CAMERA_DISTANCE = 6.0     # metres behind the car's centre; must match render_car.py and src/game/camera.ts

CAR_REFERENCE_HEIGHT = 720          # half of the driving sheet's: the crash is brief, and blurred by motion
SPIN_YAWS = list(range(0, 360, 15))       # 24 frames all the way round
ROLLS = list(range(0, 360, 30))           # 12 frames all the way over
ROLL_PIVOT_HEIGHT = 0.7   # metres above the road, about the middle of the car's height

PEOPLE_YAWS = [-30, 0, 30]


def write_meta(out_dir, meta):
    with open(os.path.join(out_dir, "sheet.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


def render(scene, path, frame_paths):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    frame_paths.append(path)
    print("rendered", os.path.basename(path), flush=True)


def render_car(in_blend, out_dir):
    bpy.ops.wm.open_mainfile(filepath=in_blend)
    scene = bpy.context.scene
    # The car and everything riding in it (seated characters and their rigs) turn together.
    riders = [o for o in scene.objects if o.parent is None and o.type in ("MESH", "ARMATURE")]
    car = bpy.data.objects["car"]
    occupants = [o for o in scene.objects if o.type == "MESH" and o is not car]

    # One frame for both sequences: the spin with the occupants aboard, the roll without them.
    spin = [(yaw, 0) for yaw in SPIN_YAWS]
    roll = [(0, 0, angle) for angle in ROLLS]
    extent = union_extent(
        project_extent(mesh_points(scene), spin, CAMERA_DISTANCE, CAR_REFERENCE_HEIGHT),
        project_extent(mesh_points(scene, [car]), roll, CAMERA_DISTANCE, CAR_REFERENCE_HEIGHT, ROLL_PIVOT_HEIGHT),
    )
    frame_w, frame_h, frame_top = frame_from_extent(*extent)
    columns = min(len(spin) + len(roll), MAX_SHEET_WIDTH // frame_w)
    print(f"frame {frame_w} x {frame_h}, top {frame_top} px below the principal point, {columns} per row", flush=True)

    setup_scene(scene, frame_w, frame_h, frame_top, CAMERA_DISTANCE, CAR_REFERENCE_HEIGHT)
    pitch_root, yaw_root = add_turntable(scene, riders)
    roll_root = add_roll(scene, yaw_root, riders, ROLL_PIVOT_HEIGHT)

    # The body's baked-texture material gets a glossy clear coat on its paint, as in render_car.py.
    for material in car.data.materials:
        bsdf = next(nd for nd in material.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
        if bsdf.inputs["Base Color"].is_linked:
            clear_coat(material)

    frame_paths = []
    set_roll(roll_root, 0)
    for yaw in SPIN_YAWS:
        set_attitude(pitch_root, yaw_root, yaw, 0)
        render(scene, os.path.join(out_dir, "frames", f"spin_y{yaw:03d}.png"), frame_paths)
    for obj in occupants:
        obj.hide_render = True
    set_attitude(pitch_root, yaw_root, 0, 0)
    for angle in ROLLS:
        set_roll(roll_root, angle)
        render(scene, os.path.join(out_dir, "frames", f"roll_r{angle:03d}.png"), frame_paths)

    (sheet_w, sheet_h), clipped = pack_sheet(frame_paths, frame_w, frame_h, columns, os.path.join(out_dir, "sheet.png"))

    focal = focal_px(CAR_REFERENCE_HEIGHT)
    write_meta(out_dir, {
        "image": "sheet.png",
        "frameWidth": frame_w,
        "frameHeight": frame_h,
        "columns": columns,
        "referenceScreenHeight": CAR_REFERENCE_HEIGHT,
        "camera": {"height": CAMERA_HEIGHT, "distance": CAMERA_DISTANCE, "vfovDeg": VFOV_DEG},
        "principalX": frame_w / 2,
        "principalY": -frame_top,
        "spin": {"first": 0, "yaws": SPIN_YAWS},
        "roll": {
            "first": len(SPIN_YAWS),
            "angles": ROLLS,
            "pivotHeight": ROLL_PIVOT_HEIGHT,
            # the pivot sits straight ahead of the camera, so it projects onto the principal column
            "pivotX": frame_w / 2,
            "pivotY": focal * (CAMERA_HEIGHT - ROLL_PIVOT_HEIGHT) / CAMERA_DISTANCE - frame_top,
        },
    })
    print("saved sheet", sheet_w, "x", sheet_h)
    print("frames cut off at the edge:", clipped if clipped else "none")


def load_person(path, role):
    """Append a rigged character's rig and mesh, named after its role."""
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = [name for name in src.objects if name in ("rig", "person")]
    rig = person = None
    for obj in dst.objects:
        bpy.context.scene.collection.objects.link(obj)
        if obj.type == "ARMATURE":
            rig = obj
        else:
            person = obj
    rig.name, person.name = f"{role}_rig", role
    return rig, person


def person_attitude(yaw):
    """set_attitude's yaw for a person seen at `yaw`. The characters are modelled facing -Y, away
    from the camera; half a turn faces them to it. set_attitude's positive yaw is a negative turn
    about Z, and a positive turn about Z takes the face of a person facing +Y towards -X, the
    right of the screen, so the sign flips too."""
    return -(180 + yaw)


def render_people(driver_blend, passenger_blend, out_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    people = {}
    for role, path in (("driver", driver_blend), ("passenger", passenger_blend)):
        rig, person = load_person(path, role)
        sit_on_ground(rig, person)
        people[role] = (rig, person)

    attitudes = [(person_attitude(yaw), 0) for yaw in PEOPLE_YAWS]
    extent = union_extent(*(project_extent(mesh_points(scene, [person]), attitudes, CAMERA_DISTANCE)
                            for _, person in people.values()))
    frame_w, frame_h, frame_top = frame_from_extent(*extent)
    columns = len(PEOPLE_YAWS)
    print(f"frame {frame_w} x {frame_h}, top {frame_top} px below the principal point", flush=True)

    setup_scene(scene, frame_w, frame_h, frame_top, CAMERA_DISTANCE)
    pitch_root, yaw_root = add_turntable(scene, [rig for rig, _ in people.values()])

    frame_paths = []
    for role, (_, person) in people.items():
        for _, other in people.values():
            other.hide_render = other is not person
        for yaw, (attitude, _) in zip(PEOPLE_YAWS, attitudes):
            set_attitude(pitch_root, yaw_root, attitude, 0)
            render(scene, os.path.join(out_dir, "frames", f"{role}_y{yaw:+d}.png"), frame_paths)

    (sheet_w, sheet_h), clipped = pack_sheet(frame_paths, frame_w, frame_h, columns, os.path.join(out_dir, "sheet.png"))

    pixels_per_metre = focal_px() / CAMERA_DISTANCE
    write_meta(out_dir, {
        "image": "sheet.png",
        "frameWidth": frame_w,
        "frameHeight": frame_h,
        "columns": columns,
        "rows": list(people),
        "yaws": PEOPLE_YAWS,
        # The point on the road under the hips, in frame pixels from the top-left.
        "anchorX": frame_w / 2,
        "anchorY": pixels_per_metre * CAMERA_HEIGHT - frame_top,
        "pixelsPerMetre": pixels_per_metre,
        "referenceScreenHeight": REFERENCE_SCREEN_HEIGHT,
        "camera": {"height": CAMERA_HEIGHT, "distance": CAMERA_DISTANCE, "vfovDeg": VFOV_DEG},
    })
    print("saved sheet", sheet_w, "x", sheet_h)
    print("frames cut off at the edge:", clipped if clipped else "none")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:]
    mode, paths = argv[0], argv[1:]
    out_dir = os.path.abspath(paths[-1])   # Blender resolves a relative path against the drive root
    os.makedirs(out_dir, exist_ok=True)
    if mode == "car":
        render_car(os.path.abspath(paths[0]), out_dir)
    elif mode == "people":
        render_people(os.path.abspath(paths[0]), os.path.abspath(paths[1]), out_dir)
    else:
        sys.exit(f"unknown mode {mode!r}: use car or people")
