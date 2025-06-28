import { Parser, Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql"; // alternative: sparql-engine if preferred

export async function queryTtlWithSparql(ttlContent, sparqlQuery) {
  const parser = new Parser();
  const quads = parser.parse(ttlContent);

  const store = new Store(quads);
  const engine = new QueryEngine();

  const result = await engine.queryBindings(sparqlQuery, {
    sources: [store]
  });

  const bindings = await result.toArray();

  return bindings.map(binding => {
    const out = {};
    for (const [key, value] of binding.entries()) {
      out[key] = value.value;
    }
    return out;
  });
}