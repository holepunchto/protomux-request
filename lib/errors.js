class ProtomuxRequestError extends Error {
  /**
   * @param {string} msg
   * @param {string} code
   * @param {Function} [fn] Function to omit from the stack trace.
   * @param {{ cause?: unknown }} [options]
   */
  constructor(msg, code, fn = ProtomuxRequestError, { cause } = {}) {
    super(`${code}: ${msg}`, { cause })
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  /** @type {string} */
  get name() {
    return 'ProtomuxRequestError'
  }

  /** @returns {ProtomuxRequestError} */
  static ERROR_ALREADY_ADDED() {
    return new ProtomuxRequestError(
      'The error message is already added',
      'ERROR_ALREADY_ADDED',
      ProtomuxRequestError.ERROR_ALREADY_ADDED
    )
  }

  /** @returns {ProtomuxRequestError} */
  static ERROR_NOT_ADDED() {
    return new ProtomuxRequestError(
      'addError() must be called before addRequest()',
      'ERROR_NOT_ADDED',
      ProtomuxRequestError.ERROR_NOT_ADDED
    )
  }

  /** @returns {ProtomuxRequestError} */
  static REQUEST_TIMEOUT() {
    return new ProtomuxRequestError(
      'The request timed out',
      'REQUEST_TIMEOUT',
      ProtomuxRequestError.REQUEST_TIMEOUT
    )
  }

  /** @returns {ProtomuxRequestError} */
  static REQUEST_DESTROYED() {
    return new ProtomuxRequestError(
      'The request state is destroyed',
      'REQUEST_DESTROYED',
      ProtomuxRequestError.REQUEST_DESTROYED
    )
  }

  /** @returns {ProtomuxRequestError} */
  static CHANNEL_CLOSED() {
    return new ProtomuxRequestError(
      'The channel is closed',
      'CHANNEL_CLOSED',
      ProtomuxRequestError.CHANNEL_CLOSED
    )
  }

  /**
   * @param {unknown} cause
   * @returns {ProtomuxRequestError}
   */
  static DECODE_ERROR(cause) {
    return new ProtomuxRequestError(
      'Could not decode value',
      'DECODE_ERROR',
      ProtomuxRequestError.DECODE_ERROR,
      { cause }
    )
  }

  /**
   * @param {unknown} cause
   * @returns {ProtomuxRequestError}
   */
  static ENCODE_ERROR(cause) {
    return new ProtomuxRequestError(
      'Could not encode value',
      'ENCODE_ERROR',
      ProtomuxRequestError.ENCODE_ERROR,
      { cause }
    )
  }

  /** @returns {ProtomuxRequestError} */
  static REQUEST_NOT_HANDLED() {
    return new ProtomuxRequestError(
      'The request has no handler',
      'REQUEST_NOT_HANDLED',
      ProtomuxRequestError.REQUEST_NOT_HANDLED
    )
  }
}

module.exports = ProtomuxRequestError
