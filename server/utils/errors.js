import { AppError } from './AppError.js'

export class ValidationError extends AppError {
  constructor(message) {
    super('VALIDATION_ERROR', message, 400)
  }
}

export class BusinessRuleError extends AppError {
  constructor(message) {
    super('BUSINESS_RULE', message, 400)
  }
}

export class InsufficientStockError extends AppError {
  constructor(message) {
    super('INSUFFICIENT_STOCK', message, 409)
  }
}

export { AppError }