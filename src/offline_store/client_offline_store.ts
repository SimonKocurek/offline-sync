import Document from "../types/document";

/**
 * Interface for client side data persistence. Can use localstorage, sessionstorage, indexDb, cookies
 * or just in memory, if offline mode is not needed.
 */
interface LocalStore {

  hasData(): boolean;

  getData(): Document | null;

  storeData(data: Document): void;

}

export default LocalStore;
