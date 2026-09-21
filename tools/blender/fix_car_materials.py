"""Fix up the materials of the prepared stand-in car model.

Tripo delivers one mesh with one baked texture, so parts are picked by face position,
face normal and the texture colour under each face, then given their own material:

  glass      windshield becomes tinted, see-through glass
  black      wheel-arch liners, front upper grille, wheel centre caps

The maker's badge and lettering on the rear panel are removed differently: the relief is
flattened onto the surrounding panel and the faces are re-pointed at a clean spot of the
baked texture, so they keep the original paint material.

The faces are about 4 mm across, so per-face assignment is fine enough for all of this.

Usage:
  blender --background --factory-startup --python tools/blender/fix_car_materials.py -- <in.blend> <out.blend>
"""
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
in_blend, out_blend = argv[0], argv[1]

bpy.ops.wm.open_mainfile(filepath=in_blend)
car = bpy.data.objects["car"]
me = car.data
n = len(me.polygons)

# ---------------------------------------------------------------- per-face data
centers = np.empty(n * 3, np.float32)
me.polygons.foreach_get("center", centers)
centers = centers.reshape(n, 3)
normals = np.empty(n * 3, np.float32)
me.polygons.foreach_get("normal", normals)
normals = normals.reshape(n, 3)
loop_start = np.empty(n, np.int32)
me.polygons.foreach_get("loop_start", loop_start)
loop_total = np.empty(n, np.int32)
me.polygons.foreach_get("loop_total", loop_total)

n_loops = len(me.loops)
uv = np.empty(n_loops * 2, np.float32)
uv_layer = me.uv_layers.active
try:
    uv_layer.uv.foreach_get("vector", uv)
except AttributeError:
    uv_layer.data.foreach_get("uv", uv)
uv = uv.reshape(n_loops, 2)
face_uv = np.add.reduceat(uv, loop_start, axis=0) / loop_total[:, None]

image = next(im for im in bpy.data.images if "basecolor" in im.name.lower())
w, h = image.size
pixels = np.empty(w * h * 4, np.float32)
image.pixels.foreach_get(pixels)
pixels = pixels.reshape(h, w, 4)
col = np.clip((face_uv[:, 0] % 1.0) * w, 0, w - 1).astype(np.int32)
row = np.clip((face_uv[:, 1] % 1.0) * h, 0, h - 1).astype(np.int32)
rgb = pixels[row, col, :3]
del pixels

val = rgb.max(axis=1)
sat = (val - rgb.min(axis=1)) / np.maximum(val, 1e-6)
is_red = (sat > 0.45) & (rgb[:, 0] > rgb[:, 1] * 1.6) & (rgb[:, 0] > rgb[:, 2] * 1.6)
x, y, z = centers[:, 0], centers[:, 1], centers[:, 2]
print(f"faces={n} red={int(is_red.sum())}")


def dilate(mask, r):
    out = mask.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return out


def erode(mask, r):
    return ~dilate(~mask, r)


# ---------------------------------------------------------------- windshield glass
# The windshield is close to a tilted sheet, bowed across the car: y = c0 + c1*z + c2*x^2.
glass_normal = np.array([0.0, -0.483, 0.876], np.float32)
facing = np.abs(normals @ glass_normal)
region = (y > -1.45) & (y < 0.0) & (z > 0.95) & (np.abs(x) < 0.95)


def sheet_terms(px, pz):
    return np.stack([np.ones(len(px)), pz, px ** 2, pz ** 2, px ** 2 * pz, px ** 4], axis=1)


cand = region & (facing > 0.9) & (sat < 0.3)
coef = None
for tol in (0.2, 0.1, 0.06, 0.04, 0.03):
    coef, *_ = np.linalg.lstsq(sheet_terms(x[cand], z[cand]), y[cand], rcond=None)
    resid = np.abs(y - sheet_terms(x, z) @ coef)
    cand = region & (facing > 0.9) & (sat < 0.3) & (resid < tol)
