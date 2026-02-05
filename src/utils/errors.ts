export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  HMAC_VERIFICATION_FAILED = 'HMAC_VERIFICATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export interface AppErrorData {
  type: ErrorType;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  traceId?: string;
}

export class AppError extends Error implements AppErrorData {
  type: ErrorType;
  statusCode: number;
  details?: Record<string, unknown>;
  traceId?: string;

  constructor(data: AppErrorData) {
    super(data.message);
    this.type = data.type;
    this.statusCode = data.statusCode;
    this.details = data.details;
    this.traceId = data.traceId;
    this.name = 'AppError';

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): Omit<AppErrorData, 'statusCode'> & { error: string } {
    return {
      error: this.message,
      type: this.type,
      message: this.message,
      details: this.details,
      traceId: this.traceId,
    };
  }
}

export function createValidationError(
  message: string,
  details?: Record<string, unknown>,
  traceId?: string
): AppError {
  return new AppError({
    type: ErrorType.VALIDATION_ERROR,
    message,
    statusCode: 400,
    details,
    traceId,
  });
}

export function createHmacError(message: string, traceId?: string): AppError {
  return new AppError({
    type: ErrorType.HMAC_VERIFICATION_FAILED,
    message,
    statusCode: 401,
    traceId,
  });
}

export function createNotFoundError(message: string, traceId?: string): AppError {
  return new AppError({
    type: ErrorType.NOT_FOUND,
    message,
    statusCode: 404,
    traceId,
  });
}

export function createDatabaseError(
  message: string,
  details?: Record<string, unknown>,
  traceId?: string
): AppError {
  return new AppError({
    type: ErrorType.DATABASE_ERROR,
    message,
    statusCode: 500,
    details,
    traceId,
  });
}

export function createUnauthorizedError(message: string, traceId?: string): AppError {
  return new AppError({
    type: ErrorType.UNAUTHORIZED,
    message,
    statusCode: 401,
    traceId,
  });
}

export function createInternalError(
  message: string,
  details?: Record<string, unknown>,
  traceId?: string
): AppError {
  return new AppError({
    type: ErrorType.INTERNAL_ERROR,
    message,
    statusCode: 500,
    details,
    traceId,
  });
}

export function createError(data: AppErrorData): AppError {
  return new AppError(data);
}
