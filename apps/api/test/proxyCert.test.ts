import assert from 'node:assert/strict';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { createServer, request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { createProxyTlsPair } from '../src/vehicle/tesla/proxyCert.ts';

describe('proxy TLS pair', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  const { key, cert } = createProxyTlsPair(['gauss-tesla-proxy', 'localhost', '127.0.0.1'], now);
  const x509 = new X509Certificate(cert);

  it('is a self-signed certificate for the key', () => {
    assert.ok(x509.verify(x509.publicKey));
    assert.ok(x509.checkPrivateKey(createPrivateKey(key)));
    assert.equal(x509.subject, 'CN=gauss-tesla-proxy');
    assert.equal(x509.issuer, x509.subject);
    assert.ok(x509.ca);
    assert.equal(x509.publicKey.asymmetricKeyDetails?.namedCurve, 'prime256v1');
  });

  it('covers every hostname and lasts ten years', () => {
    assert.equal(x509.checkHost('gauss-tesla-proxy'), 'gauss-tesla-proxy');
    assert.equal(x509.checkHost('localhost'), 'localhost');
    assert.equal(x509.checkIP('127.0.0.1'), '127.0.0.1');
    assert.equal(x509.checkHost('example.com'), undefined);
    assert.equal(x509.validFromDate.toISOString(), '2026-10-19T10:00:00.000Z');
    assert.equal(x509.validToDate.toISOString(), '2036-10-19T10:00:00.000Z');
  });

  it('is trusted by a TLS client that pins it as its CA', async () => {
    const server = createServer({ key, cert }, (_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const body = await new Promise<string>((resolve, reject) => {
        request({ host: '127.0.0.1', port, ca: cert, servername: 'localhost' }, (res) => {
          res.setEncoding('utf8');
          let text = '';
          res.on('data', (chunk: string) => {
            text += chunk;
          });
          res.on('end', () => {
            resolve(text);
          });
        })
          .on('error', reject)
          .end();
      });
      assert.equal(body, 'ok');
    } finally {
      server.close();
    }
  });

  it('needs a hostname', () => {
    assert.throws(() => createProxyTlsPair([]), /hostname/);
  });
});
