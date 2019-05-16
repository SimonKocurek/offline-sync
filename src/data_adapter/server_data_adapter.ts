import { ServerDocument } from "../types/document";

/**
 * Interface for communicating with persistence layer, saving entities of type Document and State
 */
interface DataAdapter {

    hasData(id: string): boolean;

    getData(id: string): ServerDocument | null;

    storeData(id: string, document: ServerDocument): void;


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
