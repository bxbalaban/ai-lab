'use client';
import { useState } from "react";
import { Textarea } from "../components/ui/textarea"
import { Button } from "../components/ui/button";

export default function Home() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    console.log('Input message:', message);

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
      console.log('API response:', data);
    } catch (error) {
      setResponse("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

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
          {/* Left 1/3: List of items */}
          <div className="w-1/3 bg-white border rounded p-4 overflow-auto">
            <h2 className="font-bold mb-2">Items</h2>
            <ul className="list-disc pl-5">
              <li>Item 1</li>
              <li>Item 2</li>
              <li>Item 3</li>
              <li>Item 4</li>
            </ul>
          </div>
          {/* Right 2/3: GraphQL Graph Placeholder */}
          <div className="w-2/3 bg-gray-100 border rounded p-4 flex items-center justify-center">
            <span className="text-gray-500">GraphQL Graph Placeholder</span>
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
