/**
 * Point d'injection du moteur NER (T5.1).
 *
 * Le worker d'analyse appelle `loadNerEngine` uniquement quand la requête porte
 * `ner: true`. Cette version n'a pas de moteur : elle renvoie `undefined`, et
 * l'analyse continue avec les seules règles, en ajoutant un avertissement.
 *
 * À remplacer à l'intégration du NER (hors T5.1) : importer dynamiquement
 * l'implémentation de `src/ner`, appeler `engine.load(onProgress)` (R4 : modèles
 * locaux uniquement) et renvoyer le moteur prêt. Le worker le met en cache.
 */
import type { NerEngine } from "../core/index.ts";

export type NerProvider = (
  onProgress: (progress: number) => void,
) => Promise<NerEngine | undefined>;

export const loadNerEngine: NerProvider = async () => undefined;
