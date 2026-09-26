import os from 'os'

const DEFAULT_PORT = 3000

function lanAddresses() {
  return [
    ...new Set(
      Object.values(os.networkInterfaces())
        .flat()
        .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
        .map((iface) => iface.address)
    ),
  ]
}

const port = () => process.env.PORT || DEFAULT_PORT

export const SystemService = {
  lanAddresses,

  // The base URL a phone must be able to reach. Printed QR codes carry a deep
  // link built from it, so it has to be the LAN address rather than localhost.
  // A shop PC often has several interfaces (Wi-Fi + a VPN adapter), which is
  // why callers may pass the address they actually want printed.
  origin(address) {
    const ip = address || lanAddresses()[0]
    return ip ? `http://${ip}:${port()}` : `http://localhost:${port()}`
  },

  info() {
    return {
      port: port(),
      hostname: os.hostname(),
      addresses: lanAddresses(),
      origin: SystemService.origin(),
    }
  },
}
