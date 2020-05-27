const { test } = require('tap')
const fetch = require('node-fetch')
const http = require('http')
const _createServer = require('./server.js')
const upload = require('./upload.js')
const { AbortController } = require('abortcontroller-polyfill/dist/cjs-ponyfill')
const series = require('p-series')

async function getData (server, key, opts) {
  const res = await fetch(`${server}/${key}`, opts)
  if (res.status !== 200) {
    throw Object.assign(new Error(`[EHTTPSTATUS] [statusCode=${res.status}] ${await res.text()}`), { statusCode: res.status, code: 'EHTTPSTATUS' })
  }
  return res.text()
}

async function createServer (opts) {
  const control = new AbortController()
  const server = await _createServer({
    ...opts,
    abortSignal: control.signal
  })
  return {
    ...server,
    control,
    server: `http://localhost:${server.address.port}`,
    close () {
      const p = server.closePromise.catch(() => {})
      control.abort()
      return p
    }
  }
}

test('basic functionality', async t => {
  const { server, close } = await createServer({
    max: 1,
    secret: 'abcd'
  })
  try {
    const key = await upload({ server, secret: 'abcd', data: 'hello world', timeout: 5000 })
    t.match(key, /^[0-9a-f]{12}$/)
    t.equals(await getData(server, key), 'hello world')
  } finally {
    await close()
  }
})

test('requesting via post should throw error', async t => {
  const { server, close } = await createServer({
    max: 1,
    secret: 'abcd'
  })
  try {
    const key = await upload({ server, secret: 'abcd', data: 'hello world', timeout: 5000 })
    t.match(key, /^[0-9a-f]{12}$/)
    await rejects(t, getData(server, key, { method: 'POST' }), err => t.equals(err.statusCode, 404))
  } finally {
    await close()
  }
})

test('non existing file', async t => {
  const { server, close } = await createServer({
    max: 1,
    secret: 'abcd'
  })
  try {
    await rejects(t, getData(server, 'test'), err => t.equals(err.statusCode, 404))
  } finally {
    await close()
  }
})

test('uploading too much', async t => {
  const { server, close } = await createServer({
    max: 1,
    maxSize: 1,
    secret: 'abcd'
  })
  try {
    await upload({ server, secret: 'abcd', data: 'hello world', timeout: 5000 })
    t.fail('error')
  } catch (err) {
    t.equals(err.code, 'EHTTPSTATUS')
    t.equals(err.statusCode, 413)
  } finally {
    await close()
  }
})

test('max amount is respected', async t => {
  const { server, close } = await createServer({
    max: 2,
    secret: 'abcd'
  })
  try {
    const keys = await series([
      () => upload({ server, secret: 'abcd', data: 'test-a', timeout: 5000 }),
      () => upload({ server, secret: 'abcd', data: 'test-b', timeout: 5000 }),
      () => upload({ server, secret: 'abcd', data: 'test-c', timeout: 5000 })
    ])
    t.equals(await getData(server, keys[1]), 'test-b')
    t.equals(await getData(server, keys[2]), 'test-c')
    try {
      const data = await getData(server, keys[0])
      console.log({ data })
      t.fail('error')
    } catch (err) {
      t.equals(err.code, 'EHTTPSTATUS')
      t.equals(err.statusCode, 404)
    }
  } finally {
    await close()
  }
})

test('upload client timeout', async t => {
  const { server, close } = await createServer({
    max: 2,
    secret: 'abcd'
  })
  try {
    await upload({ server, secret: 'abcd', timeout: 1, data: 'hello world' })
    t.fail('error')
  } catch (err) {
    t.equals(err.code, 'ETIMEOUT', err.message)
    t.equals(err.timeout, 1)
  } finally {
    await close()
  }
})

test('broken server config', async t => {
  await rejects(t, createServer({}), 'EARG')
  await rejects(t, createServer({ secret: 'abcd' }), 'EARG')
  await rejects(t, createServer({ secret: 'abcd', max: 0 }), 'EARG')
  await rejects(t, createServer({ secret: 'abcd', max: 1, maxSize: 0 }), 'EARG')
})

test('upload server timeout', async t => {
  const { server, close } = await createServer({
    max: 2,
    secret: 'abcd',
    timeout: 1
  })
  try {
    await (new Promise((resolve) => {
      const req = http.request(`${server}/abcd`, { method: 'POST' }, res => {
        t.equals(res.statusCode, 408)
        res.on('error', () => {
          req.close()
        })
        resolve()
      })
      req.on('error', () => {})
      req.write('msg')
    }))
  } finally {
    await close()
  }
})

async function rejects (t, promise, test) {
  let thrown = false
  try {
    await promise
  } catch (err) {
    thrown = true
    if (typeof test === 'function') {
      test(err, t)
    } else {
      const code = typeof test === 'string' ? test : test.code
      t.equals(err.code, code, err.message)
    }
  }
  if (!thrown) {
    t.fail('Expected rejection')
  }
}