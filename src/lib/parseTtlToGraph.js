import { Parser } from "n3";

export function parseTtlToGraph(ttlContent) {
  const parser = new Parser();
  const quads = parser.parse(ttlContent);

  const nodesMap = new Map(); // { id: label }
  const edges = [];

  quads.forEach((q) => {
    const subject = q.subject.id || q.subject.value;
    const object = q.object.id || q.object.value;
    const predicate = q.predicate.id || q.predicate.value;

    // Add rdfs:label
    if (predicate.includes("rdfs:label")) {
      nodesMap.set(subject, q.object.value.replace(/"/g, ""));
    }

    // Add nodes if not yet labeled
    if (!nodesMap.has(subject)) nodesMap.set(subject, subject.split('/').pop());
    if (!q.object.termType === "Literal" && !nodesMap.has(object)) {
      nodesMap.set(object, object.split('/').pop());
    }

    // Add edges for relevant relationships
    const allowedPredicates = [
      "bot:hasBuilding", "bot:hasStorey", "bot:adjacentElement", "bot:containsElement",
      "bot:adjacentZone", "botAiLab:intersectsElement", "botAiLab:isAbove", "botAiLab:isBelow",
      "botAiLab:adjacentElement"
    ];

    if (
      allowedPredicates.some((p) => predicate.includes(p)) &&
      q.object.termType !== "Literal"
    ) {
      edges.push({
        source: subject,
        target: object,
        label: predicate.split('#').pop() || predicate.split('/').pop(),
      });
    }
  });

  const nodes = Array.from(nodesMap.entries()).map(([id, label]) => ({
    data: { id, label },
  }));

  const formattedEdges = edges.map((e) => ({
    data: { source: e.source, target: e.target, label: e.label },
  }));

  return { nodes, edges: formattedEdges, edgesRaw: edges };
}