# offline-sync
Differential Synchronization based method with offline mode implemented, using diffsyncpatch to merge json objects.

## Prerequisites

Typescript project or a support of es2017 is required.

## Installation
```bash
$ npm install --save offline-sync
```

```javascript
const offlineSync = require('offline-sync');
```

## Client usage

### Options
```javascript
// Id among which state is synchronized between clients
let roomId = 'shared_document';

// Store for saving data in offline mode
let store = new offlineSync.LocalStorageStore('local_storage_key');

// On significant state conflicts this function is called to let user manually perform merge
let onUserMerge = (clientState, serverState) => {
  // show screen similiar to git's diffviewers
  // This can consist of 3 richText editors, like Quill
  let [leftEditor, middleEditor, rightEditor, submitButton] = showMergeScreen();

  leftEditor.setContents(clientState);
  leftEditor.editor.disable(); // make read-only

  // This is where the merging happens
  middleEditor.setContents(serverState);

  rightEditor.setContents(serverState);
  rightEditor.editor.disable(); // make read-only

  // Wait for submit click
  let mergeSubmit = new Promise((resolve, reject) => {
    submitButton.addEventListener('click', event => {
      // On click take a snapshot of edited content
      let mergedState = middleEditor.getContents();
      resolve(mergedState);
    }, {once: true});
  });

  return mergeSubmit;
};

// https://github.com/benjamine/jsondiffpatch#options
// Optional: defaults to empty object
let jsondiffpatchOptions = {};

// Url on which commands will be syncrhonized (eg. http://server.com/state/synchronization/join)
// Optional: defaults to empty string
let endpointUrl = 'state/synchronization';
```

### Example
```javascript
let client = new offlineSync.Client(roomId, store, onUserMerge, jsondiffpatchOptions, endpointUrl);

try {
  let document = client.initialize();

  // change the document JSON object any way you want
  ...
  // After some document changes:
  await client.sync();
  ...
  // document will now be synchronized between client and server
  // this synchronization is guaranteed, even after packets get dropped or connection lost for some time,
  // the sync will recover
  await client.sync();
  ...
  // To fetch the server changes also use sync
  await client.sync();
  ...
  // Await is needed to wait for syncing to finish, multiple syncs cannot run in parallel
  client.sync(); // runs
  client.sync(); // prints to console that syncing is already in progress

} catch(error) {
  console.error(error);
}
```

### Store interface
To implement your own client side store interface has to be met:
```typescript
/**
 * Interface for client side data persistence. Can use localstorage, sessionstorage, indexDb, cookies
 * or just in memory, if offline mode is not needed.
 */
interface LocalStore {

  /**
   * Data are present on the browser
   */
  hasData(): boolean;

  /**
   * Clears data so that next time hasData retuns false
   */
  clearData(): void;

  /**
   * Get the client data
   */
  getData(): Document | null;

  /**
   * Store the client data
   */
  storeData(data: Document): void;

}
```
The structure of `Document` can change in time, however it is guaranteed to be of `object` type.

## Server Usage

### Options
```javascript
// Data adapter for storing data on the server, some database adapter is expected here
let adapter = new offlineSync.InMemoryDataAdapter();

// https://github.com/benjamine/jsondiffpatch#options
// Optional: defaults to empty object
let jsondiffpatchOptions = {};

// Url on which commands will be syncrhonized (eg. http://server.com/state/synchronization/join)
// Optional: defaults to empty string
let endpointUrl = 'state/synchronization';
```

### Example
```javascript
let server = new offlineSync.Server(adapter, jsondiffpatchOptions, endpointUrl);
// List of endpoints and their handlers that you can use in any http server implementation
let endpoints = server.generatedEndpoints();

endpoints.forEach(endpoint => {
  // Example usage with Express
  app.post(endpoint.url, async (request, response) => {
    try {
      // request.body has to be JSON
      let result = await endpoint.process(request.body);
      response.json(result);

    } catch (error) {
      // this will eventually be handled by your error handling middleware
      next(error);
    }
  });
});
```

### Data Adapter Interface
To implement a way server side data is stored, create a class using this interface:
```typescript
/**
 * Interface for communicating with persistence layer, saving entities of type Document and State
 * Server side provides no caching, so if you require it, please implement it here.
 */
interface DataAdapter {

    /**
     * Server side of document is present
     */
    hasData(sessionId: string): boolean;

    /**
     * Get the server side of document
     */
    getData(sessionId: string): Document | null;

    /**
     * Store the server side of document
     */
    storeData(sessionId: string, document: Document): void;


    /**
     * Document synchronized across clients with id exists
     */
    hasRoom(roomId: string): boolean;

    /**
     * Get document synchronized across clients by id
     */
    getRoom(roomId: string): object |null;

    /**
     * Store Document synchronized across clients
     */
    storeRoom(roomId: string, room: object): void;

    /**
     * Optional implementation of getting unique id using database.
     * Default implementation generates a UUID v4
     */
    generateSessionId?(): string;

}
```