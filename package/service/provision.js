'use strict'

/**
 * KasabiPOS service provisioning.
 *
 * Runs on the bundled Node runtime (no global Node required) and is driven by
 * the Inno Setup installer via:
 *
 *   node.exe provision.js install   <appDir> <port> [desktopIcon 0|1]
 *                                                 install/start service,
 *                                                 firewall rule, shortcuts
 *   node.exe provision.js verify    <appDir>           assert service up and HTTP answering
 *   node.exe provision.js stop      <appDir>           stop + remove service (pre-upgrade)
 *   node.exe provision.js uninstall <appDir>           stop + remove service, drop firewall rule
 *   node.exe provision.js setport   <appDir> <port>    change the configured port
 *   node.exe provision.js open      <appDir>           open the app in the default browser
 *
 * The Windows service is a WinSW wrapper (the `winsw` component shipped inside
 * the `node-windows` package). WinSW is used instead of NSSM because it reads
 * its executable/arguments from an XML file and launches them through
 * ProcessStartInfo, so paths containing spaces can never be mis-parsed -- the
 * exact failure that broke the previous NSSM-based installer.
 *
 * Exit code 0 = success. Any non-zero code is surfaced to the installer, which
 * shows the tail of logs\install.log to the user.
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const winsw = require('node-windows/lib/winsw')

const SERVICE_ID = 'KasabiPOS'
const SERVICE_EXE = 'kasabipos.exe'
const FIREWALL_RULE = 'KasabiPOS Service'
const DISPLAY_NAME = 'نظام الكاشير'
const START_MENU_FOLDER = 'نظام الكاشير'
const DEFAULT_PORT = '3000'
const HOST = '0.0.0.0'

// ---------------------------------------------------------------- utilities

function logLine(msg) {
  process.stdout.write(msg + '\n')
}

function run(exe, args, options = {}) {
  const res = spawnSync(exe, args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
    ...options,
  })
  if (res.error) {
    if (options.allowFailure) return { status: -1, stdout: '', stderr: String(res.error.message) }
    throw new Error(`Failed to run ${exe}: ${res.error.message}`)
  }
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim()
  if (process.env.KASABI_DEBUG) logLine(`>> ${exe} ${args.join(' ')}\n${out}`)
  if (res.status !== 0 && !options.allowFailure) {
    throw new Error(`Command failed (${res.status}): ${exe} ${args.join(' ')}\n${out}`)
  }
  return { status: res.status, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() }
}

// sc.exe insists on the literal "key= value" spacing and on the value being
// quoted itself, so it is fed a single verbatim command line instead of argv.
function runSc(args, options = {}) {
  return run('sc.exe', [args], { windowsVerbatimArguments: true, ...options })
}

// `net session` only succeeds in an elevated/administrator context, which is a
// cheap synchronous check for "am I allowed to touch HKLM services?".
function isElevatedShell() {
  return run('net.exe', ['session'], { allowFailure: true }).status === 0
}

function isRegOpen() {
  return run('reg.exe', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\' + SERVICE_ID], {
    allowFailure: true,
  }).status === 0
}

// ------------------------------------------------------------------- layout

function appPaths(appDir) {
  const root = path.resolve(appDir)
  return {
    appDir: root,
    node: path.join(root, 'runtime', 'node.exe'),
    serviceDir: path.join(root, 'service'),
    serverEntry: path.join(root, 'server', 'index.js'),
    clientDist: path.join(root, 'client'),
    dataDir: path.join(root, 'data'),
    dbPath: path.join(root, 'data', 'kasabi.sqlite'),
    sessionDir: path.join(root, 'data'),
    logsDir: path.join(root, 'logs'),
    uploadsDir: path.join(root, 'server', 'uploads'),
    barcodesDir: path.join(root, 'server', 'public', 'barcodes'),
    configPath: path.join(root, 'kasabi.json'),
    iconPath: path.join(root, 'app.ico'),
  }
}

// ------------------------------------------------------------------ config

// kasabi.json is deliberately NOT shipped by the installer, so it survives
// every upgrade together with data/ -- that is what keeps the database and the
// session secret stable across versions.
function loadConfig(p, defaultPort) {
  let stored = {}
  if (fs.existsSync(p.configPath)) {
    try {
      stored = JSON.parse(fs.readFileSync(p.configPath, 'utf8'))
    } catch {
      stored = {}
    }
  }
  const cfg = {
    port: String(stored.port || defaultPort || DEFAULT_PORT),
    sessionSecret: stored.sessionSecret || crypto.randomBytes(48).toString('hex'),
  }
  return cfg
}

function saveConfig(p, cfg) {
  cfg.lanAddresses = lanAddresses()
  fs.writeFileSync(p.configPath, JSON.stringify(cfg, null, 2), 'utf8')
}

function lanAddresses() {
  const nets = require('os').networkInterfaces()
  return [
    ...new Set(
      Object.values(nets)
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address)
    ),
  ]
}

function urlsFor(cfg) {
  return [`http://localhost:${cfg.port}`, ...cfg.lanAddresses.map((a) => `http://${a}:${cfg.port}`)]
}

// -------------------------------------------------------------- the service

function serviceExists() {
  return run('sc.exe', ['query', SERVICE_ID], { allowFailure: true }).status === 0
}

function serviceState() {
  const res = run('sc.exe', ['query', SERVICE_ID], { allowFailure: true })
  if (res.status !== 0) return 'absent'
  if (/STATE\s+:\s+(\d+)/.test(res.stdout)) {
    const state = res.stdout.match(/STATE\s+:\s+(\d+)/)[1]
    if (state === '1') return 'stopped'
    if (state === '4') return 'running'
    return 'pending'
  }
  return 'absent'
}

function deleteService() {
  runSc(`stop ${SERVICE_ID}`, { allowFailure: true })
  runSc(`delete ${SERVICE_ID}`, { allowFailure: true })
  for (let i = 0; i < 30 && isRegOpen(); i += 1) {
    runSc(`stop ${SERVICE_ID}`, { allowFailure: true })
    runSc(`delete ${SERVICE_ID}`, { allowFailure: true })
    sleep(300)
  }
  return !isRegOpen()
}

function stopService() {
  if (!serviceExists()) return true
  if (!deleteService()) {
    throw new Error(`Could not remove the ${SERVICE_ID} service. Close Services.msc and retry, or run as administrator.`)
  }
  logLine(`Service ${SERVICE_ID} stopped and removed`)
  return true
}

function sleep(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    // intentional busy-wait: the installer blocks on this process anyway
  }
}

// node-windows@1.0.0-beta.8 ships a stray console.log inside generateXml; keep
// it out of the installer's output stream.
const generateServiceXml = (config) => {
  const realLog = console.log
  console.log = () => {}
  try {
    return winsw.generateXml(config)
  } finally {
    console.log = realLog
  }
}

// WinSW reads <exe-name>.xml next to the executable. Two names are written so
// the layout works with either WinSW 1.x (<id>.xml) or 2.x (<id>.exe.xml).
function writeServiceDefinition(p, cfg) {
  fs.mkdirSync(p.serviceDir, { recursive: true })
  fs.mkdirSync(p.logsDir, { recursive: true })

  const xml = generateServiceXml({
    id: SERVICE_ID,
    name: `${SERVICE_ID} POS Server`,
    description: `${DISPLAY_NAME} - KasabiPOS server`,
    execPath: p.node,
    script: p.serverEntry,
    logpath: p.logsDir,
    logging: { mode: 'roll-by-size', sizeThreshold: 10 * 1024 * 1024, keepFiles: 5 },
    stoptimeout: 20,
    workingdirectory: p.appDir,
    env: [
      { name: 'HOST', value: HOST },
      { name: 'PORT', value: cfg.port },
      { name: 'DB_PATH', value: p.dbPath },
      { name: 'SESSION_DIR', value: p.sessionDir },
      { name: 'SESSION_SECRET', value: cfg.sessionSecret },
      { name: 'CLIENT_DIST', value: p.clientDist },
      { name: 'NODE_ENV', value: 'production' },
    ],
  })

  const extra = [
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="30 sec"/>',
    '  <startmode>Automatic</startmode>',
    '  <delayedAutoStart>true</delayedAutoStart>',
    '  <installpath>%BASE%\\service</installpath>',
  ].join('\r\n')

  const document = `<?xml version="1.0" encoding="utf-8"?>\r\n${xml.replace('</service>', `${extra}\r\n</service>`)}`

  winsw.createExe(SERVICE_ID, p.serviceDir, () => {})
  for (const name of [`${SERVICE_ID.toLowerCase()}.xml`, `${SERVICE_ID.toLowerCase()}.exe.xml`]) {
    fs.writeFileSync(path.join(p.serviceDir, name), document, 'utf8')
  }
  return path.join(p.serviceDir, SERVICE_EXE)
}

function registerService(p) {
  // WinSW's own `install` uses ServiceInstaller, which quotes the ImagePath
  // correctly. If it fails to register anything, fall back to sc.exe.
  const res = run(path.join(p.serviceDir, SERVICE_EXE), ['install'], { allowFailure: true })
  if (res.status === 0) {
    sleep(1500)
    if (isRegOpen()) return 'winsw'
  }
  logLine('WinSW self-install did not register the service, falling back to sc.exe')
  runSc(`create ${SERVICE_ID} binPath= "\\"${path.join(p.serviceDir, SERVICE_EXE)}\\"" start= auto type= own`, {
    allowFailure: true,
  })
  if (!isRegOpen()) {
    throw new Error(
      `Could not create the ${SERVICE_ID} service.\n${res.stdout}\n${res.stderr}\n` +
        'Run the installer as an administrator.'
    )
  }
  return 'sc'
}

function configureService(cfg) {
  runSc(`config ${SERVICE_ID} start= delayed-auto`, { allowFailure: true })
  runSc(`config ${SERVICE_ID} obj= LocalSystem`, { allowFailure: true })
  runSc(`config ${SERVICE_ID} DisplayName= "${DISPLAY_NAME}"`, { allowFailure: true })
  runSc(`config ${SERVICE_ID} depend= Tcpip`, { allowFailure: true })
  runSc(`failure ${SERVICE_ID} reset= 86400 actions= restart/5000/restart/15000/restart/60000`, {
    allowFailure: true,
  })
  runSc(`description ${SERVICE_ID} "${DISPLAY_NAME} - KasabiPOS server (http://localhost:${cfg.port})"`, {
    allowFailure: true,
  })
}

function startService() {
  run('net.exe', ['start', SERVICE_ID], { allowFailure: true })
  for (let i = 0; i < 40; i += 1) {
    if (serviceState() === 'running') return true
    sleep(500)
  }
  return false
}

// ----------------------------------------------------------------- firewall

function deleteFirewallRule() {
  run('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE}`], {
    allowFailure: true,
  })
}

// profile=any + RemoteAddress=LocalSubnet so phones on the shop Wi-Fi can
// reach the POS while the port stays closed to the public internet.
function ensureFirewallRule(cfg) {
  deleteFirewallRule()
  const res = run(
    'netsh.exe',
    [
      'advfirewall',
      'firewall',
      'add',
      'rule',
      `name=${FIREWALL_RULE}`,
      'dir=in',
      'action=allow',
      'protocol=TCP',
      `localport=${cfg.port}`,
      'profile=any',
      'remoteip=localsubnet',
      'enable=yes',
    ],
    { allowFailure: true }
  )
  return res.status === 0
}

// ---------------------------------------------------------------- shortcuts

// Windows Script Host's CreateShortcut().Save() throws FileNotFoundException
// on any path containing non-ASCII characters, so Arabic-named .lnk files
// cannot be produced that way. Internet Shortcut (.url) files are plain INI
// text, support Unicode names, open the URL in the default browser and carry
// our own icon -- so every user-facing shortcut is written as .url. The single
// .lnk we need is the uninstaller entry, and Inno Setup creates that natively.

function writeUrlShortcut(filePath, url, iconPath) {
  // The body is pure ASCII so the file encoding is irrelevant; only the file
  // NAME carries Arabic, and NTFS handles that through the Unicode API.
  const body = ['[InternetShortcut]', `URL=${url}`, `IconFile=${iconPath}`, 'IconIndex=0', ''].join('\r\n')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body, 'ascii')
}

function startMenuDir() {
  const dir = path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    START_MENU_FOLDER
  )
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function shortcutFiles(cfg, wantDesktop) {
  const group = startMenuDir()
  const local = `http://localhost:${cfg.port}`
  const files = [
    { path: path.join(group, `${START_MENU_FOLDER}.url`), url: local },
    {
      path: path.join(group, 'فتح من الموبايل.url'),
      url:
        cfg.lanAddresses && cfg.lanAddresses.length
          ? `http://${cfg.lanAddresses[0]}:${cfg.port}`
          : local,
    },
  ]
  if (wantDesktop) {
    files.push({
      path: path.join(process.env.USERPROFILE || '', 'Desktop', `${START_MENU_FOLDER}.url`),
      url: local,
    })
  }
  return files
}

function createShortcuts(p, cfg, wantDesktop) {
  let ok = true
  for (const f of shortcutFiles(cfg, wantDesktop)) {
    try {
      writeUrlShortcut(f.path, f.url, p.iconPath)
    } catch (err) {
      ok = false
      logLine(`Could not write shortcut ${f.path}: ${err.message}`)
    }
  }
  return ok
}

function removeShortcuts() {
  const group = path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    START_MENU_FOLDER
  )
  const desktop = path.join(process.env.USERPROFILE || '', 'Desktop')
  const files = [
    path.join(group, `${START_MENU_FOLDER}.url`),
    path.join(group, 'فتح من الموبايل.url'),
    path.join(group, `${START_MENU_FOLDER}.lnk`),
    path.join(group, 'uninstall.lnk'),
    path.join(group, `${START_MENU_FOLDER} - إلغاء التثبيت.lnk`),
    path.join(desktop, `${START_MENU_FOLDER}.url`),
    path.join(desktop, `${START_MENU_FOLDER}.lnk`),
  ]
  for (const f of files) {
    try {
      fs.rmSync(f, { force: true })
    } catch {
      /* best effort */
    }
  }
  try {
    if (fs.existsSync(group) && fs.readdirSync(group).length === 0) fs.rmdirSync(group)
  } catch {
    /* Inno removes its own shortcut anyway */
  }
}

