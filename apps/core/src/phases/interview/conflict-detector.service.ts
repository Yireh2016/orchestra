import { Injectable, Logger } from '@nestjs/common';

export interface StakeholderResponse {
  from: string;
  content: string;
  timestamp: Date;
}

export interface ConflictingStatement {
  author1: string;
  statement1: string;
  author2: string;
  statement2: string;
  reason: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingStatements: ConflictingStatement[];
}

/** @deprecated Use ConflictResult instead. Kept for backward compatibility. */
export interface Conflict {
  responseA: StakeholderResponse;
  responseB: StakeholderResponse;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

@Injectable()
export class ConflictDetectorService {
  private readonly logger = new Logger(ConflictDetectorService.name);

  /**
   * Contradiction pairs with context hints. Each entry has:
   * - termA / termB: opposing keywords
   * - contextWords: if present, at least one must appear in the sentence
   *   for the pair to be relevant (reduces false positives)
   */
  private readonly contradictionPairs: Array<{
    termA: string;
    termB: string;
    contextWords?: string[];
  }> = [
    { termA: 'must', termB: 'must not' },
    { termA: 'should', termB: 'should not' },
    { termA: 'always', termB: 'never' },
    { termA: 'required', termB: 'optional' },
    { termA: 'include', termB: 'exclude' },
    { termA: 'before', termB: 'after', contextWords: ['deploy', 'release', 'launch', 'run', 'execute', 'migration'] },
    { termA: 'increase', termB: 'decrease', contextWords: ['size', 'limit', 'timeout', 'count', 'rate', 'threshold'] },
    { termA: 'add', termB: 'remove', contextWords: ['feature', 'field', 'column', 'endpoint', 'dependency'] },
    { termA: 'enable', termB: 'disable' },
    { termA: 'allow', termB: 'block' },
    { termA: 'allow', termB: 'deny' },
    { termA: 'public', termB: 'private' },
    { termA: 'sync', termB: 'async', contextWords: ['process', 'call', 'operation', 'request'] },
    { termA: 'manual', termB: 'automatic' },
    { termA: 'simple', termB: 'complex', contextWords: ['approach', 'solution', 'implementation'] },
  ];

  /**
   * Numeric contradiction patterns: detect when two authors specify
   * different numeric values for the same subject.
   */
  private readonly numericPattern =
    /(?:(?:set|use|limit|timeout|max|min|size|count|threshold|rate)\s+(?:to|of|at|=)\s*)(\d+)/gi;

  async detectConflicts(
    responses: StakeholderResponse[],
  ): Promise<ConflictResult> {
    const allStatements: ConflictingStatement[] = [];

    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        // Skip self-comparisons from the same author (they might update their own stance)
        const detected = this.compareResponses(responses[i], responses[j]);
        allStatements.push(...detected);
      }
    }

    this.logger.log(
      `Detected ${allStatements.length} conflict(s) across ${responses.length} responses`,
    );

