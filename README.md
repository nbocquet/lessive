<p align="center"><img src="src/web/public/lessive-mark.svg" alt="" width="72" height="72"></p>

<h1 align="center">Lessive</h1>

<p align="center">
  <strong>Pseudonymiser un texte dans le navigateur avant de le confier à un assistant IA, puis remettre les vrais noms dans la réponse.</strong><br>
  <em>Pseudonymise text in your browser before pasting it into an AI assistant, then restore the real names in the answer.</em>
</p>

<p align="center">
  <a href="https://nbocquet.github.io/lessive/"><strong>Essayer / Try it</strong></a> ·
  <a href="#français">Français</a> ·
  <a href="#english">English</a>
</p>

<p align="center">
  <a href="https://github.com/nbocquet/lessive/actions/workflows/ci.yml"><img src="https://github.com/nbocquet/lessive/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/nbocquet/lessive/actions/workflows/pages.yml"><img src="https://github.com/nbocquet/lessive/actions/workflows/pages.yml/badge.svg" alt="GitHub Pages"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-Apache%202.0-blue" alt="Licence Apache 2.0"></a>
</p>

---

## English

Lessive finds personal data in a text (names, e-mail addresses, phone numbers, IBANs, Swiss AVS and French NIR numbers, postal addresses…) and replaces it with neutral tokens such as `PERSONNE_001`, **entirely in your browser**. You paste the result into ChatGPT, Claude, Gemini or any other assistant; when the assistant answers, Lessive puts the original values back, still on your computer.

- **Local processing.** The text never leaves the browser. A Content Security Policy forbids any connection other than the app's own origin; no analytics, no remote API, no LLM.
- **Rules plus a local NER model.** Validated identifiers (checksums for IBAN, AVS, NIR, SIRET…), Swiss and French formats, first-name and surname lists, and an optional named-entity recognition model (CamemBERT-NER, ~114 MB, run with ONNX Runtime Web).
- **Review before sending.** Every detection is highlighted; you can add what was missed or remove false positives.
- **Round trip.** Tokens are stable, so the assistant's answer can be re-identified; the mapping table lives only in memory, with an optional passphrase-encrypted export.
- **Works offline** after the first visit.

> **Lessive reduces risk; it does not anonymise.** A text without names can still identify someone (a rare job title, a place and a date). Always read the result before sending it.

The interface and most documentation are in French; detection targets French and English texts and Swiss and French identifiers. Quick start for developers: `ONNXRUNTIME_NODE_INSTALL=skip npm ci && npm run dev` (Node.js 22+). Licence: Apache 2.0. Security reports: see [SECURITY.md](SECURITY.md).

---

## Français

Lessive repère les données personnelles d'un texte (noms, courriels, téléphones, IBAN, numéros AVS et NIR, adresses postales…) et les remplace par des repères neutres comme `PERSONNE_001`, **directement dans votre navigateur**, avant que vous ne colliez le texte dans un assistant IA. Quand l'assistant répond, Lessive remet les vraies valeurs dans sa réponse, toujours sur votre ordinateur. Votre texte n'est envoyé à aucun serveur, Lessive n'appelle aucun assistant IA et ne mesure rien de votre usage.

> **Lessive réduit le risque, il ne garantit pas l'anonymat.** Un texte dont on a remplacé les noms peut rester reconnaissable (une fonction, un lieu et une date suffisent parfois). Relisez toujours le résultat avant de l'envoyer. Voir [les limites](docs/limites.md).

### Utiliser Lessive

**En ligne : https://nbocquet.github.io/lessive/**. Rien à installer ; la page fonctionne ensuite hors ligne. Pour mieux repérer les noms de personnes, de lieux et d'organisations, cliquez sur « Installer le modèle fourni » (environ 114 Mo, téléchargé une seule fois depuis le site, puis conservé dans le navigateur).

Le parcours :

1. **Coller** le texte (ou importer un fichier `.txt` ou `.md`), choisir le mode, lancer l'analyse.
   - **Pseudonymisation** : chaque donnée devient un repère stable (`PERSONNE_001`, `EMAIL_001`…), ce qui permet de retrouver les valeurs dans la réponse de l'assistant.
   - **Masquage** : chaque donnée est remplacée par des astérisques, sa catégorie (`[PERSONNE]`) ou rien. Aucune correspondance n'est gardée.
