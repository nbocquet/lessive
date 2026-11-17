# Confidentialité : ce qui est vérifié, comment, et jusqu'où

Lessive promet que le texte saisi et la table de correspondance ne quittent pas le navigateur (R1) et ne sont écrits dans aucun stockage persistant (R5). Ce document dit ce que les tests automatiques vérifient réellement, et ce qu'ils ne peuvent pas vérifier.

## Ce qui est vérifié automatiquement

Commande : `npm run test:e2e` (construit l'application, puis exécute `tests/e2e/*.test.ts` avec le lanceur de tests de Node). Chrome ou Chromium headless est piloté directement par le protocole DevTools (WebSocket natif de Node 22), sans bibliothèque. L'application est servie par un petit serveur statique Node (404 pour les fichiers absents) depuis `dist/`.

| Garantie | Comment c'est vérifié | Fichier |
|---|---|---|
| Aucune requête vers une autre origine (AC-01) | Toutes les requêtes de la page, du worker d'analyse et du service worker sont interceptées (domaine `Fetch`, rattachement automatique aux workers). Une requête hors de l'origine locale est bloquée et fait échouer le test. Le test vérifie aussi que le worker et le service worker ont bien été observés. | `privacy.test.ts` |
| Parcours complet par l'interface | Texte synthétique (nom inventé, courriel, IBAN, numéro AVS) saisi, analysé, vérifié, validé ; les valeurs ont disparu du texte transformé et des pseudonymes sont présents ; une réponse simulée de LLM est collée ; la réidentification restitue les valeurs. L'interface est pilotée par ses rôles ARIA, libellés et textes, sans attribut de test. | `privacy.test.ts` |
| Parcours avec reconnaissance des noms | Le dossier du modèle est donné au sélecteur de dossier (`DOM.setFileInputFiles`), puis le même parcours est déroulé. Sauté, avec la raison affichée, si aucun modèle n'est sur disque. | `privacy.test.ts` |
| Rien d'écrit dans les stockages (AC-11, R5) | Après le parcours, `localStorage`, `sessionStorage`, les bases IndexedDB et le contenu de tous les caches (y compris `lessive-models-*`, URL et corps des réponses) sont parcourus : aucun fragment du texte d'entrée ne doit s'y trouver ; `localStorage`, `sessionStorage` et IndexedDB doivent être vides. Les caches ne contiennent que des fichiers de `dist/`. | `privacy.test.ts` |
| Rechargement = session vide | Après rechargement, le champ de saisie est vide, aucun fragment n'est affiché, les étapes « Vérification » et « Résultat » sont inaccessibles. | `privacy.test.ts` |
| CSP réellement appliquée | Un `fetch` vers `https://example.com` depuis la page est refusé, la violation `connect-src` est signalée par le navigateur lui-même, et aucune requête n'est partie (l'interception ne voit rien). Idem pour une image (`img-src`). | `privacy.test.ts` |
| Modèle fourni (version en ligne) | Le modèle est ajouté à `dist/` comme au build de publication. Avant le clic sur « Installer le modèle fourni », seule la fiche `models/bundled/bundle.json` est demandée ; après, le modèle vient de l'origine locale, le parcours NER pseudonymise le nom, et aucun fragment du texte n'est trouvé dans les stockages. Sauté sans `Xenova/camembert-ner` sur disque ; exécuté par le workflow de publication. | `bundled-model.test.ts` |
| Fonctionnement hors ligne | Après un premier chargement, le réseau est coupé (émulation DevTools, serveur arrêté), la page est rechargée et une nouvelle analyse par règles puis une réidentification réussissent. | `offline.test.ts` |
| Le service worker reste dans son périmètre | Il ne met en cache que les fichiers de l'application (liste générée au build) ; il supprime ses anciens caches (`lessive-app-*`, `lessive-data-*`) mais jamais `lessive-models-*` ni un cache étranger. | `offline.test.ts` |

