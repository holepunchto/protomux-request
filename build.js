const Hyperschema = require('hyperschema')

const schema = Hyperschema.from('./spec/hyperschema', { versioned: true })
const request = schema.namespace('protomux-request')

request.register({
  name: 'frame',
  compact: true,
  fields: [
    {
      name: 'id',
      type: 'uint',
      required: true
    },
    {
      name: 'value',
      type: 'buffer',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)
