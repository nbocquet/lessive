# Recette du MVP (T6.6)

- **Mise à jour :** 17 novembre 2026, sur le commit `a16947b`.
- **Nature :** rapprochement du plan, du code, des tests exécutés et des décisions documentées. Cette mise à jour ne constitue pas une relecture indépendante de sécurité ni une validation manuelle par Nico.
- **Référentiel :** `SPECIFICATIONS.md` v1.1, amendements A1 à A21 ; `PLAN.md`, portes G0 et G1.
- **Environnement de vérification actuel :** macOS, Apple Silicon (`Darwin arm64`), Node 26.13.1, Chrome headless piloté par le harnais CDP du dépôt. Modèles CamemBERT et DistilBERT présents sur disque pour les tests navigateur.
- **Historique :** la recette initiale portait sur `0cb156e`, sous Linux avec DistilBERT. Sa version complète est conservée dans l'historique Git de ce fichier avant cette mise à jour. Ses mesures ne sont pas des mesures du build actuel.

## 1. Verdict et vérifications exécutées

**Le parcours du MVP est implémenté et les vérifications automatiques ci-dessous passent. La clôture de la recette reste ouverte : évaluation du modèle publié, performances chiffrées, vérifications manuelles et porte G1.**

| Commande exécutée le 17 novembre 2026 | Résultat actuel | Portée |
|---|---|---|
| `npm test` | 1 618 tests réussis, 4 ignorés, aucun échec | Les tests ignorés ne constituent pas une preuve d'exécution avec un modèle réel. |
| `npm run typecheck` | Réussi | TypeScript strict et Svelte. |
| `npm run lint` | Réussi | ESLint et formatage. |
| `npm run test:e2e` | Build réussi ; 15 tests navigateur réussis, aucun ignoré | Chrome : confidentialité, hors ligne par règles, installation du vrai CamemBERT, import du vrai DistilBERT, état sans moteur, corrections et affichage mobile. |

La CI (`.github/workflows/ci.yml`) exécute lint, types, tests unitaires, build et un job e2e Chrome. Les scénarios nécessitant les poids locaux peuvent être ignorés en CI : le résultat local ci-dessus ne prouve pas leur exécution dans GitHub Actions.

Les tests navigateur utilisent le harnais du dépôt (`tests/e2e/cdp.ts`, `harness.ts`), sans Playwright. Ils vérifient le build servi localement ; ils ne constituent pas une recette du site distant.

## 2. Lecture des statuts

- **✅ Vérifié :** preuve dans le code et les tests actuels exécutés, ou décision explicitement documentée. La colonne des preuves précise cette distinction.
- **🟡 Partiel :** fonctionnalité présente, mais preuve incomplète, ancien modèle ou vérification manuelle restante.
- **⏳ À faire :** pas de validation documentée suffisante.
- **➖ Hors MVP :** report explicite, sans travail supplémentaire requis pour la clôture.

Les anciens totaux de conformité ne sont pas reconduits : ils mélangeaient des preuves sur DistilBERT, des décisions humaines et des tests sur une ancienne interface. Les réserves ouvertes sont regroupées en section 5.

## 3. Exigences et preuves actuelles

### 3.1 Contraintes NF-01 à NF-16