2. **Vérifier** les détections surlignées : ajouter ce qui manque (toutes les occurrences sont traitées), retirer ce qui est détecté à tort. Les noms qui pourraient désigner la même personne sont signalés « à vérifier ».
3. **Copier avec la consigne** : la consigne jointe demande à l'assistant de recopier les repères tels quels.
4. **Coller la réponse** de l'assistant dans Lessive.
5. **Remettre les noms** : les repères sont remplacés par les valeurs d'origine ; un repère inconnu ou déformé est signalé, jamais remplacé sans votre action.

La table des correspondances (qui est `PERSONNE_001` ?) ne vit qu'en mémoire : recharger la page l'efface. Un export chiffré par phrase de passe permet de la conserver ; sans la phrase, le fichier est inutilisable.

### Ce que Lessive détecte

| Par des règles | Avec le modèle de reconnaissance des noms |
|---|---|
| Courriels, URL, adresses IP, téléphones suisses et français | Noms de personnes, y compris rares ou étrangers |
| IBAN, cartes bancaires, AVS, IDE, NIR, SIREN, SIRET (clés de contrôle vérifiées) | Lieux |
| Dates, adresses postales (rue, code postal et localité, case postale) | Organisations |
| Prénoms et noms de famille courants (listes Insee et OFS), titres (« M. », « Dr ») | |
| Secrets techniques de forme connue (clés d'API, jetons), mots de passe annoncés | |

Il ne lit ni PDF, ni document Word, ni tableur, et ne comprend pas le sens du texte : une information sensible écrite en mots ordinaires (« en arrêt maladie ») reste en clair. La liste complète, en langage simple : **[docs/limites.md](docs/limites.md)**.

### Confidentialité

Le traitement a lieu dans votre navigateur : l'application ne se connecte qu'à son propre site pour charger ses fichiers, et la politique de sécurité du navigateur (CSP) interdit toute autre connexion. Le texte et la table des correspondances ne sont écrits ni dans le stockage du navigateur, ni dans des journaux. Des tests automatiques le vérifient dans Chrome à chaque changement. GitHub, qui héberge la version en ligne, voit l'adresse IP des visiteurs et les fichiers demandés, jamais le texte. Détails : [docs/confidentialite.md](docs/confidentialite.md) ; signaler une vulnérabilité : [SECURITY.md](SECURITY.md).

### Installer en local

Prérequis : [Node.js](https://nodejs.org/) 22 ou plus récent.

```bash
ONNXRUNTIME_NODE_INSTALL=skip npm ci   # le préfixe évite des binaires inutiles au navigateur
npm run dev                            # application en développement
npm run build                          # site statique dans dist/
npm run preview                        # le site tel qu'il sera servi
```

`dist/` est un site statique : tout serveur de fichiers convient. Pour l'héberger vous-même, avec ou sans modèle fourni, ou charger un autre modèle (par exemple DistilBERT multilingue pour l'anglais) : **[docs/deploiement.md](docs/deploiement.md)**.

### Documentation

| Pour… | Lire |
|---|---|
| Savoir ce que Lessive peut manquer | [docs/limites.md](docs/limites.md) |
| Comprendre les garanties de confidentialité et leurs tests | [docs/confidentialite.md](docs/confidentialite.md) |
| Héberger Lessive, gérer le modèle NER | [docs/deploiement.md](docs/deploiement.md) |
| Ajouter un pays ou une règle | [docs/creer-un-pack.md](docs/creer-un-pack.md) |
| Comprendre le moteur | [ARCHITECTURE.md](ARCHITECTURE.md), [docs/contrats.md](docs/contrats.md) |
| Contribuer | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Mesures de qualité et de performance | [docs/evaluation-ner.md](docs/evaluation-ner.md), [docs/performances.md](docs/performances.md) |
| Décisions d'architecture | [docs/adr/](docs/adr/) |
| Historique des versions | [CHANGELOG.md](CHANGELOG.md) |

### État du projet

Version **0.1.0**, première version publique. Le parcours complet, les packs Suisse et France, le modèle fourni, l'export chiffré et le fonctionnement hors ligne sont en place et testés. Aucune relecture de sécurité indépendante n'a encore été faite : pour des données réellement sensibles, suivez les règles de votre organisation.

### Licence et attributions

Apache 2.0, voir [LICENSE](LICENSE). Les listes de prénoms et de noms viennent de l'Insee et de l'Office fédéral de la statistique ; le modèle fourni, `camembert-ner`, est sous licence MIT ; l'architecture s'inspire de [Presidio](https://github.com/data-privacy-stack/presidio) (MIT), sans en reprendre de fichier. Sources et conditions : [NOTICE](NOTICE).
