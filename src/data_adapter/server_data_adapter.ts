import { Document } from "../types/document";

/**
 * Interface for communicating with persistence layer, saving entities of type Document and State
 * Server side provides no caching, so if you require it, please implement it here.
 */
interface DataAdapter {

    /**
     * Server side of document is present
     */
    hasData(sessionId: string): boolean;

    /**
     * Get the server side of document
     */
    getData(sessionId: string): Document | null;

    /**
     * Store the server side of document
     */
    storeData(sessionId: string, document: Document): void;


    /**
     * Document synchronized across clients with id exists
     */
    hasRoom(roomId: string): boolean;

    /**
     * Get document synchronized across clients by id
     */
    getRoom(roomId: string): object |null;

    /**
     * Store Document synchronized across clients
     */
    storeRoom(roomId: string, room: object): void;

    /**
     * Optional implementation of getting unique id using database.
     * Default implementation generates a UUID v4
     */
    generateSessionId?(): string;

}

export default DataAdapter;