print("windshield fit coefficients", np.round(coef, 3), "inliers", int(cand.sum()))

resid = np.abs(y - sheet_terms(x, z) @ coef)
slab = region & (facing > 0.6) & (resid < 0.03)

# 1 cm grid over (x, z); the glass is the area the non-black, non-red slab faces enclose.
cell = 0.01
gx = np.clip(((x + 1.0) / cell).astype(np.int32), 0, 199)
gz = np.clip(((z - 0.9) / cell).astype(np.int32), 0, 69)
seed = slab & (val > 0.15) & ~is_red
grid = np.zeros((70, 200), bool)
grid[gz[seed], gx[seed]] = True
grid = erode(dilate(grid, 6), 6)   # close the holes left by dark blotches in the baked texture
grid = dilate(erode(grid, 4), 4)   # drop specks and thin spikes that reach into the frame
grid = erode(grid, 1)              # keep a clean margin to the frame
deep = erode(grid, 4)              # well inside the pane: take every face near the sheet
is_glass = ((slab & grid[gz, gx]) | (region & (resid < 0.045) & deep[gz, gx])) & ~is_red
print(f"glass faces={int(is_glass.sum())} z-range={z[is_glass].min():.2f}..{z[is_glass].max():.2f} "
      f"x-range={x[is_glass].min():.2f}..{x[is_glass].max():.2f}")

# ---------------------------------------------------------------- black parts
is_black = np.zeros(n, bool)
wheel_z = 0.30
for wheel_y in (-1.3625, 1.3625):
    r = np.sqrt((y - wheel_y) ** 2 + (z - wheel_z) ** 2)
    # arch liners: the pale ring between tyre and body, and everything pale behind it
    is_black |= (r > 0.325) & (r < 0.50) & ~is_red & (val > 0.18) & (z < 0.82)
    is_black |= (r >= 0.50) & (r < 0.55) & (sat < 0.2) & (val > 0.3) & (z < 0.6)
    # centre caps carry a tiny maker's logo
    is_black |= (r < 0.05) & (np.abs(x) > 0.75)
# front upper grille: badge in the middle, plus the garbled chrome around it
front = y < -1.85
is_black |= front & (np.abs(x) < 0.13) & (z > 0.56) & (z < 0.712)
is_black |= front & (np.abs(x) < 0.40) & (z > 0.575) & (z < 0.72) & ~is_red
is_black |= front & (x > 0.22) & (x < 0.38) & (z > 0.57) & (z < 0.68)   # small red badge in the grille
print(f"black faces={int(is_black.sum())}")

# ---------------------------------------------------------------- rear badge and lettering
# Each box is flattened onto the surrounding panel and re-pointed at a clean spot of the
# baked texture, so it keeps the original paint material and matches its surroundings.
n_verts = len(me.vertices)
co = np.empty(n_verts * 3, np.float32)
me.vertices.foreach_get("co", co)
co = co.reshape(n_verts, 3)
rear_boxes = [(-0.15, 0.15, 0.79, 1.01), (0.39, 0.64, 0.74, 0.84), (-0.61, -0.39, 0.75, 0.85)]


def panel_terms(px, pz):
    return np.stack([np.ones(len(px)), px, pz, px ** 2, pz ** 2, px * pz], axis=1)


