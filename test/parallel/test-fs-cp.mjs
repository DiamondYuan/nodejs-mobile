import { mustCall, isIOS, isAndroid } from '../common/index.mjs';
import { path as fixturesPath } from '../common/fixtures.mjs'; // nodejs-mobile patch

import assert from 'assert';
import fs from 'fs';
const {
  cp,
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  statSync,
  writeFileSync,
} = fs;
import net from 'net';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { setTimeout } from 'timers/promises';

const isWindows = process.platform === 'win32';
import tmpdir from '../common/tmpdir.js';
tmpdir.refresh();

let dirc = 0;
function nextdir() {
  return join(tmpdir.path, `copy_${++dirc}`);
}

// Synchronous implementation of copy.

// It copies a nested folder structure with files and folders.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cpSync(src, dest, { recursive: true });
  assertDirEquivalent(src, dest);
}

// It does not throw errors when directory is copied over and force is false.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  writeFileSync(join(src, 'README.md'), 'hello world', 'utf8');
  const dest = nextdir();
  cpSync(src, dest, { recursive: true });
  const initialStat = lstatSync(join(dest, 'README.md'));
  cpSync(src, dest, { force: false, recursive: true });
  // File should not have been copied over, so access times will be identical:
  assertDirEquivalent(src, dest);
  const finalStat = lstatSync(join(dest, 'README.md'));
  assert.strictEqual(finalStat.ctime.getTime(), initialStat.ctime.getTime());
}

// It overwrites existing files if force is true.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'README.md'), '# Goodbye', 'utf8');
  cpSync(src, dest, { recursive: true });
  assertDirEquivalent(src, dest);
  const content = readFileSync(join(dest, 'README.md'), 'utf8');
  assert.strictEqual(content.trim(), '# Hello');
}

// It does not fail if the same directory is copied to dest twice,
// when dereference is true, and force is false (fails silently).
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  const destFile = join(dest, 'a/b/README2.md');
  cpSync(src, dest, { dereference: true, recursive: true });
  cpSync(src, dest, { dereference: true, recursive: true });
  const stat = lstatSync(destFile);
  assert(stat.isFile());
}


// It copies file itself, rather than symlink, when dereference is true.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'foo.js'), 'foo', 'utf8');
  symlinkSync(join(src, 'foo.js'), join(src, 'bar.js'));

  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  const destFile = join(dest, 'foo.js');

  cpSync(join(src, 'bar.js'), destFile, { dereference: true, recursive: true });
  const stat = lstatSync(destFile);
  assert(stat.isFile());
}


// It throws error when verbatimSymlinks is not a boolean.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  [1, [], {}, null, 1n, undefined, null, Symbol(), '', () => {}]
    .forEach((verbatimSymlinks) => {
      assert.throws(
        () => cpSync(src, src, { verbatimSymlinks }),
        { code: 'ERR_INVALID_ARG_TYPE' }
      );
    });
}


// It throws an error when both dereference and verbatimSymlinks are enabled.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  assert.throws(
    () => cpSync(src, src, { dereference: true, verbatimSymlinks: true }),
    { code: 'ERR_INCOMPATIBLE_OPTION_PAIR' }
  );
}


// It resolves relative symlinks to their absolute path by default.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'foo.js'), 'foo', 'utf8');
  symlinkSync('foo.js', join(src, 'bar.js'));

  const dest = nextdir();
  mkdirSync(dest, { recursive: true });

  cpSync(src, dest, { recursive: true });
  const link = readlinkSync(join(dest, 'bar.js'));
  assert.strictEqual(link, join(src, 'foo.js'));
}


// It resolves relative symlinks when verbatimSymlinks is false.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'foo.js'), 'foo', 'utf8');
  symlinkSync('foo.js', join(src, 'bar.js'));

  const dest = nextdir();
  mkdirSync(dest, { recursive: true });

  cpSync(src, dest, { recursive: true, verbatimSymlinks: false });
  const link = readlinkSync(join(dest, 'bar.js'));
  assert.strictEqual(link, join(src, 'foo.js'));
}


// It does not resolve relative symlinks when verbatimSymlinks is true.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'foo.js'), 'foo', 'utf8');
  symlinkSync('foo.js', join(src, 'bar.js'));

  const dest = nextdir();
  mkdirSync(dest, { recursive: true });

  cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
  const link = readlinkSync(join(dest, 'bar.js'));
  assert.strictEqual(link, 'foo.js');
}


