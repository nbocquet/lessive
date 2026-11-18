# Lessive — Plan de construction pour agents

**Version :** 1.1 — 16 novembre 2026 (pile technique simplifiée)
**Référence :** `SPECIFICATIONS.md` (cahier des charges v1.1). En cas de contradiction, les amendements v1.1 priment sur le texte v1.0, et ce plan prime sur les deux pour l'ordre et le découpage du travail.

Ce document sert à lancer des agents de développement, une tâche à la fois ou plusieurs en parallèle. Chaque tâche est rédigée pour être confiée telle quelle à un agent qui n'a aucun autre contexte que ce dépôt.

---

## 1. Ce qu'on construit (MVP)

Une application web statique où l'utilisateur :

1. colle un texte ;
2. lance l'analyse (règles + NER local) ;
3. corrige les détections ;
4. copie le texte pseudonymisé ou masqué vers un LLM de son choix ;
5. colle la réponse du LLM et la réidentifie localement.

Tout le traitement a lieu dans le navigateur. Rien d'autre n'est dans le MVP.

### Hors MVP (ne pas implémenter, ne pas préparer au-delà des interfaces)

CLI, import de packs par l'utilisateur, YAML, formats CSV/JSON structurés, DOCX/PDF, généralisation (dates → tranches), désensibilisation, détecteurs composites, adresses postales, packs métier, mobile.

---

## 2. Règles non négociables (à recopier dans `CLAUDE.md`)

| # | Règle |
|---|---|
| R1 | Aucune requête réseau à l'exécution, hormis le chargement des fichiers statiques de l'application depuis sa propre origine. CSP : `default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'`. |
| R2 | Aucun LLM, aucun modèle génératif, aucune API distante, aucune télémétrie. |
| R3 | `src/core` ne dépend ni du DOM ni de Node : TypeScript pur, exécutable dans un worker et, plus tard, dans une CLI. |
| R4 | Les modèles NER sont chargés uniquement depuis les fichiers locaux de l'application (`allowRemoteModels = false`). |
| R5 | Le texte original et la table de correspondance ne vont jamais dans `localStorage`, IndexedDB, les logs, les messages d'erreur ou les rapports, sauf export chiffré demandé par l'utilisateur. |
| R6 | L'interface ne dit jamais « anonymisé ». Les modes s'appellent **Masquage** et **Pseudonymisation**. |
| R7 | Les positions sont des indices en unités de code UTF-16 sur le texte original non modifié. Toute normalisation se fait sur une copie, avec table de correspondance des positions. |
| R8 | Les packs sont des données JSON. Ils ne contiennent jamais de code ; ils référencent les validateurs par leur nom dans une liste fermée. |
| R9 | Toute dépendance ajoutée est justifiée dans la PR, sous licence compatible Apache 2.0, version verrouillée. |
| R10 | Chaque tâche livre ses tests. Aucun test ne contient de données personnelles réelles : uniquement des données synthétiques. |
| R11 | Un agent ne modifie pas les contrats publics de `src/core/types` sans une tâche qui le demande. S'il en a besoin, il s'arrête et le signale. |
| R12 | Interface en Svelte 5 uniquement, avec la syntaxe des runes (`$state`, `$derived`, `$props`, `$effect`). L'ancienne syntaxe Svelte 4 (`export let`, `$:`, stores pour l'état local) est interdite. Pas de SvelteKit. Le contrôle `svelte-check` fait partie de `npm run typecheck`. |

---

## 3. Décisions techniques prises

