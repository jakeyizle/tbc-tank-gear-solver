# Third-Party Notices

This project is licensed under the GNU General Public License v3.0 or later
(see [LICENSE](LICENSE)), which is required by its use of `glpk.js` (see below).
The majority of the remaining dependencies are permissively licensed
(MIT/ISC/BSD/Apache-2.0) and are not individually listed here — see
`package-lock.json` for the full dependency tree.

## glpk.js — GPL-3.0

- **Project:** [glpk.js](https://github.com/jvail/glpk.js)
- **Author:** Jan Vaillant
- **License:** GNU General Public License v3.0
- **Role in this project:** Provides the GLPK (GNU Linear Programming Kit,
  compiled to WebAssembly) mixed-integer solver used by the gear optimizer
  (`src/solver/solver.worker.ts`). This is the reason the project as a whole
  is licensed under GPL-3.0-or-later.

## @fontsource/roboto and @fontsource/roboto-mono — OFL-1.1

- **Project:** [Fontsource](https://github.com/fontsource/font-files)
- **Publisher:** Google Inc. (Roboto typeface)
- **License:** SIL Open Font License 1.1
- Bundled font files; see the packages under `node_modules/@fontsource/` for
  the full OFL license text distributed with each package.

## esprima — BSD-2-Clause

- **Project:** [esprima](https://github.com/jquery/esprima)
- **Copyright:** JS Foundation and other contributors, https://js.foundation/
- **License:** BSD 2-Clause

```
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the
    documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Build-only dependencies (not distributed to end users)

The following are used only during the build/lint process and are not part
of the shipped `dist/` bundle, so no runtime attribution is required, but are
noted here for completeness:

- **caniuse-lite** — CC-BY-4.0 (via `browserslist`)
- **lightningcss** — MPL-2.0 (via Tailwind CSS v4's build pipeline)

## wowsims/tbc — MIT

- **Project:** [wowsims/tbc](https://github.com/wowsims/tbc) (WoW TBC Classic simulator)
- **Copyright:** (c) 2022 wowsims team
- **License:** MIT

Several of this project's static data files under `src/data/`
(`items.json`, `gems.json`, `enchants.json`, `item-tooltips.json`,
`level_stats.json`, etc.) were derived from item, gem, and base-stat data
compiled by the wowsims/tbc project (its `assets/item_data/*.csv` files and
`sim/core` base-stat tables). The `WowSims Exporter addon JSON` gear input
format this tool accepts (see `helpers/parseItemInput.ts`) is also modeled
on wowsims/tbc's export format.

```
MIT License

Copyright (c) 2022 wowsims team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Game data and assets (World of Warcraft: The Burning Crusade)

Item, enchant, gem, and stat data in `src/data/` (`items.json`,
`enchants.json`, `gems.json`, etc.) is derived from World of Warcraft game
data — via wowsims/tbc (above) and item tooltip data/icons sourced from
[Wowhead](https://www.wowhead.com) (`www.wowhead.com`) and Blizzard's public
icon CDN (`wow.zamimg.com`) — see `scripts/getGemIcons.ts` and
`src/data/item-tooltips.json`.

World of Warcraft, Burning Crusade Classic, and all associated names, item
data, and imagery are trademarks and/or copyrights of Blizzard Entertainment,
Inc. This is an unofficial, non-commercial fan-made tool. It is not affiliated
with, endorsed, sponsored, or specifically approved by Blizzard Entertainment.
No claim of ownership is made over Blizzard's game data or artwork; it is
used here for the sole purpose of building a companion tool for the game's
players, consistent with Blizzard's fan content guidelines.