// It throws error when src and dest are identical.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  assert.throws(
    () => cpSync(src, src),
    { code: 'ERR_FS_CP_EINVAL' }
  );
}

// It throws error if symlink in src points to location in dest.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  const dest = nextdir();
  mkdirSync(dest);
  symlinkSync(dest, join(src, 'link'));
  cpSync(src, dest, { recursive: true });
  assert.throws(
    () => cpSync(src, dest, { recursive: true }),
    {
      code: 'ERR_FS_CP_EINVAL'
    }
  );
}

// It throws error if symlink in dest points to location in src.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  symlinkSync(join(src, 'a', 'b'), join(src, 'a', 'c'));

  const dest = nextdir();
  mkdirSync(join(dest, 'a'), { recursive: true });
  symlinkSync(src, join(dest, 'a', 'c'));
  assert.throws(
    () => cpSync(src, dest, { recursive: true }),
    { code: 'ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY' }
  );
}

// It throws error if parent directory of symlink in dest points to src.
{
  const src = nextdir();
  mkdirSync(join(src, 'a'), { recursive: true });
  const dest = nextdir();
  // Create symlink in dest pointing to src.
  const destLink = join(dest, 'b');
  mkdirSync(dest, { recursive: true });
  symlinkSync(src, destLink);
  assert.throws(
    () => cpSync(src, join(dest, 'b', 'c')),
    { code: 'ERR_FS_CP_EINVAL' }
  );
}

// It throws error if attempt is made to copy directory to file.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  const dest = fixturesPath('copy/kitchen-sink/README.md'); // nodejs-mobile patch
  assert.throws(
    () => cpSync(src, dest),
    { code: 'ERR_FS_CP_DIR_TO_NON_DIR' }
  );
}

// It allows file to be copied to a file path.
{
  const srcFile = fixturesPath('copy/kitchen-sink/index.js'); // nodejs-mobile patch
  const destFile = join(nextdir(), 'index.js');
  cpSync(srcFile, destFile, { dereference: true });
  const stat = lstatSync(destFile);
  assert(stat.isFile());
}

// It throws error if directory copied without recursive flag.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  assert.throws(
    () => cpSync(src, dest),
    { code: 'ERR_FS_EISDIR' }
  );
}


// It throws error if attempt is made to copy file to directory.
{
  const src = fixturesPath('copy/kitchen-sink/README.md'); // nodejs-mobile patch
  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  assert.throws(
    () => cpSync(src, dest),
    { code: 'ERR_FS_CP_NON_DIR_TO_DIR' }
  );
}

// It throws error if attempt is made to copy to subdirectory of self.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = fixturesPath('copy/kitchen-sink/a'); // nodejs-mobile patch
  assert.throws(
    () => cpSync(src, dest),
    { code: 'ERR_FS_CP_EINVAL' }
  );
}

// It throws an error if attempt is made to copy socket.
if (!isWindows && !isIOS && !isAndroid) {
  const dest = nextdir();
  const sock = `${process.pid}.sock`;
  const server = net.createServer();
  server.listen(sock);
  assert.throws(
    () => cpSync(sock, dest),
    { code: 'ERR_FS_CP_SOCKET' }
  );
  server.close();
}

// It copies timestamps from src to dest if preserveTimestamps is true.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cpSync(src, dest, { preserveTimestamps: true, recursive: true });
  assertDirEquivalent(src, dest);
  const srcStat = lstatSync(join(src, 'index.js'));
  const destStat = lstatSync(join(dest, 'index.js'));
  assert.strictEqual(srcStat.mtime.getTime(), destStat.mtime.getTime());
}

// It applies filter function.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cpSync(src, dest, {
    filter: (path) => {
      const pathStat = statSync(path);
      return pathStat.isDirectory() || path.endsWith('.js');
    },
    dereference: true,
    recursive: true,
  });
  const destEntries = [];
  collectEntries(dest, destEntries);
  for (const entry of destEntries) {
    assert.strictEqual(
      entry.isDirectory() || entry.name.endsWith('.js'),
      true
    );
  }
}

// It throws error if filter function is asynchronous.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  assert.throws(() => {
    cpSync(src, dest, {
      filter: async (path) => {
        await setTimeout(5, 'done');
        const pathStat = statSync(path);
        return pathStat.isDirectory() || path.endsWith('.js');
      },
      dereference: true,
      recursive: true,
    });
  }, { code: 'ERR_INVALID_RETURN_VALUE' });
}

