bl_info = {
    "name": "AiLab Graph Builder",
    "author": "Jonas",
    "version": (1, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Tool Shelf",
    "description": "Generate RDF graph for a building collection and export",
    "category": "Object",
}

import bpy
from bpy.props import StringProperty, PointerProperty
from bpy.types import Operator, Panel, PropertyGroup

from .graph_builder import GraphBuilder


# === Property group ===
class GraphBuilderProperties(PropertyGroup):
    source_collection: StringProperty(
        name="Source Collection",
        description="Name of the collection representing the building",
        default="Building1"
    )
    ttl_filepath: StringProperty(
        name="TTL Filepath",
        description="Where to save the RDF Turtle file",
        default="//building_graph.ttl",
        subtype='FILE_PATH'
    )
    server_url: StringProperty(
        name="Server URL",
        description="Optional: URL to POST TTL file to",
        default="http://localhost:5000/upload"
    )

# === Operator ===
class OBJECT_OT_GenerateGraph(Operator):
    bl_idname = "object.generate_graph"
    bl_label = "Generate RDF Graph"
    bl_description = "Build RDF graph, save TTL, and optionally POST"

    def execute(self, context):
        props = context.scene.graph_builder_props

        collection_name = props.source_collection
        filepath = bpy.path.abspath(props.ttl_filepath)
        server_url = props.server_url.strip()

        # Find the collection
        if collection_name not in bpy.data.collections:
            self.report({'ERROR'}, f"Collection '{collection_name}' not found.")
            return {'CANCELLED'}
        
        building_collection = bpy.data.collections[collection_name]

        # Build graph
        graph_builder = GraphBuilder(building_collection)
        graph_builder.build()
        graph_builder.save_graph(filepath)
        self.report({'INFO'}, f"Graph saved to {filepath}")

        # Optionally POST to server
        if server_url:
            graph_builder.send_over_http(server_url)
            self.report({'INFO'}, f"Graph posted to {server_url}")

        return {'FINISHED'}

# === Panel ===
class OBJECT_PT_GraphBuilderPanel(Panel):
    bl_label = "Graph Builder"
    bl_idname = "OBJECT_PT_graph_builder_exporter"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Graph Builder"

    def draw(self, context):
        layout = self.layout
        props = context.scene.graph_builder_props

        layout.prop(props, "source_collection")
        layout.prop(props, "ttl_filepath")
        layout.prop(props, "server_url")
        layout.operator("object.generate_graph", icon='EXPORT')

# === Register ===
classes = (
    GraphBuilderProperties,
    OBJECT_OT_GenerateGraph,
    OBJECT_PT_GraphBuilderPanel,
)

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.graph_builder_props = PointerProperty(type=GraphBuilderProperties)

def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    del bpy.types.Scene.graph_builder_props

if __name__ == "__main__":
    register()
