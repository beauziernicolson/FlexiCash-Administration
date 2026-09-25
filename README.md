# FlexiCash — Web Administrative Review

FlexiCash est une plateforme Web de portefeuille électronique et de paiement conçue pour gérer des comptes utilisateurs, des profils financiers, des portefeuilles, des transferts, des demandes de paiement, des dépôts/retraits, l’épargne, la sécurité du compte et les opérations d’administration.

Ce dépôt est l’**édition publique de revue technique destinée à l’administration**. Il a été préparé à partir du projet FlexiCash principal, tout en retirant volontairement ce qui n’est pas utile à une revue Web ou ce qui ne doit pas être publié.

> **Important** — Ce dépôt n’est pas le dépôt de production et ne doit pas être utilisé pour déplacer de l’argent réel. Les actions financières y sont neutralisées. Le moteur financier privé, les migrations SQL sensibles, les secrets, les clés fournisseurs et les outils d’exploitation restent dans le dépôt principal privé et dans les gestionnaires de secrets.

## Objectif de ce dépôt

Permettre à un responsable administratif ou à un évaluateur technique de comprendre rapidement :

- ce qu’est FlexiCash ;
- comment l’application Web est structurée ;
- quelles fonctionnalités sont proposées ;
- comment l’authentification et la sécurité sont abordées ;
- comment les flux financiers sont présentés côté client ;
- quelles protections empêchent ce dépôt public de devenir un accès indirect à la Production ;
- comment la qualité de cette édition est contrôlée automatiquement.

## Périmètre

### Inclus

- page d’entrée Web FlexiCash ;
- parcours de connexion Web ;
- surface de création de compte ;
- dashboard ;
- envoyer / recevoir ;
- dépôts / retraits ;
- transactions ;
- scan QR ;
- épargne ;
- profil ;
- sécurité ;
- paramètres ;
- support ;
- design system Web simplifié ;
- configuration Supabase neutralisée ;
- adaptateurs Web sans Capacitor ;
- Service Worker Web/PWA ;
- configuration Vercel de revue ;
- GitHub Actions et contrôle anti-secret.

### Volontairement exclu

- Android ;
- iOS ;
- Capacitor et plugins natifs ;
- biométrie native ;
- build mobile et synchronisation native ;
- `.claude/`, `CLAUDE.md`, MCP, prompts, agents et fichiers d’atelier IA ;
- handoffs et rapports internes de développement ;
- fichiers temporaires et sauvegardes ;
- secrets et fichiers `.env` ;
- clés `service_role` ;
- migrations et SQL du cœur financier privé ;
- configuration fournisseur privée ;
- automatisations d’exploitation Production ;
- données utilisateurs/KYC réelles.

## Architecture générale

```text
Navigateur Web
    │
    ├── HTML5 / CSS3 / JavaScript ES Modules
    │
    ├── Authentification Web
    │      └── Supabase Auth au runtime configuré
    │
    ├── Interfaces Client
    │      ├── Dashboard
    │      ├── Envoyer / Recevoir
    │      ├── Dépôt / Retrait
    │      ├── Transactions
    │      ├── QR / Scan
    │      ├── Épargne
    │      └── Profil / Sécurité / Paramètres
    │
    └── Backend FlexiCash privé en Production
           ├── Auth / KYC / limites
           ├── Wallets
           ├── Ledger double entrée
           ├── RPC / Edge Functions
           ├── Providers externes
           └── Audit / rapprochement
```

Le navigateur n’est pas l’autorité financière. Les opérations réelles sont validées côté serveur dans le projet principal.

## Principes financiers du système principal

L’architecture FlexiCash repose notamment sur les invariants suivants :

1. **Ledger en double entrée** — les mouvements comptables doivent rester équilibrés.
2. **Idempotence** — une même intention ne doit pas être comptabilisée deux fois.
3. **Contrôle concurrent** — les opérations critiques sont protégées contre les doubles dépenses.
4. **Revalidation serveur** — profil, wallet, devise, environnement, limites et autorisations sont contrôlés côté backend.
5. **Historique immuable** — une correction financière se fait par reversal/écriture compensatoire, pas par suppression d’un mouvement historique.
6. **Réconciliation fournisseur** — un retour navigateur ou un callback isolé ne suffit pas pour déclarer un paiement réglé.
7. **Échec fermé** — une indisponibilité du backend ne doit pas être présentée comme un succès financier.

