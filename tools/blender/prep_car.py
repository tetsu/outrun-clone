"""Import a car GLB, normalise it and save it as a .blend for the other scripts.

Normalised means: one mesh object named "car", transforms applied, front facing -Y,
wheels resting on z = 0, centred on x = y = 0, scaled to the given length in metres.

Usage:
  blender --background --factory-startup --python tools/blender/prep_car.py -- <in.glb> <out.blend> [length_m]
"""
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb_path, blend_path = argv[0], argv[1]
length_m = float(argv[2]) if len(argv) > 2 else 4.5

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb_path)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if len(meshes) > 1:
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
car = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
car.name = "car"
car.data.name = "car"

# Bake the object transform into the mesh, then centre and scale it.
car.data.transform(car.matrix_world)
car.matrix_world = Matrix.Identity(4)

corners = [Vector(c) for c in car.bound_box]
lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
scale = length_m / (hi.y - lo.y)
offset = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
car.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(offset))
car.data.update()

size = (hi - lo) * scale
print(f"normalised: length={size.y:.3f} width={size.x:.3f} height={size.z:.3f} faces={len(car.data.polygons)}")

# Remove the importer's leftover empties so the file holds only the car.
for o in list(bpy.context.scene.objects):
    if o is not car:
        bpy.data.objects.remove(o)

bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
print("saved", blend_path)
