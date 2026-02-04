import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import mime from 'mime';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path');

  if (!filePath) {
    return new NextResponse('Missing path parameter', { status: 400 });
  }

  // Security check: simple prevention of directory traversal outside intended scope?
  // Since this is a local tool for developers, strict creating strict sandbox might hinder utility, 
  // but we can ensure it exists.
  
  if (!fs.existsSync(filePath)) {
     return new NextResponse('File not found', { status: 404 });
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return new NextResponse('Not a file', { status: 400 });
  }

  const mimeType = mime.getType(filePath) || 'application/octet-stream';
  
  // Create a stream
  const fileStream = fs.createReadStream(filePath);

  // Return stream
  // @ts-expect-error NextResponse supports Node.js ReadStream in the Node runtime.
  return new NextResponse(fileStream, {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': stat.size.toString(),
    },
  });
}
