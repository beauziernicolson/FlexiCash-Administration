# FlexiCash Web

FlexiCash est une plateforme Web de portefeuille électronique et de paiement conçue pour gérer des comptes utilisateurs, des portefeuilles multi-profils, des opérations financières, des demandes de paiement, des dépôts/retraits, la sécurité du compte et l'administration opérationnelle.

> **Édition administrative Web**  
> Ce dépôt est une édition volontairement nettoyée du projet FlexiCash destinée à la revue technique et administrative. Il contient uniquement les éléments nécessaires à l'application Web, à son backend, à ses tests et à son exploitation. Les sources mobiles natives, les outils d'agents IA, les notes de travail, les handoffs et les documents internes historiques n'en font pas partie.

## Vue d'ensemble

FlexiCash s'appuie sur une architecture Web classique, avec un frontend en HTML5/CSS3/JavaScript ES Modules et un backend Supabase. Les opérations financières sont traitées côté serveur et reposent sur un ledger en double entrée plutôt que sur la modification directe d'un simple champ de solde.

Fonctionnalités principales :

- création de compte, connexion et récupération d'accès ;
- profils financiers Personnel et Professionnel ;
- wallets HTG et USD selon les capacités disponibles ;
- consultation des soldes et de l'activité ;
- transferts internes FlexiCash ;
- demandes de paiement et QR codes ;
- dépôts et retraits via rails configurés ;
- épargne ;
- KYC, niveaux de conformité et limites ;
- PIN transactionnel, MFA, appareils et gel de compte ;
- notifications, support, récupération et litiges ;
- administration, audit, rapprochement et contrôles de sécurité ;
- Merchant API / Hosted Checkout pour les intégrations externes.

## Architecture

```text
Navigateur Web
    │
    ├── HTML / CSS / JavaScript ES Modules
    │
    ├── Supabase Auth
    │
    ├── RPC / Edge Functions
    │       │
    │       ├── Sécurité / KYC / limites
    │       ├── Wallets / ledger double entrée
    │       ├── Dépôts / retraits / transferts
    │       └── Merchant / Platform services
    │
    └── Providers externes
            ├── MonCash
            ├── Stripe
            └── canaux configurés
```

Les callbacks ou retours navigateur d'un fournisseur ne sont pas considérés comme une preuve financière suffisante : la confirmation et la réconciliation sont réalisées côté serveur avant comptabilisation.

## Stack technique

- **Frontend :** HTML5, CSS3, JavaScript vanilla, modules ES
- **Authentification :** Supabase Auth
- **Backend :** Supabase PostgreSQL, RPC et Edge Functions
- **Stockage :** Supabase Storage selon les modules
- **Hébergement Web :** Vercel
- **CI :** GitHub Actions
- **Tests :** Node.js, tests contractuels et parcours comportementaux

Le frontend ne nécessite pas React, TypeScript, Vite ou Tailwind.

## Structure du dépôt

```text
.
├── account/       État et gestion du compte
├── admin/         Interface d'administration
├── api/           Routes serveur Web spécifiques
├── app/           Espace client authentifié
├── assets/        CSS, JavaScript, icônes et ressources partagées
├── auth/          Connexion, inscription, MFA et récupération
├── images/        Ressources visuelles utiles à l'application
├── legal/         Pages légales Web
├── oauth/         Parcours OAuth Web
├── onboarding/    Activation, profil, PIN et KYC
├── payments/      Pages de retour et parcours de paiement Web
├── supabase/      Schéma, migrations et fonctions backend versionnées
├── tests/         Tests Web, sécurité et contrats métier
├── .github/       Quality gate Web
├── index.html     Entrée publique
├── sw.js          Service Worker Web/PWA
└── vercel.json    Configuration de déploiement Web
```

La structure exacte peut évoluer, mais le dépôt administratif exclut volontairement toute source mobile native ou configuration Capacitor.

## Principes financiers

Le moteur financier applique plusieurs invariants structurants :

1. **Double entrée** : chaque transaction comptable doit rester équilibrée.
2. **Idempotence** : une même intention financière ne doit pas être comptabilisée deux fois.
3. **Verrouillage concurrent** : les opérations critiques sont sérialisées lorsque nécessaire.
4. **Pas de solde négatif** hors règle explicitement prévue côté serveur.
5. **Immutabilité du ledger** : une correction crée une écriture inverse au lieu d'effacer l'historique.
6. **Autorisation serveur** : profil, wallet, devise, environnement et droits sont revalidés côté backend.
7. **Réconciliation provider** : le succès d'un navigateur ou d'un callback seul ne déclenche pas automatiquement un crédit définitif.

## Sécurité

Les contrôles de sécurité sont répartis en plusieurs couches :

- sessions Supabase et contrôle d'état du compte ;
- politiques RLS et fonctions serveur pour les données sensibles ;
- RBAC pour l'administration ;
- PIN transactionnel et autorisations sensibles liées à l'action ;
- MFA/AAL2 pour les opérations administratives et sensibles ;
- gestion des appareils et gel de compte ;
- limites, KYC et contrôles anti-fraude ;
- journalisation et audit ;
- séparation des secrets serveur et du code navigateur ;
- idempotence, locks et contrôles d'intégrité du ledger.

Aucun secret fournisseur, clé privée, `service_role`, fichier `.env` de production ou donnée KYC réelle ne doit être versionné dans ce dépôt.

## Installation locale

Prérequis :

- Node.js LTS ;
- npm ;
- un serveur HTTP local pour les modules ES.

```bash
npm ci
```

Pour servir le frontend, utiliser un serveur statique local de votre choix. Les pages ne doivent pas être ouvertes directement via `file://`.

Les variables et secrets nécessaires aux fonctions serveur sont configurés dans les environnements d'exécution et ne sont pas fournis dans le dépôt.

## Quality gate

La version administrative conserve des contrôles automatisés centrés sur le Web :

```bash
npm run test:syntax
npm run test:security
npm run test:references
npm run test:frontend-ux
npm run test:behavioral
npm test
```

Les tests qui nécessitent une infrastructure ou des secrets réels doivent rester isolés des tests de revue et ne doivent jamais provoquer une transaction financière réelle.

## Déploiement

Le frontend Web est déployé en HTTPS. Le pipeline attendu est :

```text
Git -> Quality Gate -> validation -> déploiement Web -> contrôles post-déploiement
```

La configuration des providers, secrets, webhooks et environnements est gérée hors du dépôt source.

## API et intégrations

FlexiCash expose plusieurs surfaces d'intégration :

- RPC Supabase utilisées par le frontend authentifié ;
- Edge Functions pour les opérations serveur sensibles ;
- routes Web dédiées pour certains callbacks/providers ;
- Merchant API / Hosted Checkout pour les intégrations marchandes.

Les intégrations doivent respecter l'authentification, les scopes, l'idempotence et la validation côté serveur. Un marchand externe ne doit pas marquer une commande comme payée uniquement sur la base d'un retour navigateur.

## Règle de validation

Une fonctionnalité n'est considérée comme terminée que lorsqu'elle est **implémentée, documentée, testée et validée** avec un niveau de preuve adapté à son risque.

## Référence documentaire

Le dossier administratif PDF accompagne ce dépôt et présente le périmètre, l'architecture, le modèle de données, les API, la sécurité, le plan de tests, le déploiement, la maintenance, les risques et les diagrammes de référence.

---

**FlexiCash - Web Administrative Review Edition**  
Baseline technique de préparation : `main` au commit `2d60e810a452f830964457f67335966c8d1b05dd` (25 septembre 2026).
