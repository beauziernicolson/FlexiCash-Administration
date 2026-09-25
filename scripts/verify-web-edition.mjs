import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();

// Ce dépôt n'est valide que s'il représente réellement le produit Web complet.
// Un sous-ensemble de pages de démonstration doit échouer, même s'il est propre.
const requiredPaths = [
  'README.md',
  'audit-baseline.json',
  'index.html',
  'offline.html',
  'sw.js',
  'vercel.json',
  'package.json',
  'auth',
  'app',
  'admin',
  'account',
  'onboarding',
  'oauth',
  'payments',
  'api',
  'supabase',
  'assets',
  'tests',
  'auth/login.html',
  'auth/callback.html',
  'auth/mfa.html',
  'app/dashboard.html',
  'app/checkout.html',
  'assets/js/app.js',
  'assets/js/components.js',
  'assets/js/services/auth-service.js',
  'assets/js/services/supabase-client.js',
];

const forbiddenRoots = [
  'android', 'ios', 'mobile', '.claude', '.finality-lock',
];
const forbiddenFiles = [
  'CLAUDE.md', '.mcp.json', 'capacitor.config.json', 'capacitor.config.ts',
  '.github/workflows/mobile-build.yml',
];
const forbiddenExtensions = new Set([
  '.env', '.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.sqlite', '.db', '.log', '.map',
]);

const failures = [];
for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) failures.push(`missing required Web surface: ${path}`);
}
for (const path of forbiddenRoots) {
  if (existsSync(join(root, path))) failures.push(`forbidden native/internal directory: ${path}`);
}
for (const path of forbiddenFiles) {
  if (existsSync(join(root, path))) failures.push(`forbidden native/internal file: ${path}`);
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

const nativeRuntimePatterns = [
  ['Capacitor package import', /@capacitor\//i],
  ['window.Capacitor', /window\.Capacitor\b/],
  ['Capacitor.Plugins', /Capacitor\.Plugins\b/],
  ['native bridge dependency', /native-bridge\.js/i],
  ['native OAuth redirect', /NATIVE_OAUTH_REDIRECT\b/],
  ['FlexiCash native deep link', /com\.flexicash\.app:\/\//i],
  ['native plugin resolver', /nativePlugin\s*\(/],
  ['native platform resolver', /nativePlatform\s*\(/],
  ['native lifecycle listener', /appStateChange/],
  ['native Android back handler', /backButton/],
  ['native biometric bridge', /biometric(?:Available|Verify)\s*\(/i],
  ['native push bridge', /pushRegister\s*\(/i],
];

const scanExt = /\.(?:html|css|js|mjs|json|yml|yaml|txt|md|sql)$/i;
const runtimeNativeScanExt = /\.(?:html|js|mjs)$/i;
const skipped = new Set(['node_modules', '.git']);
const htmlFiles = [];
const jsFiles = [];
let fileCount = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipped.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) { walk(full); continue; }
    fileCount += 1;
    const rel = relative(root, full).replaceAll('\\', '/');
    const lower = name.toLowerCase();
    const extension = extname(lower);
    if (forbiddenExtensions.has(extension) || lower === '.env' || lower.startsWith('.env.')) {
      failures.push(`forbidden sensitive artifact: ${rel}`);
    }
    if (lower.endsWith('.html')) htmlFiles.push(full);
    if (lower.endsWith('.js') || lower.endsWith('.mjs')) jsFiles.push(full);
    if (!scanExt.test(name)) continue;

    const text = readFileSync(full, 'utf8');
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) failures.push(`possible secret in ${rel} (${pattern})`);
    }

    // Le scanner lui-même contient les motifs interdits sous forme de regex.
    // On contrôle uniquement le runtime produit, pas scripts/ ni les docs d'audit.
    const isAuditTooling = rel.startsWith('scripts/');
    if (!isAuditTooling && runtimeNativeScanExt.test(name)) {
      for (const [label, pattern] of nativeRuntimePatterns) {
        if (pattern.test(text)) failures.push(`native runtime residue in ${rel}: ${label}`);
      }
    }
  }
}
walk(root);

function localTarget(sourceFile, rawRef) {
  const ref = rawRef.trim();
  if (!ref || ref.startsWith('#')) return null;
  if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(ref)) return null;
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return null;
  const decoded = decodeURIComponent(clean);
  const target = decoded.startsWith('/') ? resolve(root, `.${decoded}`) : resolve(dirname(sourceFile), decoded);
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
    if (resolved.escaped) failures.push(`local reference escapes repository in ${relHtml}: ${rawRef}`);
    else if (!existsSync(resolved.target)) failures.push(`broken local reference in ${relHtml}: ${rawRef}`);
  }
}

const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g;
function verifyImports(sourceFile, text, label) {
  for (const match of text.matchAll(importPattern)) {
    const rawRef = match[1];
    if (!rawRef.startsWith('.') && !rawRef.startsWith('/')) continue;
    const resolved = localTarget(sourceFile, rawRef);
    if (!resolved) continue;
    if (resolved.escaped) failures.push(`module import escapes repository in ${label}: ${rawRef}`);
    else if (!existsSync(resolved.target)) failures.push(`missing local module in ${label}: ${rawRef}`);
  }
}
for (const jsFile of jsFiles) {
  verifyImports(jsFile, readFileSync(jsFile, 'utf8'), relative(root, jsFile).replaceAll('\\', '/'));
}
for (const htmlFile of htmlFiles) {
  verifyImports(htmlFile, readFileSync(htmlFile, 'utf8'), relative(root, htmlFile).replaceAll('\\', '/'));
}

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
  console.error('FlexiCash Web audit mirror verification FAILED');
  [...new Set(failures)].forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`FlexiCash Web audit mirror verification PASS (${fileCount} files, ${htmlFiles.length} HTML files, ${jsFiles.length} JS modules checked)`);
