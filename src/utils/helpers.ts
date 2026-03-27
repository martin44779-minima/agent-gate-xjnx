import { v4 as uuidv4 } from 'uuid';

export function generateUUID(): string {
  return uuidv4();
}

export function nowDatetime(): Date {
  return new Date();
}

export function calcByteSize(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data), 'utf-8');
}

export function calcCostMs(startTime: Date, endTime: Date): number {
  return endTime.getTime() - startTime.getTime();
}
