import Server from '../server';
import InMemoryDataAdapter from '../data_adapter/in_memory_data_adapter';

describe('Server', () => {

    it('Can be created and returns endpoints', () => {
        let server = new Server(new InMemoryDataAdapter());
        server.generatedEndpoints();
    });

});