| Réf. | Statut | Preuve et limite |
|---|:---:|---|
| NF-01 — Traitement local | ✅ | `tests/e2e/privacy.test.ts` : interception réseau de la page, des workers et du service worker ; parcours complet avec et sans NER. `bundled-model.test.ts` : CamemBERT servi par la même origine. |
| NF-02 — Site sans serveur de traitement | ✅ | Build statique testé avec `tests/e2e/server.ts`. Aucun serveur de traitement nécessaire. |
| NF-03 — Aucun envoi de document | ✅ | Tests réseau, inspection des stockages et CSP dans `privacy.test.ts` ; aucune requête hors origine observée sur ces parcours. |
| NF-04 — Aucun appel à un LLM | ✅ | Parcours e2e sans requête externe ; inspection de `package.json` et de l'adaptateur : NER de classification, aucun modèle génératif. Les expériences du prototype de jetons sont distinctes de l'application. |
| NF-05 — Aucune API distante pendant le traitement | ✅ | `src/ner/transformers-engine.ts`, CSP et tests réseau ; téléchargement du modèle fourni depuis l'origine de l'application, au clic uniquement. |
| NF-06 — Hors ligne après installation | 🟡 | `offline.test.ts` : rechargement sans serveur, analyse par règles et réidentification ; renouvellement des caches. Le NER hors ligne après rechargement n'est pas exercé par la suite actuelle ; navigateurs autres que Chrome à vérifier. |
| NF-07 — TypeScript | ✅ | `npm run typecheck` réussi. |
| NF-08 — Moteur sans DOM ni Node | ✅ | Frontières ESLint et compilation de `src/core` sans bibliothèque DOM ; tests exécutés sous Node et moteur utilisé dans un worker web. |
| NF-09 — NER local | ✅ | E2e réussis avec import du DistilBERT local et installation de CamemBERT fourni. `refreshModel()` réactive le NER lorsqu'un modèle est retrouvé dans le cache. |
| NF-10 — Architecture modulaire | ✅ | Frontières `core` / `ner` / `web` contrôlées par le lint ; moteur NER injecté par interface. |
| NF-11 — Packs extensibles | ✅ | Schéma et registre testés, chargement automatique des packs livrés, `docs/creer-un-pack.md`. Import de packs par l'utilisateur hors MVP. |
| NF-12 — Validation avant copie | ✅ | `state.svelte.test.ts` et parcours e2e : validation explicite, invalidation après modification. Le test navigateur n'affirme pas encore l'état désactivé du bouton avant validation ; le texte affiché reste sélectionnable. |
| NF-13 — Sans télémétrie | ✅ | CSP, contrôles de conventions et parcours réseau e2e. Preuve limitée aux sources et au build testés. |
| NF-14 — Pas de persistance des textes et correspondances | ✅ | `privacy.test.ts` : stockages inspectés, caches parcourus, rechargement effaçant texte et session. Export chiffré explicitement demandé autorisé. |
| NF-15 — Licence Apache 2.0 | 🟡 | `LICENSE`, `NOTICE` complété, modèle fourni sous MIT avec licence embarquée. Inventaire exhaustif des dépendances et contrôle automatique des licences encore absents. |
| NF-16 — CSP de même origine | ✅ | Tests de conventions et refus effectif d'une requête externe dans Chrome. Politique livrée par balise meta ; en-tête recommandé en auto-hébergement. |

### 3.2 Critères AC-01 à AC-12

| Réf. | Statut | Preuve et limite |
|---|:---:|---|
| AC-01 — Hors ligne sans transmission | 🟡 | Chemin par règles vérifié ; NER hors ligne après rechargement et Firefox/Safari à compléter (NF-06). |
| AC-02 — Formats des packs | ✅ | `packs/_tools/packs.test.ts`, tests de validateurs, contrôles ReDoS et régressions des courriels/adresses. Données synthétiques uniquement. |
| AC-03 — NER fr/en évalué | 🟡 | `docs/evaluation-ner.md` porte sur DistilBERT et les règles d'alors. Le modèle publié est désormais CamemBERT, plus faible en anglais selon ADR 0004. Son rappel combiné actuel et les cibles A13 ne sont pas établis par ce rapport. |
| AC-04 — Règle déclarative ajoutable | ✅ | Tests du registre et de l'analyseur, chargement des dossiers de packs sans modification du moteur. |
| AC-05 — Suisse et France ensemble | ✅ | Banc des packs exécuté avec tous les packs actifs, tests croisés CH/FR. |
| AC-06 — Pseudonymes communs à plusieurs documents | ✅ | Tests `src/core/mapping/snapshot.test.ts` et `state.svelte.test.ts` : session conservée entre documents, effacée lors d'une nouvelle session ou d'un rechargement. Voir aussi la réserve de réidentification en section 5. |
| AC-07 — Export/import chiffré | 🟡 | Tests de chiffrement et `PseudoRoundTrip.test.ts` : aller-retour, mauvaise phrase, altération et versions refusées. Le téléchargement et le sélecteur de fichier ne sont pas exercés dans un navigateur. |
| AC-08 — Corrections et validation | 🟡 | E2e : suppression/restauration et ajout par sélection ; tests d'état : type, opérateur, propagation. Fusion/scission, changement de type/opérateur et parcours chiffré complets restent à vérifier dans l'interface. |
| AC-09 — CLI | ➖ | Reportée par A5. |
| AC-10 — Limites et absence de garantie | ✅ | Avertissement permanent, limites du résultat, `ModelStatus.svelte` et son e2e : absence de moteur expliquée avant analyse, accès direct aux réglages. |
| AC-11 — Tests de non-transmission | ✅ | E2e Chrome réussis, y compris les deux parcours avec modèles réels ; job e2e présent en CI, avec réserve sur les poids absents. |
| AC-12 — Tests et évaluation documentés | 🟡 | Suite actuelle réussie ; rapport NER disponible mais à refaire pour le modèle publié. Pas de seuil de rappel automatisé ni de rapport de couverture. |