Contrôles complémentaires hors e2e : la CSP de `index.html` est vérifiée par les tests unitaires de conventions ; les frontières d'import (`src/core` sans DOM ni Node) par ESLint.

### Choix de conception du test

- Les valeurs recherchées sont synthétiques. Le nom est inventé et absent des dictionnaires : un patronyme courant (par exemple « Dupont ») figure légitimement dans le bundle de l'application, ce qui fausserait la recherche dans le cache.
- La recherche porte sur le texte brut des corps de réponse (décodage octet par octet) : elle voit une valeur écrite en clair dans un cache, pas une valeur chiffrée ou encodée autrement.
- Sans Chrome, les tests sont sautés avec un message explicite (ce n'est pas un succès : la garantie n'est alors pas vérifiée). Variable `CHROME_PATH` pour désigner un navigateur ; sur macOS : `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

## Limites : ce que ces tests ne garantissent pas

- **Extensions du navigateur.** Une extension peut lire la page, le presse-papiers et les champs de saisie, et envoyer leur contenu où elle veut. La CSP ne s'applique pas à elle. Les tests tournent avec les extensions désactivées. Recommandation : fenêtre de navigation privée sans extension, ou profil dédié.
- **Poste compromis.** Logiciel malveillant, enregistreur de frappe, capture d'écran, administrateur du poste, historique du presse-papiers du système : hors de portée. Le texte transformé que l'utilisateur copie quitte de toute façon Lessive, et le presse-papiers peut être lu par d'autres applications.
- **Hébergeur malveillant ou compromis.** La CSP et les tests prouvent que *le code livré par le build vérifié* ne fait pas de requête. Un hébergeur qui servirait un autre code (ou modifierait `index.html`, donc la CSP, ou le service worker) n'est pas arrêté par ces tests. Parades : auto-hébergement, vérification de l'empreinte des fichiers de `dist/`, build reproductible depuis les sources. Un service worker déjà installé sert d'abord le code en cache : il est mis à jour par le réseau seulement pour `index.html`, ce qui oblige à faire confiance à l'origine à chaque mise à jour.
- **Réseau hors de la page.** Les tests observent ce que le navigateur envoie pour l'application ; ils ne voient pas le trafic de fond du navigateur lui-même (synchronisation, mise à jour, « Safe Browsing »), désactivé dans le profil de test.
- **Fichiers que l'utilisateur choisit d'enregistrer.** Le texte exporté ou la table chiffrée exportés à la demande de l'utilisateur sont hors périmètre de R5 (export chiffré demandé).
- **Mémoire du navigateur.** Pendant la session, le texte est en mémoire vive. Il disparaît au rechargement ou à la fermeture de l'onglet, mais Lessive ne peut pas effacer la mémoire libérée, ni empêcher un fichier d'échange ou une mise en veille prolongée de la conserver côté système.
- **Version testée seulement.** Les tests portent sur un parcours (règles, avec ou sans NER) et sur Chrome. Firefox et Safari ne sont pas pilotés ; ils appliquent la même CSP mais n'ont pas été vérifiés.
- **Version en ligne (GitHub Pages).** L'hébergeur voit, comme pour tout site, l'adresse IP du visiteur, son navigateur et les fichiers demandés (dont le modèle, s'il l'installe), et les journalise selon sa propre politique de confidentialité. Il ne voit jamais le texte saisi, qui ne quitte pas le navigateur. Lessive n'ajoute ni cookie, ni mesure d'audience. Pour éviter même ces journaux : auto-hébergement ou installation locale.
- **Modèle NER.** Le modèle est installé depuis le site (version en ligne) ou chargé par l'utilisateur depuis son disque, et conservé dans le cache `lessive-models-v1`, écrit par l'application : il ne contient que les poids du modèle, jamais de texte. Le test le vérifie sur le parcours NER, pas sur d'autres modèles que l'utilisateur pourrait charger.
