import { NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import fs from 'fs/promises';

export async function POST(request: Request) {
  let tempFilePath: string | null = null;

  try {
    const { ttlContent } = await request.json();
    if (typeof ttlContent !== 'string') {
      return NextResponse.json(
        { error: "Missing or invalid 'ttlContent' in request body" },
        { status: 400 }
      );
    }

    const tmpDir = os.tmpdir();
    const fileName = `upload_${Date.now()}.ttl`;
    tempFilePath = path.join(tmpDir, fileName);
    await writeFile(tempFilePath, ttlContent, 'utf8');

    const scriptPath = path.join(process.cwd(), 'scripts', 'optimizer.py');

    const result = await new Promise<{ stdout: string; stderr: string }>(
      async (resolve, reject) => {
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
    const content = await fs.readFile(tempFilePath, 'utf-8');
    return NextResponse.json({
      message: 'Optimization complete',
      output: result.stdout,
      content: content
    });
  } catch (error: any) {
    console.error('Error in /api/optimize:', error);
    return NextResponse.json(
      { error: error.message, details: error.stack },
      { status: 500 }
    );
  } finally {
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch {}
    }
  }
}
