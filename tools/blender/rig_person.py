"""Give an unrigged T-pose character (such as a Tripo export) a skeleton, and save it as .blend.

Steps: join the meshes, scale to the given height with the feet on z = 0 and the face towards -Y,
reduce the polygon count (sprites never need millions of faces), build a humanoid armature whose
joints are measured from the mesh, and bind the mesh with Blender's automatic weights.

The joint measurements assume a symmetric T-pose with the arms level and straight out along X.

Usage:
  blender --background --factory-startup --python tools/blender/rig_person.py -- <in.glb> <out.blend> [height_m]
"""
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb_path, blend_path = argv[0], argv[1]
height_m = float(argv[2]) if len(argv) > 2 else 1.65
TARGET_FACES = 250_000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb_path)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = body.data.name = "person"
body.data.transform(body.matrix_world)
body.matrix_world = Matrix.Identity(4)
for o in list(bpy.context.scene.objects):
    if o is not body:
        bpy.data.objects.remove(o)

# ---------------------------------------------------------------- normalise
co = np.empty(len(body.data.vertices) * 3, np.float32)
body.data.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
lo, hi = co.min(axis=0), co.max(axis=0)
scale = height_m / (hi[2] - lo[2])
offset = Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
body.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(offset))
body.data.update()

# ---------------------------------------------------------------- reduce
faces = len(body.data.polygons)
if faces > TARGET_FACES:
    dec = body.modifiers.new("decimate", "DECIMATE")
    dec.ratio = TARGET_FACES / faces
    bpy.ops.object.modifier_apply(modifier=dec.name)
# Tripo meshes can be split along texture seams; weld them so weights flow across.
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode="OBJECT")
print(f"faces {faces} -> {len(body.data.polygons)}")

co = np.empty(len(body.data.vertices) * 3, np.float32)
body.data.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
x, y, z = co[:, 0], co[:, 1], co[:, 2]
H = height_m

# ---------------------------------------------------------------- measure joints
def centre_y(zc, half_x=0.08, band=0.03):
    sel = (np.abs(x) < half_x) & (np.abs(z - zc) < band)
    return float(np.median(y[sel])) if sel.sum() > 20 else 0.0


# Arms: the level horizontal band far from the body.
span = float(np.abs(x).max())
arm_sel = (np.abs(x) > span * 0.45) & (np.abs(x) < span * 0.75)
arm_z = float(np.median(z[arm_sel]))
arm_y = float(np.median(y[arm_sel]))
# Joint positions along the arm as fractions of shoulder-to-fingertip. Measuring the shoulder from
# the mesh is unreliable (hair and bags hang beside it), so it comes from the height.
shoulder_x = H * 0.105
reach = span - shoulder_x
elbow_x = shoulder_x + reach * 0.46
wrist_x = elbow_x + reach * 0.37

# Legs: centre of each leg in a band around the shin.
leg_band = (z > H * 0.2) & (z < H * 0.35)
leg_x = float(np.median(np.abs(x[leg_band])))
foot_band = z < H * 0.05
toe_y = float(y[foot_band].min())

hip_z = H * 0.53
knee_z = H * 0.285
ankle_z = H * 0.045
neck_z = arm_z + H * 0.02
head_z = neck_z + H * 0.035
print(f"span={span:.3f} arm_z={arm_z:.3f} shoulder_x={shoulder_x:.3f} elbow_x={elbow_x:.3f} "
      f"wrist_x={wrist_x:.3f} leg_x={leg_x:.3f} toe_y={toe_y:.3f}")

