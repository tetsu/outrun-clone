"""Shared parts of the sprite renders: the game camera, the scene, frame fitting and sheet packing.

Every sprite is rendered with the same view as the game (same camera height, vertical field of
view and a level gaze), so a frame drawn at its reference position lines up with the road.
Camera shift crops the view to the part that holds the vehicle.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

# Must match src/game/camera.ts.
CAMERA_HEIGHT = 2.0       # metres above the road
VFOV_DEG = 60.0
REFERENCE_SCREEN_HEIGHT = 1440   # a frame is 1:1 on a screen this many pixels tall

MAX_SHEET_WIDTH = 8192    # widest texture every desktop GPU accepts
FRAME_MARGIN = 12         # pixels kept clear around the vehicle in every frame



def focal_px(reference_height=REFERENCE_SCREEN_HEIGHT):
    """The camera's focal length in pixels for frames drawn 1:1 on a screen `reference_height`
    pixels tall. A smaller reference height gives proportionally smaller frames (less texture
    memory); the game scales them up by the same ratio."""
    return (reference_height / 2) / math.tan(math.radians(VFOV_DEG) / 2)


FOCAL_PX = focal_px()

# The surroundings glossy paint reflects, from straight down (0) to straight up (1): dark road,
# a bright horizon, then blue sky deepening overhead. The sharp horizon is what makes paint read
# as glossy: it draws a clean line along every curve of the body.
SKY = [
    (0.0, (0.02, 0.02, 0.022)),
    (0.495, (0.06, 0.06, 0.06)),
    (0.5, (1.6, 1.55, 1.45)),
    (0.53, (0.9, 0.95, 1.05)),
    (0.7, (0.35, 0.5, 0.9)),
    (1.0, (0.12, 0.22, 0.6)),
]
SKY_STRENGTH = 1.1


def mesh_points(scene, objects=None):
    """World positions of a sample of the vertices of `objects` (default: every mesh in the scene),
    as deformed by their modifiers (so posed characters count as posed)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects if objects is None else objects:
        if obj.type != "MESH":
            continue
        mesh = obj.evaluated_get(depsgraph).to_mesh()
        co = np.empty(len(mesh.vertices) * 3, np.float32)
        mesh.vertices.foreach_get("co", co)
        obj.evaluated_get(depsgraph).to_mesh_clear()
        co = co.reshape(-1, 3)[::7]
        m = np.array(obj.matrix_world)
        points.append(co @ m[:3, :3].T + m[:3, 3])
    return np.concatenate(points)


def project_extent(points, attitudes, distance, reference_height=REFERENCE_SCREEN_HEIGHT, roll_pivot_height=0.0):
    """Project `points` for each attitude with the game camera `distance` metres behind the
    origin. Returns (half width, top, bottom) in pixels, top and bottom measured downwards from
    the principal point.

    An attitude is (yaw, pitch) or (yaw, pitch, roll), in degrees, with the turns nested as
    add_turntable and add_roll build them: pitch wraps yaw, which wraps a roll about the
    vehicle's own long axis through a pivot `roll_pivot_height` metres above the origin."""
    focal = focal_px(reference_height)
    pivot = np.array([0.0, 0.0, roll_pivot_height])
    half_w, top, bottom = 0.0, 1e9, -1e9
    for attitude in attitudes:
        yaw, pitch = attitude[:2]
        roll = attitude[2] if len(attitude) > 2 else 0
        q = points
        if roll:
            c = math.radians(-roll)     # as set_roll: the top goes to the right of the screen
            ry = np.array([[math.cos(c), 0, math.sin(c)], [0, 1, 0], [-math.sin(c), 0, math.cos(c)]])
            q = (points - pivot) @ ry.T + pivot
        a, b = math.radians(-pitch), math.radians(-yaw)
        rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
        rz = np.array([[math.cos(b), -math.sin(b), 0], [math.sin(b), math.cos(b), 0], [0, 0, 1]])
        p = q @ (rx @ rz).T
        depth = distance - p[:, 1]
        sx = focal * p[:, 0] / depth
        sy = focal * (CAMERA_HEIGHT - p[:, 2]) / depth    # pixels below the principal point
        half_w = max(half_w, float(np.abs(sx).max()))
        top, bottom = min(top, float(sy.min())), max(bottom, float(sy.max()))
    return half_w, top, bottom


