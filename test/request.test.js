const test = require('brittle')
const c = require('compact-encoding')
const b4a = require('b4a')
const Protomux = require('protomux')
const { PassThrough } = require('streamx')
const ProtomuxRequest = require('..')
const { ErrorEncoding } = require('./helper')

test('basic', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const echo = requests.addRequest({
    name: 'echo',
    requestEncoding: c.buffer,
    responseEncoding: c.buffer,
    onrequest: (req) => req
  })

  channel.open()

  t.is(echo.name, 'echo')
  t.alike(await echo.client.request(b4a.from('hello world')), b4a.from('hello world'))
})

test('separate request and response encodings', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const length = requests.addRequest({
    requestEncoding: c.string,
    responseEncoding: c.uint,
    onrequest: (req) => {
      t.is(req, 'hello world')
      return req.length
    }
  })

  channel.open()

  t.is(await length.client.request('hello world'), 11)
})

test('void request', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const ping = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: (req) => {
      t.is(req, null)
    }
  })

  channel.open()

  t.is(await ping.client.request(), null)
})

test('reject request that throws', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const limited = requests.addRequest({
    requestEncoding: c.uint,
    responseEncoding: c.uint,
    onrequest: async () => {
      const err = new Error('slow down')
      err.code = 'RATE_LIMITED'
      throw err
    }
  })

  channel.open()

  try {
    await limited.client.request(1)
    t.fail()
  } catch (e) {
    t.is(e.code, 'RATE_LIMITED')
  }
})

test('handler error does not close the channel', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const echo = requests.addRequest({
    requestEncoding: c.string,
    responseEncoding: c.string,
    onrequest: (req) => {
      if (req === 'fail') throw new Error('whoops')
      return req
    }
  })

  channel.open()

  try {
    await echo.client.request('fail')
    t.fail()
  } catch (e) {
    t.is(e.code, 'REQUEST_FAILED')
  }

  t.is(await echo.client.request('ok'), 'ok')
  t.is(channel.closed, false)
})

test('reject request without handler', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const echo = requests.addRequest({ requestEncoding: c.buffer, responseEncoding: c.buffer })

  channel.open()

  try {
    await echo.client.request(b4a.alloc(0))
    t.fail()
  } catch (e) {
    t.is(e.code, 'REQUEST_NOT_HANDLED')
  }
})

test('timeout', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel, { timeout: 50 })
  requests.addError(ErrorEncoding)

  const hang = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => new Promise((resolve) => setTimeout(resolve, 500))
  })

  channel.open()

  try {
    await hang.client.request()
    t.fail()
  } catch (e) {
    t.is(e.code, 'REQUEST_TIMEOUT')
  }
})

test('timeout per request', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel, { timeout: 60_000 })
  requests.addError(ErrorEncoding)

  const hang = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => new Promise((resolve) => setTimeout(resolve, 500))
  })

  channel.open()

  try {
    await hang.client.request(null, { timeout: 50 })
    t.fail()
  } catch (e) {
    t.is(e.code, 'REQUEST_TIMEOUT')
  }
})

test('reject inflight request on destroy', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const hang = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => new Promise((resolve) => setTimeout(resolve, 500))
  })

  channel.open()

  const req = hang.client.request()

  await new Promise((resolve) => setTimeout(resolve, 100))

  requests.destroy()

  try {
    await req
    t.fail()
  } catch (e) {
    t.is(e.code, 'REQUEST_DESTROYED')
  }
})

test('reject request after destroy', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const echo = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => null
  })

  channel.open()

  requests.destroy()

  try {
    await echo.client.request()
    t.fail()
  } catch (e) {
    t.is(e.code, 'REQUEST_DESTROYED')
  }
})

test('reject inflight request on stream destroy', async (t) => {
  const stream = new PassThrough()

  const channel = Protomux.from(stream).createChannel({
    protocol: 'protomux-request-test',
    onclose: () => requests.destroy(new Error('channel closed'))
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const hang = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => new Promise(() => {})
  })

  channel.open()

  const resPromise = hang.client.request()

  stream.destroy()

  await t.exception(resPromise, /channel closed/)
})

test('reject request on closed channel', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const echo = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => null
  })

  channel.open()

  await echo.client.request()
  t.pass('first request while channel open')

  channel.close()
  try {
    await echo.client.request()
    t.fail()
  } catch (e) {
    t.is(e.code, 'CHANNEL_CLOSED')
  }
})

test('request encode error', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const requestEncoding = {
    preencode() {},
    encode() {
      throw new Error('whoops')
    },
    decode() {}
  }

  const echo = requests.addRequest({
    requestEncoding,
    responseEncoding: c.none,
    onrequest: () => {
      t.fail()
    }
  })

  channel.open()

  try {
    await echo.client.request('hello world')
    t.fail()
  } catch (e) {
    t.is(e.code, 'ENCODE_ERROR')
    t.is(e.cause.message, 'whoops')
  }
})

