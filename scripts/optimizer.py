import sys
import torch
import rdflib
from torch import nn
from torch_geometric.nn import RGCNConv
from torch_geometric.data import Data
from rdflib import Graph
from rdflib.namespace import Namespace, RDF
from rdflib.namespace import NamespaceManager
from shapely import wkt

BOT = Namespace("https://w3id.org/bot#")
BOTAI = Namespace("http://www.aiLab.org/botAiLab#")
GEO = Namespace("http://www.opengis.net/ont/geosparql#")
LOCAL = Namespace("http://example.org/building/")

relation_uris_for_link_inference = [
    BOTAI.adjacentElement,
    BOTAI.isAbove,
    BOTAI.intersectsElement,
]

relation_uris_for_node_classification = [
    BOTAI.adjacentElement,
    BOTAI.isAbove,
    BOTAI.intersectsElement,
]

label_map = {
    BOTAI.Column: 0,
    BOTAI.Slab: 1,
    BOTAI.Wall: 2,
    BOTAI.FloorSlab: 3,
    BOTAI.RoofSlab: 4,
}

inv_label_map = {v: k for k, v in label_map.items()}
target_classes = list(label_map.keys())
num_features = 7  # x, y, z, w, h, d, rot


class GeoNodeClassifier(nn.Module):
    def __init__(self, in_channels, hidden_channels=64):
        super().__init__()
        num_relations = len(relation_uris_for_node_classification)
        num_classes = len(label_map)

        self.conv1 = RGCNConv(in_channels, hidden_channels, num_relations)
        self.conv2 = RGCNConv(hidden_channels, hidden_channels, num_relations)
        self.classifier = nn.Linear(hidden_channels, num_classes)

    def forward(self, x, edge_index, edge_type):
        x = self.conv1(x, edge_index, edge_type).relu()
        x = self.conv2(x, edge_index, edge_type).relu()
        return self.classifier(x)


class GeoLinkPredictor(nn.Module):
    def __init__(self, in_channels, hidden_channels=64, num_relations=3):
        super().__init__()
        self.conv1 = RGCNConv(in_channels, hidden_channels, num_relations)
        self.conv2 = RGCNConv(hidden_channels, hidden_channels, num_relations)
        self.classifier = nn.Sequential(
            nn.Linear(hidden_channels * 2, 64), nn.ReLU(), nn.Linear(64, 1)
        )

    def encode(self, x, edge_index, edge_type):
        x = self.conv1(x, edge_index, edge_type).relu()
        x = self.conv2(x, edge_index, edge_type)
        return x

    def decode(self, z, edge_index):
        src, dst = edge_index
        z_cat = torch.cat([z[src], z[dst]], dim=1)
        return self.classifier(z_cat).view(-1)


def load_graph_for_link_inference(ttl_file):
    g = Graph()
    g.parse(ttl_file, format="turtle")
    g.bind("botAiLab", BOTAI)
    g.bind("geo", GEO)

    nodes = list(set(g.subjects()))
    node_index = {n: i for i, n in enumerate(nodes)}
    index_node = {i: n for n, i in node_index.items()}
    num_nodes = len(nodes)

    features = torch.zeros((num_nodes, 7))  # x, y, z, w, h, d, rot

    for s in nodes:
        loc = g.value(s, BOTAI.hasLocation)
        if loc:
            try:
                coords = list(map(float, str(loc).split(",")))
                if len(coords) == 3:
                    x, y, z = coords
                    wkt_str = f"POINT Z({x} {y} {z})"
                    g.add(
                        (
                            s,
                            GEO.asWKT,
                            rdflib.Literal(wkt_str, datatype=GEO.wktLiteral),
                        )
                    )
            except:
                continue

    for s in nodes:
        i = node_index[s]
        loc = g.value(s, GEO.asWKT)
        if loc:
            pt = wkt.loads(str(loc))
            features[i][:3] = torch.tensor(
                [pt.x, pt.y, pt.z if hasattr(pt, "z") else 0.0]
            )

        size = g.value(s, BOTAI.hasSize)
        if size:
            try:
                w, h, d = map(float, str(size).split(","))
                features[i][3:6] = torch.tensor([w, h, d])
            except:
                pass

        rot = g.value(s, BOTAI.hasRotation)
        if rot:
            try:
                features[i][6] = float(str(rot))
            except:
                pass

    relation_to_id = {
        rel: i for i, rel in enumerate(relation_uris_for_link_inference)
    }

    edge_list = []
    edge_types = []

    for rel in relation_uris_for_link_inference:
        for s, _, o in g.triples((None, rel, None)):
            if s in node_index and o in node_index:
                edge_list.append([node_index[s], node_index[o]])
                edge_types.append(relation_to_id[rel])

    if not edge_list:
        edge_index = torch.empty((2, 0), dtype=torch.long)
        edge_type = torch.empty((0,), dtype=torch.long)
    else:
        edge_index = torch.tensor(edge_list, dtype=torch.long).t().contiguous()
        edge_type = torch.tensor(edge_types, dtype=torch.long)

    supports = set()
    for s, _, o in g.triples((None, BOTAI.supports, None)):
        if s in node_index and o in node_index:
            supports.add((node_index[s], node_index[o]))

    return features, edge_index, supports, node_index, index_node, edge_type


