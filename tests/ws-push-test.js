const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const serverDir = path.join(__dirname, '..');
const server = spawn('node', [path.join(serverDir, 'server.js')], {
  env: { ...process.env, MINFLOW_PORT: '3779' },
  stdio: ['pipe', 'pipe', 'pipe']
});

server.stdout.on('data', (d) => {
  const s = d.toString();
  if (s.includes('listening')) {
    setTimeout(runTest, 200);
  }
});
server.stderr.on('data', (d) => {
  const s = d.toString();
  if (s.includes('listening')) {
    setTimeout(runTest, 200);
  }
});

function runTest() {
  const ws = new WebSocket('ws://localhost:3779/ws');
  const received = [];

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    received.push(msg);
  });

  ws.on('open', () => {
    const body = JSON.stringify({ title: 'WS Test', shape: 'circle', color: '#ff0000' });
    const req = http.request({
      hostname: 'localhost', port: 3779,
      path: '/api/decks', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        const deck = JSON.parse(data);
        // Clean up
        http.request({ hostname: 'localhost', port: 3779, path: '/api/decks/' + deck.id, method: 'DELETE' }, (r) => {
          let d2 = ''; r.on('data', (c) => d2 += c);
          r.on('end', () => {});
        }).end();
      });
    });
    req.write(body);
    req.end();
  });

  setTimeout(() => {
    ws.close();
    server.kill();
    if (received.length >= 2) {
      console.log('PASS: WebSocket push works (' + received.length + ' notifications for create + delete)');
    } else {
      console.log('FAIL: expected >= 2 WS pushes, got ' + received.length);
    }
    process.exit(received.length >= 2 ? 0 : 1);
  }, 1500);
}

setTimeout(() => { server.kill(); process.exit(1); }, 10000);
