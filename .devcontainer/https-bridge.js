// Bridges plain-HTTP-speaking clients to the HTTPS-only demo apps.
//
// GitHub Codespaces' port-forwarding proxy doesn't TLS-handshake with a
// self-signed backend (loan-webapp/lending-webapp are https.createServer-only,
// mTLS not enforced) — it just speaks HTTP to whatever's on the port, so
// forwarding 3000/3001 directly 502s at GitHub's edge. This listens on plain
// TCP and wraps each connection in TLS (ignoring the self-signed cert) before
// talking to the real app, so the forwarded browser URL actually works.
//
// Playwright/tests are unaffected — they keep hitting :3000/:3001 directly
// over real HTTPS, per apps.config.json / .dev.env.
const net = require('net');
const tls = require('tls');

function bridge(listenPort, targetPort) {
  const server = net.createServer((client) => {
    const upstream = tls.connect(
      { host: '127.0.0.1', port: targetPort, rejectUnauthorized: false },
      () => {
        client.pipe(upstream);
        upstream.pipe(client);
      }
    );
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  server.listen(listenPort, '0.0.0.0', () => {
    console.log(`https-bridge: 0.0.0.0:${listenPort} -> https://127.0.0.1:${targetPort}`);
  });
}

bridge(3100, 3000);
bridge(3101, 3001);
