/** Most keywords taken from one message; keeps the search query bounded. */
export const MAX_KEYWORDS = 8;

const MIN_KEYWORD_LENGTH = 3;

/**
 * Common English words and chat filler that carry no topic. Apostrophes are
 * stripped before lookup, so contractions appear here without them.
 */
const STOP_WORDS = new Set(
    `
    about above after again against all also and any are arent because been
    before being below between both but can cant could couldnt did didnt does
    doesnt doing dont down during each few for from further get gets got had
    hadnt has hasnt have havent having hello her here hers herself hey him
    himself his how into isnt its itself ive just know lets like make more most
    much must mustnt myself need nor not now off once only other ought our ours
    ourselves out over own please really said same say says she shant shes
    should shouldnt show some such tell than thank thanks that thats the their
    theirs them themselves then there theres these they theyd theyll theyre
    theyve this those through too under until very want was wasnt were werent
    what whats when where which while who whom whos why will with wont would
    wouldnt yes you youd youll your youre yours yourself yourselves youve
    `
        .split(/\s+/)
        .filter(Boolean),
);

/**
 * Reduce a plural to a prefix of its singular ("recipes" -> "recipe",
 * "groceries" -> "grocer", "boxes" -> "box"), so prefix matching finds both
 * forms. The result is always a prefix of the input word.
 */
function stem(word: string): string {
    const candidates: Array<[RegExp, string]> = [
        [/sses$/, 'ss'],
        [/(x|z|ch|sh)es$/, '$1'],
        [/ies$/, ''],
        [/([^su])s$/, '$1'],
    ];

    for (const [pattern, replacement] of candidates) {
        if (!pattern.test(word)) continue;
        const stemmed = word.replace(pattern, replacement);
        return stemmed.length >= MIN_KEYWORD_LENGTH ? stemmed : word;
    }

    return word;
}

/**
 * The topic words of a message: lowercased, stop words and short tokens
 * dropped, plurals stemmed, deduplicated. When there are more than `max`,
 * the longest are kept (longer words tend to be more specific), in the order
 * they appear.
 */
export function extractKeywords(text: string, max = MAX_KEYWORDS): string[] {
    const words = text
        .toLowerCase()
        .replace(/['’]/g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(
            (word) =>
                word.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(word),
        );

    const keywords = [...new Set(words.map(stem))];
    if (keywords.length <= max) return keywords;

    const kept = new Set(
        [...keywords].sort((a, b) => b.length - a.length).slice(0, max),
    );

    return keywords.filter((keyword) => kept.has(keyword));
}

/**
 * How many distinct keywords occur in `text` at the start of a word
 * (case-insensitive), so "recipe" matches "Recipes" but "art" does not match
 * "start". Keywords must come from extractKeywords (letters and digits only).
 */
export function countKeywordMatches(text: string, keywords: string[]): number {
    return keywords.filter((keyword) =>
        new RegExp(`(?<![\\p{L}\\p{N}])${keyword}`, 'iu').test(text),
    ).length;
}
