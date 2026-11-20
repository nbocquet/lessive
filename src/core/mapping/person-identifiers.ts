/** Formes d’identifiants partagées par la propagation et la résolution, sans état ni valeur conservée. */
const PARTICLES: ReadonlySet<string> = new Set([
  "de",
  "du",
  "des",
  "d'",
  "l'",
  "la",
  "le",
  "les",
  "van",
  "von",
  "der",
  "den",
  "di",
  "da",
  "del",
  "della",
  "dos",
  "das",
  "el",
  "ter",
  "ten",
]);

export const isPersonNameParticle = (t: string): boolean => PARTICLES.has(t) || /^[dl]'./u.test(t);

/** Variantes du patronyme : « de la tour », « la tour » et formes sans élision. */
export function familyNameVariants(family: readonly string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < family.length; i++) {
    if (i === 0 || isPersonNameParticle(family[i] as string)) out.add(family.slice(i).join(" "));
  }
  if (family.length === 1) {
    const stripped = /^[dl]'(.{2,})$/u.exec(family[0] as string);
    if (stripped) out.add(stripped[1] as string);
  }
  return [...out].filter((v) => (v.match(/\p{L}/gu)?.length ?? 0) >= 3);
}

/** Reçoit des prénoms et des variantes de patronyme déjà normalisés (casse et accents). */
export function derivedPersonIdentifiers(
  given: readonly string[],
  variants: readonly string[],
): string[] {
  // Identifiants dérivés : il faut un nom d'au moins 3 lettres.
  const g0 = given[0];
  if (g0 === undefined || variants.length === 0) return [];
  const forms = new Set<string>();
  const initials = g0
    .split("-")
    .map((part) => part[0] ?? "")
    .join("");
  const givenVariants = new Set([g0, g0.replace(/-/gu, "")]);
  const familyCompact = new Set<string>();
  for (const v of variants) {
    const compact = v.replace(/[ ']/gu, "");
    familyCompact.add(compact);
    familyCompact.add(compact.replace(/-/gu, ""));
  }
  for (const f of familyCompact) {
    forms.add(`${initials}${f}`);
    forms.add(`${f}${initials}`);
    forms.add(`${initials}.${f}`);
    for (const g of givenVariants) {
      forms.add(`${g}.${f}`);
      forms.add(`${g}_${f}`);
      forms.add(`${g}-${f}`);
      forms.add(`${g}${f}`);
      forms.add(`${f}.${g}`);
    }
  }
  return [...forms];
}
