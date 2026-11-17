# Sécurité

Ce document s'adresse aux chercheurs en sécurité et aux relecteurs. Il décrit ce que Lessive cherche à protéger, ce qu'il ne protège pas, comment signaler une vulnérabilité, et ce qui est dans le périmètre. Le détail de ce que les tests vérifient est dans [docs/confidentialite.md](docs/confidentialite.md) ; les limites pour l'utilisateur sont dans [docs/limites.md](docs/limites.md).

Lessive est un MVP en cours de construction : aucune relecture de sécurité indépendante n'a été faite.

## Signaler une vulnérabilité

**À compléter par Nico avant toute publication : adresse ou canal de signalement.**

> Adresse de signalement : `[À COMPLÉTER : adresse électronique ou formulaire de signalement privé]`
> Délai d'accusé de réception visé : `[À COMPLÉTER]`

Tant que ce champ n'est pas rempli, ce document n'indique aucun canal : n'ouvrez pas de ticket public pour une vulnérabilité exploitable. Quand le canal existera, merci d'indiquer : la version ou le commit, le navigateur, les étapes de reproduction, l'effet obtenu, et, si possible, un texte d'essai **synthétique**. N'envoyez jamais de données personnelles réelles.

## Modèle de menace

**Objectif.** Un utilisateur colle un texte contenant des données personnelles. Lessive les remplace avant que l'utilisateur ne copie le texte dans un assistant IA, puis remet les valeurs d'origine dans la réponse, localement. Le texte original et la table de correspondance ne doivent pas quitter le navigateur de l'utilisateur, ni être écrits dans un stockage persistant, sauf export chiffré demandé.

**Ce qui est protégé, par construction et par test :**

| Propriété | Mécanisme |
|---|---|
| Aucune requête réseau à l'exécution hors de l'origine de l'application (R1) | CSP (ci-dessous) ; aucune bibliothèque de télémétrie ; fichiers WASM et packs servis par l'origine ou compris dans le bundle ; tests e2e qui bloquent et signalent toute requête hors origine |
| Aucun modèle génératif, aucune API distante (R2) | aucune dépendance de ce type ; le NER est un modèle de classification de jetons local |
| Texte et table de correspondance jamais écrits dans `localStorage`, IndexedDB, journaux, messages d'erreur ou rapports (R5) | état en mémoire seulement ; les erreurs et les réponses du worker ne citent jamais de valeur ; tests e2e qui fouillent les stockages et les caches après usage |
| Modèles chargés uniquement depuis des fichiers locaux (R4) | fichiers choisis par l'utilisateur, lus par un cache personnalisé ; `allowRemoteModels` reste faux ; une requête de repli est remplacée par un 404 local |
| Packs : données, jamais du code (R8) | schéma strict, validateurs en liste fermée |

**Ce qui n'est pas protégé :**

- **Un navigateur ou un poste compromis** : extensions malveillantes, logiciel espion, enregistreur de frappe, capture d'écran. La CSP ne s'applique pas aux extensions. Le presse-papiers est lisible par d'autres applications.
- **Un hébergeur compromis ou malveillant.** Les tests prouvent que le code du build vérifié ne fait pas de requête ; un hébergeur qui servirait un autre code (y compris une autre CSP ou un autre service worker) n'est pas arrêté. Parades : auto-hébergement, vérification des empreintes des fichiers de `dist/`, build depuis les sources. Un service worker déjà installé sert d'abord le code en cache.
- **L'identification indirecte.** Un texte pseudonymisé peut rester reconnaissable (fonction rare, lieu, date). Ce n'est pas une vulnérabilité mais une limite du produit : Lessive ne promet pas l'anonymat.
- **Les détections manquées.** Un nom non détecté part en clair dans le texte transformé. C'est une limite de qualité documentée ([docs/evaluation-ner.md](docs/evaluation-ner.md)), pas une faille de confidentialité au sens du moteur.
- **La mémoire du navigateur** : le texte y reste jusqu'au rechargement ; Lessive ne peut pas effacer la mémoire libérée ni empêcher un fichier d'échange de la conserver.
- **Le texte transformé copié par l'utilisateur** et le fichier chiffré exporté, une fois sortis de l'application.
- **Les navigateurs autres que Chrome** : la CSP est la même, mais le parcours n'y est pas testé automatiquement.

