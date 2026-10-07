// Runs the @nestjs/swagger CLI plugin inside ts-jest, with the same options
// nest build uses (read from nest-cli.json), so tests see the same OpenAPI
// metadata as the real app.
const plugin = require('@nestjs/swagger/plugin');
const nestCli = require('../nest-cli.json');

const { options } = nestCli.compilerOptions.plugins.find(
  (p) => p.name === '@nestjs/swagger',
);

module.exports.name = 'nestjs-swagger-plugin';
// Bump to invalidate ts-jest's cache when the options change.
module.exports.version = 1;
module.exports.factory = (tsCompiler) =>
  plugin.before(options, tsCompiler.program);
