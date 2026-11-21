/** Choix de nettoyage de l’interface ; les types et formats publics du moteur restent inchangés. */
import type { Detection, EntityType } from "../core/index.ts";
import { isAddressPart } from "../core/analyzer/merge-addresses.ts";

export const CLEANING_CATEGORIES = [
  { id: "identity", label: "Identité", help: "Noms de personnes et identifiants dérivés" },
  { id: "dates", label: "Dates", help: "Dates et plages de dates reconnues" },
  {
    id: "addresses",
    label: "Adresses postales",
    help: "Rues, cases postales, codes postaux et localités associés",
  },
  { id: "places", label: "Lieux", help: "Villes et autres lieux cités seuls" },
  { id: "emails", label: "Courriels", help: "Adresses e-mail" },
  { id: "phones", label: "Téléphones", help: "Numéros de téléphone" },
  { id: "organizations", label: "Organisations", help: "Sociétés et organismes" },
  { id: "web", label: "Adresses web", help: "Liens et URL" },
  { id: "ip", label: "Adresses IP", help: "IPv4 et IPv6" },
  { id: "banking", label: "Données bancaires", help: "IBAN et cartes bancaires" },
  {
    id: "administrative",
    label: "Identifiants administratifs",
    help: "AVS, IDE, sécurité sociale, SIREN et SIRET",
  },
  { id: "secrets", label: "Secrets techniques", help: "Clés, mots de passe et jetons reconnus" },
] as const;

export type CleaningCategory = (typeof CLEANING_CATEGORIES)[number]["id"];
export const ALL_CLEANING_CATEGORIES: readonly CleaningCategory[] = CLEANING_CATEGORIES.map(
  (c) => c.id,
);

const CATEGORY_BY_TYPE: Readonly<Record<EntityType, CleaningCategory>> = {
  PERSON: "identity",
  DATE: "dates",
  LOCATION: "places",
  EMAIL: "emails",
  PHONE: "phones",
  ORGANIZATION: "organizations",
  URL: "web",
  IP_ADDRESS: "ip",
  IBAN: "banking",
  CREDIT_CARD: "banking",
  CH_AVS: "administrative",
  CH_UID: "administrative",
  FR_NIR: "administrative",
  FR_SIREN: "administrative",
  FR_SIRET: "administrative",
  SECRET: "secrets",
};

function isPostalAddress(d: Detection): boolean {
  return (
    d.entityType === "LOCATION" && (d.recognizerId === "core/address-merge" || isAddressPart(d))
  );
}

/**
 * Filtre après résolution des conflits : une adresse entière ou un courriel n’est jamais
 * découpé pour conserver des fragments d’une autre catégorie. Si le NER a gagné sur une règle
 * d’adresse, celle-ci sert encore à reconnaître la nature postale de l’intervalle retenu.
 * Les choix manuels par occurrence priment ; les opérateurs globaux ne réactivent pas une catégorie.
 */
export function selectCleaningDetections(
  detections: readonly Detection[],
  discarded: readonly Detection[],
  selected: readonly CleaningCategory[],
  manuallyCorrectedIds: Iterable<string>,
): Detection[] {
  if (ALL_CLEANING_CATEGORIES.every((c) => selected.includes(c))) return [...detections];
  const manual = new Set(manuallyCorrectedIds);
  const addresses = [...detections, ...discarded]
    .filter(isPostalAddress)
    .sort((a, b) => a.start - b.start);
  const maxEnds: number[] = [];
  addresses.forEach((a, i) => maxEnds.push(Math.max(a.end, maxEnds[i - 1] ?? 0)));
  const overlapsAddress = (d: Detection): boolean => {
    let lo = 0;
    let hi = addresses.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (addresses[mid]!.start < d.end) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && maxEnds[lo - 1]! > d.start;
  };
  return detections.filter((d) => {
    if (d.source === "manual" || manual.has(d.id)) return true;
    const postal = d.entityType === "LOCATION" && (isPostalAddress(d) || overlapsAddress(d));
    return selected.includes(postal ? "addresses" : CATEGORY_BY_TYPE[d.entityType]);
  });
}
