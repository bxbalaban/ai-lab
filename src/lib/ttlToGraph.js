import { Parser } from 'n3';

export async function parseTtlToGraph(ttlContent) {
    const parser = new Parser();
    const quads = parser.parse(ttlContent);

    const nodesSet = new Set();
    const edges = [];

    quads.forEach(q => {
        nodesSet.add(q.subject.id);
        nodesSet.add(q.object.id);
        edges.push({
            source: q.subject.id,
            target: q.object.id,
            label: q.predicate.id.split('#').pop() || q.predicate.id.split('/').pop()
        });
    });

    const nodes = Array.from(nodesSet).map(id => ({ data: { id } }));

    const formattedEdges = edges.map(e => ({
        data: { source: e.source, target: e.target, label: e.label }
    }));

    return { nodes, edges: formattedEdges };
}