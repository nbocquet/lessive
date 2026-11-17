# Recette du MVP (T6.6)

- **Date de la recette :** 17 novembre 2026
- **Recetteur :** relecteur indépendant, n'ayant écrit aucun code du projet
- **Version recettée :** commit `0cb156e` (arbre de travail propre au départ)
- **Référentiel :** `SPECIFICATIONS.md` v1.1 (amendements A1 à A20 en tête, puis §2 NF-01 à NF-15 et NF-16 ajoutée par A7, §18 périmètre, §20 AC-01 à AC-12), `PLAN.md` (T6.6, porte G0, porte G1)
- **Environnement :** Node 22.23.4, Linux x64, 2 cœurs Xeon à 2,1 GHz partagés, 8 Go de RAM, Google Chrome for Testing 153 (`/usr/bin/google-chrome`), modèle NER `Xenova/distilbert-base-multilingual-cased-ner-hrl` (q8) lu dans `/mnt/user-data/uploads/lessive/models/`. Les dépendances étaient déjà installées : `npm ci` n'a pas été relancé.

Ce document ne modifie aucun autre fichier du dépôt. Les statuts disent ce que le recetteur a lui-même exécuté ou lu, pas ce que les comptes rendus des tâches affirment.

## 1. Commandes exécutées

| Commande | Résultat |
|---|---|
| `npm test` | 41 fichiers, **1 359 tests réussis, 0 échec, 0 ignoré** (37 s). Les tests « modèle réel » (`transformers-engine`, `local-files`, `model-store`) se sont exécutés, le modèle étant présent : confirmé par un relevé détaillé du rapport Vitest. |
| `npm run lint` | ESLint puis Prettier : aucune erreur, « All matched files use Prettier code style ». |
| `npm run typecheck` | `tsc` (deux configurations) puis `svelte-check` : 1 037 fichiers, 0 erreur, 0 avertissement. |
| `npm run build` | Réussi. `dist/` contient `index.html`, `assets/`, `ort/`, `sw.js` et **aucun modèle**. |
| `npm run test:e2e` (`CHROME_PATH=/usr/bin/google-chrome`) | **9 tests réussis sur 9, 0 sauté** (13,7 s) : confidentialité (6, dont le parcours avec NER sur le vrai modèle), hors ligne (2), nouvelle version du service worker (1). |
| `scripts/eval/evaluate.ts` | Rapport de `docs/evaluation-ner.md` **reproduit à l'identique** : rappel PERSON combiné 0,902 (fr), 0,921 (en), 0,912 (fr+en). |
| `scripts/perf/measure.ts --sizes 5000` | 5 000 caractères, règles et NER : **335 ms sous Node** (médiane de 3), conforme à `docs/performances.md` (335 ms). |
| Tests des spikes (`spikes/tokens`) | 235 tests réussis, mais **hors `npm test` et hors CI**. |
| Scripts ad hoc du recetteur (dans `/tmp`, **non versionnés**) | Deux mesures dans Chrome headless, décrites en section 6. Résultats indicatifs. |

## 2. Légende et synthèse

| Symbole | Sens |
|---|---|
| ✅ | Démontré par un test automatisé ou une mesure reproductible que le recetteur a exécuté |
| 🟡 | Démontré partiellement, ou seulement sous Node ou dans une seule configuration |
| ⏳ | Vérification manuelle à faire par Nico (procédure donnée) |
| ❌ | Non satisfait |
| ➖ | Reporté par amendement |

| Tableau | ✅ | 🟡 | ⏳ | ❌ | ➖ | Total |
|---|---:|---:|---:|---:|---:|---:|
| 3.1 Contraintes NF-01 à NF-16 | 14 | 2 | 0 | 0 | 0 | 16 |
| 3.2 Critères AC-01 à AC-12 | 9 | 2 | 0 | 0 | 1 | 12 |
| 3.3 Exigences des amendements et critères du PLAN | 14 | 4 | 3 | 0 | 4 | 25 |
| **Ensemble** | **37** | **8** | **3** | **0** | **5** | **53** |

Convention : un test d'`e2e` est un test du fichier `tests/e2e/…` ; un test Vitest est cité par son fichier et son titre. Les e2e ne portent que sur **Chrome**. Firefox et Safari ne sont pas pilotés : ils relèvent de la section 5 (M-01, M-02), et ne sont pas répétés ligne par ligne.

## 3. Exigences et preuves

### 3.1 Contraintes NF-01 à NF-16

