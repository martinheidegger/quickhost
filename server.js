const { createServer } = require('http')
const { randomBytes } = require('crypto')
const createLRU = require('lru')

function res404 (res) {
  res.writeHead(404).end('404 - not found', 'utf-8')
}

module.exports = ({ abortSignal, host, port, max, maxAge, maxSize, timeout, secret }) => new Promise((resolve, reject) => {
  if (typeof secret !== 'string' || secret.length === 0) {
    return reject(Object.assign(new Error(`[EARG] secret is wrong, should be string of length > 0 but is ${secret}`), { code: 'EARG' }))
  }
  if (isNaN(max) || max === null || max < 1) {
    return reject(Object.assign(new Error(`[EARG] Max amount of items needs to be a number, but is ${max}`), { code: 'EARG' }))
  }
  if (isNaN(maxSize) || max === null) {
    maxSize = 1024 * 1024 * 3 // 3 Megabytes
  } else if (maxSize >= 1) {
    maxSize |= 0
  } else {
    return reject(Object.assign(new Error(`[EARG] Max size needs to be a positive integer, but is ${maxSize}`), { code: 'EARG' }))
  }
  if (isNaN(timeout) || timeout === null) {
    timeout = 5000
  }
  const lru = createLRU({ max, maxAge })
  const processUpload = (req, res) => {
    const buffer = []
    let size = 0
    let timer
    const reTimeout = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        finish()
        res.writeHead(408).end('408 - timeout')
      }, timeout)
    }
    const onData = data => {
      reTimeout()
      size += data.byteLength
      if (size > maxSize) {
        finish()
        res.writeHead(413).end('413 - payload too large')
        return
      }
      buffer.push(data)
    }
    const onEnd = () => {
      finish()
      const key = randomBytes(6).toString('hex')
      lru.set(`/${key}`, Buffer.concat(buffer))
      res.writeHead(200, 'text/text').end(key)
    }
    const finish = () => {
      clearTimeout(timer)
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('aborted', finish)
      req.off('error', finish)
    }
    req.on('aborted', finish)
    req.on('error', finish)
    req.on('data', onData)
    req.on('end', onEnd)
    reTimeout()
  }
  const isAuthorized = req => {
    return req.method === 'POST' && req.url === `/${secret}`
  }
  const server = createServer((req, res) => {
    if (isAuthorized(req)) {
      processUpload(req, res)
    } else if (req.method !== 'GET') {
      res404(res)
    } else {
      const data = lru.get(req.url)
      if (data === undefined) {
        res404(res)
      } else {
        res.writeHead(200, 'text/html').end(data)
      }
    }
  })
  const closePromise = new Promise((resolve, reject) => {
    server.once('error', (error) => {
      listener.close()
      reject(error)
    })
    server.once('close', () => {
      reject(Object.assign(new Error('[ERRABORT]'), { code: 'ERRABORT' }))
    })
  })
  server.once('error', reject)
  server.once('close', () => {
    reject(Object.assign(new Error('[ERRABORT]'), { code: 'ERRABORT' }))
  })
  server.once('listening', () => {
    resolve({ closePromise, address: listener.address(), secret })
  })
  const listener = server.listen(port, host)
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => server.close())
  }
})
