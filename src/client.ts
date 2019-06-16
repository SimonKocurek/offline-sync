import {DiffPatcher, Config} from "jsondiffpatch";
import Command from "./types/command";
import LocalStore from "./offline_store/client_offline_store";
import { Document } from "./types/document";
import { fetchJson,  wait, timeSince, clone } from "./util/functions";
import { JoinMessage, SyncMessage } from "./types/message";
import { removeConfirmedEdits, createSyncMessage, applyEdit } from "./util/synchronize";
import Edit from "./types/edit";

class Client {

    // A request is roundtripping between client and server
    private syncing: boolean = false;

    // Connection and data was initialized
    private initialized: boolean = false;

    // Connection failed and offline mode was enabled
    private offline: boolean = false;

    // Last time a response from server was returned, used for figuring out, if manual merge is needed
    private timeSinceResponse: number = -1;

    // Document itself
    private doc: Document | null = null;

    // Utility for calculating differences and patching document
    private readonly diffPatcher: DiffPatcher;

    /**
     * @param room Id of room, where users collaborate
     * @param diffOptions diffPatcher options
     * @param userMerge Function that is called on user merge, takes local and server state and returns the merged one
     * @param offlineStore Adapter for storing data in offline mode
     * @param synchronizationUrl Url appended to the server for syncrhonization
     */
    constructor(
        private room: string,
        private offlineStore: LocalStore,
        private userMerge: (local: object, server: object) => Promise<object>,
        diffOptions: Config = {},
        private synchronizationUrl: string = ''
    ) {
        diffOptions = Object.assign({
            arrays: {
                detectMove: false
            },
            textDiff: {
                minLength: 10
            }
        }, diffOptions || {});

        this.diffPatcher = new DiffPatcher(diffOptions);
    }

    /**
     * Initializes the sync session and returns the stored document
     * May thrown an error if initialization failed
     */
    public async initialize(): Promise<object> {
        await this.setupDocument();
        return this.getLocalCopy();
    }

    /**
     * Creates document from the stored data, or initializes a brand new one from the server
     */
    private async setupDocument(): Promise<void> {
        let result: Document;

        if (this.offlineStore.hasData()) {
            result = this.loadStoredData();
        } else {
            result = await this.createNewConnection();
        }

        this.finishInitialization(result);
    }

    /**
     * Restores old connection stored in the offline Store
     */
    private loadStoredData(): Document {
        let data = this.offlineStore.getData();
        console.log("Loaded store data", data);

        if (!data || data.room !== this.room) {
            throw new Error(`Invalid data stored ${data} expected to be for room ${this.room}.`);
        }

        return data;
    }