// -------------------------------------------------------------- http checks

function probe(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', () => resolve(0))
    req.on('timeout', () => {
      req.destroy()
      resolve(0)
    })
  })
}

function waitForHttp(url, attempts = 40) {
  return new Promise(async (resolve) => {
    for (let i = 0; i < attempts; i += 1) {
      const code = await probe(url)
      if (code > 0) return resolve(code)
      await new Promise((r) => setTimeout(r, 500))
    }
    resolve(0)
  })
}

// ------------------------------------------------------------------ actions

function install(p, port, wantDesktop) {
  if (!isElevatedShell()) {
    throw new Error('Administrator privileges are required to install the Windows service.')
  }
  for (const d of [p.dataDir, p.logsDir, p.uploadsDir, p.barcodesDir]) fs.mkdirSync(d, { recursive: true })

  const cfg = loadConfig(p, port)
  saveConfig(p, cfg)

  stopService()
  const exe = writeServiceDefinition(p, cfg)
  const how = registerService(p)
  configureService(cfg)
  logLine(`Service ${SERVICE_ID} registered (${how}) -> ${exe}`)

  if (!startService()) {
    throw new Error(
      `The ${SERVICE_ID} service was created but Windows could not start it.\n` +
        `Check ${path.join(p.logsDir, '*.err.log')} and ${path.join(p.logsDir, '*.out.log')}.`
    )
  }
  logLine(`Service ${SERVICE_ID} is running on ${HOST}:${cfg.port}`)

  if (!ensureFirewallRule(cfg)) {
    logLine('WARNING: the inbound firewall rule could not be created. Phones may not reach the app.')
  }
  saveConfig(p, cfg)
  createShortcuts(p, cfg, wantDesktop)

  logLine('Reach the app at:')
  for (const u of urlsFor(cfg)) logLine(`  ${u}`)
  return cfg
}

