import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Required for `next build` with `output: export` in desktop packaging.
export const dynamic = 'force-static';

export async function GET() {
  const systemReviewSkillsPath = path.join(os.homedir(), '.atmos', 'skills', '.system', 'code_review_skills');
  const skills: { id: string; label: string; badge: string; description: string; bestFor: string }[] = [];

  if (fs.existsSync(systemReviewSkillsPath)) {
    const dirs = fs.readdirSync(systemReviewSkillsPath);
    for (const d of dirs) {
      if (fs.statSync(path.join(systemReviewSkillsPath, d)).isDirectory()) {
        const skillMd = path.join(systemReviewSkillsPath, d, 'SKILL.md');
        let label = d
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        let description = '';
        let bestFor = 'Code review tasks configured in system skills';

        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf8');
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          if (nameMatch) {
            // we won't strictly use name as label if the directory name is nice enough, but let's see
          }
          
          // try to match bestFor in yaml
          const bestForMatch = content.match(/^bestFor:\s*(.+)$/m);
          if (bestForMatch) {
            bestFor = bestForMatch[1].trim();
          }

          // try to match multi-line description in yaml
          const descMatch = content.match(/^description:\s*([^]+?)^---/m);
          if (descMatch) {
            description = descMatch[1].trim().replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
          } else {
            const shortDescMatch = content.match(/^description:\s*(.+)$/m);
            if (shortDescMatch) {
              description = shortDescMatch[1].trim();
            }
          }
        }
        
        let badge = 'Review';
        if (d.includes('expert')) badge = 'Backend';
        else if (d.includes('react') || d.includes('typescript')) badge = 'TS/React';
        else if (d.includes('fullstack')) badge = 'Fullstack';

        // Well-known overrides to ensure they match UI exactly if nothing is parsed
        if (d === 'fullstack-reviewer') {
          label = 'Fullstack Reviewer';
          bestFor = bestFor === 'Code review tasks configured in system skills' ? 'Fullstack review for any project' : bestFor;
        } else if (d === 'code-review-expert') {
          label = 'Backend Arch Expert';
          bestFor = bestFor === 'Code review tasks configured in system skills' ? 'Complex backend logic, API, and DB architectural reviews' : bestFor;
        } else if (d === 'typescript-react-reviewer') {
          label = 'TypeScript React Expert';
          bestFor = bestFor === 'Code review tasks configured in system skills' ? 'React/Next.js frontend applications' : bestFor;
        }

        skills.push({
          id: d,
          label,
          badge,
          description: description || `Custom review skill for ${d}`,
          bestFor
        });
      }
    }
  }
  
  return NextResponse.json({ skills });
}