| Réf. | Exigence | Statut | Preuve et réserves |
|---|---|:---:|---|
| NF-01 | Traitement 100 % local | ✅ | `tests/e2e/privacy.test.ts` : « aucune requête hors de l'origine locale, y compris workers et service worker » (toutes les requêtes de la page, du worker d'analyse et du service worker sont interceptées ; le test vérifie que ces trois cibles ont bien été observées) ; « déroule le parcours complet… » ; « parcours avec NER… » (aucune requête sortante avec le vrai modèle). |
| NF-02 | Interface web sans serveur de traitement | ✅ | Les e2e servent `dist/` avec un serveur statique (`tests/e2e/server.ts`, qui ne fait que renvoyer des fichiers) et le parcours complet réussit. `offline.test.ts` : « après un premier chargement, réseau coupé… », serveur arrêté, l'analyse et la réidentification réussissent encore. Aucun code serveur dans le dépôt. |
| NF-03 | Aucun envoi de document vers un service externe | ✅ | `privacy.test.ts` : liste des requêtes hors origine vide après le parcours complet (règles, puis NER) ; « applique réellement la CSP… » ; `src/web/conventions.test.ts` : « R1 : aucune API réseau dans le code de l'interface » (ni `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`). |
| NF-04 | Aucun appel à un LLM | 🟡 | Aucune requête sortante (e2e ci-dessus), donc aucun appel à un LLM distant. L'absence de modèle génératif **local** repose sur l'inspection du recetteur : trois dépendances d'exécution (`package.json`), NER = classifieur DistilBERT (ADR 0001). Aucun test automatique ne l'établit. |
| NF-05 | Aucune API distante pendant le traitement | ✅ | Mêmes preuves que NF-03. Le moteur NER est configuré avec `allowRemoteModels = false` (voir écart E10 : cette configuration n'est pas assertée seule). |
| NF-06 | Hors ligne après installation | ✅ | `offline.test.ts` : « met en cache l'application et ONNX Runtime, jamais le modèle ni autre chose » et « après un premier chargement, réseau coupé : rechargement et nouvelle analyse par règles ». **Chrome seulement.** Le cas NER hors ligne (modèle relu depuis le cache après rechargement) n'est pas dans la suite : le recetteur l'a vérifié par un script ad hoc, réussi (section 6). Cross-navigateur : M-01, M-02. |
| NF-07 | Moteur principal en TypeScript | ✅ | `npm run typecheck` : `tsc` en mode `strict` (+ `noUncheckedIndexedAccess`) et `svelte-check` à 0 erreur, 0 avertissement. |
| NF-08 | Moteur sans DOM ni Node, réutilisable par une CLI (reformulé par A5) | ✅ | ESLint `no-restricted-imports` sur `src/core` (ni `src/ner`, `src/web`, `node:*`, `fs`, `path`…) : `npm run lint` passe. `tsconfig.node.json` compile `src/core` avec `lib: ["ES2022"]` (sans DOM) : `tsc` passe. Le même code tourne sous Node (Vitest) et dans un worker de navigateur (e2e). Seule dépendance d'environnement : `globalThis.crypto` (WebCrypto, `src/core/crypto`, `mapping/session.ts`). |
| NF-09 | NER local dès le MVP | ✅ | `privacy.test.ts` : « parcours avec NER : modèle chargé depuis le dossier local, nom pseudonymisé, aucun stockage ». `src/ner/transformers-engine.test.ts` : « trouve les personnes avec des positions exactes sur 3 phrases fr/en » (vrai modèle). `src/ner/local-files.test.ts` : « charge le modèle par customCache et localise une personne ». Réserve : le NER est une case à cocher, décochée à chaque rechargement (écart E8), et le modèle n'est pas livré (A20). |
| NF-10 | Architecture modulaire | ✅ | Trois dossiers aux frontières imposées par ESLint (lint passe) ; interfaces `Recognizer`, `NerEngine`, `Operator`, `Session` dans `src/core/types` ; NER injecté (`analyzer.test.ts` : « applique validateur, contexte, seuil et NER » avec un faux NER). |
| NF-11 | Packs pays et métier extensibles | ✅ | `src/core/registry/registry.test.ts` (schéma, dépendances, cycles, activation par pack et par règle, pack d'exemple de type `domain`), `src/web/packs.test.ts` : « charge tous les dossiers de packs/ (hors outils) dans le registre » (un nouveau dossier est pris sans modifier le code), `docs/creer-un-pack.md`. L'import par l'utilisateur est reporté (A8). |
| NF-12 | Validation humaine avant export dans l'interface | ✅ | `src/web/state.svelte.test.ts`, groupe « AppState : transformation et validation » : « masque, puis valide uniquement un résultat calculé » ; « remet la validation à faux à toute modification » (15 modifications) ; `canCopy` testé à faux sur analyse périmée. `tests/e2e/harness.ts` (`runJourney`) passe par la case « J'ai relu le résultat » avant « Copier le texte ». Réserve E11 : le test e2e n'affirme pas que le bouton est désactivé avant la case. |
| NF-13 | Absence de télémétrie | ✅ | `conventions.test.ts` (aucune API réseau dans `src/web` ; `dev-model.ts`, seule exception, n'est importé que derrière `import.meta.env.DEV` et n'apparaît pas dans `dist/assets`), e2e (aucune requête hors origine, y compris service worker), CSP. Aucune bibliothèque d'analyse ni de suivi dans l'arbre `npm ls --omit=dev` (106 lignes relues). Le contrôle par grep ne porte que sur `src/web`. |
| NF-14 | Aucun stockage persistant des données originales sans action explicite | ✅ | `privacy.test.ts` : « n'écrit le texte d'entrée dans aucun stockage ; le cache ne contient que l'application » (`localStorage`, `sessionStorage`, IndexedDB vides ; Cache Storage parcouru octet par octet, caches `lessive-models-*` compris) et « le rechargement efface le texte et la session (R5) ». `conventions.test.ts` : « R5 : aucun stockage navigateur ni console.log ». Le cache du modèle est écrit sur action explicite de l'utilisateur et ne contient que des poids. |
| NF-15 | Apache 2.0 | 🟡 | `LICENSE` (texte Apache 2.0), `"license": "Apache-2.0"` dans `package.json`, licences des trois dépendances d'exécution vérifiées (Svelte MIT, Zod MIT, Transformers.js Apache-2.0). Mais `NOTICE` contient encore « À compléter » (modèle NER, motifs repris de Presidio) et aucun contrôle de licences n'existe en CI (T6.5 non fait) : écart E3. |
| NF-16 | CSP interdisant toute connexion hors origine (A7) | ✅ | `conventions.test.ts` : « R1 : la CSP interdit toute origine externe » (lit `src/web/index.html`) ; `privacy.test.ts` : « applique réellement la CSP… » (violations `connect-src` et `img-src` signalées par le navigateur lui-même, aucune requête partie). `dist/index.html` porte la même politique. Voir écart E18 (balise `<meta>`, `style-src 'unsafe-inline'`). |

### 3.2 Critères d'acceptation AC-01 à AC-12

| Réf. | Critère | Statut | Preuve et réserves |
|---|---|:---:|---|
| AC-01 | Utilisable hors ligne sans transmission | ✅ | `offline.test.ts` (2 tests applicatifs) et `privacy.test.ts` : voir NF-01 et NF-06. Chrome seulement. |
| AC-02 | Les détecteurs identifient les formats prévus par les packs | ✅ | `packs/_tools/packs.test.ts` : 611 tests, dont 410 cas étiquetés (global 123, dates 80, France 74, Suisse 72, lang-fr-en 61, positifs, négatifs et pièges) et les tests croisés tous packs actifs. `src/core/validators/validators.test.ts` : 192 tests (`luhn`, `iban_mod97`, `ean13`, `fr_nir_key`, `ch_uid_mod11`, `fr_siren_luhn`, `fr_siret_luhn`, exception La Poste). Chacun des 13 types qui ne relèvent pas du NER (courriel, téléphone, URL, adresse IP, IBAN, carte, secret, date, AVS, IDE, NIR, SIREN, SIRET) a au moins 5 cas positifs. |
| AC-03 | NER personnes, organisations, lieux, fr et en, résultats évalués et documentés (précisé par A13) | 🟡 | Évaluation reproduite : voir A13a, A13b (✅) et A13c (🟡, vitesse dans un navigateur non établie par le projet). Le document `docs/evaluation-ner.md` existe et est à jour. |
| AC-04 | Une règle déclarative s'ajoute sans modifier le moteur | ✅ | `analyzer.test.ts` : « applique validateur, contexte, seuil et NER » construit un pack JSON par `parsePack` et le moteur détecte sans changement de code ; `registry.test.ts` : « accepte le pack d'exemple » ; `packs.test.ts` (web) : chargement automatique de tout dossier de `packs/`. |
| AC-05 | Packs Suisse et France actifs ensemble | ✅ | `packs/_tools/packs.test.ts` : tous les packs sont enregistrés dans un seul registre et **chaque cas est exécuté avec tous les packs actifs** ; groupes « tests croisés » `country-ch`, `country-fr` et « banc commun » (numéros suisses et français dans une même phrase, exactitude de la liste complète des détections retenues). |
| AC-06 | Un même pseudonyme à travers plusieurs documents | ✅ | `src/core/mapping/snapshot.test.ts`, groupe « AC-06 : même session sur plusieurs documents » (2 tests) ; `src/web/state.svelte.test.ts` : « setText repart de zéro mais garde réglages, session et réponse du LLM ». |
| AC-07 | Table exportée chiffrée, réimportée, utilisée | ✅ | `src/core/crypto/mapping-file.test.ts` : « session → snapshot → chiffré → déchiffré → session → nouveau texte », format annoncé (PBKDF2-SHA-256, 600 000 itérations, AES-256-GCM, sel 16 octets, IV 12), mauvaise phrase, octet altéré (3 champs), en-tête authentifié, version inconnue ; `PseudoRoundTrip.test.ts` : export puis import par le code de l'interface. Les boutons d'export et d'import ne sont pas pilotés dans un navigateur (M-05). |
| AC-08 | Corriger les détections et valider avant export | 🟡 | Validation : ✅ (NF-12). Corrections : logique de `state.svelte.test.ts` (« AppState : corrections » : suppression, restauration, type, opérateur, ajout manuel, décalage des suivants), `review-selection.test.ts` (propagation à toutes les occurrences, positions UTF-16), rendus serveur de `ReviewPanels.render.test.ts`. **Aucun e2e ne sélectionne un mot, n'ajoute ni ne supprime une détection dans un navigateur** (écart E9) : M-05. |
| AC-09 | CLI | ➖ | Reporté par A5 (CLI après le MVP). La condition de NF-08 est tenue. |
| AC-10 | Limites affichées, pas de garantie d'anonymat | ✅ | `conventions.test.ts` : « R6 : l'avertissement permanent est présent dans App » (« Lessive réduit le risque mais ne garantit pas l'anonymat : relisez le résultat. ») et « R6 : jamais « anonymisé » ou dérivés dans l'interface » ; `ResultLogic.test.ts` : « contient toujours les limites… » (identification indirecte, A18) ; `analyzer.test.ts` : avertissement quand le NER est absent ; `docs/limites.md`, relu. |
| AC-11 | Les tests démontrent l'absence de transmission externe | ✅ | `tests/e2e/privacy.test.ts` (6 tests) et `offline.test.ts`, 9 sur 9 réussis, **dont le parcours NER sur le vrai modèle**. Voir E7 : la CI ne les lance pas. |
| AC-12 | Tests automatisés et évaluations NER documentées | ✅ | 1 359 tests Vitest et 9 e2e réussis ; `docs/evaluation-ner.md` reproduit. Réserves (écarts E6, E17) : pas de mesure de couverture, aucun seuil de rappel assertionné, quelques modules sans test dédié. |

### 3.3 Exigences des amendements et critères du PLAN

Les amendements qui restreignent le périmètre sont listés avec ➖. A1, A19 (contexte et méthode) et A7 (déjà NF-16) n'ont pas de ligne propre ; A5 est traité par AC-09 et NF-08.

| Réf. | Exigence | Statut | Preuve et réserves |
|---|---|:---:|---|
| A2 | Cas d'usage principal : coller, pseudonymiser, envoyer, réidentifier | ✅ | `privacy.test.ts` : « déroule le parcours complet… » (saisie, analyse, vérification, résultat validé, réponse simulée, réidentification, valeurs restituées, aucun pseudonyme restant). |
| A3 | Mode Masquage, mot « anonymisé » absent, résultat `[PERSONNE]…` | ✅ | `conventions.test.ts` (R6) ; `operators.test.ts` : « donne un libellé français par type, un par EntityType » (`[PERSONNE]`, `[DATE]`, `[LIEU]`…) ; `transform.test.ts` : « interdit pseudonymize en mode masquage ». Réserve E12 : l'opérateur par défaut du Masquage est l'astérisque, la catégorie est un choix. |
| A4 | Généralisation | ➖ | Reportée après le MVP. |
| A6 | Site statique, hors ligne après premier chargement, auto-hébergement documenté | 🟡 | Statique et hors ligne : ✅ (NF-02, NF-06). Auto-hébergement : seulement un paragraphe du README (« tout serveur de fichiers convient », type MIME `.wasm`). Pas de déploiement GitHub Pages ni de guide dédié (T6.5 non fait, E3). |
| A8 | Packs livrés au format JSON, validateurs en liste fermée référencée par nom (R8) | ✅ | `registry.test.ts` : « refuse un validateur inconnu avec la liste des validateurs », « n'accepte aucune fonction ni valeur non JSON comme règle » ; `types.test.ts` : « a une liste fermée de validateurs sans doublon » ; `packs.test.ts` : contrôles ReDoS statique et dynamique de chaque motif. |
| A8 | Import de packs par l'utilisateur, YAML | ➖ | Reportés. |
| A9 | Formats : texte collé, texte brut et Markdown | ✅ | `review-misc.test.ts` : « accepte .txt et .md, refuse le reste », « retire le BOM et uniformise les fins de ligne ». |
| A9 | CSV et JSON structurés | ➖ | Reportés. |
| A10 | Un seul paquet npm, trois dossiers | ✅ | Un seul `package.json`, `src/core`, `src/ner`, `src/web` ; frontières vérifiées par le lint. |
| A11 | Résolution d'entités : variantes d'un nom rattachées, cas à vérifier signalés, correction manuelle | ✅ | `src/core/mapping/resolution.test.ts` : « rattache les variantes d'une même personne à une seule entité » (« Claire Martin », « Mme Martin », « Claire », « C. Martin »…), noms partagés, initiale ambiguë, particules ; `session.test.ts` : groupes `merge` et `split` ; `PseudoLogic.test.ts` : « met les entités à vérifier en premier ». Règles documentées dans `PLAN.md` §5, `ARCHITECTURE.md`, `docs/limites.md` §5 (cas non traités). |
| A12 | Aller-retour LLM : format choisi pour être recopié, réidentification tolérante, consigne fournie | 🟡 | **Tolérance** ✅ : `reidentify.test.ts` (51 tests : casse, espace ou tiret, zéros de tête, crochets, traduction, possessif, faux positifs, aller-retour « réponse déformée », « traduction complète en anglais »). **Consigne** ✅ : `reidentify.test.ts` « renvoie la consigne de l'ADR 0002 en français et en anglais », `ResultLogic.test.ts` « préfixe la consigne puis une ligne vide ». **Format choisi pour être recopié** : non démontré. L'ADR 0002 est « Proposé », sa section « Résultats » est vide, `spikes/tokens/reponses/` ne contient que l'exemple : E1, M-03. |
| A13a | Rappel PERSON ≥ 0,90 en fr et en en (NER et dictionnaires combinés) | ✅ | `scripts/eval/evaluate.ts` exécuté : fr 0,902 (111/123), en 0,921 (116/126) en recouvrement ; exacte : fr 0,878, en 0,913. **Atteint de justesse** et mesuré sur un corpus de 150 phrases par langue écrit par le projet : E6. |
| A13b | Modèle ≤ 150 Mo | ✅ | Fichiers nécessaires mesurés : 138,3 Mo (135,4 Mo pour `model_quantized.onnx`, 2,9 Mo pour `tokenizer.json`). |
| A13c | 5 000 caractères en 5 s au plus sur CPU | 🟡 | Node : 0,335 s (reproduit). Navigateur : **non établi par le projet** (`docs/performances.md`). Mesure indicative du recetteur dans Chrome headless, WASM sur un fil, machine lente : ≈ 3,1 s une fois le moteur chargé (3 098 et 3 109 ms), 6,2 s à la première analyse. Sous la cible, avec une marge de 1,6. À confirmer sur la machine de Nico : M-04. |
| A14 | Contrat de détection (`source` `manual`, `validated`, `explanation`, `supersededBy`) | ✅ | `resolve.test.ts` (28 tests : manuel, validé, `supersededBy`, déterminisme sur 720 permutations), `analyzer.test.ts` (« donne la priorité aux ajouts manuels », « ne met aucune valeur originale dans les explications »), `pattern-recognizer.test.ts`. |
| A15 | 16 types d'entités du MVP | ✅ | Les 13 types à base de règles (hors personnes, organisations, lieux) ont des cas positifs dans `packs/*/tests/cases.json` (par exemple DATE 57, PHONE 39, CREDIT_CARD 35, SECRET 17, IBAN 14, FR_NIR 14, CH_AVS 11, CH_UID 9, IP_ADDRESS 8, FR_SIRET 8, URL 7, FR_SIREN 7, EMAIL 5). PERSON, ORGANIZATION, LOCATION : rapport d'évaluation reproduit. |
| A16 | Un seul profil par défaut | ➖ | Profils multiples reportés. |
| A17 | PBKDF2-SHA-256 et AES-256-GCM via WebCrypto, format versionné | ✅ | `mapping-file.test.ts` : « le fichier a le format annoncé », « mesure la dérivation réelle à 600 000 itérations » ; versions et formats inconnus refusés. |
| A18 | Identification indirecte : limite affichée | ✅ | `ResultLogic.test.ts` : « contient toujours les limites… » (contient « identification indirecte ») ; `docs/limites.md` §1 ; `README.md`. |
| A20 | Modèle NER non livré, chargé par l'utilisateur depuis son disque | ✅ | `dist/` sans modèle ; `offline.test.ts` : « le modèle NER ne doit pas être pré-caché » ; `src/web/model-store.test.ts` (19 tests : sélection, validation, refus d'un pointeur Git LFS, stockage sous URL synthétiques de même origine) ; `privacy.test.ts` : parcours NER avec le dossier du modèle donné au sélecteur ; `.gitignore` : `models/*`. |
| PLAN T5 | Aucune injection HTML depuis le texte collé | ✅ | `HighlightedText.render.test.ts` : « n'interprète jamais le texte comme du HTML », « n'interprète pas une détection qui couvre des balises » ; aucun `{@html}` ni `innerHTML` dans `src/` (grep). |
| PLAN T5 | Parcours complet au clavier | ⏳ | Aucun test. Les détections sont des `role="button"` avec `tabindex="0"` (test de rendu), mais le parcours entier n'a pas été exercé : M-06. |
| PLAN T5 / T6.3 | Interface réactive pendant l'analyse (jamais bloquée plus de 100 ms) | 🟡 | Analyse dans un worker (`analysis-client.test.ts`, e2e). Mesure du recetteur dans Chrome headless : aucune tâche longue de plus de 50 ms à 5 000 caractères ; à 20 000 caractères, tâches de 130, 51, 56 et 59 ms (une dépasse 100 ms). Sous Node, la transformation prend 150 ms à 100 000 caractères (`docs/performances.md`) : E13. |
| PLAN G0 | Validation des ADR par Nico | ✅ | Franchie le 2026-11-17 : ADR 0001 (DistilBERT multilingue) et ADR 0002 (format A, 100 % sur GPT et Claude) acceptés ; ADR 0003 décidé. |
| PLAN G1 | Recette manuelle sur un cas réel avant toute annonce | ⏳ | Non faite. M-08. |

## 4. Écarts constatés

Aucune exigence n'est classée ❌. Les écarts ci-dessous sont des preuves manquantes, des réserves ou des défauts mineurs. Le premier groupe empêche de publier ; il ne remet pas en cause la recette technique.

### 4.1 Bloquants pour la publication

| # | Écart | Exigence | Correction suggérée |
|---|---|---|---|
| E1 | **Le format des jetons n'a jamais été mesuré avec un LLM.** `PERSONNE_001` est la valeur par défaut du plan, pas un choix validé. L'ADR 0002 précise que ce format devient un contrat de `src/core` : le changer après publication casserait les fichiers d'export déjà créés (les pseudonymes sont dans le snapshot). | A12, ADR 0002 | Faire l'expérience du lot 1 avant toute annonce (M-03), puis passer l'ADR à Accepté ou Rejeté. Si le format change, c'est un changement unique dans `mapping/pseudonym.ts`, `reidentify/tokens.ts` et la consigne, avec montée de version du snapshot. |
| E2 | `SECURITY.md` n'indique aucun canal de signalement (deux champs `[À COMPLÉTER]`, un délai d'accusé de réception). | T6.4 | Renseigner l'adresse et le délai (M-09). |
| E3 | `NOTICE` incomplet (« À compléter : modèle NER, motifs… Presidio »), et incohérent avec le `README` qui affirme que les motifs « s'inspirent de Presidio (MIT) » alors qu'aucun README de pack ne cite de source Presidio. Pas de contrôle de licences en CI, pas d'inventaire des dépendances (dont ONNX Runtime Web, MIT, qui pèse 95 % de `dist/`), pas de déploiement ni de guide d'auto-hébergement (T6.5 non fait). | NF-15, A6 | Établir quels motifs viennent de Presidio et le dire dans les README de packs ; compléter `NOTICE` ; ajouter l'inventaire et le contrôle de licences (une dépendance de développement demande l'accord de Nico, R9) ; écrire le guide d'auto-hébergement. |
| E4 | Porte G0 non franchie : ADR 0001 (licence AFL-3.0 et réserve sur les données d'entraînement, critère C4 « navigateur ») et ADR 0002 sont « Proposé », alors que les phases 3 à 5 sont livrées sur leurs hypothèses par défaut. | PLAN G0 | Décision de Nico (M-07), puis mise à jour des statuts. |

### 4.2 Majeurs

| # | Écart | Exigence | Correction suggérée |
|---|---|---|---|
| E5 | **Performance navigateur non établie par le projet.** `docs/performances.md` ne contient aucune mesure de navigateur. Mesure indicative du recetteur : ≈ 3,1 s pour 5 000 caractères (cible 5 s), ≈ 12 à 13 s pour 20 000, soit une dégradation d'environ ×10 par rapport à Node, dans Chrome headless sur 2 cœurs partagés. Rien n'a été mesuré dans Firefox ni Safari, ni sur la machine de Nico. | A13c | M-04. Si la marge se révèle insuffisante : pistes de `docs/performances.md` (recouvrement des segments, ne repasser que les segments modifiés). Afficher une durée estimée au-delà de quelques milliers de caractères. |
| E6 | **Rappel PERSON atteint de justesse et sans garde-fou.** Combiné : 0,902 en français (une entité de moins suffit à passer sous 0,90) ; exacte : 0,878. NER seul : 0,854 pour un seuil d'ADR de 0,85. Corpus de 150 phrases par langue, écrit par le projet et parallèle d'une langue à l'autre (intervalle de confiance d'environ ± 5 points). `evaluate.ts` imprime les scores sans jamais échouer s'ils baissent. | A13a, AC-03 | Ajouter un test (ignoré si le modèle est absent) qui échoue sous 0,90 ; avancer les pistes 1 et 2 de `docs/evaluation-ner.md` (casse de titre sur copie, règles de salutation) ; confronter à des textes réels lors de G1. |
| E7 | **Les garanties de confidentialité ne sont pas protégées par la CI.** `.github/workflows/ci.yml` lance lint, typecheck, `npm test` et build, mais pas `npm run test:e2e`. Les tests « modèle réel » et l'e2e NER sont sautés quand le modèle est absent, ce qui est le cas en CI. | NF-01, AC-11 | Ajouter un job e2e (Chrome est présent sur `ubuntu-latest`) ; documenter que le volet NER se rejoue à la main avec le modèle. |
| E8 | **Le NER est décoché par défaut et ne persiste pas** (`ner = $state(false)`) : il faut le recocher à chaque rechargement, même si le modèle est stocké. Sans modèle, le rappel PERSON tombe à 0,57 et ORGANIZATION et LOCATION à 0 (`docs/evaluation-ner.md`). Un avertissement s'affiche, mais l'expérience par défaut du grand public est celle des règles seules. | NF-09, A13 | Activer le NER automatiquement quand un modèle est stocké ; message d'accueil qui explique la différence avant la première analyse. |

