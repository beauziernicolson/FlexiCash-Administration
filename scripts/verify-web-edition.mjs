import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const required = ['README.md', 'index.html', 'auth/login.html', 'app/dashboard.html'];
const forbiddenRoots = ['android', 'ios', 'mobile', '.claude'];
const forbiddenFiles = ['CLAUDE.md', '.mcp.json', 'capacitor.config.json', 'capacitor.config.ts'];

const failures = [];
for (const path of required) {
  if (!existsSync(join(root, path))) failures.push(`missing required file: ${path}`);
}
for (const path of forbiddenRoots) {
  if (existsSync(join(root, path))) failures.push(`forbidden mobile/internal directory: ${path}`);
}
for (const path of forbiddenFiles) {
  if (existsSync(join(root, path))) failures.push(`forbidden mobile/internal file: ${path}`);
}

const secretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=/i,
  /MONCASH_(?:SANDBOX|PRODUCTION)_CLIENT_SECRET\s*=/i,
  /STRIPE_SECRET_KEY\s*=/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const allowedExt = /\.(?:html|css|js|mjs|json|yml|yaml|txt)$/i;
const skipped = new Set(['node_modules', '.git']);
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipped.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (allowedExt.test(name)) {
      const text = readFileSync(full, 'utf8');
      for (const pattern of secretPatterns) {
        if (pattern.test(text)) failures.push(`possible secret in ${relative(root, full)} (${pattern})`);
      }
    }
  }
}
walk(root);

if (failures.length) {
  console.error('FlexiCash Web edition verification FAILED');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log('FlexiCash Web edition verification PASS');
