import bpy
import numpy as np
import socket
import requests
from mathutils import Vector, Matrix

from rdflib import Graph, Namespace, RDF, URIRef, Literal
from rdflib.namespace import XSD, RDFS

# === Namespaces ===
BOT = Namespace("https://w3id.org/bot#")
BOTAILAB = Namespace("http://www.aiLab.org/botAiLab#")

class GraphBuilder:
    def __init__(self, building_collection, base_uri="http://example.org/building/"):
        """
        Initialize the GraphBuilder.
        Args:
            building_collection: Blender Collection representing the building.
            base_uri: Base URI for RDF nodes.
        """
        self.building_collection = building_collection
        self.base_uri = base_uri
        self.graph = Graph()
        self.graph.bind("bot", BOT)
        self.graph.bind("botAiLab", BOTAILAB)
        self.boxes = []  # Stores geometry info for each element
        self.bbox_collection = self._get_or_create_collection("BoundingBoxes")  # Collection for visual OBBs

    def build(self):
        """
        Build the RDF graph:
          - Add building node
          - Add all elements
          - Add above/below relationships
          - Add intersects relationships
        """
        self._add_building()
        self._add_elements()
        self._add_above_below()
        self._add_intersects()
        
    def send_over_socket(self, host='127.0.0.1', port=9999):
        """
        Send RDF graph over TCP socket to a local port.
        """
        ttl_data = self.graph.serialize(format="turtle").encode('utf-8')
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((host, port))
            s.sendall(ttl_data)
            print(f"Sent {len(ttl_data)} bytes to {host}:{port}")
            
    def send_over_http(self, url="http://localhost:5000/upload"):
        """
        POST RDF graph as Turtle to a local Flask HTTP server.
        """
        ttl_data = self.graph.serialize(format="turtle")
        headers = {'Content-Type': 'text/turtle'}
        response = requests.post(url, data=ttl_data.encode('utf-8'), headers=headers)

        print(f"HTTP POST Response: {response.status_code} {response.reason}")
        print(response.text)

    def _get_or_create_collection(self, name):
        """
        Return an existing or new Blender collection with the given name.
        Used to manage the bounding box visualization.
        """
        if name in bpy.data.collections:
            return bpy.data.collections[name]
        else:
            collection = bpy.data.collections.new(name)
            bpy.context.scene.collection.children.link(collection)
            return collection

    def _make_uri(self, fragment):
        """Create a URIRef for a given fragment name."""
        return URIRef(self.base_uri + fragment)

    def _add_building(self):
        """
        Add the building as a bot:Building node in the RDF graph.
        Uses the collection name as its identifier.
        """
        building_uri = self._make_uri(self.building_collection.name)
        self.graph.add((building_uri, RDF.type, BOT.Building))
        self.graph.add((building_uri, RDFS.label, Literal(self.building_collection.name)))
        print(f"Added building: {building_uri}")

    def _add_elements(self):
        """
        Loop over all mesh objects in the building collection:
          - Create each element node
          - Link it with bot:hasElement to the building
          - Serialize its geometry and store its AABB/COG
        """
        building_uri = self._make_uri(self.building_collection.name)
        for obj in list(self.building_collection.objects):
            if obj.type == 'MESH':
                element_uri = self._make_uri(obj.name)
                self.graph.add((element_uri, RDF.type, BOT.Element))
                self.graph.add((building_uri, BOT.hasElement, element_uri))
                self._serialize_geometry(element_uri, obj)

    def _serialize_geometry(self, element_uri, obj):
        """
        Compute and serialize the oriented bounding box (OBB) for an element.
        Stores:
          - hasLocation: min corner XYZ as string
          - hasSize: width, depth, height as string
          - hasRotation: Z rotation in radians as string
        Also stores robust AABB min/max for above/below/intersects logic.
        """
        min_corner, size_vector, rotation_z, aabb_min, aabb_max = self._create_and_compute_obb_xy(obj, self.bbox_collection)

        location_str = f"{min_corner.x},{min_corner.y},{min_corner.z}"
        size_str = f"{size_vector.x},{size_vector.y},{size_vector.z}"
        rotation_str = f"{rotation_z}"

        self.graph.add((element_uri, BOTAILAB.hasLocation, Literal(location_str, datatype=XSD.string)))
        self.graph.add((element_uri, BOTAILAB.hasSize, Literal(size_str, datatype=XSD.string)))
        self.graph.add((element_uri, BOTAILAB.hasRotation, Literal(rotation_str, datatype=XSD.string)))

        # Compute center of gravity in Z
        cog_z = min_corner.z + size_vector.z / 2.0

        # Store element info for relationship checks
        self.boxes.append({
            "element_uri": element_uri,
            "cog_z": cog_z,
            "aabb_min": aabb_min,
            "aabb_max": aabb_max
        })

        print(f"Serialized geometry for {obj.name}:")
        print(f"  Location: {location_str}")
        print(f"  Size:     {size_str}")
        print(f"  Rotation: {rotation_str}")
        print(f"  COG Z:    {cog_z:.3f}")

    def _get_world_vertices(self, obj):
        """Return all vertices of a mesh object in world coordinates."""
        return [obj.matrix_world @ v.co for v in obj.data.vertices]

    def _pca_2d(self, points):
        """
        Perform 2D PCA on XY coordinates:
          - Returns mean XY position
          - Returns 2x2 rotation matrix for the PCA axes
        """
        pts = np.array([[v.x, v.y] for v in points])
        mean = np.mean(pts, axis=0)
        centered = pts - mean
        U, S, Vt = np.linalg.svd(centered, full_matrices=False)
        axes = Vt.T
        return mean, axes

    def _create_and_compute_obb_xy(self, obj, bbox_collection):
        """
        Compute the OBB in the XY plane for the given object:
          - Uses PCA for orientation
          - Calculates center, size, rotation
          - Builds a visual wireframe cube
          - Computes robust AABB for intersects and hierarchy
        """
        verts_world = self._get_world_vertices(obj)

        # Perform PCA in XY plane
        mean_xy, axes_xy = self._pca_2d(verts_world)
        pts_2d = np.array([[v.x, v.y] for v in verts_world])
        centered_2d = pts_2d - mean_xy
        local_2d = centered_2d @ axes_xy

        # Local 2D bounding box extents
        min_2d = np.min(local_2d, axis=0)
        max_2d = np.max(local_2d, axis=0)
        size_2d = max_2d - min_2d
        center_local_2d = (min_2d + max_2d) / 2.0

        # Z extents
        zs = np.array([v.z for v in verts_world])
        min_z = np.min(zs)
        max_z = np.max(zs)
        size_z = max_z - min_z
        center_z = (min_z + max_z) / 2.0

        # Compute OBB center in world coordinates
        center_xy_world = mean_xy + axes_xy @ center_local_2d
        center_world = Vector((center_xy_world[0], center_xy_world[1], center_z))
        size_world = Vector((size_2d[0], size_2d[1], size_z))

        # Compute OBB min corner for serialization
        min_corner_xy_world = mean_xy + axes_xy @ min_2d
        min_corner = Vector((min_corner_xy_world[0], min_corner_xy_world[1], min_z))

        # Compute 8 OBB corners, then the axis-aligned min/max
        obb_corners = []
        for x in [min_2d[0], max_2d[0]]:
            for y in [min_2d[1], max_2d[1]]:
                for z in [min_z, max_z]:
                    xy_world = mean_xy + axes_xy @ np.array([x, y])
                    obb_corners.append(Vector((xy_world[0], xy_world[1], z)))

        xs = [v.x for v in obb_corners]
        ys = [v.y for v in obb_corners]
        zs = [v.z for v in obb_corners]

        aabb_min_corner = Vector((min(xs), min(ys), min(zs)))
        aabb_max_corner = Vector((max(xs), max(ys), max(zs)))

        # Compute rotation in XY plane
        pca_x_axis = Vector((axes_xy[0, 0], axes_xy[1, 0]))
        angle = pca_x_axis.angle_signed(Vector((1, 0)), 0)
        rotation_z = angle

        # Create wireframe OBB for visualization
        bpy.ops.mesh.primitive_cube_add(location=center_world)
        obb = bpy.context.active_object
        obb.scale = size_world / 2.0

        x_axis = Vector((axes_xy[0, 0], axes_xy[1, 0], 0))
        y_axis = Vector((axes_xy[0, 1], axes_xy[1, 1], 0))
        z_axis = Vector((0, 0, 1))
        rot = Matrix((x_axis, y_axis, z_axis)).transposed()
        obb.rotation_euler = rot.to_euler()

        obb.name = f"OBB_{obj.name}"
        obb.display_type = 'WIRE'
        obb.hide_render = True
        obb.hide_select = True

        # Link to bounding box collection
        context_col = bpy.context.collection
        if obb.name in context_col.objects:
            context_col.objects.unlink(obb)
        bbox_collection.objects.link(obb)

        print(f"Object: {obj.name} | Min: {min_corner} | Size: {size_world} | RotZ: {np.degrees(rotation_z):.2f}°")
        return min_corner, size_world, rotation_z, aabb_min_corner, aabb_max_corner

    def _add_above_below(self):
        """
        For each pair of elements:
          - Compare center of gravity (COG) in Z
          - Add isAbove and isBelow relationships
        """
        for i, elem_a in enumerate(self.boxes):
            for j, elem_b in enumerate(self.boxes):
                if i == j:
                    continue
                if elem_a["cog_z"] > elem_b["cog_z"]:
                    self.graph.add((elem_a["element_uri"], BOTAILAB.isAbove, elem_b["element_uri"]))
                    self.graph.add((elem_b["element_uri"], BOTAILAB.isBelow, elem_a["element_uri"]))
                    print(f"{elem_a['element_uri']} is above {elem_b['element_uri']}")

    def _add_intersects(self):
        """
        For each unique pair of elements:
          - Check AABB overlap
          - Add intersects relationships if they overlap in X, Y, Z
        """
        for i, elem_a in enumerate(self.boxes):
            for j, elem_b in enumerate(self.boxes):
                if i >= j:
                    continue
                a_min = elem_a["aabb_min"]
                a_max = elem_a["aabb_max"]
                b_min = elem_b["aabb_min"]
                b_max = elem_b["aabb_max"]

                overlap_x = (a_min.x <= b_max.x) and (b_min.x <= a_max.x)
                overlap_y = (a_min.y <= b_max.y) and (b_min.y <= a_max.y)
                overlap_z = (a_min.z <= b_max.z) and (b_min.z <= a_max.z)

                if overlap_x and overlap_y and overlap_z:
                    self.graph.add((elem_a["element_uri"], BOTAILAB.intersects, elem_b["element_uri"]))
                    self.graph.add((elem_b["element_uri"], BOTAILAB.intersects, elem_a["element_uri"]))
                    print(f"{elem_a['element_uri']} intersects {elem_b['element_uri']}")

    def save_graph(self, filepath="building_graph.ttl"):
        """Export the RDF graph to Turtle format."""
        self.graph.serialize(destination=filepath, format="turtle")
        print(f"Graph saved to {filepath}")


# === Example usage ===
source_collection_name = "Building1"
filepath_ttl = r"C:\Users\Jonas\bwSyncShare\ITECH2325\04_Seminars\04_09_KnowledgeRepresentationForBuildings\Exercises\Repository\ai-lab\blender_addon\example_files\from_blender"

if source_collection_name in bpy.data.collections:
    building_collection = bpy.data.collections[source_collection_name]
else:
    raise Exception(f"Collection '{source_collection_name}' not found!")

graph_builder = GraphBuilder(building_collection)
graph_builder.build()
graph_builder.send_over_http()
graph_builder.save_graph(filepath_ttl + r"\building_graph.ttl")

print("Graph built and saved!")
