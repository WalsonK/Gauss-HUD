import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Self-signed TLS pair for the signing proxy, so a deployment needs no `openssl` step. Minimal
 * DER encoder: an X.509 v3 certificate, EC P-256 with ECDSA-SHA256, the given names in the SAN.
 */

/** DER length; a certificate stays far below 64 KiB. */
const length = (n: number) => (n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff]);

const tlv = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag, ...length(body.length)]), body]);
};

const seq = (...parts: Buffer[]) => tlv(0x30, ...parts);

const oid = (dotted: string) => {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * first + second];
  for (const arc of rest) {
    const chunk = [arc & 0x7f];
    for (let value = arc >> 7; value > 0; value >>= 7) chunk.unshift((value & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
};

/** Positive INTEGER from big-endian bytes. */
const integer = (bytes: Buffer) =>
  tlv(0x02, bytes[0] !== undefined && bytes[0] & 0x80 ? Buffer.concat([Buffer.of(0), bytes]) : bytes);

/** UTCTime until 2049, GeneralizedTime after, as RFC 5280 requires. */
const time = (date: Date) => {
  const iso = date.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
  return date.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(iso.slice(2))) : tlv(0x18, Buffer.from(iso));
};

const name = (commonName: string) => seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(commonName)))));

const ipBytes = (ip: string) => Buffer.from(ip.split('.').map(Number));

const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'));
const VALIDITY_YEARS = 10;

export interface ProxyTlsPair {
  /** PKCS#8 PEM, for the proxy only. */
  readonly key: string;
  readonly cert: string;
}

/** `hostnames`: DNS names or IPv4 addresses the app uses to reach the proxy; the first is the CN. */
export function createProxyTlsPair(hostnames: readonly string[], now = new Date()): ProxyTlsPair {
  const [commonName] = hostnames;
  if (!commonName) throw new Error('At least one hostname is needed');
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });

  const serial = randomBytes(16);
  serial[0] = (serial[0] ?? 0) & 0x7f;
  const notAfter = new Date(now);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + VALIDITY_YEARS);

  const altNames = seq(
    ...hostnames.map((host) => (isIP(host) === 4 ? tlv(0x87, ipBytes(host)) : tlv(0x82, Buffer.from(host)))),
  );
  // Last 65 bytes of the SPKI: the uncompressed P-256 point, hashed for the key identifier.
  const keyId = createHash('sha1').update(spki.subarray(-65)).digest();
  const extensions = tlv(
    0xa3,
    seq(
      seq(oid('2.5.29.17'), tlv(0x04, altNames)),
      // CA:TRUE, critical: the certificate is its own trust anchor (TESLA_PROXY_CA_PATH).
      seq(oid('2.5.29.19'), tlv(0x01, Buffer.of(0xff)), tlv(0x04, seq(tlv(0x01, Buffer.of(0xff))))),
      seq(oid('2.5.29.14'), tlv(0x04, tlv(0x04, keyId))),
    ),
  );

  const tbs = seq(
    tlv(0xa0, integer(Buffer.of(2))),
    integer(serial),
    ECDSA_SHA256,
    name(commonName),
    seq(time(now), time(notAfter)),
    name(commonName),
    spki,
    extensions,
  );
  const signature = sign('sha256', tbs, privateKey);
  const der = seq(tbs, ECDSA_SHA256, tlv(0x03, Buffer.of(0), signature));

  const base64 = der.toString('base64').replace(/.{1,64}/g, '$&\n');
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: `-----BEGIN CERTIFICATE-----\n${base64}-----END CERTIFICATE-----\n`,
  };
}