def frame_from_extent(half_w, top, bottom):
    """The frame (width, height, top edge below the principal point) around a projected extent,
    with FRAME_MARGIN to spare and sizes rounded up to multiples of 16. The principal point is
    centred horizontally."""
    def up16(v):
        return int(math.ceil(v / 16) * 16)

    frame_w = up16(2 * (half_w + FRAME_MARGIN))
    frame_top = int(math.floor(top - FRAME_MARGIN))
    frame_h = up16(bottom + FRAME_MARGIN - frame_top)
    return frame_w, frame_h, frame_top


def union_extent(*extents):
    """The extent that holds all the given (half width, top, bottom) extents."""
    return (max(e[0] for e in extents), min(e[1] for e in extents), max(e[2] for e in extents))


def fit_frame(scene, attitudes, distance, reference_height=REFERENCE_SCREEN_HEIGHT, objects=None,
              roll_pivot_height=0.0):
    """Project the meshes (`objects`, default every mesh in the scene) for each attitude (see
    project_extent) with the game camera `distance` metres behind the origin, and return the
    frame (width, height, top edge below the principal point) that holds all of them."""
    points = mesh_points(scene, objects)
    return frame_from_extent(*project_extent(points, attitudes, distance, reference_height, roll_pivot_height))


def setup_scene(scene, frame_w, frame_h, frame_top, distance, reference_height=REFERENCE_SCREEN_HEIGHT):
    """Render settings, sky light, sun and the game camera cropped to the frame. Frames are 1:1 on
    a screen `reference_height` pixels tall (use the same value as for fit_frame)."""
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = frame_w
    scene.render.resolution_y = frame_h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    scene.world = sky_world()

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new("sun", sun_data)
    # Light from high up, behind the camera and a little to the left, so the rear of the vehicle is lit.
    sun.rotation_euler = (-Vector((0.35, 0.55, 1.0))).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("cam")
    # Blender measures lens and shift against the larger side of the frame; fit the sensor to it.
    horizontal = frame_w >= frame_h
    cam_data.sensor_fit = "HORIZONTAL" if horizontal else "VERTICAL"
    cam_data.sensor_width = cam_data.sensor_height = 36.0
    larger = frame_w if horizontal else frame_h
    cam_data.lens = focal_px(reference_height) * 36.0 / larger
    cam_data.shift_x = 0.0
    cam_data.shift_y = -(frame_top + frame_h / 2) / larger
    cam_data.clip_start = 0.1
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0.0, distance, CAMERA_HEIGHT)
    cam.rotation_euler = (math.radians(90), 0.0, math.radians(180))   # level, looking along -Y
    scene.collection.objects.link(cam)
    scene.camera = cam


def sky_world():
    """A world lit and reflected by SKY, by the height of the view direction."""
    world = bpy.data.worlds.new("sprite_world")
    if world.node_tree is None:
        world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    xyz = nodes.new("ShaderNodeSeparateXYZ")
    height = nodes.new("ShaderNodeMapRange")          # z of the direction, -1..1 -> 0..1
    height.inputs["From Min"].default_value = -1.0
    ramp = nodes.new("ShaderNodeValToRGB")
    stops = ramp.color_ramp.elements
    stops[0].position, stops[0].color = SKY[0][0], (*SKY[0][1], 1)
    stops[1].position, stops[1].color = SKY[-1][0], (*SKY[-1][1], 1)
    for position, color in SKY[1:-1]:
        stops.new(position).color = (*color, 1)
    background = nodes["Background"]
    background.inputs["Strength"].default_value = SKY_STRENGTH
    links.new(coords.outputs["Generated"], xyz.inputs[0])
    links.new(xyz.outputs["Z"], height.inputs[0])
    links.new(height.outputs[0], ramp.inputs[0])
    links.new(ramp.outputs[0], background.inputs["Color"])
    return world


