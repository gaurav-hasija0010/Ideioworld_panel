'use strict';

/**
 * Minimal, dependency-free multipart/form-data parser.
 * Binary-safe: operates on the raw Buffer, never decodes file bytes to string.
 *
 * Returns { fields: {name: value}, files: {name: [{filename, contentType, data}]} }
 */
function parseMultipart(buffer, contentType) {
  const fields = {};
  const files = {};

  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields, files };

  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const CRLF = Buffer.from('\r\n');
  const HEADER_SEP = Buffer.from('\r\n\r\n');

  let pos = buffer.indexOf(boundary);
  if (pos === -1) return { fields, files };
  pos += boundary.length;

  while (pos < buffer.length) {
    // End of stream: closing boundary is "--boundary--"
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) break;
    // Skip the CRLF right after the boundary line.
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) pos += 2;

    const headerEnd = buffer.indexOf(HEADER_SEP, pos);
    if (headerEnd === -1) break;
    const headerStr = buffer.slice(pos, headerEnd).toString('utf8');
    const contentStart = headerEnd + HEADER_SEP.length;

    const nextBoundary = buffer.indexOf(boundary, contentStart);
    if (nextBoundary === -1) break;

    // Content is everything up to the CRLF that precedes the next boundary.
    let contentEnd = nextBoundary;
    if (buffer.slice(nextBoundary - CRLF.length, nextBoundary).equals(CRLF)) {
      contentEnd = nextBoundary - CRLF.length;
    }
    const content = buffer.slice(contentStart, contentEnd);

    const nameMatch = /name="([^"]*)"/i.exec(headerStr);
    const filenameMatch = /filename="([^"]*)"/i.exec(headerStr);
    const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerStr);
    const name = nameMatch ? nameMatch[1] : null;

    if (name) {
      if (filenameMatch && filenameMatch[1]) {
        (files[name] = files[name] || []).push({
          filename: filenameMatch[1],
          contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
          data: content,
        });
      } else {
        // Regular field (or an empty file input with no file chosen).
        fields[name] = content.toString('utf8');
      }
    }

    pos = nextBoundary + boundary.length;
  }

  return { fields, files };
}

module.exports = { parseMultipart };
