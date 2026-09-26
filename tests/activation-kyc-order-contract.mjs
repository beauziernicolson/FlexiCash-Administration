import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const proofMigration = read('supabase/migrations/20260801175500_allow_activation_proof_before_kyc.sql');
const basicMigration = read('supabase/migrations/20260801181500_allow_basic_activation_without_kyc.sql');
// Wallet Option B : le parcours client vers le niveau Full remplace l'ancienne
// page d'activation payante.
const activationPage = read('assets/js/pages/wallet-upgrade-page.js');
const adminPage = read('assets/js/pages/admin-pages.js');
const capabilities = read('assets/js/services/account-capabilities-service.js');
const sw = read('sw.js');

const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const createStart = proofMigration.indexOf('create or replace function public.create_manual_activation_request_proof_only');
const reviewStart = proofMigration.indexOf('create or replace function public.admin_review_activation_request');
const createSql = proofMigration.slice(createStart, reviewStart);

check('soumission preuve sans KYC', createStart >= 0 && !createSql.includes("raise exception 'kyc_not_approved'"));
check('nouvelle migration Basic présente', basicMigration.includes('allow') || basicMigration.includes('Basic wallet'));
check('approbation activation sans garde KYC', !basicMigration.includes("raise exception 'kyc_not_approved'"));
check('profil actif toujours obligatoire', basicMigration.includes("raise exception 'profile_not_eligible_for_activation'"));
check('preuve consultée toujours obligatoire', basicMigration.includes("raise exception 'activation_evidence_not_reviewed'"));
check('page client explique le niveau actuel', activationPage.includes('Votre niveau actuel'));
check('page client propose le passage au Full Wallet', activationPage.includes('Demander le passage au Full'));
check('admin propose activation Basic', adminPage.includes('Activation du compte Basique'));
check('admin ne bloque plus sur KYC', !adminPage.includes('Validation bloquée — KYC requis'));
check('bouton activation disponible', adminPage.includes('Valider et activer le wallet'));
check('limites Basic rappelées', adminPage.includes('limites Basic'));
check('service capacités expose Basic / Vérifié', capabilities.includes('Service capacités de compte (Basic / Vérifié)') && capabilities.includes('account_tier'));
check('cache V65 actif', sw.includes('flexicash-runtime-v65-basic-activation-no-kyc'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} — ${item.name}`);
console.log(`\nActivation Basic / KYC séparé : ${checks.length - failed.length}/${checks.length} contrôles passés`);
if (failed.length) process.exit(1);
