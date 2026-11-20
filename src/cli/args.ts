/** Interface du CLI : validation terminée avant toute lecture du texte. */
export interface CliArgs {
  input?: string;
  output?: string;
  maskDates: boolean;
  ner?: string;
  language: "fr" | "en" | "all";
  help: boolean;
  version: boolean;
}

export class ArgumentError extends Error {
  constructor() {
    super("Arguments invalides. Consultez lessive --help.");
    this.name = "ArgumentError";
  }
}

export const HELP = `Usage : lessive [fichier|-] [options]

Masque les données détectées dans un texte UTF-8 local, ligne par ligne.
Sans fichier, lit l'entrée standard. Sans --output, écrit sur stdout.

Options :
  -o, --output <fichier>       Nouveau fichier de sortie (refus d'écraser)
  --mask-dates                Masquer aussi les dates (conservées par défaut)
  --ner <dossier>              Modèle NER local, CPU, poids q8
  --language fr|en|all         Langue des règles (défaut : all)
  --help                      Afficher cette aide
  --version                   Afficher la version du moteur

Exemples :
  lessive app.log -o app.masque.log
  cat app.log | lessive --mask-dates > app.masque.log
  lessive app.log --ner ./models/Xenova/camembert-ner
  lessive - --language en

Limites : chaque ligne est analysée indépendamment, sans contexte entre lignes.
Maximum : 200 000 unités UTF-16 par ligne. Les séparateurs LF/CRLF sont conservés.
Sans NER, des noms peuvent rester en clair. Le masquage ne garantit pas l'anonymat.
JSON/JSONL est traité comme du texte : sa validité en sortie n'est pas garantie.
Contrôlez le code de sortie : stdout peut contenir un résultat partiel en cas d'erreur.
Préférez --output pour ne publier le fichier final qu'après succès.
Une coupure brutale peut laisser un temporaire contenant le résultat transformé.
Codes de sortie : 0 succès ; 1 traitement ; 2 arguments ; 130 interruption.
`;

export function parseArgs(argv: readonly string[]): CliArgs {
  const result: CliArgs = { maskDates: false, language: "all", help: false, version: false };
  let positional = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!positional && arg === "--") {
      positional = true;
      continue;
    }
    if (
      !positional &&
      (arg === "-o" || arg === "--output" || arg === "--ner" || arg === "--language")
    ) {
      const value = argv[++i];
      if (!value || value.startsWith("-")) throw new ArgumentError();
      if (arg === "--language") {
        if (value !== "fr" && value !== "en" && value !== "all") throw new ArgumentError();
        result.language = value;
      } else if (arg === "--ner") {
        result.ner = value;
      } else {
        result.output = value;
      }
    } else if (!positional && arg === "--mask-dates") {
      result.maskDates = true;
    } else if (!positional && arg === "--help") {
      result.help = true;
    } else if (!positional && arg === "--version") {
      result.version = true;
    } else {
      if (
        (!positional && arg.startsWith("-") && arg !== "-") ||
        result.input !== undefined ||
        !arg
      ) {
        throw new ArgumentError();
      }
      result.input = arg;
    }
  }
  return result;
}
