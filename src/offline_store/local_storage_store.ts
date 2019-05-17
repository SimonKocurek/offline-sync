import LocalStore from "./client_offline_store";
import { Document } from "../types/document";

/**
 * A default Local Storage store
 */
class LocalStorageStore implements LocalStore {

  /**
   * @param key Key under which data is stored in localStorage
   */
  constructor(private key: string) {}

  /**
   * @returns Storage was used and has sessionId
   */
  public hasData(): boolean {
    if (!localStorage.getItem(this.key)) {
      return false;
    }

    let data = this.getData();
    return Boolean(data && data.room && data.sessionId);
  }

  /**
   * Removes data stored under specified key
   */
  public clearData(): void {
    localStorage.removeItem(this.key);
  }

  /**
   * @returns object stored in the localStorage
   */
  public getData(): Document | null {
    let data = localStorage.getItem(this.key);
    return JSON.parse(data || '');
  }

  /**
   * Stores the data under specified key
   * @param data Data to save
   */
  public storeData(data: Document): void {
    let serialized = JSON.stringify(data);
    localStorage.setItem(this.key, serialized);
  }

};

export default LocalStorageStore;
