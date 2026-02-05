import {
  AppError,
  ErrorType,
  createValidationError,
  createHmacError,
  createNotFoundError,
  createDatabaseError,
  createUnauthorizedError,
  createInternalError,
} from '../../src/utils/errors';

describe('AppError Class', () => {
  it('should create an AppError instance', () => {
    const error = new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message: 'Test error',
      statusCode: 400,
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
  });

  it('should include details and traceId', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const traceId = 'trace-123';

    const error = new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message: 'Validation failed',
      statusCode: 400,
      details,
      traceId,
    });

    expect(error.details).toEqual(details);
    expect(error.traceId).toBe(traceId);
  });

  it('should convert error to JSON', () => {
    const error = new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message: 'Test error',
      statusCode: 400,
      traceId: 'trace-123',
    });

    const json = error.toJSON();
    expect(json).toHaveProperty('error');
    expect(json).toHaveProperty('type', ErrorType.VALIDATION_ERROR);
    expect(json).toHaveProperty('message');
    expect(json).toHaveProperty('traceId');
  });

  it('should create validation error', () => {
    const error = createValidationError('Invalid input', { field: 'age' }, 'trace-123');

    expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid input');
    expect(error.details).toEqual({ field: 'age' });
  });

  it('should create HMAC error', () => {
    const error = createHmacError('Invalid signature', 'trace-123');

    expect(error.type).toBe(ErrorType.HMAC_VERIFICATION_FAILED);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Invalid signature');
  });

  it('should create not found error', () => {
    const error = createNotFoundError('Resource not found', 'trace-123');

    expect(error.type).toBe(ErrorType.NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Resource not found');
  });

  it('should create database error', () => {
    const error = createDatabaseError('Connection failed', { db: 'postgres' }, 'trace-123');

    expect(error.type).toBe(ErrorType.DATABASE_ERROR);
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Connection failed');
    expect(error.details).toEqual({ db: 'postgres' });
  });

  it('should create unauthorized error', () => {
    const error = createUnauthorizedError('Invalid token', 'trace-123');

    expect(error.type).toBe(ErrorType.UNAUTHORIZED);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Invalid token');
  });

  it('should create internal error', () => {
    const error = createInternalError('Something went wrong', { code: 'ERR_001' }, 'trace-123');

    expect(error.type).toBe(ErrorType.INTERNAL_ERROR);
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Something went wrong');
  });
});