outward = normals[:, 1] > 0.6   # the outer skin faces the rear; the shell's inner side does not
for x0, x1, z0, z1 in rear_boxes:
    inside = (y > 1.85) & (x > x0) & (x < x1) & (z > z0) & (z < z1)
    m = 0.05
    ring = ((y > 1.85) & (x > x0 - m) & (x < x1 + m) & (z > z0 - m) & (z < z1 + m)
            & ~inside & is_red & outward)
    fit, *_ = np.linalg.lstsq(panel_terms(x[ring], z[ring]), y[ring], rcond=None)

    # Pull the relief onto the fitted panel, fully in the middle and fading to nothing at the
    # box edges, so no step appears where the box ends.
    vin = (co[:, 1] > 1.85) & (co[:, 0] > x0) & (co[:, 0] < x1) & (co[:, 2] > z0) & (co[:, 2] < z1)
    vx, vy, vz = co[vin, 0], co[vin, 1], co[vin, 2]
    target_y = panel_terms(vx, vz) @ fit
    edge = np.minimum(np.minimum(vx - x0, x1 - vx) / 0.05, np.minimum(vz - z0, z1 - vz) / 0.025)
    t = np.clip(edge, 0.0, 1.0)
    weight = t * t * (3 - 2 * t)
    skin = np.abs(vy - target_y) < 0.04
    idx = np.flatnonzero(vin)[skin]
    co[idx, 1] = (vy + weight * (target_y - vy))[skin]

    # The baked paint gets lighter towards the top of the panel. Repaint each face with the
    # colour found at the same height just left and right of the box, in 5 mm bands.
    sides = ring & (z > z0) & (z < z1)
    n_bins = int(np.ceil((z1 - z0) / 0.005))
    side_idx = np.flatnonzero(sides)
    side_bin = np.clip(((z[side_idx] - z0) / 0.005).astype(np.int32), 0, n_bins - 1)
    ref_uv = np.full((n_bins, 2), np.nan, np.float32)
    # Bands that only see trim or a crease shadow come out dark; leave them empty so they
    # take the colour of the nearest good band instead.
    darkest_ok = 0.8 * np.median(val[side_idx])
    for b in np.unique(side_bin):
        members = side_idx[side_bin == b]
        median = np.median(rgb[members], axis=0)
        if median.max() < darkest_ok:
            continue
        ref_uv[b] = face_uv[members[np.argmin(np.abs(rgb[members] - median).sum(axis=1))]]
    filled = np.flatnonzero(~np.isnan(ref_uv[:, 0]))
    nearest = filled[np.argmin(np.abs(np.arange(n_bins)[:, None] - filled[None, :]), axis=1)]
    ref_uv = ref_uv[nearest]

    on_skin = inside & (np.abs(y - panel_terms(x, z) @ fit) < 0.04)
    skin_idx = np.flatnonzero(on_skin)
    skin_bin = np.clip(((z[skin_idx] - z0) / 0.005).astype(np.int32), 0, n_bins - 1)
    for f, b in zip(skin_idx, skin_bin):
        uv[loop_start[f]:loop_start[f] + loop_total[f]] = ref_uv[b]
    print(f"rear box x={x0}..{x1}: flattened {len(idx)} verts, repainted {len(skin_idx)} faces "
          f"from {len(filled)}/{n_bins} height bands")

me.vertices.foreach_set("co", co.reshape(-1))
# The glTF importer stores the file's normals as custom normals. They still describe the old
# relief, so drop them and let Blender compute smooth normals from the edited geometry.
if "custom_normal" in me.attributes:
    me.attributes.remove(me.attributes["custom_normal"])
me.polygons.foreach_set("use_smooth", np.ones(n, bool))
try:
    uv_layer.uv.foreach_set("vector", uv.reshape(-1))
except AttributeError:
    uv_layer.data.foreach_set("uv", uv.reshape(-1))


# ---------------------------------------------------------------- materials
def make_material(name, color, roughness, alpha=1.0, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(nd for nd in mat.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        mat.surface_render_method = "BLENDED"
    return mat


me.materials.append(make_material("glass", (0.02, 0.05, 0.07), 0.05, alpha=0.22))
me.materials.append(make_material("black", (0.012, 0.012, 0.014), 0.6))

index = np.zeros(n, np.int32)
index[is_black] = 2
index[is_glass] = 1
me.polygons.foreach_set("material_index", index)
me.update()

bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
print("saved", out_blend)
