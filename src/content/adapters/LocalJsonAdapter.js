// Adapter: reads a content file that ships with the game (data/<type>.json).
// This is also the offline fallback for every other adapter.
//
// Adapter interface (all adapters follow it):
//   id                      short name shown in logs / the admin check
//   async load(typeDef, sourceConfig) -> raw data in the SAME shape as the local JSON file

export class LocalJsonAdapter {
  constructor() {
    this.id = 'local';
  }

  /** @param {{localPath:string}} typeDef */
  async load(typeDef) {
    const res = await fetch(typeDef.localPath, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${typeDef.localPath}: HTTP ${res.status}`);
    return res.json();
  }
}