def load_graph_for_node_classification_inference(ttl_file):
    g = Graph()
    g.parse(ttl_file, format="turtle")
    g.bind("botAiLab", BOTAI)
    g.bind("geo", GEO)

    nodes = list(set(g.subjects()))
    node_index = {n: i for i, n in enumerate(nodes)}
    index_node = {i: n for n, i in node_index.items()}
    num_nodes = len(nodes)

    features = torch.zeros((num_nodes, num_features))

    for s in nodes:
        loc = g.value(s, BOTAI.hasLocation)
        if loc:
            try:
                coords = list(map(float, str(loc).split(",")))
                if len(coords) == 3:
                    x, y, z = coords
                    wkt_str = f"POINT Z({x} {y} {z})"
                    g.add(
                        (
                            s,
                            GEO.asWKT,
                            rdflib.Literal(wkt_str, datatype=GEO.wktLiteral),
                        )
                    )
            except:
                continue

    for s in nodes:
        i = node_index[s]
        loc = g.value(s, GEO.asWKT)
        if loc:
            pt = wkt.loads(str(loc))
            features[i][:3] = torch.tensor([pt.x, pt.y, getattr(pt, "z", 0.0)])

        size = g.value(s, BOTAI.hasSize)
        if size:
            try:
                w, h, d = map(float, str(size).split(","))
                features[i][3:6] = torch.tensor([w, h, d])
            except:
                pass

        rot = g.value(s, BOTAI.hasRotation)
        if rot:
            try:
                features[i][6] = float(str(rot))
            except:
                pass

    relation_to_id = {
        rel: i for i, rel in enumerate(relation_uris_for_node_classification)
    }

    edge_list = []
    edge_types = []

    for rel in relation_uris_for_node_classification:
        for s, _, o in g.triples((None, rel, None)):
            if s in node_index and o in node_index:
                edge_list.append([node_index[s], node_index[o]])
                edge_types.append(relation_to_id[rel])

    if not edge_list:
        edge_index = torch.empty((2, 0), dtype=torch.long)
        edge_type = torch.empty((0,), dtype=torch.long)
    else:
        edge_index = torch.tensor(edge_list, dtype=torch.long).t().contiguous()
        edge_type = torch.tensor(edge_types, dtype=torch.long)

    return (
        Data(x=features, edge_index=edge_index, edge_type=edge_type),
        index_node,
    )