    return {
      hasConflict: allStatements.length > 0,
      conflictingStatements: allStatements,
    };
  }

  private compareResponses(
    a: StakeholderResponse,
    b: StakeholderResponse,
  ): ConflictingStatement[] {
    const conflicts: ConflictingStatement[] = [];

    const sentencesA = this.splitIntoSentences(a.content);
    const sentencesB = this.splitIntoSentences(b.content);

    // Check keyword-based contradictions at the sentence level
    for (const sentA of sentencesA) {
      for (const sentB of sentencesB) {
        const keywordConflict = this.checkKeywordContradiction(sentA, sentB);
        if (keywordConflict) {
          conflicts.push({
            author1: a.from,
            statement1: sentA.trim(),
            author2: b.from,
            statement2: sentB.trim(),
            reason: keywordConflict,
          });
        }
      }
    }

    // Check for numeric value contradictions on the same subject
    const numericConflicts = this.checkNumericContradictions(a, b);
    conflicts.push(...numericConflicts);

    // Check for direct negation patterns (sentence-level)
    const negationConflicts = this.checkNegationPatterns(a, b, sentencesA, sentencesB);
    conflicts.push(...negationConflicts);

    return conflicts;
  }

  /**
   * Split content into sentences for more precise analysis.
   */
  private splitIntoSentences(content: string): string[] {
    return content
      .split(/[.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);
  }

  /**
   * Check if two sentences contain a contradiction keyword pair,
   * respecting context words when defined.
   */
  private checkKeywordContradiction(
    sentenceA: string,
    sentenceB: string,
  ): string | null {
    const lowerA = sentenceA.toLowerCase();
    const lowerB = sentenceB.toLowerCase();

    for (const pair of this.contradictionPairs) {
      // If context words are defined, require at least one to be present
      // in either sentence to reduce false positives
      if (pair.contextWords && pair.contextWords.length > 0) {
        const combined = lowerA + ' ' + lowerB;
        const hasContext = pair.contextWords.some((cw) =>
          combined.includes(cw),
        );
        if (!hasContext) {
          continue;
        }
      }

      const aHasFirst = this.containsTerm(lowerA, pair.termA);
      const bHasSecond = this.containsTerm(lowerB, pair.termB);
      const aHasSecond = this.containsTerm(lowerA, pair.termB);
      const bHasFirst = this.containsTerm(lowerB, pair.termA);

      if ((aHasFirst && bHasSecond) || (aHasSecond && bHasFirst)) {
        return `Contradiction on "${pair.termA}" vs "${pair.termB}"`;
      }
    }

    return null;
  }

  /**
   * Word-boundary aware term matching to reduce false positives.
   * For multi-word terms (e.g., "must not"), use includes.
   * For single-word terms, use word boundary regex.
   */
  private containsTerm(text: string, term: string): boolean {
    if (term.includes(' ')) {
      return text.includes(term);
    }
    const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'i');
    return regex.test(text);
  }

  /**
   * Detect when two different authors specify different numeric values
   * for what appears to be the same configuration or parameter.
   */
  private checkNumericContradictions(
    a: StakeholderResponse,
    b: StakeholderResponse,
  ): ConflictingStatement[] {
    const conflicts: ConflictingStatement[] = [];

    const extractNumericClaims = (
      content: string,
    ): Array<{ subject: string; value: number; sentence: string }> => {
      const claims: Array<{
        subject: string;
        value: number;
        sentence: string;
      }> = [];
      const sentences = this.splitIntoSentences(content);

      for (const sentence of sentences) {
        const regex = new RegExp(this.numericPattern.source, 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(sentence)) !== null) {
          // Use the 10 chars before the match as a rough subject identifier
          const beforeMatch = sentence
            .substring(Math.max(0, match.index - 30), match.index)
            .toLowerCase()
            .trim();
          claims.push({
            subject: beforeMatch,
            value: parseInt(match[1], 10),
            sentence: sentence.trim(),
          });
        }
      }

      return claims;
    };

    const claimsA = extractNumericClaims(a.content);
    const claimsB = extractNumericClaims(b.content);

    for (const claimA of claimsA) {
      for (const claimB of claimsB) {
        // Check if subjects overlap (share significant words)
        const wordsA = new Set(claimA.subject.split(/\s+/).filter((w) => w.length > 3));
        const wordsB = new Set(claimB.subject.split(/\s+/).filter((w) => w.length > 3));
        const overlap = [...wordsA].filter((w) => wordsB.has(w));

        if (overlap.length > 0 && claimA.value !== claimB.value) {
          conflicts.push({
            author1: a.from,
            statement1: claimA.sentence,
            author2: b.from,
            statement2: claimB.sentence,
            reason: `Different numeric values (${claimA.value} vs ${claimB.value}) for related subject`,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect direct negation patterns where one author affirms something
   * and another negates it (e.g., "we need X" vs "we don't need X").
   */
  private checkNegationPatterns(
    a: StakeholderResponse,
    b: StakeholderResponse,
    sentencesA: string[],
    sentencesB: string[],
  ): ConflictingStatement[] {
    const conflicts: ConflictingStatement[] = [];

    const negationPrefixes = [
      { positive: /\b(we need|we should|we want|we require)\b/i, negative: /\b(we don't need|we shouldn't|we don't want|we don't require)\b/i },
      { positive: /\b(it should|it must|it needs to)\b/i, negative: /\b(it shouldn't|it must not|it doesn't need to)\b/i },
      { positive: /\b(yes|agreed|correct)\b/i, negative: /\b(no|disagree|incorrect)\b/i },
    ];

    for (const sentA of sentencesA) {
      for (const sentB of sentencesB) {
        // Check if the sentences discuss the same topic (share significant words)
        const significantWordsA = this.getSignificantWords(sentA);
        const significantWordsB = this.getSignificantWords(sentB);
        const sharedWords = significantWordsA.filter((w) =>
          significantWordsB.includes(w),
        );

        if (sharedWords.length < 2) {
          continue; // Not enough topic overlap
        }

        for (const pattern of negationPrefixes) {
          const aPositive = pattern.positive.test(sentA);
          const bNegative = pattern.negative.test(sentB);
          const aNegative = pattern.negative.test(sentA);
          const bPositive = pattern.positive.test(sentB);

          if ((aPositive && bNegative) || (aNegative && bPositive)) {
            conflicts.push({
              author1: a.from,
              statement1: sentA.trim(),
              author2: b.from,
              statement2: sentB.trim(),
              reason: `Direct negation on shared topic (${sharedWords.slice(0, 3).join(', ')})`,
            });
            break; // One conflict per sentence pair is enough
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract significant words from a sentence (filtering out stop words).
   */
  private getSignificantWords(sentence: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
      'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'between', 'and', 'but',
      'or', 'not', 'no', 'nor', 'so', 'yet', 'both', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just', 'it',
      'its', 'we', 'they', 'them', 'this', 'that', 'these', 'those', 'i',
      'you', 'he', 'she', 'my', 'your', 'his', 'her', 'our', 'their',
      'need', 'want', 'think', 'know', 'also', 'don\'t', 'doesn\'t',
    ]);

    return sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