async function verify(p) {
  const cfg = loadConfig(p, null)
  const state = serviceState()
  // "/" is the public SPA entry point; /api/* requires a session and would
  // answer 401 even when the server is perfectly healthy.
  const code = await waitForHttp(`http://127.0.0.1:${cfg.port}/`, 20)
  return { state, port: cfg.port, http: code, lan: cfg.lanAddresses || [] }
}

function openBrowser(p) {
  const cfg = loadConfig(p, null)
  run('cmd.exe', ['/c', 'start', '', `http://localhost:${cfg.port}`], { allowFailure: true })
}

function setPort(p, port) {
  const cfg = loadConfig(p, port)
  cfg.port = String(port)
  saveConfig(p, cfg)
  return cfg
}

// -------------------------------------------------------------------- entry

const action = process.argv[2] || ''
const p = appPaths(process.argv[3] || process.cwd())
const port = process.argv[4] || process.env.KASABI_PORT || DEFAULT_PORT
const wantDesktop = String(process.argv[5] || '1') !== '0'

const actions = {
  install: () => {
    const cfg = install(p, port, wantDesktop)
    logLine(`OK install port=${cfg.port}`)
  },
  verify: async () => {
    const r = await verify(p)
    logLine(JSON.stringify(r))
    if (r.state !== 'running' || !r.http) process.exitCode = 1
  },
  stop: () => {
    stopService()
    logLine('OK stop')
  },
  uninstall: () => {
    stopService()
    deleteFirewallRule()
    removeShortcuts()
    logLine('OK uninstall')
  },
  setport: () => {
    const cfg = setPort(p, port)
    logLine(`OK setport ${cfg.port}`)
  },
  open: () => {
    openBrowser(p)
    logLine('OK open')
  },
}

if (!actions[action]) {
  logLine(`Unknown action: ${action || '(none)'}`)
  process.exitCode = 2
} else {
  try {
    actions[action]()
  } catch (err) {
    process.stderr.write(`provision error: ${err && err.message ? err.message : err}\n`)
    process.exitCode = 1
  }
}
