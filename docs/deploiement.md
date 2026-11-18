# Déployer Lessive et gérer le modèle NER

Lessive est un site statique : une fois construit, `dist/` se sert avec n'importe quel serveur de fichiers, sans serveur de traitement. Ce guide couvre l'auto-hébergement, le modèle de reconnaissance des noms et la publication sur GitHub Pages.

## 1. Construire le site

Prérequis : [Node.js](https://nodejs.org/) 22 ou plus récent.

```bash
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run build          # produit dist/
npm run preview        # sert dist/ en local pour vérifier
```

Le build par défaut ne contient **aucun modèle** : les règles fonctionnent seules, et l'utilisateur peut charger un modèle depuis son disque (section 3).

## 2. Héberger `dist/`

Conditions côté serveur :

- servir les fichiers `.wasm` avec le type `application/wasm` (ONNX Runtime Web) ;
- servir le site en HTTPS (ou sur `localhost`) : le service worker et WebCrypto l'exigent ;
- ne pas réécrire `index.html` : il porte la politique de sécurité (CSP) en balise `<meta>`. Un serveur peut la doubler par un en-tête `Content-Security-Policy` identique, jamais l'élargir ;
- le site fonctionne dans un sous-dossier (chemins relatifs), comme `https://exemple.org/lessive/`.

Exemple minimal avec nginx :

```nginx
location /lessive/ {
    alias /srv/lessive/dist/;
    types { application/wasm wasm; }
    add_header X-Content-Type-Options nosniff;
}
```

Pour vérifier une installation : ouvrez les outils de développement du navigateur, onglet Réseau, faites une analyse et une réidentification ; aucune requête ne doit partir vers un autre domaine.

### Référencement et partage

Les métadonnées de recherche, de partage et les données structurées sont dans `src/web/index.html` ; la page contient une courte présentation lisible sans exécuter l'application. L'aperçu de partage est `src/web/public/social-preview.png` (1200 × 630), sa source vectorielle `scripts/assets/social-preview.svg`. L'URL de référence est `https://nbocquet.github.io/lessive/` : pour une autre installation publique, adaptez ensemble les URL de `index.html` et de `src/web/public/sitemap.xml` avant le build.

## 3. Le modèle de reconnaissance des noms (NER)

Les règles (courriels, IBAN, AVS, téléphones, dates, adresses, prénoms courants…) fonctionnent sans modèle. Le modèle améliore nettement la détection des noms de personnes, de lieux et d'organisations (voir [evaluation-ner.md](evaluation-ner.md)). Il s'exécute localement, en WebAssembly, et n'est jamais versionné dans le dépôt.

| Modèle | Langues | Taille | Licence |
|---|---|---|---|
| `Xenova/camembert-ner` | français (anglais plus faible) | environ 114 Mo | MIT : **fourni par la version en ligne** |
| `Xenova/distilbert-base-multilingual-cased-ner-hrl` | français, anglais et autres | environ 138 Mo | AFL-3.0 : à charger soi-même |

Le choix est expliqué dans les [ADR 0001](adr/0001-modele-ner.md) et [0004](adr/0004-modele-fourni-pages.md).

### Option A : fournir le modèle avec le site

C'est ce que fait la version en ligne. Le modèle est téléchargé au build, vérifié par ses sommes SHA-256 (`scripts/bundled-model/camembert-ner.json`), puis copié dans `dist/models/bundled/` avec sa licence :

```bash
node scripts/fetch-bundled-model.ts models/Xenova/camembert-ner
LESSIVE_BUNDLED_MODEL=models/Xenova/camembert-ner npm run build
```

L'application propose alors « Installer le modèle fourni ». Rien n'est téléchargé avant ce clic, hormis une fiche de moins d'un kilo-octet ; le modèle est ensuite conservé dans le cache du navigateur et fonctionne hors ligne. En redistribuant le modèle, vous acceptez ses conditions (MIT : conserver la mention de copyright et le texte de la licence, servis avec lui).

### Option B : l'utilisateur charge son modèle

Téléchargez les fichiers `config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json` et `onnx/model_quantized.onnx`, par exemple avec l'outil `hf` (`pip install -U "huggingface_hub[cli]"`) :

```bash
hf download Xenova/distilbert-base-multilingual-cased-ner-hrl \
  --local-dir models/Xenova/distilbert-base-multilingual-cased-ner-hrl \
  --include "config.json" --include "tokenizer.json" --include "tokenizer_config.json" \
  --include "special_tokens_map.json" --include "onnx/model_quantized.onnx"
```

Puis, dans l'application : Réglages, « Charger le modèle depuis mon ordinateur », et sélectionnez le dossier. Le modèle est validé, puis gardé dans le cache du navigateur : une seule sélection suffit tant que ce cache n'est pas vidé. Le modèle reste soumis à sa propre licence, que l'utilisateur accepte en le téléchargeant.

En développement, un modèle placé dans `models/` est servi par Vite et proposé par le bouton « Utiliser le modèle de développement » (voir [models/README.md](../models/README.md)).

## 4. Publication sur GitHub Pages

Le workflow `.github/workflows/pages.yml` publie la branche `main` à chaque poussée : lint, vérification des types, tests unitaires, téléchargement et vérification du modèle, tests de bout en bout dans Chrome (dont l'installation du modèle fourni), build avec le modèle, puis déploiement. Une somme SHA-256 différente fait échouer la publication.

Pour un fork : dans Settings → Pages, choisissez la source **GitHub Actions**, puis adaptez les URL de référence (section 2).

Quotas indicatifs de GitHub Pages : site de 1 Go au plus, environ 100 Go de bande passante par mois, soit de l'ordre de 800 premières installations du modèle par mois ; le cache du navigateur évite les retéléchargements.

## 5. Confidentialité d'une installation publique

L'hébergeur voit, comme pour tout site, l'adresse IP des visiteurs, leur navigateur et les fichiers demandés (dont le modèle, s'il est installé). Il ne voit jamais le texte. Lessive n'ajoute ni cookie ni mesure d'audience. Pour une organisation, un hébergement interne évite même ces journaux. Voir [confidentialite.md](confidentialite.md).