    /**
     * Starts a new connection with fresh data
     */
    private async createNewConnection(): Promise<Document> {
        // Throws error if connection fails
        try {
            this.syncing = true;
            const newDocument = await fetchJson(this.endpointUrl(Command.JOIN), new JoinMessage(this.room)) as Document;
            console.log("Fetched new document", newDocument);

            return newDocument;
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Mark the current client as initialized
     */
    private finishInitialization(initializedDocument: Document): void {
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
            this.offlineStore.storeData(this.getDoc());
            console.log("Stored data locally", this.getDoc());

        } else if (this.syncing) {
            console.log("Sync is already in progress you must wait for it to finish");

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

            let syncMessage = createSyncMessage(this.getLocalCopy(), this.getDoc(), this.diffPatcher);
            console.log("Sending sync message", syncMessage.lastReceivedVersion, JSON.stringify(syncMessage.edits));

            // Syncing needs to wait here for the response from the server
            await this.synchronizeByMessage(syncMessage);

        } catch (error) {
            console.log("Syncing failed with error", error);
            await this.handleSyncError(error);

        } finally {
            this.syncing = false;
        }
    }

    /**
     * Rethrows error, or starts offline mode, if network error occured
     */
    private async handleSyncError(error: Error): Promise<void> {
        // A fetch() promise will reject with a TypeError when a network error is encountered or CORS is misconfigured
        if (error instanceof TypeError) {
            await this.startOfflineMode();
        } else {
            throw error;
        }
    }

    /**
     * Send the final result of diffing document
     * @param syncMessage Message with edits
     */
    private async synchronizeByMessage(syncMessage: SyncMessage): Promise<void> {
        let response = await fetchJson(this.endpointUrl(Command.SYNC), syncMessage) as SyncMessage;
        this.timeSinceResponse = Date.now();
        console.log("Received synchronization response", response.lastReceivedVersion, JSON.stringify(response.edits));
        this.applyServerEdits(response);
    }

    /**
     * Applies all edits from the server
     * @param payload The edits message
     */
    private applyServerEdits(payload: SyncMessage): void {
        let doc = this.getDoc();

        removeConfirmedEdits(payload.lastReceivedVersion, doc.edits);

        // apply all valid edits
        for (let edit of payload.edits) {
            applyEdit(this.getLocalCopy(), doc, edit, this.diffPatcher);
        }
    }

    /**
     * Store data and start offline mode by periodically pinging the server
     */
    private async startOfflineMode(): Promise<void> {
        if (this.offline) {
            throw new Error("Offline mode already enabled");
        }

        this.offline = true;
        this.offlineStore.storeData(this.getDoc());
        console.log("Started offline mode");

        await this.startReconnectionChecking();
    }

    /**
     * Start periodically sending a request, waiting for server response
     */
    private async startReconnectionChecking(): Promise<void> {
        let timeBetweenRequests = 1000;

        while (true) {
            try {
                console.log("Pinging...");
                let response = await fetchJson(this.endpointUrl(Command.PING), {}) as SyncMessage;
                await this.reconnectionMerge(response);
                break;

            } catch (error) {
                await this.handleReconnectionAttemptError(error, timeBetweenRequests);

            } finally {
                timeBetweenRequests += timeBetweenRequests / 5;
            }
        }
    }

    /**
     * Rethrows error, or starts offline mode, if network error occured
     */
    private async handleReconnectionAttemptError(error: Error, timeBetweenRequests: number): Promise<void> {
        // A fetch() promise will reject with a TypeError when a network error is encountered or CORS is misconfigured
        if (error instanceof TypeError) {
            await wait(timeBetweenRequests);
        } else {
            throw error;
        }
    }

    /**
     * Synchronize states between the client and server by performing a more complex merge mechanism,
     * designed for offline mode reconnections
     */
    private async reconnectionMerge(payload: SyncMessage): Promise<void> {
        if (this.manualMergeRequired(payload)) {
            for (let edit of payload.edits) {
                await this.manualMerge(edit);
            }

        } else {
            this.applyServerEdits(payload);
        }

        // Upload merged state
        await this.syncWithServer();
        this.disableOfflineMode();
    }

    /**
     * Handles the scenario, where manual merge by the user is performed
     */
    private async manualMerge(edit: Edit): Promise<void> {
        let doc = this.getDoc();

        if (edit.basedOnVersion !== doc.remoteVersion) {
            console.warn("Edit", edit, "ignored due to bad basedOnVersion, expected", doc.remoteVersion);
            return;
        }

        let serverDoc = clone(doc);
        this.diffPatcher.patch(serverDoc, clone(edit.diff));

        // Wait for user to merge
        let merged = await this.userMerge(doc, serverDoc);

        if (!merged) {
            throw Error(`Expected merge to result in an object, but got ${merged}`);
        }

        doc.backup = clone(serverDoc);
        doc.backupVersion = edit.basedOnVersion;
        doc.remoteVersion = edit.basedOnVersion;
        doc.shadow = clone(serverDoc);

        // Only local copy is affected by the manual merge
        // Shadow and backup have edits added automatically
        doc.localCopy = clone(merged);

        // Save the merged state just in case
        this.offlineStore.storeData(doc);
    }

    /**
     * Check if manual merge is required
     */
    private manualMergeRequired(payload: SyncMessage): boolean {
        return timeSince(this.timeSinceResponse) > 30_000 // After more than 30 seconds conciser a merge
            && payload.edits.length > 0; // any edits were performed
    }

    /**
     * Clears all data related to the offline mode and disables it's flag
     */
    private disableOfflineMode(): void {
        this.offlineStore.clearData();
        this.offline = false;
        this.timeSinceResponse = Date.now();
    }

    /**
     * Returns a localCopy with error check
     */
    private getLocalCopy(): object {
        let doc = this.getDoc();

        if (doc.localCopy === null) {
            throw new Error(`Incorrect document ${this.doc}, localCopy should be present`);
        }

        return doc.localCopy;
    }

    /**
     * Returns a document with error check
     */
    private getDoc(): Document {
        if (this.doc === null) {
            if (this.initialized) {
                throw new Error("Client has not been initialized, please call initialize().");
            } else {
                throw new Error("Document is null, but expected non-null value, on initialized client");
            }
        }

        return this.doc;
    }

    /**
     * Url of endpoint for specified command
     */
    private endpointUrl(command: Command): string {
        return `${this.synchronizationUrl}/${command}`;
    }

}

export default Client;
