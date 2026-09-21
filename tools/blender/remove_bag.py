"""Remove the shoulder bag from the rigged stand-in passenger (output of rig_person.py).

Generated characters are one fused surface, so the bag is found by position and colour rather
than as a separate part. The numbers fit this particular model (T-pose, 1.65 m, facing -Y, bag
on the right hip); another model needs its own.

  - bag body, and the strap where it hangs free: deleted
  - strap where it lies on the shoulder: repainted as skin (deleting it would leave a hole)

Usage:
  blender --background --factory-startup --python tools/blender/remove_bag.py -- <rigged.blend> <out.blend> [mark]
  With "mark", nothing is removed: the faces are coloured magenta (delete) and cyan (repaint) instead.
"""
import sys

import bpy
import numpy as np


def face_data(me):
    n = len(me.polygons)
    c = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("center", c)
    nrm = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("normal", nrm)
    ls = np.empty(n, np.int32)
    me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(n, np.int32)
    me.polygons.foreach_get("loop_total", lt)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    fuv = np.add.reduceat(uv, ls, axis=0) / lt[:, None]
    img = next(i for i in bpy.data.images if "basecolor" in i.name.lower())
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = px[np.clip((fuv[:, 1] % 1) * h, 0, h - 1).astype(int), np.clip((fuv[:, 0] % 1) * w, 0, w - 1).astype(int), :3]
    return c.reshape(n, 3), nrm.reshape(n, 3), rgb, uv, fuv, ls, lt


