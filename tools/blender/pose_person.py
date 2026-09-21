"""Pose a character rigged by rig_person.py, and optionally render check views.

Each pose is a list of (bone, world axis, degrees): the bone turns about the given axis through
its own head, carrying its children. Steps run in order, so later steps see earlier ones.

Usage:
  blender --background --factory-startup --python tools/blender/pose_person.py -- <rigged.blend> <pose> <out.blend> [views_dir]
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
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
# Thrown out of the car and sitting dazed on the road: the upper body leans back (mostly from the
# pelvis, so the belly doesn't fold), the head hangs a little and tips to one side. The legs and
# arms depend on the ground, so sit_on_ground() places them once the character rests on it: legs
# stretched out in front, slightly apart, knees a little bent, toes up; hands on the ground behind
# the hips, propping the body up.
POSES["sitting_ground"] = [
    ("hips", "x", -12),
    ("spine", "x", -6),
    ("chest", "x", -4),
    ("neck", "x", 14),
    ("head", "x", 22),
    ("head", "y", 9),
]


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


def deformed_points(obj):
    """World positions of every vertex of a mesh object, as posed by its armature."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    co = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get("co", co)
    obj.evaluated_get(depsgraph).to_mesh_clear()
    m = np.array(obj.matrix_world)
    return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


# Sitting on the ground: how far the seat sinks into the ground (flesh and clothes give a little,
# and it hides the gap a hard mesh would leave), the shape of the legs, and where the hands are
# put down (metres and degrees; +Y is behind the character, who faces -Y).
GROUND_SINK = 0.01
# Degrees each leg turns out from straight ahead. The legs already sit hip-width apart; turning
# them out further tears scanned meshes whose shoes or hems touch in the rest pose (see cut_webs).
LEG_SPLAY = 0
KNEE_BEND = 24         # degrees the shin drops below the thigh
FOOT_DIRECTION = (0.35, -0.45, 0.8)   # toes up and falling outwards (left foot; mirrored for the right)
HAND_OUT = 0.07        # outside the shoulder
HAND_BACK = (0.06, 0.2)   # least and most the wrist goes behind the shoulder
ARM_STRETCH = 0.97     # shoulder to wrist, as a share of the arm's length (elbow nearly straight)
WRIST_HEIGHT = 0.045   # the wrist sits above the ground by the thickness of the hand


def stretch_legs(rig, lift):
    """Point the legs forward (-Y), the thighs `lift` degrees above level, the shins KNEE_BEND
    lower. Aimed rather than turned, so characters whose rest legs lean differently match."""
    for side, sign in (("L", 1), ("R", -1)):     # the character's left is +X
        for bone, elevation in ((f"thigh.{side}", lift), (f"shin.{side}", lift - KNEE_BEND)):
            e, s = math.radians(elevation), math.radians(LEG_SPLAY)
            direction = Vector((sign * math.sin(s) * math.cos(e), -math.cos(s) * math.cos(e), math.sin(e)))
            aim(rig, bone, rig.pose.bones[bone].head + direction)
        x, y, z = FOOT_DIRECTION
        aim(rig, f"foot.{side}", rig.pose.bones[f"foot.{side}"].head + Vector((sign * x, y, z)))


def cut_webs(person, below=0.45, stretch=3.0):
    """Cut the faces below `below` metres (rest pose; the knees are at about 0.47) that the pose
    has stretched to more than `stretch` times their rest size. Scanned meshes fuse where the
    shoes or trouser hems touch in the rest pose, and spreading the legs pulls those faces into a
    web between them; faces that merely bend with the body stretch far less."""
    posed = deformed_points(person)      # the armature keeps the vertex order
    bm = bmesh.new()
    bm.from_mesh(person.data)
    doomed = []
    for f in bm.faces:
        if max(v.co.z for v in f.verts) >= below:
            continue
        for e in f.edges:
            a, b = (v.index for v in e.verts)
            rest = e.calc_length()
            if np.linalg.norm(posed[a] - posed[b]) > stretch * rest + 0.01:
                doomed.append(f)
                break
    bmesh.ops.delete(bm, geom=doomed, context="FACES_ONLY")
    bm.to_mesh(person.data)
    bm.free()
    person.data.update()
    return len(doomed)


