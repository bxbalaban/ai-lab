import { Parser } from "n3";

export function parseIfcTtlToGraph(ttlContent) {
  const parser = new Parser();
  const quads = parser.parse(ttlContent);

  const nodesSet = new Map(); // { id: label }
  const edges = [];

  quads.forEach((q) => {
    const subject = q.subject.id || q.subject.value;
    const object = q.object.id || q.object.value;
    const predicate = q.predicate.id || q.predicate.value;

    // Add node labels if rdfs:label
    if (predicate.includes('rdfs:label') || predicate.includes('/label')) {
      nodesSet.set(subject, q.object.value.replace(/['"]/g, ''));
    }

    // Add nodes if not present
    if (!nodesSet.has(subject)) nodesSet.set(subject, subject.split('/').pop());
    if (!nodesSet.has(object) && !q.object.termType === "Literal") {
      nodesSet.set(object, object.split('/').pop());
    }

    // Create edges for specific relationships
    const allowedPredicates = [
      'bot:hasBuilding', 'bot:hasStorey', 'bot:adjacentElement', 'bot:adjacentZone',
      'bot:containsElement', 'botAiLab:intersectsElement', 'botAiLab:isAbove',
      'botAiLab:isBelow', 'botAiLab:adjacentElement'
    ];

    if (
      allowedPredicates.some((p) => predicate.includes(p))
      && !q.object.termType === "Literal"
    ) {
      edges.push({
        source: subject,
        target: object,
        label: predicate.split('#').pop() || predicate.split('/').pop(),
      });
    }
  });

  const nodes = Array.from(nodesSet.entries()).map(([id, label]) => ({
    data: { id, label },
  }));

  const formattedEdges = edges.map((e) => ({
    data: { source: e.source, target: e.target, label: e.label },
  }));

  return { nodes, edges: formattedEdges, rawEdges: edges };
}