// It throws error if errorOnExist is true, force is false, and file or folder
// copied over.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cpSync(src, dest, { recursive: true });
  assert.throws(
    () => cpSync(src, dest, {
      dereference: true,
      errorOnExist: true,
      force: false,
      recursive: true,
    }),
    { code: 'ERR_FS_CP_EEXIST' }
  );
}

// It throws EEXIST error if attempt is made to copy symlink over file.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  symlinkSync(join(src, 'a', 'b'), join(src, 'a', 'c'));

  const dest = nextdir();
  mkdirSync(join(dest, 'a'), { recursive: true });
  writeFileSync(join(dest, 'a', 'c'), 'hello', 'utf8');
  assert.throws(
    () => cpSync(src, dest, { recursive: true }),
    { code: 'EEXIST' }
  );
}

// It makes file writeable when updating timestamp, if not writeable.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(src, 'foo.txt'), 'foo', { mode: 0o444 });
  cpSync(src, dest, { preserveTimestamps: true, recursive: true });
  assertDirEquivalent(src, dest);
  const srcStat = lstatSync(join(src, 'foo.txt'));
  const destStat = lstatSync(join(dest, 'foo.txt'));
  assert.strictEqual(srcStat.mtime.getTime(), destStat.mtime.getTime());
}

// It copies link if it does not point to folder in src.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  symlinkSync(src, join(src, 'a', 'c'));
  const dest = nextdir();
  mkdirSync(join(dest, 'a'), { recursive: true });
  symlinkSync(dest, join(dest, 'a', 'c'));
  cpSync(src, dest, { recursive: true });
  const link = readlinkSync(join(dest, 'a', 'c'));
  assert.strictEqual(link, src);
}

// It accepts file URL as src and dest.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cpSync(pathToFileURL(src), pathToFileURL(dest), { recursive: true });
  assertDirEquivalent(src, dest);
}

// It throws if options is not object.
{
  assert.throws(
    () => cpSync('a', 'b', () => {}),
    { code: 'ERR_INVALID_ARG_TYPE' }
  );
}

// Callback implementation of copy.

// It copies a nested folder structure with files and folders.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cp(src, dest, { recursive: true }, mustCall((err) => {
    assert.strictEqual(err, null);
    assertDirEquivalent(src, dest);
  }));
}

// It does not throw errors when directory is copied over and force is false.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  writeFileSync(join(src, 'README.md'), 'hello world', 'utf8');
  const dest = nextdir();
  cpSync(src, dest, { dereference: true, recursive: true });
  const initialStat = lstatSync(join(dest, 'README.md'));
  cp(src, dest, {
    dereference: true,
    force: false,
    recursive: true,
  }, mustCall((err) => {
    assert.strictEqual(err, null);
    assertDirEquivalent(src, dest);
    // File should not have been copied over, so access times will be identical:
    const finalStat = lstatSync(join(dest, 'README.md'));
    assert.strictEqual(finalStat.ctime.getTime(), initialStat.ctime.getTime());
  }));
}

// It overwrites existing files if force is true.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'README.md'), '# Goodbye', 'utf8');

  cp(src, dest, { recursive: true }, mustCall((err) => {
    assert.strictEqual(err, null);
    assertDirEquivalent(src, dest);
    const content = readFileSync(join(dest, 'README.md'), 'utf8');
    assert.strictEqual(content.trim(), '# Hello');
  }));
}

// It does not fail if the same directory is copied to dest twice,
// when dereference is true, and force is false (fails silently).
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  const destFile = join(dest, 'a/b/README2.md');
  cpSync(src, dest, { dereference: true, recursive: true });
  cp(src, dest, {
    dereference: true,
    recursive: true
  }, mustCall((err) => {
    assert.strictEqual(err, null);
    const stat = lstatSync(destFile);
    assert(stat.isFile());
  }));
}

// It copies file itself, rather than symlink, when dereference is true.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'foo.js'), 'foo', 'utf8');
  symlinkSync(join(src, 'foo.js'), join(src, 'bar.js'));

  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  const destFile = join(dest, 'foo.js');

  cp(join(src, 'bar.js'), destFile, { dereference: true },
     mustCall((err) => {
       assert.strictEqual(err, null);
       const stat = lstatSync(destFile);
       assert(stat.isFile());
     })
  );
}

// It returns error when src and dest are identical.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  cp(src, src, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_EINVAL');
  }));
}

