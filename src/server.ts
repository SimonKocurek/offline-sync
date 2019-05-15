import DataAdapter from "./data_adapter/server_data_adapter";
import { Config, DiffPatcher } from "jsondiffpatch";
import Endpoint from "./types/endpoint";
import Command from "./types/command";
import Document from "./types/document";
import { JoinMessage, SyncMessage } from "./types/message";
import { clone } from "./util";

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
            // Set up client data
            let sessionId = this.generateSessionId();
            let room = this.getRoom(payload.room);

            let clientDocument = new Document(payload.room, sessionId, room);
            this.persistenceAdapter.storeData(sessionId, clientDocument);

            // send the generated data
            delete clientDocument.backup; // Backup is only needed on the server
            delete clientDocument.backupVersion;
            return clientDocument;
        }
    }

    /**
     * Applies the sent edits to the shadow and the server copy and returns new diffs
     */
    async sync(payload: SyncMessage): Promise<SyncMessage> {
        // -1) The algorithm actually says we should use a checksum here, I don't think that's necessary
        // 0) get the relevant doc
        let state = this.persistenceAdapter.getRoom(payload.room);
        let clientData = this.persistenceAdapter.getData(payload.sessionId);

        if (!clientData) {
            throw new Error("Invalid session id received");
        }

        // 2) check the version numbers for lost packets
        if (payload.lastReceivedVersion !== clientData.localVersion) {
            // Something has gone wrong, try performing a rollback
            if (payload.lastReceivedVersion === clientData.backupVersion) {
                this.performRoolback(clientData);
            } else {
                throw new Error("Sync message versions invalid");
            }
        }

        // 3) remove all confirmed edits
        let edits = clientData.edits;
        while (edits.length > 0 && clientData.remoteVersion >= edits[0].basedOnVersion) {
            clientData.edits.shift();
        }

        // 4) apply all valid edits
        for (let edit of payload.edits) {
            this.pefrormBackup(clientData);

            // 5) apply the edit
            this.diffPatcher.patch(clientData.shadow, clone(edit.diff));
            this.diffPatcher.patch(clientData.localCopy, clone(edit.diff));

            // Mark the edit version as the current one
            clientData.remoteVersion = edit.basedOnVersion;
        }

        // 6) save a snapshot of the document
        this.persistenceAdapter.storeData(payload.sessionId, clientData);

        // 7) respond with current diffs
        this.sendServerChanges(doc, clientDoc, sendToClient);
    }

    /**
     * Rollback using backup
     */
    private performRoolback(clientData: Document): void {
        // Restore shadow to the same version as on the client
        clientData.localVersion = clientData.backupVersion;
        clientData.localCopy = clone(clientData.backup);
        // All edits that were created based on the old shadow need to be removed
        // A new one containing all their diffs can be created
        clientData.edits = [];
    }

    /**
     * Saves the current shadow, before changing it
     */
    private pefrormBackup(clientData: Document): void {
        clientData.backup = clone(clientData.shadow);
        clientData.backupVersion = clientData.localVersion;
    }

    sendServerChanges(doc, clientDoc, send) {
        // create a diff from the current server version to the client's shadow
        let diff = this.diffPatcher.diff(clientDoc.shadow.doc, doc.serverCopy);
        let basedOnServerVersion = clientDoc.shadow.serverVersion;

        // add the difference to the server's edit stack
        if (!isEmpty(diff)) {
            clientDoc.edits.push({
                serverVersion: basedOnServerVersion,
                localVersion: clientDoc.shadow.localVersion,
                diff: diff
            });
            // update the server version
            clientDoc.shadow.serverVersion++;

            // apply the patch to the server shadow
            this.diffPatcher.patch(clientDoc.shadow.doc, this.diffPatcher.clone(diff));
        }

        // we explicitly want empty diffs to get sent as well
        send({
            localVersion: clientDoc.shadow.localVersion,
            serverVersion: basedOnServerVersion,
            edits: clientDoc.edits
        });
    }

    private getRoom(roomId: string): State {
        let generatedState = new State();

        if (!this.persistenceAdapter.hasRoom(roomId)) {
            this.persistenceAdapter.storeRoom(roomId, generatedState);
        }

        return this.persistenceAdapter.getRoom(roomId) || generatedState;
    }

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
