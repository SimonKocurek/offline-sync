import {DiffPatcher, Config} from "jsondiffpatch";
import Command from "./command";
import LocalStore from "./client_offline_store";
import Document from "./document";
import { fetchAsync } from "./util";

class Client {

    // A request is roundtripping between client and server
    private syncing: boolean = false;

    // Connection and data was initialized
    private initialized: boolean = false;

    // Request is waiting to be sent to the server
    private scheduled: boolean = false;

    // Connection failed and offline mode was enabled
    private offline: boolean = false;

    // Last time a response from server was returned, used for figuring out, if manual merge is needed
    private timeSinceResponse: Date;

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
    public getData(): object {
        if (!this.doc) {
            return null;
        }

        return this.doc.localCopy;
    }

    /**
     * Initializes the sync session
     */
    public initialize() {
        this.syncing = true;

        if (this.offlineStore.hasData()) {
            this.restoreOldConnection();
        } else {
            this.createNewConnection();
        }
    }

    /**
     * Restores old connection stored in the offline Store
     */
    private restoreOldConnection(): void {
        this.offlineStore.getData();
        // TODO
        this.socket.emit(Commands.JOIN, {room: this.room,}, (response) => this._onConnected(response));
    }

    /**
     * Starts a new connection with fresh data
     */
    private async createNewConnection(): Promise<void> {
        let response = await fetchAsync(Command.JOIN, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({room: this.room})
        });

        
    }

    /**
     * Sets up the local version and listens to server updates
     * Will notify the `onConnected` callback.
     * @param {Object} serverResponse The initial state from the server
     * @private
     */
    _onConnected(serverResponse) {
        this.doc = new Document(room, '');

        // client is not syncing anymore and is initialized
        this.syncing = false;
        this.initialized = true;
        this.timeSinceResponse = Date.now();

        // set up shadow doc, local doc and initial server version
        this.doc.sessionId = serverResponse.sessionId;
        this.doc.localCopy = serverResponse.state;
        // IMPORTANT: the shadow needs to be a deep copy of the initial version
        // because otherwise changes to the local object will also result in changes
        // to the shadow object because they are pointing to the same doc
        this.doc.shadow = this.diffPatcher.clone(serverResponse.state);
        this.doc.serverVersion = 0;

        this.socket.on('error', function () {
            if (this.initialized) {

            }
        });

        // notify about established connection
        this.emit('connected');
    }

    /**
     * Alias function for `sync`
     */
    sync() {
        if (this.offline) {
            // We can be in offline mode only after initialization
            this.offlineStore.storeData(this.doc);

        } else {
            this._schedule();
        }
    }

    /**
     * Schedule a sync cycle. This method should be used from the outside to
     * trigger syncs.
     * @private
     */
    _schedule() {
        // do nothing if already scheduled
        if (!this.scheduled) {
            this.scheduled = true;

            // try to sync now
            this._syncWithServer();
        }
    }


    /**
     * Starts a sync cycle. Should not be called from third parties
     * @private
     */
    _syncWithServer() {
        if (this.syncing || !this.initialized) {
            return false;
        }
        if (this.scheduled) {
            this.scheduled = false;
        }

        // initiate syncing cycle
        this.syncing = true;

        // 1) create a diff of local copy and shadow
        let diff = this.diffPatcher.diff(this.doc.shadow, this.doc.localCopy);
        let basedOnLocalVersion = this.doc.localVersion;

        // 2) add the difference to the local edits stack
        this.doc.edits.push(this._createDiffMessage(diff, basedOnLocalVersion));
        this.doc.localVersion++;

        // 3) create an edit message with all relevant version numbers
        let editMessage = this._createEditMessage(basedOnLocalVersion);

        // 4) apply the patch to the local shadow
        this.diffPatcher.patch(this.doc.shadow, this.diffPatcher.clone(diff));

        // 5) send the edits to the server
        this.socket.emit(Commands.SYNC, editMessage, (response) => this._applyServerEdits(response));
    }

    /**
     * Creates a message for the specified diff
     * @param  {Delta} diff          the diff that will be sent
     * @param  {Number} baseVersion the version of which the diff is based
     * @return {Object}             a diff message
     * @private
     */
    _createDiffMessage(diff, baseVersion) {
        return {
            serverVersion: this.doc.serverVersion,
            localVersion: baseVersion,
            diff: diff
        };
    }

    /**
     * Creates a message representing a set of edits
     * An edit message contains all edits since the last sync has happened.
     * @param  {Number} baseVersion The version that these edits are based on
     * @private
     */
    _createEditMessage(baseVersion) {
        return {
            room: this.room,
            sessionId: this.doc.sessionId,
            edits: this.doc.edits,
            localVersion: baseVersion,
            serverVersion: this.doc.serverVersion
        };
    }

    /**
     * Applies all edits from the server
     * @param  {Object} serverEdits The edits message
     * @private
     */
    _applyServerEdits(serverEdits) {
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

// TODO: decide on better implementation (Module rather than methods?
    startOfflineMode(editMessage) {
        // TODO: store this.doc and what else is needed
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

    _performMerge() {
        this.socket.emit(syncWithServer, editMessage, this.applyServerEdits);
    }
};

export default Client;