def predict_missing_links(ttl_file, model_path, top_k=10):
    original_graph = Graph()
    original_graph.parse(ttl_file, format="turtle")

    x, edge_index, _, _, index_node, edge_type = load_graph_for_link_inference(
        ttl_file
    )

    model = GeoLinkPredictor(in_channels=7)
    model.load_state_dict(
        torch.load(model_path, map_location=torch.device("cpu"))
    )
    model.eval()

    with torch.no_grad():
        z = model.encode(x, edge_index, edge_type)

        num_nodes = x.size(0)
        candidate_edges = []
        candidate_labels = []
        for i in range(num_nodes):
            for j in range(num_nodes):
                if i != j:
                    subj = rdflib.URIRef(index_node[i])
                    obj = rdflib.URIRef(index_node[j])
                    candidate_edges.append((i, j))
                    label = (subj, BOTAI.supports, obj) in original_graph
                    candidate_labels.append(label)

        if not candidate_edges:
            print("✅ No candidate missing links to predict.")
            return

        edge_tensor = torch.tensor(candidate_edges, dtype=torch.long).t()
        scores = torch.sigmoid(model.decode(z, edge_tensor))

        top_scores, top_indices = torch.topk(scores, min(top_k, len(scores)))
        filtered_scores = []
        filtered_indices = []
        for i, score in enumerate(top_scores):
            if score >= 0.9:
                filtered_scores.append(score)
                filtered_indices.append(top_indices[i])

        predicted_links = [candidate_edges[idx] for idx in filtered_indices]
        predicted_labels = [candidate_labels[idx] for idx in filtered_indices]

        print(f"📊 Top {top_k} predicted missing `botAiLab:supports` links:")
        for score, (i, j), _ in zip(
            filtered_scores, predicted_links, predicted_labels
        ):
            subj_uri = rdflib.URIRef(index_node[i])
            obj_uri = rdflib.URIRef(index_node[j])
            print(f"{subj_uri} → {obj_uri} | score={score:.4f}")
            original_graph.add((subj_uri, BOTAI.supports, obj_uri))

        namespace_manager = NamespaceManager(original_graph)
        namespace_manager.bind("local", LOCAL)
        original_graph.namespace_manager = namespace_manager

        original_graph.serialize(destination=ttl_file, format="turtle")


def predict_node_classes(ttl_file, model_path):
    original_graph = Graph()
    original_graph.parse(ttl_file, format="turtle")

    target_nodes = {}
    for cls in target_classes:
        for s in original_graph.subjects(RDF.type, cls):
            target_nodes[s] = cls

    data, index_node = load_graph_for_node_classification_inference(ttl_file)
    node_index = {v: k for k, v in index_node.items()}

    element_indices = [
        node_index[s] for s in target_nodes.keys() if s in node_index
    ]

    if not element_indices:
        print("🚫 No valid bot:Element nodes found in graph.")
        return

    model = GeoNodeClassifier(in_channels=num_features)
    model.load_state_dict(
        torch.load(model_path, map_location=torch.device("cpu"))
    )
    model.eval()

    with torch.no_grad():
        logits = model(data.x, data.edge_index, data.edge_type)
        predictions = logits.argmax(dim=1)

    # Compare predictions to original class labels
    print("📊 Predictions on bot:Element nodes:")
    for idx in element_indices:
        node_uri = rdflib.URIRef(index_node[idx])
        pred_class = predictions[idx].item()
        predicted_uri = inv_label_map[pred_class]
        original_graph.add((node_uri, RDF.type, predicted_uri))
        print(f"{node_uri} → Predicted: {predicted_uri.split('#')[-1]}")

    namespace_manager = NamespaceManager(original_graph)
    namespace_manager.bind("botAiLab", BOTAI)
    namespace_manager.bind("bot", BOT)
    namespace_manager.bind("local", LOCAL)
    original_graph.namespace_manager = namespace_manager
    original_graph.serialize(destination=ttl_file, format="turtle")


def main():
    filepath = sys.argv[1]
    try:
        _ = predict_missing_links(
            ttl_file=filepath,
            model_path="resources/models/link_predictor_model.pt",
            top_k=15,
        )
        _ = predict_node_classes(
            ttl_file=filepath,
            model_path="resources/models/node_classifier_model.pt",
        )
    except Exception as e:
        print(f"⚠️ Failed to process! Error: {e}")


if __name__ == "__main__":
    main()