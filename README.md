# FlexiCash — Web Audit Mirror

Ce dépôt est le **miroir d’audit de l’application Web FlexiCash**.

Il est reconstruit à partir de la baseline privée exacte :

`2d60e810a452f830964457f67335966c8d1b05dd`

L’objectif n’est pas de fournir une maquette, une démonstration, une édition neutralisée ou une version simplifiée. Le dépôt d’audit doit reproduire le **vrai comportement Web** de FlexiCash : mêmes pages, mêmes services, mêmes flux d’authentification, mêmes contrôles client, mêmes routes Web, même logique de cache/PWA, mêmes contrats backend utilisés par le Web, mêmes tests pertinents et mêmes configurations nécessaires à l’exécution Web.

## Règle de parité

Pour tout composant utilisé par l’application Web, la baseline privée ci-dessus est la source de vérité.

Les seules différences autorisées dans ce miroir sont celles nécessaires pour retirer ce qui n’appartient pas à l’application Web :

- `android/` ;
- `ios/` ;
- `mobile/` ;
- configuration Capacitor et workflows de build natif ;
- code exclusivement natif lorsqu’il est mélangé à un module partagé, à condition que le comportement Web reste strictement inchangé ;
- outils internes Claude/Codex/MCP qui ne participent pas au runtime ;
- valeurs de secrets qui ne doivent jamais être versionnées.

Tout le reste du produit Web doit être présent.

## Ce qui doit être présent pour l’audit

Le miroir final couvre notamment :

- site public FlexiCash ;
- authentification, OAuth, récupération de compte et MFA ;
- onboarding ;
- espace client complet ;
- profils Personnel et Professionnel ;
- wallets HTG/USD ;
- transferts, demandes, QR, dépôts, retraits et checkout ;
- historique, notifications, épargne, support et litiges ;
- administration Web ;
- services JavaScript réellement utilisés par ces pages ;
- Service Worker et comportement offline ;
- API Web versionnées ;
- migrations, RPC, Edge Functions et contrats Supabase nécessaires au fonctionnement et à l’audit du Web ;
- tests pertinents ;
- configuration Vercel/Web ;
- scripts nécessaires à la validation du produit Web.

## Ce qui n’est pas présent

Le livrable ne contient pas l’application native :

- aucun projet Android ;
- aucun projet iOS ;
- aucun bundle mobile ;
- aucun build App Store / Google Play ;
- aucun fichier Capacitor nécessaire uniquement au natif.

L’absence du natif ne doit modifier **aucun comportement navigateur**.

## Secrets

Le code peut référencer les noms de variables d’environnement requises par le système, mais aucune valeur secrète ne doit être commise dans Git :

- aucune clé `service_role` ;
- aucun secret Stripe ;
- aucun secret MonCash ;
- aucun secret webhook ;
- aucune clé privée ;
- aucun fichier `.env` contenant des valeurs réelles.

Les clés publiques destinées au navigateur restent traitées selon le modèle normal de déploiement Web FlexiCash.

## Validation

Un Quality Gate accompagne le miroir. Il vérifie notamment :

- les références locales HTML ;
- les imports JavaScript locaux ;
- la syntaxe du Service Worker et des modules contrôlés ;
- la présence du comportement de cache attendu ;
- l’absence des racines natives interdites ;
- l’absence de motifs de secrets connus.

La validation finale ne repose cependant pas seulement sur un CI vert : elle exige une **parité vérifiable avec la baseline source**, à l’exception des exclusions natives/secrets listées dans `audit-baseline.json`.

## Statut

La branche `audit/web-mirror-2d60e810` est la branche de reconstruction. Tant que la parité complète n’est pas validée, `main` ne doit pas être présenté comme le miroir final 100 % du Web FlexiCash.