# ---------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new("rig")
rig = bpy.data.objects.new("rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones


def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    b.roll = 0.0
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


spine_pts = [hip_z, H * 0.62, H * 0.71, neck_z]
bone("hips", (0, centre_y(hip_z), hip_z - 0.04), (0, centre_y(hip_z), hip_z + 0.06))
bone("spine", (0, centre_y(spine_pts[0]), spine_pts[0]), (0, centre_y(spine_pts[1]), spine_pts[1]), "hips")
bone("chest", (0, centre_y(spine_pts[1]), spine_pts[1]), (0, centre_y(spine_pts[2]), spine_pts[2]), "spine", True)
bone("upper_chest", (0, centre_y(spine_pts[2]), spine_pts[2]), (0, centre_y(neck_z), neck_z), "chest", True)
bone("neck", (0, centre_y(neck_z), neck_z), (0, centre_y(head_z, 0.05), head_z), "upper_chest", True)
bone("head", (0, centre_y(head_z, 0.05), head_z), (0, centre_y(head_z, 0.05), H), "neck", True)

for side, s in (("L", 1), ("R", -1)):
    bone(f"shoulder.{side}", (s * 0.03, arm_y, neck_z - 0.02), (s * shoulder_x, arm_y, arm_z), "upper_chest")
    bone(f"upper_arm.{side}", (s * shoulder_x, arm_y, arm_z), (s * elbow_x, arm_y, arm_z), f"shoulder.{side}", True)
    bone(f"forearm.{side}", (s * elbow_x, arm_y, arm_z), (s * wrist_x, arm_y, arm_z), f"upper_arm.{side}", True)
    bone(f"hand.{side}", (s * wrist_x, arm_y, arm_z), (s * span, arm_y, arm_z), f"forearm.{side}", True)
    bone(f"thigh.{side}", (s * leg_x, centre_y(hip_z, 0.2), hip_z - 0.06), (s * leg_x, centre_y(knee_z, 0.2), knee_z), "hips")
    bone(f"shin.{side}", (s * leg_x, centre_y(knee_z, 0.2), knee_z), (s * leg_x, centre_y(ankle_z, 0.2) + 0.02, ankle_z), f"thigh.{side}", True)
    bone(f"foot.{side}", (s * leg_x, centre_y(ankle_z, 0.2) + 0.02, ankle_z), (s * leg_x, toe_y + 0.03, 0.02), f"shin.{side}", True)

bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------- bind
# Blender's automatic (bone heat) weights fail on meshes made of many overlapping shells, which
# is what generated characters are. Weights are assigned by body region instead: each vertex
# belongs to the torso, an arm or a leg by position, and blends between neighbouring bones of
# that chain around each joint.
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_NAME")


def chain(t, bones, joints, blend):
    """Weights for a chain of bones along parameter t; joints[i] separates bones[i] and bones[i+1]."""
    out = {}
    lower = np.ones_like(t)
    for i, name in enumerate(bones):
        upper = np.ones_like(t) if i == len(bones) - 1 else np.clip((joints[i] + blend - t) / (2 * blend), 0, 1)
        out[name] = lower * upper
        if i < len(bones) - 1:
            lower = 1 - upper
    return out


n = len(co)
weights = {b.name: np.zeros(n, np.float32) for b in arm_data.bones}

torso = chain(z, ["hips", "spine", "chest", "upper_chest", "neck", "head"],
              [hip_z + 0.02, spine_pts[1], spine_pts[2], neck_z, head_z], 0.04)
for side, s in (("L", 1), ("R", -1)):
    on_side = (x * s) > 0
    ax = np.abs(x)
    # arms: close to the level arm axis, outside the shoulder
    radial = np.sqrt((y - arm_y) ** 2 + (z - arm_z) ** 2)
    in_arm = on_side & (ax > shoulder_x - 0.06) & (radial < 0.1)
    arm_mix = np.where(in_arm, np.clip((ax - (shoulder_x - 0.06)) / 0.08, 0, 1), 0)
    arm = chain(ax, [f"shoulder.{side}", f"upper_arm.{side}", f"forearm.{side}", f"hand.{side}"],
                [shoulder_x, elbow_x, wrist_x], 0.035)
    # legs: below the hips, blending in over the top of the thigh
    leg_mix = np.where(on_side, np.clip((hip_z - 0.02 - z) / 0.1, 0, 1), 0)
    leg = chain(-z, [f"thigh.{side}", f"shin.{side}", f"foot.{side}"], [-knee_z, -ankle_z], 0.04)
    for name, w in arm.items():
        weights[name] += arm_mix * w
    for name, w in leg.items():
        weights[name] += leg_mix * w
    if side == "L":
        torso_mix = 1 - arm_mix - leg_mix
    else:
        torso_mix -= arm_mix + leg_mix
for name, w in torso.items():
    weights[name] += np.clip(torso_mix, 0, 1) * w

for name, w in weights.items():
    vg = body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
    for level in np.unique(np.round(w[w > 0.001], 2)):
        idx = np.flatnonzero(np.abs(np.round(w, 2) - level) < 1e-6)
        vg.add(idx.tolist(), float(level), "REPLACE")
total = sum(weights.values())
print("vertices per bone:", {k: int((v > 0.05).sum()) for k, v in weights.items()})
print(f"weight sum range {total.min():.3f}..{total.max():.3f}")

bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
print("saved", blend_path)
