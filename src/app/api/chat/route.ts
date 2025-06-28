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

    // First, ask OpenAI to analyze if this question can be answered with SPARQL
    const analysisPrompt = `You are an expert in building information modeling (BIM) and SPARQL queries. 

I have a TTL (Turtle) file containing building data with the following structure:
- Building elements: Storey, Wall, Column, Slab, FloorSlab, RoofSlab
- Properties: location, rotation, size, label
- Relationships: containsElement, adjacentElement, adjacentZone, intersectsElement, isAbove, isBelow

The data uses these prefixes:
- bot: <https://w3id.org/bot#>
- botAiLab: <http://www.aiLab.org/botAiLab#>
- rdfs: <http://www.w3.org/2000/01/rdf-schema#>

User question: "${message}"

Please analyze this question and respond with a JSON object in this exact format:
{
  "canAnswerWithSparql": true/false,
  "reasoning": "explanation of why this can or cannot be answered with SPARQL",
  "sparqlQuery": "the SPARQL query if canAnswerWithSparql is true, otherwise null",
  "recommendedQuestions": ["list of 3-5 relevant questions about the building data that can be answered"]
}

Only respond with the JSON object, no other text.`;

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
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json({ 
      error: error.message,
      reply: "I'm having trouble processing your request. Please try asking about building elements like storeys, walls, columns, or their relationships."
    }, { status: 500 });
  }
}
