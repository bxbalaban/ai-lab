import bpy
import numpy as np
from mathutils import Vector, Matrix

def get_world_vertices(obj):
    """Return all vertices of a mesh transformed to world coordinates."""
    return [obj.matrix_world @ v.co for v in obj.data.vertices]

def pca_2d(points):
    """
    Perform 2D Principal Component Analysis (PCA) on XY coordinates.
    Returns:
        - mean: mean XY position
        - axes: 2x2 matrix of principal axes directions
    """
    # Extract XY coordinates
    pts = np.array([[v.x, v.y] for v in points])

    # Compute mean and center points
    mean = np.mean(pts, axis=0)
    centered = pts - mean

    # Singular Value Decomposition (SVD) for PCA
    U, S, Vt = np.linalg.svd(centered, full_matrices=False)
    axes = Vt.T  # Each column is a principal axis

    return mean, axes

def create_and_compute_obb_xy(obj, bbox_collection):
    """
    For a given mesh object:
    - Compute its oriented bounding box (OBB) aligned in XY only.
    - Create a wireframe cube to visualize the OBB.
    - Return the OBB's minimum corner, dimensions, and rotation around Z.
    """
    # Get all vertices in world space
    verts_world = get_world_vertices(obj)

    # === Perform PCA in XY ===
    mean_xy, axes_xy = pca_2d(verts_world)

    # Project points into local PCA frame
    pts_2d = np.array([[v.x, v.y] for v in verts_world])
    centered_2d = pts_2d - mean_xy
    local_2d = centered_2d @ axes_xy

    # Compute 2D extents in PCA frame
    min_2d = np.min(local_2d, axis=0)
    max_2d = np.max(local_2d, axis=0)
    size_2d = max_2d - min_2d
    center_local_2d = (min_2d + max_2d) / 2.0

    # Compute Z extents in world space
    zs = np.array([v.z for v in verts_world])
    min_z = np.min(zs)
    max_z = np.max(zs)
    size_z = max_z - min_z
    center_z = (min_z + max_z) / 2.0

    # === Compute OBB center in world coordinates ===
    center_xy_world = mean_xy + axes_xy @ center_local_2d
    center_world = Vector((center_xy_world[0], center_xy_world[1], center_z))

    # Box dimensions (width, depth, height)
    size_world = Vector((size_2d[0], size_2d[1], size_z))

    # === Compute min corner in world coordinates ===
    min_local_xy = min_2d
    min_corner_xy_world = mean_xy + axes_xy @ min_local_xy
    min_corner = Vector((min_corner_xy_world[0], min_corner_xy_world[1], min_z))

    # === Compute rotation around Z ===
    # The angle between PCA X-axis and world X-axis in XY plane
    pca_x_axis = Vector((axes_xy[0,0], axes_xy[1,0]))
    angle = pca_x_axis.angle_signed(Vector((1,0)), 0)
    rotation_z = angle  # In radians

    # === Create the visual bounding box cube ===
    bpy.ops.mesh.primitive_cube_add(location=center_world)
    obb = bpy.context.active_object

    # Scale the cube to fit the OBB dimensions
    obb.scale = size_world / 2.0  # Blender's default cube is 2x2x2

    # Build rotation matrix to align cube to PCA axes (XY only, Z stays up)
    x_axis = Vector((axes_xy[0,0], axes_xy[1,0], 0))
    y_axis = Vector((axes_xy[0,1], axes_xy[1,1], 0))
    z_axis = Vector((0, 0, 1))
    rot = Matrix((x_axis, y_axis, z_axis)).transposed()
    obb.rotation_euler = rot.to_euler()

    # Name and display settings for the OBB
    obb.name = f"OBB_{obj.name}"
    obb.display_type = 'WIRE'     # Viewport wireframe only
    obb.hide_render = True        # Exclude from renders
    obb.hide_select = True        # Lock selection (optional)

    # Remove cube from default collection and link to bounding box collection
    context_col = bpy.context.collection
    if obb.name in context_col.objects:
        context_col.objects.unlink(obb)
    bbox_collection.objects.link(obb)

    # Return OBB properties
    return min_corner, size_world, rotation_z

# === USER SETTINGS ===
source_collection_name = "Building1"   # Name of source collection with meshes
bbox_collection_name = "BoundingBoxes" # Name of collection for generated OBBs

# === Get source collection ===
if source_collection_name in bpy.data.collections:
    my_collection = bpy.data.collections[source_collection_name]
else:
    print(f"Collection '{source_collection_name}' not found!")
    raise Exception("Stop script")

# === Get or create bounding box collection ===
if bbox_collection_name in bpy.data.collections:
    bbox_collection = bpy.data.collections[bbox_collection_name]
else:
    bbox_collection = bpy.data.collections.new(bbox_collection_name)
    bpy.context.scene.collection.children.link(bbox_collection)

# === Loop over all mesh objects and create OBBs ===
for obj in list(my_collection.objects):
    if obj.type == 'MESH':
        min_corner, size_vector, rotation_z = create_and_compute_obb_xy(obj, bbox_collection)
        print(f"Object: {obj.name}")
        print(f" - Min corner: {min_corner}")
        print(f" - Size (W,H,D): {size_vector}")
        print(f" - Rotation around Z: {np.degrees(rotation_z):.2f}°")

print("Done!")
