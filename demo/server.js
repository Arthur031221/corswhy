import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.method !== 'OPTIONS') { res.writeHead(405); res.end(); return; }
  if (req.url === '/auth') { res.writeHead(401); res.end(); return; }
  if (req.url === '/ok') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'authorization, content-type'
    });
    res.end(); return;
  }
  res.writeHead(404); res.end();
});
server.listen(18765, '127.0.0.1');
