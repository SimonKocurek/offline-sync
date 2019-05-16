import {DiffPatcher, Config} from "jsondiffpatch";
import Command from "./types/command";
import LocalStore from "./offline_store/client_offline_store";
import { ClientDocument } from "./types/document";
import { fetchJson, clone, wait } from "./util/functions";
import { JoinMessage, SyncMessage } from "./types/message";
import Edit from "./types/edit";
import { removeConfirmedEdits } from "./util/synchronize";

class Client {

    // A request is roundtripping between client and server
    private syncing: boolean = false;

    // Connection and data was initialized
    private initialized: boolean = false;

    // Connection failed and offline mode was enabled
    private offline: boolean = false;

    // Last time a response from server was returned, used for figuring out, if manual merge is needed
    private timeSinceResponse: number;

    // Document itself
    private doc: ClientDocument;

    // Utility for calculating differences and patching document
    private diffPatcher: DiffPatcher;

    /**
     * @param room Id of room, where users collaborate
     * @param diffOptions diffPatcher options
     * @param offlineStore Adapter for storing data in offline mode
     * @param synchronizationUrl Url appended to the server for syncrhonization
     */
    constructor(private room: string, private offlineStore: LocalStore, diffOptions: Config = {}, private synchronizationUrl: string = '') {
        this.diffPatcher = new DiffPatcher(diffOptions);
    }

    /**
     * Initializes the sync session and returns the stored document
     * May thrown an error if initialization failed
     */
    public async initialize(): Promise<object> {
        try {
            this.syncing = true;
            let initializedDocument = await this.setupDocument();
            return initializedDocument.localCopy;

        } finally {
            this.syncing = false;
        }
    }

    /**
     * Creates document from the stored data, or initializes a brand new one from the server
     */
    private async setupDocument(): Promise<ClientDocument> {
        let result: ClientDocument;

        if (this.offlineStore.hasData()) {
            result = this.loadStoredData();
        } else {
            result = await this.createNewConnection();
        }

        this.finishInitialization(result);
        return result;
    }

    /**
     * Restores old connection stored in the offline Store
     */
    private loadStoredData(): ClientDocument {
        let data = this.offlineStore.getData();

        if (!data || data.room !== this.room) {
            throw new Error(`Invalid data stored ${data} expected to be for room ${this.room}.`);
        }

        return data;
    }

    /**
     * Starts a new connection with fresh data
     */
    private async createNewConnection(): Promise<ClientDocument> {
        // Throws error if connection
        return await fetchJson(this.endpointUrl(Command.JOIN), new JoinMessage(this.room)) as ClientDocument;
    }

    /**
     * Mark the current client as initialized
     */
    private finishInitialization(initializedDocument: ClientDocument): void {
        this.initialized = true;
        this.timeSinceResponse = Date.now();
        this.doc = initializedDocument;
    }

    /**
     * Function that submits the changes from the server, while also accepts incomming changes
     */
    public async sync(): Promise<void> {
        if (!this.initialized) {
            console.warn("You must initialize the document before syncing is enabled");
            return;
        }

        if (this.offline) {
            // We can be in offline mode only after we already have doc set
            this.offlineStore.storeData(this.doc);

        } else if (this.syncing) {
            console.debug("Sync is already in progress you must wait for it to finish");

        } else {
            await this.syncWithServer();
        }
    }

    /**
     * Starts a sync cycle.
     */
    private async syncWithServer(): Promise<void> {
        try {
            this.syncing = true;

            let syncMessage = this.createSyncMessage();
            // Syncing needs to wait here for the response from the server
            await this.sendSyncMessage(syncMessage);

        } catch (error) {
            console.error(error);
            this.startOfflineMode();

        } finally {
            this.syncing = false;
        }
    }

    private createSyncMessage(): SyncMessage {
        let diff = this.diffPatcher.diff(this.doc.shadow, this.doc.localCopy);
        let localVersion = this.doc.localVersion;

        if (diff) {
            this.doc.edits.push(new Edit(localVersion, clone(diff)));
            this.doc.localVersion++;

            this.diffPatcher.patch(this.doc.shadow, clone(diff));
        }

        return new SyncMessage(this.doc.room, this.doc.sessionId, this.doc.remoteVersion, this.doc.edits);
    }

    /**
     * Send the final result of diffing document
     * @param syncMessage Message with edits
     */
    private async sendSyncMessage(syncMessage: SyncMessage): Promise<void> {
        let response = await fetchJson(Command.SYNC, syncMessage) as SyncMessage;
        this.timeSinceResponse = Date.now();
        this.applyServerEdits(response);
    }

    /**
     * Applies all edits from the server
     * @param payload The edits message
     */
    private applyServerEdits(payload: SyncMessage): void {
        // Version checking not needed, as by the time response is returned, server is guaranteed to be on the same version
        removeConfirmedEdits(payload.lastReceivedVersion, this.doc.edits);

        // apply all valid edits
        for (let edit of payload.edits) {
            this.applyEdit(edit);
        }
    }

    /**
     * Updates the document with the newest version of the edit
     */
    private applyEdit(edit: Edit): void {
        if (edit.basedOnVersion !== this.doc.remoteVersion) {
            console.warn(`Edit ${edit} ignored due to bad basedOnVersion, expected ${this.doc.remoteVersion}`);
            return;
        }

        // Backup on the client not required as it in case it's request is lost state is still valid
        // pefrormBackup(clientData);

        this.diffPatcher.patch(this.doc.shadow, clone(edit.diff));
        this.diffPatcher.patch(this.doc.localCopy, clone(edit.diff));

        // Mark the edit version as the current one
        this.doc.remoteVersion = edit.basedOnVersion;
    }

    private async startOfflineMode(): Promise<void> {
        if (this.offline) {
            throw new Error("Offline mode already enabled");
        }

        this.offline = true;
        this.offlineStore.storeData(this.doc);

        let waitTime = 1000;
        while (true) {
            await wait(waitTime);

            try {
                let response = await fetchJson(Command.PING, {}) as SyncMessage;
                this.reconnectionMerge(response);
                break;

            } catch (error) {
                waitTime += waitTime / 5;
            }
        }
    }

    private reconnectionMerge(payload: SyncMessage): void {
        if (this.manualMergeRequired()) {

        } else {
            this.applyServerEdits(payload);
        }

        // Upload merged state
        this.syncWithServer();
        this.disableOfflineMode();
    }

    private disableOfflineMode(): void {
        this.offlineStore.clearData();
        this.offline = false;
        this.timeSinceResponse = Date.now();
    }

    /**
     * Url of endpoint for specified command
     */
    private endpointUrl(command: Command): string {
        return `${this.synchronizationUrl}/${command}`;
    }

};

export default Client;