// It returns error if symlink in src points to location in dest.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  const dest = nextdir();
  mkdirSync(dest);
  symlinkSync(dest, join(src, 'link'));
  cpSync(src, dest, { recursive: true });
  cp(src, dest, { recursive: true }, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_EINVAL');
  }));
}

// It returns error if symlink in dest points to location in src.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  symlinkSync(join(src, 'a', 'b'), join(src, 'a', 'c'));

  const dest = nextdir();
  mkdirSync(join(dest, 'a'), { recursive: true });
  symlinkSync(src, join(dest, 'a', 'c'));
  cp(src, dest, { recursive: true }, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY');
  }));
}

// It returns error if parent directory of symlink in dest points to src.
{
  const src = nextdir();
  mkdirSync(join(src, 'a'), { recursive: true });
  const dest = nextdir();
  // Create symlink in dest pointing to src.
  const destLink = join(dest, 'b');
  mkdirSync(dest, { recursive: true });
  symlinkSync(src, destLink);
  cp(src, join(dest, 'b', 'c'), mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_EINVAL');
  }));
}

// It returns error if attempt is made to copy directory to file.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  const dest = fixturesPath('copy/kitchen-sink/README.md'); // nodejs-mobile patch
  cp(src, dest, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_DIR_TO_NON_DIR');
  }));
}

// It allows file to be copied to a file path.
{
  const srcFile = fixturesPath('copy/kitchen-sink/README.md'); // nodejs-mobile patch
  const destFile = join(nextdir(), 'index.js');
  cp(srcFile, destFile, { dereference: true }, mustCall((err) => {
    assert.strictEqual(err, null);
    const stat = lstatSync(destFile);
    assert(stat.isFile());
  }));
}

// It returns error if directory copied without recursive flag.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cp(src, dest, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_EISDIR');
  }));
}

// It returns error if attempt is made to copy file to directory.
{
  const src = fixturesPath('copy/kitchen-sink/README.md'); // nodejs-mobile patch
  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  cp(src, dest, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_NON_DIR_TO_DIR');
  }));
}

// It returns error if attempt is made to copy to subdirectory of self.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = fixturesPath('copy/kitchen-sink/a'); // nodejs-mobile patch
  cp(src, dest, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_EINVAL');
  }));
}

// It returns an error if attempt is made to copy socket.
if (!isWindows && !isIOS && !isAndroid) {
  const dest = nextdir();
  const sock = `${process.pid}.sock`;
  const server = net.createServer();
  server.listen(sock);
  cp(sock, dest, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_SOCKET');
    server.close();
  }));
}

// It copies timestamps from src to dest if preserveTimestamps is true.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cp(src, dest, {
    preserveTimestamps: true,
    recursive: true
  }, mustCall((err) => {
    assert.strictEqual(err, null);
    assertDirEquivalent(src, dest);
    const srcStat = lstatSync(join(src, 'index.js'));
    const destStat = lstatSync(join(dest, 'index.js'));
    assert.strictEqual(srcStat.mtime.getTime(), destStat.mtime.getTime());
  }));
}

// It applies filter function.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cp(src, dest, {
    filter: (path) => {
      const pathStat = statSync(path);
      return pathStat.isDirectory() || path.endsWith('.js');
    },
    dereference: true,
    recursive: true,
  }, mustCall((err) => {
    assert.strictEqual(err, null);
    const destEntries = [];
    collectEntries(dest, destEntries);
    for (const entry of destEntries) {
      assert.strictEqual(
        entry.isDirectory() || entry.name.endsWith('.js'),
        true
      );
    }
  }));
}

// It supports async filter function.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cp(src, dest, {
    filter: async (path) => {
      await setTimeout(5, 'done');
      const pathStat = statSync(path);
      return pathStat.isDirectory() || path.endsWith('.js');
    },
    dereference: true,
    recursive: true,
  }, mustCall((err) => {
    assert.strictEqual(err, null);
    const destEntries = [];
    collectEntries(dest, destEntries);
    for (const entry of destEntries) {
      assert.strictEqual(
        entry.isDirectory() || entry.name.endsWith('.js'),
        true
      );
    }
  }));
}

// It returns error if errorOnExist is true, force is false, and file or folder
// copied over.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cpSync(src, dest, { recursive: true });
  cp(src, dest, {
    dereference: true,
    errorOnExist: true,
    force: false,
    recursive: true,
  }, mustCall((err) => {
    assert.strictEqual(err.code, 'ERR_FS_CP_EEXIST');
  }));
}

