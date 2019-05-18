module.exports = {
    Client: require('dist/client'),
    Server: require('dist/client'),
    InMemoryDataAdapter: require('dist/data_adapter/in_memory_data_adapter'),
    LocalStorageStore: require('dist/offline_store/local_storage_store')
};
