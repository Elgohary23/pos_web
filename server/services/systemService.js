import os from 'os'

export const SystemService = {
  info() {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
      .map((iface) => iface.address)
    return {
      port: process.env.PORT || 3000,
      hostname: os.hostname(),
      addresses: [...new Set(addresses)],
    }
  },
}