def sit_on_ground(rig, person):
    """Pose the character with POSES["sitting_ground"], rest its seat on the ground (z = 0) with
    the hip joints over the origin, lift the knees just enough for the heels to touch the ground,
    and prop it up on its hands behind the hips. A character whose arms are too short to reach
    the ground leans back further, from the pelvis, until they do."""
    rest_location = rig.location.copy()
    for extra_lean in range(0, 31, 2):
        rig.location = rest_location
        apply_pose(rig, POSES["sitting_ground"] + [("hips", "x", -extra_lean)])
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode="POSE")
        heels = rest_on_ground(rig, person)
        hands = [hand_on_ground(rig, side, sign) for side, sign in (("L", 1), ("R", -1))]
        if all(hands):
            break
        bpy.ops.object.mode_set(mode="OBJECT")
    print(f"leaned back {extra_lean} degrees more; thighs lifted {heels[0]:.1f} degrees, heels at {heels[1]:+.3f} m")
    for (side, sign), (wrist, grip) in zip((("L", 1), ("R", -1)), hands):
        # the elbow points backwards and outwards
        miss = reach(rig, side, wrist, grip, (sign * 0.5, 1.0, 0.0))
        print(f"hand.{side}: wrist {tuple(round(v, 3) for v in wrist)}, misses by {miss:.3f} m")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    print(f"cut {cut_webs(person)} faces stretched between the legs")


def rest_on_ground(rig, person):
    """Stretch the legs out, set the seat on the ground with the hip joints over the origin, and
    lift the knees until the heels touch the ground. Returns (lift, heel height)."""
    stretch_legs(rig, 0.0)
    hips = (rig.matrix_world @ rig.pose.bones["thigh.L"].head + rig.matrix_world @ rig.pose.bones["thigh.R"].head) / 2
    # The seat is the lowest part of the body near the hip joints (between the arms).
    pts = deformed_points(person)
    seat = pts[(np.abs(pts[:, 0] - hips.x) < 0.22) & (np.abs(pts[:, 1] - hips.y) < 0.2)]
    rig.location -= Vector((hips.x, hips.y, float(seat[:, 2].min()) + GROUND_SINK))
    bpy.context.view_layer.update()
    # Lifting the thighs raises the heels; bisect for the lift that sets them on the ground.
    low, high = -15.0, 40.0
    for _ in range(12):
        lift = (low + high) / 2
        stretch_legs(rig, lift)
        pts = deformed_points(person)
        heels = float(pts[pts[:, 1] < -0.55][:, 2].min())
        low, high = (lift, high) if heels < 0.0 else (low, lift)
    return lift, heels


def hand_on_ground(rig, side, sign):
    """Where the wrist and the fingers go on the ground behind the shoulder (world space), or
    None if the arm can't reach HAND_BACK[0] behind it. The hand goes as far back as the arm
    reaches with the elbow just short of straight, up to HAND_BACK[1]; closer, the elbow bends."""
    upper = rig.pose.bones[f"upper_arm.{side}"]
    shoulder = rig.matrix_world @ upper.head
    reach_len = ARM_STRETCH * (upper.length + rig.pose.bones[f"forearm.{side}"].length)
    across, down = sign * HAND_OUT, shoulder.z - WRIST_HEIGHT
    back_sq = reach_len ** 2 - across ** 2 - down ** 2
    if back_sq < HAND_BACK[0] ** 2:
        return None
    wrist = Vector((shoulder.x + across, shoulder.y + min(math.sqrt(back_sq), HAND_BACK[1]), WRIST_HEIGHT))
    # fingers point backwards and a little outwards, flat on the ground
    return wrist, wrist + Vector((sign * 0.04, 0.10, -0.015))


def render_views(out_dir, centre=(0, 0, 0.8), scale=1.8, ground=False):
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
    if ground:
        # a thin dark slab just under z = 0 shows anything sinking into the ground
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.001))
        slab = bpy.context.object
        slab.name = "check_ground"
        slab.scale = (3.0, 3.0, 0.002)
        mat = bpy.data.materials.new("check_ground")
        mat.diffuse_color = (0.15, 0.3, 0.15, 1)
        if mat.node_tree is not None:
            next(nd for nd in mat.node_tree.nodes if nd.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.15, 0.3, 0.15, 1)
        slab.data.materials.append(mat)
    cam = bpy.data.objects.new("check_cam", bpy.data.cameras.new("check_cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    scene.collection.objects.link(cam)
    scene.camera = cam
    centre = Vector(centre)
    views = {
        "front": (Vector((0, -10, 0)), (math.radians(90), 0, 0)),
        "side": (Vector((10, 0, 0)), (math.radians(90), 0, math.radians(90))),
        "back": (Vector((0, 10, 0)), (math.radians(90), 0, math.radians(180))),
        "top": (Vector((0, 0, 10)), (0, 0, 0)),
        "three_quarter": (Vector((-7, -7, 3)).normalized() * 10,
                          Vector((7, 7, -3)).to_track_quat("-Z", "Y").to_euler()),
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
    if pose == "sitting_ground":
        sit_on_ground(bpy.data.objects["rig"], bpy.data.objects["person"])
    else:
        apply_pose(bpy.data.objects["rig"], POSES[pose])
    bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
    print("saved", out_blend)
    if len(argv) > 3:
        if pose == "sitting_ground":
            render_views(argv[3], centre=(0, -0.1, 0.4), scale=1.9, ground=True)   # low and long, on the ground
        else:
            render_views(argv[3])
