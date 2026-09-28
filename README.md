# protomux-request

Request/response pattern over Protomux channels.

Adds binary request/response operations to an existing [Protomux](https://github.com/holepunchto/protomux) channel. It does not create or own the channel: the caller controls the protocol, handshake, message order and lifecycle.

```
npm install protomux-request
```

## Usage

```js
const ProtomuxRequest = require('protomux-request')
const c = require('compact-encoding')

const requests = new ProtomuxRequest(channel, { timeout: 30_000 })

requests.addError(ErrorEncoding)

const echo = requests.addRequest({
  name: 'echo', // local debug name, not sent
  requestEncoding: c.buffer,
  responseEncoding: c.buffer,
  async onrequest(value) {
    return value
  }
})

channel.open()

const response = await echo.client.request(Buffer.from('hello'), { timeout: 5000 })
```

## API

#### `const requests = new ProtomuxRequest(channel, [options])`

`channel` is an existing Protomux channel. Register all messages before `channel.open()`.

`options`:

- `timeout`: default request timeout in ms. Defaults to `30_000`.

#### `requests.addError(errorEncoding)`

Adds the error message type to the channel. Call it once, before the first `addRequest()`. `errorEncoding` is a required `compact-encoding` encoding for thrown values; there is no default.

#### `const request = requests.addRequest(options)`

Adds two message types to the channel: the request, then the response.

- `name`: local debug name, never sent.
- `requestEncoding`: `compact-encoding` encoding for request values.
- `responseEncoding`: `compact-encoding` encoding for response values.
- `onrequest(value)`: optional server handler. Its return value is the response. A thrown value is sent with the error encoding and rejects the client request; the channel stays open. Without a handler, the peer replies with an error whose `code` is `REQUEST_NOT_HANDLED`.

#### `const response = await request.client.request(value, [options])`

Send a request and wait for the response.

- `options.timeout`: overrides the default timeout for this request, in ms.

#### `requests.destroy([error])`

Rejects all pending requests with `error` (default: a `REQUEST_DESTROYED` error) and rejects new requests. Inbound requests are ignored afterwards. The channel owner must call this when the channel closes.

## Errors

Local errors are `ProtomuxRequestError` instances (`require('protomux-request/errors')`) with a `code`:

- `ERROR_ALREADY_ADDED`: `addError()` called twice.
- `ERROR_NOT_ADDED`: `addRequest()` called before `addError()`.
- `REQUEST_TIMEOUT`: the request timed out.
- `REQUEST_DESTROYED`: the request was made on, or pending during, `destroy()`.
- `CHANNEL_CLOSED`: the request was sent on a closed channel.
- `ENCODE_ERROR`: the request value could not be encoded. A peer also sends it when its response cannot be encoded.
- `DECODE_ERROR`: the response or error could not be decoded. A peer also sends it when it cannot decode the request.
- `REQUEST_NOT_HANDLED`: sent by a peer that has no `onrequest` for the operation.

Errors sent by a peer go through the protocol's error encoding, so what the client receives depends on that encoding. Local `ENCODE_ERROR` and `DECODE_ERROR` errors have the underlying error as `cause`.

A value that fails to encode or decode fails only its request. The channel and stream stay open.

## Wire format

```
error:    uint requestId + errorEncoding error
request:  uint requestId + requestEncoding value
response: uint requestId + responseEncoding value
```

Request ids start at `0` and are unique across all operations of one `ProtomuxRequest` instance.

## License

Apache-2.0
