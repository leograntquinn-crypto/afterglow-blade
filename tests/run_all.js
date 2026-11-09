const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = fs.realpathSync(path.join(__dirname, '..'));
const OUT = path.join(__dirname, 'out');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function test(script, seconds, args = [], { name = script, env = {} } = {}) {
  return { script, name, seconds, args, env };
}

function desktopAndMobile(script, out) {
  return [
    test(script, 300, [out], { name: script + '_d' }),
    test(script, 300, [out, 'm'], { name: script + '_m' }),
  ];
}

// 顺序、截图目录、参数和超时沿用原 run_all.sh。
const TESTS = [
  ...desktopAndMobile('worldtest', 'out/wt'),
  ...desktopAndMobile('wstorytest', 'out/ws'),
  ...desktopAndMobile('w4arttest', 'out/wa'),
  ...['aitest', 'aitest2', 'aitest3', 'staminatest', 'runtest', 'fxltest'].map(name => test(name, 300)),
  test('stagetest', 600),
  test('efxtest', 300),
  test('efx2test', 300),
  test('ravennighttest', 300),
  test('bosspacktest', 300),
  test('bossfxtest', 300),
  test('ironjawfxtest', 300),
  test('afterimagefxtest', 300),
  ...[
    'afftest', 'traintest', 'train2', 'countertest', 'walktest', 'difftest',
    'coretest', 'contracttest', 'trialtest', 'trialsoak', 'gear', 'settest',
    'storytest', 'newenemytest', 'bossmovetest',
  ].map(name => test(name, 600, ['out/tout'])),
  test('channeltest', 600, ['out/tout'], { env: { LV: '7' } }),
  test('soakd', 900, ['out/tout'], { env: { DIFF: '0' } }),
  test('soakd60', 1200, ['out/tout'], { env: { DIFF: '2' } }),
];

function parseOptions(args) {
  const options = { only: null, skip: new Set(), port: 8765 };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!['--only', '--skip', '--port'].includes(flag) || !value || value.startsWith('--')) {
      throw new Error('用法：node tests/run_all.js [--only a,b] [--skip soakd,soakd60] [--port N]');
    }
    if (flag === '--port') {
      const port = Number(value);
      if (!/^\d+$/.test(value) || port < 1 || port > 65535) throw new Error('端口须为 1～65535 的整数');
      options.port = port;
    } else {
      const names = value.split(',').map(name => name.trim());
      for (const name of names) {
        if (!TESTS.some(job => job.name === name || job.script === name)) {
          throw new Error('未知测试：' + (name || '（空名称）'));
        }
      }
      options[flag.slice(2)] = new Set(names);
    }
  }
  return options;
}

