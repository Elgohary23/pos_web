// Generates a self-signed cert for local HTTPS dev (phone camera over LAN).
// Output: server/certs/key.pem + cert.pem (gitignored, never commit).
// SANs cover localhost + every current LAN IPv4 so the same cert works from
// the PC browser and from phones on the same Wi-Fi. Re-run when the LAN IP
// changes (DHCP) - the script detects the current IPs each time.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import selfsigned from 'selfsigned'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certsDir = path.join(__dirname, '..', 'certs')
const keyPath = path.join(certsDir, 'key.pem')
const certPath = path.join(certsDir, 'cert.pem')

function lanAddresses() {
  return [
    ...new Set(
      Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address)
    ),
  ]
}

const ips = ['127.0.0.1', '::1', ...lanAddresses()]
const attrs = [{ name: 'commonName', value: 'KasabiPOS Local Dev' }]
const altNames = [
  { type: 2, value: 'localhost' },
  ...ips.map((ip) => ({ type: 7, ip })),
]

const pems = await selfsigned.generate(attrs, {
  keySize: 2048,
  days: 825,
  algorithm: 'sha256',
  extensions: [{ name: 'subjectAltName', altNames }],
})

fs.mkdirSync(certsDir, { recursive: true })
fs.writeFileSync(keyPath, pems.private)
fs.writeFileSync(certPath, pems.cert)

console.log(`Wrote ${keyPath}`)
console.log(`Wrote ${certPath}`)
console.log(`SANs: localhost, ${ips.join(', ')}`)
console.log('Re-run this script whenever the PC LAN IP changes.')