// It returns EEXIST error if attempt is made to copy symlink over file.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  symlinkSync(join(src, 'a', 'b'), join(src, 'a', 'c'));

  const dest = nextdir();
  mkdirSync(join(dest, 'a'), { recursive: true });
  writeFileSync(join(dest, 'a', 'c'), 'hello', 'utf8');
  cp(src, dest, { recursive: true }, mustCall((err) => {
    assert.strictEqual(err.code, 'EEXIST');
  }));
}

// It makes file writeable when updating timestamp, if not writeable.
{
  const src = nextdir();
  mkdirSync(src, { recursive: true });
  const dest = nextdir();
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(src, 'foo.txt'), 'foo', { mode: 0o444 });
  cp(src, dest, {
    preserveTimestamps: true,
    recursive: true,
  }, mustCall((err) => {
    assert.strictEqual(err, null);
    assertDirEquivalent(src, dest);
    const srcStat = lstatSync(join(src, 'foo.txt'));
    const destStat = lstatSync(join(dest, 'foo.txt'));
    assert.strictEqual(srcStat.mtime.getTime(), destStat.mtime.getTime());
  }));
}

// It copies link if it does not point to folder in src.
{
  const src = nextdir();
  mkdirSync(join(src, 'a', 'b'), { recursive: true });
  symlinkSync(src, join(src, 'a', 'c'));
  const dest = nextdir();
  mkdirSync(join(dest, 'a'), { recursive: true });
  symlinkSync(dest, join(dest, 'a', 'c'));
  cp(src, dest, { recursive: true }, mustCall((err) => {
    assert.strictEqual(err, null);
    const link = readlinkSync(join(dest, 'a', 'c'));
    assert.strictEqual(link, src);
  }));
}

// It accepts file URL as src and dest.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  cp(pathToFileURL(src), pathToFileURL(dest), { recursive: true },
     mustCall((err) => {
       assert.strictEqual(err, null);
       assertDirEquivalent(src, dest);
     }));
}

// It throws if options is not object.
{
  assert.throws(
    () => cp('a', 'b', 'hello', () => {}),
    { code: 'ERR_INVALID_ARG_TYPE' }
  );
}

// Promises implementation of copy.

// It copies a nested folder structure with files and folders.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  const p = await fs.promises.cp(src, dest, { recursive: true });
  assert.strictEqual(p, undefined);
  assertDirEquivalent(src, dest);
}

// It accepts file URL as src and dest.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  const p = await fs.promises.cp(
    pathToFileURL(src),
    pathToFileURL(dest),
    { recursive: true }
  );
  assert.strictEqual(p, undefined);
  assertDirEquivalent(src, dest);
}

// It allows async error to be caught.
{
  const src = fixturesPath('copy/kitchen-sink'); // nodejs-mobile patch
  const dest = nextdir();
  await fs.promises.cp(src, dest, { recursive: true });
  await assert.rejects(
    fs.promises.cp(src, dest, {
      dereference: true,
      errorOnExist: true,
      force: false,
      recursive: true,
    }),
    { code: 'ERR_FS_CP_EEXIST' }
  );
}

// It rejects if options is not object.
{
  await assert.rejects(
    fs.promises.cp('a', 'b', () => {}),
    { code: 'ERR_INVALID_ARG_TYPE' }
  );
}

function assertDirEquivalent(dir1, dir2) {
  const dir1Entries = [];
  collectEntries(dir1, dir1Entries);
  const dir2Entries = [];
  collectEntries(dir2, dir2Entries);
  assert.strictEqual(dir1Entries.length, dir2Entries.length);
  for (const entry1 of dir1Entries) {
    const entry2 = dir2Entries.find((entry) => {
      return entry.name === entry1.name;
    });
    assert(entry2, `entry ${entry2.name} not copied`);
    if (entry1.isFile()) {
      assert(entry2.isFile(), `${entry2.name} was not file`);
    } else if (entry1.isDirectory()) {
      assert(entry2.isDirectory(), `${entry2.name} was not directory`);
    } else if (entry1.isSymbolicLink()) {
      assert(entry2.isSymbolicLink(), `${entry2.name} was not symlink`);
    }
  }
}

function collectEntries(dir, dirEntries) {
  const newEntries = readdirSync(dir, { withFileTypes: true });
  for (const entry of newEntries) {
    if (entry.isDirectory()) {
      collectEntries(join(dir, entry.name), dirEntries);
    }
  }
  dirEntries.push(...newEntries);
}
