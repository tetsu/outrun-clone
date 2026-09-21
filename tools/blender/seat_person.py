"""Put a posed character (from pose_person.py) into a seat of the prepared car, and save the result.

The character is moved so that its hip joints sit on the seat's hip point. Seat hip points are
measured from the current stand-in car (tools/blender: probe the seatbacks and cushions); a new
car needs new numbers.

Usage:
  blender --background --factory-startup --python tools/blender/seat_person.py -- <car.blend> <posed.blend> <seat> <out.blend>
"""
import sys

import bpy
from mathutils import Vector

# Hip point of each seat in car coordinates (metres; the car faces -Y, the driver sits on +X).
SEATS = {
    "driver": Vector((0.38, 0.0, 0.56)),
    "passenger": Vector((-0.38, 0.0, 0.56)),
}

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
person.name = f"{seat}"

bpy.context.view_layer.update()
hips = (rig.matrix_world @ rig.pose.bones["thigh.L"].head + rig.matrix_world @ rig.pose.bones["thigh.R"].head) / 2
rig.location += SEATS[seat] - hips
bpy.context.view_layer.update()
print(f"{seat}: hip joints moved from {tuple(round(v, 3) for v in hips)} to {tuple(SEATS[seat])}")

bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
print("saved", out_blend)
