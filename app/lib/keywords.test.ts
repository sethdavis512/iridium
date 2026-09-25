import { describe, expect, it } from 'vitest';
import { countKeywordMatches, extractKeywords } from './keywords';

describe('extractKeywords', () => {
    it('drops stop words, short tokens, and punctuation', () => {
        expect(
            extractKeywords('What was that taco recipe I saved, again?'),
        ).toEqual(['taco', 'recipe', 'saved']);
    });

    it('returns nothing for a message of only stop words', () => {
        expect(extractKeywords("Can you tell me what's up with that?")).toEqual(
            [],
        );
        expect(extractKeywords('   ')).toEqual([]);
    });

    it('lowercases, deduplicates, and stems plurals to a shared prefix', () => {
        expect(
            extractKeywords('Recipes, recipe, GROCERIES, boxes, classes'),
        ).toEqual(['recipe', 'grocer', 'box', 'class']);
    });

    it('keeps short words that stemming would shrink too far', () => {
        expect(extractKeywords('gas bus lies')).toEqual(['gas', 'bus', 'lies']);
    });

    it('keeps letters and digits from any script', () => {
        expect(extractKeywords('café 2026 über')).toEqual([
            'café',
            '2026',
            'über',
        ]);
    });

    it('caps the count, keeping the longest words in message order', () => {
        expect(
            extractKeywords('alpha bravo charlie delta echo foxtrot', 3),
        ).toEqual(['alpha', 'charlie', 'foxtrot']);
    });
});

describe('countKeywordMatches', () => {
    it('counts distinct keywords found at the start of a word', () => {
        expect(
            countKeywordMatches('Weeknight Tacos: al pastor recipes', [
                'taco',
                'recipe',
                'pizza',
            ]),
        ).toBe(2);
    });

    it('ignores matches inside a word', () => {
        expect(countKeywordMatches('Start the party', ['art'])).toBe(0);
    });
});
