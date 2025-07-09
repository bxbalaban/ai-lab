import { NextResponse } from 'next/server';
import openai from '../../../lib/openai';
import { queryTtlWithSparql } from '../../../lib/queryTtlWithSparql';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { message, ttlContent: uploadedTtlContent } = await request.json();
    
    // Use uploaded TTL content if provided, otherwise load the default file
    let ttlContent;
    if (uploadedTtlContent) {
      ttlContent = uploadedTtlContent;
    } else {
      const ttlPath = path.join(process.cwd(), 'public', 'data', 'ifc_graph.ttl');
      ttlContent = fs.readFileSync(ttlPath, 'utf-8');
    }

    // --- SPARQL detection logic ---
    // 1. Detect if message is a SPARQL query
    const sparqlStartRegex = /^(PREFIX|SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i;
    // 2. Detect if message is a request for a SPARQL query
    const sparqlRequestRegex = /(write|give|show|generate|create|provide) (me )?(a |the )?(sparql|SPARQL) (query|statement)/i;

    if (sparqlStartRegex.test(message.trim())) {
      // User provided a SPARQL query directly
      try {
        const results = await queryTtlWithSparql(ttlContent, message);
        const resultText = results.length > 0 
          ? `Found ${results.length} result(s):\n${JSON.stringify(results, null, 2)}`
          : "No results found for your query.";
        return NextResponse.json({
          reply: `You provided a SPARQL query. Here are the results:\n\n${resultText}`,
          sparqlQuery: message,
          results: results
        });
      } catch (sparqlError) {
        return NextResponse.json({
          reply: `There was an error executing your SPARQL query: ${sparqlError.message}`,
          sparqlQuery: message
        });
      }
    } else if (sparqlRequestRegex.test(message.trim())) {
      // User is asking for a SPARQL query to be generated
      const prompt = `You are an expert in building information modeling (BIM) and SPARQL queries.\n\nGiven the following user request, write ONLY the SPARQL query (with PREFIX declarations) that would answer it, using the correct ontology as described below.\n\nOntology:\n- Building elements: Storey, Wall, Column, Slab, FloorSlab, RoofSlab\n- Properties: location, rotation, size, label\n- Relationships: containsElement, adjacentElement, adjacentZone, intersectsElement, isAbove, isBelow\n- Prefixes:\n  - bot: <https://w3id.org/bot#> (for Storey, Building, Site)\n  - botAiLab: <http://www.aiLab.org/botAiLab#> (for Wall, Column, Slab, FloorSlab, RoofSlab)\n  - rdfs: <http://www.w3.org/2000/01/rdf-schema#> (for label property)\n\nCRITICAL RULES:\n- Storey elements use: ?element a bot:Storey . ?element rdfs:label ?label .\n- Wall, Column, Slab, FloorSlab, RoofSlab elements use: ?element a botAiLab:Wall . ?element rdfs:label ?label . (or botAiLab:Column, botAiLab:Slab, etc.)\n- NEVER use bot:Wall, bot:Column, or bot:Slab (these do not exist).\n- ALWAYS include rdfs:label for readable names in SELECT and WHERE.\n- ALWAYS include the PREFIX declarations in your SPARQL query.\n\nUser request: "${message}"\n\nOnly output the SPARQL query, nothing else.`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      });
      const sparqlQuery = completion.choices[0].message.content.trim();
      // Try to execute the generated query
      try {
        const results = await queryTtlWithSparql(ttlContent, sparqlQuery);
        const resultText = results.length > 0 
          ? `Found ${results.length} result(s):\n${JSON.stringify(results, null, 2)}`
          : "No results found for your query.";
        return NextResponse.json({
          reply: `Here is a SPARQL query for your request, and the results:\n\n${resultText}`,
          sparqlQuery: sparqlQuery,
          results: results
        });
      } catch (sparqlError) {
        return NextResponse.json({
          reply: `Here is a SPARQL query for your request, but there was an error executing it: ${sparqlError.message}`,
          sparqlQuery: sparqlQuery
        });
      }
    } else {
      // First, ask OpenAI to analyze if this question can be answered with SPARQL
      const analysisPrompt = `
      You are an expert in building information modeling (BIM) and SPARQL queries.
      
      I have a TTL (Turtle) file containing building data with the following structure:
      - Building elements: Storey, Wall, Column, Slab, FloorSlab, RoofSlab
      - Properties: location, rotation, size, label
      - Relationships: containsElement, adjacentElement, adjacentZone, intersectsElement, isAbove, isBelow
      
      The data uses these prefixes:
      - bot: <https://w3id.org/bot#> (for Storey, Building, Site)
      - botAiLab: <http://www.aiLab.org/botAiLab#> (for Wall, Column, Slab, FloorSlab, RoofSlab)
      - rdfs: <http://www.w3.org/2000/01/rdf-schema#> (for label property)
      
      CRITICAL RULES:
      - Storey elements use: ?element a bot:Storey . ?element rdfs:label ?label .
      - Wall, Column, Slab, FloorSlab, RoofSlab elements use: ?element a botAiLab:Wall . ?element rdfs:label ?label . (or botAiLab:Column, botAiLab:Slab, etc.)
      - NEVER use bot:Wall, bot:Column, or bot:Slab (these do not exist).
      - ALWAYS include rdfs:label for readable names in SELECT and WHERE.
      - ALWAYS include the PREFIX declarations in your SPARQL query.
      
      EXAMPLES (CORRECT):
      - Find all walls:
      PREFIX botAiLab: <http://www.aiLab.org/botAiLab#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?wall ?label WHERE { ?wall a botAiLab:Wall . ?wall rdfs:label ?label . }
      
      - Find all storeys:
      PREFIX bot: <https://w3id.org/bot#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?storey ?label WHERE { ?storey a bot:Storey . ?storey rdfs:label ?label . }
      
      EXAMPLES (INCORRECT, DO NOT DO THIS!):
      - DO NOT use: ?wall a bot:Wall .
      - DO NOT use: ?column a bot:Column .
      - DO NOT use: ?slab a bot:Slab .
      
      User question: "${message}"
      
      Please analyze this question and respond with a JSON object in this exact format:
      {
        "canAnswerWithSparql": true/false,
        "reasoning": "explanation of why this can or cannot be answered with SPARQL",
        "sparqlQuery": "the SPARQL query if canAnswerWithSparql is true, otherwise null",
        "recommendedQuestions": ["list of 3-5 relevant questions about the building data that can be answered"]
      }
      
      Only respond with the JSON object, no other text.
      `;

      const analysisCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: analysisPrompt }],
        temperature: 0.1,
      });

      const analysisText = analysisCompletion.choices[0].message.content;
      let analysis;
      
      try {
        analysis = JSON.parse(analysisText);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', analysisText);
        return NextResponse.json({ 
          error: "Failed to analyze question",
          reply: "I'm having trouble analyzing your question. Please try asking about building elements like storeys, walls, columns, or their relationships."
        });
      }

      if (analysis.canAnswerWithSparql && analysis.sparqlQuery) {
        try {
          // Execute the SPARQL query
          const results = await queryTtlWithSparql(ttlContent, analysis.sparqlQuery);
          
          // Format the results for display
          const resultText = results.length > 0 
            ? `Found ${results.length} result(s):\n${JSON.stringify(results, null, 2)}`
            : "No results found for your query.";
          
          return NextResponse.json({ 
            reply: `I can answer this with SPARQL!\n\n${resultText}`,
            sparqlQuery: analysis.sparqlQuery,
            results: results
          });
        } catch (sparqlError) {
          return NextResponse.json({ 
            reply: `I tried to answer with SPARQL but encountered an error: ${sparqlError.message}. Here are some recommended questions you can ask instead:\n\n${analysis.recommendedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
          });
        }
      } else {
        // Question cannot be answered with SPARQL
        const recommendationText = analysis.recommendedQuestions.length > 0
          ? `\n\nHere are some questions you can ask about this building data:\n${analysis.recommendedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
          : "";
        
        return NextResponse.json({ 
          reply: `I can't answer that question with the building data I have available. ${analysis.reasoning}${recommendationText}`
        });
      }
    }
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json({ 
      error: error.message,
      reply: "I'm having trouble processing your request. Please try asking about building elements like storeys, walls, columns, or their relationships."
    }, { status: 500 });
  }
}
