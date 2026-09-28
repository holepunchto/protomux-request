const c = require('compact-encoding')

// Example error encoding
exports.ErrorEncoding = {
  preencode(state, error) {
    c.int.preencode(state, encodeErrorCode(error))
  },

  encode(state, error) {
    c.int.encode(state, encodeErrorCode(error))
  },

  decode(state) {
    return decodeErrorCode(c.int.decode(state))
  }
}

function encodeErrorCode(error) {
  switch (error && error.code) {
    case 'UNKNOWN_CORE':
      return 1
    case 'RATE_LIMITED':
      return 2
    case 'REQUEST_NOT_HANDLED':
      return 3
    case 'DECODE_ERROR':
      return 4
    case 'ENCODE_ERROR':
      return 5
    default:
      return -1
  }
}

function decodeErrorCode(code) {
  const error = new Error('Remote request failed')

  switch (code) {
    case 1:
      error.code = 'UNKNOWN_CORE'
      break
    case 2:
      error.code = 'RATE_LIMITED'
      break
    case 3:
      error.code = 'REQUEST_NOT_HANDLED'
      break
    case 4:
      error.code = 'DECODE_ERROR'
      break
    case 5:
      error.code = 'ENCODE_ERROR'
      break
    default:
      error.code = 'REQUEST_FAILED'
  }

  return error
}
