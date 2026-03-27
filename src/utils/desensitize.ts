export function maskIdCard(idNumber: string): string {
  if (!idNumber || idNumber.length < 10) return idNumber;
  const front = idNumber.slice(0, 6);
  const back = idNumber.slice(-4);
  const masked = '*'.repeat(idNumber.length - 10);
  return `${front}${masked}${back}`;
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  const front = phone.slice(0, 3);
  const back = phone.slice(-4);
  return `${front}${'*'.repeat(phone.length - 7)}${back}`;
}

export function maskName(name: string): string {
  if (!name || name.length <= 1) return name;
  return name[0] + '*'.repeat(name.length - 1);
}

const SENSITIVE_FIELDS: Record<string, (v: string) => string> = {
  idNumber: maskIdCard,
  idCard: maskIdCard,
  certNo: maskIdCard,
  phone: maskPhone,
  mobile: maskPhone,
  telephone: maskPhone,
  name: maskName,
  customerName: maskName,
};

export function deepDesensitize<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => deepDesensitize(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const maskFn = SENSITIVE_FIELDS[key];
      if (maskFn && typeof value === 'string') {
        result[key] = maskFn(value);
      } else if (typeof value === 'object') {
        result[key] = deepDesensitize(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }
  return obj;
}
