'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SERVICE_NAME = 'KasabiPOS'
const FIREWALL_RULE = 'KasabiPOS Service'

function run(exe, args, options = {}) {
  const res = spawnSync(exe, args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
  })
  if (process.env.KASABI_DEBUG) {
    console.log('>>', exe, args.join(' '))
    if (res.stdout) console.log(res.stdout)
    if (res.stderr) console.error(res.stderr)
  }
  const ok = res.status === 0
  if (!ok && !options.allowFailure) {
    throw new Error(
      `Command failed (${res.status}): ${exe} ${args.join(' ')}\n${res.stdout || ''}${res.stderr || ''}`
    )
  }
  return res
}

// Resolve an absolute long path to its 8.3 short form so the Windows
// service command line has no spaces (NSSM does not re-quote paths).
function shortPath(p) {
  const res = run('cmd.exe', ['/c', `for %I in ("${p}") do @echo %~sI`], { allowFailure: true })
  const out = res.stdout ? res.stdout.trim() : ''
  return out || p
}

function appPaths(appDir) {
  return {
    appDir,
    node: path.join(appDir, 'runtime', 'node.exe'),
    nssm: path.join(appDir, 'tools', 'nssm.exe'),
    serverEntry: path.join(appDir, 'server', 'index.js'),
    clientDist: path.join(appDir, 'client'),
    dbPath: path.join(appDir, 'data', 'kasabi.sqlite'),
    sessionDir: path.join(appDir, 'data'),
    logsDir: path.join(appDir, 'logs'),
    configPath: path.join(appDir, 'kasabi.json'),
  }
}

function loadConfig(p, defaultPort) {
  let cfg = {}
  if (fs.existsSync(p.configPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(p.configPath, 'utf8'))
    } catch {
      cfg = {}
    }
  }
  cfg.port = String(cfg.port || defaultPort || '3000')
  cfg.sessionSecret = cfg.sessionSecret || crypto.randomBytes(48).toString('hex')
  return cfg
}

function saveConfig(p, cfg) {
  fs.writeFileSync(p.configPath, JSON.stringify(cfg, null, 2), 'utf8')
}

function serviceExists(p) {
  const res = run(p.nssm, ['status', SERVICE_NAME], { allowFailure: true })
  return res.status === 0
}

function removeService(p) {
  run(p.nssm, ['stop', SERVICE_NAME], { allowFailure: true })
  // 'confirm' skips the interactive confirmation prompt
  run(p.nssm, ['remove', SERVICE_NAME, 'confirm'], { allowFailure: true })
}

function ensureFirewall(p, cfg) {
  run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE}`], {
    allowFailure: true,
  })
  const res = run(
    'netsh',
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
    ],
    { allowFailure: true }
  )
  return res.status === 0
}

function deleteFirewall() {
  run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE}`], {
    allowFailure: true,
  })
}

function installService(p, port) {
  fs.mkdirSync(p.logsDir, { recursive: true })
  fs.mkdirSync(p.sessionDir, { recursive: true })

  if (serviceExists(p)) removeService(p)

  const cfg = loadConfig(p, port)
  saveConfig(p, cfg)

  const nodeShort = shortPath(p.node)
  const entryShort = shortPath(p.serverEntry)

  const env = [
    `PORT=${cfg.port}`,
    `DB_PATH=${p.dbPath}`,
    `SESSION_DIR=${p.sessionDir}`,
    `SESSION_SECRET=${cfg.sessionSecret}`,
    `CLIENT_DIST=${p.clientDist}`,
    'NODE_ENV=production',
  ].join(';')

  run(p.nssm, ['install', SERVICE_NAME, nodeShort, entryShort])
  run(p.nssm, ['set', SERVICE_NAME, 'AppDirectory', p.appDir])
  run(p.nssm, ['set', SERVICE_NAME, 'AppEnvironmentExtra', env])
  run(p.nssm, ['set', SERVICE_NAME, 'DisplayName', 'KasabiPOS POS Server'])
  run(p.nssm, ['set', SERVICE_NAME, 'Description', 'نظام الكاشير - خادم نقاط البيع'])
  run(p.nssm, ['set', SERVICE_NAME, 'ObjectName', 'LocalSystem'])
  run(p.nssm, ['set', SERVICE_NAME, 'Start', 'SERVICE_AUTO_START'])
  run(p.nssm, ['set', SERVICE_NAME, 'AppStdout', path.join(p.logsDir, 'output.log')])
  run(p.nssm, ['set', SERVICE_NAME, 'AppStderr', path.join(p.logsDir, 'error.log')])
  run(p.nssm, ['set', SERVICE_NAME, 'AppStdoutCreationDisposition', '4'])
  run(p.nssm, ['set', SERVICE_NAME, 'AppStderrCreationDisposition', '4'])
  run(p.nssm, ['set', SERVICE_NAME, 'AppRotateFiles', '1'])
  run(p.nssm, ['set', SERVICE_NAME, 'AppRotateBytes', '1048576'])
  run(p.nssm, ['set', SERVICE_NAME, 'AppExit', 'Default', 'Restart'])
  run(p.nssm, ['set', SERVICE_NAME, 'AppRestartDelay', '5000'])
  run(p.nssm, ['set', SERVICE_NAME, 'AppThrottle', '1500'])

  ensureFirewall(p, cfg)

  run(p.nssm, ['start', SERVICE_NAME])
  console.log(`Service ${SERVICE_NAME} installed and started (port ${cfg.port})`)
}

function stopService(p) {
  if (!fs.existsSync(p.nssm)) return
  if (!serviceExists(p)) return
  removeService(p)
  console.log(`Service ${SERVICE_NAME} removed`)
}

function uninstallService(p) {
  stopService(p)
  deleteFirewall()
}

const action = process.argv[2] || ''
const appDir = process.argv[3] || process.cwd()
const port = process.argv[4] || process.env.KASABI_PORT || '3000'

const p = appPaths(appDir)

try {
  if (action === 'install') {
    installService(p, port)
  } else if (action === 'stop') {
    stopService(p)
  } else if (action === 'uninstall') {
    uninstallService(p)
  } else {
    throw new Error(`Unknown action: ${action}`)
  }
} catch (err) {
  console.error(`provision error: ${err.message}`)
  process.exitCode = 1
}