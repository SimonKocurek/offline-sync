import DataAdapter from "./data_adapter/server_data_adapter";
import { Config, DiffPatcher } from "jsondiffpatch";
import Endpoint from "./types/endpoint";
import Command from "./types/command";
import Document from "./types/document";
import { JoinMessage } from "./types/message";

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
            new Endpoint(this.endpointUrl(Command.JOIN), async (requestBody) => this.joinConnection(requestBody)),

        ]
    }

    /**
     * Joins a connection to a room and send the initial data
     * @param requestBody object with room identifier, or session Id
     */
    private async joinConnection(requestBody: object): Promise<object> {
        let payload = requestBody as JoinMessage;
        let room = this.getRoom(payload.room);

        if (payload.sessionId) {
            // Simple acknowledgment
            return {};

        } else {
            // Set up client data
            let sessionId = this.generateSessionId();
            let clientDocument = new Document(payload.room, sessionId);
            clientDocument.localCopy = this.diffPatcher.clone(room);
            clientDocument.shadow = this.diffPatcher.clone(room);

            // send the generated data
            return clientDocument;
        }
    }

    /**
     * Applies the sent edits to the shadow and the server copy, notifies all connected sockets and saves a snapshot
     * @param  {Socket} connection   The connection that sent the edits
     * @param  {Object} editMessage  The message containing all edits
     * @param  {Function} sendToClient The callback that sends the server changes back to the client
     */
    async _receiveEdit(connection, editMessage, sendToClient) {
        // -1) The algorithm actually says we should use a checksum here, I don't think that's necessary
        // 0) get the relevant doc
        let roomData = this._getRoomData(editMessage.room);
        let clientData = await this._getData(editMessage.sessionId);


        this._getData(editMessage.room, (err, doc) => {
            // 0.a) get the client versions
            let clientDoc = doc.clientVersions[connection.id];

            // no client doc could be found, client needs to re-auth
            if (err || !clientDoc) {
                connection.emit(Commands.ERROR, 'Need to re-authenticate!');
                return;
            }

            // when the versions match, remove old edits stack
            if (editMessage.serverVersion === clientDoc.shadow.serverVersion) {
                clientDoc.edits = [];
            }

            // 1) iterate over all edits
            editMessage.edits.forEach((edit) => {
                // 2) check the version numbers
                if (edit.serverVersion === clientDoc.shadow.serverVersion &&
                    edit.localVersion === clientDoc.shadow.localVersion) {
                    // versions match
                    // backup! TODO: is this the right place to do that?
                    clientDoc.backup.doc = this.diffPatcher.clone(clientDoc.shadow.doc);

                    // 3) patch the shadow
                    // var snapshot = utils.deepCopy(clientDoc.shadow.doc);
                    this.diffPatcher.patch(clientDoc.shadow.doc, this.diffPatcher.clone(edit.diff));
                    // clientDoc.shadow.doc = snapshot;

                    // apply the patch to the server's document
                    // snapshot = utils.deepCopy(doc.serverCopy);
                    this.diffPatcher.patch(doc.serverCopy, this.diffPatcher.clone(edit.diff));
                    // doc.serverCopy = snapshot;

                    // 3.a) increase the version number for the shadow if diff not empty
                    if (!isEmpty(edit.diff)) {
                        clientDoc.shadow.localVersion++;
                    }
                } else {
                    // TODO: implement backup workflow
                    // has a low priority since `packets are not lost` - but don't quote me on that :P
                    console.log('error', 'patch rejected!!', edit.serverVersion, '->', clientDoc.shadow.serverVersion, ':',
                        edit.localVersion, '->', clientDoc.shadow.localVersion);
                }
            });

            // 4) save a snapshot of the document
            this.saveSnapshot(editMessage.room);

            // notify all sockets about the update, if not empty
            if (editMessage.edits.length > 0) {
                this.transport.to(editMessage.room).emit(Commands.SYNC, connection.id);
            }

            this.sendServerChanges(doc, clientDoc, sendToClient);
        });
    }

// TODO send diff to the server that probably never got there
    saveSnapshot(room) {
        let noRequestInProgress = !this.saveRequests[room],
            checkQueueAndSaveAgain = () => {
                // if another save request is in the queue, save again
                let anotherRequestScheduled = this.saveQueue[room] === true;
                this.saveRequests[room] = false;
                if (anotherRequestScheduled) {
                    this.saveQueue[room] = false;
                    this.saveSnapshot(room);
                }
            };

        // only save if no save going on at the moment
        if (noRequestInProgress) {
            this.saveRequests[room] = true;
            // get data for saving
            this.getData(room, (err, data) => {
                // store data
                if (!err && data) {
                    this.persistenceAdapter.storeData(room, data.serverCopy, checkQueueAndSaveAgain);
                } else {
                    checkQueueAndSaveAgain();
                }
            });
        } else {
            // schedule a new save request
            this.saveQueue[room] = true;
        }
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

    private getRoom(roomId: string): object {
        if (!this.persistenceAdapter.hasRoom(roomId)) {
            this.persistenceAdapter.storeRoom(roomId, {});
        }

        return this.persistenceAdapter.getRoom(roomId) || {};
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
