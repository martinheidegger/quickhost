# Quickhost

Server and upload-client to quickly host a single static html page - useful for [browserstack](https://browserstack.com) test.

## Motivation

To test JavaScript code running in a browser, browserStack offers a good test platform but the selenium tests require the html
files to be available in the internet. The problem is if you have files locally: how can you make them accessible by browserstack?

This is a simple http hosting server that - using a secret - allows to upload any given html file and hosts it for a limited amount
of time. It also has a limit on amount of files to be hosted which means it cleans up after itself.

## Start a server

Prerequisites: Node running!

```sh
$ env \
    QUICKHOST_SECRET=$(node -p "crypto.randomBytes(8).toString('hex')") \
    QUICKHOST_MAX=10 # (optional) Max number of html files to be hosted - default 10 \
    QUICKHOST_MAX_SIZE=3145728 # (optional) Max number of bytes of a file to be hosted - default 3 Megabytes \
    PORT=1234 # (optional) Port where the server will connect to - default 1234 \
    HOST=localhost # (optional) Host where the server will connect to - default 0 \
    npx quickhost
```

**Important note:** You should run nginx and letsencrypt to have turn the [server into an https server](https://www.codementor.io/@marcoscasagrande/installing-express-nginx-app-on-ubuntu-18-04-with-ssl-using-certbot-pdt44g5gs).

## Upload

Once the server is running you can upload and download files from that server using a simple API:

1. `npm install quickhost`
2. 
    ```javascript
    const upload = require('quickhost')
    const download = require('node-fetch')
    const server = 'https://quickhost.my-host.com'

    const key = await upload({
      server, // Server url where the quickhost server is running
      secret: 'secret-from-server', // Secret used when starting the quickhost server
      data: '<html><b>Hello World</b></html>', // Data to be uploaded to the quickhost server
      timeout: 5000 // Timeout for the upload
    })

    const data = await fetch(`${server}/${key}`) // Now we can download the server
    ```

## License

[MIT](./LICENSE)