### 4.3 Mineurs

| # | Écart | Correction suggérée |
|---|---|---|
| E9 | Les corrections ne sont jamais exercées dans un navigateur (sélection dans le texte, barre d'outils, suppression, changement de type, ajout manuel propagé). La conversion des bornes de sélection est testée sur des nœuds simulés. Les export et import chiffrés par l'interface ne sont pas non plus pilotés. | Étendre l'e2e : sélection par CDP, ajout manuel, export puis import d'un fichier. |
| E10 | `transformers-engine.test.ts` : « n'appelle pas le réseau et refuse de reconnaître avant load() » ne vérifie que le refus avant `load()`. `allowRemoteModels = false` et l'enveloppe de `env.fetch` ne sont assertés par aucun test unitaire (couverts indirectement par l'e2e NER et la CSP). | Renommer ce test, ou ajouter des assertions sur `env` et un espion sur `fetch`. |
| E11 | NF-12 : l'e2e n'affirme pas que « Copier le texte » est désactivé avant la case ; la porte est logique (`canCopy`), pas technique : le texte transformé affiché reste sélectionnable à la main. Acceptable pour une aide à la vigilance. | Ajouter l'assertion `disabled` avant la case. |
| E12 | A3 donne `[PERSONNE], née le [DATE]…` pour résultat du Masquage, mais l'opérateur par défaut est l'astérisque de même longueur (la longueur d'un nom reste visible, ce que `docs/limites.md` dit). La catégorie existe, par type. | Choisir `categorize` par défaut, ou préciser A3. |
| E13 | Sur le fil principal, la transformation en Pseudonymisation prend 150 ms à 100 000 caractères (235 ms à froid) ; la limite d'entrée est de 200 000. Une tâche longue de 130 ms observée à 20 000 caractères. | Déplacer la transformation dans le worker, ou borner la taille avec un message. |
| E14 | Code mort : `src/web/components/Placeholder.svelte` n'est référencé nulle part (son commentaire demande de le supprimer). | Le supprimer. |
| E15 | `@huggingface/transformers` 4.3.2 impose `onnxruntime-web` 1.31.0-dev.20260914 (préversion) ; `onnxruntime-node` est installé mais non embarqué. `npm ls` signale aussi trois paquets « extraneous » (`@img/sharp-wasm32`, `@emnapi/runtime`, `tslib`) dans le `node_modules` de cet environnement. Versions verrouillées dans `package-lock.json`, mais à consigner à l'inventaire de T6.5. | Le noter dans l'inventaire et surveiller la sortie d'une version stable. |
| E16 | Les tests des spikes (`spikes/tokens`, 235 tests réussis) ne tournent ni dans `npm test` ni en CI. | Sans conséquence tant que les spikes restent jetables. |
| E17 | Pas de mesure de couverture. Sans test dédié : `ner.worker.ts` et `analysis.worker.ts` (couverts par l'e2e), `PseudoDom.ts` et `ResultDom.ts` (presse-papiers, téléchargement), `registry/schema.ts` (par `parsePack`). De l'indicateur « prêt hors ligne », seul `parseOfflineMessage` est testé. | Ajouter une assertion e2e sur l'indicateur ; envisager un rapport de couverture. |
| E18 | La CSP est livrée par balise `<meta>`, avec `style-src 'self' 'unsafe-inline'` et des directives en plus de R1 (`worker-src`, `img-src data:`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`). Plus stricte que R1 sauf pour les styles. Un en-tête HTTP serait plus robuste. | Le documenter dans le guide d'auto-hébergement (en-tête recommandé). |
| E19 | Hypothèse à vérifier : `docs/limites.md` et `docs/confidentialite.md` recommandent une fenêtre de navigation privée, mais certains navigateurs désactivent ou purgent les service workers et le Cache Storage dans ce mode, ce qui affecterait le mode hors ligne et la conservation du modèle. | M-01, M-02 ; ajuster la recommandation selon le résultat. |

## 5. Vérifications manuelles à faire par Nico avant publication

À dater et à signer dans la colonne « Fait le » au fur et à mesure.

| # | Vérification | Procédure | Fait le |
|---|---|---|---|
| M-01 | Firefox (version courante) | `ONNXRUNTIME_NODE_INSTALL=skip npm run build && npm run preview`, ouvrir l'adresse dans un profil neuf sans extension. Charger le modèle (Réglages), dérouler le parcours complet avec un texte synthétique en cochant le NER, y compris une correction manuelle. Onglet Réseau : aucune requête hors origine ; onglet Stockage : `localStorage` et IndexedDB vides. Couper le réseau, recharger, refaire une analyse. Refaire en fenêtre privée (E19). | |
| M-02 | Safari (macOS courant) | Même procédure. Points propres à Safari : sélecteur de dossier (`webkitdirectory`), worker de type module, CSP avec `'wasm-unsafe-eval'`, conservation du cache du modèle de 138 Mo (Safari peut purger le stockage d'un site peu visité : recharger après plusieurs jours et vérifier que le modèle est toujours là), copie dans le presse-papiers (geste utilisateur requis). | |
| M-03 | Fiabilité de recopie des jetons avec de vrais LLM (E1) | Suivre `spikes/tokens/consignes.md` : lot 1 (30 essais) dans 2 ou 3 LLM, nouvelle conversation à chaque essai, réponses déposées sans retouche dans `spikes/tokens/reponses/<llm>/`. Puis `node spikes/tokens/score.mjs`, remplir « Résultats » de l'ADR 0002. Critère : au moins 98 % de jetons retrouvés en mode tolérant, pour chaque LLM, sur `traduire` et `reformuler` avec consigne système. | |
| M-04 | Performance dans le navigateur (E5) | Procédure de `docs/performances.md`, section « Procédure de mesure dans le navigateur » (textes de 1 000 à 100 000 caractères générés par `scripts/perf/measure.ts --write-texts`). Relever, sur la machine habituelle puis sur une plus modeste : temps d'analyse après chargement du modèle (cible : 5 000 caractères en 5 s au plus), blocages visibles de l'interface (cible : aucun de plus de 100 ms), durée de l'export chiffré. Reporter les chiffres dans le document. | |
| M-05 | Corrections et export chiffré, dans l'interface (E9) | Sélectionner un mot manqué, l'ajouter avec propagation, supprimer une fausse détection, changer un type et un opérateur ; fusionner et scinder deux pseudonymes ; exporter la table avec une phrase de 12 caractères ou plus, recharger, importer, vérifier que les pseudonymes sont restitués. Essayer une mauvaise phrase. | |
| M-06 | Parcours complet au clavier | Sans souris : Tab et Maj+Tab sur les quatre écrans, activer une détection par Entrée ou Espace, ajouter une sélection par Maj+flèches, cocher la validation, copier, importer la réponse. Contrôler la visibilité du focus et l'annonce des états (lecteur d'écran si possible). | |
| M-07 | Décision des ADR 0001 et 0002 (porte G0) | ADR 0001 : trancher la licence (AFL-3.0 et données d'entraînement ; le modèle n'étant plus redistribué, A20, la réserve est celle de l'utilisateur) et le critère C4 avec la mesure M-04, puis passer à Accepté. ADR 0002 : après M-03. ADR 0003 est déjà décidé. | ✅ Fait le 2026-11-17 (mesure navigateur M-04 encore à faire). |
| M-08 | Recette sur un cas réel (porte G1) | Sur un texte réel de Nico traité en local (jamais collé ailleurs avant relecture) : analyse avec le NER, relecture complète du résultat, recensement des noms manqués et des fausses alertes, aller-retour avec un vrai LLM. Noter le taux de noms manqués et le comparer à `docs/evaluation-ner.md`. | |
| M-09 | `SECURITY.md` | Remplacer les champs `[À COMPLÉTER]` : adresse ou formulaire privé de signalement, délai d'accusé de réception. | ✅ Fait le 2026-11-17 (adresse électronique, accusé de réception sous 2 jours). |
| M-10 | `NOTICE` et licences (E3) | Dire quels motifs viennent de Presidio (README des packs), compléter `NOTICE` (modèle NER, Presidio, ONNX Runtime Web), vérifier les licences de l'arbre de dépendances. | |
| M-11 | Hébergement | Déployer sur l'hébergeur prévu : fichiers `.wasm` servis en `application/wasm`, service worker actif après le premier chargement, mode hors ligne sur cette origine, CSP effective (idéalement par en-tête). | |

## 6. Mesures du recetteur hors suite de tests

Deux scripts ad hoc, écrits dans `/tmp`, qui réutilisent le harnais de `tests/e2e/harness.ts` sans le modifier. Ils ne sont pas dans le dépôt et leurs résultats restent indicatifs : Chrome headless, 2 cœurs partagés avec d'autres processus, une seule exécution de chaque.

| Mesure | Résultat |
|---|---|
| Analyse avec NER dans Chrome, texte synthétique de 5 000 caractères (jusqu'à l'affichage de l'écran de vérification) | 6 201 ms à la première analyse (chargement du moteur NER dans le worker inclus), puis 3 098 ms et 3 109 ms. Aucune tâche longue de plus de 50 ms sur le fil principal. |
| Même mesure à 20 000 caractères | 16 223 ms, puis 13 362 ms et 12 351 ms. Tâches longues sur le fil principal : 130, 51, 56 et 59 ms. |
| Chargement du modèle (copie dans le cache du navigateur) | 0,7 à 1,0 s |
| NER hors ligne après rechargement : modèle chargé, réseau coupé et serveur arrêté, page rechargée | L'interface annonce « Modèle chargé, prêt à l'emploi » sans nouvelle sélection ; le parcours avec NER réussit (nom pseudonymisé puis réidentifié) ; aucune requête hors origine. |

Ce dernier scénario devrait entrer dans la suite e2e (il couvre le cas d'usage le plus fréquent hors ligne).

## 7. Conclusion

**MVP acceptable sous réserve de :**

1. **Mesurer la fiabilité de recopie des jetons avec de vrais LLM (M-03)**, puis fixer le format : c'est la seule exigence de fond (A12) dont le volet principal n'est pas démontré, et le format deviendra un contrat de fichier dès la première publication (E1).
2. **Franchir la porte G0** : décider les ADR 0001 et 0002 (M-07, E4).
3. **Mesurer la performance dans les navigateurs réellement visés (M-04, E5)** et vérifier le parcours dans Firefox et Safari (M-01, M-02). La mesure indicative du recetteur (≈ 3,1 s pour 5 000 caractères) laisse une marge de 1,6 seulement sur la cible.
4. **Compléter `SECURITY.md` (M-09) et `NOTICE` (M-10, E3)**, et trancher la présence de Presidio.
5. **Faire la recette sur un cas réel (G1, M-08)**, notamment parce que le rappel PERSON de 0,90 en français tient à une entité près sur un corpus synthétique (E6).

Sur le plan technique, rien ne bloque : les commandes `npm test` (1 359 tests), `npm run lint`, `npm run typecheck`, `npm run build` et `npm run test:e2e` (9 tests, dont le parcours NER sur le vrai modèle) réussissent ; les garanties de confidentialité du cahier des charges (NF-01, NF-03, NF-05, NF-13, NF-14, NF-16, AC-01, AC-11) sont démontrées dans Chrome ; aucune exigence n'est en échec. La CI ne protège pas encore ces garanties (E7) : à corriger avant d'accepter des contributions externes.
