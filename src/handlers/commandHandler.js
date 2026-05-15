const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '../commands');

  function readDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        readDir(fullPath);
      } else if (entry.name.endsWith('.js')) {
        const command = require(fullPath);
        if (command.data && command.execute) {
          client.commands.set(command.data.name, command);
        }
      }
    }
  }

  readDir(commandsPath);
}

module.exports = { loadCommands };
