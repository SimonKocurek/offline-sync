import Document from "../types/document";

/**
 * Interface for communicating with persistence layer, saving entities of type Document and State
 */
interface DataAdapter {

    hasData(id: string): boolean;

    getData(id: string): Document | null;

    storeData(id: string, document: Document): void;


    hasRoom(id: string): boolean;

    getRoom(id: string): object |null;

    storeRoom(id: string, room: object): void;

    /**
     * Optional implementation of getting unique id using database.
     * Default implementation generates a UUID v4
     */
    generateSessionId?(): string;

}

export default DataAdapter;