function insideRoot(file) {
  const relative = path.relative(ROOT, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function respond(response, code) {
  response.writeHead(code).end();
}

async function serve(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return respond(response, 405);
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    return respond(response, 400);
  }
  if (pathname.includes('\0')) return respond(response, 400);
  const requested = path.resolve(ROOT, '.' + pathname);
  if (!insideRoot(requested)) return respond(response, 403);
  try {
    const file = await fs.promises.realpath(pathname.endsWith('/') ? path.join(requested, 'index.html') : requested);
    if (!insideRoot(file)) return respond(response, 403);
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return respond(response, 404);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    if (request.method === 'HEAD') return response.end();
    const stream = fs.createReadStream(file);
    stream.on('error', error => response.destroy(error));
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    if (response.headersSent) return response.destroy(error);
    respond(response, ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500);
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    const onError = error => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function closeServers(servers) {
  return Promise.all(servers.map(server => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections?.();
  })));
}

async function startServer(firstPort) {
  for (let port = firstPort; port <= 65535; port++) {
    const servers = [];
    try {
      // 直接尝试监听，避免先探测再启动之间被其他进程抢占。
      const ipv4 = http.createServer(serve);
      await listen(ipv4, port, '127.0.0.1');
      servers.push(ipv4);
      // localhost 也可能解析到 ::1，避免测试误连同端口的旧服务。
      const ipv6 = http.createServer(serve);
      try {
        await listen(ipv6, port, '::1');
        servers.push(ipv6);
      } catch (error) {
        if (!['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EPROTONOSUPPORT'].includes(error.code)) throw error;
      }
      return { servers, port };
    } catch (error) {
      await closeServers(servers);
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error('找不到可用端口');
}

// 控制台报的错里，网络层的资源载入失败（net::ERR_*）是外部环境问题——比如没有外网时 index.html 的 Google 字体样式表拉不到——不算测试失败。
// 仍然算失败的：HTTP 状态错误（自己的素材 404 / 500，消息里是 "status of 404"）、页面脚本报错。
const NET_RESOURCE_ERROR = /^(?:console: )?Failed to load resource: net::ERR_[A-Z_]+$/; // soakd / soakd60 给控制台消息加了 "console: " 前缀
function realErrors(text) {
  return text.split(/\s*\|\s*/).map((s) => s.trim()).filter((s) => s && s !== 'none' && !NET_RESOURCE_ERROR.test(s));
}

function outputFailure(job, output) {
  const soak = job.script === 'soakd' || job.script === 'soakd60';
  let jsonLines = 0;
  for (const line of output.split(/\r?\n/)) {
    if (/\b(?:FAIL|FAILED)\b/.test(line)) return line;
    const errors = /^(?:ERR |PAGE ERRORS )(.*)$/.exec(line);
    if (errors && realErrors(errors[1]).length) return line;
    if (!soak || !line.trim()) continue;
    let result;
    try {
      result = JSON.parse(line);
    } catch {
      if (/^\s*[\[{]/.test(line)) return '通关 JSON 无法解析：' + line.trim();
      continue;
    }
    jsonLines++;
    if (result?.scene !== 'clear' || result?.err !== null) {
      return '通关 JSON 的 scene 或 err 不符合要求：' + line.trim();
    }
  }
  return soak && jsonLines !== 5 ? '通关 JSON 行数为 ' + jsonLines + '，应为 5' : '';
}

let activeChild;
let interrupted;
const groupKill = process.platform !== 'win32';

function stopChild(child) {
  if (!child?.pid) return;
  if (groupKill) {
    try {
      // 结束整个测试进程组，连同该组内的浏览器子进程一起回收。
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  child.kill('SIGKILL');
}

function firstLine(message) {
  return message.split(/\r?\n/, 1)[0];
}

async function runTest(job, port) {
  const start = Date.now();
  const log = path.join(OUT, job.name + '.log');
  const fd = fs.openSync(log, 'w');
  let child;
  try {
    // 两路输出写同一个文件，保留完整输出和原有的交错顺序。
    child = spawn(process.execPath, [job.script + '.js', ...job.args], {
      cwd: __dirname,
      env: { ...process.env, ...job.env, PORT: String(port) },
      stdio: ['ignore', fd, fd],
      detached: groupKill,
    });
  } finally {
    fs.closeSync(fd);
  }
  activeChild = child;
  let timedOut = false, launchError;
  const timer = setTimeout(() => {
    timedOut = true;
    stopChild(child);
  }, job.seconds * 1000);
  const result = await new Promise(resolve => {
    child.once('error', error => { launchError = error; });
    child.once('exit', () => clearTimeout(timer));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);
  activeChild = undefined;

  let failure = '';
  if (interrupted) failure = '运行中断（' + interrupted + '）';
  else if (timedOut) failure = '超时（' + job.seconds + ' 秒）';
  else if (launchError) failure = '启动失败：' + firstLine(launchError.message);
  else if (result.signal) failure = '被信号终止（' + result.signal + '）';
  else if (result.code !== 0) failure = '退出码 ' + result.code;
  else failure = outputFailure(job, fs.readFileSync(log, 'utf8'));
  return {
    测试: job.name,
    结果: failure ? '不过' : '通过',
    用时: ((Date.now() - start) / 1000).toFixed(2) + ' 秒',
    不过原因: failure || '—',
  };
}

async function main() {
  const { only, skip, port: firstPort } = parseOptions(process.argv.slice(2));
  const matches = (set, job) => set.has(job.script) || set.has(job.name);
  const selected = TESTS.filter(job => (!only || matches(only, job)) && !matches(skip, job));
  if (!selected.length) {
    console.log('未选中测试');
    return;
  }
  for (const dir of ['wt', 'ws', 'wa', 'tout']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  const { servers, port } = await startServer(firstPort);
  const onInterrupt = signal => {
    interrupted = signal;
    stopChild(activeChild);
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);
  const results = [];
  try {
    console.log('静态服务器 http://localhost:' + port);
    for (const job of selected) {
      if (interrupted) break;
      console.log('=== ' + job.name);
      results.push(await runTest(job, port));
    }
  } finally {
    await closeServers(servers);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
  }
  console.table(results);
  if (interrupted || results.some(result => result.结果 === '不过')) process.exitCode = 1;
}

main().catch(error => {
  console.error(firstLine(error.message));
  process.exitCode = 1;
});
