# Lessive

Lessive repère les données personnelles d'un texte (noms, courriels, téléphones, IBAN, numéros AVS…) et les remplace par des repères neutres, comme `PERSONNE_001`, **directement dans votre navigateur**, avant que vous ne colliez le texte dans un assistant IA. Quand l'assistant répond, Lessive remet les vrais noms dans sa réponse, toujours sur votre ordinateur. Votre texte n'est envoyé à aucun serveur de traitement, Lessive n'appelle aucun assistant IA et ne mesure rien sur votre usage.

> **Lessive réduit le risque, il ne garantit pas l'anonymat.** Un texte dont on a remplacé les noms peut rester reconnaissable (une fonction, un lieu et une date suffisent parfois). Relisez toujours le résultat avant de l'envoyer. Voir [ce que Lessive ne fait pas](#ce-que-lessive-ne-fait-pas).

## À qui il sert

À toute personne ou équipe qui utilise un assistant IA (ChatGPT, Claude, Gemini ou autre) pour résumer, traduire, reformuler ou rédiger à partir de textes contenant des noms et des coordonnées : courriels, comptes rendus, notes de dossier, échanges avec des clients ou des élèves. Les formats pris en charge sont le texte brut et le Markdown, collés dans la page ou importés depuis un fichier `.txt` ou `.md`.

## Le parcours en cinq étapes

Les quatre écrans de l'application (Texte, Vérification, Résultat, Réponse du LLM) portent ces étapes : les écrans 1 à 3 pour les étapes 1 à 3, le quatrième pour les étapes 4 et 5.

1. **Coller** le texte à protéger, choisir le mode et la langue, puis lancer l'analyse.
   - **Pseudonymisation** : chaque donnée devient un repère stable (`PERSONNE_001`, `EMAIL_001`…), ce qui permet de retrouver les valeurs dans la réponse de l'assistant.
   - **Masquage** : chaque donnée est remplacée par des astérisques ; vous pouvez choisir à la place la catégorie (`[PERSONNE]`) ou la suppression. Aucune correspondance n'est gardée : les étapes 4 et 5 ne concernent que la pseudonymisation.
2. **Vérifier** les détections surlignées. Ce que Lessive a manqué peut être ajouté à la main (toutes les occurrences sont alors traitées) ; ce qui a été détecté à tort peut être retiré. Les noms qui pourraient désigner la même personne sont signalés « à vérifier ».
3. **Copier avec la consigne** : cocher « J'ai relu le résultat », puis « Copier avec la consigne pour l'IA ». La consigne demande à l'assistant de recopier les repères tels quels.
4. **Coller la réponse** de l'assistant dans le quatrième écran.
5. **Remettre les noms** : un clic remet les valeurs d'origine à la place des repères. Les repères inconnus, que l'assistant aurait inventés ou déformés au-delà de ce que Lessive reconnaît, sont laissés tels quels et signalés. Rien n'est remplacé sans votre action.

La table des correspondances (qui est `PERSONNE_001` ?) ne vit qu'en mémoire : recharger la page l'efface. Pour la conserver, un export chiffré par phrase de passe est proposé ; sans cette phrase, le fichier est inutilisable et personne ne peut la retrouver pour vous.

## Ce que Lessive ne fait pas

- Il ne **garantit pas l'anonymat**. Il ne traite pas l'identification indirecte (une fonction rare, un lieu et une date combinés).
- Il peut **manquer des noms** (noms en minuscules, prénoms rares, homonymes de mots courants) et en **signaler à tort**. L'ajout manuel existe pour cela.
- Il ne lit ni PDF, ni DOCX, ni tableurs, et ne traite pas encore les adresses postales complètes.
- Il n'est pas validé pour des données de santé ou des secrets professionnels : c'est à vous de juger du risque.

La liste complète, en langage simple : **[docs/limites.md](docs/limites.md)**.

## Confidentialité

Le traitement a lieu dans votre navigateur ; l'application ne se connecte qu'à son propre site pour charger ses fichiers, et une politique de sécurité du navigateur (CSP) interdit toute autre connexion. Le texte original et la table des correspondances ne sont écrits ni dans le stockage du navigateur, ni dans des journaux. Détails : **[docs/confidentialite.md](docs/confidentialite.md)** et, pour les chercheurs en sécurité, [SECURITY.md](SECURITY.md).

## Version en ligne

Lessive est publié sur **https://nbocquet.github.io/lessive/** (GitHub Pages). Tout s'exécute dans votre navigateur ; la page fonctionne ensuite hors ligne. La version en ligne propose un modèle de reconnaissance des noms prêt à l'emploi (bouton « Installer le modèle fourni », environ 114 Mo, téléchargé une fois depuis le site puis conservé dans le navigateur) : [`camembert-ner`](https://huggingface.co/Jean-Baptiste/camembert-ner), sous licence MIT, surtout performant en français. GitHub, qui héberge la page, voit l'adresse IP des visiteurs et les fichiers demandés, jamais votre texte (voir [docs/confidentialite.md](docs/confidentialite.md)).

## Installation et lancement local

Prérequis : [Node.js](https://nodejs.org/) 22 ou plus récent.

```bash
# 1. Installer les dépendances.
#    ONNXRUNTIME_NODE_INSTALL=skip évite le téléchargement de binaires inutiles au navigateur.
ONNXRUNTIME_NODE_INSTALL=skip npm ci

# 2. Lancer l'application en développement (adresse affichée dans le terminal).
npm run dev

# 3. Produire le site statique dans dist/.
npm run build

# 4. L'essayer tel qu'il sera servi.
npm run preview
```

`dist/` est un site statique : tout serveur de fichiers convient, à condition de servir les fichiers `.wasm` avec le type `application/wasm`. Le site fonctionne sans serveur de traitement.

### Le modèle de reconnaissance des noms (NER)

Les règles (courriels, IBAN, AVS, téléphones, dates, prénoms courants…) fonctionnent seules. Pour mieux repérer les noms de personnes, de lieux et d'organisations, Lessive utilise un petit modèle d'apprentissage automatique qui s'exécute localement. **Le dépôt ne contient aucun modèle.** La version en ligne fournit `Xenova/camembert-ner` ; pour une installation locale, vous le téléchargez vous-même une fois, puis vous le chargez dans Lessive.

Pour produire un site qui fournit le modèle, comme la version en ligne (téléchargement et vérification des sommes SHA-256, voir [docs/adr/0004-modele-fourni-pages.md](docs/adr/0004-modele-fourni-pages.md)) :

```bash
node scripts/fetch-bundled-model.ts models/Xenova/camembert-ner
LESSIVE_BUNDLED_MODEL=models/Xenova/camembert-ner npm run build
```

| Modèle | Usage | Taille |
|---|---|---|
| `Xenova/distilbert-base-multilingual-cased-ner-hrl` | **Recommandé** : français, anglais et autres langues | environ 138 Mo |
| `Xenova/camembert-ner` | Alternative, **français seulement** | environ 114 Mo |

Fichiers nécessaires : `config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json` et `onnx/model_quantized.onnx`. Avec l'outil `hf` (`pip install -U "huggingface_hub[cli]"`) ; l'option `--include` se répète, une fois par fichier :

```bash
hf download Xenova/distilbert-base-multilingual-cased-ner-hrl \
  --local-dir models/Xenova/distilbert-base-multilingual-cased-ner-hrl \
  --include "config.json" --include "tokenizer.json" --include "tokenizer_config.json" \
  --include "special_tokens_map.json" --include "onnx/model_quantized.onnx"
```

Les fichiers peuvent aussi être téléchargés à la main depuis la page du modèle sur Hugging Face.

- **Utilisation** : dans l'application, ouvrez Réglages, puis « Charger le modèle depuis mon ordinateur » et sélectionnez le dossier du modèle. L'application le garde ensuite dans le cache du navigateur : une seule sélection suffit, tant que ce cache n'est pas vidé.
- **En développement**, un modèle placé dans `models/` (dossier non versionné, voir [models/README.md](models/README.md)) est servi automatiquement (bouton « Utiliser le modèle de développement »).
- **Licence** : seul `camembert-ner` (MIT) est redistribué, par la version en ligne. Tout autre modèle reste soumis à sa propre licence (AFL-3.0 pour le modèle DistilBERT d'origine), que vous acceptez en le téléchargeant. Les réserves sur les licences sont consignées dans [docs/adr/0001-modele-ner.md](docs/adr/0001-modele-ner.md) ; la décision de ne pas livrer le modèle est dans [docs/adr/0003-modele-charge-par-l-utilisateur.md](docs/adr/0003-modele-charge-par-l-utilisateur.md).
- Sans modèle, Lessive fonctionne avec les règles seules et le dit clairement : les noms de personnes, de lieux et d'organisations risquent de manquer bien plus souvent (voir [docs/limites.md](docs/limites.md)).

## Pour les développeurs

```bash
npm test            # tests unitaires
npm run lint        # ESLint et Prettier
npm run typecheck   # TypeScript et Svelte
npm run test:e2e    # tests de confidentialité dans Chrome (voir docs/confidentialite.md)
```

- [ARCHITECTURE.md](ARCHITECTURE.md) : comment le moteur est organisé.
- [CONTRIBUTING.md](CONTRIBUTING.md) : règles et conventions de contribution.
- [docs/creer-un-pack.md](docs/creer-un-pack.md) : ajouter un pays ou une règle.
- [docs/performances.md](docs/performances.md) : mesures de performance.
- [docs/evaluation-ner.md](docs/evaluation-ner.md) : qualité de la détection des noms.
- [SECURITY.md](SECURITY.md) : modèle de menace et signalement d'une vulnérabilité.
- `CLAUDE.md`, `PLAN.md` et `SPECIFICATIONS.md` : règles du projet, plan de construction et cahier des charges.

## État du projet

**MVP en cours de construction.** Le moteur de détection, les packs Suisse et France, la transformation, la table des correspondances, la réidentification, l'export chiffré et l'interface du parcours ci-dessus existent, ainsi que le fonctionnement hors ligne après le premier chargement et des tests de confidentialité dans Chrome. Les mesures de performance dans un navigateur, la publication et la recette sur un cas réel ne sont pas faites. Le format des jetons (`PERSONNE_001`) est celui par défaut ; sa fiabilité de recopie par les assistants n'a pas encore été mesurée (voir [docs/adr/0002-format-jetons.md](docs/adr/0002-format-jetons.md)). Ne vous fiez pas à Lessive pour des données réellement sensibles avant la recette.

## Licence et attributions

Apache 2.0, voir [LICENSE](LICENSE). Les listes de prénoms et de noms de famille viennent de l'Insee et de l'Office fédéral de la statistique, l'architecture s'inspire de Presidio (MIT), sans en reprendre de fichier : sources et conditions dans [NOTICE](NOTICE).
