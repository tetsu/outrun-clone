"""Smooth the relief of badges and lettering out of the car's rear panel.

Each box is pulled onto the panel as it runs on either side of the box: the panel's height
profile (its creases and lips) is measured in thin horizontal bands just left and right of the
box, and its sideways curve is fitted across all the bands. So a crease that runs across the
car carries straight on through the box, and a glossy finish reflects it without a seam.

Used by fix_car_materials.py. Run on its own, it re-flattens an already prepared car (the
panel either side of the boxes is never moved, so running it again changes nothing):

  blender --background --factory-startup --python tools/blender/rear_panel.py -- <in.blend> <out.blend>
"""
import sys

import numpy as np

# (x0, x1, z0, z1) in metres, on the rear panel (y > REAR_Y)
REAR_BOXES = [(-0.15, 0.15, 0.79, 1.01), (0.39, 0.64, 0.74, 0.84), (-0.61, -0.39, 0.75, 0.85)]
REAR_Y = 1.85
SIDE = 0.05       # width of the panel measured either side of a box
BAND = 0.0025     # height of a profile band
RELIEF = 0.04     # deepest relief that is flattened; anything further off is another surface


def panel_target(co, vnormals, box):
    """The points inside the box (indices into `co`), and the panel's depth (y) and outward
    normal at each of them."""
    x0, x1, z0, z1 = box
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    outer = (y > REAR_Y) & (vnormals[:, 1] > 0.3)       # the outer skin, not the shell's inside
    in_z = (z > z0) & (z < z1)
    sides = outer & in_z & (((x > x0 - SIDE) & (x < x0)) | ((x > x1) & (x < x1 + SIDE)))
    inside = (y > REAR_Y) & in_z & (x > x0) & (x < x1)

    n_bands = int(np.ceil((z1 - z0) / BAND))

    def band(zz):
        return np.clip(((zz - z0) / BAND).astype(np.int32), 0, n_bands - 1)

    # y = profile[band] + b*x + c*x^2, fitted on the sides; bands without samples are dropped.
    sb = band(z[sides])
    used = np.unique(sb)
    column = {b: i for i, b in enumerate(used)}
    sx = x[sides]
    terms = np.zeros((len(sx), len(used) + 2))
    terms[np.arange(len(sx)), [column[b] for b in sb]] = 1.0
    terms[:, -2], terms[:, -1] = sx, sx * sx
    fit, *_ = np.linalg.lstsq(terms, y[sides], rcond=None)
    profile = np.interp(np.arange(n_bands), used, fit[:len(used)])
    smooth = np.convolve(np.pad(profile, 3, mode="edge"), np.ones(7) / 7, mode="valid")
    slope = np.gradient(smooth, BAND)                  # dy/dz of the profile

    ix = inside.nonzero()[0]
    bx = band(z[ix])
    target = profile[bx] + fit[-2] * x[ix] + fit[-1] * x[ix] ** 2
    # The panel is y = profile(z) + b x + c x^2 and faces +y.
    normal = np.stack([-(fit[-2] + 2 * fit[-1] * x[ix]), np.ones(len(ix)), -slope[bx]], axis=1)
    normal /= np.linalg.norm(normal, axis=1, keepdims=True)
    return ix, target, normal


def flatten_rear_boxes(co, vnormals, boxes=REAR_BOXES):
    """Move the vertices of `co` (n x 3, edited in place) onto the panel inside every box,
    fully in the middle and fading to nothing at the box edges, so no step appears where the
    box ends.

    The flattened letters leave slivers of faces whose smoothed normals still trace the letters,
    which a glossy finish shows, so the moved vertices also get the panel's own normal, blended
    the same way. Returns the normals (n x 3) to set as custom normals, and the number of
    vertices moved per box."""
    moved = []
    out_normals = vnormals.copy()
    for box in boxes:
        x0, x1, z0, z1 = box
        ix, target, normal = panel_target(co, vnormals, box)
        vx, vy, vz = co[ix, 0], co[ix, 1], co[ix, 2]
        edge = np.minimum(np.minimum(vx - x0, x1 - vx) / 0.05, np.minimum(vz - z0, z1 - vz) / 0.025)
        t = np.clip(edge, 0.0, 1.0)
        weight = t * t * (3 - 2 * t)
        skin = np.abs(vy - target) < RELIEF
        co[ix[skin], 1] = (vy + weight * (target - vy))[skin]
        blended = weight[:, None] * normal + (1 - weight[:, None]) * vnormals[ix]
        out_normals[ix[skin]] = (blended / np.linalg.norm(blended, axis=1, keepdims=True))[skin]
        moved.append(int(skin.sum()))
    return out_normals, moved


def vertex_arrays(me):
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    vn = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("normal", vn)
    return co.reshape(n, 3), vn.reshape(n, 3)


if __name__ == "__main__":
    import bpy

    argv = sys.argv[sys.argv.index("--") + 1:]
    bpy.ops.wm.open_mainfile(filepath=argv[0])
    me = bpy.data.objects["car"].data
    co, vn = vertex_arrays(me)
    normals, moved = flatten_rear_boxes(co, vn)
    print("vertices moved per box:", moved)
    me.vertices.foreach_set("co", co.reshape(-1))
    me.normals_split_custom_set_from_vertices(normals)
    me.update()
    bpy.ops.wm.save_as_mainfile(filepath=argv[1], compress=True)
    print("saved", argv[1])
