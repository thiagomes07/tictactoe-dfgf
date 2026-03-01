export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  statusCode: number;
}
