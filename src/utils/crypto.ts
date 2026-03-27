import crypto from 'crypto';

export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf-8').digest('hex');
}

export function hmacSha256(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf-8').digest('hex');
}

export function verifySignature(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  bodyHash: string,
  signature: string
): boolean {
  const expected = hmacSha256(secret, `${method}${path}${timestamp}${bodyHash}`);
  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export function generateChecksum(data: unknown): string {
  return sha256(JSON.stringify(data));
}