def select(me):
    c, nrm, rgb, *_ = face_data(me)
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    val = rgb.max(axis=1)
    sat = (val - rgb.min(axis=1)) / np.maximum(val, 1e-6)
    pale = (val > 0.35) & (sat < 0.25)
    metal = (val < 0.35) & (sat < 0.3)   # buckles and rivets

    # bag body: outside the torso's side, or (below the bust) beyond its front and back
    outside = (x < -0.128) | ((x < -0.10) & (np.abs(y) > 0.1) & (z < 1.18))
    inner = (x < -0.095) & (nrm[:, 0] > 0.3) & (z < 1.18)   # the side lying against the body
    bag = (z > 1.0) & (z < 1.2) & (outside | inner) & (pale | metal)
    # strap between bag and shoulder: its two bands run in front of and behind the armhole
    hanging = (x < -0.13) & (z >= 1.17) & (z < 1.36) & pale & (np.abs(y) > 0.052)
    # the strap's back band, where it runs down behind the armhole
    hanging |= (x < -0.1) & (y > 0.1) & (z > 1.0) & (z < 1.3) & pale
    # the back end of the bag, in shaded colours the tests above miss; nothing else of the
    # body reaches this far back at waist height (the hair ends higher up)
    hanging |= (x < -0.09) & (y > 0.12) & (z > 1.0) & (z < 1.12)
    on_shoulder = (x < -0.12) & (z >= 1.25) & (z < 1.45) & pale & ~hanging
    return bag | hanging, on_shoulder, c, rgb, val, sat


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:]
    in_blend, out_blend = argv[0], argv[1]
    mark = len(argv) > 2 and argv[2] == "mark"
    bpy.ops.wm.open_mainfile(filepath=in_blend)
    person = bpy.data.objects["person"]
    me = person.data
    delete, repaint, c, rgb, val, sat = select(me)
    print(f"delete {int(delete.sum())} faces, repaint {int(repaint.sum())} faces")

    if mark:
        for name, colour, sel in (("mark_delete", (1, 0, 1, 1), delete), ("mark_repaint", (0, 1, 1, 1), repaint)):
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            next(nd for nd in mat.node_tree.nodes if nd.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = colour
            me.materials.append(mat)
            idx = np.empty(len(me.polygons), np.int32)
            me.polygons.foreach_get("material_index", idx)
            idx[sel] = len(me.materials) - 1
            me.polygons.foreach_set("material_index", idx)
    else:
        _, _, _, uv, fuv, ls, lt = face_data(me)
        x, y, z = c[:, 0], c[:, 1], c[:, 2]
        keep = ~repaint & ~delete

        def reference(sel):
            """UV of the face whose colour is most typical of the selection."""
            median = np.median(rgb[sel], axis=0)
            return fuv[np.flatnonzero(sel)[np.argmin(np.abs(rgb[sel] - median).sum(axis=1))]].copy()

        skin_like = (sat > 0.25) & (sat < 0.6) & (val > 0.45) & keep
        shoulder_skin = reference(skin_like & (x < -0.1) & (x > -0.22) & (z > 1.3) & (z < 1.45))
        waist_skin = reference(skin_like & (np.abs(x) < 0.1) & (y < 0) & (z > 1.0) & (z < 1.06))
        top_white = reference((val > 0.6) & (sat < 0.15) & keep & (np.abs(x) < 0.1) & (y < 0) & (z > 1.08) & (z < 1.15))
        # hem of the top on this model, from the front view
        HEM_Z = 1.066

        # repaint: point the strap's UVs at a typical patch of shoulder skin
        for f in np.flatnonzero(repaint):
            uv[ls[f]:ls[f] + lt[f]] = shoulder_skin
        me.uv_layers.active.data.foreach_set("uv", uv.reshape(-1))

        bpy.context.view_layer.objects.active = person
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        me.polygons.foreach_set("select", delete)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.delete(type="FACE")
        # drop crumbs left floating where the bag was
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.mesh.select_loose()
        bpy.ops.mesh.delete(type="VERT")
        bpy.ops.object.mode_set(mode="OBJECT")
        print(f"after: {len(me.polygons)} faces")

        # small islands (strap stubs, rivets) that no longer touch the body
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(me)
        seen, small = set(), []
        for f in bm.faces:
            if f.index in seen:
                continue
            island, stack = [], [f]
            seen.add(f.index)
            while stack:
                g = stack.pop()
                island.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h.index not in seen:
                            seen.add(h.index)
                            stack.append(h)
            if len(island) < 400:
                small.extend(island)
        bmesh.ops.delete(bm, geom=small, context="FACES")
        print(f"removed {len(small)} faces in small islands; now {len(bm.faces)} faces")

        # The body was never modelled under the bag, so its removal leaves holes. Close each
        # hole in the bag region and paint the patch like its surroundings: the top above
        # its hem, skin below.
        # Only small holes are closed: a long boundary means leftovers far from the body, which
        # a fill would join to the torso with a flat sheet.
        boundary = {e for e in bm.edges if e.is_boundary
                    and all(v.co.x < -0.05 and 0.95 < v.co.z < 1.46 for v in e.verts)}
        loops, seen = [], set()
        for start in boundary:
            if start in seen:
                continue
            loop, stack = [], [start]
            seen.add(start)
            while stack:
                e = stack.pop()
                loop.append(e)
                for v in e.verts:
                    for f in v.link_edges:
                        if f in boundary and f not in seen:
                            seen.add(f)
                            stack.append(f)
            loops.append(loop)
        small_loops = [lp for lp in loops if sum(e.calc_length() for e in lp) < 0.9]
        print(f"holes near the bag: {len(loops)}, closing {len(small_loops)}; skipped perimeters "
              f"{sorted(round(sum(e.calc_length() for e in lp), 2) for lp in loops if lp not in small_loops)}")
        filled = bmesh.ops.holes_fill(bm, edges=[e for lp in small_loops for e in lp], sides=0)["faces"]
        patches = bmesh.ops.triangulate(bm, faces=filled)["faces"]
        # holes_fill silently skips holes whose rim touches itself or reaches out to slivers of
        # the bag. On this model that leaves one opening on the right side of the waist; it sits
        # behind the door when she is seated, and forcing a fill there only makes spikes.
        still_open = sum(1 for lp in small_loops if any(e.is_valid and e.is_boundary for e in lp))
        print(f"holes left open: {still_open}")
        uv_layer = bm.loops.layers.uv.active
        for f in patches:
            colour = top_white if f.calc_center_median().z > HEM_Z else waist_skin
            for loop in f.loops:
                loop[uv_layer].uv = colour
        bm.to_mesh(me)
        bm.free()
        print(f"closed {len(filled)} holes with {len(patches)} faces")

    bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
    print("saved", out_blend)
