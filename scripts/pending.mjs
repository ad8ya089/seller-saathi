const [command = 'command', phase = 'a later phase'] = process.argv.slice(2);
console.error(`${command}: pending ${phase}; not implemented yet.`);
process.exitCode = 1;
