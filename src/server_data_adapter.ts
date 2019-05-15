import Document from "./document";

interface DataAdapter {

    hasData(id: string): boolean;

    getData(id: string): Document | null;

    storeData(id: string, data: Document): void;

    hasRoom(id: string): boolean;

    getRoom(id: string): object |null;

    storeRoom(id: string, document: object): void;

}

export default DataAdapter;
