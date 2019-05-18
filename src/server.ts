import DataAdapter from "./data_adapter/server_data_adapter";
import { Config, DiffPatcher } from "jsondiffpatch";
import Endpoint from "./types/endpoint";
import Command from "./types/command";
import { JoinMessage, SyncMessage, PingMessage } from "./types/message";
import { removeConfirmedEdits, checkVersionNumbers, applyEdit, createSyncMessage } from "./util/synchronize";
import { Document } from "./types/document";

class Server {

    // Utility for calculating differences and patching document
    private diffPatcher: DiffPatcher;

    /**
     * @param persistenceAdapter Adapter for communication with server's database for persistence
     * @param diffOptions diffPatcher options
     * @param synchronizationUrl Url appended to the server for syncrhonization
     */
    constructor(private persistenceAdapter: DataAdapter, diffOptions: Config = {}, private synchronizationUrl: string = '') {
        diffOptions = Object.assign({
            // In case of the need for three way merge after reconnection, send the client remove and add, instead of move diffs
            arrays: {
                detectMove: false
            },
        }, diffOptions || {});

        this.diffPatcher = new DiffPatcher(diffOptions);
    }

    /**
     * Return a list of endpoints that should be registered, each starts with name and a function for handling the request
     */
    public generatedEndpoints(): Endpoint[] {
        return [
            new Endpoint(this.endpointUrl(Command.JOIN), async (requestBody) => this.joinConnection(requestBody as JoinMessage)),
            new Endpoint(this.endpointUrl(Command.SYNC), async (requestBody) => this.sync(requestBody as SyncMessage)),
            new Endpoint(this.endpointUrl(Command.PING), async (requestBody) => this.receivePing(requestBody as PingMessage)),
        ]
    }

    /**
     * Joins a connection to a room and send the initial data
     * @param requestBody object with room identifier, or session Id
     */
    private async joinConnection(payload: JoinMessage): Promise<Document> {
        return this.generateClientData(payload.room);
    }

    /**
     * Generates a client session
     * @param roomId Id of room to connect to
     */
    private generateClientData(roomId: string): Document {
        let sessionId = this.generateSessionId();
        let room = this.getRoom(roomId);

        let serverDocument = new Document(roomId, sessionId, room);
        serverDocument.localCopy = null; // Local copy is stored in the room data
        this.persistenceAdapter.storeData(sessionId, serverDocument);

        return new Document(roomId, sessionId, room);
    }

    /**
     * Applies the sent edits to the shadow and the server copy and returns new diffs
     */
    private async sync(payload: SyncMessage): Promise<SyncMessage> {
        let room = this.persistenceAdapter.getRoom(payload.room);
        let clientData = this.persistenceAdapter.getData(payload.sessionId);

        if (!room) {
            throw new Error(`Invalid room id received ${payload}`);
        }
        if (!clientData) {
            throw new Error(`Invalid session id received ${payload}`);
        }

        checkVersionNumbers(payload.lastReceivedVersion, clientData);
        removeConfirmedEdits(payload.lastReceivedVersion, clientData.edits);

        // apply all valid edits
        for (let edit of payload.edits) {
            applyEdit(room, clientData, edit, this.diffPatcher);
        }

        return this.createSyncAndPersist(payload.room, payload.sessionId, room, clientData);
    }

    /**
     * Receive ping message and return diffs that happened in the meantime
     */
    private receivePing(payload: PingMessage): SyncMessage {
        let room = this.persistenceAdapter.getRoom(payload.room);
        let clientData = this.persistenceAdapter.getData(payload.sessionId);

        if (!room) {
            throw new Error(`Invalid room id received ${payload}`);
        }
        if (!clientData) {
            throw new Error(`Invalid session id received ${payload}`);
        }
        if (payload.lastReceivedVersion !== clientData.localVersion) {
            throw new Error(`Ping message versions invalid lastReceived: ${payload.lastReceivedVersion}, expected: ${clientData.localVersion}`);
        }

        removeConfirmedEdits(payload.lastReceivedVersion, clientData.edits);

        return this.createSyncAndPersist(payload.room, payload.sessionId, room, clientData);
    }

    /**
     * Create a sync message and save new versions and edits
     */
    private createSyncAndPersist(roomId: string, sessionId: string, room: object, data: Document): SyncMessage {
        let SyncMessage = createSyncMessage(room, data, this.diffPatcher);

        this.persistenceAdapter.storeData(sessionId, data);
        this.persistenceAdapter.storeRoom(roomId, room);

        return SyncMessage;
    }

    /**
     * Non-null room for specified id
     */
    private getRoom(roomId: string): object {
        if (!this.persistenceAdapter.hasRoom(roomId)) {
            this.persistenceAdapter.storeRoom(roomId, {});
        }

        return this.persistenceAdapter.getRoom(roomId) || {};
    }

    /**
     * Url of endpoint for specified command
     */
    private endpointUrl(command: Command): string {
        return `${this.synchronizationUrl}/${command}`;
    }

    /**
     * Generates session ID for client endless session
     * @returns Adapter implementation of unique id generation or UUID otherwise
     */
    private generateSessionId(): string {
        if (this.persistenceAdapter.generateSessionId) {
            return this.persistenceAdapter.generateSessionId();
        } else {
            return this.generateUniqueId();
        }
    }

    /**
     * UUID 4 generator as per https://stackoverflow.com/a/2117523/5521670
     *
     * @returns Unique ID
     */
    private generateUniqueId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
            let random = Math.random() * 16 | 0;
            let value = char === 'x' ? random : (random & 0x3 | 0x8);
            return value.toString(16);
        });
    }

}

export default Server;
