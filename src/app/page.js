'use client';
import { useState, useEffect, useRef } from "react";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import cytoscape from "cytoscape";
import { parseTtlToGraph } from "../lib/parseTtlToGraph";

export default function Home() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [edgesList, setEdgesList] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [mode, setMode] = useState("chat"); // "chat" or "sparql"
  const [sparqlResults, setSparqlResults] = useState(null);

  const cyRef = useRef(null);
  const cyInstance = useRef(null);

  // Example SPARQL queries
  const exampleQueries = [
    {
      name: "Find all Storey elements",
      query: `PREFIX bot: <https://w3id.org/bot#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?storey ?label
WHERE {
  ?storey a bot:Storey .
  ?storey rdfs:label ?label .
}`
    },
    {
      name: "Find all Walls",
      query: `PREFIX botAiLab: <http://www.aiLab.org/botAiLab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?wall ?label
WHERE {
  ?wall a botAiLab:Wall .
  ?wall rdfs:label ?label .
}`
    },
    {
      name: "Find all Columns",
      query: `PREFIX botAiLab: <http://www.aiLab.org/botAiLab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?column ?label
WHERE {
  ?column a botAiLab:Column .
  ?column rdfs:label ?label .
}`
    },
    {
      name: "Find elements in Storey 1",
      query: `PREFIX bot: <https://w3id.org/bot#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?element ?label
WHERE {
  ?storey a bot:Storey .
  ?storey rdfs:label "Storey 1" .
  ?storey bot:containsElement ?element .
  ?element rdfs:label ?label .
}`
    },
    {
      name: "Find all Slabs",
      query: `PREFIX botAiLab: <http://www.aiLab.org/botAiLab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?slab ?label
WHERE {
  ?slab a botAiLab:Slab .
  ?slab rdfs:label ?label .
}`
    }
  ];

  const loadExampleQuery = (query) => {
    setMessage(query);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setResponse("");
    setSparqlResults(null);

    try {
      if (mode === "sparql") {
        // Handle SPARQL query
        const res = await fetch("/api/sparql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sparqlQuery: message }),
        });

        const data = await res.json();
        if (data.error) {
          setResponse("SPARQL Error: " + data.error);
        } else {
          setSparqlResults(data);
          setResponse(`SPARQL Query executed successfully. Found ${data.count} results.`);
        }
      } else {
        // Handle regular chat
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });

        const data = await res.json();
        setResponse(data.reply || "No response");
        
        // If the chat response includes SPARQL results, display them
        if (data.results && data.sparqlQuery) {
          setSparqlResults({
            results: data.results,
            query: data.sparqlQuery,
            count: data.results.length
          });
        }
      }
    } catch (error) {
      setResponse("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!cyRef.current) return;

    const loadAndRenderGraph = async () => {
      try {
        const res = await fetch("/data/ifc_graph.ttl");
        const ttlContent = await res.text();
        const { nodes, edges, edgesRaw } = await parseTtlToGraph(ttlContent);

        if (cyInstance.current) {
          cyInstance.current.destroy();
        }

        cyInstance.current = cytoscape({
          container: cyRef.current,
          elements: [...nodes, ...edges],
          style: [
            {
              selector: 'node',
              style: {
                label: 'data(label)', // ✅ Use label, not id
                'background-color': '#999',
                color: '#000',
                'text-valign': 'center',
                'text-halign': 'center',
                'font-size': '12px',
                'width': '30px',
                'height': '30px',
                'text-wrap': 'wrap',
                'text-max-width': '50px',
              },
            },
            {
              selector: 'node[label *= "Storey"]',
              style: {
                'background-color': 'blue', // ✅ BLUE for Storey
              },
            },
            {
              selector: 'node[label *= "Wall"]',
              style: {
                'background-color': 'red', // Optional: RED for Wall
              },
            },
            {
              selector: 'node[label *= "Column"]',
              style: {
                'background-color': 'green', // Optional: GREEN for Column
              },
            },
            {
              selector: 'edge',
              style: {
                label: 'data(label)',
                'curve-style': 'bezier',
                'target-arrow-shape': 'triangle',
                'line-color': '#ccc',
                'target-arrow-color': '#ccc',
                'width': 2,
                'font-size': '10px',
                'text-rotation': 'autorotate',
              },
            },
            {
              selector: '.highlighted',
              style: {
                'line-color': 'green',
                'target-arrow-color': 'green',
                'width': 4,
              },
            },
          ],
          layout: { name: 'cose' },
        });

        setEdgesList(edgesRaw);

        cyInstance.current.on("tap", "edge", (evt) => {
          const edge = evt.target;
          const source = edge.source().id();
          const target = edge.target().id();
          const label = edge.data("label");

          const index = edgesRaw.findIndex(
            (e) =>
              e.source === source && e.target === target && e.label === label
          );

          setHighlightedIndex(index);

          cyInstance.current.edges().removeClass("highlighted");
          edge.addClass("highlighted");
        });
      } catch (error) {
        console.error("Error loading TTL or initializing graph:", error);
      }
    };

    loadAndRenderGraph();

    return () => {
      if (cyInstance.current) {
        cyInstance.current.destroy();
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen p-8 pb-20 sm:p-20">
      <main className="flex flex-col gap-8 items-center w-full max-w-4xl">
        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "chat" ? "default" : "outline"}
            onClick={() => setMode("chat")}
          >
            Chat
          </Button>
          <Button
            variant={mode === "sparql" ? "default" : "outline"}
            onClick={() => setMode("sparql")}
          >
            SPARQL Query
          </Button>
        </div>

        <form className="flex flex-col gap-2 w-full max-w-md" onSubmit={handleSubmit}>
          <Textarea
            placeholder={mode === "sparql" ? "Enter your SPARQL query..." : "Type your question..."}
            className="flex-1"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button type="submit" className="self-end" disabled={loading}>
            {loading ? "Sending..." : mode === "sparql" ? "Execute Query" : "Send"}
          </Button>
        </form>

        {/* Example SPARQL Queries */}
        {mode === "sparql" && (
          <div className="w-full max-w-md">
            <h3 className="font-bold mb-2">Example Queries:</h3>
            <div className="space-y-2">
              {exampleQueries.map((example, index) => (
                <button
                  key={index}
                  onClick={() => loadExampleQuery(example.query)}
                  className="block w-full text-left p-2 text-sm bg-gray-100 hover:bg-gray-200 rounded border"
                >
                  {example.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SPARQL Results */}
        {sparqlResults && (
          <div className="w-full p-4 border rounded bg-blue-50">
            <h3 className="font-bold mb-2">SPARQL Results ({sparqlResults.count} results)</h3>
            <div className="text-sm mb-2">
              <strong>Query:</strong> {sparqlResults.query}
            </div>
            <div className="max-h-60 overflow-auto">
              <pre className="text-xs bg-white p-2 rounded border">
                {JSON.stringify(sparqlResults.results, null, 2)}
              </pre>
            </div>
          </div>
        )}

        <div className="flex w-full h-[400px] gap-4">
          {/* Left: Edges List */}
          <div className="w-1/3 bg-white border rounded p-4 overflow-auto">
            <h2 className="font-bold mb-2">Edges</h2>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {edgesList.length === 0 ? (
                <li className="text-gray-500">Loading edges...</li>
              ) : (
                edgesList.map((edge, index) => (
                  <li
                    key={index}
                    className={`cursor-pointer transition-colors rounded px-1 ${highlightedIndex === index ? "bg-green-200 font-bold" : ""
                      }`}
                  >
                    {edge.source} --[{edge.label}]→ {edge.target}
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Right: Graph */}
          <div className="w-2/3 bg-gray-100 border rounded flex items-center justify-center">
            <div ref={cyRef} className="w-full h-[400px]" />
          </div>
        </div>

        {response && (
          <div className="w-full p-4 border rounded bg-muted text-sm whitespace-pre-line">
            {response}
          </div>
        )}
      </main>
    </div>
  );
}