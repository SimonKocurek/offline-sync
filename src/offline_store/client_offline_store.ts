import { Document } from "../types/document";

/**
 * Interface for client side data persistence. Can use localstorage, sessionstorage, indexDb, cookies
 * or just in memory, if offline mode is not needed.
 */
interface LocalStore {

  /**
   * Data are present on the browser
   */
  hasData(): boolean;

  /**
   * Clears data so that next time hasData retuns false
   */
  clearData(): void;

  /**
   * Get the client data
   */
  getData(): Document | null;

  /**
   * Store the client data
   */
  storeData(data: Document): void;

}

export default LocalStore;
