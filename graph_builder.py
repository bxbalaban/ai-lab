import Rhino.Geometry as rg
import math
import json

from rdflib import Graph, Namespace, RDF, URIRef, Literal
from rdflib.namespace import XSD, RDFS

BOT = Namespace("https://w3id.org/bot#")
BOTAILAB = Namespace("http://www.aiLab.org/botAiLab#")

class GraphBuilder:
    def __init__(self, building, base_uri="http://example.org/building/"):
        self.building = building
        self.base_uri = base_uri
        self.graph = Graph()
        self.graph.bind("bot", BOT)
        self.graph.bind("botAiLab", BOTAILAB)
        self.boxes = []

    def build(self):
        self._add_building()
        self._add_site()
        self._add_storeys()
        self._add_slabs()
        self._add_walls()
        self._add_columns()

    def _make_uri(self, fragment):
        return URIRef(self.base_uri + fragment)

    def _add_building(self):
        building_uri = self._make_uri("building")
        volume = getattr(self.building, "volume", None)
        self.graph.add((building_uri, RDF.type, BOT.Building))
        self.graph.add((building_uri, RDFS.label, Literal("Building")))
        if volume is not None:
            self._serialize_geometry(building_uri, volume)

    def _add_site(self):
        if not self.building.site:
            return
        site_uri = self._make_uri("site")
        self.graph.add((site_uri, RDF.type, BOT.Site))
        self.graph.add((site_uri, BOT.hasBuilding, self._make_uri("building")))

    def _add_storeys(self):
        if not hasattr(self.building, "storeys"):
            return
        for idx, storey in enumerate(self.building.storeys):
            storey_uri = self._make_uri(f"storey_{idx+1}")
            self.graph.add((storey_uri, RDF.type, BOT.Storey))
            self.graph.add((storey_uri, RDFS.label, Literal(f"Storey {idx+1}")))
            self._serialize_geometry(storey_uri, storey)
            self.graph.add((self._make_uri("building"), BOT.hasStorey, storey_uri))
            # Add adjacentZone to storey above and below (except first and last)
            if idx > 0:
                below_storey_uri = self._make_uri(f"storey_{idx}")
                self.graph.add((storey_uri, BOT.adjacentZone, below_storey_uri))
            if idx < len(self.building.storeys) - 1:
                above_storey_uri = self._make_uri(f"storey_{idx+2}")
                self.graph.add((storey_uri, BOT.adjacentZone, above_storey_uri))

    def _add_slabs(self):
        if not hasattr(self.building, "slabs"):
            return

        num_storeys = len(getattr(self.building, "storeys", []))

        # Floor slab
        floor_slab = getattr(self.building, "floor_slab", None)
        if floor_slab is not None:
            slab_uri = self._make_uri("floor_slab")
            self.graph.add((slab_uri, RDF.type, BOTAILAB.FloorSlab))
            self.graph.add((slab_uri, RDFS.label, Literal("Floor Slab")))
            self._add_intersections(slab_uri, floor_slab)
            self._serialize_geometry(slab_uri, floor_slab)
            # Contained in first storey
            storey_uri = self._make_uri("storey_1")
            self.graph.add((storey_uri, BOT.containsElement, slab_uri))

        # Intermediate slabs (contained in next storey, adjacent to previous)
        for idx, slab in enumerate(self.building.slabs):
            slab_uri = self._make_uri(f"slab_{idx+1}")
            self.graph.add((slab_uri, RDF.type, BOTAILAB.Slab))
            self.graph.add((slab_uri, RDFS.label, Literal(f"Slab {idx+1}")))
            self._add_intersections(slab_uri, slab)
            self._serialize_geometry(slab_uri, slab)
            # Contained in the next storey (storey_{idx+2}), if exists
            storey_contain_idx = idx + 2
            if storey_contain_idx <= num_storeys:
                storey_uri = self._make_uri(f"storey_{storey_contain_idx}")
                self.graph.add((storey_uri, BOT.containsElement, slab_uri))
            # Adjacent to previous storey (storey_{idx+1})
            if idx + 1 <= num_storeys:
                prev_storey_uri = self._make_uri(f"storey_{idx+1}")
                self.graph.add((prev_storey_uri, BOT.adjacentElement, slab_uri))

        # Roof slab
        roof_slab = getattr(self.building, "roof_slab", None)
        if roof_slab is not None:
            slab_uri = self._make_uri("roof_slab")
            self.graph.add((slab_uri, RDF.type, BOTAILAB.RoofSlab))
            self.graph.add((slab_uri, RDFS.label, Literal("Roof Slab")))
            self._add_intersections(slab_uri, roof_slab)
            self._serialize_geometry(slab_uri, roof_slab)
            # Adjacent to the last storey
            if num_storeys > 0:
                last_storey_uri = self._make_uri(f"storey_{num_storeys}")
                self.graph.add((last_storey_uri, BOT.adjacentElement, slab_uri))

    def _add_walls(self):
        if not hasattr(self.building, "walls"):
            return
        num_storeys = len(getattr(self.building, "storeys", []))
        for storey_idx, walls_in_storey in enumerate(self.building.walls):
            storey_uri = self._make_uri(f"storey_{storey_idx+1}")
            # Identify relevant slabs for adjacency
            # Slab below: floor_slab for first storey, slab_{storey_idx} for others
            if storey_idx == 0:
                slab_below_uri = self._make_uri("floor_slab")
            else:
                slab_below_uri = self._make_uri(f"slab_{storey_idx}")
            # Slab above: slab_{storey_idx+1}, unless last storey then roof_slab
            if storey_idx + 1 < num_storeys:
                slab_above_uri = self._make_uri(f"slab_{storey_idx+1}")
            else:
                slab_above_uri = self._make_uri("roof_slab")
            for wall_idx, wall in enumerate(walls_in_storey):
                wall_uri = self._make_uri(f"storey_{storey_idx+1}_wall_{wall_idx+1}")
                self.graph.add((wall_uri, RDF.type, BOTAILAB.Wall))
                self.graph.add((wall_uri, RDFS.label, Literal("Wall")))
                self._serialize_geometry(wall_uri, wall)
                self.graph.add((storey_uri, BOT.containsElement, wall_uri))
                # Add adjacency to slabs
                self.graph.add((wall_uri, BOTAILAB.adjacentElement, slab_below_uri))
                self.graph.add((wall_uri, BOTAILAB.adjacentElement, slab_above_uri))
                self.graph.add((wall_uri, BOTAILAB.isSupportedBy, slab_below_uri))
                self.graph.add((wall_uri, BOTAILAB.supports, slab_above_uri))
                self._add_intersections(wall_uri, wall)

    def _add_columns(self):
        if not hasattr(self.building, "columns"):
            return
        num_storeys = len(getattr(self.building, "storeys", []))
        for storey_idx, columns_in_storey in enumerate(self.building.columns):
            storey_uri = self._make_uri(f"storey_{storey_idx+1}")
            # Identify relevant slabs for adjacency
            # Slab below: floor_slab for first storey, slab_{storey_idx} for others
            if storey_idx == 0:
                slab_below_uri = self._make_uri("floor_slab")
            else:
                slab_below_uri = self._make_uri(f"slab_{storey_idx}")
            # Slab above: slab_{storey_idx+1}, unless last storey then roof_slab
            if storey_idx + 1 < num_storeys:
                slab_above_uri = self._make_uri(f"slab_{storey_idx+1}")
            else:
                slab_above_uri = self._make_uri("roof_slab")
            for column_idx, column in enumerate(columns_in_storey):
                column_uri = self._make_uri(f"storey_{storey_idx+1}_column_{column_idx+1}")
                self.graph.add((column_uri, RDF.type, BOTAILAB.Column))
                self.graph.add((column_uri, RDFS.label, Literal("Column")))
                self._serialize_geometry(column_uri, column)
                self.graph.add((storey_uri, BOT.containsElement, column_uri))
                # Add adjacency to slabs
                self.graph.add((column_uri, BOTAILAB.adjacentElement, slab_below_uri))
                self.graph.add((column_uri, BOTAILAB.adjacentElement, slab_above_uri))
                self.graph.add((column_uri, BOTAILAB.isSupportedBy, slab_below_uri))
                self.graph.add((column_uri, BOTAILAB.supports, slab_above_uri))
                self._add_intersections(column_uri, column)

    def _add_intersections(self, element_uri, geometry):
        # Find intersection with columns
        for storey_idx, columns_in_storey in enumerate(self.building.columns):
            for column_idx, column in enumerate(columns_in_storey):
                column_uri = self._make_uri(f"storey_{storey_idx+1}_column_{column_idx+1}")
                intersection = rg.Intersect.Intersection.BrepBrep(geometry, column, 0.01)               
                if intersection and (len(intersection[1]) > 0 or len(intersection[2]) > 0):
                    self.graph.add((element_uri, BOTAILAB.intersectsElement, column_uri))
                else:
                    centroid_geo = geometry.GetBoundingBox(True).Center
                    centroid_column = column.GetBoundingBox(True).Center
                    if centroid_geo.Z < centroid_column.Z - 0.5:
                        self.graph.add((element_uri, BOTAILAB.isBelow, column_uri))
                    elif centroid_geo.Z > centroid_column.Z + 0.5:
                        self.graph.add((element_uri, BOTAILAB.isAbove, column_uri))
                    else:
                        pass
        
        # Find intersection with walls
        for storey_idx, walls_in_storey in enumerate(self.building.walls):
            for wall_idx, wall in enumerate(walls_in_storey):
                wall_uri = self._make_uri(f"storey_{storey_idx+1}_wall_{wall_idx+1}")
                intersection = rg.Intersect.Intersection.BrepBrep(geometry, wall, 0.01)
                if intersection and (len(intersection[1]) > 0 or len(intersection[2]) > 0):
                    self.graph.add((element_uri, BOTAILAB.intersectsElement, wall_uri))
                else:
                    centroid_geo = geometry.GetBoundingBox(True).Center
                    centroid_wall = wall.GetBoundingBox(True).Center
                    if centroid_geo.Z < centroid_wall.Z - 0.5:
                        self.graph.add((element_uri, BOTAILAB.isBelow, wall_uri))
                    elif centroid_geo.Z > centroid_wall.Z + 0.5:
                        self.graph.add((element_uri, BOTAILAB.isAbove, wall_uri))
                    else:
                        pass

    def _serialize_geometry(self, element_uri, geometry):

        def minimal_volume_bbox(geometry, angle_step=0.1, angle_max=2*math.pi):
            """
            Finds the rotation around world Z that yields the minimal bounding box volume for geometry.
            Uses plane rotation, not geometry rotation.
            Returns: (location: rg.Point3d, angle: float, size: rg.Vector3d)
            """
            min_volume = float("inf")
            min_angle = 0.0
            min_box = None

            #geometry = rg.Mesh.CreateFromBrep(geometry, rg.MeshingParameters.Smooth)[0]

            for i in range(int(angle_max / angle_step)):
                angle = i * angle_step
                # Create a rotated plane around world Z at origin
                plane = rg.Plane.WorldXY
                xform = rg.Transform.Rotation(angle, rg.Vector3d.ZAxis, rg.Point3d(0, 0, 0))
                plane_rot = plane
                plane_rot.Transform(xform)
                # Get the oriented bounding box in world coordinates
                oriented_box = geometry.GetBoundingBox(plane_rot)
                # oriented_box is a Rhino.geometry.Box
                # Compute size vector
                volume = oriented_box.Volume
                if volume < min_volume:
                    min_volume = volume
                    min_angle = angle
                    min_box = oriented_box

            if min_box is None:
                # fallback to axis-aligned
                bbox = geometry.GetBoundingBox(True)
                location = bbox.Min
                size = bbox.Max - bbox.Min
                return location, 0.0, size

            # Use box's corner (origin) as location
            location = min_box.PointAt(0,0,0)
            size = min_box.Diagonal

            plane = rg.Plane.WorldXY
            plane.Rotate(min_angle, rg.Vector3d.ZAxis)    
            self.boxes.append(rg.Box(plane, min_box))

            return location, min_angle, size

        location, angle, size = minimal_volume_bbox(geometry)
        self.graph.add((element_uri, BOTAILAB.hasLocation, Literal(f"{location.X},{location.Y},{location.Z}", datatype=XSD.string)))
        self.graph.add((element_uri, BOTAILAB.hasRotation, Literal(angle, datatype=XSD.string)))
        self.graph.add((element_uri, BOTAILAB.hasSize, Literal(f"{size.X},{size.Y},{size.Z}", datatype=XSD.string)))

    def export_json(self):
        """
        Export building elements (except site) to a JSON structure with IRI, label, and serialization.
        """
        result = []
        # Gather all nodes except site
        site_uri = self._make_uri("site")

        # Find all relevant nodes
        for subj in set(self.graph.subjects()):
            if subj == site_uri:
                continue
            # Only include nodes that have geometry serialization or a label (not blank nodes)
            # Get IRI
            iri = str(subj)
            # Get label (if exists)
            label = None
            for l in self.graph.objects(subj, RDFS.label):
                label = str(l)
                break
            # Get serialization (geometry)
            location = None
            for loc in self.graph.objects(subj, BOTAILAB.hasLocation):
                location = str(loc)
                break
            rotation = None
            for rot in self.graph.objects(subj, BOTAILAB.hasRotation):
                rotation = float(rot)
                break
            size = None
            for sz in self.graph.objects(subj, BOTAILAB.hasSize):
                size = str(sz)
                break
            serialization = {
                "rotation": rotation,
                "location": location,
                "size": size
            } if location or rotation or size else None
            # Get intersections
            intersects = []
            for intersection in self.graph.objects(subj, BOTAILAB.intersectsElement):
                if str(intersection) != iri:
                    intersects.append(str(intersection))
            # Get vertical relationships
            is_above = []
            for above in self.graph.objects(subj, BOTAILAB.isAbove):
                if str(above) != iri:
                    is_above.append(str(above))
            is_below = []
            for below in self.graph.objects(subj, BOTAILAB.isBelow):
                if str(below) != iri:
                    is_below.append(str(below))
            # Get adjacency
            adjacency = []
            for adj in self.graph.objects(subj, BOTAILAB.adjacentElement):
                if str(adj) != iri:
                    adjacency.append(str(adj))

            # Only add if there is geometry serialization
            if serialization and (serialization["location"] or serialization["rotation"] or serialization["size"]):
                entry = {
                    "iri": iri,
                    "label": label,
                    "serialization": serialization,
                    "intersects": intersects,
                    "isAbove": is_above,
                    "isBelow": is_below,
                    "adjacency": adjacency
                }
                result.append(entry)

        return json.dumps(result, indent=2)

    def export(self, format="turtle"):
        ttl = self.graph.serialize(format=format)
        if isinstance(ttl, bytes):
            ttl = ttl.decode("utf-8")
        return ttl


Graph = GraphBuilder(building)
Graph.build()
ttl = str(Graph.export())
json = str(Graph.export_json())
geo = Graph.boxes