Ces règles sont documentées dans le dossier administratif accompagnant ce dépôt. Le code privé qui les impose n’est pas publié ici.

## Technologies visibles dans cette édition

- HTML5 ;
- CSS3 ;
- JavaScript vanilla / ES Modules ;
- Supabase JS chargé uniquement lorsque le runtime de revue est configuré ;
- Cloudflare Turnstile pour le parcours de connexion ;
- Service Worker Web/PWA ;
- Vercel pour la configuration Web ;
- GitHub Actions pour le contrôle automatique.

Aucun framework frontend lourd n’est nécessaire pour cette édition.

## Structure

```text
FlexiCash-Administration/
├── .github/
│   └── workflows/
│       └── quality-gate.yml
├── app/
│   ├── dashboard.html
│   ├── deposit.html
│   ├── profile.html
│   ├── receive.html
│   ├── savings.html
│   ├── scan.html
│   ├── security.html
│   ├── send.html
│   ├── settings.html
│   ├── support.html
│   ├── transactions.html
│   └── withdraw.html
├── assets/
│   ├── css/
│   ├── js/
│   │   ├── pages/
│   │   └── services/
│   └── vendor/
├── auth/
│   ├── callback.html
│   ├── login.html
│   └── register.html
├── scripts/
│   └── verify-web-edition.mjs
├── index.html
├── manifest.webmanifest
├── sw.js
├── vercel.json
├── package.json
└── README.md
```

## Configuration runtime

Le dépôt ne contient volontairement aucune URL/clé Supabase active.

Pour une revue locale autorisée, les valeurs publiques nécessaires peuvent être injectées avant le chargement de l’application :

```html
<script>
window.__FLEXICASH_CONFIG__ = {
  supabaseUrl: "<SUPABASE_URL_AUTORISEE>",
  supabaseAnonKey: "<ANON_KEY_AUTORISEE>",
  turnstileSiteKey: "<TURNSTILE_SITE_KEY>"
};
</script>
```

Une clé `service_role`, un secret Stripe/MonCash ou une clé privée ne doit **jamais** être ajouté au navigateur ou au dépôt.

Sans configuration runtime, l’application reste en mode de revue et échoue de manière fermée : elle n’invente ni solde ni transaction réussie.

## Exécution locale

Prérequis : Node.js 20+ et un serveur HTTP local.

```bash
npm test
```

Puis servir le dossier avec un serveur statique de votre choix. Les modules ES ne doivent pas être ouverts directement avec `file://`.

## Quality Gate

Chaque push sur `main` lance automatiquement **Web Administrative Quality Gate**.

Le contrôle vérifie notamment :

- présence des fichiers Web essentiels ;
- absence des dossiers Android/iOS/mobile ;
- absence de fichiers Capacitor ;
- absence de `.claude`, `CLAUDE.md` et `.mcp.json` ;
- absence de motifs de secrets serveur connus ;
- cohérence de l’édition Web administrative.

Commande locale :

```bash
npm test
```

## Sécurité de la publication

Ce dépôt étant public, la règle appliquée est simple : **publier ce qui aide à comprendre le produit, ne pas publier ce qui augmente inutilement la surface d’attaque du système financier**.

Le dépôt principal privé reste la source de vérité pour :

- le ledger et ses migrations ;
- les RPC financières ;
- les Edge Functions sensibles ;
- les providers ;
- les configurations Production ;
- les tests financiers complets ;
- les opérations d’administration privilégiées.

## Relation avec le dossier administratif

Le PDF administratif FlexiCash accompagne ce dépôt et documente notamment : contexte, objectifs, périmètre, parties prenantes, exigences fonctionnelles/non fonctionnelles, architecture, diagrammes, modèle de données, API, sécurité, tests, déploiement, maintenance, risques, livrables et annexes.

## Règle de validation

> Aucune fonctionnalité n’est considérée comme terminée si elle n’est pas documentée, testée et validée.

## Baseline

Édition préparée le **25 septembre 2026** à partir du dépôt principal FlexiCash, baseline source :

`2d60e810a452f830964457f67335966c8d1b05dd`

Le dépôt principal reste privé et inchangé par cette édition administrative.
