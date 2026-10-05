/** Jest manual mock for expo-sqlite/kv-store: in-memory SQLiteStorage with the synchronous surface the app uses. */
type Updater = (prev: string | null) => string;

export class SQLiteStorage {
  private static dbs = new Map<string, Map<string, string>>();
  private readonly map: Map<string, string>;

  constructor(databaseName: string) {
    if (!SQLiteStorage.dbs.has(databaseName)) SQLiteStorage.dbs.set(databaseName, new Map());
    this.map = SQLiteStorage.dbs.get(databaseName)!;
  }

  getItemSync(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItemSync(key: string, value: string | Updater): void {
    const next = typeof value === 'function' ? value(this.map.get(key) ?? null) : value;
    if (typeof next !== 'string') throw new Error('[SQLiteStorage] value must be a string');
    this.map.set(key, next);
  }
  removeItemSync(key: string): boolean {
    return this.map.delete(key);
  }
  getAllKeysSync(): string[] {
    return Array.from(this.map.keys());
  }
  clearSync(): boolean {
    this.map.clear();
    return true;
  }
  async getItemAsync(key: string) {
    return this.getItemSync(key);
  }
  async setItemAsync(key: string, value: string | Updater) {
    this.setItemSync(key, value);
  }
  async removeItemAsync(key: string) {
    return this.removeItemSync(key);
  }
  async getAllKeysAsync() {
    return this.getAllKeysSync();
  }
  async clearAsync() {
    return this.clearSync();
  }
}

export const AsyncStorage = new SQLiteStorage('ExpoSQLiteStorage');
export const Storage = AsyncStorage;
export default AsyncStorage;
