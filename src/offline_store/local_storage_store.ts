import LocalStore from "./client_offline_store";
import { ClientDocument } from "../types/document";

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
   * @returns object stored in the localStorage
   */
  getData(): ClientDocument | null {
    let data = localStorage.getItem(this.key);
    return JSON.parse(data || '');
  }

  /**
   * Stores the data under specified key
   * @param data Data to save
   */
  storeData(data: ClientDocument): void {
    let serialized = JSON.stringify(data);
    localStorage.setItem(this.key, serialized);
  }

};

export default LocalStorageStore;
