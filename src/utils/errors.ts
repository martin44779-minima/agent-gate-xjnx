export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, 'ERR_VALIDATION');
    this.details = details;
  }
}

export class AuthError extends AppError {
  constructor(message = '认证失败') {
    super(message, 401, 'ERR_AUTH_FAILED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '访问被拒绝') {
    super(message, 403, 'ERR_FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(message, 404, 'ERR_NOT_FOUND');
  }
}

export class AgentError extends AppError {
  public readonly retryable: boolean;
  public readonly errorCode: string;

  constructor(message: string, errorCode: string, retryable: boolean) {
    super(message, 502, errorCode);
    this.retryable = retryable;
    this.errorCode = errorCode;
  }
}

export class CallbackError extends AppError {
  constructor(message: string) {
    super(message, 502, 'ERR_CALLBACK');
  }
}