## Périmètre : ce qui nous intéresse

Dans le périmètre, entre autres :

1. **Toute fuite du texte original, d'une valeur détectée ou de la table de correspondance** : requête réseau (y compris par une ressource, une police, un lien, `sendBeacon`, une API de rapport), écriture dans un stockage ou un cache, journal, message d'erreur, réponse de worker.
2. **Un contournement de la CSP**, ou un affaiblissement de la CSP par un changement du dépôt.
3. **Une injection HTML ou de script** depuis le texte collé, un nom de fichier, un fichier de modèle, un fichier d'export importé ou un pack.
4. **Les packs non fiables** : un pack JSON qui échapperait au schéma, ferait exécuter du code, ou contournerait la liste fermée de validateurs (voir ci-dessous).
5. **ReDoS** : une règle des packs livrés, ou un texte, qui bloque l'analyse (voir ci-dessous).
6. **L'export chiffré** : faiblesse du format, de la dérivation de clé ou du chiffrement, malléabilité, fuite de la phrase de passe, import d'un fichier piégé.
7. **Le chargement du modèle** : lecture de fichiers hors de la sélection, exécution de code via un fichier de modèle, requête réseau déclenchée par un fichier de modèle.
8. **Le service worker** : cache d'un contenu de l'utilisateur, effacement du cache du modèle, mise à jour qui servirait un contenu inattendu.
9. **Les dépendances** : vulnérabilité connue dans Svelte, Transformers.js, ONNX Runtime Web ou Zod, dans leur version verrouillée.

Hors périmètre : les attaques exigeant un poste déjà compromis ou une extension malveillante, les limites de détection (noms manqués, faux positifs), l'identification indirecte, le déni de service par un texte de plusieurs centaines de milliers de caractères (le moteur refuse au-delà de 200 000 caractères), et les attaques sur le site d'un hébergeur tiers.

## Politique de sécurité du contenu (CSP)

Définie dans une balise `<meta http-equiv="Content-Security-Policy">` de `src/web/index.html` :

```text
default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';
style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'
```

- Aucune origine externe, aucun script en ligne, aucun `eval`. `'wasm-unsafe-eval'` n'autorise que la compilation WebAssembly d'ONNX Runtime.
- `connect-src 'self'` : les requêtes ne partent que vers l'origine de l'application. Le modèle n'est pas téléchargé : il est lu depuis le disque de l'utilisateur, donc la CSP n'a pas à être élargie.
- `style-src 'unsafe-inline'` : réservé aux balises `<style>` que Vite injecte en développement ; le build de production extrait le CSS dans un fichier et les composants n'utilisent pas d'attribut `style`. C'est un point de durcissement possible (hors développement).
- ONNX Runtime fonctionne avec un seul fil et sans URL `blob:` : la CSP n'a pas besoin de `blob:` ni de l'isolation inter-origines.
- Une balise `<meta>` ne couvre pas tout ce qu'un en-tête HTTP couvrirait (par exemple `frame-ancestors` n'y est pas pris en compte). Un hébergeur qui peut envoyer des en-têtes devrait répéter cette politique et y ajouter `frame-ancestors 'none'`.
- Les tests e2e vérifient que la CSP est réellement appliquée : un `fetch` vers un domaine externe est refusé par le navigateur lui-même.

## Packs non fiables

Les packs sont des données. Le chargement (`src/core/registry/schema.ts`, `parsePack`) applique :

- des schémas **stricts** (Zod) : tout champ inconnu est refusé ;
- aucun champ exécutable : les expressions régulières sont compilées pour vérification, jamais évaluées comme du code ;
- des **drapeaux** limités à `i`, `m`, `s`, `u` (le moteur ajoute `g`) ;
- un motif de 2 000 caractères au plus, 50 000 termes au plus par dictionnaire ;
- des **validateurs référencés par nom**, dans une liste fermée de sept ; un nom inconnu est refusé ;
- des types d'entités dans une liste fermée de seize.

