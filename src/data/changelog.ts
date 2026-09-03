interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

// Newest first. Add a new entry by hand whenever a release is cut.
// User-facing only — describe what changed in the app, not internal/dev tooling changes.
export const changelog: ChangelogEntry[] = [
  {
    version: '0.2.0',
    date: '2026-09-03',
    changes: [
      'Added a "Weighted Sim Metrics" objective mode that optimizes gear against a real combat sim (TPS, DTPS, and TMI-5), with an advanced Sim Calibration Profile panel for tuning the encounter, healing model, and raid buffs it runs against.',
      'Added a "Maximize Effective HP" objective mode.',
      'Sim metric results (TPS/DTPS/TMI-5) now show in the results summary and in side-by-side config comparisons.',
      'Pasting a full character export now detects your class, race, and talents and pre-fills the Character section.',
      'Added a "Compare independently" option for comparing two configurations.',
      'Filled in real item IDs for consumables, replacing placeholder values.',
    ],
  },
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
