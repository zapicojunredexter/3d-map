// Attribution ledger for portfolio deployment. CC-BY assets need title, author,
// source URL, and license link; ODbL datasets need share-alike notice; ambientCG
// is CC0 (credit optional but included). Entries marked used:false ship in
// assets/ but are not currently loaded by the explorer.

const CC_BY_4 = {
  id: 'CC-BY-4.0',
  name: 'Creative Commons Attribution',
  shortName: 'CC BY 4.0',
  url: 'http://creativecommons.org/licenses/by/4.0/',
}

const CC_BY_NC_4 = {
  id: 'CC-BY-NC-4.0',
  name: 'Creative Commons Attribution-NonCommercial',
  shortName: 'CC BY-NC 4.0',
  url: 'http://creativecommons.org/licenses/by-nc/4.0/',
}

const CC0 = {
  id: 'CC0-1.0',
  name: 'CC0 1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
}

const ODBL = {
  id: 'ODbL-1.0',
  name: 'ODbL 1.0',
  url: 'https://opendatacommons.org/licenses/odbl/1-0/',
}

function sketchfab(title, author, authorUrl, source, license, used = true) {
  return {
    title,
    author,
    authorUrl,
    source,
    license,
    used,
    via: 'Sketchfab',
  }
}

const PIXEL = {
  author: 'Pixel',
  authorUrl: 'https://sketchfab.com/stefan.lengyel1',
}

export const CREDIT_INTRO =
  'Third-party data and models power this explorer. Credits stay behind Esc → Settings so play stays clear. Licenses below are as published by each source.'

