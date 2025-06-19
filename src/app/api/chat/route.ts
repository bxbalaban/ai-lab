import { NextResponse } from 'next/server';
import openai from '../../../lib/openai';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: message }],
    });
    return NextResponse.json({ reply: completion.choices[0].message.content });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