Dans le MVP, seuls les packs livrés avec le dépôt sont chargés (import statique au build) : l'import de packs par l'utilisateur est reporté (A8). Le jour où il existera, un pack tiers devra être traité comme non fiable : les contrôles ci-dessus sont la base, mais la durée d'exécution de ses motifs (ReDoS) devra être bornée à l'exécution, ce qui n'est pas fait aujourd'hui.

## ReDoS

- **Packs livrés** : chaque règle motif passe, dans la suite de tests (`packs/_tools/packs.test.ts`), (a) un contrôle statique `redos-detector` sur le motif ancré et (b) un test de durée sur des entrées adverses de 20 000 caractères, sous 150 ms chacune. Les dispenses du contrôle statique sont rares, relues et justifiées dans `packs/_tools/redos-exceptions.json` (deux aujourd'hui) ; elles restent soumises au test de durée. Voir [docs/creer-un-pack.md](docs/creer-un-pack.md).
- **Texte** : l'analyse a lieu dans un worker, hors du fil principal, annulable ; si le worker ne répond pas à l'annulation, il est terminé et recréé. La taille d'entrée est limitée à 200 000 caractères.
- Le contrôle statique ne prouve pas l'absence de tout motif coûteux ; une règle livrée qui bloque sur une entrée précise est dans le périmètre.

## Export chiffré de la table de correspondance

Implémenté dans `src/core/crypto/mapping-file.ts`, avec WebCrypto uniquement :

| Paramètre | Valeur |
|---|---|
| Dérivation de clé | PBKDF2 avec SHA-256 |
| Itérations | 600 000 par défaut ; à l'import, bornées entre 100 000 et 5 000 000 |
| Chiffrement | AES-256-GCM |
| Sel | 16 octets aléatoires, tirés à chaque export |
| IV | 12 octets aléatoires, tirés à chaque export |
| Données authentifiées (AAD) | l'en-tête canonique (format, version, KDF, itérations, chiffrement) : le modifier fait échouer le déchiffrement |
| Phrase de passe | 12 caractères au moins ; jamais conservée ni citée dans une erreur ; champs vidés après chaque opération |
| Format | JSON `lessive-mapping`, version 1 ; champs inconnus refusés ; binaires en base64 |

Points à examiner : une phrase de passe courte reste vulnérable à une attaque hors ligne malgré les 600 000 itérations ; PBKDF2 est dérivable en parallèle sur GPU (Argon2 n'est pas disponible dans WebCrypto) ; les messages d'erreur à l'import ne distinguent pas finement les causes (« Phrase de passe incorrecte ou fichier altéré. »). La durée mesurée de la dérivation est donnée dans [docs/performances.md](docs/performances.md).

## Chargement du modèle par l'utilisateur

Le modèle est un ensemble de fichiers que l'utilisateur choisit (ADR [0003](docs/adr/0003-modele-charge-par-l-utilisateur.md)). L'application valide la forme (fichiers présents, JSON valides, étiquettes d'entités, taille) mais **pas l'origine** : la confiance dans la source du modèle revient à l'utilisateur. Un fichier ONNX est un graphe de calcul exécuté par ONNX Runtime Web, pas du code exécuté par la page, et il ne modifie pas la CSP ; une vulnérabilité de l'exécuteur ONNX dans un fichier piégé reste dans le périmètre. Les fichiers sont gardés dans le cache `lessive-models-v1`, qui ne contient jamais de texte de l'utilisateur.

## Dépendances

Trois dépendances à l'exécution (R9) : Svelte, `@huggingface/transformers` (qui embarque ONNX Runtime Web) et Zod, en versions verrouillées dans `package-lock.json`. Le contrôle des licences et l'inventaire sont prévus à la publication (PLAN.md, T6.5) et ne sont pas encore automatisés.