def clear_coat(material, saturation=(0.35, 0.6), coat_roughness=0.03, paint_roughness=0.25):
    """Give the painted parts of a baked-texture material a glossy clear coat.

    Paint is told apart from trim, tyres, glass and lights by the saturation of its base colour,
    which fades the coat in between the two `saturation` values. Under the coat the paint gets
    smoother and loses any metallic value, which scanned textures often get wrong."""
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(nd for nd in nodes if nd.type == "BSDF_PRINCIPLED")
    base = bsdf.inputs["Base Color"].links[0].from_socket
    hsv = nodes.new("ShaderNodeSeparateColor")
    hsv.mode = "HSV"
    paint = nodes.new("ShaderNodeMapRange")
    paint.inputs["From Min"].default_value, paint.inputs["From Max"].default_value = saturation
    links.new(base, hsv.inputs[0])
    links.new(hsv.outputs[1], paint.inputs[0])    # the second channel is saturation in HSV mode
    links.new(paint.outputs[0], bsdf.inputs["Coat Weight"])
    bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    for name, painted in (("Roughness", paint_roughness), ("Metallic", 0.0)):
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "FLOAT"
        socket = bsdf.inputs[name]
        if socket.is_linked:
            links.new(socket.links[0].from_socket, mix.inputs["A"])
        else:
            mix.inputs["A"].default_value = socket.default_value
        mix.inputs["B"].default_value = painted
        links.new(paint.outputs[0], mix.inputs["Factor"])
        links.new(mix.outputs["Result"], socket)


def add_turntable(scene, riders):
    """Parent `riders` to a yaw pivot inside a pitch pivot, both on the road under the origin.
    Pitch (about the X axis of the world) wraps yaw (about Z)."""
    pitch_root = bpy.data.objects.new("pitch_root", None)
    yaw_root = bpy.data.objects.new("yaw_root", None)
    scene.collection.objects.link(pitch_root)
    scene.collection.objects.link(yaw_root)
    yaw_root.parent = pitch_root
    for obj in riders:
        obj.parent = yaw_root
    return pitch_root, yaw_root


def set_attitude(pitch_root, yaw_root, yaw, pitch):
    """The vehicle faces -Y and the camera sits on +Y: nose-right is a negative turn about Z,
    nose-up is a negative turn about X."""
    yaw_root.rotation_euler = (0.0, 0.0, math.radians(-yaw))
    pitch_root.rotation_euler = (math.radians(-pitch), 0.0, 0.0)
    bpy.context.view_layer.update()


def add_roll(scene, yaw_root, riders, pivot_height):
    """Put a roll pivot inside `yaw_root`, on the vehicle's long axis `pivot_height` metres above
    the road, and move `riders` onto it without moving them."""
    roll_root = bpy.data.objects.new("roll_root", None)
    scene.collection.objects.link(roll_root)
    roll_root.parent = yaw_root
    roll_root.location = (0.0, 0.0, pivot_height)
    for obj in riders:
        obj.parent = roll_root
        # the parent's offset is undone, so the rider stays where it was modelled
        obj.matrix_parent_inverse = Matrix.Translation((0.0, 0.0, -pivot_height))
    bpy.context.view_layer.update()
    return roll_root


def set_roll(roll_root, roll):
    """The vehicle faces -Y, so its long axis is Y: a positive roll takes the top to the right of
    the screen (-X, clockwise as seen by the camera behind), a negative turn about Y."""
    roll_root.rotation_euler = (0.0, math.radians(-roll), 0.0)
    bpy.context.view_layer.update()


def pack_sheet(frame_paths, frame_w, frame_h, columns, out_png):
    """Pack the frames row by row into one image. Returns the sheet size and the frames whose
    picture touches an edge (cut off)."""
    rows = math.ceil(len(frame_paths) / columns)
    sheet_w, sheet_h = columns * frame_w, rows * frame_h
    sheet = np.zeros((sheet_h, sheet_w, 4), np.float32)
    clipped = []
    for i, path in enumerate(frame_paths):
        img = bpy.data.images.load(path)
        px = np.empty(frame_w * frame_h * 4, np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        px = px.reshape(frame_h, frame_w, 4)
        alpha = px[:, :, 3]
        edges = {"bottom": alpha[0], "top": alpha[-1], "left": alpha[:, 0], "right": alpha[:, -1]}
        touching = [name for name, edge in edges.items() if edge.max() > 0.02]
        if touching:
            clipped.append(f"{os.path.basename(path)}: {', '.join(touching)}")
        col, row = i % columns, i // columns
        y0 = sheet_h - (row + 1) * frame_h          # image rows are stored bottom-up
        sheet[y0:y0 + frame_h, col * frame_w:(col + 1) * frame_w] = px

    out_img = bpy.data.images.new("sheet", sheet_w, sheet_h, alpha=True)
    out_img.pixels.foreach_set(sheet.reshape(-1))
    out_img.filepath_raw = out_png
    out_img.file_format = "PNG"
    out_img.save()
    return (sheet_w, sheet_h), clipped
