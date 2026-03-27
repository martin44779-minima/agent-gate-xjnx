export const submitSchema = {
  type: 'object',
  required: ['upstreamId', 'basicInfo', 'flowInfo'],
  properties: {
    upstreamId: { type: 'string', maxLength: 64 },
    caseId: { type: 'string', maxLength: 64 },
    callbackUrl: { type: 'string', format: 'uri' },
    basicInfo: { type: 'object' },
    flowInfo: { oneOf: [{ type: 'object' }, { type: 'array' }] },
    historyInfo: { oneOf: [{ type: 'object' }, { type: 'array' }] },
  },
  additionalProperties: false,
};
