#!/usr/bin/env node
/**
 * check-air-gap.js
 * Gate di CI di ADR-63 § 3 (`PLAN-F03` T6): l'air-gap di ADR-53 § 4 verificato
 * sulla topologia **versionata** in `docker-compose.prod.yml`, non su un mock.
 *
 * Due livelli:
 * 1. Strutturale, sulla configurazione risolta da `docker compose config`:
 *    `nginx-static` sta solo su `edge_net`, nessun altro servizio ci sta, il
 *    volume statico è `ro` per Nginx e scritto dal backend, nessuna dipendenza
 *    né variabile d'ambiente sul piano pubblico, postgres/redis senza porte.
 * 2. Dal vivo, con i container reali (postgres, redis, nginx-static e uno stub
 *    in ascolto come `backend` sulla rete di gestione):
 *    - un controllo positivo prova che postgres/redis/backend sono raggiungibili
 *      da `mgmt_net`, così il negativo non passa per un servizio spento;
 *    - da `nginx-static` le stesse connessioni **falliscono**;
 *    - il mount del volume non è scrivibile da `nginx-static`;
 *    - ogni pagina esportata è servita byte per byte all'URL che ADR-65 fissa,
 *      con `Cache-Control: no-cache`; il CSS con fingerprint è `immutable`;
 *      `manifest.json` non è pubblico;
 *    - la visita a una Pagina finisce nel log delle visite, un asset no (ADR-68);
 *    - il tombstone (file rimosso dal volume) rende quel percorso `404`.
 *
 * Uso: node check-air-gap.js <directory-artefatti-export>
 * In CI: sulla directory `STATIC_EXPORT_ARTIFACT_DIR` scritta dalla suite di
 * export, vedi `.github/workflows/ci.yml`. Richiede `.env` (in CI copiato da
 * `.env.example`) perché il compose di produzione lo dichiara.
 *
 * Esce `1` se una sola asserzione fallisce **o** se non trova pagine da
 * servire: un gate che non ha verificato nulla non è un gate verde.
 * Ciò che la CI non può vedere (firewall reale, porte pubblicate sull'host)
 * resta nella checklist di go-live di ADR-63.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT = 'cms-airgap';
const COMPOSE_FILE = path.join(__dirname, 'docker-compose.prod.yml');
const COMPOSE = ['compose', '-p', PROJECT, '-f', COMPOSE_FILE];
const MGMT_NET = `${PROJECT}_mgmt_net`;
const STATIC_VOLUME = `${PROJECT}_static_site`;
const LOG_VOLUME = `${PROJECT}_edge_logs`;
const HELPER_IMAGE = 'nginx:1.27-alpine';
const BACKEND_STUB = `${PROJECT}-backend-stub`;
const EDGE_URL = 'http://127.0.0.1:58080';

/** Servizi del Piano di Gestione che il piano pubblico non deve mai raggiungere. */
const MANAGEMENT_TARGETS = [
  { host: 'postgres', port: 5432 },
  { host: 'redis', port: 6379 },
  { host: 'backend', port: 3000 },
];

const failures = [];

function fail(message) {
  failures.push(message);
  console.log(`::error::${message}`);
}

function pass(message) {
  console.log(`ok - ${message}`);
}

function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

/** Esito di un comando senza lanciare: serve alle asserzioni negative. */
function dockerStatus(args) {
  return spawnSync('docker', args, { encoding: 'utf-8' }).status;
}

/** Elenco ricorsivo dei file `.html` sotto `dir`, relativi a `dir`. */
function collectHtmlFiles(dir, base = dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectHtmlFiles(full, base));
    } else if (entry.name.endsWith('.html')) {
      found.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return found;
}

/** URL pubblico di un file esportato (ADR-65): `a/b/index.html` → `/a/b`, `index.html` → `/`. */
function publicUrlOf(relativeFile) {
  const dir = relativeFile.replace(/(^|\/)index\.html$/, '');
  return `/${dir}`;
}

