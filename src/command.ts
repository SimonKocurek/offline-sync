enum Command {
  // Start the communication
  JOIN = 'diffsync-join',

  // Ping to check if server is available
  PING = 'diffsync-ping',

  // Synchronization request
  SYNC ='diffsync-updated-doc',

  // Request was invalid
  ERROR ='diffsync-error'
}

export default Command;
