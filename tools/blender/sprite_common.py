"""Shared parts of the sprite renders: the game camera, the scene, frame fitting and sheet packing.

Every sprite is rendered with the same view as the game (same camera height, vertical field of
view and a level gaze), so a frame drawn at its reference position lines up with the road.
Camera shift crops the view to the part that holds the vehicle.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

# Must match src/game/camera.ts.
CAMERA_HEIGHT = 2.0       # metres above the road
VFOV_DEG = 60.0
REFERENCE_SCREEN_HEIGHT = 1440   # a frame is 1:1 on a screen this many pixels tall

MAX_SHEET_WIDTH = 8192    # widest texture every desktop GPU accepts
FRAME_MARGIN = 12         # pixels kept clear around the vehicle in every frame

FOCAL_PX = (REFERENCE_SCREEN_HEIGHT / 2) / math.tan(math.radians(VFOV_DEG) / 2)


def fit_frame(scene, attitudes, distance):
    """Project every mesh in the scene for each (yaw, pitch) with the game camera `distance`
    metres behind the origin, and return the frame (width, height, top edge below the principal
    point) that holds all of them."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.evaluated_get(depsgraph).to_mesh()
        co = np.empty(len(mesh.vertices) * 3, np.float32)
        mesh.vertices.foreach_get("co", co)
        obj.evaluated_get(depsgraph).to_mesh_clear()
        co = co.reshape(-1, 3)[::7]
        m = np.array(obj.matrix_world)
        points.append(co @ m[:3, :3].T + m[:3, 3])
    points = np.concatenate(points)
    half_w, top, bottom = 0.0, 1e9, -1e9
    for yaw, pitch in attitudes:
        a, b = math.radians(-pitch), math.radians(-yaw)
        rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
        rz = np.array([[math.cos(b), -math.sin(b), 0], [math.sin(b), math.cos(b), 0], [0, 0, 1]])
        p = points @ (rx @ rz).T
        depth = distance - p[:, 1]
        sx = FOCAL_PX * p[:, 0] / depth
        sy = FOCAL_PX * (CAMERA_HEIGHT - p[:, 2]) / depth    # pixels below the principal point
        half_w = max(half_w, float(np.abs(sx).max()))
        top, bottom = min(top, float(sy.min())), max(bottom, float(sy.max()))

    def up16(v):
        return int(math.ceil(v / 16) * 16)

    frame_w = up16(2 * (half_w + FRAME_MARGIN))
    frame_top = int(math.floor(top - FRAME_MARGIN))
    frame_h = up16(bottom + FRAME_MARGIN - frame_top)
    return frame_w, frame_h, frame_top


def setup_scene(scene, frame_w, frame_h, frame_top, distance):
    """Render settings, sky light, sun and the game camera cropped to the frame."""
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = frame_w
    scene.render.resolution_y = frame_h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("sprite_world")
    if world.node_tree is None:
        world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.74, 0.95, 1)
    bg.inputs[1].default_value = 1.1
    scene.world = world

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
    cam_data.lens = FOCAL_PX * 36.0 / larger
    cam_data.shift_x = 0.0
    cam_data.shift_y = -(frame_top + frame_h / 2) / larger
    cam_data.clip_start = 0.1
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0.0, distance, CAMERA_HEIGHT)
    cam.rotation_euler = (math.radians(90), 0.0, math.radians(180))   # level, looking along -Y
    scene.collection.objects.link(cam)
    scene.camera = cam


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
