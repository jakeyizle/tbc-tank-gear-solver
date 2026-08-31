export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

// Newest first. Add a new entry by hand whenever a release is cut.
// User-facing only — describe what changed in the app, not internal/dev tooling changes.
export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-08-30',
    changes: [
      'Added this changelog page, along with app versioning.',
      'Added missing enchants to the item database.',
      'Added license and attribution information.',
      'Various usability improvements across the configuration panel.',
      'Fixed the Cloudflare Pages deployment.',
    ],
  },
]
