import DataAdapter from "./data_adapter/server_data_adapter";
import { Config, DiffPatcher } from "jsondiffpatch";
import Endpoint from "./types/endpoint";
import Command from "./types/command";
import Document from "./types/document";
import { JoinMessage, SyncMessage } from "./types/message";
import { clone } from "./util/util";
import Edit from "./types/edit";
import { removeConfirmedEdits, pefrormBackup, performRoolback } from "./util/synchronize";

class Server {

    // Utility for calculating differences and patching document
    private diffPatcher: DiffPatcher;

    /**
     * @param persistenceAdapter Adapter for communication with server's database for persistence
     * @param diffOptions diffPatcher options
     * @param synchronizationUrl Url appended to the server for syncrhonization
     */
    constructor(private persistenceAdapter: DataAdapter, diffOptions: Config, private synchronizationUrl: string = '') {
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
        ]
    }

    /**
     * Joins a connection to a room and send the initial data
     * @param requestBody object with room identifier, or session Id
     */
    private async joinConnection(payload: JoinMessage): Promise<Document | object> {
        if (payload.sessionId) {
            // Simple acknowledgment
            return {};
        } else {
            return this.generateClientData(payload.room);
        }
    }

    /**
     * Generates a client session
     * @param roomId Id of room to connect to
     */
    private generateClientData(roomId: string): Document {
        let sessionId = this.generateSessionId();
        let room = this.getRoom(roomId);

        let clientDocument = new Document(roomId, sessionId, room);
        this.persistenceAdapter.storeData(sessionId, clientDocument);

        // Backup is only needed on the server
        delete clientDocument.backup;
        delete clientDocument.backupVersion;

        return clientDocument
    }

    /**
     * Applies the sent edits to the shadow and the server copy and returns new diffs
     */
    async sync(payload: SyncMessage): Promise<SyncMessage> {
        let state = this.persistenceAdapter.getRoom(payload.room);
        let clientData = this.persistenceAdapter.getData(payload.sessionId);

        if (!state) {
            throw new Error("Invalid room id received");
        }
        if (!clientData) {
            throw new Error("Invalid session id received");
        }

        this.checkVersionNumbers(payload, clientData);
        removeConfirmedEdits(payload, clientData);

        // apply all valid edits
        for (let edit of payload.edits) {
            this.applyEdit(clientData, edit);
        }

        this.persistenceAdapter.storeData(payload.sessionId, clientData);
        return this.getServerDiff(state, clientData);
    }

    /**
     * check the version numbers for lost packets
     */
    private checkVersionNumbers(payload: SyncMessage, clientData: Document): void {
        if (payload.lastReceivedVersion !== clientData.localVersion) {
            // Something has gone wrong, try performing a rollback
            if (payload.lastReceivedVersion === clientData.backupVersion) {
                performRoolback(clientData);
            } else {
                throw new Error("Sync message versions invalid");
            }
        }
    }

    /**
     * Updates the document with the newest version of the edit
     */
    private applyEdit(clientData: Document, edit: Edit): void {
        if (edit.basedOnVersion !== clientData.remoteVersion) {
            console.warn(`Edit ${edit} ignored due to bad basedOnVersion, expected ${clientData.remoteVersion}`);
            return;
        }

        pefrormBackup(clientData);

        this.diffPatcher.patch(clientData.shadow, clone(edit.diff));
        this.diffPatcher.patch(clientData.localCopy, clone(edit.diff));

        // Mark the edit version as the current one
        clientData.remoteVersion = edit.basedOnVersion;
    }

    /**
     * Create a syncMessage to update client state with the current server one
     */
    private getServerDiff(state: object, clientData: Document): SyncMessage {
        let diff = this.diffPatcher.diff(clientData.shadow, clientData.localCopy);
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