### 3.3 Amendements et tâches transversales

| Réf. | Statut | État actuel |
|---|:---:|---|
| A2, A3 | ✅ | Parcours copier-coller, modes Masquage/Pseudonymisation, validation et réidentification. Masquage par astérisques par défaut ; catégorisation disponible, donc l'exemple `[PERSONNE]` d'A3 n'est pas le réglage par défaut. |
| A6, T6.5 | 🟡 | Workflow Pages présent et publication effectuée. README : build statique, MIME WASM et réglages SEO. Guide complet d'auto-hébergement et contrôle des licences à terminer. |
| A8, A9, A10 | ✅ | Packs JSON livrés, validateurs fermés, texte brut/Markdown, un paquet npm et frontières de dossiers. |
| A11, A14, A15 | ✅ | Résolution et corrections d'entités, contrat de détection et 16 types testés ; propagation des noms et adresses ajoutées après les retours de test (`PLAN.md` §10). |
| A12, S2 | ✅ | ADR 0002 accepté : format A, 100 % des 78 jetons retrouvés par LLM sur le lot court GPT et Claude. Limites : deux LLM, essais par API, pas une garantie universelle des interfaces de chat. |
| A13, T3.4 | 🟡 | Ancien rapport : rappel PERSON combiné 0,902 fr / 0,921 en sous DistilBERT. Ces chiffres ne sont pas ceux du CamemBERT publié ni une nouvelle mesure des packs actuels. |
| A17 | ✅ | PBKDF2-SHA-256, 600 000 itérations, AES-256-GCM, format versionné, en-tête authentifié et refus des fichiers altérés testés. |
| A18 | ✅ | Identification indirecte explicitement annoncée comme limite. |
| A20, A21 | ✅ | Import local conservé ; version Pages avec CamemBERT MIT, vérification SHA-256 au build et installation au clic depuis la même origine. E2e avec les vrais poids réussi. |
| T5 — Injection HTML | ✅ | Rendus de texte testés ; absence d'interprétation HTML du contenu collé. |
| T5 — Clavier | ⏳ | Contrôles accessibles présents, mais aucune recette complète au clavier et lecteur d'écran documentée. |
| T6.3 — Performance | 🟡 | Mesures historiques sous DistilBERT ; constat qualitatif de Nico dans Firefox/Safari. Aucune mesure chiffrée du build et du CamemBERT actuels. |
| G0 | ✅ | ADR 0001/0002 acceptés ; choix de publication révisé par ADR 0004, décidé par Nico. |
| G1 | ⏳ | Retours de Nico sur des textes traités et régressions ajoutées, mais aucune clôture formelle de l'aller-retour complet sur cas réel avec le modèle publié. |
| A4, A5, A8, A9, A16 — reports | ➖ | Généralisation, CLI, import de packs/YAML, CSV/JSON structurés et profils multiples restent hors MVP. |

## 4. Réserves anciennes levées ou réduites

Les identifiants E1 à E19 renvoient à la recette initiale ; ils sont conservés pour éviter de perdre la trace des constats.

