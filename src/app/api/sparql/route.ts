import { NextResponse } from 'next/server';
import { queryTtlWithSparql } from '../../../lib/queryTtlWithSparql';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { sparqlQuery, ttlContent: uploadedTtlContent } = await request.json();
    
    if (!sparqlQuery) {
      return NextResponse.json({ error: 'SPARQL query is required' }, { status: 400 });
    }

    // Use uploaded TTL content if provided, otherwise load the default file
    let ttlContent;
    if (uploadedTtlContent) {
      ttlContent = uploadedTtlContent;
    } else {
      const ttlPath = path.join(process.cwd(), 'public', 'data', 'ifc_graph.ttl');
      ttlContent = fs.readFileSync(ttlPath, 'utf-8');
    }

    // Execute the SPARQL query
    const results = await queryTtlWithSparql(ttlContent, sparqlQuery);

    return NextResponse.json({ 
      results,
      query: sparqlQuery,
      count: results.length
    });
  } catch (error: any) {
    console.error('SPARQL query error:', error);
    return NextResponse.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
} 