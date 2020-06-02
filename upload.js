const https = require('https')
const http = require('http')

class TimeoutError extends Error {
  constructor (timeout) {
    super(`[ETIMEOUT] Exceeded timeout of ${timeout}`)
    this.timeout = timeout
    this.code = 'ETIMEOUT'
  }
}
module.exports = ({ server, secret, data, timeout }) => {
  const system = /^https/.test(server) ? https : http
  return new Promise((resolve, reject) => {
    const result = []
    const onData = buffer => result.push(buffer)
    const onEnd = error => {
      clearTimeout(timer)
      req.off('error', onEnd)
      if (error) {
        reject(error)
      } else {
        resolve(Buffer.concat(result).toString())
      }
    }
    const req = system.request(
      `${server}/${secret}`,
      {
        method: 'POST'
      },
      res => {
        clearTimeout(timer)
        timer = setTimeout(() => onResEnd(new TimeoutError(timeout)), timeout)
        const onResEnd = error => {
          res.off('error', onResEnd)
          res.off('end', onResEnd)
          res.off('data', onData)
          if (res.statusCode !== 200) {
            const message = Buffer.concat(result).toString()
            onEnd(Object.assign(new Error(`[EHTTPSTATUS] ${res.statusCode}: ${message}`), { statusCode: res.statusCode, code: 'EHTTPSTATUS', message }))
          } else {
            onEnd(error)
          }
        }
        res.on('error', onResEnd)
        res.on('end', onResEnd)
        res.on('data', onData)
        if (res.statusCode !== 200) {
          onResEnd()
        }
      }
    )
    let timer = setTimeout(() => onEnd(new TimeoutError(timeout)), timeout)
    req.on('error', onEnd)
    req.write(data)
    req.end()
  })
}