export const CREDIT_SECTIONS = [
  {
    id: 'map',
    title: 'City base map',
    blurb:
      'Exported via TopoExport. Underlying open data keeps its original licenses (ODbL share-alike / CC BY).',
    entries: [
      {
        title: 'TopoExport 3D modeling export',
        author: 'topoexport.com',
        authorUrl: 'https://topoexport.com',
        source: 'https://topoexport.com',
        note: 'Composite GLB used as the walkable city mesh.',
        used: true,
      },
      {
        title: 'Buildings, roads, railways, waterways, green areas, trees',
        author: 'Overture Maps Foundation',
        authorUrl: 'https://overturemaps.org',
        source: 'https://overturemaps.org',
        license: ODBL,
        note: 'Overture Maps 2026 layers via TopoExport (ODbL).',
        used: true,
      },
      {
        title: 'Global Canopy Height Maps v2',
        author: 'Meta and World Resources Institute',
        source:
          'https://www.wri.org/research/global-canopy-height-maps',
        license: {
          id: 'CC-BY-4.0',
          name: 'CC BY 4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/',
        },
        note: 'Used in TopoExport composite trees (DSM).',
        used: true,
      },
      {
        title: 'Ensemble Digital Terrain Model (EDTM) 2023',
        author: 'Ho, Y.-F., Hengl, T., Parente, L. / OpenGeoHub',
        source: 'https://doi.org/10.5281/zenodo.7676373',
        license: CC_BY_4,
        note: '30 m terrain via TopoExport.',
        used: true,
      },
      {
        title: 'OpenStreetMap / Leaflet (TopoExport front-end)',
        author: 'OpenStreetMap contributors',
        authorUrl: 'https://www.openstreetmap.org/copyright',
        source: 'https://www.openstreetmap.org/copyright',
        note: 'Referenced in TopoExport’s LICENSE for their interactive map.',
        used: false,
      },
    ],
  },
  {
    id: 'textures',
    title: 'Textures & environment',
    blurb:
      'ambientCG releases materials under CC0. Credit is optional; included here in their suggested form.',
    entries: [
      {
        title: 'Grass001',
        author: 'ambientCG',
        authorUrl: 'https://ambientcg.com',
        source: 'https://ambientcg.com/a/Grass001',
        license: CC0,
        note: 'Created using Grass001 from ambientCG.com, licensed under the Creative Commons CC0 1.0 Universal License.',
        used: true,
      },
      {
        title: 'PavingStones069',
        author: 'ambientCG',
        authorUrl: 'https://ambientcg.com',
        source: 'https://ambientcg.com/a/PavingStones069',
        license: CC0,
        note: 'Created using PavingStones069 from ambientCG.com, licensed under the Creative Commons CC0 1.0 Universal License.',
        used: true,
      },
      {
        title: 'DayEnvironmentHDRI107',
        author: 'ambientCG',
        authorUrl: 'https://ambientcg.com',
        source: 'https://ambientcg.com/a/DayEnvironmentHDRI107',
        license: CC0,
        note: 'Created using DayEnvironmentHDRI107 from ambientCG.com, licensed under the Creative Commons CC0 1.0 Universal License.',
        used: true,
      },
    ],
  },
  {
    id: 'pixel-pack',
    title: 'Low-poly pack (houses, trees, animals)',
    blurb:
      'Shown in Sketchfab’s Copy credits wording: title, model URL, author, and license.',
    entries: [
      sketchfab(
        'House-ver1-small',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver1-small-43925bd4de8949c5a377d994f2157ef3',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver2-small',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver2-small-55f61b0d95834f5eaa8cb4065710ff73',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver5-small',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver5-small-62cc2cbfbab14439adf503b77bd4371d',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver6-large',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver6-large-25507ad4d1874ffcaea9a0a76f5d3db6',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver8-small',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver8-small-cd62c26ecb0e487d874343d19db62f51',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver8-middlesize',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver8-middlesize-2116fc1e814945b0b5a3e4f69fdff4cb',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver9-large',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver9-large-1f825c57cee14ce0944cd8faf53d33f2',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver10',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver10-b005754f4bc0460e82dc157bcdf22cd3',
        CC_BY_4,
      ),
      sketchfab(
        'House-ver11',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/house-ver11-6ecfad70dfc740b2af8e28f18ae923c9',
        CC_BY_4,
      ),
      sketchfab(
        'Shelter',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/shelter-a94e90d238a04415b5e235fdd0d31a3e',
        CC_BY_4,
      ),
      sketchfab(
        'Mill-ver1-base',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/mill-ver1-base-7d79e751c6564b5ba15c3fa27deb8e05',
        CC_BY_4,
      ),
      sketchfab(
        'Mill-ver2-base',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/mill-ver2-base-c5dc62b3a15345c6b3ec475b35ef4385',
        CC_BY_4,
      ),
      sketchfab(
        'Mill-wind',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/mill-wind-d53ed9dc8f624db9be4c7f3ec22a8e8b',
        CC_BY_4,
      ),
      sketchfab(
        'Hill-tree',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/hill-tree-41c4f1b3979940dab34d08b1bce197f9',
        CC_BY_4,
      ),
      sketchfab(
        'Tree-ver1',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/tree-ver1-d896f76dbf004f18a11b0fe2bc3f70db',
        CC_BY_4,
      ),
      sketchfab(
        'Tree-ver2',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/tree-ver2-65027fb4e0fe488d812a41e3c39ae212',
        CC_BY_4,
      ),
      sketchfab(
        'Tree-ver3',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/tree-ver3-d36762b78fdc4d95befa6a6f5ee0827f',
        CC_BY_4,
      ),
      sketchfab(
        'Tree-ver4',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/tree-ver4-004b1354afd2442f80215dbe79474129',
        CC_BY_4,
      ),
      sketchfab(
        'Tree-ver5',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/tree-ver5-e91e4ee54407406fa039e2126ae6252b',
        CC_BY_4,
      ),
      sketchfab(
        'Sheep-ver1',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/sheep-ver1-82000b3fd8f34ef4b5efe6b0352945e6',
        CC_BY_4,
      ),
      sketchfab(
        'Sheep-ver2',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/sheep-ver2-2d0bee1113e942bf97ecb0a3e5cad43a',
        CC_BY_4,
      ),
      sketchfab(
        'Sheep-ver3',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/sheep-ver3-475b2d180e964d2ab8ab55ff1bee2de6',
        CC_BY_4,
      ),
      sketchfab(
        'Bull-ver1',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/bull-ver1-b2777b164b9148d8ac923c4f45f7ad69',
        CC_BY_4,
      ),
      sketchfab(
        'Bull-ver2',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/bull-ver2-e4cb7bcbf42f4959ab1799efd0e9390b',
        CC_BY_4,
      ),
      sketchfab(
        'Bull-ver3',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/bull-ver3-0c460bf1d03b488aa64784f5c43a9292',
        CC_BY_4,
      ),
      sketchfab(
        'Deer-ver1',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/deer-ver1-7642cc93fcb24c398af98476f5f0ae83',
        CC_BY_4,
      ),
      sketchfab(
        'Deer-ver2',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/deer-ver2-c3d8781a43d344bb9d1d110eb9d2ad47',
        CC_BY_4,
      ),
      sketchfab(
        'Deer-ver3',
        PIXEL.author,
        PIXEL.authorUrl,
        'https://sketchfab.com/3d-models/deer-ver3-cad14c16803e4bd39f3204aa94b9639a',
        CC_BY_4,
      ),
    ],
  },
  {
    id: 'other-models',
    title: 'Other 3D models',
    blurb:
      'Additional Sketchfab downloads in assets/. CC BY-NC means non-commercial use only — fine for a personal portfolio, not for paid products without a separate license.',
    entries: [
      sketchfab(
        'Grass 02',
        'Digital screen official',
        'https://sketchfab.com/ck212575',
        'https://sketchfab.com/3d-models/grass-02-539d1c154c944e24a04478ee32f0a960',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'Stop Motion Pixel Art Pine',
        'Jorma Rysky (Joona Venäläinen)',
        'https://sketchfab.com/Rysky',
        'https://sketchfab.com/3d-models/stop-motion-pixel-art-pine-f71c4a043af84b3aa390421980e993b7',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'Birch Tree - Low Poly',
        'Alan Zimmerman',
        'https://sketchfab.com/nenjo',
        'https://sketchfab.com/3d-models/birch-tree-low-poly-1d7f142738604975bbf1b03338a024dd',
        CC_BY_NC_4,
        false,
      ),
      sketchfab(
        'Tree',
        'dercruz926',
        'https://sketchfab.com/dercruz926',
        'https://sketchfab.com/3d-models/tree-ebff4923e17847bab3a86f25618f45b6',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'Tree For Games',
        'Daniel Gryningstjerna',
        'https://sketchfab.com/dangry',
        'https://sketchfab.com/3d-models/tree-for-games-f91d3c3c527d47fdb217c291e4c7df4b',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'Simple Low poly Tree',
        'Jewel John',
        'https://sketchfab.com/jeweljohn',
        'https://sketchfab.com/3d-models/simple-low-poly-tree-40ad64243f0b4261ae2a127fcbe90722',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'House',
        'octane2',
        'https://sketchfab.com/octane2',
        'https://sketchfab.com/3d-models/house-9f93e6605e9a4bc0bc07e07532c460fb',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'Pixel House',
        'soupffle',
        'https://sketchfab.com/soupffle',
        'https://sketchfab.com/3d-models/pixel-house-fb19698f540649d58d840e7e3459c9a6',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'Medieval House',
        'Joan LP',
        'https://sketchfab.com/joanlahots',
        'https://sketchfab.com/3d-models/medieval-house-37508dd17cea45e187b27a19ab38e83b',
        CC_BY_4,
        false,
      ),
      sketchfab(
        'Medieval House 2x3',
        'Daan van Leeuwen',
        'https://sketchfab.com/superwortel',
        'https://sketchfab.com/3d-models/medieval-house-2x3-dfdb55fc54bf4d5f8eee9c46976ba8aa',
        CC_BY_NC_4,
        false,
      ),
      sketchfab(
        'Simple Medieval Style House',
        'anthonyvanoo',
        'https://sketchfab.com/anthonyvanoo',
        'https://sketchfab.com/3d-models/simple-medieval-style-house-2d35e0dc64d8431ea784c22da4e8f236',
        CC_BY_4,
        false,
      ),
    ],
  },
]

export function creditEntryCount(sections = CREDIT_SECTIONS) {
  return sections.reduce((sum, section) => sum + section.entries.length, 0)
}

// Sketchfab's download "Copy credits" sentence (TASL), using the model URL from
// the GLB extras. Full sketchfab.com links are fine; skfb.ly shorts are equivalent.
export function formatSketchfabCredit(entry) {
  const licenseName =
    entry.license?.name ?? 'Creative Commons Attribution'
  const licenseUrl = entry.license?.url ?? 'http://creativecommons.org/licenses/by/4.0/'
  return `"${entry.title}" (${entry.source}) by ${entry.author} is licensed under ${licenseName} (${licenseUrl}).`
}

export function formatCreditLine(entry) {
  if (entry.via === 'Sketchfab') return formatSketchfabCredit(entry)
  const bits = [entry.title]
  if (entry.author) bits.push(`by ${entry.author}`)
  if (entry.license?.shortName || entry.license?.name) {
    bits.push(`(${entry.license.shortName ?? entry.license.name})`)
  }
  return bits.join(' ')
}