test('request decode error', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const requestEncoding = {
    ...c.string,
    decode() {
      throw new Error('whoops')
    }
  }

  const echo = requests.addRequest({
    requestEncoding,
    responseEncoding: c.none,
    onrequest: (req) => req
  })

  channel.open()

  try {
    await echo.client.request('hello world')
    t.fail()
  } catch (e) {
    t.is(e.code, 'DECODE_ERROR') // sent by the peer through ErrorEncoding
  }
})

test('response encode error', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const responseEncoding = {
    preencode() {},
    encode() {
      throw new Error('whoops')
    },
    decode() {}
  }

  const echo = requests.addRequest({
    requestEncoding: c.string,
    responseEncoding,
    onrequest: (req) => req
  })

  channel.open()

  try {
    await echo.client.request('hello world')
    t.fail()
  } catch (e) {
    t.is(e.code, 'ENCODE_ERROR') // sent by the peer through ErrorEncoding
  }
})

test('response decode error', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError(ErrorEncoding)

  const responseEncoding = {
    ...c.string,
    decode() {
      throw new Error('whoops')
    }
  }

  const echo = requests.addRequest({
    requestEncoding: c.string,
    responseEncoding,
    onrequest: (req) => req
  })

  channel.open()

  try {
    await echo.client.request('hello world')
    t.fail()
  } catch (e) {
    t.is(e.code, 'DECODE_ERROR')
    t.is(e.cause.message, 'whoops')
  }
})

test('error decode error', async (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)
  requests.addError({
    ...ErrorEncoding,
    decode() {
      throw new Error('whoops')
    }
  })

  const fail = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => {
      throw new Error('fail')
    }
  })

  channel.open()

  try {
    await fail.client.request()
    t.fail()
  } catch (e) {
    t.is(e.code, 'DECODE_ERROR')
    t.is(e.cause.message, 'whoops')
  }
})

test('error encode error closes the channel', async (t) => {
  const stream = new PassThrough()
  const channel = Protomux.from(stream).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel, { timeout: 50 })
  requests.addError({
    ...ErrorEncoding,
    encode() {
      throw new Error('whoops')
    }
  })

  const fail = requests.addRequest({
    requestEncoding: c.none,
    responseEncoding: c.none,
    onrequest: () => {
      throw new Error('fail')
    }
  })

  channel.open()

  try {
    await fail.client.request()
    t.fail()
  } catch (e) {
    t.is(e.code, 'REQUEST_TIMEOUT')
  }

  t.is(channel.closed, true, 'channel closed')
  t.is(stream.destroyed, false, 'connection stays open')
})

test('multiple instances on same muxer', async (t) => {
  const mux = Protomux.from(new PassThrough())

  const create = (id) => {
    const channel = mux.createChannel({ protocol: 'protomux-request-test', id: b4a.from(id) })
    const requests = new ProtomuxRequest(channel)
    requests.addError(ErrorEncoding)

    const whoami = requests.addRequest({
      requestEncoding: c.none,
      responseEncoding: c.string,
      onrequest: () => id
    })

    channel.open()

    return { requests, whoami }
  }

  const a = create('a')
  const b = create('b')

  t.is(await a.whoami.client.request(), 'a')
  t.is(await b.whoami.client.request(), 'b')
})

test('addError adds one message, addRequest adds an adjacent pair', (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)

  requests.addError(ErrorEncoding)
  t.is(channel.messages.length, 1)

  requests.addRequest({ requestEncoding: c.uint, responseEncoding: c.uint })
  t.is(channel.messages.length, 3)

  requests.addRequest({ requestEncoding: c.uint, responseEncoding: c.uint })
  t.is(channel.messages.length, 5)
})

test('misuse throws', (t) => {
  const channel = Protomux.from(new PassThrough()).createChannel({
    protocol: 'protomux-request-test'
  })
  const requests = new ProtomuxRequest(channel)

  try {
    requests.addRequest({ requestEncoding: c.buffer, responseEncoding: c.buffer })
    t.fail()
  } catch (e) {
    t.is(e.code, 'ERROR_NOT_ADDED')
  }

  t.execution(() => requests.addError(ErrorEncoding))

  try {
    requests.addError(ErrorEncoding)
    t.fail()
  } catch (e) {
    t.is(e.code, 'ERROR_ALREADY_ADDED')
  }
  t.is(channel.messages.length, 1)

  t.execution(() => requests.addRequest({ requestEncoding: c.buffer, responseEncoding: c.buffer }))
  t.is(channel.messages.length, 3)
})
