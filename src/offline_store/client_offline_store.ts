import { ClientDocument } from "../types/document";

/**
 * Interface for client side data persistence. Can use localstorage, sessionstorage, indexDb, cookies
 * or just in memory, if offline mode is not needed.
 */
interface LocalStore {

  hasData(): boolean;

  getData(): ClientDocument | null;

  storeData(data: ClientDocument): void;

}

export default LocalStore;
