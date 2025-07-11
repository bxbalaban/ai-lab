'use client';
import { useState, useEffect, useRef } from "react";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import cytoscape from "cytoscape";
import { parseTtlToGraph } from "../lib/parseTtlToGraph";
import STLViewer from "../components/STLViewer";

export default function Home() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [edgesList, setEdgesList] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [mode, setMode] = useState("chat"); // "chat" or "sparql"
  const [sparqlResults, setSparqlResults] = useState(null);
  const [uploadedTtlContent, setUploadedTtlContent] = useState(null);
  const [stlUrl, setStlUrl] = useState(null);
  const [optimizedTtlContent, setOptimizedTtlContent] = useState(null);
  const [viewMode, setViewMode] = useState("stl"); // "stl" or "graph"
  const dialogRef = useRef(null);

  const cyRef = useRef(null);
  const cyInstance = useRef(null);

  const [blenderTtlContent, setBlenderTtlContent] = useState(null);
  const [showBlenderTtlModal, setShowBlenderTtlModal] = useState(false);
  const lastBlenderTtlRef = useRef(null);

  // Poll Blender addon's Flask server every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:5000/view");
        if (res.ok) {
          const ttl = await res.text();
          if (ttl && ttl !== lastBlenderTtlRef.current) {
            setBlenderTtlContent(ttl);
            setShowBlenderTtlModal(true);
            lastBlenderTtlRef.current = ttl;
          }
        }
      } catch (err) {
        // Ignore errors (e.g., server not running)
      }
    }, 60000); // 60 seconds
    return () => clearInterval(interval);
  }, []);

  // TTL File Management (Sidebar)
  const [ttlFiles, setTtlFiles] = useState([]); // {id, name, content, timestamp}
  const [selectedTtlId, setSelectedTtlId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  // Load TTL files from localStorage on mount
  useEffect(() => {
    const files = JSON.parse(localStorage.getItem("ttlFiles") || "[]");
    setTtlFiles(files);
  }, []);

  // Save TTL files to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("ttlFiles", JSON.stringify(ttlFiles));
  }, [ttlFiles]);

  // Helper to add a new TTL file
  const addTtlFile = (content, name = null) => {
    const timestamp = Date.now();
    const id = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultName = name || `TTL ${new Date(timestamp).toLocaleString()}`;
    const newFile = { id, name: defaultName, content, timestamp };
    setTtlFiles(prev => [newFile, ...prev]);
    setSelectedTtlId(id);
  };

  // When a TTL is uploaded, accepted from Blender, or optimized, save it
  useEffect(() => {
    if (uploadedTtlContent && !ttlFiles.some(f => f.content === uploadedTtlContent)) {
      addTtlFile(uploadedTtlContent, "Uploaded TTL");
    }
  }, [uploadedTtlContent]);
  useEffect(() => {
    if (optimizedTtlContent) {
      addTtlFile(optimizedTtlContent, "Optimized TTL");
    }
  }, [optimizedTtlContent]);
  useEffect(() => {
    if (blenderTtlContent && !ttlFiles.some(f => f.content === blenderTtlContent)) {
      addTtlFile(blenderTtlContent, "Blender TTL");
      // Save as .ttl file
      const blob = new Blob([blenderTtlContent], { type: 'text/turtle' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `blender-${timestamp}.ttl`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [blenderTtlContent]);

  // When user selects a file from sidebar, set as current TTL
  useEffect(() => {
    if (!selectedTtlId) return;
    const file = ttlFiles.find(f => f.id === selectedTtlId);
    if (file) {
      setUploadedTtlContent(file.content);
      setOptimizedTtlContent(null);
      setMessage("");
    }
  }, [selectedTtlId]);

  // Sidebar UI
  const Sidebar = () => (
    <aside className="fixed left-0 top-0 h-full w-64 bg-gray-50 border-r p-4 overflow-y-auto z-20">
      <h2 className="font-bold text-lg mb-4">TTL Files</h2>
      <ul className="space-y-2">
        {ttlFiles.length === 0 && <li className="text-gray-400">No TTL files saved</li>}
        {ttlFiles.map(file => (
          <li key={file.id} className={`p-2 rounded border ${selectedTtlId === file.id ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-200'}`}> 
            {renameId === file.id ? (
              <form onSubmit={e => { e.preventDefault(); setTtlFiles(ttlFiles.map(f => f.id === file.id ? { ...f, name: renameValue } : f)); setRenameId(null); }} className="flex gap-1">
                <input value={renameValue} onChange={e => setRenameValue(e.target.value)} className="border rounded px-1 text-sm flex-1" autoFocus />
                <button type="submit" className="text-green-600 text-xs">Save</button>
                <button type="button" onClick={() => setRenameId(null)} className="text-xs text-gray-500">Cancel</button>
              </form>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm truncate" title={file.name}>{file.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(file.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex gap-1 mt-1">
                  <button onClick={() => setSelectedTtlId(file.id)} className="text-blue-600 text-xs">Use</button>
                  <button onClick={() => { setRenameId(file.id); setRenameValue(file.name); }} className="text-yellow-600 text-xs">Rename</button>
                  <button onClick={() => setTtlFiles(ttlFiles.filter(f => f.id !== file.id))} className="text-red-600 text-xs">Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );

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
    },
    {
      name: "Find all Storeys",
      query: `PREFIX bot: <https://w3id.org/bot#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?storey ?label
WHERE {
  ?storey a bot:Storey .
  ?storey rdfs:label ?label .
}`
    }
  ];

  const loadExampleQuery = (query) => {
    setMessage(query);
  };


  
  const handleOptimize = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/optimizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlContent: uploadedTtlContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setUploadedTtlContent(data.content);
      setOptimizedTtlContent(data.content);
      setModalContent(`✅ Python finished:\n${data.output}`);
      dialogRef.current?.showModal();
    } catch (err) {
      console.error(err);
      setModalContent(`🚨 Optimization failed:\n${err.message}`);
      dialogRef.current?.showModal();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setResponse("");
    setSparqlResults(null);

    // Use optimized TTL if available, otherwise uploaded TTL
    const ttlToUse = optimizedTtlContent || uploadedTtlContent;

    try {
      if (mode === "sparql") {
        // Handle SPARQL query
        const res = await fetch("/api/sparql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sparqlQuery: message,
            ttlContent: ttlToUse
          }),
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
          body: JSON.stringify({ 
            message,
            ttlContent: ttlToUse
          }),
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
    if (!cyRef.current || viewMode !== "graph") return;

    const loadAndRenderGraph = async () => {
      try {
        let ttlContent;
        if (optimizedTtlContent) {
          ttlContent = optimizedTtlContent;
        } else if (uploadedTtlContent) {
          ttlContent = uploadedTtlContent;
        } else {
          const res = await fetch("/data/ifc_graph.ttl");
          ttlContent = await res.text();
        }
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
  }, [optimizedTtlContent, uploadedTtlContent, viewMode]);

  return (
    <div className="flex flex-row min-h-screen">
      <Sidebar />
      <div className="flex flex-col items-center flex-1 p-8 pb-20 sm:p-20">
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
            {/* TTL File Status */}
            <div className="text-sm text-gray-600 mb-2">
              {optimizedTtlContent ? (
                <span className="text-green-600">✓ Using optimized TTL file</span>
              ) : uploadedTtlContent ? (
                <span className="text-green-600">✓ Using uploaded TTL file</span>
              ) : (
                <span className="text-blue-600">📁 Using default ifc_graph.ttl</span>
              )}
            </div>
            
            {/* Upload/Optimize/Clear/Upload STL Buttons */}
            <div className="flex gap-2">
              <input
                type="file"
                accept=".ttl,.txt"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = event.target.result;
                      setUploadedTtlContent(content);
                    };
                    reader.readAsText(file);
                  }
                }}
                className="hidden"
                id="ttl-upload"
              />
              <label
                htmlFor="ttl-upload"
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer text-sm text-center"
              >
                Upload TTL File
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!uploadedTtlContent) {
                    setModalContent('Please upload a TTL file before optimizing.');
                    dialogRef.current?.showModal();
                    return;
                  }
                  handleOptimize();
                }}
                className={`px-3 py-2 text-white rounded text-sm text-center ${uploadedTtlContent ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-300 cursor-not-allowed'}`}
                disabled={!uploadedTtlContent}
              >
                Optimize TTL
              </button>
              {optimizedTtlContent ? (
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([optimizedTtlContent], { type: 'text/turtle' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'optimized.ttl';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm text-center"
                >
                  Download Optimized TTL
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-3 py-2 bg-gray-300 text-white rounded text-sm text-center cursor-not-allowed"
                >
                  Download Optimized TTL
                </button>
              )}
              <dialog ref={dialogRef} className="p-4 rounded-lg shadow-lg">
                <pre style={{ whiteSpace: 'pre-wrap' }}>{modalContent}</pre>
                <div style={{ textAlign: 'right', marginTop: '1em' }}>
                  <button onClick={() => dialogRef.current?.close()}>Close</button>
                </div>
              </dialog>
              {/* Upload STL Button */}
              <input
                type="file"
                accept=".stl"
                id="stl-upload"
                className="hidden"
                onChange={e => {
                  const file = e.target.files[0];
                  if (file) setStlUrl(URL.createObjectURL(file));
                }}
              />
              <label
                htmlFor="stl-upload"
                className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 cursor-pointer text-sm text-center"
              >
                Upload STL File
              </label>
              {uploadedTtlContent && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadedTtlContent(null);
                    setOptimizedTtlContent(null);
                    setMessage("");
                  }}
                  className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm text-center"
                >
                  Clear TTL
                </button>
              )}
            </div>
            
            {/* Text Area */}
            <Textarea
              placeholder={mode === "sparql" ? "Enter your SPARQL query..." : "Type your question..."}
              className="w-full"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            
            {/* Send Button */}
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

          <div className="flex w-full justify-center items-center gap-4 mb-4">
            <Button
              variant={viewMode === "stl" ? "default" : "outline"}
              onClick={() => setViewMode("stl")}
            >
              Show STL
            </Button>
            <Button
              variant={viewMode === "graph" ? "default" : "outline"}
              onClick={() => setViewMode("graph")}
            >
              Show Graph
            </Button>
          </div>

          <div className="flex w-full h-[400px] justify-center items-center">
            {/* Conditionally render STL Viewer or Cytoscape Graph */}
            {viewMode === "stl" ? (
              <div className="bg-gray-100 border rounded flex flex-col items-center justify-center w-full max-w-3xl">
                <div style={{ width: '100%', height: '350px' }}>
                  <STLViewer url={stlUrl || '/data/model.stl'} />
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 border rounded flex flex-col items-center justify-center w-full max-w-3xl" style={{ width: '100%', height: '350px' }}>
                <div ref={cyRef} style={{ width: '100%', height: '100%' }} />
              </div>
            )}
          </div>

          {response && (
            <div className="w-full p-4 border rounded bg-muted text-sm whitespace-pre-line">
              {response}
            </div>
          )}

          {/* Blender TTL Modal */}
          {showBlenderTtlModal && (
            <dialog open className="p-4 rounded-lg shadow-lg">
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                A new TTL file was generated by Blender. Do you want to use this file?
              </pre>
              <div style={{ textAlign: 'right', marginTop: '1em' }}>
                <button
                  onClick={() => {
                    setUploadedTtlContent(blenderTtlContent);
                    setOptimizedTtlContent(null);
                    setShowBlenderTtlModal(false);
                    setMessage("");
                  }}
                  className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm text-center mr-2"
                >
                  Yes, use this TTL
                </button>
                <button
                  onClick={() => setShowBlenderTtlModal(false)}
                  className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm text-center"
                >
                  No, ignore
                </button>
              </div>
            </dialog>
          )}
        </main>
      </div>
    </div>
  );
}