import {DiffPatcher, Config} from "jsondiffpatch";
import Command from "./types/command";
import LocalStore from "./offline_store/client_offline_store";
import Document from "./types/document";
import { fetchJson, clone } from "./util";
import { JoinMessage, SyncMessage } from "./types/message";
import Edit from "./types/edit";

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
    private doc: Document;

    // Utility for calculating differences and patching document
    private diffPatcher: DiffPatcher;

    /**
     * @param room Id of room, where users collaborate
     * @param diffOptions diffPatcher options
     * @param offlineStore Adapter for storing data in offline mode
     * @param synchronizationUrl Url appended to the server for syncrhonization
     */
    constructor(private room: string, diffOptions: Config, private offlineStore: LocalStore, private synchronizationUrl: string = '') {
        this.diffPatcher = new DiffPatcher(diffOptions);
    }

    /**
     * Get the data
     * @return client edited state
     */
    public getData(): object | null {
        if (!this.doc) {
            return null;
        }

        return this.doc.localCopy;
    }

    /**
     * Initializes the sync session
     */
    public async initialize() {
        this.syncing = true;

        try {
            if (this.offlineStore.hasData()) {
                await this.restoreOldConnection();

            } else {
                await this.createNewConnection();
            }

            this.finishInitialization();

        } catch (error) {
            console.error(error);
            this.startOfflineMode();
        }

        this.syncing = false;
    }

    /**
     * Restores old connection stored in the offline Store
     */
    private async restoreOldConnection(): Promise<void> {
        let data = this.offlineStore.getData();
        this.doc = data || this.doc;

        // Await simple ack
        await fetchJson(this.endpointUrl(Command.JOIN), new JoinMessage(this.room, this.doc.sessionId));
    }

    /**
     * Starts a new connection with fresh data
     */
    private async createNewConnection(): Promise<void> {
        let response = await fetchJson(this.endpointUrl(Command.JOIN), new JoinMessage(this.room)) as Document;
        this.doc = response;
    }

    /**
     * Mark the current client as initialized
     */
    private finishInitialization(): void {
        this.initialized = true;
        this.timeSinceResponse = Date.now();
    }

    /**
     * Function that submits the changes from the server, while also accepts incomming changes
     */
    public sync(): void {
        if (!this.initialized) {
            console.warn("You must initialize the document before syncing is enabled");
            return;
        }

        if (this.offline) {
            // We can be in offline mode only after we already have doc set
            this.offlineStore.storeData(this.doc);

        } else if (!this.syncing) {
            this.syncWithServer();
        }
    }

    /**
     * Starts a sync cycle.
     */
    private async syncWithServer(): Promise<void> {
        // initiate syncing cycle
        this.syncing = true;

        // 1) create a diff of local copy and shadow
        let diff = this.diffPatcher.diff(this.doc.shadow, this.doc.localCopy);
        let localVersion = this.doc.localVersion;

        if (diff) {
            // 2) add the difference to the local edits stack
            this.doc.edits.push(new Edit(localVersion, clone(diff)));
            this.doc.localVersion++;

            // 3) apply the patch to the local shadow
            this.diffPatcher.patch(this.doc.shadow, clone(diff));
        }

        // 4) send the edits to the server
        let syncMessage = new SyncMessage(this.doc.room, this.doc.sessionId, this.doc.remoteVersion, this.doc.edits);
        await this.sendSyncMessage(syncMessage);
        this.syncing = false;
    }

    private async sendSyncMessage(syncMessage: SyncMessage): Promise<void> {
        try {
            let response = await fetchJson(Command.SYNC, syncMessage) as SyncMessage;
            this.timeSinceResponse = Date.now();
            this.applyServerEdits(response);

        } catch (error) {
            console.error(error);
            this.startOfflineMode();
        }
    }

    /**
     * Applies all edits from the server
     * @param syncMessage The edits message
     */
    private applyServerEdits(syncMessage: SyncMessage): void {
        this.timeSinceResponse = Date.now();

        if (serverEdits && serverEdits.localVersion === this.doc.localVersion) {
            // 0) delete all previous edits
            this.doc.edits = [];
            // 1) iterate over all edits
            serverEdits.edits.forEach(this.applyServerEdit);
        } else {
            // Rejected patch because localVersions don't match
            this.emit('error', 'REJECTED_PATCH');
        }

        // we are not syncing any more
        this.syncing = false;

        // notify about sync
        this.emit('synced');

        // if a sync has been scheduled, sync again
        if (this.scheduled) {
            this.syncWithServer();
        }
    }

    /**
     * Applies a single edit message to the local copy and the shadow
     * @param  {[type]} editMessage [description]
     * @return {boolean}             [description]
     */
    applyServerEdit(editMessage) {
        // 2) check the version numbers
        if (editMessage.localVersion === this.doc.localVersion &&
            editMessage.serverVersion === this.doc.serverVersion) {

            if (!isEmpty(editMessage.diff)) {
                // versions match
                // 3) patch the shadow
                this.applyPatchTo(this.doc.shadow, editMessage.diff);

                // 4) increase the version number for the shadow if diff not empty
                this.doc.serverVersion++;
                // apply the patch to the local document
                // IMPORTANT: Use a copy of the diff, or newly created objects will be copied by reference!
                this.applyPatchTo(this.doc.localCopy, deepCopy(editMessage.diff));
            }

            return true;
        } else {
            // TODO: check in the algo paper what should happen in the case of not matching version numbers
            return false;
        }
    }

    /**
     * 
     */
    private startOfflineMode(): void {
        this.offline = true;
        this.offlineStore.storeData(this.doc);

        setInterval(() => {

        }, 1000);
    }

// TODO implement
    reconnected(editMessage) {
        this._performMerge();
        // TODO perform merge
        //  - ask for server state
        //  - let client merge
        //  - validate merge
        //  - submit

        // TODO on valid merge callback
        //  - clear this.doc, to free up memory
        //  - set this.offline = false
        //  - stop pinging
    }

    /**
     * 
     * @param command 
     */
    private endpointUrl(command: Command): string {
        return `${this.synchronizationUrl}/${command}`;
    }

};

export default Client;