| Ancien écart | État après vérification |
|---|---|
| E1 — Format jamais mesuré | **Levé** : ADR 0002 accepté, résultats GPT/Claude enregistrés ; conserver les limites du lot court. |
| E2 — Canal de sécurité absent | **Levé** : adresse privée et accusé de réception sous deux jours dans `SECURITY.md`. |
| E3 — Notices, publication, licences | **Partiellement levé** : `NOTICE`, attributions Presidio/ONNX/modèle et workflow Pages présents ; inventaire, contrôle CI et guide complet restent ouverts. |
| E4 — G0 non franchie | **Levé** : décisions documentées, y compris ADR 0004 pour le modèle publié. |
| E7 — E2e absents de la CI | **Levé pour les parcours sans poids** : job Chrome présent. Les modèles réels ne sont pas provisionnés par ce job. |
| E8 — NER désactivé malgré un modèle conservé | **Levé** : activation dans `refreshModel()`, après import et après installation ; avertissement explicite si absent ou désactivé. |
| E9 — Aucune correction dans le navigateur | **Partiellement levé** : suppression/restauration et ajout sélectionné exercés ; autres opérations et export/import restent à compléter. |

Les limites des imports de modèles ont aussi été ajoutées : contrôle avant lecture (JSON 1 Mio, tokenizer 32 Mio, ONNX 512 Mio par fichier, total 550 Mio), téléchargements bornés et tests associés. Les Actions sont épinglées par SHA ; les permissions Pages/OIDC d'écriture sont limitées au déploiement. Ces protections ne prouvent pas qu'un graphe ONNX accepté ne puisse pas demander beaucoup de mémoire à l'exécution.

## 5. Travail restant pour clôturer la recette

### 5.1 Vérifications techniques

| Priorité | Travail | Critère de clôture |
|---|---|---|
| 1 | **Réévaluer CamemBERT avec les packs actuels** (E6, A13, AC-03) | Rapport reproductible fr/en : précision, rappel, F1 par catégorie, NER seul et combiné. Adapter le script aujourd'hui lié au modèle par défaut DistilBERT. Comparer à la cible de 0,90 ; documenter tout écart et faire décider une éventuelle révision de cible, sans transférer les scores DistilBERT. |
| 1 | **Mesurer les performances actuelles** (E5, E13, M-04) | Temps d'analyse à froid/chaud, tâches du fil principal, mémoire et chiffrement, avec machine/navigateur/modèle datés. Vérifier 5 000 caractères en ≤ 5 s et blocages ≤ 100 ms ; tester aussi 20 000 et 100 000 caractères. Les dépassements historiques restent une réserve, pas une garantie de fluidité. |
| 1 | **Compléter la validation navigateur** (M-01, M-02, M-05, M-06) | Procédures ci-dessous datées, avec résultats et anomalies éventuelles. |
| 1 | **Clôturer la recette réelle G1** (M-08) | Validation explicite de Nico sur la version publiée, relecture et aller-retour LLM compris. Ne jamais intégrer le texte réel au dépôt ni aux rapports. |
| 2 | **Finir T6.5** (E3, E15, E18, M-10) | Inventaire des dépendances, licences contrôlées en CI, versions ONNX consignées ; guide d'auto-hébergement (sous-chemin, MIME WASM, cache/service worker, modèle fourni, CSP par en-tête si possible). |
| 2 | **Compléter la couverture navigateur** (E9, E11, E17) | Export/import chiffré, changement de type/opérateur, fusion/scission, copie bloquée avant validation, indicateur hors ligne ; ajouter le NER hors ligne après rechargement. Ne pas confondre l'e2e d'installation avec ce dernier scénario. |
| 2 | **Encadrer la réidentification entre documents** (audit de sécurité) | La session est volontairement commune à plusieurs documents (AC-06). Vérifier et traiter le cas d'une réponse contenant un ancien pseudonyme absent du prompt courant, pouvant révéler une valeur d'un autre document ; couverture dédiée et comportement explicite avant copie. |
| 3 | **Petites réserves conservées** (E10, E12, E14, E16, E17, E19) | Clarifier le test « n'appelle pas le réseau » qui vérifie surtout le refus avant chargement ; expliciter le masquage par défaut d'A3 ; supprimer `Placeholder.svelte` inutilisé ; décider du maintien hors CI des prototypes et d'une mesure de couverture ; confirmer les limites du mode privé. |

