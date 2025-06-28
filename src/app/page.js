'use client';
import { useState, useEffect, useRef } from "react";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import cytoscape from "cytoscape";

export default function Home() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [edgesList, setEdgesList] = useState([]); 
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const cyRef = useRef(null);
  const cyInstance = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setResponse("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      setResponse(data.reply || "No response");
    } catch (error) {
      setResponse("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!cyRef.current) return;

    if (cyInstance.current) {
      cyInstance.current.destroy();
    }

    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements: [
        { data: { id: 'IFCClass' } },
        { data: { id: 'Wall' } },
        { data: { id: 'Slab' } },
        { data: { id: 'Column' } },
        { data: { source: 'IFCClass', target: 'Wall', label: 'has' } },
        { data: { source: 'IFCClass', target: 'Slab', label: 'has' } },
        { data: { source: 'IFCClass', target: 'Column', label: 'has' } },
      ],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(id)',
            'background-color': '#999',
            color: '#000',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'width': '30px',
            'height': '30px',
            'text-wrap': 'wrap',
            'text-max-width': '50px',
          }
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
            'text-rotation': 'autorotate'
          }
        },
        {
          selector: '.highlighted',
          style: {
            'line-color': 'orange',
            'target-arrow-color': 'orange',
            'width': 4,
          }
        }
      ],
      layout: { name: 'cose' }
    });

    const cyEdges = cyInstance.current.edges().map(edge => {
      const source = edge.source().id();
      const target = edge.target().id();
      const label = edge.data('label');
      return { source, target, label, id: edge.id() };
    });

    setEdgesList(cyEdges);

    // ✅ Edge click handler for highlighting in list
    cyInstance.current.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const source = edge.source().id();
      const target = edge.target().id();
      const label = edge.data('label');

      const index = cyEdges.findIndex(
        (e) => e.source === source && e.target === target && e.label === label
      );

      setHighlightedIndex(index);

      // Optional: highlight edge visually
      cyInstance.current.edges().removeClass('highlighted');
      edge.addClass('highlighted');
    });

    return () => {
      if (cyInstance.current) {
        cyInstance.current.destroy();
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen p-8 pb-20 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] items-center w-full max-w-4xl mt-4">
        <form className="flex flex-col gap-2 w-full max-w-md mb-4" onSubmit={handleSubmit}>
          <Textarea
            placeholder="Type your question..."
            className="flex-1"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button type="submit" className="self-end" disabled={loading}>
            {loading ? "Sending..." : "Send"}
          </Button>
        </form>
        <div className="flex w-full h-[400px] gap-4">
          {/* Left 1/3: Dynamic edges list */}
          <div className="w-1/3 bg-white border rounded p-4 overflow-auto">
            <h2 className="font-bold mb-2">Edges</h2>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {edgesList.length === 0 ? (
                <li className="text-gray-500">Loading edges...</li>
              ) : (
                edgesList.map((edge, index) => (
                  <li
                    key={index}
                    className={`cursor-pointer transition-colors ${
                      highlightedIndex === index ? 'bg-yellow-100 font-bold' : ''
                    }`}
                  >
                    {edge.source} --[{edge.label}]→ {edge.target}
                  </li>
                ))
              )}
            </ul>
          </div>
          {/* Right 2/3: IFC Graph */}
          <div className="w-2/3 bg-gray-100 border rounded p-0 flex items-center justify-center">
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