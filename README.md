# offline-sync
Differential Synchronization based method with offline mode implemented, using diffsyncpatch to merge json objects.

## Prerequisites

Typescript project or a support of es2017 is required.

## Npm
For the typescript version:
```bash
$ npm install --save offline-sync-typed
```
For the es2017 version:
```bash
$ npm install --save offline-sync
```

## Client usage
```javascript
// Id among which state is synchronized between clients
let roomId = 'shared_document';
// Store for saving data in offline mode
let store = new LocalStorageStore('local_storage_key');
// https://github.com/benjamine/jsondiffpatch#options *Optional defaults to empty object
let jsondiffpatchOptions = {};
// Url on which commands will be syncrhonized (eg. http://server.com/state/synchronization/join) *Optional, defaults to empty string
let endpointUrl = 'state/synchronization';

let client = new Client(roomId, store, jsondiffpatchOptions, endpointUrl);

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

} catch(connectingError) {
  console.error(connectingError);
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
  getData(): ClientDocument | null;

  /**
   * Store the client data
   */
  storeData(data: ClientDocument): void;

}
```
The structure of `ClientDocument` can change in time, however it is guaranteed to be `object`.

## Server usage
```javascript
// Data adapter for storing data on the server, some database adapter is expected here
let adapter = new InMemoryDataAdapter();
// https://github.com/benjamine/jsondiffpatch#options *Optional defaults to empty object
let jsondiffpatchOptions = {};
// Url on which commands will be syncrhonized (eg. http://server.com/state/synchronization/join) *Optional, defaults to empty string
let endpointUrl = 'state/synchronization';

let server = new Server(adapter, jsondiffpatchOptions, endpointUrl);
// List of endpoints and their handlers that you can use in any http server implementation
let endpoints = server.generatedEndpoints();

endpoints.forEach(endpoint => {
  // Example usage with Express
  app.get(endpoint.url, async (request, response) => {
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
    getData(sessionId: string): ServerDocument | null;

    /**
     * Store the server side of document
     */
    storeData(sessionId: string, document: ServerDocument): void;


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