/**
 * Confirmation en ligne (nouvelle session, remplacement à l'import) : ce n'est pas une boîte
 * modale, mais le focus doit y aller quand elle apparaît, sinon un utilisateur au clavier ou au
 * lecteur d'écran ne sait pas qu'une question l'attend. Échap annule, comme dans une boîte native.
 *
 * Attachement Svelte 5 : `<div tabindex="-1" {@attach confirmFocus(cancel)}>`.
 */
export function confirmFocus(onCancel: () => void): (node: HTMLElement) => () => void {
  return (node) => {
    node.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  };
}
