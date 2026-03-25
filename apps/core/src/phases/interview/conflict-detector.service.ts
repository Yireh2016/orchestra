import { Injectable, Logger } from '@nestjs/common';

export interface StakeholderResponse {
  from: string;
  content: string;
  timestamp: Date;
}

export interface Conflict {
  responseA: StakeholderResponse;
  responseB: StakeholderResponse;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

@Injectable()
export class ConflictDetectorService {
  private readonly logger = new Logger(ConflictDetectorService.name);

  private readonly contradictionKeywords: [string, string][] = [
    ['must', 'must not'],
    ['always', 'never'],
    ['required', 'optional'],
    ['include', 'exclude'],
    ['before', 'after'],
    ['increase', 'decrease'],
    ['add', 'remove'],
  ];

  async detectConflicts(
    responses: StakeholderResponse[],
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const detected = this.compareResponses(responses[i], responses[j]);
        conflicts.push(...detected);
      }
    }

    this.logger.log(
      `Detected ${conflicts.length} conflicts across ${responses.length} responses`,
    );

    return conflicts;
  }

  private compareResponses(
    a: StakeholderResponse,
    b: StakeholderResponse,
  ): Conflict[] {
    const conflicts: Conflict[] = [];
    const contentA = a.content.toLowerCase();
    const contentB = b.content.toLowerCase();

    for (const [termA, termB] of this.contradictionKeywords) {
      const aHasFirst = contentA.includes(termA);
      const bHasSecond = contentB.includes(termB);
      const aHasSecond = contentA.includes(termB);
      const bHasFirst = contentB.includes(termA);

      if ((aHasFirst && bHasSecond) || (aHasSecond && bHasFirst)) {
        conflicts.push({
          responseA: a,
          responseB: b,
          description: `Potential contradiction: "${a.from}" and "${b.from}" may disagree on "${termA}" vs "${termB}"`,
          severity: 'medium',
        });
      }
    }

    return conflicts;
  }
}
