const c = require('compact-encoding')
const safetyCatch = require('safety-catch')
const ProtomuxRequestError = require('./lib/errors')

const DEFAULT_TIMEOUT = 30_000

/**
 * `request()` sends a request and waits for the response. `options.timeout` overrides the default timeout, in ms.
 * @typedef {{
 *   request(value: any, options?: { timeout?: number }): Promise<any>
 * }} RequestClient
 */

class ProtomuxRequest {
  /**
   * @param {any} channel Existing Protomux channel. Register all messages before `channel.open()`.
   * @param {{ timeout?: number }} [options] `timeout`: default request timeout in ms, defaults to `30_000`.
   */
  constructor(channel, { timeout = DEFAULT_TIMEOUT } = {}) {
    this.channel = channel
    this.timeout = timeout
    this.destroyed = false

    this._nextId = 0
    this._pending = new Map()
    this._errorMessage = null
    this._errorEncoding = null
  }

  /**
   * Add the error message type. Call once, before the first `addRequest()`.
   * @param {import('compact-encoding').Encoder} errorEncoding
   * @returns {void}
   */
  addError(errorEncoding) {
    if (this._errorMessage !== null) throw ProtomuxRequestError.ERROR_ALREADY_ADDED()

    this._errorEncoding = errorEncoding
    this._errorMessage = this.channel.addMessage({
      encoding: frame,
      onmessage: (m) => this._onerror(m)
    })
  }

  /**
   * Add a request/response message pair.
   * @param {object} opts
   * @param {string} [opts.name] Local debug name, never sent.
   * @param {import('compact-encoding').Encoder} opts.requestEncoding Encoding for request values.
   * @param {import('compact-encoding').Encoder} opts.responseEncoding Encoding for response values.
   * @param {((value: any) => any) | null} [opts.onrequest] Server handler. The return value is the response; a thrown value is sent with the error encoding.
   * @returns {{ name: string | null, client: RequestClient }}
   */
  addRequest({ name = null, requestEncoding, responseEncoding, onrequest = null }) {
    if (this._errorMessage === null) throw ProtomuxRequestError.ERROR_NOT_ADDED()

    const op = {
      requestEncoding,
      responseEncoding,
      onrequest,
      requestMessage: this.channel.addMessage({
        encoding: frame,
        onmessage: (m) => {
          this._onrequest(op, m).catch(safetyCatch)
        }
      }),
      responseMessage: this.channel.addMessage({
        encoding: frame,
        onmessage: (m) => this._onresponse(op, m)
      })
    }

    return {
      name,
      client: {
        request: (value, options) => this._request(op, value, options)
      }
    }
  }

  /**
   * Reject all pending requests and reject new ones. Inbound requests are ignored afterwards.
   * @param {Error} [error] Defaults to a `REQUEST_DESTROYED` error.
   * @returns {void}
   */
  destroy(error = ProtomuxRequestError.REQUEST_DESTROYED()) {
    if (this.destroyed) return
    this.destroyed = true

    for (const req of this._pending.values()) {
      clearTimeout(req.timer)
      req.reject(error)
    }

    this._pending.clear()
  }

  _request(op, value, { timeout = this.timeout } = {}) {
    if (this.destroyed) return Promise.reject(ProtomuxRequestError.REQUEST_DESTROYED())
    if (this.channel.closed) return Promise.reject(ProtomuxRequestError.CHANNEL_CLOSED())

    let buffer
    try {
      buffer = c.encode(op.requestEncoding, value)
    } catch (err) {
      return Promise.reject(ProtomuxRequestError.ENCODE_ERROR(err))
    }

    const id = this._nextId++

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(ProtomuxRequestError.REQUEST_TIMEOUT())
      }, timeout)

      this._pending.set(id, { resolve, reject, timer })

      op.requestMessage.send({ id, value: buffer })
    })
  }

  _take(id) {
    const req = this._pending.get(id)
    if (req === undefined) return null

    this._pending.delete(id)
    clearTimeout(req.timer)

    return req
  }

  _onresponse(op, { id, value }) {
    const req = this._take(id)
    if (req === null) return

    try {
      value = c.decode(op.responseEncoding, value)
    } catch (err) {
      req.reject(ProtomuxRequestError.DECODE_ERROR(err))
      return
    }

    req.resolve(value)
  }

  _onerror({ id, value }) {
    const req = this._take(id)
    if (req === null) return

    try {
      value = c.decode(this._errorEncoding, value)
    } catch (err) {
      req.reject(ProtomuxRequestError.DECODE_ERROR(err))
      return
    }

    req.reject(value)
  }

  async _onrequest(op, { id, value }) {
    if (this.destroyed) return

    if (op.onrequest === null) {
      this._sendError(id, ProtomuxRequestError.REQUEST_NOT_HANDLED())
      return
    }

    try {
      value = c.decode(op.requestEncoding, value)
    } catch (err) {
      this._sendError(id, ProtomuxRequestError.DECODE_ERROR(err))
      return
    }

    let response
    try {
      response = await op.onrequest(value)
    } catch (err) {
      this._sendError(id, err)
      return
    }

    let buffer
    try {
      buffer = c.encode(op.responseEncoding, response)
    } catch (err) {
      this._sendError(id, ProtomuxRequestError.ENCODE_ERROR(err))
      return
    }

    op.responseMessage.send({ id, value: buffer })
  }

  _sendError(id, error) {
    let buffer
    try {
      buffer = c.encode(this._errorEncoding, error)
    } catch (err) {
      // the protocol fails to encode error, silently let client times out
      safetyCatch(err)
      return
    }

    this._errorMessage.send({ id, value: buffer })
  }
}

const frame = {
  preencode(state, m) {
    c.uint.preencode(state, m.id)
    c.raw.preencode(state, m.value)
  },
  encode(state, m) {
    c.uint.encode(state, m.id)
    c.raw.encode(state, m.value)
  },
  decode(state) {
    return {
      id: c.uint.decode(state),
      value: c.raw.decode(state)
    }
  }
}

module.exports = ProtomuxRequest
