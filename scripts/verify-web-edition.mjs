import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();
const required = [
  'README.md',
  'index.html',
  'offline.html',
  'sw.js',
  'auth/login.html',
  'app/dashboard.html',
  'admin/index.html',
  'assets/js/app.js',
  'assets/js/config.js',
  'assets/js/pages/app-review-pages.js',
];
const forbiddenRoots = [
  'android',
  'ios',
  'mobile',
  '.claude',
  '.finality-lock',
  'supabase',
  'environments',
  'api',
];
const forbiddenFiles = [
  'CLAUDE.md',
  '.mcp.json',
  'capacitor.config.json',
  'capacitor.config.ts',
];
const forbiddenExtensions = new Set([
  '.env', '.pem', '.key', '.p12', '.pfx', '.jks', '.keystore',
  '.sql', '.sqlite', '.db', '.log', '.map',
]);

const failures = [];
for (const path of required) {
  if (!existsSync(join(root, path))) failures.push(`missing required file: ${path}`);
}
for (const path of forbiddenRoots) {
  if (existsSync(join(root, path))) failures.push(`forbidden private/native directory: ${path}`);
}
for (const path of forbiddenFiles) {
  if (existsSync(join(root, path))) failures.push(`forbidden private/native file: ${path}`);
}

const secretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?[^\s"']{8,}/i,
  /MONCASH_(?:SANDBOX|PRODUCTION)_CLIENT_SECRET\s*[:=]\s*["']?[^\s"']{8,}/i,
  /STRIPE_SECRET_KEY\s*[:=]\s*["']?[^\s"']{8,}/i,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\brk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const scanExt = /\.(?:html|css|js|mjs|json|yml|yaml|txt|md)$/i;
const skipped = new Set(['node_modules', '.git']);
const htmlFiles = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipped.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }

    const rel = relative(root, full).replaceAll('\\', '/');
    const lower = name.toLowerCase();
    const extension = extname(lower);
    if (forbiddenExtensions.has(extension) || lower === '.env' || lower.startsWith('.env.')) {
      failures.push(`forbidden sensitive artifact: ${rel}`);
    }

    if (lower.endsWith('.html')) htmlFiles.push(full);
    if (!scanExt.test(name)) continue;

    const text = readFileSync(full, 'utf8');
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) failures.push(`possible secret in ${rel} (${pattern})`);
    }
  }
}
walk(root);

function localTarget(htmlFile, rawRef) {
  const ref = rawRef.trim();
  if (!ref || ref.startsWith('#')) return null;
  if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(ref)) return null;

  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return null;
  const decoded = decodeURIComponent(clean);
  const target = decoded.startsWith('/')
    ? resolve(root, `.${decoded}`)
    : resolve(dirname(htmlFile), decoded);

  const normalizedRoot = normalize(`${root}/`);
  const normalizedTarget = normalize(target);
  if (!normalizedTarget.startsWith(normalizedRoot) && normalizedTarget !== normalize(root)) {
    return { escaped: true, target: normalizedTarget };
  }
  return { escaped: false, target: normalizedTarget };
}

const refPattern = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
for (const htmlFile of htmlFiles) {
  const relHtml = relative(root, htmlFile).replaceAll('\\', '/');
  const text = readFileSync(htmlFile, 'utf8');
  for (const match of text.matchAll(refPattern)) {
    const rawRef = match[1];
    const resolved = localTarget(htmlFile, rawRef);
    if (!resolved) continue;
    if (resolved.escaped) {
      failures.push(`local reference escapes repository in ${relHtml}: ${rawRef}`);
      continue;
    }
    if (!existsSync(resolved.target)) {
      failures.push(`broken local reference in ${relHtml}: ${rawRef}`);
    }
  }
}

// Contrat Service Worker : cette édition doit réellement posséder le même
// modèle de cache que le Web FlexiCash principal, et pas un faux fallback.
if (existsSync(join(root, 'sw.js'))) {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const swContracts = [
    ['cache production baseline', /flexicash-runtime-v140-hosted-return-bfcache/],
    ['offline fallback', /cache\.match\(["']\/offline\.html["']\)/],
    ['OAuth callback no-store', /auth\/callback\.html[\s\S]*cache:\s*["']no-store["']/],
    ['network-first navigations', /event\.request\.mode\s*===\s*["']navigate["']/],
    ['old FlexiCash cache purge', /key\.startsWith\(["']flexicash-runtime-["']\)/],
    ['skipWaiting', /self\.skipWaiting\(\)/],
    ['clients claim', /self\.clients\.claim\(\)/],
  ];
  for (const [label, pattern] of swContracts) {
    if (!pattern.test(sw)) failures.push(`service worker contract missing: ${label}`);
  }
}

if (existsSync(join(root, 'assets/js/app.js'))) {
  const app = readFileSync(join(root, 'assets/js/app.js'), 'utf8');
  if (!/serviceWorker[\s\S]*register\(/.test(app)) failures.push('service worker is not registered by assets/js/app.js');
  if (!/updateViaCache:\s*["']none["']/.test(app)) failures.push('service worker registration must use updateViaCache:none');
}

if (failures.length) {
  console.error('FlexiCash Web edition verification FAILED');
  [...new Set(failures)].forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`FlexiCash Web edition verification PASS (${htmlFiles.length} HTML files checked)`);
