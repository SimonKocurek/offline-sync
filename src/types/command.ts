enum Command {
  // Start the communication
  JOIN = 'diffsync-join',

  // Ping to check if server is available
  PING = 'diffsync-ping',

  // Synchronization request
  SYNC ='diffsync-updated-doc'
}

export default Command;
