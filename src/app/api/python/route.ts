// app/api/optimize/route.ts  (or pages/api/optimize.ts for the pages router)

import { NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

export async function POST(request: Request) {
  let tempFilePath: string | null = null;

  try {
    // 1) Receive the raw TTL content
    const { ttlContent } = await request.json();
    if (typeof ttlContent !== 'string') {
      return NextResponse.json(
        { error: "Missing or invalid 'ttlContent' in request body" },
        { status: 400 }
      );
    }

    // 2) Write it out to a temp file
    const tmpDir = os.tmpdir();
    const fileName = `upload_${Date.now()}.ttl`;
    tempFilePath = path.join(tmpDir, fileName);
    await writeFile(tempFilePath, ttlContent, 'utf8');

    // 3) Spawn your Python optimizer script
    //    Adjust the relative path to where your script actually lives.
    const scriptPath = path.join(process.cwd(), 'scripts', 'test.py');

    const result = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const py = spawn('python3', [scriptPath, tempFilePath]);
        let stdout = '';
        let stderr = '';

        py.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        py.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        py.on('error', (err) => reject(err));
        py.on('close', (code) => {
          if (code !== 0) {
            return reject(new Error(`Python exited ${code}:\n${stderr}`));
          }
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        });
      }
    );

    // 4) Return the Python script’s output
    return NextResponse.json({
      message: 'Optimization complete',
      output: result.stdout,
    });
  } catch (error: any) {
    console.error('Error in /api/optimize:', error);
    return NextResponse.json(
      { error: error.message, details: error.stack },
      { status: 500 }
    );
  } finally {
    // 5) Clean up the temp file if it was created
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch {}
    }
  }
}
