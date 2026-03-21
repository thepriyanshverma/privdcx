const http = require('http');

const server = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: 5173,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502);
    res.end('Proxy Error: Ensure dev server is running on 5173');
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(5174, '0.0.0.0', () => {
  console.log('Proxy listening on 5174 -> Forwarding to 5173');
});