function checkStructure() {
  const config = JSON.parse(docker([...COMPOSE, 'config', '--format', 'json']));
  const services = config.services;
  const networksOf = (name) => Object.keys(services[name].networks ?? {});
  const edge = services['nginx-static'];

  if (!edge) {
    fail('docker-compose.prod.yml non dichiara il servizio nginx-static');
    return;
  }
  const edgeNetworks = networksOf('nginx-static');
  if (edgeNetworks.length === 1 && edgeNetworks[0] === 'edge_net') {
    pass('nginx-static sta solo su edge_net');
  } else {
    fail(`nginx-static deve stare solo su edge_net, trovato: ${edgeNetworks.join(', ') || 'nessuna rete esplicita'}`);
  }

  const intruders = Object.keys(services).filter(
    (name) => name !== 'nginx-static' && networksOf(name).includes('edge_net'),
  );
  if (intruders.length === 0) {
    pass('nessun servizio del Piano di Gestione su edge_net');
  } else {
    fail(`servizi del Piano di Gestione su edge_net: ${intruders.join(', ')}`);
  }

  const edgeStatic = (edge.volumes ?? []).find((v) => v.source === 'static_site');
  if (edgeStatic && edgeStatic.read_only === true) {
    pass('volume static_site montato in sola lettura da nginx-static');
  } else {
    fail('nginx-static deve montare static_site con read_only');
  }

  const backendStatic = (services.backend.volumes ?? []).find((v) => v.source === 'static_site');
  const exportPath = services.backend.environment?.STATIC_EXPORT_PATH;
  if (backendStatic && !backendStatic.read_only && backendStatic.target === exportPath) {
    pass(`il backend scrive static_site su STATIC_EXPORT_PATH (${exportPath})`);
  } else {
    fail('il backend deve montare static_site in scrittura esattamente su STATIC_EXPORT_PATH');
  }

  const backendLogs = (services.backend.volumes ?? []).find((v) => v.source === 'edge_logs');
  const edgeLogs = (edge.volumes ?? []).find((v) => v.source === 'edge_logs');
  if (backendLogs && edgeLogs && backendLogs.target === services.backend.environment?.EDGE_ACCESS_LOG_DIR) {
    pass('il volume dei log delle visite è condiviso fra nginx-static e il backend (ADR-68)');
  } else {
    fail('edge_logs deve essere montato da nginx-static e dal backend su EDGE_ACCESS_LOG_DIR');
  }

  if (!edge.depends_on && !edge.env_file && !edge.environment) {
    pass('nginx-static non dipende da servizi né riceve variabili d\'ambiente');
  } else {
    fail('nginx-static non deve avere depends_on, env_file o environment');
  }

  for (const name of ['postgres', 'redis']) {
    if ((services[name].ports ?? []).length === 0) {
      pass(`${name} non pubblica porte sull'host`);
    } else {
      fail(`${name} pubblica porte sull'host`);
    }
  }
}

async function httpGet(url) {
  const response = await fetch(url, { redirect: 'manual' });
  return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
}