Le suivi des avis de sécurité des dépendances reste nécessaire. L'audit précédent signalait une vulnérabilité de picomatch dans l'outillage de développement ; aucun nouvel audit réseau n'a été exécuté pour cette mise à jour, donc son état actuel n'est pas certifié ici.

### 5.2 Procédures manuelles restantes

À exécuter sur un build de production. Renseigner date, commit, modèle, version du navigateur et résultat ; une performance jugée bonne à l'œil ne valide pas réseau, stockage ou hors-ligne.

| Réf. | Procédure | État documenté |
|---|---|---|
| M-01 — Firefox | Profil neuf : installer/importer le modèle, analyser, corriger, valider, copier, réidentifier. Vérifier Réseau et stockages ; couper le réseau, recharger et analyser avec NER. Refaire en fenêtre privée. | Temps jugé conforme par Nico le 17 novembre 2026 ; reste du parcours non consigné. |
| M-02 — Safari | Même parcours ; contrôler sélecteur de dossier, WASM/worker, copie au geste utilisateur et conservation du modèle après plusieurs jours. Vérifier le mode privé séparément. | Temps jugé conforme par Nico le 17 novembre 2026 ; points spécifiques non consignés. |
| M-04 — Performances | Suivre `docs/performances.md` avec le modèle publié ; relever des chiffres et les tâches longues pour les différentes tailles, mémoire et export chiffré. | Mesures actuelles à faire ; anciennes mesures non transférables. |
| M-05 — Corrections et chiffrement | Changer type/opérateur, ajouter avec propagation, fusionner/scinder, exporter, recharger, importer, vérifier les pseudonymes, essayer une mauvaise phrase. | Tests de logique présents ; sélection et suppression/restauration déjà en e2e Chrome. Parcours complet restant. |
| M-06 — Clavier | Sans souris : Tab/Maj+Tab sur les quatre écrans, Entrée/Espace sur les détections, sélection Maj+flèches, ajout, validation, copie et réponse. Vérifier focus et annonces avec lecteur d'écran si possible. | À faire. |
| M-08 — G1 | Nico traite un cas réel localement avec le modèle publié : noms manqués, fausses alertes, corrections, relecture, aller-retour LLM et réidentification. Consigner uniquement un verdict et des statistiques sans données originales. | Retours de test reçus ; clôture formelle non documentée. |
| M-10 — Licences | Vérifier l'inventaire complet et le contrôle CI ; confirmer les attributions du build distribué. | Notices complétées ; inventaire/contrôle encore ouverts. |
| M-11 — Hébergement | Sur l'origine de publication : vérifier MIME WASM, CSP effective, installation du modèle au clic, absence de requête externe et fonctionnement après coupure réseau/rechargement. | Publication effectuée ; recette distante complète non exécutée dans cette mise à jour. |

M-03 (jetons), M-07 (décisions) et M-09 (canal de sécurité) sont clos dans la portée décrite en section 4. Un contrôle ponctuel des jetons dans l'interface de chat réellement utilisée reste recommandé, sans rouvrir le choix du format validé.

## 6. Mesures historiques : ne pas attribuer au modèle publié

Mesures de la recette initiale, **DistilBERT**, Chrome headless sous Linux sur deux cœurs partagés. Scripts ad hoc non versionnés, résultats indicatifs non réexécutés pour cette mise à jour.

| Mesure | Résultat historique |
|---|---|
| Analyse de 5 000 caractères | 6 201 ms à la première analyse, chargement inclus ; puis 3 098 et 3 109 ms. Aucune tâche du fil principal de plus de 50 ms observée. |
| Analyse de 20 000 caractères | 16 223 ms, puis 13 362 et 12 351 ms ; tâches de 130, 51, 56 et 59 ms sur le fil principal. La cible de 100 ms n'était donc pas toujours tenue. |
| Chargement en cache du modèle | 0,7 à 1,0 s. |
| NER hors ligne après rechargement | Réussi par script ad hoc, serveur arrêté. Ce contrôle historique n'est pas un test automatisé actuel de CamemBERT. |

La mise à jour de cette recette retire les réserves devenues fausses, mais ne clôt aucune vérification humaine ou mesure absente.
