"""Put a posed character (from pose_person.py) into a seat of the prepared car, and save the result.

The character is moved so that its hip joints sit on the seat's hip point. In the driver's seat
the hands are then placed on the steering wheel at ten and two. Seat and wheel positions are
measured from the current stand-in car; a new car needs new numbers.

Run it once per seat; the output of one run can be the car for the next.

Usage:
  blender --background --factory-startup --python tools/blender/seat_person.py -- <car.blend> <posed.blend> <seat> <out.blend>
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pose_person import reach  # noqa: E402

# Hip point of each seat in car coordinates (metres; the car faces -Y, the driver sits on +X).
SEATS = {
    "driver": Vector((0.38, -0.06, 0.56)),   # slid forward so the hands reach the wheel
    "passenger": Vector((-0.38, 0.0, 0.56)),
}
# Steering wheel: centre, the normal of its face pointing forwards, and the rim radius.
WHEEL_CENTRE = Vector((0.387, -0.411, 0.96))
WHEEL_NORMAL = Vector((0.0, -0.973, -0.229)).normalized()
WHEEL_RADIUS = 0.19


def wheel_point(clock_angle_deg):
    """A point on the rim; 0 is twelve o'clock, positive turns towards +X (the driver's left)."""
    up = (Vector((0, 0, 1)) - WHEEL_NORMAL * WHEEL_NORMAL.z).normalized()
    across = WHEEL_NORMAL.cross(up).normalized()
    if across.x < 0:
        across = -across
    a = math.radians(clock_angle_deg)
    return WHEEL_CENTRE + (up * math.cos(a) + across * math.sin(a)) * WHEEL_RADIUS


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:]
    car_blend, posed_blend, seat, out_blend = argv[0], argv[1], argv[2], argv[3]

    bpy.ops.wm.open_mainfile(filepath=car_blend)
    with bpy.data.libraries.load(posed_blend) as (src, dst):
        dst.objects = [name for name in src.objects if name in ("rig", "person")]
    rig = person = None
    for obj in dst.objects:
        bpy.context.scene.collection.objects.link(obj)
        if obj.type == "ARMATURE":
            rig = obj
        else:
            person = obj
    rig.name = f"{seat}_rig"
    person.name = seat

    bpy.context.view_layer.update()
    hips = (rig.matrix_world @ rig.pose.bones["thigh.L"].head + rig.matrix_world @ rig.pose.bones["thigh.R"].head) / 2
    rig.location += SEATS[seat] - hips
    bpy.context.view_layer.update()
    print(f"{seat}: hip joints moved from {tuple(round(v, 3) for v in hips)} to {tuple(SEATS[seat])}")

    if seat == "driver":
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode="POSE")
        # the wrist sits a little behind the rim, on the driver's side of it
        back = -WHEEL_NORMAL * 0.06
        for side, angle, pole in (("L", 60, (0.6, 0.3, -1.0)), ("R", -60, (-0.6, 0.3, -1.0))):
            grip = wheel_point(angle)
            miss = reach(rig, side, grip + back, grip, pole)
            print(f"driver hand.{side}: grip {tuple(round(v, 3) for v in grip)}, wrist misses by {miss:.3f} m")
        bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
    print("saved", out_blend)
