import Client from '../client';
import LocalStore from '../offline_store/client_offline_store';
import { Document } from '../types/document';

describe('Client', () => {

    it('can be created', async () => {
        let client = new Client('', new StoreMock(), (a) => new Promise((resolve) => resolve(a)));
        await client.sync();
    });

});

class StoreMock implements LocalStore {
    hasData(): boolean {
        return false;
    }
    clearData(): void {}
    getData(): Document {
        throw new Error("Method not implemented.");
    }
    storeData(): void {}
}
