export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export class CreditsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CreditsError"
  }
}

export class MonthlyLimitError extends Error {
  retryAfter?: number
  constructor(message: string, retryAfter?: number) {
    super(message)
    this.name = "MonthlyLimitError"
    this.retryAfter = retryAfter
  }
}

export class UserLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserLimitError"
  }
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelError"
  }
}

export class RateLimitError extends Error {
  retryAfter?: number
  constructor(message: string, retryAfter?: number) {
    super(message)
    this.name = "RateLimitError"
    this.retryAfter = retryAfter
  }
}
