const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getAbi } = require('node-abi');

function parseArgs(argv) {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }

    const [key, value] = arg.slice(2).split('=');
    options[key] = value === undefined ? true : value;
  }

  return options;
}

function runNodeGyp(moduleRoot, args) {
  const nodeGypCli = require.resolve('node-gyp/bin/node-gyp.js', {
    paths: [moduleRoot]
  });

  execFileSync(process.execPath, [nodeGypCli, ...args], {
    cwd: moduleRoot,
    stdio: 'inherit'
  });
}

function copyFile(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function readAddonFiles(releaseDir) {
  return fs.readdirSync(releaseDir)
    .filter(fileName => fileName.endsWith('.node'));
}

function readArchitectures(addonPath) {
  return execFileSync('lipo', ['-archs', addonPath], {
    encoding: 'utf8'
  }).trim().split(/\s+/);
}

function patchGeneratedMakefiles(moduleRoot, compilerArch) {
  const buildDir = path.join(moduleRoot, 'build');
  if (!fs.existsSync(buildDir)) {
    return;
  }

  for (const fileName of fs.readdirSync(buildDir)) {
    if (!fileName.endsWith('.mk')) {
      continue;
    }

    const filePath = path.join(buildDir, fileName);
    const original = fs.readFileSync(filePath, 'utf8');
    const patched = original.replace(/\bi386\b/g, compilerArch);

    if (patched !== original) {
      fs.writeFileSync(filePath, patched);
    }
  }
}

function buildArgs(runtime, target, distUrl, targetArch) {
  const args = [];

  if (target) {
    args.push(`--target=${target}`);
  }

  args.push(`--arch=${targetArch}`);

  if (runtime) {
    args.push(`--runtime=${runtime}`);
  }

  if (distUrl) {
    args.push(`--dist-url=${distUrl}`);
  }

  args.push('--build-from-source');

  return args;
}

function rebuildForArch(moduleRoot, runtime, target, distUrl, targetArch, compilerArch) {
  fs.rmSync(path.join(moduleRoot, 'build'), { recursive: true, force: true });

  const args = buildArgs(runtime, target, distUrl, targetArch);
  runNodeGyp(moduleRoot, ['configure', ...args]);
  patchGeneratedMakefiles(moduleRoot, compilerArch);
  runNodeGyp(moduleRoot, ['build', ...args]);
}

function main() {
  if (process.platform !== 'darwin') {
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const moduleRoot = path.resolve(__dirname, '..');
  const packageJson = require(path.join(moduleRoot, 'package.json'));
  const runtime = options.runtime || process.env.npm_config_runtime || 'node';
  const target = options.target || process.env.npm_config_target || process.versions.node;
  const distUrl = options['dist-url'] || process.env.npm_config_disturl || (runtime === 'electron'
    ? 'https://www.electronjs.org/headers'
    : undefined);
  const releaseDir = path.join(moduleRoot, 'build', 'Release');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-notification-state-'));
  const targetArchitectures = [
    { nodeArch: 'x64', compilerArch: 'x86_64' },
    { nodeArch: 'arm64', compilerArch: 'arm64' }
  ];

  for (const targetArch of targetArchitectures) {
    rebuildForArch(
      moduleRoot,
      runtime,
      target,
      distUrl,
      targetArch.nodeArch,
      targetArch.compilerArch
    );

    if (!fs.existsSync(releaseDir)) {
      throw new Error(`Expected native build output at ${releaseDir}`);
    }

    const addonFiles = readAddonFiles(releaseDir);
    if (addonFiles.length === 0) {
      throw new Error(`No native addon files were produced in ${releaseDir}`);
    }

    for (const addonFile of addonFiles) {
      copyFile(
        path.join(releaseDir, addonFile),
        path.join(tempRoot, targetArch.nodeArch, addonFile)
      );
    }
  }

  const runtimeName = runtime === 'electron' ? 'electron' : 'node';
  const abi = getAbi(target, runtimeName);
  const addonFiles = readAddonFiles(path.join(tempRoot, 'arm64'));

  for (const addonFile of addonFiles) {
    const outputPath = path.join(releaseDir, addonFile);
    const x64Path = path.join(tempRoot, 'x64', addonFile);
    const arm64Path = path.join(tempRoot, 'arm64', addonFile);

    execFileSync('lipo', ['-create', '-output', outputPath, x64Path, arm64Path]);

    for (const targetArch of targetArchitectures) {
      copyFile(
        outputPath,
        path.join(moduleRoot, 'bin', `darwin-${targetArch.nodeArch}-${abi}`, addonFile)
      );
    }

    const archs = readArchitectures(outputPath);
    if (!archs.includes('x86_64') || !archs.includes('arm64')) {
      throw new Error(
        `${packageJson.name}/${addonFile} must be a universal binary, found architectures: ${archs.join(', ')}`
      );
    }
  }
}

if (require.main === module) {
  main();
}