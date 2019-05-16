import DataAdapter from "./server_data_adapter";
import { ServerDocument } from "../types/document";

/**
 * A dumb in-memory data store. Do not use in production. Only for demo purposes.
 */
class InMemoryDataAdapter implements DataAdapter {

    private data: {[sessionId: string]: ServerDocument} = {};

    private rooms: {[roomId: string]: object} = {};

    public hasData(sessionId: string): boolean {
        return Boolean(this.data[sessionId]);
    }

    public getData(sessionId: string): ServerDocument | null {
        return this.data[sessionId];
    }

    public storeData(sessionId: string, data: ServerDocument): void {
        this.data[sessionId] = data;
    }

    public hasRoom(roomId: string): boolean {
        return Boolean(this.rooms[roomId]);
    }

    public getRoom(roomId: string): object | null {
        return this.rooms[roomId];
    }

    public storeRoom(roomId: string, document: object): void {
        this.rooms[roomId] = document;
    }

}

export default InMemoryDataAdapter;
