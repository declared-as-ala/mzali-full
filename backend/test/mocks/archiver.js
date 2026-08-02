/**
 * CommonJS stand-in for the `archiver` package (ships as pure ESM as of v8,
 * which Jest's CJS runtime can't require). Integration tests never exercise
 * loyalty card ZIP export, but AppModule transitively imports it — this stub
 * only needs to be import-able, not functional.
 */
class Archiver {}
class ZipArchive extends Archiver {}
class TarArchive extends Archiver {}
class JsonArchive extends Archiver {}

module.exports = { Archiver, ZipArchive, TarArchive, JsonArchive };
