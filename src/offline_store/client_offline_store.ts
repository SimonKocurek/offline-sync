import Document from "../types/document";

interface LocalStore {

  hasData(): boolean;

  getData(): Document | null;

  storeData(data: Document): void;

}

export default LocalStore;
