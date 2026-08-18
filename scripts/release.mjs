#!/usr/bin/env node
/**
 * Preparation d'une version.
 *
 *   npm run release:patch   0.2.0 -> 0.2.1
 *   npm run release:minor   0.2.0 -> 0.3.0
 *   npm run release:major   0.2.0 -> 1.0.0
 *
 * Le script :
 *   1. verifie que le depot est propre et qu'on n'est pas sur la branche de production ;
 *   2. lance les tests puis le build ;
 *   3. met a jour la version dans package.json (source unique, cf. §11) ;
 *   4. bascule la rubrique « Non publie » du CHANGELOG vers la nouvelle version ;
 *   5. cree le commit et le tag.
 *
 * Il ne pousse RIEN : la mise en production reste une decision explicite (§50).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_BRANCH = 'main';

const bump = process.argv[2];
if (!['patch', 'minor', 'major'].includes(bump)) {
  fail('Usage : npm run release:patch | release:minor | release:major');
}

/**
 * Execute une commande sans passer par un shell.
 *
 * `shell: true` serait fatal ici : sous Windows, les arguments sont alors
 * reassembles en une seule ligne de commande, et un message de commit contenant
 * des espaces se retrouve decoupe en plusieurs arguments — git interprete alors
 * la fin du message comme un nom de fichier et echoue.
 *
 * Seul npm a besoin d'un traitement particulier : c'est un script `.cmd` sous
 * Windows, que execFile ne sait pas lancer sous son nom court.
 */
function run(command, args, { capture = false } = {}) {
  const binary = command === 'npm' && process.platform === 'win32' ? 'npm.cmd' : command;

  return execFileSync(binary, args, {
    cwd: rootDir,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
}

function fail(message) {
  console.error(`\n[release] ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* 1. Verifications                                                    */
/* ------------------------------------------------------------------ */

const status = run('git', ['status', '--porcelain'], { capture: true }).trim();
if (status) {
  fail('Le depot contient des modifications non validees. Commite-les avant la release.');
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }).trim();
if (branch === PRODUCTION_BRANCH) {
  fail(
    `Prepare la version depuis « develop », pas depuis « ${PRODUCTION_BRANCH} ».\n` +
      `La mise en production se fait ensuite par un merge de develop vers ${PRODUCTION_BRANCH}.`,
  );
}

/* ------------------------------------------------------------------ */
/* 2. Tests et build                                                   */
/* ------------------------------------------------------------------ */

console.log('\n[release] Tests…');
run('npm', ['test']);

console.log('\n[release] Build…');
run('npm', ['run', 'build']);

/* ------------------------------------------------------------------ */
/* 3. Nouvelle version                                                 */
/* ------------------------------------------------------------------ */

const packagePath = resolve(rootDir, 'package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

const [major, minor, patch] = pkg.version.split('.').map(Number);
const nextVersion = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[bump];

pkg.version = nextVersion;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

/* ------------------------------------------------------------------ */
/* 4. CHANGELOG                                                        */
/* ------------------------------------------------------------------ */

const changelogPath = resolve(rootDir, 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);

if (!changelog.includes('## [Non publié]')) {
  fail('CHANGELOG.md doit contenir une rubrique « ## [Non publié] ».');
}

const updated = changelog.replace(
  '## [Non publié]',
  `## [Non publié]\n\n## [${nextVersion}] — ${today}`,
);
writeFileSync(changelogPath, updated, 'utf8');

console.log(
  `\n[release] Pense a decrire les changements sous « ## [${nextVersion}] » dans CHANGELOG.md.`,
);

/* ------------------------------------------------------------------ */
/* 5. Commit et tag                                                    */
/* ------------------------------------------------------------------ */

run('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md']);
run('git', ['commit', '-m', `chore(release): v${nextVersion}`]);
run('git', ['tag', '-a', `v${nextVersion}`, '-m', `Agilmea IK v${nextVersion}`]);

console.log(`
[release] Version v${nextVersion} preparee sur la branche « ${branch} ».

  Verifie le resultat :        npm run preview
  Puis, quand tu valides :

    git checkout ${PRODUCTION_BRANCH}
    git merge --no-ff ${branch}
    git push origin ${PRODUCTION_BRANCH}
    git push origin v${nextVersion}

  Le push sur ${PRODUCTION_BRANCH} declenche le deploiement automatique.
`);
