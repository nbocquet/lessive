/**
 * Accès au navigateur pour la sortie (T5.4, réutilisé par T5.5) : presse-papiers et
 * téléchargement local. Aucune requête réseau : `Blob` + `URL.createObjectURL` (R1).
 */

/** Copie dans le presse-papiers ; renvoie `false` si l'API est absente ou refuse (contexte non sécurisé, permission). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refus du navigateur : l'appelant propose le repli par sélection.
  }
  return false;
}

/** Déclenche le téléchargement d'un fichier généré localement. */
export function downloadTextFile(
  fileName: string,
  content: string,
  mime = "text/plain;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
