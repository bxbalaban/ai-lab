import bpy
from mathutils import Vector

# === SETTINGS ===
collection_name = "Building"  # Replace with your collection name

# === GET COLLECTION ===
if collection_name in bpy.data.collections:
    my_collection = bpy.data.collections[collection_name]
else:
    print(f"Collection '{collection_name}' not found!")
    raise Exception("Stop script")

# === FUNCTION: Create bounding box mesh ===
def create_bbox(obj):
    # Get world-space bounding box corners
    world_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]

    # Find min and max coordinates
    min_corner = Vector((min([v.x for v in world_corners]),
                         min([v.y for v in world_corners]),
                         min([v.z for v in world_corners])))
    max_corner = Vector((max([v.x for v in world_corners]),
                         max([v.y for v in world_corners]),
                         max([v.z for v in world_corners])))
    
    print(f"Min Corner: {min_corner.x}, {min_corner.y}, {min_corner.z}")
    print(f"Max Corner: {max_corner.x}, {max_corner.y}, {max_corner.z}")


# === MAIN LOOP ===
for obj in my_collection.objects:
    if obj.type == 'MESH':
        bbox = create_bbox(obj)
        print(f"Created bounding box for: {obj.name}")

print("Done!")