async function waitForEdge() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${EDGE_URL}/`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`nginx-static non risponde su ${EDGE_URL} entro 30s`);
}

async function checkLive(artifactDir, htmlFiles) {
  docker([...COMPOSE, 'up', '-d', '--wait', 'postgres', 'redis', 'nginx-static'], { stdio: 'inherit' });
  docker([
    'run', '-d', '--name', BACKEND_STUB, '--network', MGMT_NET, '--network-alias', 'backend', HELPER_IMAGE,
    'sh', '-c', "sed -i 's/listen  *80;/listen 3000;/' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'",
  ]);

  const probe = MANAGEMENT_TARGETS.map(({ host, port }) => `nc -z -w 3 ${host} ${port}`).join(' && ');
  const controlStatus = dockerStatus([
    'run', '--rm', '--network', MGMT_NET, HELPER_IMAGE, 'sh', '-c', `sleep 2; ${probe}`,
  ]);
  if (controlStatus === 0) {
    pass('controllo positivo: postgres, redis e backend raggiungibili da mgmt_net');
  } else {
    fail('controllo positivo fallito: i servizi di gestione non sono raggiungibili nemmeno da mgmt_net, il test negativo non proverebbe nulla');
  }

  for (const { host, port } of MANAGEMENT_TARGETS) {
    const status = dockerStatus([...COMPOSE, 'exec', '-T', 'nginx-static', 'sh', '-c', `nc -z -w 3 ${host} ${port}`]);
    if (status !== 0) {
      pass(`nginx-static non raggiunge ${host}:${port}`);
    } else {
      fail(`AIR-GAP VIOLATO: nginx-static raggiunge ${host}:${port}`);
    }
  }

  const writeStatus = dockerStatus([
    ...COMPOSE, 'exec', '-T', 'nginx-static', 'sh', '-c', 'touch /usr/share/nginx/html/.airgap-write-probe',
  ]);
  if (writeStatus !== 0) {
    pass('il volume non è scrivibile da nginx-static');
  } else {
    fail('nginx-static riesce a scrivere sul volume statico');
  }

  // Il seed fa la parte del worker di export: scrive sul volume dal lato di
  // gestione, mai dal container pubblico.
  docker([
    'run', '--rm', '-v', `${STATIC_VOLUME}:/data`, '-v', `${path.resolve(artifactDir)}:/src:ro`, HELPER_IMAGE,
    'sh', '-c', "cp -r /src/. /data/ && mkdir -p /data/assets && printf 'a{}' > /data/assets/style.airgap.css && printf '{}' > /data/manifest.json",
  ]);

  await waitForEdge();

  for (const file of htmlFiles) {
    const url = publicUrlOf(file);
    const response = await httpGet(`${EDGE_URL}${url}`);
    const expected = fs.readFileSync(path.join(artifactDir, file));
    if (response.status === 200 && response.body.equals(expected)) {
      pass(`${url} servito byte per byte dal file esportato ${file}`);
    } else {
      fail(`${url}: atteso 200 con il contenuto di ${file}, ottenuto ${response.status}`);
    }
    if (response.headers.get('cache-control') === 'no-cache') {
      pass(`${url} porta Cache-Control: no-cache`);
    } else {
      fail(`${url}: Cache-Control atteso no-cache, trovato ${response.headers.get('cache-control')}`);
    }
  }

  const css = await httpGet(`${EDGE_URL}/assets/style.airgap.css`);
  if (css.status === 200 && css.headers.get('cache-control') === 'public, max-age=31536000, immutable') {
    pass('CSS con fingerprint servito come immutable');
  } else {
    fail(`CSS con fingerprint: atteso 200 immutable, ottenuto ${css.status} ${css.headers.get('cache-control')}`);
  }

  const manifest = await httpGet(`${EDGE_URL}/manifest.json`);
  if (manifest.status === 404) {
    pass('manifest.json non è pubblico');
  } else {
    fail(`manifest.json esposto sul piano pubblico (status ${manifest.status})`);
  }

  // ADR-68: la visita a una Pagina finisce nel log JSON che il backend legge;
  // gli asset no. Letto dal volume con un container di servizio, come farebbe il job.
  const logDump = spawnSync(
    'docker',
    ['run', '--rm', '-v', `${LOG_VOLUME}:/logs:ro`, HELPER_IMAGE, 'sh', '-c', 'cat /logs/access-*.log 2>/dev/null'],
    { encoding: 'utf-8' },
  ).stdout;
  const loggedUris = logDump
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line).uri;
      } catch {
        return null;
      }
    });
  if (loggedUris.includes(publicUrlOf(htmlFiles[0]))) {
    pass(`la visita a ${publicUrlOf(htmlFiles[0])} è nel log delle visite`);
  } else {
    fail(`la visita a ${publicUrlOf(htmlFiles[0])} non compare nel log delle visite`);
  }
  if (!loggedUris.some((uri) => typeof uri === 'string' && uri.startsWith('/assets/'))) {
    pass('gli asset non finiscono nel log delle visite');
  } else {
    fail('un asset è finito nel log delle visite');
  }

  const tombstoned = htmlFiles[0];
  docker(['run', '--rm', '-v', `${STATIC_VOLUME}:/data`, HELPER_IMAGE, 'rm', `/data/${tombstoned}`]);
  const afterTombstone = await httpGet(`${EDGE_URL}${publicUrlOf(tombstoned)}`);
  if (afterTombstone.status === 404) {
    pass(`tombstone: ${publicUrlOf(tombstoned)} risponde 404 dopo la rimozione del file`);
  } else {
    fail(`tombstone: ${publicUrlOf(tombstoned)} risponde ${afterTombstone.status} invece di 404`);
  }
}

function cleanup() {
  spawnSync('docker', ['rm', '-f', BACKEND_STUB], { stdio: 'ignore' });
  spawnSync('docker', [...COMPOSE, 'down', '-v', '--remove-orphans'], { stdio: 'ignore' });
}

async function main() {
  const artifactDir = process.argv[2];
  if (!artifactDir || !fs.existsSync(artifactDir)) {
    console.log(`::error::Directory di artefatti assente: ${artifactDir ?? '(non indicata)'}`);
    process.exit(1);
  }
  const htmlFiles = collectHtmlFiles(artifactDir);
  if (htmlFiles.length === 0) {
    console.log(`::error::Nessuna pagina esportata in ${artifactDir}: il gate non ha nulla da servire.`);
    process.exit(1);
  }

  checkStructure();
  cleanup();
  try {
    await checkLive(artifactDir, htmlFiles);
  } catch (error) {
    fail(`verifica dal vivo interrotta: ${error.message}`);
  } finally {
    cleanup();
  }

  if (failures.length > 0) {
    console.log(`\nAir-gap: ${failures.length} asserzione/i fallita/e.`);
    process.exit(1);
  }
  console.log('\nAir-gap verificato.');
}

main();
