import DataAdapter from "./data_adapter/server_data_adapter";
import { Config, DiffPatcher } from "jsondiffpatch";
import Endpoint from "./types/endpoint";
import Command from "./types/command";
import { JoinMessage, SyncMessage, PingMessage } from "./types/message";
import { clone } from "./util/functions";
import Edit from "./types/edit";
import { removeConfirmedEdits, pefrormBackup, performRoolback } from "./util/synchronize";
import { ServerDocument, ClientDocument, Document } from "./types/document";

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
    private async joinConnection(payload: JoinMessage): Promise<ClientDocument | object> {
        return this.generateClientData(payload.room);
    }

    /**
     * Generates a client session
     * @param roomId Id of room to connect to
     */
    private generateClientData(roomId: string): ClientDocument {
        let sessionId = this.generateSessionId();
        let room = this.getRoom(roomId);

        let document = new Document(roomId, sessionId, room);

        this.persistenceAdapter.storeData(sessionId, new ServerDocument(document));
        return new ClientDocument(document);
    }

    /**
     * Applies the sent edits to the shadow and the server copy and returns new diffs
     */
    async sync(payload: SyncMessage): Promise<SyncMessage> {
        let room = this.persistenceAdapter.getRoom(payload.room);
        let clientData = this.persistenceAdapter.getData(payload.sessionId);

        if (!room) {
            throw new Error(`Invalid room id received ${payload}`);
        }
        if (!clientData) {
            throw new Error(`Invalid session id received ${payload}`);
        }

        this.checkVersionNumbers(payload.lastReceivedVersion, clientData);
        removeConfirmedEdits(payload.lastReceivedVersion, clientData.edits);

        // apply all valid edits
        for (let edit of payload.edits) {
            this.applyEdit(room, clientData, edit);
        }

        this.persistenceAdapter.storeData(payload.sessionId, clientData);
        this.persistenceAdapter.storeRoom(payload.room, room);

        return this.getServerDiff(room, clientData);
    }

    /**
     * check the version numbers for lost packets
     */
    private checkVersionNumbers(lastReceivedVersion: number, clientData: ServerDocument): void {
        if (lastReceivedVersion !== clientData.localVersion) {
            // Something has gone wrong, try performing a rollback
            if (lastReceivedVersion === clientData.backupVersion) {
                performRoolback(clientData);
            } else {
                throw new Error(`Sync message versions invalid lastReceived: ${lastReceivedVersion}, backup: ${clientData.backupVersion}`);
            }
        }
    }

    /**
     * Updates the document with the newest version of the edit
     */
    private applyEdit(room: object, clientData: ServerDocument, edit: Edit): void {
        if (edit.basedOnVersion !== clientData.remoteVersion) {
            console.warn(`Edit ${edit} ignored due to bad basedOnVersion, expected ${clientData.remoteVersion}`);
            return;
        }

        pefrormBackup(clientData);

        this.diffPatcher.patch(clientData.shadow, clone(edit.diff));
        this.diffPatcher.patch(room, clone(edit.diff));

        // Mark the edit version as the current one
        clientData.remoteVersion = edit.basedOnVersion;
    }

    /**
     * Create a syncMessage to update client state with the current server one
     */
    private getServerDiff(state: object, clientData: ServerDocument): SyncMessage {
        let diff = this.diffPatcher.diff(clientData.shadow, state);
        let basedOnVersion = clientData.localVersion;

        // add the difference to the server's edit stack
        if (diff) {
            clientData.edits.push(new Edit(basedOnVersion, diff));
            clientData.localVersion++;

            this.diffPatcher.patch(clientData.shadow, clone(diff));
        }

        return new SyncMessage(clientData.room, clientData.sessionId, clientData.remoteVersion, clientData.edits);
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

        this.checkVersionNumbers(payload.lastReceivedVersion, clientData);
        removeConfirmedEdits(payload.lastReceivedVersion, clientData.edits);

        return this.getServerDiff(room, clientData);
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