| Sujet | Choix | Raison |
|---|---|---|
| Dépôt | Un seul paquet npm, trois dossiers (`src/core`, `src/ner`, `src/web`) | npm est fourni avec Node : aucun outil de monorepo à apprendre ni à maintenir |
| Langage | TypeScript `strict`, modules ES | Exigence NF-07 |
| Build web | Vite | Standard, gère workers et WASM |
| Interface | Svelte 5, sans SvelteKit | Code court et lisible, état intégré (aucune bibliothèque d'état), peu de dépendances |
| Tests unitaires | Vitest | Intégré à Vite |
| Tests navigateur | Harnais Chrome/CDP du dépôt (`node:test`) | Interception réseau, inspection des stockages et mode hors ligne, sans dépendance supplémentaire |
| Validation des packs | Zod | Une seule dépendance sans dépendance transitive ; schéma et types d'une seule source |
| NER | Transformers.js (`@huggingface/transformers`) sur ONNX Runtime Web, backend WASM, WebGPU en option | Seule voie mûre dans le navigateur ; modèle choisi par le prototype S1 |
| Chiffrement | WebCrypto : PBKDF2-SHA-256 (600 000 itérations, sel 16 octets) + AES-256-GCM (IV 12 octets), format versionné | Natif, aucune dépendance |
| Sécurité des regex | Packs livrés uniquement, vérifiés en CI par un détecteur de ReDoS ; exécution dans un worker ; longueur d'entrée plafonnée | Suffisant tant que l'import de packs est hors MVP |
| Distribution | Site statique (GitHub Pages) avec service worker écrit à la main pour le hors-ligne ; auto-hébergement documenté | Seul le traitement doit être local ; pas de bibliothèque PWA |

**Budget de dépendances.** À l'exécution : Svelte, `@huggingface/transformers`, Zod, et rien d'autre sans accord de Nico. En développement : TypeScript, Vite, Vitest, ESLint, Prettier, un détecteur de ReDoS. Playwright était prévu initialement ; les tests navigateur utilisent finalement le harnais Chrome/CDP du dépôt.

### Décisions ouvertes, tranchées par les prototypes

| Décision | Tranchée par | Valeur par défaut |
|---|---|---|
| Modèle NER | S1 | **Version publiée : CamemBERT-NER MIT (ADR 0004, A21), installation au clic depuis la même origine. Import local toujours possible (ADR 0003). DistilBERT reste la référence du rapport d'évaluation historique, pas le modèle publié.** |
| Format des jetons | S2 | `PERSONNE_001` — **tranché : A accepté (ADR 0002, 17 novembre 2026)** |
| Poids maximal du modèle | S1 + Nico | 150 Mo |

---

## 4. Structure du dépôt

```text
lessive/
├── src/
│   ├── core/                # moteur, TypeScript pur
│   │   ├── types/
│   │   ├── recognizers/
│   │   ├── validators/
│   │   ├── registry/
│   │   ├── analyzer/
│   │   ├── transform/
│   │   ├── mapping/
│   │   └── crypto/
│   ├── ner/                 # adaptateur Transformers.js derrière l'interface NerEngine
│   └── web/                 # Svelte, workers, service worker
├── packs/
│   ├── global/
│   ├── country-ch/
│   ├── country-fr/
│   └── lang-fr-en/          # prénoms, titres de civilité, mots de contexte
├── corpus/                  # corpus synthétiques d'évaluation
├── spikes/                  # prototypes jetables
├── docs/
│   └── adr/                 # décisions d'architecture
├── CLAUDE.md
├── PLAN.md
├── SPECIFICATIONS.md
├── LICENSE
├── NOTICE
└── package.json
```

Un seul `package.json`. Les frontières sont tenues par une règle ESLint : `src/core` n'importe ni `src/ner` ni `src/web`, et `src/ner` n'importe pas `src/web`. Le jour où une CLI arrive, `src/core` devient un paquet sans réécriture.

---

## 5. Contrats du moteur (base de T1.2)

> **Source de vérité : `src/core/types/`.** Le bloc ci-dessous résume les contrats tels qu'implémentés ; en cas d'écart, le code fait foi (voir `docs/contrats.md`).

```typescript
type EntityType =
  | "PERSON" | "ORGANIZATION" | "LOCATION"
  | "EMAIL" | "PHONE" | "URL" | "IP_ADDRESS"
  | "IBAN" | "CREDIT_CARD" | "SECRET" | "DATE"
  | "CH_AVS" | "CH_UID"
  | "FR_NIR" | "FR_SIREN" | "FR_SIRET";

interface Detection {
  id: string;
  start: number;            // UTF-16, inclus
  end: number;              // UTF-16, exclu
  entityType: EntityType;
  score: number;            // 0..1, heuristique, pas une probabilité
  recognizerId: string;
  packId: string;
  source: "pattern" | "dictionary" | "ner" | "manual";
  validated?: boolean;      // vrai si un validateur algorithmique a réussi
  contextBoost?: number;
  explanation: string[];    // étapes de la décision, sans valeur originale
  supersededBy?: string;    // id de la détection qui l'a emporté
}

interface Recognizer {
  id: string;
  packId: string;
  supportedEntities: EntityType[];
  languages: string[] | "any";
  analyze(text: string, ctx: AnalysisContext): Promise<Detection[]>;
}

interface NerEngine {
  load(onProgress?: (p: number) => void): Promise<void>;
  recognize(text: string, ctx: AnalysisContext): Promise<Detection[]>; // ctx.signal pour annuler, ctx.nextId pour les ids
  dispose(): Promise<void>;
}

interface Operator {
  id: "suppress" | "mask" | "categorize" | "pseudonymize";
  apply(ctx: OperatorContext): string;   // { value, detection, session? }
}

interface Session {           // table de correspondance en mémoire (R5)
  resolve(surfaceForm: string, entityType: EntityType): Entity;
  entities(): readonly Entity[];
  merge(targetId: string, sourceId: string): void;
  split(entityId: string, surfaceForm: string): Entity;
  byPseudonym(pseudonym: string): Entity | undefined;
}

interface Entity {            // une personne, un lieu… réel, indépendant des occurrences
  id: string;
  entityType: EntityType;
  pseudonym: string;          // ex. PERSONNE_001
  surfaceForms: string[];     // formes rencontrées, jamais exportées en clair
  needsReview: boolean;
}
```

### Règles par défaut

**Scores.** Chaque motif porte un score de base. Un validateur réussi porte le score à 1,0 ; un validateur échoué supprime la détection. Un mot de contexte dans une fenêtre de 5 mots avant ou après ajoute 0,35, plafonné à 1,0. Seuil par défaut : 0,5.

**Conflits**, dans l'ordre : (1) manuel, (2) validé algorithmiquement, (3) l'intervalle qui contient l'autre si son score est au moins égal, (4) score le plus élevé, (5) priorité du type d'entité, (6) intervalle le plus long, (7) ordre alphabétique de `recognizerId`, puis `id`. Les perdantes sont conservées avec `supersededBy` pour l'affichage.

**Résolution d'entités** (PERSON) : normalisation de la casse, des accents et des titres (M., Mme, Dr, Me…). Forme identique → même entité. Forme partielle (un seul mot) égale au prénom ou au nom d'une seule entité connue → rattachée, avec `needsReview`. Forme partielle correspondant à plusieurs entités → nouvelle entité, avec `needsReview`. L'utilisateur peut fusionner et scinder.

**Réidentification tolérante.** Reconnaît les variantes d'un jeton : casse, espace ou tiret à la place du tiret bas, zéros de tête absents, crochets ou guillemets autour. Un jeton inconnu est laissé tel quel et signalé.

**Validateurs (liste fermée).** `luhn`, `iban_mod97`, `ean13` (AVS, préfixe 756), `fr_nir_key` (y compris Corse 2A/2B), `ch_uid_mod11`, `fr_siren_luhn`, `fr_siret_luhn` (avec l'exception La Poste). Chaque validateur cite sa source officielle dans son en-tête.

---

## 6. Phases et tâches

### État d'avancement au 17 novembre 2026

État rapproché du code au commit `a16947b`. Les tâches ci-dessous conservent leur objectif initial ; les preuves et réserves actuelles sont dans [la recette du MVP](recette-mvp.md).

| Phase | État actuel | Reste à clôturer |
|---|---|---|
| 0 — Prototypes | Décisions prises, porte G0 franchie ; modèle publié révisé par ADR 0004 | Ne pas attribuer les scores DistilBERT au CamemBERT fourni. |
| 1 — Socle | Implémenté et testé | Réserves transversales suivies dans la recette. |
| 2 — Packs | Cinq packs livrés et testés, enrichis après les retours de Nico | Réévaluer l'ensemble actuel avec le modèle publié. |
| 3 — NER | Adaptateur, segmentation et worker livrés | T3.4 : évaluation fr/en de CamemBERT avec les packs actuels et comparaison aux cibles A13. |
| 4 — Transformation et sessions | Implémenté et testé | Compléter la recette navigateur du chiffrement et des corrections ; encadrer la réidentification d'anciens pseudonymes entre documents. |
| 5 — Interface | Parcours complet, avertissements et vérification réorganisés | Recette complète au clavier, Firefox et Safari. |
| 6 — Durcissement et publication | Confidentialité Chrome, hors ligne par règles, CI e2e, Pages, imports bornés et Actions épinglées | Performances chiffrées actuelles, NER hors ligne après rechargement, inventaire/contrôle des licences, guide complet d'auto-hébergement, recette distante et porte G1. |

**Prochaine étape :** réévaluer le modèle publié, mesurer ses performances puis finaliser les vérifications manuelles de [la recette](recette-mvp.md#5-travail-restant-pour-clôturer-la-recette). Le site est publié ; la porte G1 avant annonce publique n'est pas formellement clôturée.

Notation : **Dép.** = tâches à terminer avant ; **∥** = peut tourner en parallèle des autres tâches de la même vague.

### Phase 0 — Prototypes (bloquants)

**S1 — NER dans le navigateur** · Dép. : aucune
- But : choisir le modèle ou constater qu'aucun ne convient.
- Travail : dans `tools/ner-eval/`, page Vite minimale chargeant un modèle local dans un worker. Comparer au moins trois modèles de classification de jetons multilingues ou français/anglais disponibles au format ONNX (rechercher les candidats actuels ; pistes : variantes distillées multilingues « ner-hrl », CamemBERT-NER, GLiNER multilingue). Construire `corpus/ner-fr.jsonl` et `corpus/ner-en.jsonl`, 150 phrases synthétiques annotées chacune : noms suisses, français et d'origine étrangère, prénoms seuls, noms en minuscules, style courriel, organisations en SA/Sàrl/SAS, communes romandes et françaises.
- Mesures par modèle : licence et droit de redistribution, poids quantifié, temps de chargement, temps pour 5 000 caractères sur CPU, mémoire, précision / rappel / F1 par catégorie et par langue, exactitude des positions avec accents et emojis.
- Livrable : `docs/adr/0001-modele-ner.md` avec tableau comparatif et recommandation.
- Acceptation : au moins un modèle redistribuable, ≤ 150 Mo, rappel PERSON ≥ 0,85 en français, ≤ 5 s pour 5 000 caractères. Sinon : rapport d'échec et options.

**S2 — Robustesse des jetons** · Dép. : aucune · ∥
- But : choisir un format de jeton que les LLM recopient fidèlement.
- Travail : dans `tools/token-bench/`, trois formats candidats (`PERSONNE_001`, `[PERSONNE_1]`, `⟦P1⟧`), cinq textes synthétiques pseudonymisés dans chaque format, cinq consignes types (résumer, traduire en anglais, reformuler, répondre au courriel, extraire une liste). Écrire l'analyseur tolérant et un script qui calcule le taux de jetons retrouvés dans une réponse collée.
- Étape humaine : Nico colle les textes dans deux ou trois LLM et rapporte les réponses dans `tools/token-bench/reponses/`. L'agent n'appelle aucun LLM.
- Livrable : `docs/adr/0002-format-jetons.md`, plus le texte de la consigne à joindre au prompt (« les mots du type PERSONNE_001 sont des pseudonymes, conserve-les tels quels »).
- Acceptation : un format atteint ≥ 98 % de jetons retrouvés après analyse tolérante.

**Porte G0 (Nico)** : valider les deux ADR avant la phase 3 et la tâche T4.4. Les phases 1 et 2 peuvent démarrer sans attendre.

### Phase 1 — Socle du moteur

**T1.1 — Initialisation du dépôt** · Dép. : aucune · seule dans sa vague
- Un `package.json`, TypeScript strict, Vite, ESLint (avec la règle de frontières entre dossiers), Prettier, Vitest, CI GitHub Actions (lint, types, tests), `LICENSE` Apache 2.0, `NOTICE`, `README.md`, `CLAUDE.md` contenant la section 2 de ce plan.
- Acceptation : `npm ci && npm test && npm run lint` passent sur un dépôt vide de logique.

**T1.2 — Types et contrats** · Dép. : T1.1 · seule dans sa vague
- Implémenter la section 5 dans `src/core/types`, avec documentation. Aucune logique.
- Acceptation : compilation stricte ; fichier `docs/contrats.md` généré ou écrit à la main.

**T1.3 — Validateurs** · Dép. : T1.2 · ∥
- Liste fermée de la section 5, registre `nom → fonction`.
- Tests : pour chacun, dix valeurs valides et dix invalides synthétiques, cas limites (espaces, points, tirets).

**T1.4 — Détecteurs par motif et par dictionnaire** · Dép. : T1.2 · ∥
- `PatternRecognizer` (regex + score + validateur + mots de contexte déclarés), `DictionaryRecognizer` (liste de termes, insensible à la casse et aux accents, limites de mots Unicode).
- Tests : positions correctes avec accents, caractères composés et emojis ; plafond de longueur.

**T1.5 — Schéma et registre des packs** · Dép. : T1.2 · ∥
- Schéma Zod du manifeste et des règles (id stable, version, version minimale du moteur, type, dépendances). Chargeur transformant un pack JSON en détecteurs. Activation et désactivation par règle. Messages d'erreur explicites.
- Tests : pack valide, pack invalide, version incompatible, validateur inconnu refusé.

**T1.6 — Contexte** · Dép. : T1.2 · ∥
- Rehaussement du score selon les mots voisins, par langue, avec trace dans `explanation`.

**T1.7 — Résolution des conflits** · Dép. : T1.2 · ∥
- Politique de la section 5, déterministe.
- Tests : chevauchement partiel, inclusion, égalité, stabilité quel que soit l'ordre d'entrée.

**T1.8 — Orchestrateur d'analyse** · Dép. : T1.4 à T1.7
- `analyze(text, options)` : exécute les détecteurs actifs, applique contexte, seuils et conflits, renvoie détections retenues et écartées. Accepte un `NerEngine` optionnel et un `AbortSignal`.
- Tests : bout en bout avec un pack d'essai et un faux moteur NER.

### Phase 2 — Packs (toutes ∥, Dép. : T1.3, T1.4, T1.5)

Chaque pack livre : `manifest.json`, `rules/*.json`, `tests/` (exemples positifs, négatifs, pièges), `README.md` avec les références officielles de chaque format.

- **T2.1 — Pack global** : courriel, URL, IPv4/IPv6, IBAN générique, carte bancaire, secrets (clés d'API aux préfixes connus, JWT, clés privées PEM).
- **T2.2 — Pack Suisse** : AVS, IDE, téléphones, IBAN CH. Les codes postaux exigent un mot de contexte.
- **T2.3 — Pack France** : NIR, SIREN, SIRET, téléphones, IBAN FR. SIREN et codes postaux exigent un mot de contexte.
- **T2.4 — Pack linguistique fr/en** : prénoms, titres de civilité, mots de contexte. La source et la licence de chaque liste sont documentées et compatibles ; sinon la liste n'est pas intégrée.
- **T2.5 — Dates** : formats numériques et littéraux en français et en anglais.

Acceptation commune : AVS détecté dans un texte anglais ; packs CH et FR actifs ensemble sans conflit non résolu ; aucun motif signalé par le contrôle ReDoS de la CI.

### Phase 3 — NER (Dép. : G0, T1.2)

**T3.1 — Adaptateur** · `src/ner` implémente `NerEngine` avec le modèle retenu, chargement local uniquement, correspondance des étiquettes du modèle vers `EntityType`.

**T3.2 — Textes longs** · Dép. : T3.1 · Découpage sur frontières de phrases avec recouvrement, recalage des positions, dédoublonnage.
- Tests : entité à cheval sur deux segments ; positions identiques à celles d'une analyse d'un seul tenant.

**T3.3 — Worker** · Dép. : T3.1 · ∥ avec T3.2 · Exécution dans un Web Worker, progression, annulation, libération de la mémoire.

**T3.4 — Évaluation** · Dép. : T3.2 · Script reproductible mesurant précision, rappel et F1 par catégorie et par langue sur `corpus/`, pour le NER seul puis pour NER + dictionnaires. Rapport `docs/evaluation-ner.md`.
- Acceptation : rappel PERSON combiné ≥ 0,90 en français et en anglais ; sinon, écart documenté et pistes.

### Phase 4 — Transformation et sessions (Dép. : T1.2)

**T4.1 — Opérateurs et moteur de transformation** · ∥ · Suppression, masquage, catégorisation (`[PERSONNE]`), pseudonymisation. Remplacement de la fin vers le début du texte. Résultat : texte, liste des transformations, erreurs, sans aucune valeur originale.

**T4.2 — Résolution d'entités** · ∥ · Règles de la section 5, fusion et scission manuelles.
- Tests : « Claire Martin », « Mme Martin », « Claire », « C. Martin » ; deux « Martin » distincts ; homonymes.

**T4.3 — Session** · Dép. : T4.2 · Table de correspondance en mémoire, partagée entre plusieurs textes, pseudonymes uniques par type.
- Test : critère AC-06 du cahier.

**T4.4 — Réidentification** · Dép. : T4.3, G0 · Analyseur tolérant issu de S2. Jetons inconnus signalés. Jamais automatique.

**T4.5 — Export chiffré** · Dép. : T4.3 · ∥ avec T4.4 · Format versionné `{v, kdf, iterations, salt, iv, ciphertext}`. Phrase de passe jamais conservée.
- Tests : aller-retour ; mauvaise phrase de passe ; fichier altéré ; version inconnue.

### Phase 5 — Interface web (Dép. : T1.8, T4.1, T4.3 ; T3.3 pour le NER réel)

**T5.1 — Ossature** · seule dans sa vague · Application Vite + Svelte, CSP de R1, worker d'analyse, état partagé (module Svelte, sans bibliothèque), chargement des packs livrés, thème sobre et accessible.

Puis, en parallèle :

- **T5.2 — Saisie et analyse** : zone de texte, choix du mode, lancement, progression, annulation, surlignage par catégorie, panneau de détail (score, origine, explication).
- **T5.3 — Corrections** : ajout manuel par sélection avec propagation à toutes les occurrences, suppression, changement de catégorie, changement d'opérateur.
- **T5.4 — Aperçu et sortie** : vue avant/après, validation obligatoire avant copie, bouton copier, consigne LLM à joindre, avertissement sur les limites.
- **T5.5 — Table des pseudonymes** : liste, fusion, scission, entités à vérifier mises en avant, nouvelle session, export et import chiffrés.
- **T5.6 — Réidentification** : coller une réponse, aperçu des remplacements, jetons inconnus signalés, copie.
- **T5.7 — Réglages** : packs et règles actifs, seuils (section avancée repliée par défaut).

Acceptation commune : parcours complet au clavier ; aucune injection HTML possible depuis le texte collé ; l'interface reste réactive pendant l'analyse.

### Phase 6 — Durcissement et publication

- **T6.1 — Tests de confidentialité** (harnais Chrome/CDP du dépôt) : toute requête hors origine fait échouer le test ; parcours complet hors ligne ; rien dans `localStorage` ni IndexedDB après usage ; rechargement de la page = session vide.
- **T6.2 — Hors-ligne** : service worker écrit à la main, sans bibliothèque, mettant en cache l'application et le modèle ; indicateur « prêt hors ligne ».
- **T6.3 — Performances** : mesures sur machine de référence, rapport `docs/performances.md`. Cibles : analyse de 5 000 caractères ≤ 5 s après chargement du modèle ; interface jamais bloquée plus de 100 ms.
- **T6.4 — Documentation** : `README`, `ARCHITECTURE.md`, `SECURITY.md`, `CONTRIBUTING.md`, guide de création d'un pack, limites connues.
- **T6.5 — Publication** : déploiement GitHub Pages, inventaire des dépendances, contrôle des licences en CI, `NOTICE` à jour (modèle NER, motifs repris de Presidio sous MIT), guide d'auto-hébergement.
- **T6.6 — Recette** : tableau `docs/recette-mvp.md` reliant chaque critère AC-01 à AC-12 applicable à un test automatisé ou à une vérification manuelle datée.

**Porte G1 (Nico)** : recette manuelle sur un cas réel avant toute annonce publique.

---

## 7. Ordre de lancement

| Vague | Tâches en parallèle | Attend |
|---|---|---|
| 1 | S1, S2, T1.1 | — |
| 2 | T1.2 | T1.1 |
| 3 | T1.3, T1.4, T1.5, T1.6, T1.7, T4.1, T4.2 | T1.2 |
| 4 | T1.8, T2.1 à T2.5, T4.3 | vague 3 |
| 5 | T3.1, T4.4, T4.5, T5.1 | G0, vague 4 |
| 6 | T3.2, T3.3, T5.2 à T5.7 | vague 5 |
| 7 | T3.4, T6.1 à T6.5 | vague 6 |
| 8 | T6.6 | tout |

Une tâche = une branche = une demande de fusion. Deux agents ne travaillent jamais dans le même dossier au même moment ; les tâches d'une même vague ont été découpées pour cela, sauf T5.2 à T5.7 qui partagent l'état de l'application : celui-ci est figé par T5.1.

---

## 8. Modèle de consigne pour un agent

```text
Tu travailles sur le dépôt Lessive. Lis d'abord CLAUDE.md, puis dans PLAN.md
les sections 2, 3 et 5 et la tâche <ID>. Consulte SPECIFICATIONS.md pour le détail.

Ta tâche : <ID> — <titre>.

Contraintes :
- Respecte les règles R1 à R12 sans exception.
- Ne touche qu'aux dossiers de ta tâche. Ne modifie pas les contrats de
  src/core/types ; si c'est nécessaire, arrête-toi et explique pourquoi.
- N'ajoute aucune fonctionnalité hors de ta tâche, et aucune dépendance hors du
  budget de la section 3.
- Données de test synthétiques uniquement.

Terminé quand :
- les critères d'acceptation de la tâche sont remplis ;
- `npm run lint`, `npm run typecheck` et `npm test` passent ;
- tu as écrit un court compte rendu : ce qui est fait, ce qui ne l'est pas,
  les décisions prises, les questions ouvertes.

Si une vérification échoue ou qu'un critère n'est pas atteignable, dis-le
clairement plutôt que de contourner le test.
```

### Relecture

Après chaque vague, un agent de relecture distinct, sans accès aux échanges de l'agent auteur, vérifie : respect de R1 à R12, critères d'acceptation, absence de données réelles, absence de dépendance non justifiée. Les tâches T4.5 (chiffrement) et T6.1 (confidentialité) reçoivent toujours cette relecture.

---

## 9. Risques et parades

| Risque | Parade |
|---|---|
| Aucun modèle NER ne tient les cibles | S1 en premier ; repli : modèle plus lourd en option, dictionnaires renforcés, validation humaine mise en avant |
| Noms manqués par le NER | Dictionnaires de prénoms, ajout manuel propagé, avertissement permanent, mesure T3.4 |
| Le LLM déforme les jetons | S2, analyseur tolérant, consigne jointe au prompt |
| Positions fausses (Unicode, segments) | R7, tests dédiés en T1.4 et T3.2 |
| Faux positifs des identifiants nationaux | Validateur obligatoire ou mot de contexte obligatoire |
| ReDoS | Contrôle en CI, worker, plafond de longueur, pas d'import de packs dans le MVP |
| Fuite par le site hébergé | CSP de R1, tests T6.1, auto-hébergement documenté |
| Fuite par l'export | Rapports sans valeurs originales, table exportée uniquement chiffrée |
| Licence d'un modèle ou d'une liste incompatible | Vérification en S1 et T2.4, contrôle en CI |
| Dérive du périmètre par les agents | Liste « hors MVP », R11, relecture par vague |
| Identification indirecte (fonction + lieu + date) | Non traitée par le MVP : affichée comme limite connue dans l'interface et la documentation |

---

## 10. Évolutions après le MVP (retours de test)

| Sujet | Origine | Décision |
|---|---|---|
| Données sensibles (santé, religion, opinions, vie sexuelle, pénal, aide sociale) | Test de Nico, 17 novembre 2026 : « absente pour raisons médicales » resté en clair | Hors MVP (décision de Nico). Piste : signaler sans remplacer, par listes d'expressions par catégorie. Documenté dans docs/limites.md. |
| Propagation des noms détectés (prénom seul, identifiants dérivés type CMARTIN) | Même test | Fait (17 novembre 2026) : propagation, ordre de résolution des noms complets, prénoms ambigus depuis le nom complet. |
| Adresses postales FR et CH | Même test (adresse privée restée en clair) | Fait (17 novembre 2026) : règles courtes + fusion des morceaux d'adresse dans le moteur. |
| Références internes (dossier, commande, contrat, serveur : ET-2026-003821, PO-2026-77841…) | Même test | Non traitées (décision de Nico, 17 novembre 2026) : ce ne sont pas des données personnelles ; elles restent en clair. |
| IDE suisse à clé de contrôle invalide (CHE-123.456.789) | Même test | Fait : règle uid-unverified (score 0,6). |
| Organisations non reconnues par le NER (« Établissement des Tilleuls ») | Même test | Limite du modèle, documentée. |

Non-régression : `tests/regression/courriels-migration.test.ts` (fil de courriels du test de Nico).
