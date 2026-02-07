import * as fs from 'fs';
import * as path from 'path';

export interface LatestSession {
  sessionId: string;
  sessionDir: string;
  found: boolean;
}

/**
 * Find the latest session by scanning .ngkssys/sessions directory
 * and finding the most recently modified session folder
 */
export function findLatestSession(workspaceRoot: string): LatestSession {
  const ngkssysDir = path.join(workspaceRoot, '.ngkssys');
  const sessionsDir = path.join(ngkssysDir, 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    return { sessionId: '', sessionDir: '', found: false };
  }

  try {
    const sessionIds = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    if (sessionIds.length === 0) {
      return { sessionId: '', sessionDir: '', found: false };
    }

    // Find most recently modified session by checking session.json timestamps
    let latestSessionId = '';
    let latestTimestamp = '';

    for (const sessionId of sessionIds) {
      const sessionDir = path.join(sessionsDir, sessionId);
      const sessionJsonPath = path.join(sessionDir, 'session.json');
      
      if (fs.existsSync(sessionJsonPath)) {
        try {
          const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf-8'));
          const sessionTimestamp = sessionData.startedAt || '';
          
          if (sessionTimestamp > latestTimestamp) {
            latestTimestamp = sessionTimestamp;
            latestSessionId = sessionId;
          }
        } catch {
          // Skip invalid session.json files
        }
      }
    }

    if (latestSessionId) {
      const latestSessionDir = path.join(sessionsDir, latestSessionId);
      return {
        sessionId: latestSessionId,
        sessionDir: latestSessionDir,
        found: true
      };
    }

    return { sessionId: '', sessionDir: '', found: false };

  } catch {
    return { sessionId: '', sessionDir: '', found: false };
  }
}