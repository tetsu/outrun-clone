"""Pose a character rigged by rig_person.py, and optionally render check views.

Each pose is a list of (bone, world axis, degrees): the bone turns about the given axis through
its own head, carrying its children. Steps run in order, so later steps see earlier ones.

Usage:
  blender --background --factory-startup --python tools/blender/pose_person.py -- <rigged.blend> <pose> <out.blend> [views_dir]
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

AXES = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}

POSES = {
    # Sitting in a low sports-car seat, leaning back, hands resting on the lap.
    "seated": [
        ("spine", "x", -10),
        ("upper_chest", "x", -4),
        ("head", "x", 8),
        ("thigh.L", "x", -88), ("thigh.R", "x", -88),
        ("thigh.L", "y", -4), ("thigh.R", "y", 4),
        # legs stretch forward into the footwell rather than dropping straight down
        ("shin.L", "x", 45), ("shin.R", "x", 45),
        ("foot.L", "x", -20), ("foot.R", "x", -20),
        ("upper_arm.L", "y", 72), ("upper_arm.R", "y", -72),
        ("upper_arm.L", "x", -28), ("upper_arm.R", "x", -28),
        ("forearm.L", "x", -62), ("forearm.R", "x", -62),
        ("forearm.L", "z", -30), ("forearm.R", "z", 30),
    ],
}
# Driving: the seated body and legs; the arms are placed on the wheel by reach() once the
# character sits in the car.
POSES["driving"] = [step for step in POSES["seated"] if not step[0].startswith(("upper_arm", "forearm"))]


def aim(rig, name, target):
    """Turn a pose bone about its head so that it points at target (armature space)."""
    pb = rig.pose.bones[name]
    head = pb.head.copy()
    q = (pb.tail - head).rotation_difference(target - head)
    pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()


def reach(rig, side, wrist_world, grip_world, pole):
    """Two-bone IK: bend upper arm and forearm so the wrist lands on wrist_world, elbow towards
    the pole direction, then point the hand at grip_world. Positions are in world space."""
    to_rig = rig.matrix_world.inverted()
    wrist = to_rig @ Vector(wrist_world)
    grip = to_rig @ Vector(grip_world)
    upper = rig.pose.bones[f"upper_arm.{side}"]
    fore = rig.pose.bones[f"forearm.{side}"]
    l1, l2 = upper.length, fore.length
    s = upper.head.copy()
    d = (wrist - s).length
    if d > l1 + l2 - 1e-3:
        wrist = s + (wrist - s).normalized() * (l1 + l2 - 1e-3)
        d = l1 + l2 - 1e-3
    u = (wrist - s).normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    p = Vector(pole)
    v = (p - p.dot(u) * u).normalized()
    elbow = s + u * a + v * h
    aim(rig, f"upper_arm.{side}", elbow)
    aim(rig, f"forearm.{side}", wrist)
    aim(rig, f"hand.{side}", grip)
    return (rig.matrix_world @ rig.pose.bones[f"forearm.{side}"].tail - Vector(wrist_world)).length


def apply_pose(rig, steps):
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for name, axis, degrees in steps:
        turn(rig, name, axis, degrees)
    bpy.ops.object.mode_set(mode="OBJECT")


def turn(rig, name, axis, degrees):
    """Turn a pose bone about an armature-space axis through its own head, carrying its children."""
    pb = rig.pose.bones[name]
    head = pb.head.copy()
    pb.matrix = (Matrix.Translation(head) @ Matrix.Rotation(math.radians(degrees), 4, AXES[axis])
                 @ Matrix.Translation(-head) @ pb.matrix)
    bpy.context.view_layer.update()


def render_views(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1000
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("check")
    if world.node_tree is None:
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.82, 0.86, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    scene.world = world
    sun = bpy.data.objects.new("check_sun", bpy.data.lights.new("check_sun", "SUN"))
    sun.data.energy = 2.5
    sun.rotation_euler = (math.radians(40), 0, math.radians(20))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("check_cam", bpy.data.cameras.new("check_cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.8
    scene.collection.objects.link(cam)
    scene.camera = cam
    centre = Vector((0, 0, 0.8))
    views = {
        "front": (Vector((0, -10, 0)), (math.radians(90), 0, 0)),
        "side": (Vector((10, 0, 0)), (math.radians(90), 0, math.radians(90))),
        "back": (Vector((0, 10, 0)), (math.radians(90), 0, math.radians(180))),
    }
    for name, (off, rot) in views.items():
        cam.location = centre + off
        cam.rotation_euler = rot
        scene.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print("rendered", name)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:]
    in_blend, pose, out_blend = argv[0], argv[1], argv[2]
    bpy.ops.wm.open_mainfile(filepath=in_blend)
    apply_pose(bpy.data.objects["rig"], POSES[pose])
    bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
    print("saved", out_blend)
    if len(argv) > 3:
        render_views(argv[3])
